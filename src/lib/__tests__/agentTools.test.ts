import { describe, it, expect } from 'vitest';
import { parseToolCalls, repairJson, executeTool, buildToolPrompt, getPreferredTools } from '../agentTools';
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
});

// ── parseToolCalls ───────────────────────────────────────────────────────────

describe('parseToolCalls', () => {
  it('parses a fenced tool_call block', () => {
    const text = 'Some text\n```tool_call\n{"tool":"web_search","args":{"query":"test"}}\n```\nMore text';
    const { toolCalls, cleanText } = parseToolCalls(text);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('web_search');
    expect(toolCalls[0].args.query).toBe('test');
    expect(cleanText).toContain('Some text');
    expect(cleanText).toContain('More text');
    expect(cleanText).not.toContain('tool_call');
  });

  it('parses an XML tool_call tag', () => {
    const text = 'Before\n<tool_call>{"tool":"validate_json","args":{"text":"{}"}}</tool_call>\nAfter';
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
  it('queues summarization task', async () => {
    const result = await executeTool({ name: 'summarize_text', args: { text: 'Long text here', max_words: 50 } });
    expect(result.success).toBe(true);
    expect(result.result).toContain('≤50 words');
    expect(result.result).toContain('Long text here');
  });

  it('returns error when text is missing', async () => {
    const result = await executeTool({ name: 'summarize_text', args: {} });
    expect(result.success).toBe(false);
  });

  it('clamps max_words to [10, 500]', async () => {
    const result = await executeTool({ name: 'summarize_text', args: { text: 'x', max_words: 9999 } });
    expect(result.result).toContain('≤500 words');
  });
});

// ── executeTool — generate_code ───────────────────────────────────────────────

describe('executeTool — generate_code', () => {
  it('queues code generation task', async () => {
    const result = await executeTool({ name: 'generate_code', args: { task: 'sort an array', language: 'python' } });
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

// ── buildToolPrompt ──────────────────────────────────────────────────────────

describe('buildToolPrompt', () => {
  const tools: AgentTool[] = [
    { name: 'web_search', description: 'Search the web. Args: { "query": "..." }' },
    { name: 'store_context', description: 'Store a value. Args: { "key": "name", "value": "data" }' },
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

  it('produces no style hint for unknown agent names', () => {
    const prompt = buildToolPrompt(tools, 'unknown_agent');
    // Should still include tools but no custom style
    expect(prompt).toContain('web_search');
    expect(prompt).not.toContain('decisively');
    expect(prompt).not.toContain('methodically');
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
    expect(result.map(t => t.name)).toEqual(allTools.map(t => t.name));
  });

  it('rowan puts web_search first', () => {
    const result = getPreferredTools('rowan', allTools);
    expect(result[0].name).toBe('web_search');
  });

  it('rowan puts generate_code before compare_texts', () => {
    const result = getPreferredTools('rowan', allTools);
    const genIdx = result.findIndex(t => t.name === 'generate_code');
    const cmpIdx = result.findIndex(t => t.name === 'compare_texts');
    expect(genIdx).toBeLessThan(cmpIdx);
  });

  it('poirot puts read_context first', () => {
    const result = getPreferredTools('poirot', allTools);
    expect(result[0].name).toBe('read_context');
  });

  it('poirot puts compare_texts before web_search', () => {
    const result = getPreferredTools('poirot', allTools);
    const cmpIdx = result.findIndex(t => t.name === 'compare_texts');
    const searchIdx = result.findIndex(t => t.name === 'web_search');
    expect(cmpIdx).toBeLessThan(searchIdx);
  });

  it('preserves all tools (no tools lost)', () => {
    const rowan = getPreferredTools('rowan', allTools);
    const poirot = getPreferredTools('poirot', allTools);
    expect(rowan).toHaveLength(allTools.length);
    expect(poirot).toHaveLength(allTools.length);
  });

  it('is case-insensitive for agent name', () => {
    const lower = getPreferredTools('rowan', allTools).map(t => t.name);
    const upper = getPreferredTools('Rowan', allTools).map(t => t.name);
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
});
