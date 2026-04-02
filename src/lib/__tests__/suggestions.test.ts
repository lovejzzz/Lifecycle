import { describe, it, expect } from 'vitest';
import { generateProactiveSuggestions, formatSuggestionsMessage } from '../suggestions';
import type { Node, Edge } from '@xyflow/react';
import type { NodeData, EdgeCondition } from '../types';
import type { ExecutionRunSummary } from '../prompts';

function makeNode(
  id: string,
  label: string,
  category: string,
  overrides?: Partial<NodeData>,
): Node<NodeData> {
  return {
    id,
    type: 'lifecycleNode',
    position: { x: 0, y: 0 },
    data: {
      label,
      category,
      status: 'active',
      content: 'some content',
      ...overrides,
    } as NodeData,
  };
}

function makeEdge(source: string, target: string, condition?: EdgeCondition): Edge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    ...(condition ? { data: { condition } } : {}),
  };
}

function makeRunSummary(overrides?: Partial<ExecutionRunSummary>): ExecutionRunSummary {
  return {
    sessionId: `run-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    totalNodes: 4,
    succeeded: 4,
    failed: 0,
    skipped: 0,
    durationMs: 10000,
    decisions: [],
    failedNodeLabels: [],
    toolCallCount: 0,
    contextKeysStored: [],
    ...overrides,
  };
}

describe('generateProactiveSuggestions', () => {
  it('returns empty for empty graph', () => {
    expect(generateProactiveSuggestions([], [])).toHaveLength(0);
  });

  it('detects missing output node', () => {
    const nodes = [makeNode('1', 'Input', 'input'), makeNode('2', 'Action', 'action')];
    const edges = [makeEdge('1', '2')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some((s) => s.id === 'add-output')).toBe(true);
    expect(suggestions.find((s) => s.id === 'add-output')?.actionType).toBe('add-node');
  });

  it('detects dead-end producer nodes when output exists', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Process', 'artifact'),
      makeNode('3', 'Output', 'output'),
    ];
    const edges = [makeEdge('1', '3')]; // node 2 is a dead-end
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some((s) => s.id.startsWith('dead-end-'))).toBe(true);
  });

  it('detects empty content nodes', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Draft', 'artifact', {
        content: undefined,
        description: undefined,
        executionResult: undefined,
      }),
      makeNode('3', 'Output', 'output'),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some((s) => s.id === 'generate-empty')).toBe(true);
  });

  it('detects missing review gate in 4+ node workflow', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Step1', 'action'),
      makeNode('3', 'Step2', 'artifact'),
      makeNode('4', 'Output', 'output'),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3'), makeEdge('3', '4')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some((s) => s.id === 'add-review')).toBe(true);
  });

  it('does not suggest review gate when one exists', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Step1', 'action'),
      makeNode('3', 'Review', 'review'),
      makeNode('4', 'Output', 'output'),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3'), makeEdge('3', '4')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some((s) => s.id === 'add-review')).toBe(false);
  });

  it('detects stale nodes', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Stale', 'artifact', { status: 'stale' }),
    ];
    const edges = [makeEdge('1', '2')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some((s) => s.id === 'refresh-stale')).toBe(true);
  });

  it('detects unexecuted workflow', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Step', 'action'),
      makeNode('3', 'Output', 'output'),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some((s) => s.id === 'run-workflow')).toBe(true);
  });

  it('returns max 3 suggestions sorted by priority', () => {
    // Create a graph that triggers many suggestions
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Step1', 'action', {
        content: undefined,
        description: undefined,
        executionResult: undefined,
      }),
      makeNode('3', 'Step2', 'artifact', {
        content: undefined,
        description: undefined,
        executionResult: undefined,
      }),
      makeNode('4', 'Step3', 'state', { status: 'stale' }),
      makeNode('5', 'Step4', 'cid'),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3'), makeEdge('3', '4'), makeEdge('4', '5')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    // High priority should come first
    if (suggestions.length >= 2) {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      expect(priorityOrder[suggestions[0].priority]).toBeLessThanOrEqual(
        priorityOrder[suggestions[1].priority],
      );
    }
  });

  // ── Decision edge conditions ──────────────────────────────────────────────

  it('detects decision node with branches but no decision-is conditions', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Gate', 'decision'),
      makeNode('3', 'Approve', 'action'),
      makeNode('4', 'Reject', 'action'),
    ];
    // Edges from decision node have no conditions
    const edges = [makeEdge('1', '2'), makeEdge('2', '3'), makeEdge('2', '4')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some((s) => s.id === 'decision-missing-conditions')).toBe(true);
    expect(suggestions.find((s) => s.id === 'decision-missing-conditions')?.priority).toBe('high');
  });

  it('does NOT flag decision node when all outgoing edges have decision-is conditions', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Gate', 'decision'),
      makeNode('3', 'Approve', 'action'),
      makeNode('4', 'Reject', 'action'),
    ];
    const edges = [
      makeEdge('1', '2'),
      makeEdge('2', '3', { type: 'decision-is', value: 'approve' }),
      makeEdge('2', '4', { type: 'decision-is', value: 'reject' }),
    ];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some((s) => s.id === 'decision-missing-conditions')).toBe(false);
  });

  it('does NOT flag single-branch decision node (already caught by decision-needs-branches)', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Gate', 'decision'),
      makeNode('3', 'Next', 'action'),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    // Should get decision-needs-branches but not decision-missing-conditions
    expect(suggestions.some((s) => s.id === 'decision-missing-conditions')).toBe(false);
  });
});

// ── Cross-run memory suggestions ──────────────────────────────────────────────

describe('generateProactiveSuggestions — cross-run memory', () => {
  it('returns no memory suggestions when runHistory is omitted', () => {
    const nodes = [makeNode('1', 'Input', 'input'), makeNode('2', 'Output', 'output')];
    const edges = [makeEdge('1', '2')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some((s) => s.id === 'recurring-failure')).toBe(false);
    expect(suggestions.some((s) => s.id === 'performance-degrading')).toBe(false);
    expect(suggestions.some((s) => s.id === 'stable-decision')).toBe(false);
  });

  it('returns no memory suggestions for a single run (insufficient data)', () => {
    const nodes = [makeNode('1', 'Input', 'input'), makeNode('2', 'Output', 'output')];
    const edges = [makeEdge('1', '2')];
    const history = [makeRunSummary({ failedNodeLabels: ['Input'] })];
    const suggestions = generateProactiveSuggestions(nodes, edges, history);
    expect(suggestions.some((s) => s.id === 'recurring-failure')).toBe(false);
  });

  it('detects recurring failure when same node failed in 2+ runs', () => {
    const nodes = [makeNode('1', 'Input', 'input'), makeNode('2', 'Output', 'output')];
    const edges = [makeEdge('1', '2')];
    const history = [
      makeRunSummary({ failedNodeLabels: ['Input'] }),
      makeRunSummary({ failedNodeLabels: ['Input'] }),
    ];
    const suggestions = generateProactiveSuggestions(nodes, edges, history);
    expect(suggestions.some((s) => s.id === 'recurring-failure')).toBe(true);
    const s = suggestions.find((s) => s.id === 'recurring-failure')!;
    expect(s.priority).toBe('high');
    expect(s.message).toContain('Input');
    expect(s.message).toContain('2 of the last 2');
  });

  it('detects performance degradation when run duration is increasing', () => {
    const nodes = [makeNode('1', 'Input', 'input'), makeNode('2', 'Output', 'output')];
    const edges = [makeEdge('1', '2')];
    const history = [
      makeRunSummary({ durationMs: 20000 }), // most recent first
      makeRunSummary({ durationMs: 15000 }),
      makeRunSummary({ durationMs: 10000 }),
    ];
    const suggestions = generateProactiveSuggestions(nodes, edges, history);
    expect(suggestions.some((s) => s.id === 'performance-degrading')).toBe(true);
    const s = suggestions.find((s) => s.id === 'performance-degrading')!;
    expect(s.priority).toBe('medium');
  });

  it('does NOT detect degradation when performance is stable', () => {
    const nodes = [makeNode('1', 'Input', 'input'), makeNode('2', 'Output', 'output')];
    const edges = [makeEdge('1', '2')];
    const history = [makeRunSummary({ durationMs: 10500 }), makeRunSummary({ durationMs: 10000 })];
    const suggestions = generateProactiveSuggestions(nodes, edges, history);
    expect(suggestions.some((s) => s.id === 'performance-degrading')).toBe(false);
  });

  it('detects stable decision when same branch chosen in 2+ runs', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Gate', 'decision'),
      makeNode('3', 'Approve', 'action'),
      makeNode('4', 'Reject', 'action'),
    ];
    const edges = [
      makeEdge('1', '2'),
      makeEdge('2', '3', { type: 'decision-is', value: 'approve' }),
      makeEdge('2', '4', { type: 'decision-is', value: 'reject' }),
    ];
    const history = [
      makeRunSummary({ decisions: [{ label: 'Gate', decision: 'approve', confidence: 0.9 }] }),
      makeRunSummary({ decisions: [{ label: 'Gate', decision: 'approve', confidence: 0.85 }] }),
    ];
    const suggestions = generateProactiveSuggestions(nodes, edges, history);
    expect(suggestions.some((s) => s.id === 'stable-decision')).toBe(true);
    const s = suggestions.find((s) => s.id === 'stable-decision')!;
    expect(s.priority).toBe('low');
    expect(s.message).toContain('Gate');
    expect(s.message).toContain('approve');
    expect(s.message).toContain('2×');
  });

  it('caps output at 3 suggestions even with many memory hits', () => {
    const nodes = [makeNode('1', 'Input', 'input'), makeNode('2', 'Output', 'output')];
    const edges = [makeEdge('1', '2')];
    const history = [
      makeRunSummary({ failedNodeLabels: ['Input'], durationMs: 20000 }),
      makeRunSummary({ failedNodeLabels: ['Input'], durationMs: 15000 }),
    ];
    const suggestions = generateProactiveSuggestions(nodes, edges, history);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });
});

describe('formatSuggestionsMessage', () => {
  it('returns null for empty suggestions', () => {
    expect(formatSuggestionsMessage([], 'post-build')).toBeNull();
  });

  it('formats post-build suggestions with correct header', () => {
    const suggestions = [
      {
        id: 'add-output',
        priority: 'high' as const,
        message: 'No output node',
        chipLabel: 'Add output',
        actionType: 'add-node' as const,
        actionPayload: { label: 'Output', category: 'output', connectAfter: 'Step' },
      },
    ];
    const result = formatSuggestionsMessage(suggestions, 'post-build');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('### Suggestions');
    expect(result!.suggestionChips[0]).toBe('action:add-output|Add output');
  });

  it('formats post-execution suggestions with Next Steps header', () => {
    const suggestions = [
      {
        id: 'refresh-stale',
        priority: 'high' as const,
        message: '2 stale nodes',
        chipLabel: 'Refresh stale',
        actionType: 'command' as const,
        actionPayload: { command: 'refresh stale' },
      },
    ];
    const result = formatSuggestionsMessage(suggestions, 'post-execution');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('### Next Steps');
    expect(result!.suggestionChips[0]).toBe('action:refresh-stale|Refresh stale');
  });
});
