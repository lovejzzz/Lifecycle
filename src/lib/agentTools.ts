/**
 * Agent Tool Execution Framework
 *
 * Provides built-in tools that agent nodes can invoke during execution.
 * Tools are called by the LLM via structured output, executed server-side
 * or client-side, and results fed back into the next LLM iteration.
 */

import type { AgentTool } from './types';

/** Result from executing a tool */
export interface ToolCallResult {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
  durationMs: number;
}

// ── Tool Analytics ───────────────────────────────────────────────────────────

export interface ToolAnalyticEntry {
  calls: number;
  successes: number;
  totalDurationMs: number;
}

/** Module-level analytics store — persists for the session lifetime */
const _toolAnalytics: Record<string, ToolAnalyticEntry> = {};

/** Record the outcome of a tool call into the analytics store */
function recordToolCall(result: ToolCallResult): void {
  const entry = _toolAnalytics[result.tool] ?? { calls: 0, successes: 0, totalDurationMs: 0 };
  entry.calls += 1;
  if (result.success) entry.successes += 1;
  entry.totalDurationMs += result.durationMs;
  _toolAnalytics[result.tool] = entry;
}

/** Return a snapshot of tool usage analytics */
export function getToolAnalytics(): Record<string, ToolAnalyticEntry & { avgDurationMs: number; successRate: number }> {
  const out: Record<string, ToolAnalyticEntry & { avgDurationMs: number; successRate: number }> = {};
  for (const [name, e] of Object.entries(_toolAnalytics)) {
    out[name] = {
      ...e,
      avgDurationMs: e.calls > 0 ? Math.round(e.totalDurationMs / e.calls) : 0,
      successRate: e.calls > 0 ? Math.round((e.successes / e.calls) * 100) : 0,
    };
  }
  return out;
}

/** Format analytics as a readable string for the UI */
export function formatToolAnalytics(): string {
  const data = getToolAnalytics();
  const entries = Object.entries(data);
  if (entries.length === 0) return 'No tool calls recorded yet.';
  const rows = entries
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([name, s]) => `- **${name}**: ${s.calls} call${s.calls !== 1 ? 's' : ''}, ${s.successRate}% success, avg ${s.avgDurationMs}ms`);
  return `**Tool Usage Analytics**\n${rows.join('\n')}`;
}

/** Parsed tool call from LLM output */
export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
}

// ── Built-in Tool Definitions ────────────────────────────────────────────────

export const BUILT_IN_TOOLS: AgentTool[] = [
  {
    name: 'web_search',
    description: 'Search the web for information. Args: { "query": "search terms" }',
  },
  {
    name: 'http_request',
    description: 'Make an HTTP request to fetch data from a URL. Args: { "url": "https://...", "method": "GET" }',
  },
  {
    name: 'extract_json',
    description: 'Extract structured JSON data from text. Args: { "text": "...", "schema": "description of fields to extract" }',
  },
  {
    name: 'store_context',
    description: 'Store a value in the shared workflow context for other nodes to read. Args: { "key": "name", "value": "data" }',
  },
  {
    name: 'read_context',
    description: 'Read a value from the shared workflow context. Args: { "key": "name" }',
  },
  {
    name: 'validate_json',
    description: 'Validate whether a string is valid JSON and report any parse errors. Args: { "text": "string to validate" }',
  },
  {
    name: 'summarize_text',
    description: 'Summarize a long text to a concise version. Args: { "text": "text to summarize", "max_words": 100 }',
  },
  {
    name: 'generate_code',
    description: 'Generate code for a specific task or description. Args: { "task": "what to implement", "language": "python|typescript|javascript|..." }',
  },
  {
    name: 'compare_texts',
    description: 'Compare two texts and return a structured diff summary — additions, removals, and key differences. Args: { "text_a": "...", "text_b": "...", "label_a": "Version A", "label_b": "Version B" }',
  },
  {
    name: 'list_context_keys',
    description: 'List all keys currently stored in the shared workflow context. Useful before calling read_context to discover what data is available. Args: {} (no arguments required)',
  },
];

// ── Agent-Specific Tool Preferences ─────────────────────────────────────────

/**
 * Ordered tool preference lists per agent.
 * Tools at the front of the list are shown first and treated as the agent's
 * "go-to" instruments. Tools not in the list are appended in their original order.
 */
const AGENT_TOOL_PREFERENCES: Record<string, string[]> = {
  rowan: [
    // Speed-first: direct retrieval → code generation → persistence → validation
    'web_search',     // fast external intel
    'http_request',   // direct API calls
    'generate_code',  // produce actionable artifacts
    'store_context',  // persist mission-critical data for downstream
    'validate_json',  // quick structural check
    'read_context',   // retrieve cached context
    'extract_json',   // structured extraction
    'summarize_text', // compress bulky input
    'compare_texts',  // diff (lower priority — thorough work)
  ],
  poirot: [
    // Thoroughness-first: survey the scene → examine evidence → extract → verify → synthesize
    'list_context_keys', // survey what is already known before reading anything
    'read_context',      // examine what is already known
    'extract_json',      // extract structured clues from raw data
    'compare_texts',     // compare versions, spot discrepancies
    'validate_json',     // verify data integrity rigorously
    'summarize_text',    // synthesize findings concisely
    'web_search',        // research external evidence when needed
    'store_context',     // document deductions for downstream nodes
    'http_request',      // fetch external data as supporting evidence
    'generate_code',     // generate only as a last step
  ],
};

/**
 * Personality-appropriate tool usage guidance injected after the tool list.
 * Shapes HOW the agent decides to use tools, not just WHICH ones exist.
 */
const AGENT_TOOL_STYLE: Record<string, string> = {
  rowan:
    'Use tools decisively and minimally — only when they deliver information faster than your existing knowledge. ' +
    'Prefer `store_context` to preserve mission-critical intel for downstream nodes. ' +
    'One tool call per objective. Report the result and move on.',
  poirot:
    'Use tools methodically and thoroughly. Begin with `list_context_keys` to survey the scene, then `read_context` for relevant keys before fetching anything new. ' +
    'Use `compare_texts` and `extract_json` to ensure no clue is missed. ' +
    'Document every key deduction with `store_context` so downstream nodes inherit your findings. ' +
    'Quality of reasoning matters more than speed.',
};

/**
 * Return the tool list reordered by agent preference.
 * Tools not in the preference list are appended in their original order.
 *
 * @param agentName  'rowan' | 'poirot' (case-insensitive)
 * @param tools      The available tools to reorder
 */
export function getPreferredTools(agentName: string, tools: AgentTool[]): AgentTool[] {
  const prefs = AGENT_TOOL_PREFERENCES[agentName.toLowerCase()];
  if (!prefs || prefs.length === 0) return tools;

  const toolMap = new Map(tools.map(t => [t.name, t]));
  const ordered: AgentTool[] = [];

  // First: add tools in preference order (skip ones not in the available set)
  for (const name of prefs) {
    const t = toolMap.get(name);
    if (t) { ordered.push(t); toolMap.delete(name); }
  }
  // Then: append any remaining tools not covered by the preference list
  for (const t of toolMap.values()) ordered.push(t);

  return ordered;
}

// ── Agent-Differentiated Few-Shot Examples ───────────────────────────────────

/**
 * Agent-specific few-shot examples injected into the tool prompt.
 * Rowan gets speed-focused single-objective patterns.
 * Poirot gets thorough multi-step investigation patterns.
 */
const AGENT_TOOL_EXAMPLES: Record<string, string> = {
  rowan: `

### Example — Rowan: direct intel pipeline (search → store → done):
\`\`\`tool_call
{"tool": "web_search", "args": {"query": "kubernetes HPA max replicas default 2024"}}
\`\`\`
*(Result arrives)* — store the mission-critical fact immediately and move on:
\`\`\`tool_call
{"tool": "store_context", "args": {"key": "hpa_limits", "value": "HPA max replicas default 100; override with --max-replicas flag"}}
\`\`\`
One tool per objective. Retrieve → Store → Proceed.`,

  poirot: `

### Example — Poirot: thorough investigation (survey → read → extract → compare → store):
First survey the scene — discover what the workflow has already deposited:
\`\`\`tool_call
{"tool": "list_context_keys", "args": {}}
\`\`\`
*(Keys revealed)* — now read what is relevant before fetching anything new:
\`\`\`tool_call
{"tool": "read_context", "args": {"key": "prior_analysis"}}
\`\`\`
*(Examine existing evidence)* — extract structured clues from the incoming data:
\`\`\`tool_call
{"tool": "extract_json", "args": {"text": "<upstream data>", "schema": "issues, severity: critical|warning|info, owner"}}
\`\`\`
*(Spot discrepancies against prior state):*
\`\`\`tool_call
{"tool": "compare_texts", "args": {"text_a": "<prior findings>", "text_b": "<new findings>", "label_a": "Prior Run", "label_b": "Current Run"}}
\`\`\`
*(Document the deduction for downstream nodes):*
\`\`\`tool_call
{"tool": "store_context", "args": {"key": "investigation_result", "value": "<key finding>"}}
\`\`\``,
};

/**
 * Default few-shot examples used when no agent-specific examples are defined.
 * Shows two common tool-chaining patterns.
 */
const DEFAULT_TOOL_EXAMPLES = `

### Example — search for data, then store the finding:
\`\`\`tool_call
{"tool": "web_search", "args": {"query": "Node.js 22 release highlights"}}
\`\`\`
After the tool result arrives, store the key finding for downstream nodes:
\`\`\`tool_call
{"tool": "store_context", "args": {"key": "nodejs_release", "value": "Node.js 22 highlights: native test runner improvements, V8 12.4..."}}
\`\`\`
You can then continue your response using both the tool result and your own knowledge.

### Example — validate JSON input, then extract structured fields:
\`\`\`tool_call
{"tool": "validate_json", "args": {"text": "<the raw JSON string to check>"}}
\`\`\`
If valid, extract the important fields for downstream analysis:
\`\`\`tool_call
{"tool": "extract_json", "args": {"text": "<the raw JSON string>", "schema": "status, error code, message"}}
\`\`\``;

/** Get the tool description block to inject into system prompts */
export function buildToolPrompt(tools: AgentTool[], agentName?: string): string {
  if (tools.length === 0) return '';

  const orderedTools = agentName ? getPreferredTools(agentName, tools) : tools;
  const toolDescs = orderedTools.map(t => `- **${t.name}**: ${t.description}`).join('\n');

  const styleHint = agentName && AGENT_TOOL_STYLE[agentName.toLowerCase()]
    ? `\n\n**Your tool usage style**: ${AGENT_TOOL_STYLE[agentName.toLowerCase()]}`
    : '';

  const agentKey = agentName?.toLowerCase();
  const exampleBlock = (agentKey && AGENT_TOOL_EXAMPLES[agentKey]) || DEFAULT_TOOL_EXAMPLES;

  return `\n\n## Available Tools\nYou can call tools by including a JSON block in your response:\n\`\`\`tool_call\n{"tool": "tool_name", "args": {"key": "value"}}\n\`\`\`\n\nAvailable tools:\n${toolDescs}${styleHint}${exampleBlock}\n\nYou may call multiple tools. After each tool call block, continue your response. Tool results will be provided in a follow-up message if the node supports looping.\n\nIMPORTANT: Only use tools when genuinely needed. Most tasks can be completed with your own knowledge.`;
}

// ── Tool Call Parsing ────────────────────────────────────────────────────────

/**
 * Attempt to repair common JSON issues produced by LLMs:
 * - Trailing commas before } or ]
 * - Single-quoted strings → double-quoted
 * - Unquoted keys
 * - Escaped single quotes inside double-quoted strings
 */
export function repairJson(raw: string): string {
  let s = raw.trim();
  // Replace single-quoted strings with double-quoted (simple heuristic)
  // Only do this when the string isn't already valid JSON
  try {
    JSON.parse(s);
    return s; // already valid
  } catch {
    // fall through to repairs
  }
  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');
  // Replace single-quoted keys/values with double-quoted
  // e.g. {'key': 'value'} → {"key": "value"}
  s = s.replace(/([{,]\s*)'([^']+?)'\s*:/g, '$1"$2":');
  s = s.replace(/:\s*'([^']*?)'/g, ': "$1"');
  // Quote unquoted identifier keys: { tool: "foo" } → { "tool": "foo" }
  // Only applies when the key is a bare identifier (letters/digits/_/$) not already quoted
  s = s.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
  return s;
}

/** Parse tool calls from LLM output text.
 *
 * Supports two formats:
 *   1. Fenced code block:  ```tool_call\n{...}\n```
 *   2. XML tag:            <tool_call>{...}</tool_call>
 *
 * Both formats tolerate minor JSON issues via repairJson().
 */
export function parseToolCalls(text: string): { cleanText: string; toolCalls: ParsedToolCall[] } {
  const toolCalls: ParsedToolCall[] = [];
  const seen = new Set<string>(); // deduplicate identical calls

  function tryParse(raw: string): ParsedToolCall | null {
    const repaired = repairJson(raw);
    try {
      const parsed = JSON.parse(repaired);
      if (parsed.tool && typeof parsed.tool === 'string') {
        return { name: parsed.tool, args: parsed.args || {} };
      }
    } catch {
      // unparseable even after repair — skip
    }
    return null;
  }

  // Format 1: fenced ```tool_call blocks
  const fencedRegex = /```tool_call\s*\n([\s\S]*?)\n?```/g;
  let match;
  while ((match = fencedRegex.exec(text)) !== null) {
    const call = tryParse(match[1].trim());
    if (call) {
      const key = `${call.name}:${JSON.stringify(call.args)}`;
      if (!seen.has(key)) { seen.add(key); toolCalls.push(call); }
    }
  }

  // Format 2: XML <tool_call> tags (some models emit this)
  const xmlRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  while ((match = xmlRegex.exec(text)) !== null) {
    const call = tryParse(match[1].trim());
    if (call) {
      const key = `${call.name}:${JSON.stringify(call.args)}`;
      if (!seen.has(key)) { seen.add(key); toolCalls.push(call); }
    }
  }

  // Format 3: ```json fenced blocks containing a "tool" field
  // Some models emit generic ```json rather than ```tool_call
  const jsonFenceRegex = /```json\s*\n([\s\S]*?)\n?```/g;
  while ((match = jsonFenceRegex.exec(text)) !== null) {
    const raw = match[1].trim();
    // Only treat as a tool call if the JSON contains a "tool" field
    if (/["']?tool["']?\s*:/.test(raw)) {
      const call = tryParse(raw);
      if (call) {
        const key = `${call.name}:${JSON.stringify(call.args)}`;
        if (!seen.has(key)) { seen.add(key); toolCalls.push(call); }
      }
    }
  }

  // Remove all tool call blocks from the text to get clean output
  const cleanText = text
    .replace(fencedRegex, '')
    .replace(xmlRegex, '')
    .replace(jsonFenceRegex, '')
    .trim();

  return { cleanText, toolCalls };
}

// ── Tool Execution ──────────────────────────────────────────────────────────

/** Execute a single tool call and return the result (records analytics) */
export async function executeTool(
  call: ParsedToolCall,
  sharedContext?: Record<string, unknown>,
): Promise<ToolCallResult> {
  const result = await _executeToolImpl(call, sharedContext);
  recordToolCall(result);
  return result;
}

async function _executeToolImpl(
  call: ParsedToolCall,
  sharedContext?: Record<string, unknown>,
): Promise<ToolCallResult> {
  const start = Date.now();
  // Helper: shorthand for returning inline results (kept for readability)
  const rec = (r: ToolCallResult) => r;
  try {
    switch (call.name) {
      case 'web_search': {
        const query = String(call.args.query || '');
        if (!query) return { tool: call.name, args: call.args, result: 'Error: missing query argument', success: false, durationMs: Date.now() - start };
        // Use a simple search proxy — in production this would be a proper search API
        try {
          const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
            signal: AbortSignal.timeout(10000),
          });
          const data = await res.json();
          const results: string[] = [];
          if (data.AbstractText) results.push(`Summary: ${data.AbstractText}`);
          if (data.RelatedTopics) {
            for (const topic of data.RelatedTopics.slice(0, 5)) {
              if (topic.Text) results.push(`- ${topic.Text}`);
            }
          }
          const output = results.length > 0 ? results.join('\n') : `No results found for "${query}". Try a different search term.`;
          return { tool: call.name, args: call.args, result: output, success: true, durationMs: Date.now() - start };
        } catch {
          return { tool: call.name, args: call.args, result: `Search failed for "${query}". Network error.`, success: false, durationMs: Date.now() - start };
        }
      }

      case 'http_request': {
        const url = String(call.args.url || '');
        const method = String(call.args.method || 'GET').toUpperCase();
        if (!url) return { tool: call.name, args: call.args, result: 'Error: missing url argument', success: false, durationMs: Date.now() - start };
        try {
          const res = await fetch(url, {
            method,
            headers: call.args.headers as Record<string, string> || {},
            body: method !== 'GET' && call.args.body ? JSON.stringify(call.args.body) : undefined,
            signal: AbortSignal.timeout(15000),
          });
          const text = await res.text();
          // Truncate large responses
          const truncated = text.length > 3000 ? text.slice(0, 3000) + '\n... (truncated)' : text;
          return { tool: call.name, args: call.args, result: `HTTP ${res.status}\n${truncated}`, success: res.ok, durationMs: Date.now() - start };
        } catch (err) {
          return { tool: call.name, args: call.args, result: `HTTP request failed: ${err instanceof Error ? err.message : 'unknown error'}`, success: false, durationMs: Date.now() - start };
        }
      }

      case 'extract_json': {
        const text = String(call.args.text || '');
        const schema = String(call.args.schema || 'extract key-value pairs');
        // This tool is a no-op in terms of execution — the LLM will do the extraction
        // in its next iteration using the schema instruction
        return {
          tool: call.name, args: call.args,
          result: `Extraction task queued. Schema: ${schema}. Text length: ${text.length} chars. The LLM will perform extraction in the next iteration.`,
          success: true, durationMs: Date.now() - start,
        };
      }

      case 'store_context': {
        const key = String(call.args.key || '');
        const value = call.args.value;
        if (!key) return { tool: call.name, args: call.args, result: 'Error: missing key argument', success: false, durationMs: Date.now() - start };
        if (sharedContext) {
          sharedContext[key] = value;
          return { tool: call.name, args: call.args, result: `Stored "${key}" in workflow context.`, success: true, durationMs: Date.now() - start };
        }
        return { tool: call.name, args: call.args, result: 'Warning: no workflow context available. Value not persisted.', success: false, durationMs: Date.now() - start };
      }

      case 'read_context': {
        const key = String(call.args.key || '');
        if (!key) return { tool: call.name, args: call.args, result: 'Error: missing key argument', success: false, durationMs: Date.now() - start };
        if (sharedContext && key in sharedContext) {
          const val = sharedContext[key];
          return { tool: call.name, args: call.args, result: `Context["${key}"] = ${JSON.stringify(val)}`, success: true, durationMs: Date.now() - start };
        }
        return { tool: call.name, args: call.args, result: `Key "${key}" not found in workflow context.`, success: true, durationMs: Date.now() - start };
      }

      case 'validate_json': {
        const text = String(call.args.text || '');
        if (!text) return { tool: call.name, args: call.args, result: 'Error: missing text argument', success: false, durationMs: Date.now() - start };
        try {
          const parsed = JSON.parse(text);
          const type = Array.isArray(parsed) ? 'array' : typeof parsed;
          const keys = type === 'object' && parsed !== null ? Object.keys(parsed) : [];
          const summary = type === 'object'
            ? `Valid JSON object with ${keys.length} key(s): ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}`
            : type === 'array'
              ? `Valid JSON array with ${(parsed as unknown[]).length} element(s)`
              : `Valid JSON (${type})`;
          return { tool: call.name, args: call.args, result: summary, success: true, durationMs: Date.now() - start };
        } catch (err) {
          const msg = err instanceof SyntaxError ? err.message : 'Invalid JSON';
          return { tool: call.name, args: call.args, result: `Invalid JSON: ${msg}`, success: false, durationMs: Date.now() - start };
        }
      }

      case 'summarize_text': {
        const text = String(call.args.text || '');
        const maxWords = Math.max(10, Math.min(500, Number(call.args.max_words ?? 100)));
        if (!text) return { tool: call.name, args: call.args, result: 'Error: missing text argument', success: false, durationMs: Date.now() - start };
        // Instruct the LLM to perform the summarization in its next iteration
        return {
          tool: call.name, args: call.args,
          result: `Summarization task ready. Input: ${text.length} chars. Target: ≤${maxWords} words.\n\nPlease summarize the following text in ≤${maxWords} words in your next response:\n\n${text.slice(0, 4000)}${text.length > 4000 ? '\n... (truncated)' : ''}`,
          success: true, durationMs: Date.now() - start,
        };
      }

      case 'generate_code': {
        const task = String(call.args.task || '');
        const language = String(call.args.language || 'typescript');
        if (!task) return rec({ tool: call.name, args: call.args, result: 'Error: missing task argument', success: false, durationMs: Date.now() - start });
        // Instruct the LLM to generate code in its next iteration
        return rec({
          tool: call.name, args: call.args,
          result: `Code generation task ready. Language: ${language}. Task: ${task}\n\nPlease write the ${language} code for this task in your next response, using a fenced code block (\`\`\`${language}).`,
          success: true, durationMs: Date.now() - start,
        });
      }

      case 'list_context_keys': {
        if (!sharedContext) {
          return { tool: call.name, args: call.args, result: 'No workflow context available. Context is empty.', success: true, durationMs: Date.now() - start };
        }
        const keys = Object.keys(sharedContext);
        if (keys.length === 0) {
          return { tool: call.name, args: call.args, result: 'Workflow context is empty — no keys stored yet.', success: true, durationMs: Date.now() - start };
        }
        const keyList = keys.map(k => {
          const val = sharedContext[k];
          const preview = typeof val === 'string'
            ? (val.length > 60 ? `"${val.slice(0, 60)}…"` : `"${val}"`)
            : JSON.stringify(val)?.slice(0, 60) ?? 'null';
          return `- "${k}": ${preview}`;
        }).join('\n');
        return {
          tool: call.name, args: call.args,
          result: `Workflow context has ${keys.length} key(s):\n${keyList}`,
          success: true, durationMs: Date.now() - start,
        };
      }

      case 'compare_texts': {
        const textA = String(call.args.text_a || '');
        const textB = String(call.args.text_b || '');
        const labelA = String(call.args.label_a || 'Text A');
        const labelB = String(call.args.label_b || 'Text B');
        if (!textA || !textB) return rec({ tool: call.name, args: call.args, result: 'Error: both text_a and text_b are required', success: false, durationMs: Date.now() - start });

        // Compute line-level diff summary
        const linesA = textA.split('\n');
        const linesB = textB.split('\n');
        const setA = new Set(linesA.map(l => l.trim()).filter(Boolean));
        const setB = new Set(linesB.map(l => l.trim()).filter(Boolean));

        const onlyInA = [...setA].filter(l => !setB.has(l));
        const onlyInB = [...setB].filter(l => !setA.has(l));
        const common = [...setA].filter(l => setB.has(l));

        const wordCountA = textA.split(/\s+/).filter(Boolean).length;
        const wordCountB = textB.split(/\s+/).filter(Boolean).length;
        const wordDelta = wordCountB - wordCountA;
        const wordDeltaStr = wordDelta >= 0 ? `+${wordDelta}` : `${wordDelta}`;

        const summary = [
          `## Comparison: ${labelA} vs ${labelB}`,
          `- **${labelA}**: ${linesA.length} lines, ${wordCountA} words`,
          `- **${labelB}**: ${linesB.length} lines, ${wordCountB} words (${wordDeltaStr} words)`,
          `- **Common lines**: ${common.length}`,
          `- **Only in ${labelA}** (${onlyInA.length}): ${onlyInA.slice(0, 3).map(l => `"${l.slice(0, 60)}"`).join(', ')}${onlyInA.length > 3 ? ` … +${onlyInA.length - 3} more` : ''}`,
          `- **Only in ${labelB}** (${onlyInB.length}): ${onlyInB.slice(0, 3).map(l => `"${l.slice(0, 60)}"`).join(', ')}${onlyInB.length > 3 ? ` … +${onlyInB.length - 3} more` : ''}`,
          '',
          'Please provide a narrative summary of the key differences in your next response.',
        ].join('\n');

        return rec({ tool: call.name, args: call.args, result: summary, success: true, durationMs: Date.now() - start });
      }

      default:
        return rec({ tool: call.name, args: call.args, result: `Unknown tool: ${call.name}`, success: false, durationMs: Date.now() - start });
    }
  } catch (err) {
    return rec({ tool: call.name, args: call.args, result: `Tool execution error: ${err instanceof Error ? err.message : 'unknown'}`, success: false, durationMs: Date.now() - start });
  }
}

/** Format tool results for injection into the next LLM message */
export function formatToolResults(results: ToolCallResult[]): string {
  return results.map(r =>
    `[Tool: ${r.tool}] ${r.success ? '✓' : '✗'} (${r.durationMs}ms)\n${r.result}`
  ).join('\n\n');
}
