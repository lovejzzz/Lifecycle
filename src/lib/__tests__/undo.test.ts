/**
 * Tests for operation-based undo/redo system.
 * Tests the computeUndoOp, applyUndo, applyRedo functions directly.
 */
import { describe, it, expect } from 'vitest';

// We can't easily import from the store file directly since it has side effects,
// so we replicate the core logic here for unit testing.

interface NodeData {
  label: string;
  category: string;
  content: string;
  status: string;
  executionResult?: string;
  [key: string]: unknown;
}

interface TestNode {
  id: string;
  position: { x: number; y: number };
  data: NodeData;
  type?: string;
}

interface TestEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface UndoOp {
  beforeNodes: Map<string, TestNode>;
  afterNodes: Map<string, TestNode>;
  beforeEdges: Map<string, TestEdge>;
  afterEdges: Map<string, TestEdge>;
  deletedNodeIds: string[];
  createdNodeIds: string[];
  deletedEdgeIds: string[];
  createdEdgeIds: string[];
}

function stripExecution(node: TestNode): TestNode {
  if (!node.data.executionResult) return node;
  return { ...node, data: { ...node.data, executionResult: undefined } };
}

function computeUndoOp(
  beforeNodes: TestNode[], afterNodes: TestNode[],
  beforeEdges: TestEdge[], afterEdges: TestEdge[],
): UndoOp | null {
  const bNodeMap = new Map(beforeNodes.map(n => [n.id, stripExecution(n)]));
  const aNodeMap = new Map(afterNodes.map(n => [n.id, stripExecution(n)]));
  const bEdgeMap = new Map(beforeEdges.map(e => [e.id, e]));
  const aEdgeMap = new Map(afterEdges.map(e => [e.id, e]));

  const changedBeforeNodes = new Map<string, TestNode>();
  const changedAfterNodes = new Map<string, TestNode>();
  const changedBeforeEdges = new Map<string, TestEdge>();
  const changedAfterEdges = new Map<string, TestEdge>();
  const deletedNodeIds: string[] = [];
  const createdNodeIds: string[] = [];
  const deletedEdgeIds: string[] = [];
  const createdEdgeIds: string[] = [];

  for (const [id, bNode] of bNodeMap) {
    const aNode = aNodeMap.get(id);
    if (!aNode) {
      deletedNodeIds.push(id);
      changedBeforeNodes.set(id, bNode);
    } else if (JSON.stringify(bNode.data) !== JSON.stringify(aNode.data) ||
               bNode.position.x !== aNode.position.x || bNode.position.y !== aNode.position.y) {
      changedBeforeNodes.set(id, bNode);
      changedAfterNodes.set(id, aNode);
    }
  }
  for (const [id, aNode] of aNodeMap) {
    if (!bNodeMap.has(id)) {
      createdNodeIds.push(id);
      changedAfterNodes.set(id, aNode);
    }
  }
  for (const [id, bEdge] of bEdgeMap) {
    const aEdge = aEdgeMap.get(id);
    if (!aEdge) {
      deletedEdgeIds.push(id);
      changedBeforeEdges.set(id, bEdge);
    } else if (JSON.stringify(bEdge) !== JSON.stringify(aEdge)) {
      changedBeforeEdges.set(id, bEdge);
      changedAfterEdges.set(id, aEdge);
    }
  }
  for (const [id, aEdge] of aEdgeMap) {
    if (!bEdgeMap.has(id)) {
      createdEdgeIds.push(id);
      changedAfterEdges.set(id, aEdge);
    }
  }

  const totalChanges = changedBeforeNodes.size + changedAfterNodes.size +
    changedBeforeEdges.size + changedAfterEdges.size;
  if (totalChanges === 0 && deletedNodeIds.length === 0 && createdNodeIds.length === 0 &&
      deletedEdgeIds.length === 0 && createdEdgeIds.length === 0) {
    return null;
  }

  return {
    beforeNodes: changedBeforeNodes, afterNodes: changedAfterNodes,
    beforeEdges: changedBeforeEdges, afterEdges: changedAfterEdges,
    deletedNodeIds, createdNodeIds, deletedEdgeIds, createdEdgeIds,
  };
}

function applyUndo(op: UndoOp, nodes: TestNode[], edges: TestEdge[]) {
  let newNodes = [...nodes];
  let newEdges = [...edges];
  if (op.createdNodeIds.length > 0) {
    const created = new Set(op.createdNodeIds);
    newNodes = newNodes.filter(n => !created.has(n.id));
  }
  for (const id of op.deletedNodeIds) {
    const before = op.beforeNodes.get(id);
    if (before) newNodes.push(before);
  }
  for (const [id, beforeNode] of op.beforeNodes) {
    if (op.deletedNodeIds.includes(id)) continue;
    const idx = newNodes.findIndex(n => n.id === id);
    if (idx >= 0) newNodes[idx] = { ...newNodes[idx], ...beforeNode, data: { ...newNodes[idx].data, ...beforeNode.data } };
  }
  if (op.createdEdgeIds.length > 0) {
    const created = new Set(op.createdEdgeIds);
    newEdges = newEdges.filter(e => !created.has(e.id));
  }
  for (const id of op.deletedEdgeIds) {
    const before = op.beforeEdges.get(id);
    if (before) newEdges.push(before);
  }
  for (const [id, beforeEdge] of op.beforeEdges) {
    if (op.deletedEdgeIds.includes(id)) continue;
    const idx = newEdges.findIndex(e => e.id === id);
    if (idx >= 0) newEdges[idx] = beforeEdge;
  }
  return { nodes: newNodes, edges: newEdges };
}

function applyRedo(op: UndoOp, nodes: TestNode[], edges: TestEdge[]) {
  let newNodes = [...nodes];
  let newEdges = [...edges];
  if (op.deletedNodeIds.length > 0) {
    const deleted = new Set(op.deletedNodeIds);
    newNodes = newNodes.filter(n => !deleted.has(n.id));
  }
  for (const id of op.createdNodeIds) {
    const after = op.afterNodes.get(id);
    if (after) newNodes.push(after);
  }
  for (const [id, afterNode] of op.afterNodes) {
    if (op.createdNodeIds.includes(id)) continue;
    const idx = newNodes.findIndex(n => n.id === id);
    if (idx >= 0) newNodes[idx] = { ...newNodes[idx], ...afterNode, data: { ...newNodes[idx].data, ...afterNode.data } };
  }
  if (op.deletedEdgeIds.length > 0) {
    const deleted = new Set(op.deletedEdgeIds);
    newEdges = newEdges.filter(e => !deleted.has(e.id));
  }
  for (const id of op.createdEdgeIds) {
    const after = op.afterEdges.get(id);
    if (after) newEdges.push(after);
  }
  for (const [id, afterEdge] of op.afterEdges) {
    if (op.createdEdgeIds.includes(id)) continue;
    const idx = newEdges.findIndex(e => e.id === id);
    if (idx >= 0) newEdges[idx] = afterEdge;
  }
  return { nodes: newNodes, edges: newEdges };
}

// Helper to make test nodes
function mkNode(id: string, label: string, opts: Partial<NodeData> = {}): TestNode {
  return {
    id, position: { x: 0, y: 0 }, type: 'lifecycleNode',
    data: { label, category: 'action', content: '', status: 'idle', ...opts },
  };
}

function mkEdge(id: string, source: string, target: string): TestEdge {
  return { id, source, target };
}

describe('undo/redo operations', () => {
  describe('computeUndoOp', () => {
    it('returns null when nothing changed', () => {
      const nodes = [mkNode('n1', 'A')];
      const edges = [mkEdge('e1', 'n1', 'n2')];
      expect(computeUndoOp(nodes, nodes, edges, edges)).toBeNull();
    });

    it('detects node creation', () => {
      const before = [mkNode('n1', 'A')];
      const after = [mkNode('n1', 'A'), mkNode('n2', 'B')];
      const op = computeUndoOp(before, after, [], []);
      expect(op).not.toBeNull();
      expect(op!.createdNodeIds).toEqual(['n2']);
      expect(op!.deletedNodeIds).toEqual([]);
    });

    it('detects node deletion', () => {
      const before = [mkNode('n1', 'A'), mkNode('n2', 'B')];
      const after = [mkNode('n1', 'A')];
      const op = computeUndoOp(before, after, [], []);
      expect(op!.deletedNodeIds).toEqual(['n2']);
      expect(op!.createdNodeIds).toEqual([]);
    });

    it('detects node data changes', () => {
      const before = [mkNode('n1', 'A', { content: 'old' })];
      const after = [mkNode('n1', 'A', { content: 'new' })];
      const op = computeUndoOp(before, after, [], []);
      expect(op).not.toBeNull();
      expect(op!.beforeNodes.get('n1')!.data.content).toBe('old');
      expect(op!.afterNodes.get('n1')!.data.content).toBe('new');
    });

    it('ignores execution result changes', () => {
      const before = [mkNode('n1', 'A')];
      const after = [mkNode('n1', 'A', { executionResult: 'some result' })];
      const op = computeUndoOp(before, after, [], []);
      expect(op).toBeNull(); // execution results are stripped
    });

    it('detects edge creation and deletion', () => {
      const beforeEdges = [mkEdge('e1', 'n1', 'n2')];
      const afterEdges = [mkEdge('e2', 'n2', 'n3')];
      const op = computeUndoOp([], [], beforeEdges, afterEdges);
      expect(op!.deletedEdgeIds).toEqual(['e1']);
      expect(op!.createdEdgeIds).toEqual(['e2']);
    });

    it('detects position changes', () => {
      const before = [{ ...mkNode('n1', 'A'), position: { x: 0, y: 0 } }];
      const after = [{ ...mkNode('n1', 'A'), position: { x: 100, y: 200 } }];
      const op = computeUndoOp(before, after, [], []);
      expect(op).not.toBeNull();
    });
  });

  describe('applyUndo', () => {
    it('reverses node creation', () => {
      const n1 = mkNode('n1', 'A');
      const n2 = mkNode('n2', 'B');
      const op = computeUndoOp([n1], [n1, n2], [], [])!;
      const result = applyUndo(op, [n1, n2], []);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('n1');
    });

    it('reverses node deletion', () => {
      const n1 = mkNode('n1', 'A');
      const n2 = mkNode('n2', 'B');
      const op = computeUndoOp([n1, n2], [n1], [], [])!;
      const result = applyUndo(op, [n1], []);
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.find(n => n.id === 'n2')).toBeTruthy();
    });

    it('reverses node data changes', () => {
      const before = mkNode('n1', 'A', { content: 'original' });
      const after = mkNode('n1', 'A', { content: 'changed' });
      const op = computeUndoOp([before], [after], [], [])!;
      const result = applyUndo(op, [after], []);
      expect(result.nodes[0].data.content).toBe('original');
    });

    it('reverses edge creation', () => {
      const e1 = mkEdge('e1', 'n1', 'n2');
      const op = computeUndoOp([], [], [], [e1])!;
      const result = applyUndo(op, [], [e1]);
      expect(result.edges).toHaveLength(0);
    });

    it('reverses edge deletion', () => {
      const e1 = mkEdge('e1', 'n1', 'n2');
      const op = computeUndoOp([], [], [e1], [])!;
      const result = applyUndo(op, [], []);
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].id).toBe('e1');
    });
  });

  describe('applyRedo', () => {
    it('re-applies node creation', () => {
      const n1 = mkNode('n1', 'A');
      const n2 = mkNode('n2', 'B');
      const op = computeUndoOp([n1], [n1, n2], [], [])!;
      // After undo, we have [n1]. Redo should restore [n1, n2].
      const result = applyRedo(op, [n1], []);
      expect(result.nodes).toHaveLength(2);
    });

    it('re-applies node data changes', () => {
      const before = mkNode('n1', 'A', { content: 'original' });
      const after = mkNode('n1', 'A', { content: 'changed' });
      const op = computeUndoOp([before], [after], [], [])!;
      const result = applyRedo(op, [before], []);
      expect(result.nodes[0].data.content).toBe('changed');
    });

    it('re-applies node deletion', () => {
      const n1 = mkNode('n1', 'A');
      const n2 = mkNode('n2', 'B');
      const op = computeUndoOp([n1, n2], [n1], [], [])!;
      const result = applyRedo(op, [n1, n2], []);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('n1');
    });
  });

  describe('round-trip undo/redo', () => {
    it('undo then redo returns to original state', () => {
      const n1 = mkNode('n1', 'A', { content: 'hello' });
      const n2 = mkNode('n2', 'B');
      const e1 = mkEdge('e1', 'n1', 'n2');

      const afterN1 = mkNode('n1', 'A', { content: 'modified' });
      const n3 = mkNode('n3', 'C');
      const e2 = mkEdge('e2', 'n1', 'n3');

      const beforeNodes = [n1, n2];
      const afterNodes = [afterN1, n2, n3];
      const beforeEdges = [e1];
      const afterEdges = [e1, e2];

      const op = computeUndoOp(beforeNodes, afterNodes, beforeEdges, afterEdges)!;

      // Undo from after state
      const undone = applyUndo(op, afterNodes, afterEdges);
      expect(undone.nodes).toHaveLength(2);
      expect(undone.nodes.find(n => n.id === 'n1')!.data.content).toBe('hello');
      expect(undone.nodes.find(n => n.id === 'n3')).toBeUndefined();
      expect(undone.edges).toHaveLength(1);

      // Redo from undone state
      const redone = applyRedo(op, undone.nodes, undone.edges);
      expect(redone.nodes).toHaveLength(3);
      expect(redone.nodes.find(n => n.id === 'n1')!.data.content).toBe('modified');
      expect(redone.nodes.find(n => n.id === 'n3')).toBeTruthy();
      expect(redone.edges).toHaveLength(2);
    });

    it('handles multiple sequential operations', () => {
      // Start: [n1]
      // Op 1: add n2
      // Op 2: rename n1
      const n1 = mkNode('n1', 'A');
      const n2 = mkNode('n2', 'B');
      const n1Renamed = mkNode('n1', 'Renamed');

      const op1 = computeUndoOp([n1], [n1, n2], [], [])!;
      const op2 = computeUndoOp([n1, n2], [n1Renamed, n2], [], [])!;

      // Undo op2: should revert rename
      const afterUndoOp2 = applyUndo(op2, [n1Renamed, n2], []);
      expect(afterUndoOp2.nodes.find(n => n.id === 'n1')!.data.label).toBe('A');

      // Undo op1: should remove n2
      const afterUndoOp1 = applyUndo(op1, afterUndoOp2.nodes, []);
      expect(afterUndoOp1.nodes).toHaveLength(1);
      expect(afterUndoOp1.nodes[0].id).toBe('n1');
    });
  });

  describe('memory efficiency', () => {
    it('stores only changed nodes, not all nodes', () => {
      const nodes = Array.from({ length: 100 }, (_, i) => mkNode(`n${i}`, `Node ${i}`));
      const afterNodes = nodes.map(n => n.id === 'n5' ? mkNode('n5', 'Changed') : n);
      const op = computeUndoOp(nodes, afterNodes, [], [])!;
      // Only n5 should be in the diff, not all 100 nodes
      expect(op.beforeNodes.size).toBe(1);
      expect(op.afterNodes.size).toBe(1);
      expect(op.beforeNodes.has('n5')).toBe(true);
    });
  });
});
