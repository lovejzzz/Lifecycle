import { describe, it, expect } from 'vitest';
import {
  getDecisionSystemPrompt,
  parseDecisionOutput,
  decisionMatchesCondition,
  findBestMatchingOption,
} from '../decision';

// ── getDecisionSystemPrompt ──────────────────────────────────────────────────

describe('getDecisionSystemPrompt', () => {
  it('includes all options in the prompt', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject', 'escalate']);
    expect(prompt).toContain('1. approve');
    expect(prompt).toContain('2. reject');
    expect(prompt).toContain('3. escalate');
  });

  it('includes DECISION/CONFIDENCE/REASONING format', () => {
    const prompt = getDecisionSystemPrompt(['yes', 'no']);
    expect(prompt).toContain('DECISION:');
    expect(prompt).toContain('CONFIDENCE:');
    expect(prompt).toContain('REASONING:');
  });

  it('includes ALTERNATIVES for N>2 options', () => {
    const prompt = getDecisionSystemPrompt(['a', 'b', 'c']);
    expect(prompt).toContain('ALTERNATIVES:');
  });

  it('does NOT include ALTERNATIVES for binary decisions', () => {
    const prompt = getDecisionSystemPrompt(['yes', 'no']);
    expect(prompt).not.toContain('ALTERNATIVES:');
  });

  it('lists option names in rules section', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject']);
    expect(prompt).toContain('"approve"');
    expect(prompt).toContain('"reject"');
  });
});

// ── parseDecisionOutput ──────────────────────────────────────────────────────

describe('parseDecisionOutput', () => {
  it('parses a clean structured response', () => {
    const output = `DECISION: approve
CONFIDENCE: 0.9
REASONING: The code quality meets all standards.`;
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('approve');
    expect(result.confidence).toBeCloseTo(0.9);
    expect(result.reasoning).toBe('The code quality meets all standards.');
  });

  it('parses percentage confidence', () => {
    const output = `DECISION: reject
CONFIDENCE: 87%
REASONING: Too many open issues.`;
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBeCloseTo(0.87);
  });

  it('strips inline confidence annotation from decision line', () => {
    const output = `DECISION: approve (confidence: 0.92)
CONFIDENCE: 0.92
REASONING: All checks pass.`;
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('approve');
    expect(result.decision).not.toContain('confidence');
  });

  it('handles fallback when no DECISION: prefix (first line)', () => {
    const output = 'escalate\nCONFIDENCE: 0.5\nREASONING: Unclear situation.';
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('escalate');
  });

  it('handles CHOICE: prefix as fallback', () => {
    const output = 'CHOICE: proceed\nCONFIDENCE: 0.8\nREASONING: Data looks good.';
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('proceed');
  });

  it('parses ALTERNATIVES for N-way decisions', () => {
    const output = `DECISION: approve
CONFIDENCE: 0.75
REASONING: Most criteria met.
ALTERNATIVES: escalate, defer`;
    const result = parseDecisionOutput(output);
    expect(result.alternatives).toEqual(['escalate', 'defer']);
  });

  it('returns no alternatives when ALTERNATIVES is "none"', () => {
    const output = `DECISION: reject
CONFIDENCE: 0.95
REASONING: Clear failure.
ALTERNATIVES: none`;
    const result = parseDecisionOutput(output);
    expect(result.alternatives).toBeUndefined();
  });

  it('returns undefined confidence when not present', () => {
    const output = 'DECISION: approve\nREASONING: Looks fine.';
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBeUndefined();
  });

  it('clamps confidence to 0–1 range', () => {
    const output = 'DECISION: ok\nCONFIDENCE: 1.5\nREASONING: Overly confident LLM.';
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBe(1);
  });

  it('handles case-insensitive DECISION label', () => {
    const output = 'decision: approve\nconfidence: 0.8\nreasoning: Seems good.';
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('approve');
    expect(result.confidence).toBeCloseTo(0.8);
  });
});

// ── decisionMatchesCondition ─────────────────────────────────────────────────

describe('decisionMatchesCondition', () => {
  it('matches exact values (case-insensitive)', () => {
    expect(decisionMatchesCondition('approve', 'approve')).toBe(true);
    expect(decisionMatchesCondition('APPROVE', 'approve')).toBe(true);
    expect(decisionMatchesCondition('Approve', 'APPROVE')).toBe(true);
  });

  it('matches when decision contains condition value', () => {
    expect(decisionMatchesCondition('approve the request', 'approve')).toBe(true);
  });

  it('matches when condition value contains decision', () => {
    expect(decisionMatchesCondition('approve', 'approve the request')).toBe(true);
  });

  it('matches via word overlap', () => {
    expect(decisionMatchesCondition('escalate to manager', 'escalate')).toBe(true);
    expect(decisionMatchesCondition('reject because quality', 'reject')).toBe(true);
  });

  it('does not match unrelated values', () => {
    expect(decisionMatchesCondition('approve', 'reject')).toBe(false);
    expect(decisionMatchesCondition('yes', 'no')).toBe(false);
  });

  it('handles hyphenated options', () => {
    expect(decisionMatchesCondition('fast-track', 'fast-track')).toBe(true);
    expect(decisionMatchesCondition('fast track', 'fast-track')).toBe(true);
  });
});

// ── findBestMatchingOption ───────────────────────────────────────────────────

describe('findBestMatchingOption', () => {
  const options = ['approve', 'reject', 'escalate'];

  it('finds exact match', () => {
    expect(findBestMatchingOption('approve', options)).toBe('approve');
  });

  it('finds fuzzy match via substring containment', () => {
    // 'approve this' contains 'approve' as a substring
    expect(findBestMatchingOption('approve this request', options)).toBe('approve');
  });

  it('returns null for no match', () => {
    expect(findBestMatchingOption('defer', options)).toBeNull();
  });

  it('prefers exact over fuzzy', () => {
    const opts = ['reject', 'reject all', 'approve'];
    expect(findBestMatchingOption('reject', opts)).toBe('reject');
  });
});
