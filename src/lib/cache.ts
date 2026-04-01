/**
 * Execution cache — content hashing, cache lookup, cost estimation.
 *
 * Used by executeNode() to skip redundant LLM calls when inputs haven't changed.
 */

// ─── Content Hashing ──────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 hex hash of a string.
 * Works in both browser (Web Crypto) and Node.js (crypto module).
 */
export async function sha256(input: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const buf = new TextEncoder().encode(input);
    const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback: simple hash for environments without Web Crypto
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Build a cache key from execution inputs.
 * The key captures everything that would change the LLM output.
 */
export function buildCacheKey(parts: {
  nodeId: string;
  prompt: string;
  upstreamResults: string[];
  model: string;
  category: string;
  content?: string;
}): string {
  // Deterministic concatenation of all inputs
  return [
    parts.nodeId,
    parts.model,
    parts.category,
    parts.prompt,
    parts.content || '',
    ...parts.upstreamResults.sort(), // sort for determinism
  ].join('\n---CACHE_SEP---\n');
}

// ─── Cache Store ──────────────────────────────────────────────────────────────

export interface CacheEntry {
  hash: string;
  result: string;
  timestamp: number;
  expiresAt?: number;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
}

const MAX_CACHE_SIZE = 200;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const STORAGE_KEY = 'lifecycle-cache-v1';

/** In-memory execution cache with localStorage persistence and TTL. */
const executionCache = new Map<string, CacheEntry>();

// Load persisted cache on module init
function loadCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const entries: Array<[string, CacheEntry]> = JSON.parse(raw);
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt && entry.expiresAt > now) {
        executionCache.set(key, entry);
      }
    }
  } catch {
    /* corrupt cache — start fresh */
  }
}
loadCache();

function persistCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const entries = [...executionCache.entries()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota exceeded — silent */
  }
}

export function getCacheEntry(nodeId: string): CacheEntry | undefined {
  const entry = executionCache.get(nodeId);
  if (!entry) return undefined;
  // Lazy TTL expiry
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    executionCache.delete(nodeId);
    persistCache();
    return undefined;
  }
  return entry;
}

export function setCacheEntry(nodeId: string, entry: CacheEntry): void {
  if (!entry.expiresAt) entry.expiresAt = Date.now() + CACHE_TTL_MS;
  executionCache.set(nodeId, entry);
  // Evict oldest entries if cache grows too large
  if (executionCache.size > MAX_CACHE_SIZE) {
    const oldest = [...executionCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, executionCache.size - MAX_CACHE_SIZE);
    for (const [key] of oldest) executionCache.delete(key);
  }
  persistCache();
}

export function clearCache(): void {
  executionCache.clear();
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }
}

export function getCacheSize(): number {
  return executionCache.size;
}

// ─── Cost Estimation ──────────────────────────────────────────────────────────

/** Per-million-token pricing for supported models */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  label: string;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'deepseek-reasoner': { inputPerMillion: 0.55, outputPerMillion: 2.19, label: 'DeepSeek R1' },
  'deepseek-chat': { inputPerMillion: 0.14, outputPerMillion: 0.28, label: 'DeepSeek V3' },
  'claude-sonnet-4-20250514': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    label: 'Claude Sonnet',
  },
  'claude-haiku-4-5-20251001': {
    inputPerMillion: 0.8,
    outputPerMillion: 4.0,
    label: 'Claude Haiku',
  },
};

/** Estimate token count from character length (~4 chars per token) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Estimate cost in USD for a single execution */
export function estimateCost(
  inputChars: number,
  outputChars: number,
  model: string,
): { inputTokens: number; outputTokens: number; costUSD: number } {
  const inputTokens = Math.ceil(inputChars / 4);
  const outputTokens = Math.ceil(outputChars / 4);
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['deepseek-reasoner'];
  const costUSD =
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return { inputTokens, outputTokens, costUSD };
}

/** Estimate cost for executing N stale nodes */
export function estimateBatchCost(
  nodes: Array<{ promptLength: number; expectedOutputLength?: number }>,
  model: string,
): { totalInputTokens: number; totalOutputTokens: number; totalCostUSD: number } {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['deepseek-reasoner'];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const node of nodes) {
    const inputTokens = Math.ceil(node.promptLength / 4);
    // Estimate output as 2x input if not specified (reasonable for generation tasks)
    const outputTokens = node.expectedOutputLength
      ? Math.ceil(node.expectedOutputLength / 4)
      : inputTokens * 2;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
  }

  const totalCostUSD =
    (totalInputTokens / 1_000_000) * pricing.inputPerMillion +
    (totalOutputTokens / 1_000_000) * pricing.outputPerMillion;

  return { totalInputTokens, totalOutputTokens, totalCostUSD };
}

/** Format USD cost for display */
export function formatCost(costUSD: number): string {
  if (costUSD < 0.001) return '<$0.001';
  if (costUSD < 0.01) return `~$${costUSD.toFixed(3)}`;
  if (costUSD < 1) return `~$${costUSD.toFixed(2)}`;
  return `~$${costUSD.toFixed(2)}`;
}

// ─── Usage Stats ──────────────────────────────────────────────────────────────

export interface UsageStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cachedSkips: number;
  totalCostUSD: number;
}

export function createEmptyUsageStats(): UsageStats {
  return {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    cachedSkips: 0,
    totalCostUSD: 0,
  };
}
