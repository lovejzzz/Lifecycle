/**
 * Tests for cache.ts — hashing, cache store, cost estimation, usage stats.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  sha256,
  buildCacheKey,
  getCacheEntry,
  setCacheEntry,
  clearCache,
  getCacheSize,
  estimateTokens,
  estimateCost,
  estimateBatchCost,
  formatCost,
  createEmptyUsageStats,
  MODEL_PRICING,
} from '../cache';

// ─── sha256 ──────────────────────────────────────────────────────────────────

describe('sha256', () => {
  it('returns a hex string', async () => {
    const hash = await sha256('hello world');
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('produces consistent hashes for same input', async () => {
    const a = await sha256('test input');
    const b = await sha256('test input');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await sha256('input A');
    const b = await sha256('input B');
    expect(a).not.toBe(b);
  });

  it('handles empty string', async () => {
    const hash = await sha256('');
    expect(hash).toBeTruthy();
  });

  it('handles long strings', async () => {
    const hash = await sha256('x'.repeat(100_000));
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

// ─── buildCacheKey ───────────────────────────────────────────────────────────

describe('buildCacheKey', () => {
  it('includes all parts in the key', () => {
    const key = buildCacheKey({
      nodeId: 'n1',
      prompt: 'Generate a lesson plan',
      upstreamResults: ['result1', 'result2'],
      model: 'deepseek-reasoner',
      category: 'process',
      content: 'Some content',
    });
    expect(key).toContain('n1');
    expect(key).toContain('Generate a lesson plan');
    expect(key).toContain('result1');
    expect(key).toContain('result2');
    expect(key).toContain('deepseek-reasoner');
    expect(key).toContain('process');
    expect(key).toContain('Some content');
  });

  it('sorts upstream results for determinism', () => {
    const a = buildCacheKey({
      nodeId: 'n1',
      prompt: 'p',
      upstreamResults: ['b', 'a'],
      model: 'm',
      category: 'c',
    });
    const b = buildCacheKey({
      nodeId: 'n1',
      prompt: 'p',
      upstreamResults: ['a', 'b'],
      model: 'm',
      category: 'c',
    });
    expect(a).toBe(b);
  });

  it('handles missing content', () => {
    const key = buildCacheKey({
      nodeId: 'n1',
      prompt: 'p',
      upstreamResults: [],
      model: 'm',
      category: 'c',
    });
    expect(key).toBeTruthy();
  });

  it('different models produce different keys', () => {
    const base = { nodeId: 'n1', prompt: 'p', upstreamResults: [], category: 'c' };
    const a = buildCacheKey({ ...base, model: 'deepseek-reasoner' });
    const b = buildCacheKey({ ...base, model: 'deepseek-chat' });
    expect(a).not.toBe(b);
  });
});

// ─── Cache Store ─────────────────────────────────────────────────────────────

describe('cache store', () => {
  beforeEach(() => {
    clearCache();
  });

  it('stores and retrieves entries', () => {
    setCacheEntry('node1', {
      hash: 'abc',
      result: 'output',
      timestamp: Date.now(),
      inputTokensEstimate: 100,
      outputTokensEstimate: 200,
    });
    const entry = getCacheEntry('node1');
    expect(entry).toBeDefined();
    expect(entry!.hash).toBe('abc');
    expect(entry!.result).toBe('output');
  });

  it('returns undefined for missing entries', () => {
    expect(getCacheEntry('nonexistent')).toBeUndefined();
  });

  it('overwrites existing entries', () => {
    setCacheEntry('node1', {
      hash: 'v1',
      result: 'old',
      timestamp: 1,
      inputTokensEstimate: 10,
      outputTokensEstimate: 20,
    });
    setCacheEntry('node1', {
      hash: 'v2',
      result: 'new',
      timestamp: 2,
      inputTokensEstimate: 10,
      outputTokensEstimate: 20,
    });
    expect(getCacheEntry('node1')!.hash).toBe('v2');
    expect(getCacheSize()).toBe(1);
  });

  it('clears all entries', () => {
    setCacheEntry('a', {
      hash: 'h',
      result: 'r',
      timestamp: 1,
      inputTokensEstimate: 1,
      outputTokensEstimate: 1,
    });
    setCacheEntry('b', {
      hash: 'h',
      result: 'r',
      timestamp: 2,
      inputTokensEstimate: 1,
      outputTokensEstimate: 1,
    });
    expect(getCacheSize()).toBe(2);
    clearCache();
    expect(getCacheSize()).toBe(0);
  });

  it('evicts oldest entries when exceeding max size', () => {
    // Fill beyond max (200)
    for (let i = 0; i < 205; i++) {
      setCacheEntry(`node-${i}`, {
        hash: `h${i}`,
        result: `r${i}`,
        timestamp: i,
        inputTokensEstimate: 1,
        outputTokensEstimate: 1,
      });
    }
    expect(getCacheSize()).toBe(200);
    // Oldest entries (0-4) should be evicted
    expect(getCacheEntry('node-0')).toBeUndefined();
    expect(getCacheEntry('node-4')).toBeUndefined();
    // Newer entries should still exist
    expect(getCacheEntry('node-204')).toBeDefined();
  });
});

// ─── estimateTokens ──────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('hello world!')).toBe(3); // 12 chars / 4
  });

  it('rounds up', () => {
    expect(estimateTokens('hi')).toBe(1); // 2 chars, ceil(0.5) = 1
  });

  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

// ─── estimateCost ────────────────────────────────────────────────────────────

describe('estimateCost', () => {
  it('calculates cost for known model', () => {
    const { inputTokens, outputTokens, costUSD } = estimateCost(4000, 8000, 'deepseek-reasoner');
    expect(inputTokens).toBe(1000);
    expect(outputTokens).toBe(2000);
    // 1000/1M * 0.55 + 2000/1M * 2.19
    expect(costUSD).toBeCloseTo(0.00055 + 0.00438, 5);
  });

  it('falls back to deepseek-reasoner for unknown model', () => {
    const { costUSD } = estimateCost(4000, 4000, 'unknown-model');
    const { costUSD: expected } = estimateCost(4000, 4000, 'deepseek-reasoner');
    expect(costUSD).toBe(expected);
  });

  it('returns zero cost for zero input', () => {
    const { costUSD } = estimateCost(0, 0, 'deepseek-chat');
    expect(costUSD).toBe(0);
  });
});

// ─── estimateBatchCost ───────────────────────────────────────────────────────

describe('estimateBatchCost', () => {
  it('sums costs across multiple nodes', () => {
    const result = estimateBatchCost(
      [{ promptLength: 4000 }, { promptLength: 8000, expectedOutputLength: 4000 }],
      'deepseek-chat',
    );
    expect(result.totalInputTokens).toBe(1000 + 2000);
    expect(result.totalOutputTokens).toBe(2000 + 1000); // first defaults to 2x input
    expect(result.totalCostUSD).toBeGreaterThan(0);
  });

  it('returns zero for empty array', () => {
    const result = estimateBatchCost([], 'deepseek-chat');
    expect(result.totalCostUSD).toBe(0);
  });
});

// ─── formatCost ──────────────────────────────────────────────────────────────

describe('formatCost', () => {
  it('shows <$0.001 for tiny costs', () => {
    expect(formatCost(0.0001)).toBe('<$0.001');
  });

  it('shows 3 decimal places for sub-cent costs', () => {
    expect(formatCost(0.005)).toBe('~$0.005');
  });

  it('shows 2 decimal places for normal costs', () => {
    expect(formatCost(0.25)).toBe('~$0.25');
  });

  it('shows 2 decimal places for dollar+ costs', () => {
    expect(formatCost(3.14)).toBe('~$3.14');
  });
});

// ─── MODEL_PRICING ───────────────────────────────────────────────────────────

describe('MODEL_PRICING', () => {
  it('has pricing for all expected models', () => {
    expect(MODEL_PRICING['deepseek-reasoner']).toBeDefined();
    expect(MODEL_PRICING['deepseek-chat']).toBeDefined();
    expect(MODEL_PRICING['claude-sonnet-4-20250514']).toBeDefined();
    expect(MODEL_PRICING['claude-haiku-4-5-20251001']).toBeDefined();
  });

  it('all prices are positive', () => {
    for (const [, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.inputPerMillion).toBeGreaterThan(0);
      expect(pricing.outputPerMillion).toBeGreaterThan(0);
    }
  });
});

// ─── createEmptyUsageStats ───────────────────────────────────────────────────

describe('createEmptyUsageStats', () => {
  it('returns all zeros', () => {
    const stats = createEmptyUsageStats();
    expect(stats.totalCalls).toBe(0);
    expect(stats.totalInputTokens).toBe(0);
    expect(stats.totalOutputTokens).toBe(0);
    expect(stats.cachedSkips).toBe(0);
    expect(stats.totalCostUSD).toBe(0);
  });

  it('returns a new object each call', () => {
    const a = createEmptyUsageStats();
    const b = createEmptyUsageStats();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
