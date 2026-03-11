/**
 * Tests for validate.ts — keyword extraction, overlap scoring, output validation.
 */
import { describe, it, expect } from 'vitest';
import {
  extractKeywords,
  overlapScore,
  validateOutput,
} from '../validate';

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
    const score = overlapScore('build a content pipeline for courses', 'content generation pipeline system');
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
    expect(w.some(w => w.code === 'too-short')).toBe(true);
  });

  it('no too-short warning for adequate length', () => {
    const w = validateOutput('x'.repeat(300), 'artifact', 'PRD');
    expect(w.some(w => w.code === 'too-short')).toBe(false);
  });

  it('warns on placeholder content', () => {
    const w = validateOutput('This is a [insert your name here] document', 'process', 'Plan');
    expect(w.some(w => w.code === 'placeholder')).toBe(true);
  });

  it('warns on TODO marker', () => {
    const w = validateOutput('Step 1: TODO fill in details for the lesson plan', 'process', 'Plan');
    expect(w.some(w => w.code === 'placeholder')).toBe(true);
  });

  it('warns on boilerplate opening', () => {
    const w = validateOutput("Sure, here is your lesson plan. It covers...", 'deliverable', 'Lesson');
    expect(w.some(w => w.code === 'boilerplate-opening')).toBe(true);
  });

  it('warns on low keyword relevance', () => {
    const w = validateOutput(
      'The weather is sunny today with clear skies and warm temperatures throughout the afternoon.',
      'process',
      'Code Review',
      ['code', 'review', 'analysis', 'bugs', 'quality'],
    );
    expect(w.some(w => w.code === 'low-relevance')).toBe(true);
  });

  it('no low-relevance warning when keywords match', () => {
    const w = validateOutput(
      'The code review found several bugs in the quality analysis module.',
      'process',
      'Code Review',
      ['code', 'review', 'analysis', 'bugs', 'quality'],
    );
    expect(w.some(w => w.code === 'low-relevance')).toBe(false);
  });

  it('checks review/test for evaluation language', () => {
    const w = validateOutput('The system processes data efficiently and outputs results.', 'review', 'QA');
    expect(w.some(w => w.code === 'missing-evaluation')).toBe(true);
  });

  it('no missing-evaluation when eval language present', () => {
    const w = validateOutput('PASS: All tests passed with no errors found. The output is correct.', 'review', 'QA');
    expect(w.some(w => w.code === 'missing-evaluation')).toBe(false);
  });

  it('checks policy for conditional language', () => {
    const w = validateOutput('This is a general statement about security.', 'policy', 'Security');
    expect(w.some(w => w.code === 'missing-conditions')).toBe(true);
  });

  it('no missing-conditions when conditional language present', () => {
    const w = validateOutput('If the user is unauthorized, they must be denied access.', 'policy', 'Security');
    expect(w.some(w => w.code === 'missing-conditions')).toBe(false);
  });

  it('checks patch for code patterns', () => {
    const w = validateOutput('Changed the button color to blue and updated the text.', 'patch', 'Fix');
    expect(w.some(w => w.code === 'missing-code')).toBe(true);
  });

  it('no missing-code when code present', () => {
    const w = validateOutput('```\nconst color = "blue";\nreturn <button style={{color}}>{text}</button>;\n```', 'patch', 'Fix');
    expect(w.some(w => w.code === 'missing-code')).toBe(false);
  });

  it('returns no warnings for good output', () => {
    const goodOutput = 'x'.repeat(250) + ' The analysis shows pass results with correct validation. Code review approved.';
    const w = validateOutput(goodOutput, 'review', 'QA', ['analysis', 'review', 'validation']);
    expect(w.filter(w => w.severity === 'warning')).toHaveLength(0);
  });
});
