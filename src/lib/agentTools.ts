/**
 * Agent Tool Execution Framework
 *
 * Provides built-in tools that agent nodes can invoke during execution.
 * Tools are called by the LLM via structured output, executed server-side
 * or client-side, and results fed back into the next LLM iteration.
 */

import type { AgentTool } from './types';

// Search provider configuration — set SEARCH_API_KEY + SEARCH_PROVIDER env vars for premium search
type SearchProvider = 'duckduckgo' | 'serper';
function getSearchConfig(): { provider: SearchProvider; apiKey: string | null } {
  const apiKey = typeof process !== 'undefined' ? process.env?.SEARCH_API_KEY || null : null;
  const provider = (
    typeof process !== 'undefined' ? process.env?.SEARCH_PROVIDER : null
  ) as SearchProvider | null;
  return { provider: provider || (apiKey ? 'serper' : 'duckduckgo'), apiKey };
}

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
export function getToolAnalytics(): Record<
  string,
  ToolAnalyticEntry & { avgDurationMs: number; successRate: number }
> {
  const out: Record<string, ToolAnalyticEntry & { avgDurationMs: number; successRate: number }> =
    {};
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
    .map(
      ([name, s]) =>
        `- **${name}**: ${s.calls} call${s.calls !== 1 ? 's' : ''}, ${s.successRate}% success, avg ${s.avgDurationMs}ms`,
    );
  return `**Tool Usage Analytics**\n${rows.join('\n')}`;
}

/** Smart content extraction — strips HTML/JSON before truncating */
export function smartTruncate(raw: string, maxLen: number = 3000): string {
  if (raw.length <= maxLen) return raw;
  // For HTML: try to extract main content
  if (raw.includes('<html') || raw.includes('<body')) {
    // Strip script/style tags
    let clean = raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    // Extract article/main content if present
    const mainMatch = clean.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
    if (mainMatch) clean = mainMatch[1];
    // Strip remaining HTML tags
    clean = clean
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen) + `\n... (${raw.length - maxLen} chars truncated)`;
  }
  // For JSON: pretty-print and truncate
  try {
    const parsed = JSON.parse(raw);
    const pretty = JSON.stringify(parsed, null, 2);
    if (pretty.length <= maxLen) return pretty;
    return (
      pretty.slice(0, maxLen) +
      `\n... (${Object.keys(parsed).length} total keys, response truncated)`
    );
  } catch {
    /* not JSON */
  }
  // Default: plain truncation with size info
  return (
    raw.slice(0, maxLen) + `\n... (${raw.length} total chars, ${raw.length - maxLen} truncated)`
  );
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
    description:
      'Make an HTTP request to fetch data from a URL. Args: { "url": "https://...", "method": "GET" }',
  },
  {
    name: 'extract_json',
    description:
      'Extract structured JSON data from text. Args: { "text": "...", "schema": "description of fields to extract" }',
  },
  {
    name: 'store_context',
    description:
      'Store a value in the shared workflow context for other nodes to read. Args: { "key": "name", "value": "data" }',
  },
  {
    name: 'read_context',
    description: 'Read a value from the shared workflow context. Args: { "key": "name" }',
  },
  {
    name: 'validate_json',
    description:
      'Validate whether a string is valid JSON and report any parse errors. Args: { "text": "string to validate" }',
  },
  {
    name: 'summarize_text',
    description:
      'Summarize a long text using extractive sentence selection. Returns the most important sentences up to the word limit. Args: { "text": "text to summarize", "max_words": 100 }',
  },
  {
    name: 'generate_code',
    description:
      'Generate code for a specific task or description. Args: { "task": "what to implement", "language": "python|typescript|javascript|..." }',
  },
  {
    name: 'compare_texts',
    description:
      'Compare two texts and return a structured diff summary — additions, removals, and key differences. Args: { "text_a": "...", "text_b": "...", "label_a": "Version A", "label_b": "Version B" }',
  },
  {
    name: 'list_context_keys',
    description:
      'List all keys currently stored in the shared workflow context. Useful before calling read_context to discover what data is available. Args: {} (no arguments required)',
  },
  {
    name: 'calculate',
    description:
      'Safely evaluate a mathematical expression and return the numeric result. Supports +, -, *, /, %, ^ (power), parentheses, and functions: sqrt, abs, floor, ceil, round, min, max, pow, log, ln, sin, cos, tan. Constants: pi. Args: { "expression": "2 + 2" }',
  },
  {
    name: 'regex_extract',
    description:
      'Extract text matches using a regular expression pattern. Returns all matches (up to 50). If the pattern has a capture group, returns group 1. Args: { "pattern": "\\\\d+", "text": "...", "flags": "g" }',
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
    // Speed-first: direct retrieval → compute → code generation → persistence → validation
    'web_search', // fast external intel
    'http_request', // direct API calls
    'calculate', // instant numeric computation — faster than manual math
    'regex_extract', // fast pattern-based extraction from text
    'generate_code', // produce actionable artifacts
    'store_context', // persist mission-critical data for downstream
    'validate_json', // quick structural check
    'read_context', // retrieve cached context
    'extract_json', // structured extraction
    'summarize_text', // compress bulky input
    'compare_texts', // diff (lower priority — thorough work)
  ],
  poirot: [
    // Thoroughness-first: survey the scene → examine evidence → extract → verify → synthesize
    'list_context_keys', // survey what is already known before reading anything
    'read_context', // examine what is already known
    'extract_json', // extract structured clues from raw data
    'regex_extract', // precise pattern extraction for numbers, codes, identifiers
    'compare_texts', // compare versions, spot discrepancies
    'validate_json', // verify data integrity rigorously
    'calculate', // numeric verification of quantitative claims
    'summarize_text', // synthesize findings concisely
    'web_search', // research external evidence when needed
    'store_context', // document deductions for downstream nodes
    'http_request', // fetch external data as supporting evidence
    'generate_code', // generate only as a last step
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

  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const ordered: AgentTool[] = [];

  // First: add tools in preference order (skip ones not in the available set)
  for (const name of prefs) {
    const t = toolMap.get(name);
    if (t) {
      ordered.push(t);
      toolMap.delete(name);
    }
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
  const toolDescs = orderedTools.map((t) => `- **${t.name}**: ${t.description}`).join('\n');

  const styleHint =
    agentName && AGENT_TOOL_STYLE[agentName.toLowerCase()]
      ? `\n\n**Your tool usage style**: ${AGENT_TOOL_STYLE[agentName.toLowerCase()]}`
      : '';

  const agentKey = agentName?.toLowerCase();
  const exampleBlock = (agentKey && AGENT_TOOL_EXAMPLES[agentKey]) || DEFAULT_TOOL_EXAMPLES;

  return `\n\n## Available Tools\nYou can call tools by including a JSON block in your response:\n\`\`\`tool_call\n{"tool": "tool_name", "args": {"key": "value"}}\n\`\`\`\n\nAvailable tools:\n${toolDescs}${styleHint}${exampleBlock}\n\nYou may call multiple tools. After each tool call block, continue your response. Tool results will be provided in a follow-up message if the node supports looping.\n\nIMPORTANT: Only use tools when genuinely needed. Most tasks can be completed with your own knowledge.`;
}

// ── SSRF Protection ─────────────────────────────────────────────────────────

const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

/** Check if a URL targets an internal/private network address */
export function isBlockedUrl(urlString: string): boolean {
  try {
    const { hostname } = new URL(urlString);
    if (hostname === 'localhost' || hostname === '[::1]') return true;
    return BLOCKED_IP_PATTERNS.some((p) => p.test(hostname));
  } catch {
    return true; // Malformed URLs are blocked
  }
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
      if (!seen.has(key)) {
        seen.add(key);
        toolCalls.push(call);
      }
    }
  }

  // Format 2: XML <tool_call> tags (some models emit this)
  const xmlRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  while ((match = xmlRegex.exec(text)) !== null) {
    const call = tryParse(match[1].trim());
    if (call) {
      const key = `${call.name}:${JSON.stringify(call.args)}`;
      if (!seen.has(key)) {
        seen.add(key);
        toolCalls.push(call);
      }
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
        if (!seen.has(key)) {
          seen.add(key);
          toolCalls.push(call);
        }
      }
    }
  }

  // Format 4: bare JSON object on its own line (no fence required)
  // Some models emit: {"tool": "web_search", "args": {...}} on a standalone line.
  // Heuristic: a line that starts with { and contains "tool" and ends with }.
  const inlineLineRegex = /^[ \t]*(\{[^\n]*?["']?tool["']?\s*:[^\n]*?\})[ \t]*$/gm;
  while ((match = inlineLineRegex.exec(text)) !== null) {
    const raw = match[1].trim();
    const call = tryParse(raw);
    if (call) {
      const key = `${call.name}:${JSON.stringify(call.args)}`;
      if (!seen.has(key)) {
        seen.add(key);
        toolCalls.push(call);
      }
    }
  }

  // Remove all tool call blocks from the text to get clean output
  const cleanText = text
    .replace(fencedRegex, '')
    .replace(xmlRegex, '')
    .replace(jsonFenceRegex, '')
    .replace(inlineLineRegex, '')
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

// ── Safe Arithmetic Evaluator ────────────────────────────────────────────────

/**
 * Known math functions exposed to the evaluator.
 * Any identifier in user input that isn't in this list (after constant substitution) is rejected.
 */
const SAFE_MATH_FUNS = [
  'sqrt',
  'abs',
  'ceil',
  'floor',
  'round',
  'min',
  'max',
  'pow',
  'log10',
  'log2',
  'log',
  'ln',
  'sin',
  'cos',
  'tan',
  'atan',
  'asin',
  'acos',
  'atan2',
  'hypot',
  'sign',
  'trunc',
];

/**
 * Evaluate a mathematical expression safely.
 * Returns a number on success, or null if the expression is invalid / unsafe.
 *
 * Safety approach:
 *   1. Input is restricted to digits, operators, parens, decimal/comma, whitespace, and ASCII identifiers.
 *   2. All identifiers are replaced with known Math.xxx calls or numeric constants.
 *   3. After substitution the expression must contain ONLY numeric/operator chars — any residual
 *      identifier signals an unknown/unsafe token and causes rejection.
 *   4. new Function is called with only `Math` in scope under 'use strict'.
 */
export function safeEval(raw: string): number | null {
  const input = raw.trim();
  if (!input) return null;

  // Step 1: whitelist input characters (digits, ops, parens, decimal, comma, whitespace, a-z identifiers)
  if (!/^[\d\s+\-*/^%().,a-zA-Z_]+$/.test(input)) return null;

  // Step 2: substitute known constants and function names
  let expr = input.replace(/\bpi\b/gi, '3.141592653589793').replace(/\^/g, '**'); // ^ → ** (exponentiation)

  // Replace 'ln' before 'log' to avoid partial match
  expr = expr.replace(/\bln\b/g, 'Math.log');
  for (const fn of SAFE_MATH_FUNS) {
    if (fn === 'ln') continue; // already handled
    expr = expr.replace(new RegExp(`\\b${fn}\\b`, 'g'), `Math.${fn}`);
  }

  // Step 3: after substitution, strip all `Math.<known>` references, then verify only
  //         numeric/operator chars remain — any leftover identifier is rejected
  const stripped = expr.replace(/\bMath\.[a-zA-Z0-9]+\b/g, '0');
  if (!/^[\d\s+\-*/()%.,]+$/.test(stripped.replace(/\*\*/g, ''))) return null;

  // Step 4: evaluate with only Math in scope
  try {
    const fn = new Function('Math', `'use strict'; return +(${expr});`);
    const result = fn(Math);
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

// ── Extractive Summarization ─────────────────────────────────────────────────

/** Common English stop words filtered out when scoring sentence importance */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'i',
  'you',
  'he',
  'she',
  'we',
  'they',
  'me',
  'him',
  'her',
  'us',
  'them',
  'my',
  'your',
  'his',
  'our',
  'their',
  'what',
  'which',
  'who',
  'when',
  'where',
  'how',
  'if',
  'as',
  'not',
  'no',
  'so',
  'up',
  'out',
  'about',
  'into',
  'than',
  'then',
  'just',
  'also',
  'can',
  'all',
  'each',
  'more',
  'most',
  'get',
]);

/**
 * Extractive summarization — selects the most important sentences from text.
 *
 * Algorithm:
 *   1. Tokenize text into sentences.
 *   2. Build a word-frequency map over content words (non-stop-words).
 *   3. Score each sentence by its average content-word TF score, with position
 *      bonuses for opening sentences and a penalty for very short sentences.
 *   4. Greedily select the top-scored sentences until maxWords is reached,
 *      then return them in their original document order.
 *
 * @param text     Input text to summarize.
 * @param maxWords Maximum number of words in the returned summary.
 */
export function extractiveSummarize(text: string, maxWords: number): string {
  // Sentence tokenizer: split at sentence-ending punctuation followed by whitespace + capital.
  // Using lookbehind/lookahead avoids splitting on abbreviations like "Node.js" or "e.g."
  // (those have lowercase after the period, which won't match (?=[A-Z])).
  const rawSentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim());
  const sentences = rawSentences.filter((s) => s.length > 0);

  if (sentences.length <= 1) {
    // Single-sentence or un-splittable text — just truncate by word count
    return text.trim().split(/\s+/).slice(0, maxWords).join(' ');
  }

  // Build word frequency map (content words only, min length 3)
  const wordFreq: Record<string, number> = {};
  for (const sent of sentences) {
    for (const word of sent.toLowerCase().split(/\W+/)) {
      if (word.length > 2 && !STOP_WORDS.has(word)) {
        wordFreq[word] = (wordFreq[word] ?? 0) + 1;
      }
    }
  }

  type ScoredSentence = { sent: string; idx: number; score: number; wc: number };

  const scored: ScoredSentence[] = sentences.map((sent, idx) => {
    const contentWords = sent
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    let score = contentWords.reduce((sum, w) => sum + (wordFreq[w] ?? 0), 0);
    // Normalize by content-word count to avoid length bias
    if (contentWords.length > 0) score /= contentWords.length;
    // Position bonus: opening sentences signal key topics
    if (idx === 0) score *= 1.6;
    else if (idx === 1) score *= 1.3;
    else if (idx === sentences.length - 1) score *= 1.15;
    // Penalize very short sentences (likely headings or labels, not summaries)
    const wc = sent.split(/\s+/).filter(Boolean).length;
    if (wc < 5) score *= 0.5;
    return { sent, idx, score, wc };
  });

  // Greedy selection: pick highest-scoring sentences until maxWords is reached
  const byScore = [...scored].sort((a, b) => b.score - a.score);
  const selected = new Set<number>();
  let totalWords = 0;
  for (const item of byScore) {
    if (totalWords + item.wc > maxWords && selected.size > 0) continue;
    selected.add(item.idx);
    totalWords += item.wc;
    if (totalWords >= maxWords) break;
  }

  // Return selected sentences in their original document order
  return scored
    .filter((s) => selected.has(s.idx))
    .map((s) => s.sent)
    .join(' ');
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
        if (!query)
          return {
            tool: call.name,
            args: call.args,
            result: 'Error: missing query argument',
            success: false,
            durationMs: Date.now() - start,
          };
        // Use configured search provider
        try {
          const { provider: searchProvider, apiKey: searchApiKey } = getSearchConfig();
          if (searchProvider === 'serper' && searchApiKey) {
            // Premium search via Serper (Google results)
            const serperRes = await fetch('https://google.serper.dev/search', {
              method: 'POST',
              headers: { 'X-API-KEY': searchApiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ q: query, num: 5 }),
              signal: AbortSignal.timeout(10000),
            });
            const serperData = await serperRes.json();
            const results: string[] = [];
            if (serperData.answerBox?.snippet)
              results.push(`Answer: ${serperData.answerBox.snippet}`);
            if (serperData.organic) {
              for (const r of serperData.organic.slice(0, 5)) {
                results.push(`- **${r.title}**: ${r.snippet}\n  ${r.link}`);
              }
            }
            return {
              tool: call.name,
              args: call.args,
              result: results.join('\n') || 'No results found',
              success: true,
              durationMs: Date.now() - start,
            };
          }
          // Fallback: DuckDuckGo instant-answer API (free, no auth)
          const res = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
            {
              signal: AbortSignal.timeout(10000),
            },
          );
          const data = await res.json();
          const results: string[] = [];
          // Answer field — short direct answers (e.g. "What is 2+2?")
          if (data.Answer) results.push(`Answer: ${data.Answer}`);
          // Abstract — encyclopedic summary
          if (data.AbstractText) results.push(`Summary: ${data.AbstractText}`);
          // Infobox — structured key-value facts
          if (data.Infobox?.content) {
            const facts = (data.Infobox.content as Array<{ label: string; value: string }>)
              .slice(0, 5)
              .filter((f) => f.label && f.value)
              .map((f) => `  ${f.label}: ${f.value}`);
            if (facts.length > 0) results.push(`Facts:\n${facts.join('\n')}`);
          }
          // Related topics — fallback when no abstract is available
          if (data.RelatedTopics) {
            for (const topic of (
              data.RelatedTopics as Array<{ Text?: string; Topics?: Array<{ Text?: string }> }>
            ).slice(0, 5)) {
              if (topic.Text) results.push(`- ${topic.Text}`);
              // Some topics are nested groups
              if (topic.Topics) {
                for (const sub of topic.Topics.slice(0, 3)) {
                  if (sub.Text) results.push(`  - ${sub.Text}`);
                }
              }
            }
          }
          if (results.length > 0) {
            return {
              tool: call.name,
              args: call.args,
              result: results.join('\n'),
              success: true,
              durationMs: Date.now() - start,
            };
          }
          // DuckDuckGo returned nothing — try Wikipedia opensearch as secondary source
          try {
            const wikiRes = await fetch(
              `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json&origin=*`,
              { signal: AbortSignal.timeout(8000) },
            );
            const wikiData = (await wikiRes.json()) as [string, string[], string[], string[]];
            const [, titles, descriptions, urls] = wikiData;
            if (titles && titles.length > 0) {
              const wikiResults = titles.map((title, i) => {
                const desc = descriptions[i] ? ` — ${descriptions[i]}` : '';
                const url = urls[i] ? `\n  ${urls[i]}` : '';
                return `- **${title}**${desc}${url}`;
              });
              return {
                tool: call.name,
                args: call.args,
                result: `Wikipedia results for "${query}":\n${wikiResults.join('\n')}`,
                success: true,
                durationMs: Date.now() - start,
              };
            }
          } catch {
            // Wikipedia fallback failed — fall through to no-results message
          }
          return {
            tool: call.name,
            args: call.args,
            result: `No results found for "${query}". The DuckDuckGo instant-answer API works best for well-known entities and facts. Consider rephrasing or using http_request for a specific data source.`,
            success: true,
            durationMs: Date.now() - start,
          };
        } catch {
          return {
            tool: call.name,
            args: call.args,
            result: `Search failed for "${query}". Network error.`,
            success: false,
            durationMs: Date.now() - start,
          };
        }
      }

      case 'http_request': {
        const url = String(call.args.url || '');
        const method = String(call.args.method || 'GET').toUpperCase();
        if (!url)
          return {
            tool: call.name,
            args: call.args,
            result: 'Error: missing url argument',
            success: false,
            durationMs: Date.now() - start,
          };
        if (isBlockedUrl(url))
          return {
            tool: call.name,
            args: call.args,
            result: 'Error: blocked — cannot access internal/private network addresses',
            success: false,
            durationMs: Date.now() - start,
          };
        try {
          const res = await fetch(url, {
            method,
            headers: (call.args.headers as Record<string, string>) || {},
            body: method !== 'GET' && call.args.body ? JSON.stringify(call.args.body) : undefined,
            signal: AbortSignal.timeout(15000),
          });
          const text = await res.text();
          // Smart content extraction with truncation
          const truncated = smartTruncate(text);
          return {
            tool: call.name,
            args: call.args,
            result: `HTTP ${res.status}\n${truncated}`,
            success: res.ok,
            durationMs: Date.now() - start,
          };
        } catch (err) {
          return {
            tool: call.name,
            args: call.args,
            result: `HTTP request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
            success: false,
            durationMs: Date.now() - start,
          };
        }
      }

      case 'extract_json': {
        const text = String(call.args.text || '');
        const schema = String(call.args.schema || '');

        if (!text)
          return rec({
            tool: call.name,
            args: call.args,
            result: 'Error: missing text argument',
            success: false,
            durationMs: Date.now() - start,
          });

        // Helper: try to parse a string as JSON, returning null on failure
        const tryParseJson = (s: string): unknown => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        };

        let found: unknown = null;

        // Strategy 1: entire text is valid JSON
        found = tryParseJson(text.trim());

        // Strategy 2: code-fenced block (```json ... ``` or ``` ... ```)
        if (found === null) {
          const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
          if (fenceMatch) found = tryParseJson(fenceMatch[1].trim());
        }

        // Strategy 3: bracket-matching — find the first top-level { } or [ ]
        if (found === null) {
          for (const [open, close] of [
            ['{', '}'],
            ['[', ']'],
          ] as [string, string][]) {
            const startIdx = text.indexOf(open);
            if (startIdx === -1) continue;
            let depth = 0;
            let endIdx = -1;
            for (let i = startIdx; i < text.length; i++) {
              if (text[i] === open) depth++;
              else if (text[i] === close) {
                depth--;
                if (depth === 0) {
                  endIdx = i;
                  break;
                }
              }
            }
            if (endIdx !== -1) {
              const p = tryParseJson(text.slice(startIdx, endIdx + 1));
              if (p !== null) {
                found = p;
                break;
              }
            }
          }
        }

        if (found === null || typeof found !== 'object') {
          // No extractable JSON — forward text + schema to LLM for manual extraction
          const hint = schema
            ? `No JSON detected. Please extract the following fields from the text: ${schema}\n\nText (${text.length} chars):\n${text.slice(0, 2000)}${text.length > 2000 ? '\n… (truncated)' : ''}`
            : `No valid JSON found in the provided text (${text.length} chars).`;
          return rec({
            tool: call.name,
            args: call.args,
            result: hint,
            success: false,
            durationMs: Date.now() - start,
          });
        }

        // If schema keywords provided, pick only matching top-level keys
        const schemaKeywords = schema
          ? schema
              .split(/[\s,;:|]+/)
              .map((s) => s.toLowerCase().trim())
              .filter((s) => s.length > 1)
          : [];

        const obj = found as Record<string, unknown>;
        let selected: Record<string, unknown>;
        if (schemaKeywords.length > 0) {
          selected = {};
          for (const [k, v] of Object.entries(obj)) {
            const kl = k.toLowerCase();
            if (schemaKeywords.some((kw) => kl === kw || kl.includes(kw) || kw.includes(kl))) {
              selected[k] = v;
            }
          }
          if (Object.keys(selected).length === 0) selected = obj; // no keys matched — return all
        } else {
          selected = obj;
        }

        const count = Object.keys(selected).length;
        return rec({
          tool: call.name,
          args: call.args,
          result: `Extracted ${count} field${count !== 1 ? 's' : ''}${schema ? ` matching "${schema}"` : ''}:\n\n${JSON.stringify(selected, null, 2)}`,
          success: true,
          durationMs: Date.now() - start,
        });
      }

      case 'store_context': {
        const key = String(call.args.key || '');
        const value = call.args.value;
        if (!key)
          return {
            tool: call.name,
            args: call.args,
            result: 'Error: missing key argument',
            success: false,
            durationMs: Date.now() - start,
          };
        if (sharedContext) {
          sharedContext[key] = value;
          return {
            tool: call.name,
            args: call.args,
            result: `Stored "${key}" in workflow context.`,
            success: true,
            durationMs: Date.now() - start,
          };
        }
        return {
          tool: call.name,
          args: call.args,
          result: 'Warning: no workflow context available. Value not persisted.',
          success: false,
          durationMs: Date.now() - start,
        };
      }

      case 'read_context': {
        const key = String(call.args.key || '');
        if (!key)
          return {
            tool: call.name,
            args: call.args,
            result: 'Error: missing key argument',
            success: false,
            durationMs: Date.now() - start,
          };
        if (sharedContext && key in sharedContext) {
          const val = sharedContext[key];
          return {
            tool: call.name,
            args: call.args,
            result: `Context["${key}"] = ${JSON.stringify(val)}`,
            success: true,
            durationMs: Date.now() - start,
          };
        }
        return {
          tool: call.name,
          args: call.args,
          result: `Key "${key}" not found in workflow context.`,
          success: true,
          durationMs: Date.now() - start,
        };
      }

      case 'validate_json': {
        const text = String(call.args.text || '');
        if (!text)
          return {
            tool: call.name,
            args: call.args,
            result: 'Error: missing text argument',
            success: false,
            durationMs: Date.now() - start,
          };
        try {
          const parsed = JSON.parse(text);
          const type = Array.isArray(parsed) ? 'array' : typeof parsed;
          const keys = type === 'object' && parsed !== null ? Object.keys(parsed) : [];
          const summary =
            type === 'object'
              ? `Valid JSON object with ${keys.length} key(s): ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}`
              : type === 'array'
                ? `Valid JSON array with ${(parsed as unknown[]).length} element(s)`
                : `Valid JSON (${type})`;
          return {
            tool: call.name,
            args: call.args,
            result: summary,
            success: true,
            durationMs: Date.now() - start,
          };
        } catch (err) {
          const msg = err instanceof SyntaxError ? err.message : 'Invalid JSON';
          return {
            tool: call.name,
            args: call.args,
            result: `Invalid JSON: ${msg}`,
            success: false,
            durationMs: Date.now() - start,
          };
        }
      }

      case 'summarize_text': {
        const text = String(call.args.text || '');
        const maxWords = Math.max(10, Math.min(500, Number(call.args.max_words ?? 100)));
        if (!text)
          return {
            tool: call.name,
            args: call.args,
            result: 'Error: missing text argument',
            success: false,
            durationMs: Date.now() - start,
          };
        const inputWords = text.split(/\s+/).filter(Boolean).length;
        if (inputWords <= maxWords) {
          // Already within limit — return as-is with metadata
          return {
            tool: call.name,
            args: call.args,
            result: `Extractive summary (≤${maxWords} words) — text already within limit (${inputWords} words):\n\n${text}`,
            success: true,
            durationMs: Date.now() - start,
          };
        }
        // Perform local extractive summarization — no LLM call needed
        const summary = extractiveSummarize(text, maxWords);
        const summaryWords = summary.split(/\s+/).filter(Boolean).length;
        return {
          tool: call.name,
          args: call.args,
          result: `Extractive summary (≤${maxWords} words, ${summaryWords} selected from ${inputWords} total):\n\n${summary}`,
          success: true,
          durationMs: Date.now() - start,
        };
      }

      case 'generate_code': {
        const task = String(call.args.task || '');
        const language = String(call.args.language || 'typescript');
        if (!task)
          return rec({
            tool: call.name,
            args: call.args,
            result: 'Error: missing task argument',
            success: false,
            durationMs: Date.now() - start,
          });
        // Instruct the LLM to generate code in its next iteration
        return rec({
          tool: call.name,
          args: call.args,
          result: `Code generation task ready. Language: ${language}. Task: ${task}\n\nPlease write the ${language} code for this task in your next response, using a fenced code block (\`\`\`${language}).`,
          success: true,
          durationMs: Date.now() - start,
        });
      }

      case 'list_context_keys': {
        if (!sharedContext) {
          return {
            tool: call.name,
            args: call.args,
            result: 'No workflow context available. Context is empty.',
            success: true,
            durationMs: Date.now() - start,
          };
        }
        const keys = Object.keys(sharedContext);
        if (keys.length === 0) {
          return {
            tool: call.name,
            args: call.args,
            result: 'Workflow context is empty — no keys stored yet.',
            success: true,
            durationMs: Date.now() - start,
          };
        }
        const keyList = keys
          .map((k) => {
            const val = sharedContext[k];
            const preview =
              typeof val === 'string'
                ? val.length > 60
                  ? `"${val.slice(0, 60)}…"`
                  : `"${val}"`
                : (JSON.stringify(val)?.slice(0, 60) ?? 'null');
            return `- "${k}": ${preview}`;
          })
          .join('\n');
        return {
          tool: call.name,
          args: call.args,
          result: `Workflow context has ${keys.length} key(s):\n${keyList}`,
          success: true,
          durationMs: Date.now() - start,
        };
      }

      case 'compare_texts': {
        const textA = String(call.args.text_a || '');
        const textB = String(call.args.text_b || '');
        const labelA = String(call.args.label_a || 'Text A');
        const labelB = String(call.args.label_b || 'Text B');
        if (!textA || !textB)
          return rec({
            tool: call.name,
            args: call.args,
            result: 'Error: both text_a and text_b are required',
            success: false,
            durationMs: Date.now() - start,
          });

        // Compute line-level diff summary
        const linesA = textA.split('\n');
        const linesB = textB.split('\n');
        const setA = new Set(linesA.map((l) => l.trim()).filter(Boolean));
        const setB = new Set(linesB.map((l) => l.trim()).filter(Boolean));

        const onlyInA = [...setA].filter((l) => !setB.has(l));
        const onlyInB = [...setB].filter((l) => !setA.has(l));
        const common = [...setA].filter((l) => setB.has(l));

        const wordCountA = textA.split(/\s+/).filter(Boolean).length;
        const wordCountB = textB.split(/\s+/).filter(Boolean).length;
        const wordDelta = wordCountB - wordCountA;
        const wordDeltaStr = wordDelta >= 0 ? `+${wordDelta}` : `${wordDelta}`;

        // Jaccard word-level similarity: |A ∩ B| / |A ∪ B| over unique words
        const wordsSetA = new Set(
          textA
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length > 1),
        );
        const wordsSetB = new Set(
          textB
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length > 1),
        );
        const intersectionSize = [...wordsSetA].filter((w) => wordsSetB.has(w)).length;
        const unionSize = new Set([...wordsSetA, ...wordsSetB]).size;
        const jaccardPct = unionSize > 0 ? Math.round((intersectionSize / unionSize) * 100) : 100;
        const similarityLabel =
          jaccardPct >= 80
            ? 'very similar'
            : jaccardPct >= 50
              ? 'somewhat similar'
              : jaccardPct >= 20
                ? 'mostly different'
                : 'very different';

        const summary = [
          `## Comparison: ${labelA} vs ${labelB}`,
          `- **Similarity**: ${jaccardPct}% (${similarityLabel}) — Jaccard word overlap`,
          `- **${labelA}**: ${linesA.length} lines, ${wordCountA} words`,
          `- **${labelB}**: ${linesB.length} lines, ${wordCountB} words (${wordDeltaStr} words)`,
          `- **Common lines**: ${common.length}`,
          `- **Only in ${labelA}** (${onlyInA.length}): ${onlyInA
            .slice(0, 5)
            .map((l) => `"${l.slice(0, 80)}"`)
            .join(', ')}${onlyInA.length > 5 ? ` … +${onlyInA.length - 5} more` : ''}`,
          `- **Only in ${labelB}** (${onlyInB.length}): ${onlyInB
            .slice(0, 5)
            .map((l) => `"${l.slice(0, 80)}"`)
            .join(', ')}${onlyInB.length > 5 ? ` … +${onlyInB.length - 5} more` : ''}`,
        ].join('\n');

        return rec({
          tool: call.name,
          args: call.args,
          result: summary,
          success: true,
          durationMs: Date.now() - start,
        });
      }

      case 'calculate': {
        const expression = String(call.args.expression || '').trim();
        if (!expression) {
          return {
            tool: call.name,
            args: call.args,
            result: 'Error: missing expression argument',
            success: false,
            durationMs: Date.now() - start,
          };
        }
        const value = safeEval(expression);
        if (value === null) {
          return {
            tool: call.name,
            args: call.args,
            result: `Could not evaluate: "${expression}". Use only numbers, +, -, *, /, ^, %, (), and functions: sqrt, abs, floor, ceil, round, min, max, pow, log, ln, sin, cos, tan, pi.`,
            success: false,
            durationMs: Date.now() - start,
          };
        }
        // Format the result: integers stay as integers, floats are trimmed to avoid noise
        const formatted = Number.isInteger(value)
          ? String(value)
          : parseFloat(value.toPrecision(12)).toString();
        return {
          tool: call.name,
          args: call.args,
          result: `${expression} = ${formatted}`,
          success: true,
          durationMs: Date.now() - start,
        };
      }

      case 'regex_extract': {
        const pattern = String(call.args.pattern || '');
        const text = String(call.args.text || '');
        const flagsRaw = String(call.args.flags ?? 'g').toLowerCase();

        if (!pattern)
          return rec({
            tool: call.name,
            args: call.args,
            result: 'Error: missing pattern argument',
            success: false,
            durationMs: Date.now() - start,
          });
        if (!text)
          return rec({
            tool: call.name,
            args: call.args,
            result: 'Error: missing text argument',
            success: false,
            durationMs: Date.now() - start,
          });

        // Security: reject patterns that are too long
        if (pattern.length > 300)
          return rec({
            tool: call.name,
            args: call.args,
            result: 'Error: pattern too long (max 300 chars)',
            success: false,
            durationMs: Date.now() - start,
          });

        // Security: reject patterns with nested quantifiers (catastrophic backtracking)
        if (/\([^)]*[+*][^)]*\)[+*?{]/.test(pattern))
          return rec({
            tool: call.name,
            args: call.args,
            result: 'Error: pattern rejected — nested quantifiers risk catastrophic backtracking',
            success: false,
            durationMs: Date.now() - start,
          });

        // Only allow safe flags: g (global), i (case-insensitive), m (multiline), s (dotAll)
        const safeFlags = [...new Set([...flagsRaw].filter((f) => 'gims'.includes(f)))].join('');
        const flags = safeFlags.includes('g') ? safeFlags : safeFlags + 'g';

        let regex: RegExp;
        try {
          regex = new RegExp(pattern, flags);
        } catch (e) {
          return rec({
            tool: call.name,
            args: call.args,
            result: `Error: invalid regex pattern — ${e instanceof Error ? e.message : 'parse error'}`,
            success: false,
            durationMs: Date.now() - start,
          });
        }

        const MAX_MATCHES = 50;
        const matches: string[] = [];
        let m: RegExpExecArray | null;

        while ((m = regex.exec(text)) !== null && matches.length < MAX_MATCHES) {
          // Prefer first capture group when present, otherwise full match
          matches.push(m[1] !== undefined ? m[1] : m[0]);
          // Guard against infinite loops on zero-length matches
          if (m[0].length === 0) regex.lastIndex++;
        }

        if (matches.length === 0)
          return rec({
            tool: call.name,
            args: call.args,
            result: `No matches found for pattern /${pattern}/ in the provided text.`,
            success: true,
            durationMs: Date.now() - start,
          });

        const truncated = matches.length === MAX_MATCHES;
        const lines = matches.map((v, i) => `${i + 1}. ${v}`).join('\n');
        return rec({
          tool: call.name,
          args: call.args,
          result: `Found ${matches.length} match${matches.length !== 1 ? 'es' : ''}${truncated ? ` (first ${MAX_MATCHES})` : ''}:\n\n${lines}`,
          success: true,
          durationMs: Date.now() - start,
        });
      }

      default:
        return rec({
          tool: call.name,
          args: call.args,
          result: `Unknown tool: ${call.name}`,
          success: false,
          durationMs: Date.now() - start,
        });
    }
  } catch (err) {
    return rec({
      tool: call.name,
      args: call.args,
      result: `Tool execution error: ${err instanceof Error ? err.message : 'unknown'}`,
      success: false,
      durationMs: Date.now() - start,
    });
  }
}

/** Format tool results for injection into the next LLM message */
export function formatToolResults(results: ToolCallResult[]): string {
  return results
    .map((r) => `[Tool: ${r.tool}] ${r.success ? '✓' : '✗'} (${r.durationMs}ms)\n${r.result}`)
    .join('\n\n');
}
