import { NextRequest, NextResponse } from 'next/server';

// CID API route — uses DeepSeek as primary, OpenRouter as fallback.
// DeepSeek API is OpenAI-compatible.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { systemPrompt, messages } = body as {
      systemPrompt: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    // Determine which provider to use
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;

    if (!deepseekKey && !openrouterKey) {
      return NextResponse.json(
        { error: 'no_api_key', message: 'No API key configured' },
        { status: 200 },
      );
    }

    const useDeepSeek = !!deepseekKey;
    const apiKey = deepseekKey || openrouterKey!;
    const model = useDeepSeek ? 'deepseek-chat' : (process.env.OPENROUTER_MODEL || 'google/gemma-3-27b-it:free');
    const endpoint = useDeepSeek
      ? 'https://api.deepseek.com/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';

    const payload = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 4096,
      temperature: 0.7,
    };

    console.log(`[CID API] Using ${useDeepSeek ? 'DeepSeek' : 'OpenRouter'} (${model})`);

    // Retry up to 3 times on rate limit (429) with exponential backoff
    let response: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (!useDeepSeek) {
        headers['HTTP-Referer'] = 'https://lifecycle-agent.app';
        headers['X-Title'] = 'Lifecycle Agent';
      }

      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (response.status !== 429) break;
      const wait = Math.pow(2, attempt + 1) * 1500;
      console.log(`Rate limited (429), retrying in ${wait}ms (attempt ${attempt + 1}/4)`);
      await new Promise(r => setTimeout(r, wait));
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : 'No response';
      console.error(`${useDeepSeek ? 'DeepSeek' : 'OpenRouter'} error:`, response?.status, errorText);
      return NextResponse.json(
        { error: 'api_error', message: `${response?.status}: ${errorText}` },
        { status: 500 },
      );
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Try to parse as JSON (our expected format)
    // The LLM might wrap JSON in markdown code blocks — strip them
    const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);

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
      const KNOWN_CATEGORIES = new Set(['input', 'output', 'state', 'artifact', 'note', 'cid', 'review', 'policy', 'patch', 'dependency', 'custom']);
      const CATEGORY_MAP: Record<string, string> = {
        'monitor': 'state', 'monitoring': 'state', 'tracker': 'state', 'tracking': 'state',
        'alert': 'state', 'alerting': 'state', 'notification': 'state',
        'document': 'artifact', 'doc': 'artifact', 'file': 'artifact', 'code': 'artifact',
        'database': 'artifact', 'data': 'artifact', 'storage': 'artifact',
        'ai': 'cid', 'agent': 'cid', 'llm': 'cid', 'automation': 'cid',
        'approval': 'review', 'gate': 'review', 'checkpoint': 'review',
        'rule': 'policy', 'constraint': 'policy', 'compliance': 'policy',
        'source': 'input', 'trigger': 'input', 'entry': 'input',
        'result': 'output', 'delivery': 'output', 'deliverable': 'output', 'final': 'output',
        'idea': 'note', 'research': 'note', 'comment': 'note',
        'fix': 'patch', 'hotfix': 'patch', 'bugfix': 'patch',
        'requirement': 'dependency', 'prerequisite': 'dependency',
        'process': 'state', 'step': 'state', 'stage': 'state', 'phase': 'state',
        'action': 'state', 'task': 'state', 'workflow': 'state',
        'config': 'policy', 'configuration': 'policy', 'settings': 'policy',
        'test': 'review', 'testing': 'review', 'qa': 'review', 'validation': 'review',
        'deploy': 'output', 'deployment': 'output', 'release': 'output',
        'build': 'artifact', 'compile': 'artifact', 'package': 'artifact',
        'log': 'state', 'logging': 'state', 'audit': 'state',
        'escalation': 'state', 'incident': 'state', 'response': 'state',
      };
      if (parsed.workflow?.nodes) {
        parsed.workflow.nodes = parsed.workflow.nodes.map((n: Record<string, unknown>) => {
          const rawCat = ((n.category as string) || 'note').toLowerCase().trim();
          const category = KNOWN_CATEGORIES.has(rawCat) ? rawCat : (CATEGORY_MAP[rawCat] || 'state');
          return { ...n, category };
        });
      }

      if (parsed.workflow?.edges) {
        const nodeCount = parsed.workflow.nodes?.length ?? 0;
        parsed.workflow.edges = parsed.workflow.edges
          .map((e: Record<string, unknown>) => {
            const rawLabel = ((e.label as string) || 'drives').toLowerCase().trim();
            const label = KNOWN_LABELS.has(rawLabel) ? rawLabel : (LABEL_MAP[rawLabel] || 'drives');
            return {
              from: e.from ?? e.source ?? 0,
              to: e.to ?? e.target ?? 1,
              label,
            };
          })
          .filter((e: { from: number; to: number }) => {
            // Filter out edges with out-of-range indices
            return e.from >= 0 && e.from < nodeCount && e.to >= 0 && e.to < nodeCount;
          });
      }

      return NextResponse.json({ result: parsed });
    } catch {
      return NextResponse.json({ result: { message: text, workflow: null } });
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
