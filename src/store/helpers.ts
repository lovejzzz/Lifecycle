/**
 * Store helpers — shared utilities used across multiple slices.
 * These are module-level functions/state that don't belong to any single slice.
 */

import type { Node, Edge } from '@xyflow/react';
import type { NodeData } from '@/lib/types';
import type { UndoOperation } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('CID');

/** Agent activity logger — delegates to structured logger */
export const cidLog = (action: string, detail?: string | Record<string, unknown>) => {
  const meta =
    typeof detail === 'string' ? { detail } : (detail as Record<string, unknown> | undefined);
  log.info(action, meta);
};

// ── Undo/Redo pure helpers ──────────────────────────────────────────────────

export const MAX_HISTORY = 50;

/** Strip execution results from a node clone (execution results are computed, not user actions). */
export function stripExecutionData(node: Node<NodeData>): Node<NodeData> {
  if (!node.data.executionResult) return node;
  return { ...node, data: { ...node.data, executionResult: undefined } };
}

/**
 * Compute an UndoOperation by diffing before/after node+edge arrays.
 * Only changed/created/deleted items are stored — not the full state.
 */
export function computeUndoOp(
  beforeNodes: Node<NodeData>[],
  afterNodes: Node<NodeData>[],
  beforeEdges: Edge[],
  afterEdges: Edge[],
): UndoOperation | null {
  const bNodeMap = new Map(beforeNodes.map((n) => [n.id, stripExecutionData(n)]));
  const aNodeMap = new Map(afterNodes.map((n) => [n.id, stripExecutionData(n)]));
  const bEdgeMap = new Map(beforeEdges.map((e) => [e.id, e]));
  const aEdgeMap = new Map(afterEdges.map((e) => [e.id, e]));

  const changedBeforeNodes = new Map<string, Node<NodeData>>();
  const changedAfterNodes = new Map<string, Node<NodeData>>();
  const changedBeforeEdges = new Map<string, Edge>();
  const changedAfterEdges = new Map<string, Edge>();
  const deletedNodeIds: string[] = [];
  const createdNodeIds: string[] = [];
  const deletedEdgeIds: string[] = [];
  const createdEdgeIds: string[] = [];

  for (const [id, bNode] of bNodeMap) {
    const aNode = aNodeMap.get(id);
    if (!aNode) {
      deletedNodeIds.push(id);
      changedBeforeNodes.set(id, bNode);
    } else if (
      JSON.stringify(bNode.data) !== JSON.stringify(aNode.data) ||
      bNode.position.x !== aNode.position.x ||
      bNode.position.y !== aNode.position.y
    ) {
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

  const totalChanges =
    changedBeforeNodes.size +
    changedAfterNodes.size +
    changedBeforeEdges.size +
    changedAfterEdges.size;
  if (
    totalChanges === 0 &&
    deletedNodeIds.length === 0 &&
    createdNodeIds.length === 0 &&
    deletedEdgeIds.length === 0 &&
    createdEdgeIds.length === 0
  ) {
    return null;
  }

  return {
    beforeNodes: changedBeforeNodes,
    afterNodes: changedAfterNodes,
    beforeEdges: changedBeforeEdges,
    afterEdges: changedAfterEdges,
    deletedNodeIds,
    createdNodeIds,
    deletedEdgeIds,
    createdEdgeIds,
  };
}

/** Apply an undo operation to the current nodes/edges (going backward). */
export function applyUndo(
  op: UndoOperation,
  nodes: Node<NodeData>[],
  edges: Edge[],
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  let newNodes = [...nodes];
  let newEdges = [...edges];

  if (op.createdNodeIds.length > 0) {
    const created = new Set(op.createdNodeIds);
    newNodes = newNodes.filter((n) => !created.has(n.id));
  }
  for (const id of op.deletedNodeIds) {
    const before = op.beforeNodes.get(id);
    if (before) newNodes.push(before);
  }
  for (const [id, beforeNode] of op.beforeNodes) {
    if (op.deletedNodeIds.includes(id)) continue;
    const idx = newNodes.findIndex((n) => n.id === id);
    if (idx >= 0) newNodes[idx] = beforeNode;
  }

  if (op.createdEdgeIds.length > 0) {
    const created = new Set(op.createdEdgeIds);
    newEdges = newEdges.filter((e) => !created.has(e.id));
  }
  for (const id of op.deletedEdgeIds) {
    const before = op.beforeEdges.get(id);
    if (before) newEdges.push(before);
  }
  for (const [id, beforeEdge] of op.beforeEdges) {
    if (op.deletedEdgeIds.includes(id)) continue;
    const idx = newEdges.findIndex((e) => e.id === id);
    if (idx >= 0) newEdges[idx] = beforeEdge;
  }

  return { nodes: newNodes, edges: newEdges };
}

/** Apply a redo operation (going forward). */
export function applyRedo(
  op: UndoOperation,
  nodes: Node<NodeData>[],
  edges: Edge[],
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  let newNodes = [...nodes];
  let newEdges = [...edges];

  if (op.deletedNodeIds.length > 0) {
    const deleted = new Set(op.deletedNodeIds);
    newNodes = newNodes.filter((n) => !deleted.has(n.id));
  }
  for (const id of op.createdNodeIds) {
    const after = op.afterNodes.get(id);
    if (after) newNodes.push(after);
  }
  for (const [id, afterNode] of op.afterNodes) {
    if (op.createdNodeIds.includes(id)) continue;
    const idx = newNodes.findIndex((n) => n.id === id);
    if (idx >= 0) newNodes[idx] = afterNode;
  }

  if (op.deletedEdgeIds.length > 0) {
    const deleted = new Set(op.deletedEdgeIds);
    newEdges = newEdges.filter((e) => !deleted.has(e.id));
  }
  for (const id of op.createdEdgeIds) {
    const after = op.afterEdges.get(id);
    if (after) newEdges.push(after);
  }
  for (const [id, afterEdge] of op.afterEdges) {
    if (op.createdEdgeIds.includes(id)) continue;
    const idx = newEdges.findIndex((e) => e.id === id);
    if (idx >= 0) newEdges[idx] = afterEdge;
  }

  return { nodes: newNodes, edges: newEdges };
}
