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
];

/** Get the tool description block to inject into system prompts */
export function buildToolPrompt(tools: AgentTool[]): string {
  if (tools.length === 0) return '';
  const toolDescs = tools.map(t => `- **${t.name}**: ${t.description}`).join('\n');
  return `\n\n## Available Tools\nYou can call tools by including a JSON block in your response:\n\`\`\`tool_call\n{"tool": "tool_name", "args": {"key": "value"}}\n\`\`\`\n\nAvailable tools:\n${toolDescs}\n\nYou may call multiple tools. After each tool call block, continue your response. Tool results will be provided in a follow-up message if the node supports looping.\n\nIMPORTANT: Only use tools when genuinely needed. Most tasks can be completed with your own knowledge.`;
}

// ── Tool Call Parsing ────────────────────────────────────────────────────────

/** Parse tool calls from LLM output text */
export function parseToolCalls(text: string): { cleanText: string; toolCalls: ParsedToolCall[] } {
  const toolCalls: ParsedToolCall[] = [];
  // Match ```tool_call\n{...}\n``` blocks
  const toolCallRegex = /```tool_call\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = toolCallRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.tool && typeof parsed.tool === 'string') {
        toolCalls.push({
          name: parsed.tool,
          args: parsed.args || {},
        });
      }
    } catch {
      // Skip unparseable tool calls
    }
  }
  // Remove tool call blocks from the text to get clean output
  const cleanText = text.replace(toolCallRegex, '').trim();
  return { cleanText, toolCalls };
}

// ── Tool Execution ──────────────────────────────────────────────────────────

/** Execute a single tool call and return the result */
export async function executeTool(
  call: ParsedToolCall,
  sharedContext?: Record<string, unknown>,
): Promise<ToolCallResult> {
  const start = Date.now();
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

      default:
        return { tool: call.name, args: call.args, result: `Unknown tool: ${call.name}`, success: false, durationMs: Date.now() - start };
    }
  } catch (err) {
    return { tool: call.name, args: call.args, result: `Tool execution error: ${err instanceof Error ? err.message : 'unknown'}`, success: false, durationMs: Date.now() - start };
  }
}

/** Format tool results for injection into the next LLM message */
export function formatToolResults(results: ToolCallResult[]): string {
  return results.map(r =>
    `[Tool: ${r.tool}] ${r.success ? '✓' : '✗'} (${r.durationMs}ms)\n${r.result}`
  ).join('\n\n');
}
