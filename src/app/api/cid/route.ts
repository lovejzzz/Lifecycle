import { NextRequest, NextResponse } from 'next/server';

// CID API route — uses DeepSeek as primary, OpenRouter as fallback.
// DeepSeek API is OpenAI-compatible.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { systemPrompt, messages, model: requestedModel, taskType } = body as {
      systemPrompt: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      model?: string;
      taskType?: 'generate' | 'execute' | 'analyze';
    };

    if (!systemPrompt || !messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'invalid_request', message: 'Missing required fields: systemPrompt, messages (non-empty array)' },
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
    const temperature = isReasonerModel ? undefined : (taskType === 'generate' ? 0.8 : taskType === 'analyze' ? 0.4 : 0.7);

    const msgCount = messages.length;
    const promptLen = systemPrompt.length;
    console.log(`[CID API] Using ${provider} (${model}) | temp=${temperature} task=${taskType || 'chat'} msgs=${msgCount} prompt=${promptLen}c`);

    // Build provider-specific request
    const buildPayloadAndHeaders = (): { headers: Record<string, string>; body: string } => {
      if (provider === 'anthropic') {
        return {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            temperature,
            system: systemPrompt,
            messages,
          }),
        };
      }
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://lifecycle-agent.app';
        headers['X-Title'] = 'Lifecycle Agent';
      }
      // deepseek-reasoner uses reasoning tokens from the max_tokens budget,
      // so we need a larger budget to avoid truncated JSON responses
      const maxTokens = isReasonerModel ? 16384 : 4096;
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

    // Retry up to 3 times on rate limit (429) with exponential backoff
    // Generate/execute tasks need more time — LLMs produce larger payloads
    // deepseek-reasoner is significantly slower due to chain-of-thought
    const baseTimeout = taskType === 'analyze' ? 45000 : 120000;
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
      console.log(`Rate limited (429), retrying in ${wait}ms (attempt ${attempt + 1}/4)`);
      await new Promise(r => setTimeout(r, wait));
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : 'No response';
      console.error(`[CID API] ${provider} error:`, response?.status, errorText, `| model=${model} msgs=${msgCount} prompt=${promptLen}c`);
      return NextResponse.json(
        { error: 'api_error', message: `${response?.status}: ${errorText}` },
        { status: 500 },
      );
    }

    const data = await response.json();
    // Anthropic returns content[0].text, OpenAI-compatible returns choices[0].message.content
    // deepseek-reasoner returns reasoning_content + content in message
    const text = provider === 'anthropic'
      ? (data.content?.[0]?.text || '')
      : (data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || '');

    // Try to parse as JSON (our expected format)
    // The LLM might wrap JSON in markdown code blocks or add preamble text
    let cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    // deepseek-reasoner sometimes adds text before JSON — extract the JSON object
    if (cleaned.length > 0 && !cleaned.startsWith('{')) {
      const jsonStart = cleaned.indexOf('{');
      if (jsonStart > 0) {
        // Find the matching closing brace by counting nesting
        let depth = 0;
        let jsonEnd = -1;
        for (let i = jsonStart; i < cleaned.length; i++) {
          if (cleaned[i] === '{') depth++;
          else if (cleaned[i] === '}') { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
        }
        if (jsonEnd > 0) cleaned = cleaned.slice(jsonStart, jsonEnd);
      }
    }
    try {
      const parsed = JSON.parse(cleaned);

      // If parsed JSON doesn't look like a CID response (no message, no workflow, no modifications),
      // treat the raw text as the message — the model generated content, not CID format
      if (!parsed.message && !parsed.workflow && !parsed.modifications) {
        return NextResponse.json({ result: { message: text, workflow: null }, provider, model });
      }

      // Normalize edge format — some models return source/target instead of from/to
      // Also normalize non-standard labels to our known set
      const KNOWN_LABELS = new Set(['drives', 'feeds', 'refines', 'validates', 'monitors', 'connects', 'outputs', 'updates', 'watches', 'approves', 'triggers', 'requires', 'informs', 'blocks']);
      const LABEL_MAP: Record<string, string> = {
        'leads to': 'drives', 'results in': 'outputs', 'assigns': 'drives',
        'enables': 'feeds', 'prepares for': 'feeds', 'depends on': 'requires',
        'checks': 'validates', 'verifies': 'validates', 'reviews': 'validates',
        'notifies': 'informs', 'sends to': 'outputs', 'produces': 'outputs',
        'starts': 'triggers', 'initiates': 'triggers', 'activates': 'triggers',
        'needs': 'requires', 'uses': 'feeds', 'consumes': 'feeds',
        'provides': 'feeds', 'generates': 'outputs', 'creates': 'outputs',
        'transforms': 'refines', 'processes': 'refines', 'improves': 'refines',
      };

      // Normalize non-standard node categories to valid ones
      const KNOWN_CATEGORIES = new Set(['input', 'output', 'state', 'artifact', 'note', 'cid', 'review', 'policy', 'patch', 'dependency', 'trigger', 'test', 'action', 'custom']);
      const CATEGORY_MAP: Record<string, string> = {
        'monitor': 'state', 'monitoring': 'state', 'tracker': 'state', 'tracking': 'state',
        'alert': 'state', 'alerting': 'state',
        'document': 'artifact', 'doc': 'artifact', 'file': 'artifact', 'code': 'artifact',
        'database': 'artifact', 'data': 'artifact', 'storage': 'artifact',
        'ai': 'cid', 'agent': 'cid', 'llm': 'cid', 'automation': 'cid',
        'approval': 'review', 'gate': 'review', 'checkpoint': 'review',
        'rule': 'policy', 'constraint': 'policy', 'compliance': 'policy',
        'source': 'input', 'entry': 'input',
        'trigger': 'trigger', 'webhook': 'trigger', 'cron': 'trigger', 'event': 'trigger', 'schedule': 'trigger', 'listener': 'trigger',
        'result': 'output', 'delivery': 'output', 'deliverable': 'output', 'final': 'output',
        'idea': 'note', 'research': 'note', 'comment': 'note',
        'fix': 'patch', 'hotfix': 'patch', 'bugfix': 'patch',
        'requirement': 'dependency', 'prerequisite': 'dependency',
        'process': 'state', 'step': 'state', 'stage': 'state', 'phase': 'state',
        'task': 'state', 'workflow': 'state',
        'config': 'policy', 'configuration': 'policy', 'settings': 'policy',
        'test': 'test', 'testing': 'test', 'qa': 'test', 'validation': 'test',
        'unit-test': 'test', 'integration-test': 'test', 'e2e': 'test', 'smoke-test': 'test',
        'deploy': 'action', 'deployment': 'action', 'release': 'action',
        'notification': 'action', 'notify': 'action', 'send': 'action', 'email': 'action',
        'execute': 'action', 'run': 'action', 'invoke': 'action', 'call': 'action',
        'build': 'artifact', 'compile': 'artifact', 'package': 'artifact',
        'log': 'state', 'logging': 'state', 'audit': 'state',
        'escalation': 'state', 'incident': 'state', 'response': 'state',
        'processing': 'cid', 'processor': 'cid', 'transform': 'cid', 'transformer': 'cid',
        'analysis': 'artifact', 'analyzer': 'cid', 'generator': 'cid',
        'extraction': 'cid', 'extractor': 'cid', 'parser': 'cid',
        'upload': 'input', 'download': 'output', 'export': 'output', 'import': 'input',
        'cleanup': 'state', 'cleaning': 'state', 'filter': 'state',
        'translation': 'cid', 'translator': 'cid', 'converter': 'cid',
        'summarization': 'cid', 'summarizer': 'cid',
      };

      // Normalize edges key: LLMs sometimes use "connections", "links", "relationships" instead of "edges"
      if (!parsed.workflow?.edges && parsed.workflow) {
        parsed.workflow.edges = parsed.workflow.connections ?? parsed.workflow.links ?? parsed.workflow.relationships ?? [];
      }

      if (parsed.workflow?.nodes) {
        parsed.workflow.nodes = parsed.workflow.nodes.map((n: Record<string, unknown>) => {
          // Normalize category: some LLMs use "type" instead of "category"
          const rawCat = ((n.category as string) || (n.type as string) || 'note').toLowerCase().trim();
          const category = KNOWN_CATEGORIES.has(rawCat) ? rawCat : (CATEGORY_MAP[rawCat] || 'state');
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
            const rawLabel = ((e.label as string) || (e.relationship as string) || (e.type as string) || '').toLowerCase().trim();
            let label = rawLabel && KNOWN_LABELS.has(rawLabel) ? rawLabel : (rawLabel ? (LABEL_MAP[rawLabel] || '') : '');
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
        const triggerIdx = nodes.findIndex(n => n.category === 'trigger');
        const outputIdx = nodes.length - 1 - [...nodes].reverse().findIndex(n => n.category === 'output');
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
            tempNodes[oldI] = null as unknown as typeof nodes[0]; // mark used
          }

          parsed.workflow.nodes = reordered;
          parsed.workflow.edges = edges.map(e => ({
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
          mods.update_nodes = mods.update_nodes.filter((u: Record<string, unknown>) => u.label && u.changes);
          for (const u of mods.update_nodes) {
            if (u.changes?.category) {
              const rawCat = (u.changes.category as string).toLowerCase().trim();
              u.changes.category = KNOWN_CATEGORIES.has(rawCat) ? rawCat : (CATEGORY_MAP[rawCat] || rawCat);
            }
          }
        }
        if (mods.add_nodes && Array.isArray(mods.add_nodes)) {
          mods.add_nodes = mods.add_nodes.map((n: Record<string, unknown>) => {
            const rawCat = ((n.category as string) || 'action').toLowerCase().trim();
            return { ...n, category: KNOWN_CATEGORIES.has(rawCat) ? rawCat : (CATEGORY_MAP[rawCat] || 'action') };
          });
        }
        if (mods.add_edges && Array.isArray(mods.add_edges)) {
          mods.add_edges = mods.add_edges.map((e: Record<string, unknown>) => {
            const rawLabel = ((e.label as string) || 'drives').toLowerCase().trim();
            const label = KNOWN_LABELS.has(rawLabel) ? rawLabel : (LABEL_MAP[rawLabel] || 'drives');
            return { ...e, label };
          });
        }
        if (mods.remove_nodes && !Array.isArray(mods.remove_nodes)) mods.remove_nodes = [];
        if (mods.remove_edges && !Array.isArray(mods.remove_edges)) mods.remove_edges = [];
      }

      return NextResponse.json({ result: parsed, provider, model });
    } catch {
      return NextResponse.json({ result: { message: text, workflow: null }, provider, model });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('CID API error:', message);
    return NextResponse.json(
      { error: 'api_error', message },
      { status: 500 },
    );
  }
}
