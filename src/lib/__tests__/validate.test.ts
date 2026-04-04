/**
 * Tests for validate.ts — keyword extraction, overlap scoring, output validation.
 */
import { describe, it, expect } from 'vitest';
import { extractKeywords, overlapScore, validateOutput, buildRefinementPrompt } from '../validate';
import type { ValidationWarning } from '../validate';

// ─── extractKeywords ─────────────────────────────────────────────────────────

describe('extractKeywords', () => {
  it('removes stopwords', () => {
    const kw = extractKeywords('the quick brown fox jumps over the lazy dog');
    expect(kw).toContain('quick');
    expect(kw).toContain('brown');
    expect(kw).toContain('fox');
    expect(kw).not.toContain('the');
    expect(kw).not.toContain('over');
  });

  it('lowercases and removes punctuation', () => {
    const kw = extractKeywords('Build a Content Pipeline!');
    expect(kw).toContain('build');
    expect(kw).toContain('content');
    expect(kw).toContain('pipeline');
  });

  it('filters short words (≤2 chars)', () => {
    const kw = extractKeywords('I am a go to AI');
    expect(kw).not.toContain('am');
    expect(kw).not.toContain('go');
    expect(kw).not.toContain('ai');
  });

  it('handles empty string', () => {
    expect(extractKeywords('')).toEqual([]);
  });

  it('handles numbers and hyphens', () => {
    const kw = extractKeywords('version 2.0 of data-flow');
    expect(kw).toContain('version');
    expect(kw).toContain('data-flow');
  });
});

// ─── overlapScore ────────────────────────────────────────────────────────────

describe('overlapScore', () => {
  it('returns 1 for identical texts', () => {
    expect(overlapScore('build content pipeline', 'build content pipeline')).toBe(1);
  });

  it('returns 0 for completely different texts', () => {
    expect(overlapScore('quantum physics theory', 'medieval cooking recipes')).toBe(0);
  });

  it('returns partial score for partial overlap', () => {
    const score = overlapScore(
      'build a content pipeline for courses',
      'content generation pipeline system',
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns 0 for empty input', () => {
    expect(overlapScore('', 'some text')).toBe(0);
    expect(overlapScore('some text', '')).toBe(0);
  });
});

// ─── validateOutput ──────────────────────────────────────────────────────────

describe('validateOutput', () => {
  it('warns on empty output', () => {
    const w = validateOutput('', 'artifact', 'PRD');
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe('empty-output');
  });

  it('warns on too-short artifact output', () => {
    const w = validateOutput('Short.', 'artifact', 'PRD');
    expect(w.some((w) => w.code === 'too-short')).toBe(true);
  });

  it('no too-short warning for adequate length', () => {
    const w = validateOutput('x'.repeat(300), 'artifact', 'PRD');
    expect(w.some((w) => w.code === 'too-short')).toBe(false);
  });

  it('warns on placeholder content', () => {
    const w = validateOutput('This is a [insert your name here] document', 'process', 'Plan');
    expect(w.some((w) => w.code === 'placeholder')).toBe(true);
  });

  it('warns on TODO marker', () => {
    const w = validateOutput('Step 1: TODO fill in details for the lesson plan', 'process', 'Plan');
    expect(w.some((w) => w.code === 'placeholder')).toBe(true);
  });

  it('warns on boilerplate opening', () => {
    const w = validateOutput(
      'Sure, here is your lesson plan. It covers...',
      'deliverable',
      'Lesson',
    );
    expect(w.some((w) => w.code === 'boilerplate-opening')).toBe(true);
  });

  it('warns on low keyword relevance', () => {
    const w = validateOutput(
      'The weather is sunny today with clear skies and warm temperatures throughout the afternoon.',
      'process',
      'Code Review',
      ['code', 'review', 'analysis', 'bugs', 'quality'],
    );
    expect(w.some((w) => w.code === 'low-relevance')).toBe(true);
  });

  it('no low-relevance warning when keywords match', () => {
    const w = validateOutput(
      'The code review found several bugs in the quality analysis module.',
      'process',
      'Code Review',
      ['code', 'review', 'analysis', 'bugs', 'quality'],
    );
    expect(w.some((w) => w.code === 'low-relevance')).toBe(false);
  });

  it('checks review/test for evaluation language', () => {
    const w = validateOutput(
      'The system processes data efficiently and outputs results.',
      'review',
      'QA',
    );
    expect(w.some((w) => w.code === 'missing-evaluation')).toBe(true);
  });

  it('no missing-evaluation when eval language present', () => {
    const w = validateOutput(
      'PASS: All tests passed with no errors found. The output is correct.',
      'review',
      'QA',
    );
    expect(w.some((w) => w.code === 'missing-evaluation')).toBe(false);
  });

  it('checks policy for conditional language', () => {
    const w = validateOutput('This is a general statement about security.', 'policy', 'Security');
    expect(w.some((w) => w.code === 'missing-conditions')).toBe(true);
  });

  it('no missing-conditions when conditional language present', () => {
    const w = validateOutput(
      'If the user is unauthorized, they must be denied access.',
      'policy',
      'Security',
    );
    expect(w.some((w) => w.code === 'missing-conditions')).toBe(false);
  });

  it('checks patch for code patterns', () => {
    const w = validateOutput(
      'Changed the button color to blue and updated the text.',
      'patch',
      'Fix',
    );
    expect(w.some((w) => w.code === 'missing-code')).toBe(true);
  });

  it('no missing-code when code present', () => {
    const w = validateOutput(
      '```\nconst color = "blue";\nreturn <button style={{color}}>{text}</button>;\n```',
      'patch',
      'Fix',
    );
    expect(w.some((w) => w.code === 'missing-code')).toBe(false);
  });

  it('returns no warnings for good output', () => {
    const goodOutput =
      'x'.repeat(250) +
      ' The analysis shows pass results with correct validation. Code review approved.\n\nAPPROVE';
    const w = validateOutput(goodOutput, 'review', 'QA', ['analysis', 'review', 'validation']);
    expect(w.filter((w) => w.severity === 'warning')).toHaveLength(0);
  });
});

// ─── buildRefinementPrompt ───────────────────────────────────────────────────

describe('buildRefinementPrompt', () => {
  it('returns a non-empty string for any warning', () => {
    const w: ValidationWarning[] = [
      { code: 'too-short', message: 'Output is short', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(20);
  });

  it('includes expansion instruction for too-short', () => {
    const w: ValidationWarning[] = [
      { code: 'too-short', message: 'Output is short', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt.toLowerCase()).toMatch(/expand|brief|detail/);
  });

  it('includes placeholder instruction with matched text', () => {
    const w: ValidationWarning[] = [
      {
        code: 'placeholder',
        message: 'Contains placeholder text: "[insert name]"',
        severity: 'warning',
      },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt).toMatch(/\[insert name\]/);
  });

  it('includes relevance instruction for low-relevance', () => {
    const w: ValidationWarning[] = [
      { code: 'low-relevance', message: 'Low keyword overlap', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt.toLowerCase()).toMatch(/focus|drift|tightly/);
  });

  it('includes evaluation instruction for missing-evaluation', () => {
    const w: ValidationWarning[] = [
      { code: 'missing-evaluation', message: 'Lacks evaluation language', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt.toUpperCase()).toMatch(/PASS|FAIL|APPROVE|REJECT/);
  });

  it('includes condition instruction for missing-conditions', () => {
    const w: ValidationWarning[] = [
      { code: 'missing-conditions', message: 'Lacks conditional language', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt.toUpperCase()).toMatch(/IF|MUST|SHALL|REQUIRE/);
  });

  it('includes code instruction for missing-code', () => {
    const w: ValidationWarning[] = [
      { code: 'missing-code', message: 'Lacks code patterns', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt.toLowerCase()).toMatch(/code|diff|block/);
  });

  it('handles multiple warnings in one prompt', () => {
    const warnings: ValidationWarning[] = [
      { code: 'too-short', message: 'Output is short', severity: 'warning' },
      { code: 'placeholder', message: 'Contains placeholder text: "[TODO]"', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(warnings);
    // Both issues should be reflected
    expect(prompt.toLowerCase()).toMatch(/brief|expand/);
    expect(prompt).toMatch(/\[TODO\]/);
  });

  it('ends with instruction to return only improved content', () => {
    const w: ValidationWarning[] = [
      { code: 'too-short', message: 'Output is short', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt.toLowerCase()).toMatch(/return only|no preamble|no meta/);
  });

  it('falls back to raw message for unknown warning codes', () => {
    const w: ValidationWarning[] = [
      { code: 'unknown-code', message: 'Some unknown issue', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt).toContain('Some unknown issue');
  });

  it('includes verdict marker instruction for missing-verdict-marker', () => {
    const w: ValidationWarning[] = [
      { code: 'missing-verdict-marker', message: 'Lacks verdict', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt.toUpperCase()).toMatch(/APPROVE|REJECT|BLOCK|REQUEST_CHANGES/);
    expect(prompt.toLowerCase()).toMatch(/end|final|line/);
  });

  it('includes STATUS line instruction for missing-status-line', () => {
    const w: ValidationWarning[] = [
      { code: 'missing-status-line', message: 'Lacks status', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt).toMatch(/STATUS:/);
    expect(prompt.toLowerCase()).toMatch(/state/);
  });

  it('includes BLOCKERS line instruction for missing-blockers-line', () => {
    const w: ValidationWarning[] = [
      { code: 'missing-blockers-line', message: 'Lacks blockers', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt).toMatch(/BLOCKERS:/);
    expect(prompt.toLowerCase()).toMatch(/none|dependency|dependencies/);
  });
});

// ─── validateOutput — review verdict marker ──────────────────────────────────

describe('validateOutput — review: missing-verdict-marker', () => {
  it('raises warning when review lacks any verdict keyword', () => {
    const output = 'The document looks decent. There are a few minor issues with formatting.';
    const warnings = validateOutput(output, 'review', 'Content Review');
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain('missing-verdict-marker');
  });

  it('does NOT raise warning when review contains APPROVE', () => {
    const output = 'The content meets all requirements.\n\nAPPROVE';
    const warnings = validateOutput(output, 'review', 'Content Review');
    const codes = warnings.map((w) => w.code);
    expect(codes).not.toContain('missing-verdict-marker');
  });

  it('does NOT raise warning when review contains REJECT', () => {
    const output = 'Multiple critical issues found.\n\nREJECT — see issues above.';
    const warnings = validateOutput(output, 'review', 'Content Review');
    expect(warnings.map((w) => w.code)).not.toContain('missing-verdict-marker');
  });

  it('does NOT raise warning when review contains BLOCK', () => {
    const output = 'Security vulnerability detected. BLOCK';
    const warnings = validateOutput(output, 'review', 'Content Review');
    expect(warnings.map((w) => w.code)).not.toContain('missing-verdict-marker');
  });

  it('does NOT raise warning when review contains REQUEST_CHANGES', () => {
    const output =
      'Good overall but needs revision.\n\nREQUEST_CHANGES: fix the three listed items.';
    const warnings = validateOutput(output, 'review', 'Content Review');
    expect(warnings.map((w) => w.code)).not.toContain('missing-verdict-marker');
  });

  it('raises warning severity (not info) so refinement loop fires', () => {
    const output = 'The document looks decent.';
    const warnings = validateOutput(output, 'review', 'Gate');
    const marker = warnings.find((w) => w.code === 'missing-verdict-marker');
    expect(marker).toBeDefined();
    expect(marker?.severity).toBe('warning');
  });

  it('does NOT raise missing-verdict-marker for non-review categories', () => {
    const output = 'No APPROVE or REJECT here. Just a plain description.';
    const warnings = validateOutput(output, 'action', 'Do Something');
    expect(warnings.map((w) => w.code)).not.toContain('missing-verdict-marker');
  });
});

// ─── validateOutput — state STATUS line ─────────────────────────────────────

describe('validateOutput — state: missing-status-line', () => {
  it('raises warning when state output lacks STATUS: line', () => {
    const output = 'The system is running fine. Everything looks OK. No issues detected.';
    const warnings = validateOutput(output, 'state', 'System Status');
    expect(warnings.map((w) => w.code)).toContain('missing-status-line');
  });

  it('does NOT raise warning when state output contains STATUS: line', () => {
    const output = 'The system is running fine.\n\nSTATUS: healthy';
    const warnings = validateOutput(output, 'state', 'System Status');
    expect(warnings.map((w) => w.code)).not.toContain('missing-status-line');
  });

  it('accepts STATUS: in mid-text not just at line start (multiline flag)', () => {
    const output = 'All checks passed.\nSTATUS: operational\nNext review in 24h.';
    const warnings = validateOutput(output, 'state', 'Tracker');
    expect(warnings.map((w) => w.code)).not.toContain('missing-status-line');
  });

  it('raises warning severity so refinement loop fires', () => {
    const output = 'All checks passed. No issues.';
    const warnings = validateOutput(output, 'state', 'Tracker');
    const marker = warnings.find((w) => w.code === 'missing-status-line');
    expect(marker?.severity).toBe('warning');
  });

  it('does NOT raise missing-status-line for non-state categories', () => {
    const output = 'No STATUS: line here.';
    const warnings = validateOutput(output, 'action', 'Do Something');
    expect(warnings.map((w) => w.code)).not.toContain('missing-status-line');
  });

  it('is case-insensitive for STATUS: keyword', () => {
    const output = 'status: degraded — one pod unhealthy.';
    const warnings = validateOutput(output, 'state', 'Tracker');
    expect(warnings.map((w) => w.code)).not.toContain('missing-status-line');
  });
});

// ─── validateOutput — dependency BLOCKERS line ───────────────────────────────

describe('validateOutput — dependency: missing-blockers-line', () => {
  it('raises warning when dependency output lacks BLOCKERS: line', () => {
    const output =
      'All npm packages are installed. lodash 4.17.21, react 18.2.0. Everything looks fine.';
    const warnings = validateOutput(output, 'dependency', 'Package Dependencies');
    expect(warnings.map((w) => w.code)).toContain('missing-blockers-line');
  });

  it('does NOT raise warning when output contains BLOCKERS: none', () => {
    const output = 'All packages resolved.\n\nBLOCKERS: none';
    const warnings = validateOutput(output, 'dependency', 'Package Dependencies');
    expect(warnings.map((w) => w.code)).not.toContain('missing-blockers-line');
  });

  it('does NOT raise warning when output contains BLOCKERS: with a description', () => {
    const output = 'Issues found:\n\nBLOCKERS: missing API credentials for payment-service';
    const warnings = validateOutput(output, 'dependency', 'Deps');
    expect(warnings.map((w) => w.code)).not.toContain('missing-blockers-line');
  });

  it('also accepts BLOCKER: (singular)', () => {
    const output = 'One issue found.\n\nBLOCKER: requires Node.js ≥20';
    const warnings = validateOutput(output, 'dependency', 'Deps');
    expect(warnings.map((w) => w.code)).not.toContain('missing-blockers-line');
  });

  it('raises warning severity so refinement loop fires', () => {
    const output = 'All packages look fine.';
    const warnings = validateOutput(output, 'dependency', 'Deps');
    const marker = warnings.find((w) => w.code === 'missing-blockers-line');
    expect(marker?.severity).toBe('warning');
  });

  it('does NOT raise missing-blockers-line for non-dependency categories', () => {
    const output = 'No BLOCKERS here.';
    const warnings = validateOutput(output, 'action', 'Deploy');
    expect(warnings.map((w) => w.code)).not.toContain('missing-blockers-line');
  });

  it('is case-insensitive for BLOCKERS: keyword', () => {
    const output = 'blockers: none — all dependencies resolved.';
    const warnings = validateOutput(output, 'dependency', 'Deps');
    expect(warnings.map((w) => w.code)).not.toContain('missing-blockers-line');
  });
});
