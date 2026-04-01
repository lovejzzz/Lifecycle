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
      ' The analysis shows pass results with correct validation. Code review approved.';
    const w = validateOutput(goodOutput, 'review', 'QA', ['analysis', 'review', 'validation']);
    expect(w.filter((w) => w.severity === 'warning')).toHaveLength(0);
  });

  // ── decision node ────────────────────────────────────────────────────────

  it('warns on decision output missing DECISION: line', () => {
    const w = validateOutput(
      'I think we should approve this based on the evidence.',
      'decision',
      'Quality Gate',
    );
    expect(w.some((w) => w.code === 'missing-decision-format')).toBe(true);
    expect(w.find((w) => w.code === 'missing-decision-format')?.severity).toBe('warning');
  });

  it('no missing-decision-format when DECISION: line present', () => {
    const w = validateOutput(
      'DECISION: approve\nCONFIDENCE: 0.9\nREASONING: All criteria met.',
      'decision',
      'Quality Gate',
    );
    expect(w.some((w) => w.code === 'missing-decision-format')).toBe(false);
  });

  it('accepts case-insensitive DECISION: prefix', () => {
    const w = validateOutput(
      'Decision: reject\nConfidence: 0.3\nReasoning: Too risky.',
      'decision',
      'Risk Check',
    );
    expect(w.some((w) => w.code === 'missing-decision-format')).toBe(false);
  });

  // ── artifact/deliverable structure ───────────────────────────────────────

  it('warns on artifact without section headings', () => {
    const wallOfText = 'This is a product requirements document. '.repeat(20);
    const w = validateOutput(wallOfText, 'artifact', 'PRD');
    expect(w.some((w) => w.code === 'missing-structure')).toBe(true);
    expect(w.find((w) => w.code === 'missing-structure')?.severity).toBe('warning');
  });

  it('no missing-structure when artifact has headings', () => {
    const structured =
      '## Overview\n\nContent here.\n\n## Requirements\n\nMore content.\n\n## Implementation\n\nDetails.';
    const w = validateOutput(structured, 'artifact', 'PRD');
    expect(w.some((w) => w.code === 'missing-structure')).toBe(false);
  });

  it('no missing-structure when artifact has 3+ paragraph breaks', () => {
    const paragraphed =
      'Introduction.\n\nSection one content.\n\nSection two content.\n\nConclusion.';
    const w = validateOutput(paragraphed, 'deliverable', 'Report');
    expect(w.some((w) => w.code === 'missing-structure')).toBe(false);
  });

  it('checks deliverable for structure too', () => {
    const wallOfText = 'This is a deliverable document. '.repeat(15);
    const w = validateOutput(wallOfText, 'deliverable', 'Final Report');
    expect(w.some((w) => w.code === 'missing-structure')).toBe(true);
  });

  // ── action node steps ────────────────────────────────────────────────────

  it('warns on action output without steps', () => {
    const noSteps =
      'To deploy the application you need to configure the server and push the code and restart services.';
    const w = validateOutput(noSteps, 'action', 'Deploy');
    expect(w.some((w) => w.code === 'missing-steps')).toBe(true);
    expect(w.find((w) => w.code === 'missing-steps')?.severity).toBe('warning');
  });

  it('no missing-steps when action has numbered steps', () => {
    const withSteps = '1. Configure the server\n2. Push the code\n3. Restart services';
    const w = validateOutput(withSteps, 'action', 'Deploy');
    expect(w.some((w) => w.code === 'missing-steps')).toBe(false);
  });

  it('no missing-steps when action has bullet points', () => {
    const withBullets = '- Configure the server\n- Push the code\n- Restart services';
    const w = validateOutput(withBullets, 'action', 'Deploy');
    expect(w.some((w) => w.code === 'missing-steps')).toBe(false);
  });

  it('accepts parenthesis-style numbering: 1) Step', () => {
    const withParens = '1) Configure the server\n2) Push the code\n3) Restart services';
    const w = validateOutput(withParens, 'action', 'Deploy');
    expect(w.some((w) => w.code === 'missing-steps')).toBe(false);
  });

  // ── test node verdict ────────────────────────────────────────────────────

  it('warns on test output without VERDICT line', () => {
    const noVerdict =
      'All tests were run. The system processes data correctly and the output is accurate.';
    const w = validateOutput(noVerdict, 'test', 'System Test');
    expect(w.some((w) => w.code === 'missing-verdict')).toBe(true);
    expect(w.find((w) => w.code === 'missing-verdict')?.severity).toBe('warning');
  });

  it('no missing-verdict when VERDICT: line present', () => {
    const withVerdict = 'Test criteria: passed.\n\nVERDICT: PASS — all requirements met.';
    const w = validateOutput(withVerdict, 'test', 'System Test');
    expect(w.some((w) => w.code === 'missing-verdict')).toBe(false);
  });

  it('no missing-verdict when PASS: line present', () => {
    const withPass = 'Ran 12 test cases.\n\nPASS: All criteria satisfied.';
    const w = validateOutput(withPass, 'test', 'Unit Tests');
    expect(w.some((w) => w.code === 'missing-verdict')).toBe(false);
  });

  it('no missing-verdict when FAIL: line present', () => {
    const withFail = 'Criterion 3 failed.\n\nFAIL: Security requirements not met.';
    const w = validateOutput(withFail, 'test', 'Security Test');
    expect(w.some((w) => w.code === 'missing-verdict')).toBe(false);
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

  it('includes DECISION: format instruction for missing-decision-format', () => {
    const w: ValidationWarning[] = [
      { code: 'missing-decision-format', message: 'Missing DECISION: line', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt).toMatch(/DECISION:/);
    expect(prompt).toMatch(/CONFIDENCE:/);
    expect(prompt).toMatch(/REASONING:/);
  });

  it('includes heading instruction for missing-structure', () => {
    const w: ValidationWarning[] = [
      {
        code: 'missing-structure',
        message: 'artifact lacks section headings',
        severity: 'warning',
      },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt.toLowerCase()).toMatch(/heading|section/);
    expect(prompt).toMatch(/##/);
  });

  it('includes numbered steps instruction for missing-steps', () => {
    const w: ValidationWarning[] = [
      { code: 'missing-steps', message: 'Action lacks steps', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt.toLowerCase()).toMatch(/numbered|step/);
    expect(prompt).toMatch(/1\./);
  });

  it('includes VERDICT instruction for missing-verdict', () => {
    const w: ValidationWarning[] = [
      { code: 'missing-verdict', message: 'Test lacks VERDICT line', severity: 'warning' },
    ];
    const prompt = buildRefinementPrompt(w);
    expect(prompt).toMatch(/VERDICT/);
    expect(prompt.toUpperCase()).toMatch(/PASS|FAIL|BLOCK/);
  });
});
