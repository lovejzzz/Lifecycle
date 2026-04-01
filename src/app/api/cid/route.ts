import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { RateLimiter } from '@/lib/rateLimiter';
import { createLogger } from '@/lib/logger';

const log = createLogger('CID-API');
const limiter = new RateLimiter({ maxPerMinute: 30, maxConcurrent: 10 });

// CID API route — uses DeepSeek as primary, OpenRouter as fallback.
// DeepSeek API is OpenAI-compatible.

// ─── Server-Side Auth Verification ──────────────────────────────────────────
// When NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set AND
// REQUIRE_AUTH=true, every request must include a valid Supabase JWT.
// This prevents unauthorized LLM usage while keeping local dev frictionless.

async function verifyAuth(
  req: NextRequest,
): Promise<{ userId: string | null; error: NextResponse | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const requireAuth = process.env.REQUIRE_AUTH === 'true';

  // If auth is not required or Supabase is not configured, allow anonymous
  if (!requireAuth || !supabaseUrl || !serviceRoleKey) {
    return { userId: null, error: null };
  }

  // Extract JWT from Authorization header
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return {
      userId: null,
      error: NextResponse.json(
        {
          error: 'unauthorized',
          message: 'Authentication required. Include Authorization: Bearer <token>',
        },
        { status: 401 },
      ),
    };
  }

  // Verify the JWT using the service role client
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return {
      userId: null,
      error: NextResponse.json(
        { error: 'unauthorized', message: 'Invalid or expired token' },
        { status: 401 },
      ),
    };
  }

  return { userId: user.id, error: null };
}

// ─── Self-Correcting Retry Loop ──────────────────────────────────────────────
// Scores a generated workflow for structural quality. Returns a list of issues
// and a numeric score penalty. If score < -20, a single reflection retry fires.

interface QualityIssue {
  code: string;
  message: string;
  penalty: number;
}

function validateWorkflowQuality(
  nodes: Array<{ category: string; content?: string; label?: string }>,
  edges: Array<{ from: number; to: number; label: string }>,
): { score: number; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];

  // isLinear: edge count === nodes - 1 (no branches/loops)
  if (nodes.length > 2 && edges.length === nodes.length - 1) {
    issues.push({
      code: 'linear-chain',
      message: `Linear chain detected (${edges.length} edges for ${nodes.length} nodes). Add parallel branches and feedback loops.`,
      penalty: -20,
    });
  }

  // thinContent: any node content < 300 chars
  for (const n of nodes) {
    if ((n.content || '').length < 300) {
      issues.push({
        code: 'thin-content',
        message: `Node "${n.label || 'Untitled'}" has thin content (${(n.content || '').length} chars, need 300+). Expand with concrete steps, tools, and criteria.`,
        penalty: -10,
      });
    }
  }

  // missingBookends: no trigger/input at start or no output at end
  if (nodes.length > 1) {
    const firstCat = nodes[0]?.category;
    const lastCat = nodes[nodes.length - 1]?.category;
    if (firstCat !== 'trigger' && firstCat !== 'input') {
      issues.push({
        code: 'missing-start-bookend',
        message: `Workflow should start with a "trigger" or "input" node, not "${firstCat}".`,
        penalty: -30,
      });
    }
    if (lastCat !== 'output') {
      issues.push({
        code: 'missing-end-bookend',
        message: `Workflow should end with an "output" node, not "${lastCat}".`,
        penalty: -30,
      });
    }
  }

  // terminalNonOutput: leaf nodes (no outgoing edges) that aren't category "output"
  const outgoingSet = new Set<number>();
  for (const e of edges) outgoingSet.add(e.from);
  for (let i = 0; i < nodes.length; i++) {
    if (
      !outgoingSet.has(i) &&
      nodes[i].category !== 'output' &&
      nodes[i].category !== 'input' &&
      nodes.length > 1
    ) {
      issues.push({
        code: 'terminal-non-output',
        message: `Terminal node "${nodes[i].label || 'Untitled'}" (index ${i}) has no outgoing edges but category "${nodes[i].category}" instead of "output". Change it to "output".`,
        penalty: -15,
      });
    }
  }

  // orphanNodes: nodes with 0 edges
  const connectedSet = new Set<number>();
  for (const e of edges) {
    connectedSet.add(e.from);
    connectedSet.add(e.to);
  }
  for (let i = 0; i < nodes.length; i++) {
    if (!connectedSet.has(i) && nodes.length > 1) {
      issues.push({
        code: 'orphan-node',
        message: `Node "${nodes[i].label || 'Untitled'}" (index ${i}) has no connections.`,
        penalty: -15,
      });
    }
  }

  // noFeedbackLoop: zero backward edges
  const hasBackwardEdge = edges.some((e) => e.from > e.to);
  if (nodes.length > 3 && !hasBackwardEdge) {
    issues.push({
      code: 'no-feedback-loop',
      message:
        'No feedback loops detected. Add at least one backward edge (e.g., review rejection → rework).',
      penalty: -10,
    });
  }

  const score = issues.reduce((s, i) => s + i.penalty, 0);
  return { score, issues };
}

export async function POST(req: NextRequest) {
  // ── Rate limiting ────────────────────────────────────────────────────
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const rateCheck = limiter.check(clientIp);
  if (!rateCheck.allowed) {
    log.warn('rate-limited', { clientIp, reason: rateCheck.reason });
    return NextResponse.json(
      { error: 'rate_limited', message: rateCheck.reason },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
    );
  }
  limiter.acquire(clientIp);
  try {
    // ── Auth gate ─────────────────────────────────────────────────────────
    const { error: authError } = await verifyAuth(req);
    if (authError) return authError;

    const body = await req.json();
    const {
      systemPrompt,
      messages,
      model: requestedModel,
      taskType,
      _retryCount,
      effortLevel: rawEffort,
      stream: requestStream,
    } = body as {
      systemPrompt: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      model?: string;
      taskType?: 'generate' | 'execute' | 'analyze' | 'sync' | 'understand' | 'interpret-override';
      _retryCount?: number;
      effortLevel?: 'low' | 'medium' | 'high' | 'max';
      stream?: boolean;
    };
    const effortLevel = rawEffort || 'medium';

    if (!systemPrompt || !messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          message: 'Missing required fields: systemPrompt, messages (non-empty array)',
        },
        { status: 400 },
      );
    }

    // Determine which provider to use based on requested model and available keys
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!deepseekKey && !openrouterKey && !anthropicKey) {
      return NextResponse.json(
        { error: 'no_api_key', message: 'No API key configured' },
        { status: 503 },
      );
    }

    // Resolve provider based on requested model
    const isAnthropicModel = requestedModel?.startsWith('claude-');
    const isDeepSeekModel = requestedModel?.startsWith('deepseek-');

    let provider: 'anthropic' | 'deepseek' | 'openrouter';
    let apiKey: string;
    let model: string;
    let endpoint: string;

    if (isAnthropicModel && anthropicKey) {
      provider = 'anthropic';
      apiKey = anthropicKey;
      model = requestedModel!;
      endpoint = 'https://api.anthropic.com/v1/messages';
    } else if (isDeepSeekModel && deepseekKey) {
      provider = 'deepseek';
      apiKey = deepseekKey;
      model = requestedModel!;
      endpoint = 'https://api.deepseek.com/chat/completions';
    } else if (deepseekKey) {
      provider = 'deepseek';
      apiKey = deepseekKey;
      model = 'deepseek-reasoner';
      endpoint = 'https://api.deepseek.com/chat/completions';
    } else if (anthropicKey) {
      provider = 'anthropic';
      apiKey = anthropicKey;
      model = 'claude-sonnet-4-20250514';
      endpoint = 'https://api.anthropic.com/v1/messages';
    } else {
      provider = 'openrouter';
      apiKey = openrouterKey!;
      model = requestedModel || process.env.OPENROUTER_MODEL || 'google/gemma-3-27b-it:free';
      endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    }

    // Temperature varies by task type: creative generation higher, analysis lower
    // deepseek-reasoner (R1) does not support temperature — omit it
    const isReasonerModel = model.includes('reasoner');
    const temperature = isReasonerModel
      ? undefined
      : taskType === 'generate'
        ? 0.8
        : taskType === 'analyze' || taskType === 'interpret-override'
          ? 0.4
          : taskType === 'sync'
            ? 0.3
            : taskType === 'understand'
              ? 0.5
              : 0.7;

    const msgCount = messages.length;
    const promptLen = systemPrompt.length;
    log.info('request', {
      provider,
      model,
      temperature,
      taskType: taskType || 'chat',
      msgCount,
      promptLen,
    });

    // Build provider-specific request
    const buildPayloadAndHeaders = (): { headers: Record<string, string>; body: string } => {
      if (provider === 'anthropic') {
        const anthropicBody: Record<string, unknown> = {
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages,
        };
        if (temperature !== undefined) anthropicBody.temperature = temperature;
        // Adaptive thinking effort (GA on Claude Opus 4.6)
        if (effortLevel && effortLevel !== 'medium') {
          anthropicBody.thinking = {
            type: 'enabled',
            budget_tokens: { low: 2048, medium: 4096, high: 8192, max: 16384 }[effortLevel] || 4096,
          };
        }
        return {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(anthropicBody),
        };
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://lifecycle-agent.app';
        headers['X-Title'] = 'Lifecycle Agent';
      }
      // deepseek-reasoner uses reasoning tokens from the max_tokens budget,
      // so we need a larger budget to avoid truncated JSON responses
      const effortTokenMap: Record<string, number> = {
        low: 4096,
        medium: 8192,
        high: 16384,
        max: 32768,
      };
      const maxTokens = isReasonerModel ? effortTokenMap[effortLevel] || 16384 : 4096;
      return {
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: maxTokens,
          ...(temperature !== undefined ? { temperature } : {}),
        }),
      };
    };

    // ── Streaming mode ──────────────────────────────────────────────────────
    // For chat/analyze tasks, stream tokens directly to the client via SSE.
    // Generate/execute/sync tasks still use the non-streaming path for JSON parsing.
    if (requestStream && (!taskType || taskType === 'analyze')) {
      const streamReqConfig = buildPayloadAndHeaders();
      // Add stream flag to the upstream request body
      const streamBody = JSON.parse(streamReqConfig.body);
      if (provider === 'anthropic') {
        streamBody.stream = true;
      } else {
        streamBody.stream = true;
      }
      streamReqConfig.body = JSON.stringify(streamBody);

      const streamResponse = await fetch(endpoint, {
        method: 'POST',
        headers: streamReqConfig.headers,
        body: streamReqConfig.body,
        signal: AbortSignal.timeout(120000),
      });

      if (!streamResponse.ok || !streamResponse.body) {
        const errorText = await streamResponse.text();
        return NextResponse.json(
          { error: 'api_error', message: `${streamResponse.status}: ${errorText}` },
          { status: 500 },
        );
      }

      // Transform upstream SSE into our own SSE stream
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const readable = new ReadableStream({
        async start(controller) {
          const reader = streamResponse.body!.getReader();
          let buffer = '';
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  continue;
                }
                try {
                  const parsed = JSON.parse(data);
                  let token = '';
                  if (provider === 'anthropic') {
                    // Anthropic SSE: event type "content_block_delta" has delta.text
                    if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                      token = parsed.delta.text;
                    }
                  } else {
                    // OpenAI-compatible (DeepSeek/OpenRouter): choices[0].delta.content
                    token = parsed.choices?.[0]?.delta?.content || '';
                  }
                  if (token) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
                  }
                } catch {
                  // Skip unparseable lines
                }
              }
            }
          } catch (err) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Stream error' })}\n\n`,
              ),
            );
          } finally {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Retry up to 3 times on rate limit (429) with exponential backoff
    // Generate/execute tasks need more time — LLMs produce larger payloads
    // deepseek-reasoner is significantly slower due to chain-of-thought
    const baseTimeout = taskType === 'analyze' ? 60000 : 120000;
    const timeoutMs = isReasonerModel ? Math.max(baseTimeout, 240000) : baseTimeout;
    let response: Response | null = null;
    const reqConfig = buildPayloadAndHeaders();
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: reqConfig.headers,
        body: reqConfig.body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status !== 429) break;
      const wait = Math.pow(2, attempt + 1) * 1500;
      log.warn('upstream-429', { attempt: attempt + 1, waitMs: wait });
      await new Promise((r) => setTimeout(r, wait));
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : 'No response';
      log.error('provider-error', {
        provider,
        status: response?.status,
        model,
        msgCount,
        promptLen,
      });
      return NextResponse.json(
        { error: 'api_error', message: `${response?.status}: ${errorText}` },
        { status: 500 },
      );
    }

    const data = await response.json();

    // Extract token usage from provider response (OpenAI/DeepSeek vs Anthropic format)
    const usage =
      provider === 'anthropic'
        ? {
            prompt_tokens: data.usage?.input_tokens ?? 0,
            completion_tokens: data.usage?.output_tokens ?? 0,
            total_tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
          }
        : {
            prompt_tokens: data.usage?.prompt_tokens ?? 0,
            completion_tokens: data.usage?.completion_tokens ?? 0,
            total_tokens: data.usage?.total_tokens ?? 0,
          };

    // Anthropic returns content[0].text, OpenAI-compatible returns choices[0].message.content
    // deepseek-reasoner returns reasoning_content + content in message
    const text =
      provider === 'anthropic'
        ? data.content?.[0]?.text || ''
        : data.choices?.[0]?.message?.content ||
          data.choices?.[0]?.message?.reasoning_content ||
          '';

    // Try to parse as JSON (our expected format)
    // The LLM might wrap JSON in markdown code blocks or add preamble text
    let cleaned = text
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    // deepseek-reasoner sometimes adds text before JSON — extract the JSON object
    if (cleaned.length > 0 && !cleaned.startsWith('{')) {
      const jsonStart = cleaned.indexOf('{');
      if (jsonStart > 0) {
        // Find the matching closing brace by counting nesting
        let depth = 0;
        let jsonEnd = -1;
        for (let i = jsonStart; i < cleaned.length; i++) {
          if (cleaned[i] === '{') depth++;
          else if (cleaned[i] === '}') {
            depth--;
            if (depth === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
        }
        if (jsonEnd > 0) cleaned = cleaned.slice(jsonStart, jsonEnd);
      }
    }
    try {
      const parsed = JSON.parse(cleaned);

      // If parsed JSON doesn't look like a CID response (no message, no workflow, no modifications),
      // treat the raw text as the message — the model generated content, not CID format
      if (!parsed.message && !parsed.workflow && !parsed.modifications) {
        return NextResponse.json({
          result: { message: text, workflow: null },
          provider,
          model,
          usage,
        });
      }

      // Normalize edge format — some models return source/target instead of from/to
      // Also normalize non-standard labels to our known set
      const KNOWN_LABELS = new Set([
        'drives',
        'feeds',
        'refines',
        'validates',
        'monitors',
        'connects',
        'outputs',
        'updates',
        'watches',
        'approves',
        'triggers',
        'requires',
        'informs',
        'blocks',
      ]);
      const LABEL_MAP: Record<string, string> = {
        'leads to': 'drives',
        'results in': 'outputs',
        assigns: 'drives',
        enables: 'feeds',
        'prepares for': 'feeds',
        'depends on': 'requires',
        checks: 'validates',
        verifies: 'validates',
        reviews: 'validates',
        notifies: 'informs',
        'sends to': 'outputs',
        produces: 'outputs',
        starts: 'triggers',
        initiates: 'triggers',
        activates: 'triggers',
        needs: 'requires',
        uses: 'feeds',
        consumes: 'feeds',
        provides: 'feeds',
        generates: 'outputs',
        creates: 'outputs',
        transforms: 'refines',
        processes: 'refines',
        improves: 'refines',
      };

      // Normalize non-standard node categories to valid ones
      const KNOWN_CATEGORIES = new Set([
        'input',
        'output',
        'state',
        'artifact',
        'note',
        'cid',
        'review',
        'policy',
        'patch',
        'dependency',
        'trigger',
        'test',
        'action',
        'custom',
      ]);
      const CATEGORY_MAP: Record<string, string> = {
        monitor: 'state',
        monitoring: 'state',
        tracker: 'state',
        tracking: 'state',
        alert: 'state',
        alerting: 'state',
        document: 'artifact',
        doc: 'artifact',
        file: 'artifact',
        code: 'artifact',
        database: 'artifact',
        data: 'artifact',
        storage: 'artifact',
        ai: 'cid',
        agent: 'cid',
        llm: 'cid',
        automation: 'cid',
        approval: 'review',
        gate: 'review',
        checkpoint: 'review',
        rule: 'policy',
        constraint: 'policy',
        compliance: 'policy',
        source: 'input',
        entry: 'input',
        trigger: 'trigger',
        webhook: 'trigger',
        cron: 'trigger',
        event: 'trigger',
        schedule: 'trigger',
        listener: 'trigger',
        result: 'output',
        delivery: 'output',
        deliverable: 'output',
        final: 'output',
        idea: 'note',
        research: 'note',
        comment: 'note',
        fix: 'patch',
        hotfix: 'patch',
        bugfix: 'patch',
        requirement: 'dependency',
        prerequisite: 'dependency',
        process: 'state',
        step: 'state',
        stage: 'state',
        phase: 'state',
        task: 'state',
        workflow: 'state',
        config: 'policy',
        configuration: 'policy',
        settings: 'policy',
        test: 'test',
        testing: 'test',
        qa: 'test',
        validation: 'test',
        'unit-test': 'test',
        'integration-test': 'test',
        e2e: 'test',
        'smoke-test': 'test',
        deploy: 'action',
        deployment: 'action',
        release: 'action',
        notification: 'action',
        notify: 'action',
        send: 'action',
        email: 'action',
        execute: 'action',
        run: 'action',
        invoke: 'action',
        call: 'action',
        build: 'artifact',
        compile: 'artifact',
        package: 'artifact',
        log: 'state',
        logging: 'state',
        audit: 'state',
        escalation: 'state',
        incident: 'state',
        response: 'state',
        processing: 'cid',
        processor: 'cid',
        transform: 'cid',
        transformer: 'cid',
        analysis: 'artifact',
        analyzer: 'cid',
        generator: 'cid',
        extraction: 'cid',
        extractor: 'cid',
        parser: 'cid',
        upload: 'input',
        download: 'output',
        export: 'output',
        import: 'input',
        cleanup: 'state',
        cleaning: 'state',
        filter: 'state',
        translation: 'cid',
        translator: 'cid',
        converter: 'cid',
        summarization: 'cid',
        summarizer: 'cid',
      };

      // Normalize edges key: LLMs sometimes use "connections", "links", "relationships" instead of "edges"
      if (!parsed.workflow?.edges && parsed.workflow) {
        parsed.workflow.edges =
          parsed.workflow.connections ??
          parsed.workflow.links ??
          parsed.workflow.relationships ??
          [];
      }

      if (parsed.workflow?.nodes) {
        parsed.workflow.nodes = parsed.workflow.nodes.map((n: Record<string, unknown>) => {
          // Normalize category: some LLMs use "type" instead of "category"
          const rawCat = ((n.category as string) || (n.type as string) || 'note')
            .toLowerCase()
            .trim();
          const category = KNOWN_CATEGORIES.has(rawCat) ? rawCat : CATEGORY_MAP[rawCat] || 'state';
          // Normalize label: LLMs sometimes use "name", "title", or "node_name" instead of "label"
          const label = (n.label ?? n.name ?? n.title ?? n.node_name ?? 'Untitled') as string;
          return { ...n, label, category };
        });
      }

      if (parsed.workflow?.edges) {
        const nodeCount = parsed.workflow.nodes?.length ?? 0;
        // Build ID-to-index map for LLMs that use string IDs instead of numeric indices
        const idToIndex = new Map<string, number>();
        if (parsed.workflow.nodes) {
          parsed.workflow.nodes.forEach((n: Record<string, unknown>, i: number) => {
            if (n.id) idToIndex.set(String(n.id), i);
          });
        }
        const resolveIndex = (val: unknown): number => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            // Try as numeric string first
            const num = parseInt(val, 10);
            if (!isNaN(num)) return num;
            // Try as node ID
            return idToIndex.get(val) ?? -1;
          }
          return -1;
        };
        // Smart edge label inference from source/target category pairs
        const inferLabel = (srcCat: string, tgtCat: string): string => {
          if (srcCat === 'input') return 'feeds';
          if (tgtCat === 'output') return 'outputs';
          if (tgtCat === 'review') return 'validates';
          if (srcCat === 'review') return 'approves';
          if (srcCat === 'cid' && tgtCat === 'artifact') return 'outputs';
          if (srcCat === 'cid' && tgtCat === 'cid') return 'feeds';
          if (tgtCat === 'cid') return 'triggers';
          if (srcCat === 'artifact') return 'informs';
          if (srcCat === 'policy') return 'requires';
          return 'drives';
        };
        const nodes = parsed.workflow.nodes || [];
        parsed.workflow.edges = parsed.workflow.edges
          .map((e: Record<string, unknown>) => {
            const rawLabel = (
              (e.label as string) ||
              (e.relationship as string) ||
              (e.type as string) ||
              ''
            )
              .toLowerCase()
              .trim();
            let label =
              rawLabel && KNOWN_LABELS.has(rawLabel)
                ? rawLabel
                : rawLabel
                  ? LABEL_MAP[rawLabel] || ''
                  : '';
            const fromIdx = resolveIndex(e.from ?? e.source);
            const toIdx = resolveIndex(e.to ?? e.target);
            // If label is still generic/empty, infer from categories
            if (!label || label === 'drives') {
              const srcCat = (nodes[fromIdx]?.category as string) || '';
              const tgtCat = (nodes[toIdx]?.category as string) || '';
              if (srcCat && tgtCat) label = inferLabel(srcCat, tgtCat);
              else label = label || 'drives';
            }
            return { from: fromIdx, to: toIdx, label };
          })
          .filter((e: { from: number; to: number }) => {
            return e.from >= 0 && e.from < nodeCount && e.to >= 0 && e.to < nodeCount;
          });
      }

      // Reorder nodes: trigger first, output last — models sometimes append
      // lateral nodes (policy, state) after the output, which breaks flow checks
      if (parsed.workflow?.nodes?.length > 1) {
        const nodes = parsed.workflow.nodes as Array<{ category: string; [k: string]: unknown }>;
        const edges = parsed.workflow.edges as Array<{ from: number; to: number; label: string }>;

        // Build reorder map: move first trigger to index 0, last output to end
        const triggerIdx = nodes.findIndex((n) => n.category === 'trigger');
        const outputIdx =
          nodes.length - 1 - [...nodes].reverse().findIndex((n) => n.category === 'output');
        const lastIdx = nodes.length - 1;

        if (triggerIdx >= 0 && outputIdx >= 0 && outputIdx < lastIdx) {
          // Only reorder if output isn't already last
          const reordered = [...nodes];
          const outputNode = reordered.splice(outputIdx, 1)[0];
          reordered.push(outputNode);

          // Build old→new index map
          const oldToNew = new Map<number, number>();
          const tempNodes = [...nodes];
          for (let newI = 0; newI < reordered.length; newI++) {
            const oldI = tempNodes.indexOf(reordered[newI]);
            oldToNew.set(oldI, newI);
            tempNodes[oldI] = null as unknown as (typeof nodes)[0]; // mark used
          }

          parsed.workflow.nodes = reordered;
          parsed.workflow.edges = edges.map((e) => ({
            from: oldToNew.get(e.from) ?? e.from,
            to: oldToNew.get(e.to) ?? e.to,
            label: e.label,
          }));
        }
      }

      // Normalize modifications field — validate structure and normalize categories/labels
      if (parsed.modifications) {
        const mods = parsed.modifications;
        if (mods.update_nodes && Array.isArray(mods.update_nodes)) {
          mods.update_nodes = mods.update_nodes.filter(
            (u: Record<string, unknown>) => u.label && u.changes,
          );
          for (const u of mods.update_nodes) {
            if (u.changes?.category) {
              const rawCat = (u.changes.category as string).toLowerCase().trim();
              u.changes.category = KNOWN_CATEGORIES.has(rawCat)
                ? rawCat
                : CATEGORY_MAP[rawCat] || rawCat;
            }
          }
        }
        if (mods.add_nodes && Array.isArray(mods.add_nodes)) {
          mods.add_nodes = mods.add_nodes.map((n: Record<string, unknown>) => {
            const rawCat = ((n.category as string) || 'action').toLowerCase().trim();
            return {
              ...n,
              category: KNOWN_CATEGORIES.has(rawCat) ? rawCat : CATEGORY_MAP[rawCat] || 'action',
            };
          });
        }
        if (mods.add_edges && Array.isArray(mods.add_edges)) {
          mods.add_edges = mods.add_edges.map((e: Record<string, unknown>) => {
            const rawLabel = ((e.label as string) || 'drives').toLowerCase().trim();
            const label = KNOWN_LABELS.has(rawLabel) ? rawLabel : LABEL_MAP[rawLabel] || 'drives';
            return { ...e, label };
          });
        }
        if (mods.remove_nodes && !Array.isArray(mods.remove_nodes)) mods.remove_nodes = [];
        if (mods.remove_edges && !Array.isArray(mods.remove_edges)) mods.remove_edges = [];
      }

      // ── Pre-flight Workflow Validation (inspired by LangGraph's compile step) ──
      // Catch structural issues the LLM missed and auto-repair before returning
      if (parsed.workflow?.nodes?.length > 0) {
        const nodes = parsed.workflow.nodes as Array<{
          category: string;
          label: string;
          content?: string;
          [k: string]: unknown;
        }>;
        const edges = parsed.workflow.edges as Array<{ from: number; to: number; label: string }>;

        // 1. Ensure output bookend — last node must be "output"
        if (nodes.length > 1 && nodes[nodes.length - 1].category !== 'output') {
          const outputIdx = nodes.findIndex((n) => n.category === 'output');
          if (outputIdx >= 0 && outputIdx < nodes.length - 1) {
            // Move output to end
            const [outputNode] = nodes.splice(outputIdx, 1);
            nodes.push(outputNode);
            // Remap edges
            const remap = (idx: number) =>
              idx === outputIdx ? nodes.length - 1 : idx > outputIdx ? idx - 1 : idx;
            parsed.workflow.edges = edges.map((e) => ({
              from: remap(e.from),
              to: remap(e.to),
              label: e.label,
            }));
          }
        }

        // 2. Detect orphan nodes (no incoming or outgoing edges) and connect them
        const connected = new Set<number>();
        for (const e of parsed.workflow.edges as Array<{ from: number; to: number }>) {
          connected.add(e.from);
          connected.add(e.to);
        }
        for (let i = 0; i < nodes.length; i++) {
          if (!connected.has(i) && nodes.length > 1) {
            // Connect orphan to nearest neighbor
            const target = i === 0 ? 1 : i - 1;
            const label = i < target ? 'drives' : 'feeds';
            (parsed.workflow.edges as Array<{ from: number; to: number; label: string }>).push({
              from: Math.min(i, target),
              to: Math.max(i, target),
              label,
            });
          }
        }

        // 3. Log validation metrics
        const edgeCount = (parsed.workflow.edges as unknown[]).length;
        const isLinear = edgeCount === nodes.length - 1;
        log.info('validation', { nodes: nodes.length, edges: edgeCount, isLinear });

        // 4. Self-Correcting Retry Loop — score quality and trigger reflection if needed
        //    Bounded to exactly 1 retry (no infinite loops). Only for generate tasks.
        if ((_retryCount ?? 0) < 1 && taskType === 'generate') {
          const qualityResult = validateWorkflowQuality(
            nodes as Array<{ category: string; content?: string; label?: string }>,
            parsed.workflow.edges as Array<{ from: number; to: number; label: string }>,
          );

          if (qualityResult.score < -20) {
            const issueMessages = qualityResult.issues.map((i) => `- [${i.code}] ${i.message}`);
            log.info('reflection-retry', {
              issues: qualityResult.issues.length,
              score: qualityResult.score,
            });

            const reflectionPrompt = `Your workflow had these quality issues:\n${issueMessages.join('\n')}\n\nFix them and return the corrected JSON. Keep the same overall structure but:\n1. Add parallel branches and feedback loops (more edges than nodes-1)\n2. Expand thin node content to 300+ characters with concrete steps, tools, criteria\n3. Ensure trigger/input at start and output at end\n4. Connect any orphan nodes`;

            // Re-call the same endpoint with reflection appended
            const retryMessages = [
              ...messages,
              { role: 'assistant' as const, content: text },
              { role: 'user' as const, content: reflectionPrompt },
            ];

            const retryBody = JSON.stringify({
              systemPrompt,
              messages: retryMessages,
              model: requestedModel,
              taskType,
              _retryCount: 1,
            });

            try {
              const selfUrl = req.nextUrl.clone();
              const retryResponse = await fetch(selfUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: retryBody,
                signal: AbortSignal.timeout(timeoutMs),
              });

              if (retryResponse.ok) {
                const retryData = await retryResponse.json();
                log.info('reflection-success');
                return NextResponse.json(retryData);
              }
            } catch (retryErr) {
              log.warn('reflection-failed', {
                error: retryErr instanceof Error ? retryErr.message : 'unknown',
              });
            }
            // If retry fails, fall through and return original result
          }
        }
      }

      return NextResponse.json({ result: parsed, provider, model, usage });
    } catch {
      return NextResponse.json({
        result: { message: text, workflow: null },
        provider,
        model,
        usage,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('unhandled', { message });
    return NextResponse.json({ error: 'api_error', message }, { status: 500 });
  } finally {
    limiter.release(clientIp);
  }
}
