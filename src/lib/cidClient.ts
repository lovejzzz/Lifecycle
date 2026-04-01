/**
 * CID API client — single point of contact for all LLM requests.
 * Includes circuit breaker, retry with backoff, request deduplication,
 * token budget checking, and provider failover.
 */

import { getSession } from './supabase';
import { CircuitBreaker } from './circuitBreaker';
import { createLogger } from './logger';
import { estimateTokens } from './cache';

const log = createLogger('CID-Client');

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
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ── Circuit Breakers (per-model) ────────────────────────────────────────────

const breakers = new Map<string, CircuitBreaker>();

function getBreaker(model: string): CircuitBreaker {
  const key = model || 'default';
  let b = breakers.get(key);
  if (!b) {
    b = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30_000 });
    breakers.set(key, b);
  }
  return b;
}

export function getCircuitState(model?: string) {
  return getBreaker(model || 'default').getState();
}
export function resetCircuit(model?: string) {
  getBreaker(model || 'default').reset();
}

// ── Request Deduplication ───────────────────────────────────────────────────

const inflight = new Map<string, Promise<CIDResponse>>();

function dedupKey(req: CIDRequest): string {
  return JSON.stringify([
    req.systemPrompt.slice(0, 200),
    req.messages.slice(-2),
    req.model,
    req.taskType,
  ]);
}

// ── Token Budget ────────────────────────────────────────────────────────────

const MODEL_LIMITS: Record<string, number> = {
  'deepseek-chat': 64_000,
  'deepseek-reasoner': 64_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
};

export interface TokenBudgetResult {
  estimatedTokens: number;
  modelLimit: number;
  utilizationPercent: number;
  warning: string | null;
}

export function checkTokenBudget(req: CIDRequest): TokenBudgetResult {
  const model = req.model || 'deepseek-reasoner';
  const limit = MODEL_LIMITS[model] || 64_000;
  const promptTokens = estimateTokens(req.systemPrompt);
  const msgTokens = req.messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const total = promptTokens + msgTokens;
  const pct = Math.round((total / limit) * 100);
  return {
    estimatedTokens: total,
    modelLimit: limit,
    utilizationPercent: pct,
    warning: pct > 90 ? `Token budget at ${pct}% (${total}/${limit})` : null,
  };
}

// ── Provider Failover Chain ─────────────────────────────────────────────────

const FALLBACK_MODELS = ['deepseek-reasoner', 'deepseek-chat'];

// ── Retry with Backoff ──────────────────────────────────────────────────────

const RETRY_DELAYS = [1000, 2000, 4000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Single-shot CID call without retry/circuit-breaker/dedup.
 * Use when the caller already has its own retry loop (e.g. executeNode agent loop).
 */
export async function callCIDOnce(req: CIDRequest): Promise<CIDResponse> {
  const timeoutMs = req.timeout ?? 45000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (req.signal) req.signal.addEventListener('abort', () => controller.abort());

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const session = await getSession();
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    } catch {
      /* anonymous mode */
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
      const resp: CIDResponse = {
        result: null,
        error: data.error || 'api_error',
        message: data.message || `HTTP ${res.status}`,
      };
      // Attach status for retry decision
      (resp as unknown as Record<string, unknown>)._status = res.status;
      return resp;
    }

    return data as CIDResponse;
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { result: null, error: 'timeout', message: 'Request timed out' };
    }
    return {
      result: null,
      error: 'network_error',
      message: err instanceof Error ? err.message : 'Network error',
    };
  }
}

/**
 * Call the CID API with circuit breaker, retry, deduplication, and failover.
 */
export async function callCID(req: CIDRequest): Promise<CIDResponse> {
  // Check token budget
  const budget = checkTokenBudget(req);
  if (budget.warning)
    log.warn('token-budget', {
      utilization: budget.utilizationPercent,
      estimated: budget.estimatedTokens,
    });

  // Deduplication: if identical request in-flight, return same promise
  const key = dedupKey(req);
  const existing = inflight.get(key);
  if (existing) {
    log.info('dedup-hit', { model: req.model });
    return existing;
  }

  const execute = async (): Promise<CIDResponse> => {
    const model = req.model || 'deepseek-reasoner';
    const breaker = getBreaker(model);

    // Circuit breaker check — try failover if primary is open
    if (!breaker.canExecute()) {
      log.warn('circuit-open', { model });
      for (const fallback of FALLBACK_MODELS) {
        if (fallback === model) continue;
        if (getBreaker(fallback).canExecute()) {
          log.info('failover', { from: model, to: fallback });
          return callCIDWithRetry({ ...req, model: fallback });
        }
      }
      return {
        result: null,
        error: 'all_circuits_open',
        message: 'All providers temporarily unavailable. Try again in 30s.',
      };
    }

    return callCIDWithRetry(req);
  };

  const promise = execute().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

async function callCIDWithRetry(req: CIDRequest): Promise<CIDResponse> {
  const model = req.model || 'deepseek-reasoner';
  const breaker = getBreaker(model);

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const resp = await callCIDOnce(req);

    // Success
    if (!resp.error) {
      breaker.onSuccess();
      return resp;
    }

    // Don't retry timeouts or client errors (except 429)
    const status = (resp as unknown as Record<string, unknown>)._status as number | undefined;
    if (resp.error === 'timeout') {
      breaker.onFailure();
      return resp;
    }

    // Retryable?
    const isRetryable = status ? RETRYABLE_STATUSES.has(status) : resp.error === 'network_error';
    if (!isRetryable || attempt >= RETRY_DELAYS.length) {
      if (status && status >= 500) breaker.onFailure();
      return resp;
    }

    // Backoff
    const delay = RETRY_DELAYS[attempt];
    log.info('retry', { attempt: attempt + 1, delayMs: delay, model, error: resp.error });
    await new Promise((r) => setTimeout(r, delay));
  }

  breaker.onFailure();
  return { result: null, error: 'max_retries', message: 'All retry attempts exhausted' };
}

/** Extract text content from a CID response, handling different response shapes */
export function extractText(response: CIDResponse): string {
  if (!response.result) return '';
  if (typeof response.result === 'string') return response.result;
  return response.result.content || response.result.message || JSON.stringify(response.result);
}
