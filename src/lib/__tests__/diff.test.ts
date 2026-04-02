import { describe, it, expect } from 'vitest';
import { computeDiff, diffSummary, formatDiffSummary } from '../diff';

describe('computeDiff', () => {
  it('returns all unchanged for identical texts', () => {
    const lines = computeDiff('hello\nworld', 'hello\nworld');
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.type === 'unchanged')).toBe(true);
    expect(lines[0].oldLineNum).toBe(1);
    expect(lines[0].newLineNum).toBe(1);
  });

  it('detects added lines', () => {
    const lines = computeDiff('a\nb', 'a\nb\nc');
    const added = lines.filter((l) => l.type === 'added');
    expect(added).toHaveLength(1);
    expect(added[0].content).toBe('c');
    expect(added[0].newLineNum).toBe(3);
    expect(added[0].oldLineNum).toBeUndefined();
  });

  it('detects removed lines', () => {
    const lines = computeDiff('a\nb\nc', 'a\nc');
    const removed = lines.filter((l) => l.type === 'removed');
    expect(removed).toHaveLength(1);
    expect(removed[0].content).toBe('b');
    expect(removed[0].oldLineNum).toBe(2);
  });

  it('handles complete replacement', () => {
    const lines = computeDiff('old text', 'new text');
    const removed = lines.filter((l) => l.type === 'removed');
    const added = lines.filter((l) => l.type === 'added');
    expect(removed).toHaveLength(1);
    expect(added).toHaveLength(1);
    expect(removed[0].content).toBe('old text');
    expect(added[0].content).toBe('new text');
  });

  it('handles empty old text', () => {
    const lines = computeDiff('', 'new line');
    expect(lines.filter((l) => l.type === 'added')).toHaveLength(1);
  });

  it('handles empty new text', () => {
    const lines = computeDiff('old line', '');
    expect(lines.filter((l) => l.type === 'removed')).toHaveLength(1);
  });

  it('handles multiline mixed changes', () => {
    const old = 'header\nalpha\nbeta\nfooter';
    const next = 'header\nalpha\ngamma\ndelta\nfooter';
    const lines = computeDiff(old, next);
    expect(lines.filter((l) => l.type === 'unchanged').map((l) => l.content)).toEqual([
      'header',
      'alpha',
      'footer',
    ]);
    expect(lines.filter((l) => l.type === 'removed').map((l) => l.content)).toEqual(['beta']);
    expect(lines.filter((l) => l.type === 'added').map((l) => l.content)).toEqual([
      'gamma',
      'delta',
    ]);
  });

  it('handles both texts empty', () => {
    const lines = computeDiff('', '');
    expect(lines).toHaveLength(1); // single empty line, unchanged
    expect(lines[0].type).toBe('unchanged');
  });
});

describe('diffSummary', () => {
  it('reports identical for no changes', () => {
    const lines = computeDiff('same', 'same');
    const summary = diffSummary(lines);
    expect(summary.identical).toBe(true);
    expect(summary.added).toBe(0);
    expect(summary.removed).toBe(0);
  });

  it('counts added and removed', () => {
    const lines = computeDiff('a\nb', 'a\nc\nd');
    const summary = diffSummary(lines);
    expect(summary.identical).toBe(false);
    expect(summary.added).toBe(2);
    expect(summary.removed).toBe(1);
    expect(summary.unchanged).toBe(1);
  });
});

describe('formatDiffSummary', () => {
  it('returns "No changes" for identical', () => {
    expect(formatDiffSummary({ added: 0, removed: 0, unchanged: 5, identical: true })).toBe(
      'No changes',
    );
  });

  it('formats additions and removals', () => {
    expect(formatDiffSummary({ added: 3, removed: 1, unchanged: 5, identical: false })).toBe(
      '+3 lines, -1 line',
    );
  });

  it('formats only additions', () => {
    expect(formatDiffSummary({ added: 1, removed: 0, unchanged: 5, identical: false })).toBe(
      '+1 line',
    );
  });
});
