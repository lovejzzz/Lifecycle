import { describe, it, expect } from 'vitest';
import {
  getDecisionSystemPrompt,
  parseDecisionOutput,
  decisionMatchesCondition,
  findBestMatchingOption,
  scoreDecisionOptions,
  normalizeDecisionToOption,
  formatDecisionSummary,
  buildDecisionContextSection,
  DECISION_LOW_CONFIDENCE_THRESHOLD,
  DECISION_FIELD_SYNONYMS,
  DECISION_FIELD_RE,
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

  it('embeds node label when provided', () => {
    const prompt = getDecisionSystemPrompt(['yes', 'no'], 'Quality Gate');
    expect(prompt).toContain('"Quality Gate"');
  });

  it('embeds node description when provided', () => {
    const prompt = getDecisionSystemPrompt(['yes', 'no'], 'Gate', 'Check if output meets SLA');
    expect(prompt).toContain('Check if output meets SLA');
  });

  it('omits context line when no label is given', () => {
    const prompt = getDecisionSystemPrompt(['yes', 'no']);
    expect(prompt).not.toContain('Decision context:');
  });

  it('adds Rowan style hint when agentName is rowan', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject'], undefined, undefined, 'rowan');
    expect(prompt).toContain('ROWAN DECISION STYLE');
  });

  it('adds Poirot style hint when agentName is poirot', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject'], undefined, undefined, 'poirot');
    expect(prompt).toContain('POIROT DECISION STYLE');
  });

  it('is case-insensitive for agentName', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject'], undefined, undefined, 'Rowan');
    expect(prompt).toContain('ROWAN DECISION STYLE');
  });

  it('omits agent hint when no agentName is given', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject']);
    expect(prompt).not.toContain('ROWAN DECISION STYLE');
    expect(prompt).not.toContain('POIROT DECISION STYLE');
  });

  it('combines label, description, and agent hint correctly', () => {
    const prompt = getDecisionSystemPrompt(
      ['approve', 'reject', 'defer'],
      'Release Gate',
      'Decide whether to release to production',
      'poirot',
    );
    expect(prompt).toContain('"Release Gate"');
    expect(prompt).toContain('Decide whether to release to production');
    expect(prompt).toContain('POIROT DECISION STYLE');
    expect(prompt).toContain('ALTERNATIVES:'); // N>2 options
  });
});

// ── DECISION_LOW_CONFIDENCE_THRESHOLD ────────────────────────────────────────

describe('DECISION_LOW_CONFIDENCE_THRESHOLD', () => {
  it('is a number between 0 and 1', () => {
    expect(typeof DECISION_LOW_CONFIDENCE_THRESHOLD).toBe('number');
    expect(DECISION_LOW_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(DECISION_LOW_CONFIDENCE_THRESHOLD).toBeLessThan(1);
  });

  it('is 0.5 (retry is triggered on genuine uncertainty)', () => {
    expect(DECISION_LOW_CONFIDENCE_THRESHOLD).toBe(0.5);
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

  // ── verbal confidence ──
  it('maps verbal "high" confidence to ~0.85', () => {
    const output = 'DECISION: approve\nCONFIDENCE: high\nREASONING: All checks pass.';
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBeCloseTo(0.85);
  });

  it('maps verbal "low" confidence to ~0.3', () => {
    const output = 'DECISION: reject\nCONFIDENCE: low\nREASONING: Insufficient evidence.';
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBeCloseTo(0.3);
  });

  it('maps verbal "medium" confidence to ~0.65', () => {
    const output = 'DECISION: escalate\nCONFIDENCE: medium\nREASONING: Mixed signals.';
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBeCloseTo(0.65);
  });

  it('maps verbal "certain" confidence to ~0.95', () => {
    const output = 'DECISION: approve\nCONFIDENCE: certain\nREASONING: No doubts.';
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBeCloseTo(0.95);
  });

  it('maps verbal "very high" confidence to ~0.95', () => {
    const output = 'DECISION: approve\nCONFIDENCE: very high\nREASONING: All signals agree.';
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBeCloseTo(0.95);
  });

  it('maps verbal "uncertain" confidence to ~0.3', () => {
    const output = 'DECISION: defer\nCONFIDENCE: uncertain\nREASONING: Conflicting signals.';
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBeCloseTo(0.3);
  });

  it('maps verbal "confident" to ~0.85', () => {
    const output = 'DECISION: approve\nCONFIDENCE: confident\nREASONING: Strong evidence.';
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBeCloseTo(0.85);
  });

  it('returns undefined confidence for an unrecognized verbal term', () => {
    const output = 'DECISION: approve\nCONFIDENCE: maybe\nREASONING: Not sure.';
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBeUndefined();
  });

  it('still parses decision and reasoning when verbal confidence is present', () => {
    const output = 'DECISION: reject\nCONFIDENCE: low\nREASONING: Tests failed.';
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('reject');
    expect(result.reasoning).toBe('Tests failed.');
    expect(result.confidence).toBeCloseTo(0.3);
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

// ── parseDecisionOutput — multi-line REASONING ───────────────────────────────

describe('parseDecisionOutput — multi-line REASONING', () => {
  it('captures multi-line reasoning collapsed to single line', () => {
    const output = `DECISION: approve
CONFIDENCE: 0.85
REASONING: The code quality meets all standards.
No critical issues were found in the review.
ALTERNATIVES: none`;
    const result = parseDecisionOutput(output);
    expect(result.reasoning).toBe(
      'The code quality meets all standards. No critical issues were found in the review.',
    );
  });

  it('still works for single-line reasoning', () => {
    const output = `DECISION: reject
CONFIDENCE: 0.9
REASONING: Too many open issues.`;
    const result = parseDecisionOutput(output);
    expect(result.reasoning).toBe('Too many open issues.');
  });

  it('stops REASONING capture at next structural field', () => {
    const output = `DECISION: escalate
CONFIDENCE: 0.6
REASONING: Evidence is ambiguous.
Further review needed before committing.
ALTERNATIVES: approve, defer`;
    const result = parseDecisionOutput(output);
    expect(result.reasoning).toBe(
      'Evidence is ambiguous. Further review needed before committing.',
    );
    // ALTERNATIVES should not bleed into reasoning
    expect(result.reasoning).not.toContain('approve');
    expect(result.alternatives).toEqual(['approve', 'defer']);
  });

  it('captures multi-line ALTERNATIVES correctly', () => {
    const output = `DECISION: approve
CONFIDENCE: 0.75
REASONING: Most criteria met.
ALTERNATIVES: escalate,
defer`;
    const result = parseDecisionOutput(output);
    // Both alternatives should be parsed (cross-line, comma-separated)
    expect(result.alternatives).toContain('escalate');
    expect(result.alternatives).toContain('defer');
  });
});

// ── getDecisionSystemPrompt — evidence-weighing for N>2 ──────────────────────

describe('getDecisionSystemPrompt — N>2 evidence weighing', () => {
  it('includes evidence-weighing instruction for N>2 options', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject', 'escalate']);
    expect(prompt).toContain('silently weigh');
  });

  it('instructs REASONING to explain why chosen option beats closest competitor (N>2)', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject', 'defer']);
    expect(prompt).toContain('closest competitor');
  });

  it('does NOT include evidence-weighing instruction for binary decisions', () => {
    const prompt = getDecisionSystemPrompt(['yes', 'no']);
    expect(prompt).not.toContain('silently weigh');
    expect(prompt).not.toContain('closest competitor');
  });

  it('REASONING format says 1–3 sentences for N>2 (richer explanation allowed)', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject', 'defer']);
    expect(prompt).toContain('one to three sentences');
  });

  it('REASONING format says one concise sentence for binary decisions', () => {
    const prompt = getDecisionSystemPrompt(['yes', 'no']);
    expect(prompt).toContain('one concise sentence');
    expect(prompt).not.toContain('one to three sentences');
  });
});

// ── formatDecisionSummary ─────────────────────────────────────────────────────

describe('formatDecisionSummary', () => {
  it('formats decision with confidence and reasoning', () => {
    const result = formatDecisionSummary('approve', 0.92, 'All checks pass.');
    expect(result).toBe('approve — All checks pass. (92%)');
  });

  it('formats decision with confidence only', () => {
    expect(formatDecisionSummary('reject', 0.78)).toBe('reject (78%)');
  });

  it('formats decision with reasoning only', () => {
    const result = formatDecisionSummary('escalate', undefined, 'Unclear outcome.');
    expect(result).toBe('escalate — Unclear outcome.');
  });

  it('returns bare decision label when no confidence or reasoning', () => {
    expect(formatDecisionSummary('approve')).toBe('approve');
  });

  it('rounds confidence to nearest percent', () => {
    expect(formatDecisionSummary('yes', 0.999)).toBe('yes (100%)');
    expect(formatDecisionSummary('no', 0.501)).toBe('no (50%)');
  });

  it('truncates long reasoning to 80 chars with ellipsis', () => {
    const longReasoning = 'A'.repeat(90);
    const result = formatDecisionSummary('approve', 0.8, longReasoning);
    expect(result).toContain('…');
    // Total reasoning portion should not exceed 83 chars (80 + "…")
    const reasoningPart = result.replace('approve — ', '').replace(' (80%)', '');
    expect(reasoningPart.length).toBeLessThanOrEqual(83);
  });

  it('strips trailing punctuation from reasoning before appending period', () => {
    // Trailing "." on short reasoning should not produce double period
    const result = formatDecisionSummary('reject', 0.7, 'Not enough tests.');
    expect(result).toBe('reject — Not enough tests. (70%)');
  });

  it('handles 0% and 100% confidence extremes', () => {
    expect(formatDecisionSummary('defer', 0.0)).toBe('defer (0%)');
    expect(formatDecisionSummary('approve', 1.0)).toBe('approve (100%)');
  });
});

// ── parseDecisionOutput — JSON format fallback ────────────────────────────────

describe('parseDecisionOutput — JSON format', () => {
  it('parses a bare JSON object with decision + confidence + reasoning', () => {
    const output = JSON.stringify({
      decision: 'approve',
      confidence: 0.92,
      reasoning: 'All criteria satisfied.',
    });
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('approve');
    expect(result.confidence).toBeCloseTo(0.92);
    expect(result.reasoning).toBe('All criteria satisfied.');
  });

  it('parses JSON with alternatives as array', () => {
    const output = JSON.stringify({
      decision: 'reject',
      confidence: 0.8,
      reasoning: 'Too many issues.',
      alternatives: ['escalate', 'defer'],
    });
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('reject');
    expect(result.alternatives).toEqual(['escalate', 'defer']);
  });

  it('parses JSON with alternatives as comma-separated string', () => {
    const output = JSON.stringify({
      decision: 'escalate',
      confidence: 0.65,
      alternatives: 'approve, defer',
    });
    const result = parseDecisionOutput(output);
    expect(result.alternatives).toContain('approve');
    expect(result.alternatives).toContain('defer');
  });

  it('parses JSON inside a ```json fenced block', () => {
    const output =
      '```json\n' +
      JSON.stringify({ decision: 'approve', confidence: 0.88, reasoning: 'Looks good.' }) +
      '\n```';
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('approve');
    expect(result.confidence).toBeCloseTo(0.88);
  });

  it('treats JSON confidence > 2 as percentage (e.g. 87 → 0.87)', () => {
    const output = JSON.stringify({ decision: 'approve', confidence: 87 });
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBeCloseTo(0.87);
  });

  it('clamps JSON confidence to 0–1 range', () => {
    const output = JSON.stringify({ decision: 'ok', confidence: 2.5 });
    const result = parseDecisionOutput(output);
    expect(result.confidence).toBe(1);
  });

  it('returns undefined alternatives when JSON alternatives is "none"', () => {
    const output = JSON.stringify({
      decision: 'reject',
      confidence: 0.95,
      alternatives: ['none'],
    });
    const result = parseDecisionOutput(output);
    expect(result.alternatives).toBeUndefined();
  });

  it('strips inline confidence annotation from JSON decision value', () => {
    const output = JSON.stringify({ decision: 'approve (confidence: 0.9)', confidence: 0.9 });
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('approve');
    expect(result.decision).not.toContain('confidence');
  });

  it('falls through to structured text parsing when JSON has no decision key', () => {
    const output = JSON.stringify({ choice: 'approve', score: 0.9 });
    // No "decision" key — should fall through to text parsing (no DECISION: line = first-line fallback)
    const result = parseDecisionOutput(output);
    // First line of stringified JSON is the whole object — it won't cleanly parse as "approve"
    // but the function must not throw
    expect(result).toHaveProperty('decision');
  });

  it('falls through gracefully when text is not JSON', () => {
    const output = 'DECISION: approve\nCONFIDENCE: 0.9\nREASONING: Looks good.';
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('approve');
    expect(result.confidence).toBeCloseTo(0.9);
  });
});

// ── buildDecisionContextSection ───────────────────────────────────────────────

describe('buildDecisionContextSection', () => {
  it('returns empty string for empty context', () => {
    expect(buildDecisionContextSection({})).toBe('');
  });

  it('formats prior decisions under "Prior decisions" heading', () => {
    const ctx = { 'decision:Quality Gate': 'approve (confidence: 0.92)' };
    const result = buildDecisionContextSection(ctx);
    expect(result).toContain('Prior decisions');
    expect(result).toContain('Quality Gate');
    expect(result).toContain('approve (confidence: 0.92)');
  });

  it('formats non-decision entries under "Stored context" heading', () => {
    const ctx = { 'api-result': 'success', score: '95' };
    const result = buildDecisionContextSection(ctx);
    expect(result).toContain('Stored context');
    expect(result).toContain('api-result');
    expect(result).toContain('success');
  });

  it('separates decision keys from data keys', () => {
    const ctx = {
      'decision:Gate A': 'approve',
      'user-score': '88',
    };
    const result = buildDecisionContextSection(ctx);
    expect(result).toContain('Prior decisions');
    expect(result).toContain('Stored context');
  });

  it('truncates long data values at 150 chars', () => {
    const longValue = 'x'.repeat(200);
    const ctx = { 'big-data': longValue };
    const result = buildDecisionContextSection(ctx);
    expect(result).toContain('…');
    // The truncated value plus the key/label should not include the full 200 chars
    expect(result).not.toContain('x'.repeat(200));
  });

  it('respects maxEntries cap', () => {
    const ctx: Record<string, string> = {};
    for (let i = 0; i < 20; i++) ctx[`key-${i}`] = `value-${i}`;
    const result = buildDecisionContextSection(ctx, 3);
    // With cap=3, only 3 entries should be included → key-0, key-1, key-2
    expect(result).toContain('key-0');
    expect(result).not.toContain('key-4');
  });

  it('includes a routing instruction at the end', () => {
    const ctx = { 'decision:Gate': 'approve' };
    const result = buildDecisionContextSection(ctx);
    expect(result).toContain('routing decision');
  });

  it('prioritizes decision entries over data entries when capping', () => {
    // 6 data entries + 2 decision entries, cap = 4
    // Expected: both decision entries + 2 data entries (not 4 data entries)
    const ctx: Record<string, unknown> = {
      'data-0': 'val-0',
      'data-1': 'val-1',
      'data-2': 'val-2',
      'data-3': 'val-3',
      'data-4': 'val-4',
      'data-5': 'val-5',
      'decision:Gate A': 'approve',
      'decision:Gate B': 'reject',
    };
    const result = buildDecisionContextSection(ctx, 4);
    // Both decision entries must be present
    expect(result).toContain('Gate A');
    expect(result).toContain('Gate B');
    // Only 2 data entries fit (cap=4, 2 decision slots used)
    expect(result).toContain('data-0');
    expect(result).toContain('data-1');
    expect(result).not.toContain('data-4');
    expect(result).not.toContain('data-5');
  });

  it('includes all decision entries even when they exceed maxEntries alone', () => {
    const ctx: Record<string, unknown> = {
      'decision:Gate 1': 'approve',
      'decision:Gate 2': 'reject',
      'decision:Gate 3': 'escalate',
      'data-key': 'some value',
    };
    // maxEntries=2 — decision entries (3) exceed the cap, but we still take up to maxEntries of them
    const result = buildDecisionContextSection(ctx, 2);
    // Gate 1 and Gate 2 should be present (first 2 of 3 decision entries)
    expect(result).toContain('Gate 1');
    expect(result).toContain('Gate 2');
    // data-key should be dropped (no room)
    expect(result).not.toContain('data-key');
  });

  it('fills all slots with data when there are no decision entries', () => {
    const ctx: Record<string, unknown> = {
      alpha: 'a',
      beta: 'b',
      gamma: 'c',
    };
    const result = buildDecisionContextSection(ctx, 2);
    expect(result).toContain('alpha');
    expect(result).toContain('beta');
    expect(result).not.toContain('gamma');
  });
});

// ── getDecisionSystemPrompt — upstream error/skip guidance ───────────────────

describe('getDecisionSystemPrompt — upstream error/skip guidance', () => {
  it('includes [ERROR] handling instruction in all prompts', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject']);
    expect(prompt).toContain('[ERROR]');
  });

  it('includes [SKIPPED] handling instruction in all prompts', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject']);
    expect(prompt).toContain('[SKIPPED]');
  });

  it('instructs to prefer error-handling branches when upstream failures present', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject', 'fallback']);
    expect(prompt).toMatch(/error.handling|fallback/i);
  });

  it('error/skip guidance is present regardless of agent name', () => {
    const rowenPrompt = getDecisionSystemPrompt(['yes', 'no'], undefined, undefined, 'rowan');
    const poirotPrompt = getDecisionSystemPrompt(['yes', 'no'], undefined, undefined, 'poirot');
    expect(rowenPrompt).toContain('[ERROR]');
    expect(poirotPrompt).toContain('[SKIPPED]');
  });
});

// ── getDecisionSystemPrompt — sharedContext injection ────────────────────────

describe('getDecisionSystemPrompt — sharedContext', () => {
  it('injects prior decisions when sharedContext has decision keys', () => {
    const ctx = { 'decision:Risk Assessment': 'low-risk (confidence: 0.91)' };
    const prompt = getDecisionSystemPrompt(
      ['approve', 'reject'],
      undefined,
      undefined,
      undefined,
      ctx,
    );
    expect(prompt).toContain('Workflow Context');
    expect(prompt).toContain('Risk Assessment');
    expect(prompt).toContain('low-risk');
  });

  it('injects stored data when sharedContext has non-decision keys', () => {
    const ctx = { 'quality-score': '95', 'test-pass-rate': '0.98' };
    const prompt = getDecisionSystemPrompt(
      ['approve', 'reject'],
      undefined,
      undefined,
      undefined,
      ctx,
    );
    expect(prompt).toContain('quality-score');
    expect(prompt).toContain('95');
  });

  it('omits context section when sharedContext is empty', () => {
    const prompt = getDecisionSystemPrompt(
      ['approve', 'reject'],
      undefined,
      undefined,
      undefined,
      {},
    );
    expect(prompt).not.toContain('Workflow Context');
  });

  it('omits context section when sharedContext is undefined', () => {
    const prompt = getDecisionSystemPrompt(['approve', 'reject']);
    expect(prompt).not.toContain('Workflow Context');
  });

  it('combines context with agent hint and node label correctly', () => {
    const ctx = { 'decision:Prior Gate': 'passed' };
    const prompt = getDecisionSystemPrompt(
      ['approve', 'reject'],
      'Release Gate',
      undefined,
      'rowan',
      ctx,
    );
    expect(prompt).toContain('"Release Gate"');
    expect(prompt).toContain('ROWAN DECISION STYLE');
    expect(prompt).toContain('Prior Gate');
    expect(prompt).toContain('passed');
  });
});

// ── DECISION_FIELD_RE / DECISION_FIELD_SYNONYMS ──────────────────────────────

describe('DECISION_FIELD_RE', () => {
  it('matches DECISION: on any line', () => {
    expect(DECISION_FIELD_RE.test('DECISION: approve')).toBe(true);
  });

  it('matches VERDICT: on any line', () => {
    const m = 'Some preamble\nVERDICT: approve'.match(DECISION_FIELD_RE);
    expect(m?.[1]).toBe('approve');
  });

  it('matches OUTCOME: on any line', () => {
    const m = 'OUTCOME: reject\nCONFIDENCE: 0.9'.match(DECISION_FIELD_RE);
    expect(m?.[1]).toBe('reject');
  });

  it('matches CHOICE: on any line', () => {
    const m = 'CHOICE: escalate'.match(DECISION_FIELD_RE);
    expect(m?.[1]).toBe('escalate');
  });

  it('matches ROUTE: on any line', () => {
    const m = 'ROUTE: fast-track'.match(DECISION_FIELD_RE);
    expect(m?.[1]).toBe('fast-track');
  });

  it('matches PATH: on any line', () => {
    const m = 'PATH: defer'.match(DECISION_FIELD_RE);
    expect(m?.[1]).toBe('defer');
  });

  it('is case-insensitive', () => {
    expect(DECISION_FIELD_RE.test('verdict: approve')).toBe(true);
    expect(DECISION_FIELD_RE.test('Verdict: approve')).toBe(true);
  });

  it('captures value after the colon', () => {
    const m = 'VERDICT: approve (confidence: 0.9)'.match(DECISION_FIELD_RE);
    expect(m?.[1]).toBe('approve (confidence: 0.9)');
  });

  it('exports all expected synonyms', () => {
    expect(DECISION_FIELD_SYNONYMS).toContain('DECISION');
    expect(DECISION_FIELD_SYNONYMS).toContain('VERDICT');
    expect(DECISION_FIELD_SYNONYMS).toContain('OUTCOME');
    expect(DECISION_FIELD_SYNONYMS).toContain('CHOICE');
    expect(DECISION_FIELD_SYNONYMS).toContain('ROUTE');
    expect(DECISION_FIELD_SYNONYMS).toContain('PATH');
  });
});

// ── parseDecisionOutput — synonym field labels ────────────────────────────────

describe('parseDecisionOutput — synonym field labels', () => {
  it('parses VERDICT: as the decision field', () => {
    const output = `VERDICT: approve
CONFIDENCE: 0.88
REASONING: Code meets all quality gates.`;
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('approve');
    expect(result.confidence).toBeCloseTo(0.88);
    expect(result.reasoning).toBe('Code meets all quality gates.');
  });

  it('parses OUTCOME: as the decision field', () => {
    const output = `OUTCOME: reject
CONFIDENCE: 0.91
REASONING: Tests are failing.`;
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('reject');
    expect(result.confidence).toBeCloseTo(0.91);
  });

  it('parses CHOICE: as the decision field (mid-response, not just first line)', () => {
    const output = `Based on the evidence:
CHOICE: escalate
CONFIDENCE: 0.7
REASONING: Ambiguous signals — escalation is safest.`;
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('escalate');
    expect(result.confidence).toBeCloseTo(0.7);
  });

  it('parses ROUTE: as the decision field', () => {
    const output = `ROUTE: fast-track
CONFIDENCE: 0.95
REASONING: All checks passed without issues.`;
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('fast-track');
    expect(result.confidence).toBeCloseTo(0.95);
  });

  it('parses PATH: as the decision field', () => {
    const output = `PATH: defer
CONFIDENCE: 0.6
REASONING: Missing data makes decision premature.`;
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('defer');
  });

  it('strips inline confidence annotation from synonym field', () => {
    const output = `VERDICT: approve (confidence: 0.9)
CONFIDENCE: 0.9
REASONING: Strong evidence.`;
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('approve');
    expect(result.decision).not.toContain('confidence');
  });

  it('parses ALTERNATIVES when using synonym field', () => {
    const output = `VERDICT: approve
CONFIDENCE: 0.75
REASONING: Mostly good.
ALTERNATIVES: defer, escalate`;
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('approve');
    expect(result.alternatives).toContain('defer');
    expect(result.alternatives).toContain('escalate');
  });

  it('is case-insensitive for synonym fields', () => {
    const output = `verdict: approve
confidence: 0.8
reasoning: Looks fine.`;
    const result = parseDecisionOutput(output);
    expect(result.decision).toBe('approve');
    expect(result.confidence).toBeCloseTo(0.8);
  });
});

// ── parseDecisionOutput — trailing prose truncation ──────────────────────────

describe('parseDecisionOutput — trailing prose truncation in REASONING', () => {
  it('stops REASONING capture at a blank line', () => {
    const output = `DECISION: approve
CONFIDENCE: 0.85
REASONING: All quality gates passed.

I hope this analysis was helpful! Let me know if you need further clarification.`;
    const result = parseDecisionOutput(output);
    expect(result.reasoning).toBe('All quality gates passed.');
    expect(result.reasoning).not.toContain('I hope');
    expect(result.reasoning).not.toContain('helpful');
  });

  it('stops REASONING capture at a blank line with whitespace', () => {
    const output = `DECISION: reject
CONFIDENCE: 0.9
REASONING: Tests are failing with 12 errors.

Please fix the issues above before retrying.`;
    const result = parseDecisionOutput(output);
    expect(result.reasoning).toBe('Tests are failing with 12 errors.');
    expect(result.reasoning).not.toContain('Please fix');
  });

  it('still captures multi-line reasoning that has no blank line separator', () => {
    const output = `DECISION: escalate
CONFIDENCE: 0.65
REASONING: Evidence is ambiguous.
Multiple signals are conflicting.`;
    const result = parseDecisionOutput(output);
    // Both lines should be captured (no blank line separating them)
    expect(result.reasoning).toContain('ambiguous');
    expect(result.reasoning).toContain('conflicting');
  });

  it('still stops REASONING at next structural field even without blank line', () => {
    const output = `DECISION: approve
CONFIDENCE: 0.8
REASONING: Criteria met.
ALTERNATIVES: defer, escalate`;
    const result = parseDecisionOutput(output);
    expect(result.reasoning).toBe('Criteria met.');
    expect(result.alternatives).toContain('defer');
  });

  it('handles blank line before ALTERNATIVES correctly (uses struct stop)', () => {
    // The blank line appears between REASONING and ALTERNATIVES.
    // struct stop (ALTERNATIVES:) comes first, so reasoning captures correctly.
    const output = `DECISION: approve
CONFIDENCE: 0.9
REASONING: All good.

ALTERNATIVES: defer`;
    const result = parseDecisionOutput(output);
    // Blank line stop happens first (before ALTERNATIVES:), so reasoning is clean
    expect(result.reasoning).toBe('All good.');
  });
});

// ── formatDecisionSummary — with alternatives ─────────────────────────────────

describe('formatDecisionSummary — alternatives display', () => {
  it('appends top alternative when alternatives are provided', () => {
    const result = formatDecisionSummary('escalate', 0.65, 'Mixed signals.', ['defer', 'approve']);
    expect(result).toContain('[alt: defer]');
    expect(result).not.toContain('approve'); // only top alt shown
  });

  it('appends top alternative with confidence but no reasoning', () => {
    const result = formatDecisionSummary('approve', 0.75, undefined, ['defer']);
    expect(result).toBe('approve (75%) [alt: defer]');
  });

  it('appends top alternative with reasoning but no confidence', () => {
    const result = formatDecisionSummary('reject', undefined, 'Tests failed.', ['escalate']);
    expect(result).toBe('reject — Tests failed. [alt: escalate]');
  });

  it('appends top alternative with no confidence and no reasoning', () => {
    const result = formatDecisionSummary('defer', undefined, undefined, ['approve']);
    expect(result).toBe('defer [alt: approve]');
  });

  it('returns bare decision label with no suffix when alternatives list is empty', () => {
    const result = formatDecisionSummary('approve', undefined, undefined, []);
    expect(result).toBe('approve');
  });

  it('ignores alternatives when first entry is "none"', () => {
    const result = formatDecisionSummary('approve', 0.9, undefined, ['none']);
    expect(result).toBe('approve (90%)');
  });

  it('ignores alternatives when first entry is "NONE" (case-insensitive)', () => {
    const result = formatDecisionSummary('approve', 0.9, undefined, ['NONE']);
    expect(result).toBe('approve (90%)');
  });

  it('omits alt suffix when alternatives parameter is undefined', () => {
    const result = formatDecisionSummary('approve', 0.9, 'Looks good.');
    // Existing behaviour unchanged — no [alt: ...] appended
    expect(result).toBe('approve — Looks good. (90%)');
    expect(result).not.toContain('alt');
  });

  it('shows only the first alternative even when multiple are provided', () => {
    const result = formatDecisionSummary('escalate', 0.7, undefined, [
      'defer',
      'approve',
      'reject',
    ]);
    expect(result).toContain('[alt: defer]');
    expect(result).not.toContain('approve');
    expect(result).not.toContain('reject');
  });

  it('formats complete N-way decision summary correctly', () => {
    const result = formatDecisionSummary('escalate', 0.65, 'Mixed signals.', ['defer', 'approve']);
    expect(result).toBe('escalate — Mixed signals. (65%) [alt: defer]');
  });
});
