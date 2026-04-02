import { describe, it, expect } from 'vitest';
import {
  getDecisionSystemPrompt,
  parseDecisionOutput,
  decisionMatchesCondition,
  findBestMatchingOption,
  scoreDecisionOptions,
  normalizeDecisionToOption,
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

// ── scoreDecisionOptions ─────────────────────────────────────────────────────

describe('scoreDecisionOptions', () => {
  it('assigns score 1.0 for exact match', () => {
    const scores = scoreDecisionOptions('approve', ['approve', 'reject', 'escalate']);
    expect(scores[0]).toEqual({ option: 'approve', score: 1.0 });
  });

  it('assigns score 0.8 for substring containment (decision contains option)', () => {
    const scores = scoreDecisionOptions('approve this request', ['approve', 'reject']);
    const approveEntry = scores.find((s) => s.option === 'approve');
    expect(approveEntry?.score).toBe(0.8);
  });

  it('assigns score 0.8 for substring containment (option contains decision)', () => {
    const scores = scoreDecisionOptions('reject', ['reject all changes', 'approve']);
    const rejectEntry = scores.find((s) => s.option === 'reject all changes');
    expect(rejectEntry?.score).toBe(0.8);
  });

  it('assigns score 0.6 for word-overlap (no substring containment)', () => {
    // "fast track" and "fast-track" don't contain each other (different separator),
    // but "fast" and "track" appear as shared words → word-overlap → 0.6
    const scores = scoreDecisionOptions('fast track approval', ['fast-track', 'standard', 'defer']);
    const entry = scores.find((s) => s.option === 'fast-track');
    expect(entry?.score).toBe(0.6);
  });

  it('assigns score 0.0 for no match', () => {
    const scores = scoreDecisionOptions('defer', ['approve', 'reject']);
    expect(scores.every((s) => s.score === 0.0)).toBe(true);
  });

  it('returns all options in result', () => {
    const opts = ['approve', 'reject', 'escalate'];
    const scores = scoreDecisionOptions('approve', opts);
    expect(scores).toHaveLength(3);
    expect(scores.map((s) => s.option).sort()).toEqual(opts.slice().sort());
  });

  it('sorts results by descending score', () => {
    const scores = scoreDecisionOptions('approve', ['reject', 'approve', 'escalate']);
    expect(scores[0].score).toBeGreaterThanOrEqual(scores[1].score);
    expect(scores[1].score).toBeGreaterThanOrEqual(scores[2].score);
  });

  it('preserves original order for tied scores', () => {
    // Both 'reject' and 'approve' have score 0 against 'defer'
    const scores = scoreDecisionOptions('defer', ['reject', 'approve']);
    const zeroScores = scores.filter((s) => s.score === 0);
    expect(zeroScores.map((s) => s.option)).toEqual(['reject', 'approve']);
  });

  it('is case-insensitive', () => {
    const scores = scoreDecisionOptions('APPROVE', ['approve', 'reject']);
    expect(scores[0]).toEqual({ option: 'approve', score: 1.0 });
  });

  it('handles empty options array', () => {
    expect(scoreDecisionOptions('approve', [])).toEqual([]);
  });

  it('exact match beats substring match', () => {
    // 'reject' should score 1.0, 'reject all' should score 0.8
    const scores = scoreDecisionOptions('reject', ['reject all', 'reject', 'approve']);
    expect(scores[0].option).toBe('reject');
    expect(scores[0].score).toBe(1.0);
    expect(scores[1].option).toBe('reject all');
    expect(scores[1].score).toBe(0.8);
  });
});

// ── normalizeDecisionToOption ─────────────────────────────────────────────────

describe('normalizeDecisionToOption', () => {
  it('returns exact option for exact match', () => {
    expect(normalizeDecisionToOption('approve', ['approve', 'reject'])).toBe('approve');
  });

  it('normalizes verbose LLM output to canonical label', () => {
    // Simulates "I'll escalate this to management" → "escalate"
    expect(
      normalizeDecisionToOption("I'll escalate this to management", [
        'approve',
        'reject',
        'escalate',
      ]),
    ).toBe('escalate');
  });

  it('returns canonical casing from options list', () => {
    // LLM says lowercase, option has mixed case — should return the option as-stored
    expect(normalizeDecisionToOption('approve', ['Approve', 'Reject'])).toBe('Approve');
  });

  it('returns null when nothing matches', () => {
    expect(normalizeDecisionToOption('defer', ['approve', 'reject'])).toBeNull();
  });

  it('returns null for empty options list', () => {
    expect(normalizeDecisionToOption('approve', [])).toBeNull();
  });

  it('prefers exact over substring match', () => {
    // "reject" exactly matches "reject", not "reject all"
    expect(normalizeDecisionToOption('reject', ['reject all', 'reject', 'approve'])).toBe('reject');
  });

  it('handles hyphenated options', () => {
    expect(normalizeDecisionToOption('fast-track', ['fast-track', 'standard', 'defer'])).toBe(
      'fast-track',
    );
  });

  it('normalizes word-overlap match when no better match exists', () => {
    expect(normalizeDecisionToOption('the review was rejected', ['approve', 'reject'])).toBe(
      'reject',
    );
  });

  it('handles single-option list', () => {
    expect(normalizeDecisionToOption('yes', ['yes'])).toBe('yes');
    expect(normalizeDecisionToOption('no', ['yes'])).toBeNull();
  });
});
