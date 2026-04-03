import { describe, it, expect } from 'vitest';
import {
  parseToolCalls,
  repairJson,
  executeTool,
  buildToolPrompt,
  getPreferredTools,
  safeEval,
  isBlockedUrl,
  extractiveSummarize,
} from '../agentTools';
import type { AgentTool } from '../types';

// ── repairJson ───────────────────────────────────────────────────────────────

describe('repairJson', () => {
  it('returns valid JSON unchanged', () => {
    const valid = '{"tool":"web_search","args":{"query":"hello"}}';
    expect(repairJson(valid)).toBe(valid);
  });

  it('removes trailing comma before }', () => {
    const raw = '{"tool":"web_search","args":{"query":"hello",}}';
    const result = JSON.parse(repairJson(raw));
    expect(result.tool).toBe('web_search');
  });

  it('removes trailing comma before ]', () => {
    const raw = '{"items":[1,2,3,]}';
    const result = JSON.parse(repairJson(raw));
    expect(result.items).toEqual([1, 2, 3]);
  });

  it('converts single-quoted keys to double-quoted', () => {
    const raw = "{'tool': 'web_search', 'args': {}}";
    const result = JSON.parse(repairJson(raw));
    expect(result.tool).toBe('web_search');
  });

  it('converts single-quoted values to double-quoted', () => {
    const raw = '{"tool": \'extract_json\', "args": {}}';
    const result = JSON.parse(repairJson(raw));
    expect(result.tool).toBe('extract_json');
  });

  it('quotes unquoted identifier keys', () => {
    const raw = '{tool: "web_search", args: {query: "hello"}}';
    const result = JSON.parse(repairJson(raw));
    expect(result.tool).toBe('web_search');
    expect(result.args.query).toBe('hello');
  });

  it('does not double-quote already-quoted keys', () => {
    const raw = '{"tool": "store_context", "args": {"key": "k", "value": 42}}';
    const result = JSON.parse(repairJson(raw));
    expect(result.tool).toBe('store_context');
    expect(result.args.key).toBe('k');
  });

  it('handles mixed: unquoted key with single-quoted value', () => {
    const raw = "{tool: 'validate_json', args: {text: '{}'}}";
    const result = JSON.parse(repairJson(raw));
    expect(result.tool).toBe('validate_json');
  });
});

// ── parseToolCalls ───────────────────────────────────────────────────────────

describe('parseToolCalls', () => {
  it('parses a fenced tool_call block', () => {
    const text =
      'Some text\n```tool_call\n{"tool":"web_search","args":{"query":"test"}}\n```\nMore text';
    const { toolCalls, cleanText } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('web_search');
    expect(toolCalls[0].args.query).toBe('test');
    expect(cleanText).toContain('Some text');
    expect(cleanText).toContain('More text');
    expect(cleanText).not.toContain('tool_call');
  });

  it('parses an XML tool_call tag', () => {
    const text =
      'Before\n<tool_call>{"tool":"validate_json","args":{"text":"{}"}}</tool_call>\nAfter';
    const { toolCalls, cleanText } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('validate_json');
    expect(cleanText).not.toContain('tool_call');
  });

  it('deduplicates identical tool calls', () => {
    const block = '```tool_call\n{"tool":"web_search","args":{"query":"dup"}}\n```';
    const text = `${block}\n${block}`;
    const { toolCalls } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(1);
  });

  it('parses multiple different tool calls', () => {
    const text = [
      '```tool_call\n{"tool":"store_context","args":{"key":"k","value":"v"}}\n```',
      '```tool_call\n{"tool":"read_context","args":{"key":"k"}}\n```',
    ].join('\n');
    const { toolCalls } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0].name).toBe('store_context');
    expect(toolCalls[1].name).toBe('read_context');
  });

  it('recovers from trailing-comma JSON', () => {
    const text = '```tool_call\n{"tool":"web_search","args":{"query":"hello",}}\n```';
    const { toolCalls } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('web_search');
  });

  it('returns empty arrays for text with no tool calls', () => {
    const { toolCalls, cleanText } = parseToolCalls('Just a normal response.');
    expect(toolCalls).toHaveLength(0);
    expect(cleanText).toBe('Just a normal response.');
  });

  it('skips blocks with no tool field', () => {
    const text = '```tool_call\n{"not_a_tool":"foo"}\n```';
    const { toolCalls } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(0);
  });

  it('parses a ```json fenced block containing a tool field', () => {
    const text =
      'Here is the call:\n```json\n{"tool":"web_search","args":{"query":"test"}}\n```\nDone.';
    const { toolCalls, cleanText } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('web_search');
    expect(toolCalls[0].args.query).toBe('test');
    expect(cleanText).not.toContain('```json');
  });

  it('ignores ```json blocks without a tool field', () => {
    const text = '```json\n{"key":"value","items":[1,2,3]}\n```';
    const { toolCalls } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(0);
  });

  it('deduplicates across format 1 and format 3', () => {
    const call = '{"tool":"validate_json","args":{"text":"{}"}}';
    const text = `\`\`\`tool_call\n${call}\n\`\`\`\n\`\`\`json\n${call}\n\`\`\``;
    const { toolCalls } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(1);
  });

  it('parses unquoted-key tool call after repair', () => {
    const text = '```tool_call\n{tool: "store_context", args: {key: "k", value: "v"}}\n```';
    const { toolCalls } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('store_context');
  });
});

// ── executeTool — validate_json ──────────────────────────────────────────────

describe('executeTool — validate_json', () => {
  it('returns valid for a correct JSON object', async () => {
    const result = await executeTool({ name: 'validate_json', args: { text: '{"a":1}' } });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/Valid JSON object/);
    expect(result.result).toContain('1 key');
  });

  it('returns valid for a JSON array', async () => {
    const result = await executeTool({ name: 'validate_json', args: { text: '[1,2,3]' } });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/Valid JSON array with 3 element/);
  });

  it('returns invalid for malformed JSON', async () => {
    const result = await executeTool({ name: 'validate_json', args: { text: '{bad json}' } });
    expect(result.success).toBe(false);
    expect(result.result).toMatch(/Invalid JSON/);
  });

  it('returns error when text is missing', async () => {
    const result = await executeTool({ name: 'validate_json', args: {} });
    expect(result.success).toBe(false);
    expect(result.result).toMatch(/missing text/);
  });
});

// ── executeTool — summarize_text ─────────────────────────────────────────────

describe('executeTool — summarize_text', () => {
  it('returns short text as-is when already within limit', async () => {
    const result = await executeTool({
      name: 'summarize_text',
      args: { text: 'Long text here', max_words: 50 },
    });
    expect(result.success).toBe(true);
    expect(result.result).toContain('≤50 words');
    expect(result.result).toContain('Long text here');
  });

  it('returns error when text is missing', async () => {
    const result = await executeTool({ name: 'summarize_text', args: {} });
    expect(result.success).toBe(false);
  });

  it('clamps max_words to [10, 500]', async () => {
    const result = await executeTool({
      name: 'summarize_text',
      args: { text: 'x', max_words: 9999 },
    });
    expect(result.result).toContain('≤500 words');
  });

  it('performs extractive summarization on long text', async () => {
    const longText = [
      'The JavaScript runtime Node.js was built on Chrome V8 engine.',
      'It allows developers to run JavaScript on the server side.',
      'Node.js uses an event-driven, non-blocking I/O model.',
      'This makes it efficient and suitable for real-time applications.',
      'The package manager npm is bundled with Node.js.',
      'Millions of packages are available through the npm registry.',
      'Node.js is widely used for building APIs and microservices.',
      'It has a large and active open-source community worldwide.',
    ].join(' ');
    const result = await executeTool({
      name: 'summarize_text',
      args: { text: longText, max_words: 20 },
    });
    expect(result.success).toBe(true);
    expect(result.result).toContain('Extractive summary');
    expect(result.result).toContain('≤20 words');
    // Extracted word count should not grossly exceed the limit
    const summaryMatch = result.result.match(/:\n\n([\s\S]+)$/);
    if (summaryMatch) {
      const wordCount = summaryMatch[1].trim().split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeLessThanOrEqual(30); // some tolerance for boundary sentences
    }
  });

  it('labels the result as extractive summary', async () => {
    const text =
      'Artificial intelligence is transforming every industry. ' +
      'Machine learning models can now process vast amounts of data quickly. ' +
      'Deep learning networks have achieved remarkable accuracy in image recognition tasks. ' +
      'Natural language processing enables computers to understand human text effectively. ' +
      'Reinforcement learning allows agents to learn from environment feedback iteratively.';
    const result = await executeTool({
      name: 'summarize_text',
      args: { text, max_words: 15 },
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/Extractive summary/);
    expect(result.result).toMatch(/selected from \d+ total/);
  });
});

// ── executeTool — generate_code ───────────────────────────────────────────────

describe('executeTool — generate_code', () => {
  it('queues code generation task', async () => {
    const result = await executeTool({
      name: 'generate_code',
      args: { task: 'sort an array', language: 'python' },
    });
    expect(result.success).toBe(true);
    expect(result.result).toContain('python');
    expect(result.result).toContain('sort an array');
  });

  it('defaults language to typescript', async () => {
    const result = await executeTool({ name: 'generate_code', args: { task: 'hello world' } });
    expect(result.result).toContain('typescript');
  });

  it('returns error when task is missing', async () => {
    const result = await executeTool({ name: 'generate_code', args: {} });
    expect(result.success).toBe(false);
  });
});

// ── executeTool — store_context / read_context ────────────────────────────────

describe('executeTool — context tools', () => {
  it('stores and reads a value from shared context', async () => {
    const ctx: Record<string, unknown> = {};
    await executeTool({ name: 'store_context', args: { key: 'testKey', value: 42 } }, ctx);
    const read = await executeTool({ name: 'read_context', args: { key: 'testKey' } }, ctx);
    expect(read.success).toBe(true);
    expect(read.result).toContain('42');
  });

  it('reports missing key gracefully', async () => {
    const ctx: Record<string, unknown> = {};
    const result = await executeTool({ name: 'read_context', args: { key: 'missing' } }, ctx);
    expect(result.success).toBe(true);
    expect(result.result).toContain('not found');
  });
});

// ── executeTool — list_context_keys ──────────────────────────────────────────

describe('executeTool — list_context_keys', () => {
  it('reports empty context', async () => {
    const ctx: Record<string, unknown> = {};
    const result = await executeTool({ name: 'list_context_keys', args: {} }, ctx);
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/empty/i);
  });

  it('lists keys with value previews', async () => {
    const ctx: Record<string, unknown> = { foo: 'bar', count: 42 };
    const result = await executeTool({ name: 'list_context_keys', args: {} }, ctx);
    expect(result.success).toBe(true);
    expect(result.result).toContain('"foo"');
    expect(result.result).toContain('"count"');
    expect(result.result).toContain('2 key');
  });

  it('truncates long string values in preview', async () => {
    const longVal = 'x'.repeat(100);
    const ctx: Record<string, unknown> = { bigKey: longVal };
    const result = await executeTool({ name: 'list_context_keys', args: {} }, ctx);
    expect(result.result).toContain('…');
    expect(result.result.length).toBeLessThan(500);
  });

  it('reports no context when sharedContext is undefined', async () => {
    const result = await executeTool({ name: 'list_context_keys', args: {} });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/no workflow context|empty/i);
  });
});

// ── buildToolPrompt ──────────────────────────────────────────────────────────

describe('buildToolPrompt', () => {
  const tools: AgentTool[] = [
    { name: 'web_search', description: 'Search the web. Args: { "query": "..." }' },
    {
      name: 'store_context',
      description: 'Store a value. Args: { "key": "name", "value": "data" }',
    },
  ];

  it('returns empty string for empty tool list', () => {
    expect(buildToolPrompt([])).toBe('');
  });

  it('includes tool names and descriptions', () => {
    const prompt = buildToolPrompt(tools);
    expect(prompt).toContain('web_search');
    expect(prompt).toContain('store_context');
    expect(prompt).toContain('Search the web');
  });

  it('includes tool_call format instruction', () => {
    const prompt = buildToolPrompt(tools);
    expect(prompt).toContain('tool_call');
    expect(prompt).toContain('"tool"');
    expect(prompt).toContain('"args"');
  });

  it('includes a few-shot example with web_search and store_context', () => {
    const prompt = buildToolPrompt(tools);
    expect(prompt).toContain('Example');
    expect(prompt).toContain('web_search');
    expect(prompt).toContain('store_context');
  });

  it('includes the IMPORTANT usage guidance', () => {
    const prompt = buildToolPrompt(tools);
    expect(prompt).toContain('IMPORTANT');
    expect(prompt).toContain('genuinely needed');
  });

  it('injects rowan style hint when agentName is rowan', () => {
    const prompt = buildToolPrompt(tools, 'rowan');
    expect(prompt).toContain('decisively');
  });

  it('injects poirot style hint when agentName is poirot', () => {
    const prompt = buildToolPrompt(tools, 'poirot');
    expect(prompt).toContain('methodically');
  });

  it('includes list_context_keys in poirot style hint', () => {
    const prompt = buildToolPrompt(tools, 'poirot');
    expect(prompt).toContain('list_context_keys');
  });

  it('produces no style hint for unknown agent names', () => {
    const prompt = buildToolPrompt(tools, 'unknown_agent');
    // Should still include tools but no custom style
    expect(prompt).toContain('web_search');
    expect(prompt).not.toContain('decisively');
    expect(prompt).not.toContain('methodically');
  });

  it('uses rowan-specific pipeline example for rowan', () => {
    const prompt = buildToolPrompt(tools, 'rowan');
    expect(prompt).toContain('pipeline');
    expect(prompt).toContain('store_context');
  });

  it('uses poirot investigation example for poirot', () => {
    const prompt = buildToolPrompt(tools, 'poirot');
    expect(prompt).toContain('investigation');
    expect(prompt).toContain('compare_texts');
  });

  it('uses default examples with validate_json pattern when no agent', () => {
    const prompt = buildToolPrompt(tools);
    expect(prompt).toContain('validate_json');
    expect(prompt).toContain('extract_json');
  });
});

// ── getPreferredTools ────────────────────────────────────────────────────────

describe('getPreferredTools', () => {
  const allTools: AgentTool[] = [
    { name: 'compare_texts', description: 'Compare two texts.' },
    { name: 'web_search', description: 'Search the web.' },
    { name: 'store_context', description: 'Store a value.' },
    { name: 'generate_code', description: 'Generate code.' },
    { name: 'read_context', description: 'Read a value.' },
  ];

  it('returns all tools unchanged for unknown agent', () => {
    const result = getPreferredTools('unknown', allTools);
    expect(result.map((t) => t.name)).toEqual(allTools.map((t) => t.name));
  });

  it('rowan puts web_search first', () => {
    const result = getPreferredTools('rowan', allTools);
    expect(result[0].name).toBe('web_search');
  });

  it('rowan puts generate_code before compare_texts', () => {
    const result = getPreferredTools('rowan', allTools);
    const genIdx = result.findIndex((t) => t.name === 'generate_code');
    const cmpIdx = result.findIndex((t) => t.name === 'compare_texts');
    expect(genIdx).toBeLessThan(cmpIdx);
  });

  it('poirot puts read_context first (without list_context_keys in set)', () => {
    const result = getPreferredTools('poirot', allTools);
    expect(result[0].name).toBe('read_context');
  });

  it('poirot puts compare_texts before web_search', () => {
    const result = getPreferredTools('poirot', allTools);
    const cmpIdx = result.findIndex((t) => t.name === 'compare_texts');
    const searchIdx = result.findIndex((t) => t.name === 'web_search');
    expect(cmpIdx).toBeLessThan(searchIdx);
  });

  it('preserves all tools (no tools lost)', () => {
    const rowan = getPreferredTools('rowan', allTools);
    const poirot = getPreferredTools('poirot', allTools);
    expect(rowan).toHaveLength(allTools.length);
    expect(poirot).toHaveLength(allTools.length);
  });

  it('is case-insensitive for agent name', () => {
    const lower = getPreferredTools('rowan', allTools).map((t) => t.name);
    const upper = getPreferredTools('Rowan', allTools).map((t) => t.name);
    expect(lower).toEqual(upper);
  });

  it('appends tools not in preference list at the end', () => {
    const withExtra: AgentTool[] = [
      ...allTools,
      { name: 'custom_tool', description: 'A custom tool.' },
    ];
    const result = getPreferredTools('rowan', withExtra);
    expect(result[result.length - 1].name).toBe('custom_tool');
  });

  it('rowan includes calculate before compare_texts', () => {
    const tools: AgentTool[] = [
      { name: 'compare_texts', description: '' },
      { name: 'calculate', description: '' },
      { name: 'web_search', description: '' },
    ];
    const result = getPreferredTools('rowan', tools);
    const calcIdx = result.findIndex((t) => t.name === 'calculate');
    const cmpIdx = result.findIndex((t) => t.name === 'compare_texts');
    expect(calcIdx).toBeLessThan(cmpIdx);
  });

  it('poirot includes calculate before summarize_text', () => {
    const tools: AgentTool[] = [
      { name: 'summarize_text', description: '' },
      { name: 'calculate', description: '' },
      { name: 'compare_texts', description: '' },
    ];
    const result = getPreferredTools('poirot', tools);
    const calcIdx = result.findIndex((t) => t.name === 'calculate');
    const sumIdx = result.findIndex((t) => t.name === 'summarize_text');
    expect(calcIdx).toBeLessThan(sumIdx);
  });
});

// ── safeEval ─────────────────────────────────────────────────────────────────

describe('safeEval', () => {
  it('evaluates simple addition', () => {
    expect(safeEval('2 + 2')).toBe(4);
  });

  it('evaluates multiplication and subtraction', () => {
    expect(safeEval('10 * 3 - 5')).toBe(25);
  });

  it('evaluates percentage of a value', () => {
    expect(safeEval('100 * 0.15')).toBe(15);
  });

  it('evaluates parenthesized expression', () => {
    expect(safeEval('(2 + 3) * 4')).toBe(20);
  });

  it('evaluates exponentiation with ^', () => {
    expect(safeEval('2 ^ 10')).toBe(1024);
  });

  it('evaluates sqrt', () => {
    expect(safeEval('sqrt(16)')).toBe(4);
  });

  it('evaluates pi constant', () => {
    const result = safeEval('pi');
    expect(result).toBeCloseTo(3.14159, 4);
  });

  it('evaluates floor and ceil', () => {
    expect(safeEval('floor(3.7)')).toBe(3);
    expect(safeEval('ceil(3.2)')).toBe(4);
  });

  it('evaluates min and max with multiple args', () => {
    expect(safeEval('min(5, 3, 8)')).toBe(3);
    expect(safeEval('max(5, 3, 8)')).toBe(8);
  });

  it('evaluates abs of negative number', () => {
    expect(safeEval('abs(-42)')).toBe(42);
  });

  it('evaluates round', () => {
    expect(safeEval('round(2.7)')).toBe(3);
  });

  it('returns null for empty expression', () => {
    expect(safeEval('')).toBeNull();
  });

  it('returns null for unknown identifiers', () => {
    expect(safeEval('window.open("evil")')).toBeNull();
  });

  it('returns null for expressions with semicolons', () => {
    expect(safeEval('1; process.exit(0)')).toBeNull();
  });

  it('returns null for division by zero (Infinity)', () => {
    expect(safeEval('1 / 0')).toBeNull();
  });

  it('returns null for NaN-producing expressions', () => {
    expect(safeEval('sqrt(-1)')).toBeNull();
  });

  it('handles decimal numbers', () => {
    expect(safeEval('1.5 + 2.5')).toBe(4);
  });
});

// ── executeTool — calculate ───────────────────────────────────────────────────

describe('executeTool — calculate', () => {
  it('returns correct result for simple expression', async () => {
    const result = await executeTool({ name: 'calculate', args: { expression: '2 + 2' } });
    expect(result.success).toBe(true);
    expect(result.result).toContain('= 4');
  });

  it('returns correct result for sqrt expression', async () => {
    const result = await executeTool({ name: 'calculate', args: { expression: 'sqrt(25)' } });
    expect(result.success).toBe(true);
    expect(result.result).toContain('= 5');
  });

  it('includes the expression in the result string', async () => {
    const result = await executeTool({ name: 'calculate', args: { expression: '10 * 5' } });
    expect(result.result).toContain('10 * 5');
  });

  it('returns error for missing expression', async () => {
    const result = await executeTool({ name: 'calculate', args: {} });
    expect(result.success).toBe(false);
    expect(result.result).toMatch(/missing expression/);
  });

  it('returns error for invalid/unsafe expression', async () => {
    const result = await executeTool({ name: 'calculate', args: { expression: 'evil()' } });
    expect(result.success).toBe(false);
    expect(result.result).toContain('Could not evaluate');
  });

  it('records analytics for calculate tool', async () => {
    await executeTool({ name: 'calculate', args: { expression: '1 + 1' } });
    const { getToolAnalytics } = await import('../agentTools');
    const analytics = getToolAnalytics();
    expect(analytics.calculate).toBeDefined();
    expect(analytics.calculate.calls).toBeGreaterThan(0);
  });
});

// ── parseToolCalls — Format 4: inline JSON ───────────────────────────────────

describe('parseToolCalls — Format 4 inline JSON', () => {
  it('parses a bare JSON object on its own line', () => {
    const text =
      'I will search for this.\n{"tool": "web_search", "args": {"query": "test"}}\nResults incoming.';
    const { toolCalls, cleanText } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('web_search');
    expect(toolCalls[0].args.query).toBe('test');
    expect(cleanText).toContain('I will search');
    expect(cleanText).toContain('Results incoming');
    expect(cleanText).not.toContain('"tool"');
  });

  it('does not parse JSON embedded mid-sentence', () => {
    // JSON that appears inline within a sentence (not on its own line) should NOT be parsed
    const text = 'Use this: {"tool": "web_search", "args": {}} to search.';
    const { toolCalls } = parseToolCalls(text);
    // mid-sentence inline JSON — the regex requires the { to start the line
    expect(toolCalls).toHaveLength(0);
  });

  it('deduplicates inline JSON against fenced format', () => {
    const call = '{"tool": "validate_json", "args": {"text": "{}"}}';
    const text = `\`\`\`tool_call\n${call}\n\`\`\`\n${call}`;
    const { toolCalls } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(1);
  });

  it('handles multiple inline JSON tool calls', () => {
    const text = [
      'Step 1:',
      '{"tool": "store_context", "args": {"key": "a", "value": "1"}}',
      'Step 2:',
      '{"tool": "read_context", "args": {"key": "a"}}',
    ].join('\n');
    const { toolCalls } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0].name).toBe('store_context');
    expect(toolCalls[1].name).toBe('read_context');
  });

  it('ignores bare JSON without a tool field', () => {
    const text = '{"key": "value", "items": [1, 2, 3]}';
    const { toolCalls } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(0);
  });
});

// ── isBlockedUrl — SSRF protection ──────────────────────────────────────────

describe('isBlockedUrl — SSRF protection', () => {
  const blocked = [
    'http://127.0.0.1/admin',
    'http://10.0.0.1/api',
    'http://172.16.0.1/secret',
    'http://172.31.255.255/data',
    'http://192.168.1.1/router',
    'http://localhost:8080/debug',
    'http://[::1]/internal',
    'http://0.0.0.0/zero',
    'http://169.254.169.254/metadata', // AWS IMDS
    'not-a-url',
    '',
  ];

  const allowed = [
    'https://google.com',
    'https://api.deepseek.com/v1/chat',
    'https://8.8.8.8/dns',
    'https://example.com:443/path?q=1',
    'http://172.15.0.1/ok', // 172.15.x is NOT in the private range
  ];

  for (const url of blocked) {
    it(`blocks ${url || '(empty)'}`, () => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  }

  for (const url of allowed) {
    it(`allows ${url}`, () => {
      expect(isBlockedUrl(url)).toBe(false);
    });
  }
});

// ── executeTool — extract_json ────────────────────────────────────────────────

describe('executeTool — extract_json', () => {
  it('extracts fields from a valid JSON string', async () => {
    const text = '{"name": "Alice", "score": 95, "status": "pass"}';
    const result = await executeTool({ name: 'extract_json', args: { text } });
    expect(result.success).toBe(true);
    expect(result.result).toContain('Alice');
    expect(result.result).toContain('score');
  });

  it('filters to schema-matching keys', async () => {
    const text = '{"name": "Alice", "score": 95, "status": "pass", "notes": "good"}';
    const result = await executeTool({
      name: 'extract_json',
      args: { text, schema: 'score, status' },
    });
    expect(result.success).toBe(true);
    expect(result.result).toContain('score');
    expect(result.result).toContain('status');
    expect(result.result).not.toContain('"notes"');
    expect(result.result).not.toContain('"name"');
  });

  it('returns all fields when schema keywords match nothing', async () => {
    const text = '{"foo": 1, "bar": 2}';
    const result = await executeTool({
      name: 'extract_json',
      args: { text, schema: 'xyz_unrelated' },
    });
    expect(result.success).toBe(true);
    // Falls back to all fields when no schema match
    expect(result.result).toContain('foo');
    expect(result.result).toContain('bar');
  });

  it('extracts JSON from a code-fenced block', async () => {
    const text = 'Here is the result:\n```json\n{"verdict": "approve", "score": 0.9}\n```\nDone.';
    const result = await executeTool({ name: 'extract_json', args: { text } });
    expect(result.success).toBe(true);
    expect(result.result).toContain('verdict');
    expect(result.result).toContain('approve');
  });

  it('extracts JSON embedded in prose via bracket matching', async () => {
    const text = 'The analysis returned {"status": "ok", "count": 42} as its result.';
    const result = await executeTool({ name: 'extract_json', args: { text } });
    expect(result.success).toBe(true);
    expect(result.result).toContain('status');
    expect(result.result).toContain('42');
  });

  it('returns failure with LLM forwarding hint when no JSON found', async () => {
    const text = 'This is plain text with no JSON at all.';
    const result = await executeTool({
      name: 'extract_json',
      args: { text, schema: 'name, score' },
    });
    expect(result.success).toBe(false);
    expect(result.result).toContain('name, score');
    expect(result.result).toContain('plain text');
  });

  it('returns error for missing text argument', async () => {
    const result = await executeTool({ name: 'extract_json', args: {} });
    expect(result.success).toBe(false);
    expect(result.result).toMatch(/missing text/i);
  });

  it('reports field count in result', async () => {
    const text = '{"a": 1, "b": 2, "c": 3}';
    const result = await executeTool({ name: 'extract_json', args: { text } });
    expect(result.result).toContain('3 fields');
  });
});

// ── executeTool — regex_extract ───────────────────────────────────────────────

describe('executeTool — regex_extract', () => {
  it('extracts all numbers from text', async () => {
    const result = await executeTool({
      name: 'regex_extract',
      args: { pattern: '\\d+', text: 'I have 3 cats and 12 dogs and 1 fish.' },
    });
    expect(result.success).toBe(true);
    expect(result.result).toContain('3 matches');
    expect(result.result).toContain('3');
    expect(result.result).toContain('12');
    expect(result.result).toContain('1');
  });

  it('extracts capture group 1 when present', async () => {
    const result = await executeTool({
      name: 'regex_extract',
      args: { pattern: 'score=(\\d+)', text: 'score=95 and score=80' },
    });
    expect(result.success).toBe(true);
    // Should return '95' and '80', not 'score=95'
    expect(result.result).toContain('95');
    expect(result.result).toContain('80');
    expect(result.result).not.toContain('score=95');
  });

  it('reports no matches when pattern does not match', async () => {
    const result = await executeTool({
      name: 'regex_extract',
      args: { pattern: 'xyz_not_present', text: 'hello world' },
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/no matches/i);
  });

  it('is case-insensitive with i flag', async () => {
    const result = await executeTool({
      name: 'regex_extract',
      args: { pattern: 'hello', text: 'Hello World HELLO', flags: 'gi' },
    });
    expect(result.success).toBe(true);
    expect(result.result).toContain('2 matches');
  });

  it('returns error for missing pattern', async () => {
    const result = await executeTool({
      name: 'regex_extract',
      args: { text: 'some text' },
    });
    expect(result.success).toBe(false);
    expect(result.result).toMatch(/missing pattern/i);
  });

  it('returns error for missing text', async () => {
    const result = await executeTool({
      name: 'regex_extract',
      args: { pattern: '\\d+' },
    });
    expect(result.success).toBe(false);
    expect(result.result).toMatch(/missing text/i);
  });

  it('rejects patterns that are too long', async () => {
    const result = await executeTool({
      name: 'regex_extract',
      args: { pattern: 'a'.repeat(301), text: 'test' },
    });
    expect(result.success).toBe(false);
    expect(result.result).toMatch(/too long/i);
  });

  it('rejects patterns with nested quantifiers', async () => {
    const result = await executeTool({
      name: 'regex_extract',
      args: { pattern: '(a+)+', text: 'aaaa' },
    });
    expect(result.success).toBe(false);
    expect(result.result).toMatch(/catastrophic/i);
  });

  it('returns error for invalid regex syntax', async () => {
    const result = await executeTool({
      name: 'regex_extract',
      args: { pattern: '[unclosed', text: 'test' },
    });
    expect(result.success).toBe(false);
    expect(result.result).toMatch(/invalid regex/i);
  });

  it('strips unknown flags, keeps safe flags', async () => {
    // flags 'gx' — 'x' is not safe, should be stripped; 'g' kept
    const result = await executeTool({
      name: 'regex_extract',
      args: { pattern: '\\w+', text: 'hello world', flags: 'gx' },
    });
    // Should still work — unsafe flags are silently removed
    expect(result.success).toBe(true);
  });
});

// ── extractiveSummarize ───────────────────────────────────────────────────────

describe('extractiveSummarize', () => {
  it('returns the input unchanged when it fits within maxWords', () => {
    const text = 'Hello world.';
    const result = extractiveSummarize(text, 50);
    expect(result).toContain('Hello world');
  });

  it('returns at most maxWords words for long input', () => {
    const sentences = Array.from(
      { length: 20 },
      (_, i) =>
        `Sentence number ${i + 1} contains important information about topic ${i + 1} in detail.`,
    ).join(' ');
    const result = extractiveSummarize(sentences, 30);
    const wc = result.split(/\s+/).filter(Boolean).length;
    expect(wc).toBeLessThanOrEqual(35); // slight tolerance for boundary sentence
  });

  it('preserves original sentence order in the output', () => {
    // Sentences with clear distinguishing keywords — order should be preserved
    const text =
      'Alpha sentence introduces the alpha concept clearly. ' +
      'Beta sentence builds on the alpha foundation significantly. ' +
      'Gamma sentence concludes with a gamma summary of findings.';
    const result = extractiveSummarize(text, 25);
    // If both alpha and gamma sentences are selected, alpha must come first
    const alphaIdx = result.indexOf('Alpha');
    const gammaIdx = result.indexOf('Gamma');
    if (alphaIdx !== -1 && gammaIdx !== -1) {
      expect(alphaIdx).toBeLessThan(gammaIdx);
    }
  });

  it('handles single-sentence text without errors', () => {
    const text = 'This is the only sentence in the entire document.';
    const result = extractiveSummarize(text, 10);
    expect(result.length).toBeGreaterThan(0);
    const wc = result.split(/\s+/).filter(Boolean).length;
    expect(wc).toBeLessThanOrEqual(10);
  });

  it('boosts the first sentence (opening sentence bias)', () => {
    // The first sentence should always appear in a short summary
    const text =
      'Node.js was created by Ryan Dahl in 2009 as a JavaScript runtime. ' +
      'It uses the V8 engine from Google Chrome for fast execution speed. ' +
      'The event loop makes Node.js highly scalable for concurrent operations. ' +
      'Many large companies including Netflix and LinkedIn rely on Node.js today.';
    const result = extractiveSummarize(text, 15);
    // The first sentence should appear (it gets a 1.6x position bonus)
    expect(result).toContain('Node.js was created');
  });

  it('returns non-empty output even for very short max_words', () => {
    const text =
      'Quantum computing leverages quantum mechanics to process information. ' +
      'Classical computers use bits while quantum computers use qubits. ' +
      'Qubits can exist in superposition allowing parallel computation.';
    const result = extractiveSummarize(text, 10);
    expect(result.trim().length).toBeGreaterThan(0);
  });
});

// ── executeTool — compare_texts ───────────────────────────────────────────────

describe('executeTool — compare_texts', () => {
  it('includes Jaccard similarity percentage in output', async () => {
    const result = await executeTool({
      name: 'compare_texts',
      args: { text_a: 'The quick brown fox', text_b: 'The quick brown fox' },
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/Similarity.*\d+%/);
  });

  it('reports 100% similarity for identical texts', async () => {
    const text = 'Hello world this is a test sentence.';
    const result = await executeTool({
      name: 'compare_texts',
      args: { text_a: text, text_b: text },
    });
    expect(result.success).toBe(true);
    expect(result.result).toContain('100%');
  });

  it('reports low similarity for completely different texts', async () => {
    const result = await executeTool({
      name: 'compare_texts',
      args: {
        text_a: 'Alpha beta gamma delta epsilon zeta theta iota kappa lambda.',
        text_b: 'Quantum mechanics photon electron proton neutron orbital spin.',
      },
    });
    expect(result.success).toBe(true);
    // Should be very different — similarity label should not be "very similar"
    expect(result.result).not.toContain('very similar');
  });

  it('returns error when text_a is missing', async () => {
    const result = await executeTool({
      name: 'compare_texts',
      args: { text_b: 'some text' },
    });
    expect(result.success).toBe(false);
    expect(result.result).toMatch(/required/i);
  });

  it('uses custom labels in the output', async () => {
    const result = await executeTool({
      name: 'compare_texts',
      args: {
        text_a: 'Version one content here',
        text_b: 'Version two content there',
        label_a: 'Draft',
        label_b: 'Final',
      },
    });
    expect(result.success).toBe(true);
    expect(result.result).toContain('Draft');
    expect(result.result).toContain('Final');
  });

  it('includes similarity label in the output', async () => {
    const result = await executeTool({
      name: 'compare_texts',
      args: {
        text_a: 'The quick brown fox jumps over the lazy dog near the river.',
        text_b: 'The quick brown cat jumps over the sleepy dog near the pond.',
      },
    });
    expect(result.success).toBe(true);
    // Should contain one of the similarity labels
    expect(result.result).toMatch(/very similar|somewhat similar|mostly different|very different/);
  });
});
