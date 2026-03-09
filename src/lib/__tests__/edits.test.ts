import { describe, it, expect } from 'vitest';
import { classifyEdit } from '../edits';

describe('classifyEdit', () => {
  const label = 'Test Node';
  const category = 'artifact';

  // ─── Cosmetic edits ─────────────────────────────────────────────────────

  it('classifies whitespace-only changes as cosmetic', () => {
    const old = 'Hello world';
    const neu = 'Hello  world';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('cosmetic');
    expect(result.shouldPropagate).toBe(false);
  });

  it('classifies formatting-only changes as cosmetic', () => {
    const old = '## Heading\n\nSome **bold** text with *italic* words';
    const neu = 'Heading\n\nSome bold text with italic words';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('cosmetic');
    expect(result.shouldPropagate).toBe(false);
  });

  it('classifies unchanged content as cosmetic', () => {
    const text = 'Same content';
    const result = classifyEdit(text, text, label, undefined, category, undefined);
    expect(result.type).toBe('cosmetic');
    expect(result.shouldPropagate).toBe(false);
  });

  it('classifies undefined new content as cosmetic (no change)', () => {
    const result = classifyEdit('anything', undefined, label, undefined, category, undefined);
    expect(result.type).toBe('cosmetic');
    expect(result.shouldPropagate).toBe(false);
  });

  // ─── Local edits ──────────────────────────────────────────────────────

  it('classifies minor rewording as local', () => {
    const old = 'The student should complete the homework assignment by Friday';
    const neu = 'The student must complete the homework assignment before Friday';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('local');
    expect(result.shouldPropagate).toBe(false);
  });

  // ─── Semantic edits ───────────────────────────────────────────────────

  it('classifies content rewrite as semantic', () => {
    const old = 'The lesson covers photosynthesis in plants';
    const neu = 'This module introduces cellular respiration and energy transfer in animal cells';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('semantic');
    expect(result.shouldPropagate).toBe(true);
  });

  it('classifies major additions as semantic', () => {
    const old = 'Short intro';
    const neu = 'Short intro. We will also cover advanced topics including quantum mechanics, thermodynamics, and electromagnetic theory with practical lab assignments.';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('semantic');
    expect(result.shouldPropagate).toBe(true);
  });

  it('classifies going from empty to content as semantic', () => {
    const result = classifyEdit('', 'New content here', label, undefined, category, undefined);
    expect(result.type).toBe('semantic');
    expect(result.shouldPropagate).toBe(true);
  });

  // ─── Structural edits ─────────────────────────────────────────────────

  it('classifies label change as structural', () => {
    const result = classifyEdit('content', undefined, 'Old Label', 'New Label', category, undefined);
    expect(result.type).toBe('structural');
    expect(result.shouldPropagate).toBe(true);
  });

  it('classifies category change as structural', () => {
    const result = classifyEdit('content', undefined, label, undefined, 'artifact', 'review');
    expect(result.type).toBe('structural');
    expect(result.shouldPropagate).toBe(true);
  });

  // ─── Edge cases ───────────────────────────────────────────────────────

  it('structural takes priority over content changes', () => {
    // Both label and content changed — structural wins
    const result = classifyEdit('old', 'completely new', 'Old', 'New', category, undefined);
    expect(result.type).toBe('structural');
  });

  it('handles both contents being empty', () => {
    const result = classifyEdit('', '', label, undefined, category, undefined);
    expect(result.type).toBe('cosmetic');
    expect(result.shouldPropagate).toBe(false);
  });

  // ─── Real-world education scenario ────────────────────────────────────

  it('detects adding a homework to a lesson plan as semantic', () => {
    const old = `## Lesson 3: Photosynthesis

### Objectives
- Understand light reactions
- Understand Calvin cycle

### Activities
- Lab: Leaf disk experiment
- Discussion: Energy flow`;

    const neu = `## Lesson 3: Photosynthesis

### Objectives
- Understand light reactions
- Understand Calvin cycle

### Activities
- Lab: Leaf disk experiment
- Discussion: Energy flow

### Homework
- Worksheet: Diagram the light reactions and Calvin cycle
- Short essay: Compare photosynthesis and cellular respiration`;

    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('semantic');
    expect(result.shouldPropagate).toBe(true);
  });

  it('detects fixing a typo in a lesson plan as local', () => {
    const old = 'The studnts should review chapter 5 before the next class session';
    const neu = 'The students should review chapter 5 before the next class session';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    // Typo fix: very high term overlap, tiny length change
    expect(result.shouldPropagate).toBe(false);
  });
});
