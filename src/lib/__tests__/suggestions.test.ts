import { describe, it, expect } from 'vitest';
import { generateProactiveSuggestions, formatSuggestionsMessage } from '../suggestions';
import type { Node, Edge } from '@xyflow/react';
import type { NodeData } from '../types';

function makeNode(id: string, label: string, category: string, overrides?: Partial<NodeData>): Node<NodeData> {
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

function makeEdge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target };
}

describe('generateProactiveSuggestions', () => {
  it('returns empty for empty graph', () => {
    expect(generateProactiveSuggestions([], [])).toHaveLength(0);
  });

  it('detects missing output node', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Action', 'action'),
    ];
    const edges = [makeEdge('1', '2')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some(s => s.id === 'add-output')).toBe(true);
    expect(suggestions.find(s => s.id === 'add-output')?.actionType).toBe('add-node');
  });

  it('detects dead-end producer nodes when output exists', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Process', 'artifact'),
      makeNode('3', 'Output', 'output'),
    ];
    const edges = [makeEdge('1', '3')]; // node 2 is a dead-end
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some(s => s.id.startsWith('dead-end-'))).toBe(true);
  });

  it('detects empty content nodes', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Draft', 'artifact', { content: undefined, description: undefined, executionResult: undefined }),
      makeNode('3', 'Output', 'output'),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some(s => s.id === 'generate-empty')).toBe(true);
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
    expect(suggestions.some(s => s.id === 'add-review')).toBe(true);
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
    expect(suggestions.some(s => s.id === 'add-review')).toBe(false);
  });

  it('detects stale nodes', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Stale', 'artifact', { status: 'stale' }),
    ];
    const edges = [makeEdge('1', '2')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some(s => s.id === 'refresh-stale')).toBe(true);
  });

  it('detects unexecuted workflow', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Step', 'action'),
      makeNode('3', 'Output', 'output'),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.some(s => s.id === 'run-workflow')).toBe(true);
  });

  it('returns max 3 suggestions sorted by priority', () => {
    // Create a graph that triggers many suggestions
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Step1', 'action', { content: undefined, description: undefined, executionResult: undefined }),
      makeNode('3', 'Step2', 'artifact', { content: undefined, description: undefined, executionResult: undefined }),
      makeNode('4', 'Step3', 'state', { status: 'stale' }),
      makeNode('5', 'Step4', 'cid'),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3'), makeEdge('3', '4'), makeEdge('4', '5')];
    const suggestions = generateProactiveSuggestions(nodes, edges);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    // High priority should come first
    if (suggestions.length >= 2) {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      expect(priorityOrder[suggestions[0].priority]).toBeLessThanOrEqual(priorityOrder[suggestions[1].priority]);
    }
  });
});

describe('formatSuggestionsMessage', () => {
  it('returns null for empty suggestions', () => {
    expect(formatSuggestionsMessage([], 'post-build')).toBeNull();
  });

  it('formats post-build suggestions with correct header', () => {
    const suggestions = [{
      id: 'add-output',
      priority: 'high' as const,
      message: 'No output node',
      chipLabel: 'Add output',
      actionType: 'add-node' as const,
      actionPayload: { label: 'Output', category: 'output', connectAfter: 'Step' },
    }];
    const result = formatSuggestionsMessage(suggestions, 'post-build');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('### Suggestions');
    expect(result!.suggestionChips[0]).toBe('action:add-output|Add output');
  });

  it('formats post-execution suggestions with Next Steps header', () => {
    const suggestions = [{
      id: 'refresh-stale',
      priority: 'high' as const,
      message: '2 stale nodes',
      chipLabel: 'Refresh stale',
      actionType: 'command' as const,
      actionPayload: { command: 'refresh stale' },
    }];
    const result = formatSuggestionsMessage(suggestions, 'post-execution');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('### Next Steps');
    expect(result!.suggestionChips[0]).toBe('action:refresh-stale|Refresh stale');
  });
});
