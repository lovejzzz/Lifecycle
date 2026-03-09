import { describe, it, expect } from 'vitest';
import { analyzeGraphForOptimization, formatOptimizations, levenshtein } from '../optimizer';
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

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns correct distance for similar strings', () => {
    expect(levenshtein('draft', 'drafts')).toBe(1);
    expect(levenshtein('review', 'reveiw')).toBe(2);
  });

  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
});

describe('analyzeGraphForOptimization', () => {
  it('returns empty for small graphs', () => {
    const nodes = [makeNode('1', 'Input', 'input')];
    expect(analyzeGraphForOptimization(nodes, [])).toHaveLength(0);
  });

  it('detects duplicate nodes with similar labels', () => {
    const nodes = [
      makeNode('1', 'Draft Report', 'artifact'),
      makeNode('2', 'Draft Repor', 'artifact'), // Levenshtein distance 1
      makeNode('3', 'Output', 'output'),
    ];
    const edges = [makeEdge('1', '3'), makeEdge('2', '3')];
    const opts = analyzeGraphForOptimization(nodes, edges);
    expect(opts.some(o => o.type === 'duplicate-nodes')).toBe(true);
    const dup = opts.find(o => o.type === 'duplicate-nodes')!;
    expect(dup.mergeTargets).toBeDefined();
  });

  it('does not flag input/output as duplicates', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Input', 'input'),
    ];
    const edges = [makeEdge('1', '2')];
    const opts = analyzeGraphForOptimization(nodes, edges);
    expect(opts.some(o => o.type === 'duplicate-nodes')).toBe(false);
  });

  it('detects overloaded fan-out', () => {
    const hub = makeNode('hub', 'Hub', 'cid');
    const targets = Array.from({ length: 5 }, (_, i) => makeNode(`t${i}`, `Target ${i}`, 'action'));
    const nodes = [hub, ...targets];
    const edges = targets.map(t => makeEdge('hub', t.id));
    const opts = analyzeGraphForOptimization(nodes, edges);
    expect(opts.some(o => o.type === 'overloaded-fanout')).toBe(true);
  });

  it('detects orphan chains', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Main', 'action'),
      makeNode('3', 'Orphan A', 'artifact'),
      makeNode('4', 'Orphan B', 'artifact'),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('3', '4')]; // Two disconnected components
    const opts = analyzeGraphForOptimization(nodes, edges);
    expect(opts.some(o => o.type === 'orphan-chain')).toBe(true);
  });

  it('detects missing feedback loop', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Process', 'action'),
      makeNode('3', 'Output', 'output'),
      makeNode('4', 'Policy', 'policy'), // policy exists but not upstream of output
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3')]; // policy not connected
    const opts = analyzeGraphForOptimization(nodes, edges);
    // Policy is not connected at all, so it can't be upstream of output
    expect(opts.some(o => o.type === 'missing-feedback')).toBe(true);
  });

  it('no missing-feedback when review is upstream of output', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Review', 'review'),
      makeNode('3', 'Output', 'output'),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3')];
    const opts = analyzeGraphForOptimization(nodes, edges);
    expect(opts.some(o => o.type === 'missing-feedback')).toBe(false);
  });

  it('detects redundant edges', () => {
    const nodes = [
      makeNode('1', 'A', 'input'),
      makeNode('2', 'B', 'action'),
      makeNode('3', 'C', 'output'),
    ];
    // A→B, B→C, and A→C (redundant since A→B→C exists)
    const edges = [makeEdge('1', '2'), makeEdge('2', '3'), makeEdge('1', '3')];
    const opts = analyzeGraphForOptimization(nodes, edges);
    expect(opts.some(o => o.type === 'redundant-edge')).toBe(true);
  });
});

describe('formatOptimizations', () => {
  it('returns null for empty optimizations', () => {
    expect(formatOptimizations([])).toBeNull();
  });

  it('formats optimizations with chips', () => {
    const opts = [{
      id: 'dup-1-2',
      type: 'duplicate-nodes' as const,
      description: 'Two similar nodes',
      proposedAction: 'Merge them',
      affectedNodeIds: ['1', '2'],
      mergeTargets: ['1', '2'] as [string, string],
    }];
    const result = formatOptimizations(opts);
    expect(result).not.toBeNull();
    expect(result!.content).toContain('Optimization Proposals');
    expect(result!.suggestionChips[0]).toContain('action:opt-');
  });
});
