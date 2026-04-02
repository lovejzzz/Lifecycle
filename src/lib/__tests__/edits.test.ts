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
    const neu =
      'Short intro. We will also cover advanced topics including quantum mechanics, thermodynamics, and electromagnetic theory with practical lab assignments.';
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
    const result = classifyEdit(
      'content',
      undefined,
      'Old Label',
      'New Label',
      category,
      undefined,
    );
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

  it('detects fixing a typo in a lesson plan as cosmetic', () => {
    const old = 'The studnts should review chapter 5 before the next class session';
    const neu = 'The students should review chapter 5 before the next class session';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('cosmetic');
    expect(result.shouldPropagate).toBe(false);
  });

  // ─── Typo detection (new) ──────────────────────────────────────────────

  it('detects single-char typo fix as cosmetic', () => {
    const old = 'Week 3: Introduction to databse design and normalization';
    const neu = 'Week 3: Introduction to database design and normalization';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('cosmetic');
    expect(result.reason).toMatch(/typo/i);
  });

  it('detects two-char typo fix as cosmetic', () => {
    const old = 'Students will demonstarte their understanding of key concepts';
    const neu = 'Students will demonstrate their understanding of key concepts';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('cosmetic');
  });

  // ─── High-impact education terms ───────────────────────────────────────

  it('adding learning objectives forces semantic', () => {
    const old = 'This course covers programming fundamentals in Python';
    const neu =
      'This course covers programming fundamentals in Python. Learning objectives: understand variables, control flow, and functions';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('semantic');
    expect(result.shouldPropagate).toBe(true);
  });

  it('adding rubric criteria forces semantic', () => {
    const old = 'Students submit their final project by the end of the semester';
    const neu =
      'Students submit their final project with a rubric covering creativity, technical depth, and presentation quality';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('semantic');
  });

  it('removing assessment requirements forces semantic', () => {
    const old = 'Grading includes a midterm exam worth 30% and final project worth 40%';
    const neu = 'Grading includes a final project worth 70% of the total course grade';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('semantic');
    expect(result.shouldPropagate).toBe(true);
  });

  it('adding deadline information forces semantic', () => {
    const old = 'Complete the assignment on data structures and algorithms';
    const neu =
      'Complete the assignment on data structures and algorithms. Due date: March 15, 2026 at 11:59 PM';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('semantic');
  });

  // ─── Adding examples/details (local) ───────────────────────────────────

  it('adding an example to existing content is local', () => {
    const old = 'Cover data structures: arrays, linked lists, trees, and graphs';
    const neu =
      'Cover data structures: arrays, linked lists, trees, and graphs. For example, binary search trees are commonly used in database indexing.';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('local');
    expect(result.shouldPropagate).toBe(false);
  });

  it('professor rewords rubric criteria without changing them → local', () => {
    const old =
      'Excellent (A): Shows deep understanding of algorithms\nGood (B): Shows understanding\nFair (C): Shows basic understanding';
    const neu =
      'Excellent (A): Demonstrates deep understanding of algorithms\nGood (B): Demonstrates understanding\nFair (C): Demonstrates basic understanding';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('local');
    expect(result.shouldPropagate).toBe(false);
  });

  // ─── More semantic scenarios ───────────────────────────────────────────

  it('changing exam format is semantic', () => {
    const old = 'Midterm: 50 multiple choice questions covering weeks 1-7 of material';
    const neu = 'Midterm: 3 open-ended programming problems covering weeks 1-7 of material';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('semantic');
    expect(result.shouldPropagate).toBe(true);
  });

  it('replacing entire course description is semantic', () => {
    const old =
      'An introductory course in web development covering HTML, CSS, JavaScript, and React framework basics';
    const neu =
      'An advanced course in distributed systems covering consensus protocols, replication, and fault tolerance';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('semantic');
    expect(result.reason).toMatch(/major|significant/i);
  });

  it('changing lesson topics is semantic', () => {
    const old = 'Week 5: Sorting algorithms — bubble sort, selection sort, insertion sort';
    const neu = 'Week 5: Graph algorithms — BFS, DFS, Dijkstra, minimum spanning trees';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('semantic');
  });

  // ─── Edge cases ────────────────────────────────────────────────────────

  it('number-only changes in grade weights propagate', () => {
    const old = 'Homework: 40%, Midterm: 30%, Final: 30%';
    const neu = 'Homework: 20%, Midterm: 40%, Final: 40%';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.shouldPropagate).toBe(true);
  });

  it('reordering topics without changing them is local', () => {
    const old = 'Topics: sorting, searching, graphs, trees, dynamic programming';
    const neu = 'Topics: graphs, trees, sorting, searching, dynamic programming';
    const result = classifyEdit(old, neu, label, undefined, category, undefined);
    expect(result.type).toBe('local');
  });

  it('very short content → different short content is semantic', () => {
    const result = classifyEdit('Yes', 'No', label, undefined, category, undefined);
    expect(result.type).toBe('semantic');
  });

  it('non-empty to empty is semantic', () => {
    const result = classifyEdit(
      'Existing content about algorithms',
      '',
      label,
      undefined,
      category,
      undefined,
    );
    expect(result.type).toBe('semantic');
  });
});
