/**
 * CID API client — single point of contact for all LLM requests.
 * Replaces 5 inline fetch('/api/cid') calls with a typed, consistent interface.
 */

import { getSession } from './supabase';

export type TaskType = 'generate' | 'execute' | 'analyze';

export interface CIDRequest {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant' | 'cid'; content: string }>;
  model?: string;
  taskType?: TaskType;
  /** Timeout in ms. Default: 45000 */
  timeout?: number;
  /** AbortSignal for external cancellation */
  signal?: AbortSignal;
}

export interface CIDResponse {
  result: any;
  provider?: string;
  model?: string;
  error?: string;
  message?: string;
}

/**
 * Call the CID API route. Handles timeout, abort, and error normalization.
 * Throws on network failure; returns error shape on API errors.
 */
export async function callCID(req: CIDRequest): Promise<CIDResponse> {
  const timeoutMs = req.timeout ?? 45000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Compose signal: respect both internal timeout and external abort
  if (req.signal) {
    req.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    // Attach auth token if available (for server-side JWT verification)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const session = await getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch {
      // Auth not available — proceed without token (anonymous mode)
    }

    const res = await fetch('/api/cid', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        systemPrompt: req.systemPrompt,
        messages: req.messages,
        model: req.model,
        taskType: req.taskType,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const data = await res.json();

    if (!res.ok) {
      return {
        result: null,
        error: data.error || 'api_error',
        message: data.message || `HTTP ${res.status}`,
      };
    }

    return data as CIDResponse;
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { result: null, error: 'timeout', message: 'Request timed out' };
    }
    return { result: null, error: 'network_error', message: err instanceof Error ? err.message : 'Network error' };
  }
}

/** Extract text content from a CID response, handling different response shapes */
export function extractText(response: CIDResponse): string {
  if (!response.result) return '';
  if (typeof response.result === 'string') return response.result;
  return response.result.content || response.result.message || JSON.stringify(response.result);
}
