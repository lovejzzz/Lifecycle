import { describe, it, expect } from 'vitest';
import {
  nodesOverlap, findFreePosition, topoSort, inferEdgeLabel,
  findNodeByName, detectCycle, validateGraphInvariants,
  NODE_W, NODE_H,
} from '../graph';
import type { Node, Edge } from '@xyflow/react';
import type { NodeData } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function mkNode(id: string, label = id, category = 'action' as const, x = 0, y = 0): Node<NodeData> {
  return { id, type: 'lifecycleNode', position: { x, y }, data: { label, category, status: 'active' } };
}

function mkEdge(source: string, target: string, label = 'drives'): Edge {
  return { id: `e-${source}-${target}`, source, target, label };
}

// ─── nodesOverlap ──────────────────────────────────────────────────────────

describe('nodesOverlap', () => {
  it('detects overlapping positions', () => {
    expect(nodesOverlap({ x: 0, y: 0 }, { x: 10, y: 10 })).toBe(true);
  });

  it('returns false for distant positions', () => {
    expect(nodesOverlap({ x: 0, y: 0 }, { x: NODE_W + 1, y: 0 })).toBe(false);
  });

  it('returns false at exact boundary', () => {
    expect(nodesOverlap({ x: 0, y: 0 }, { x: NODE_W, y: 0 })).toBe(false);
  });
});

// ─── findFreePosition ──────────────────────────────────────────────────────

describe('findFreePosition', () => {
  it('returns desired position when no conflicts', () => {
    const pos = findFreePosition({ x: 100, y: 100 }, []);
    expect(pos).toEqual({ x: 100, y: 100 });
  });

  it('finds free position when desired is taken', () => {
    const pos = findFreePosition({ x: 0, y: 0 }, [{ x: 0, y: 0 }]);
    expect(nodesOverlap(pos, { x: 0, y: 0 })).toBe(false);
  });

  it('handles multiple existing nodes', () => {
    const existing = [{ x: 0, y: 0 }, { x: NODE_W, y: 0 }, { x: 0, y: NODE_H }];
    const pos = findFreePosition({ x: 0, y: 0 }, existing);
    expect(existing.every(e => !nodesOverlap(pos, e))).toBe(true);
  });
});

// ─── topoSort ──────────────────────────────────────────────────────────────

describe('topoSort', () => {
  it('sorts a linear chain A→B→C', () => {
    const nodes = [mkNode('a'), mkNode('b'), mkNode('c')];
    const edges = [mkEdge('a', 'b'), mkEdge('b', 'c')];
    const { order } = topoSort(nodes, edges);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('handles diamond pattern A→B,C→D', () => {
    const nodes = [mkNode('a'), mkNode('b'), mkNode('c'), mkNode('d')];
    const edges = [mkEdge('a', 'b'), mkEdge('a', 'c'), mkEdge('b', 'd'), mkEdge('c', 'd')];
    const { order, levels } = topoSort(nodes, edges);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('d'));
    expect(levels.get('a')).toBe(0);
    expect(levels.get('d')).toBe(2);
  });

  it('assigns correct levels for parallel branches', () => {
    const nodes = [mkNode('a'), mkNode('b'), mkNode('c')];
    const edges = [mkEdge('a', 'b'), mkEdge('a', 'c')];
    const { levels } = topoSort(nodes, edges);
    expect(levels.get('b')).toBe(1);
    expect(levels.get('c')).toBe(1);
  });

  it('handles single node', () => {
    const { order } = topoSort([mkNode('x')], []);
    expect(order).toEqual(['x']);
  });

  it('handles empty graph', () => {
    const { order } = topoSort([], []);
    expect(order).toEqual([]);
  });

  it('drops nodes in cycles (Kahn behavior)', () => {
    const nodes = [mkNode('a'), mkNode('b'), mkNode('c')];
    const edges = [mkEdge('a', 'b'), mkEdge('b', 'c'), mkEdge('c', 'a')];
    const { order } = topoSort(nodes, edges);
    // Kahn's drops all 3 since they form a cycle
    expect(order.length).toBe(0);
  });
});

// ─── inferEdgeLabel ────────────────────────────────────────────────────────

describe('inferEdgeLabel', () => {
  it('returns "feeds" for input→cid', () => {
    expect(inferEdgeLabel('input', 'cid')).toBe('feeds');
  });

  it('returns "monitors" for cid→state', () => {
    expect(inferEdgeLabel('cid', 'state')).toBe('monitors');
  });

  it('returns "approves" for review→output', () => {
    expect(inferEdgeLabel('review', 'output')).toBe('approves');
  });

  it('returns "validates" for test→artifact', () => {
    expect(inferEdgeLabel('test', 'artifact')).toBe('validates');
  });

  it('returns "connects" for unknown pair', () => {
    expect(inferEdgeLabel('unknown', 'other')).toBe('connects');
  });

  it('handles undefined categories', () => {
    expect(inferEdgeLabel(undefined, 'cid')).toBe('connects');
    expect(inferEdgeLabel('input', undefined)).toBe('connects');
  });
});

// ─── findNodeByName ────────────────────────────────────────────────────────

describe('findNodeByName', () => {
  const nodes = [mkNode('1', 'Data Intake'), mkNode('2', 'Review Gate'), mkNode('3', 'Final Output')];

  it('finds exact match (case-insensitive)', () => {
    expect(findNodeByName('data intake', nodes)?.id).toBe('1');
  });

  it('finds partial match (includes)', () => {
    expect(findNodeByName('review', nodes)?.id).toBe('2');
  });

  it('returns undefined for no match', () => {
    expect(findNodeByName('nonexistent', nodes)).toBeUndefined();
  });
});

// ─── detectCycle ───────────────────────────────────────────────────────────

describe('detectCycle', () => {
  it('detects simple A→B→C→A cycle', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a' },
    ];
    const { hasCycle } = detectCycle(nodes, edges);
    expect(hasCycle).toBe(true);
  });

  it('returns false for DAG', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ];
    const { hasCycle } = detectCycle(nodes, edges);
    expect(hasCycle).toBe(false);
  });

  it('excludes "refines" labels by default (feedback loops)', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a', label: 'refines' },
    ];
    const { hasCycle } = detectCycle(nodes, edges);
    expect(hasCycle).toBe(false);
  });

  it('detects cycle even with "refines" excluded when real cycle exists', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a', label: 'drives' },
    ];
    const { hasCycle, cycleNodes } = detectCycle(nodes, edges);
    expect(hasCycle).toBe(true);
    expect(cycleNodes.length).toBeGreaterThan(0);
  });

  it('handles self-loop', () => {
    const nodes = [{ id: 'a' }];
    const edges = [{ source: 'a', target: 'a' }];
    const { hasCycle } = detectCycle(nodes, edges);
    expect(hasCycle).toBe(true);
  });

  it('handles disconnected graph with no cycle', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'c', target: 'd' },
    ];
    const { hasCycle } = detectCycle(nodes, edges);
    expect(hasCycle).toBe(false);
  });

  it('handles empty graph', () => {
    const { hasCycle } = detectCycle([], []);
    expect(hasCycle).toBe(false);
  });
});

// ─── validateGraphInvariants ───────────────────────────────────────────────

describe('validateGraphInvariants', () => {
  it('passes for valid graph', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }];
    const edges = [{ source: 'a', target: 'b' }];
    const { valid, issues } = validateGraphInvariants(nodes, edges);
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('detects self-loops', () => {
    const nodes = [{ id: 'a' }];
    const edges = [{ source: 'a', target: 'a' }];
    const { valid, issues } = validateGraphInvariants(nodes, edges);
    expect(valid).toBe(false);
    expect(issues.some(i => i.code === 'self-loop')).toBe(true);
  });

  it('detects duplicate edges', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'b' },
    ];
    const { issues } = validateGraphInvariants(nodes, edges);
    expect(issues.some(i => i.code === 'duplicate-edge')).toBe(true);
  });

  it('detects dangling source', () => {
    const nodes = [{ id: 'b' }];
    const edges = [{ source: 'x', target: 'b' }];
    const { valid, issues } = validateGraphInvariants(nodes, edges);
    expect(valid).toBe(false);
    expect(issues.some(i => i.code === 'dangling-source')).toBe(true);
  });

  it('detects dangling target', () => {
    const nodes = [{ id: 'a' }];
    const edges = [{ source: 'a', target: 'z' }];
    const { valid, issues } = validateGraphInvariants(nodes, edges);
    expect(valid).toBe(false);
    expect(issues.some(i => i.code === 'dangling-target')).toBe(true);
  });

  it('treats duplicate edges as warnings (still valid)', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'b' },
    ];
    const { valid } = validateGraphInvariants(nodes, edges);
    expect(valid).toBe(true); // warnings don't make it invalid
  });

  it('handles empty graph', () => {
    const { valid, issues } = validateGraphInvariants([], []);
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });
});
