/**
 * Graph utilities: layout, overlap resolution, topological sort, edge creation, node search.
 * Pure functions extracted from useStore.ts for testability and modularity.
 */

import type { Node, Edge } from '@xyflow/react';
import type { NodeData, NodeCategory } from '@/lib/types';
import { EDGE_LABEL_COLORS } from '@/lib/types';

// ─── Layout Constants ───────────────────────────────────────────────────────
export const NODE_W = 280; // node width + padding
export const NODE_H = 160; // node height + padding

// ─── Anti-overlap Utilities ─────────────────────────────────────────────────

export function nodesOverlap(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;
}

/** Find a non-overlapping position for a new node, starting from the desired position */
export function findFreePosition(
  desired: { x: number; y: number },
  existing: { x: number; y: number }[],
): { x: number; y: number } {
  let pos = { ...desired };
  let attempts = 0;
  while (attempts < 50 && existing.some((e) => nodesOverlap(pos, e))) {
    const ring = Math.floor(attempts / 4) + 1;
    const dir = attempts % 4;
    if (dir === 0) pos = { x: desired.x + ring * NODE_W, y: desired.y };
    else if (dir === 1) pos = { x: desired.x, y: desired.y + ring * NODE_H };
    else if (dir === 2) pos = { x: desired.x - ring * NODE_W, y: desired.y };
    else pos = { x: desired.x + ring * NODE_W, y: desired.y + ring * NODE_H };
    attempts++;
  }
  return pos;
}

/** Push a dragged node away from others it overlaps with. Returns new position or null if no overlap. */
export function resolveOverlap(
  draggedId: string,
  draggedPos: { x: number; y: number },
  allNodes: Node<NodeData>[],
): { x: number; y: number } | null {
  const others = allNodes.filter((n) => n.id !== draggedId).map((n) => n.position);
  const overlapping = others.filter((o) => nodesOverlap(draggedPos, o));
  if (overlapping.length === 0) return null;
  return findFreePosition(draggedPos, others);
}

// ─── Topological Sort ───────────────────────────────────────────────────────

/** Kahn's topological sort — returns ordered node IDs and per-node levels for parallel grouping. */
export function topoSort(
  nodes: Node<NodeData>[],
  edges: Edge[],
): { order: string[]; levels: Map<string, number> } {
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
  }
  const queue: string[] = [];
  const levels = new Map<string, number>();
  for (const [id, deg] of inDeg) {
    if (deg === 0) {
      queue.push(id);
      levels.set(id, 0);
    }
  }
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) || []) {
      const newDeg = (inDeg.get(next) || 1) - 1;
      inDeg.set(next, newDeg);
      levels.set(next, Math.max(levels.get(next) || 0, (levels.get(id) || 0) + 1));
      if (newDeg === 0) queue.push(next);
    }
  }
  return { order, levels };
}

/** Group topologically sorted nodes into parallel execution levels.
 *  Nodes in the same level have all dependencies satisfied by prior levels. */
export function getParallelGroups(order: string[], levels: Map<string, number>): string[][] {
  const maxLevel = Math.max(0, ...levels.values());
  const groups: string[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const id of order) {
    const level = levels.get(id) ?? 0;
    groups[level].push(id);
  }
  return groups.filter((g) => g.length > 0);
}

/** Walk backward from a target node to collect all upstream dependencies (including itself). */
export function getUpstreamSubgraph(
  targetId: string,
  nodes: Node<NodeData>[],
  edges: Edge[],
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const visited = new Set<string>();
  const queue = [targetId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    edges.filter((e) => e.target === id).forEach((e) => queue.push(e.source));
  }
  return {
    nodes: nodes.filter((n) => visited.has(n.id)),
    edges: edges.filter((e) => visited.has(e.source) && visited.has(e.target)),
  };
}

// ─── Edge Utilities ─────────────────────────────────────────────────────────

export const ANIMATED_LABELS = new Set(['monitors', 'watches', 'validates']);

/** Create a styled edge with proper colors, animation, and label. DRY helper. */
export function createStyledEdge(
  sourceId: string,
  targetId: string,
  label: string,
  opts?: { animated?: boolean; dashed?: boolean },
): Edge {
  return {
    id: `e-${sourceId}-${targetId}`,
    source: sourceId,
    target: targetId,
    label,
    animated: opts?.animated ?? ANIMATED_LABELS.has(label),
    style: {
      stroke: EDGE_LABEL_COLORS[label] || '#6366f1',
      strokeWidth: 2,
      ...(opts?.dashed ? { strokeDasharray: '4 4' } : {}),
    },
  };
}

/** Infer the best edge label from source→target category pair */
export function inferEdgeLabel(srcCat?: string, tgtCat?: string): string {
  if (!srcCat || !tgtCat) return 'connects';
  const key = `${srcCat}->${tgtCat}`;
  const EDGE_INFERENCE: Record<string, string> = {
    'input->state': 'feeds',
    'input->artifact': 'feeds',
    'input->cid': 'feeds',
    'input->note': 'feeds',
    'input->output': 'feeds',
    'state->artifact': 'drives',
    'state->review': 'triggers',
    'state->output': 'outputs',
    'state->cid': 'feeds',
    'state->state': 'updates',
    'artifact->review': 'validates',
    'artifact->output': 'outputs',
    'artifact->artifact': 'refines',
    'artifact->state': 'updates',
    'artifact->cid': 'feeds',
    'note->artifact': 'drives',
    'note->state': 'informs',
    'note->cid': 'feeds',
    'note->note': 'refines',
    'cid->state': 'monitors',
    'cid->artifact': 'drives',
    'cid->review': 'validates',
    'cid->output': 'outputs',
    'cid->cid': 'feeds',
    'review->output': 'approves',
    'review->state': 'approves',
    'review->artifact': 'refines',
    'review->cid': 'triggers',
    'policy->state': 'blocks',
    'policy->artifact': 'blocks',
    'policy->review': 'requires',
    'policy->output': 'blocks',
    'patch->state': 'updates',
    'patch->artifact': 'refines',
    'patch->review': 'triggers',
    'dependency->state': 'requires',
    'dependency->artifact': 'requires',
    'trigger->state': 'triggers',
    'trigger->cid': 'triggers',
    'trigger->action': 'triggers',
    'trigger->artifact': 'triggers',
    'trigger->input': 'feeds',
    'test->review': 'validates',
    'test->output': 'validates',
    'test->state': 'validates',
    'test->artifact': 'validates',
    'test->action': 'validates',
    'action->state': 'updates',
    'action->output': 'outputs',
    'action->artifact': 'drives',
    'action->review': 'triggers',
    'action->test': 'triggers',
    'action->cid': 'feeds',
    'output->state': 'informs',
    'output->cid': 'triggers',
    // Simplified categories
    'input->process': 'feeds',
    'input->deliverable': 'feeds',
    'process->process': 'feeds',
    'process->deliverable': 'drives',
    'process->review': 'triggers',
    'deliverable->deliverable': 'refines',
    'deliverable->review': 'validates',
    'deliverable->process': 'feeds',
    'review->deliverable': 'refines',
    'review->process': 'triggers',
    'note->process': 'informs',
    'note->deliverable': 'drives',
  };
  return EDGE_INFERENCE[key] || 'connects';
}

// ─── Node Utilities ─────────────────────────────────────────────────────────

/** Fuzzy find a node by name: exact match → includes → reverse includes */
export function findNodeByName(name: string, nodes: Node<NodeData>[]): Node<NodeData> | undefined {
  const lower = name.toLowerCase().trim();
  return (
    nodes.find((n) => n.data.label.toLowerCase() === lower) ||
    nodes.find((n) => n.data.label.toLowerCase().includes(lower)) ||
    nodes.find((n) => lower.includes(n.data.label.toLowerCase()))
  );
}

// ─── Graph Validation ──────────────────────────────────────────────────────

/** Detect cycles in a directed graph using DFS with recursion stack. */
export function detectCycle(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: string; target: string; label?: string }>,
  options?: { excludeLabels?: string[] },
): { hasCycle: boolean; cycleNodes: string[] } {
  const excludeLabels = new Set(options?.excludeLabels || ['refines']);
  const filteredEdges = edges.filter((e) => !excludeLabels.has(e.label || ''));

  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of filteredEdges) adj.get(e.source)?.push(e.target);

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycleNodes: string[] = [];

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recStack.add(nodeId);
    for (const neighbor of adj.get(nodeId) || []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) {
          cycleNodes.push(nodeId);
          return true;
        }
      } else if (recStack.has(neighbor)) {
        cycleNodes.push(neighbor, nodeId);
        return true;
      }
    }
    recStack.delete(nodeId);
    return false;
  }

  for (const n of nodes) {
    if (!visited.has(n.id) && dfs(n.id)) {
      return { hasCycle: true, cycleNodes: [...new Set(cycleNodes)] };
    }
  }
  return { hasCycle: false, cycleNodes: [] };
}

/** Validate graph invariants: no self-loops, no duplicate edges, no dangling references. */
export interface GraphValidationResult {
  valid: boolean;
  issues: Array<{ code: string; message: string; severity: 'error' | 'warning' }>;
}

export function validateGraphInvariants(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: string; target: string; label?: string }>,
): GraphValidationResult {
  const issues: GraphValidationResult['issues'] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const e of edges) {
    if (e.source === e.target) {
      issues.push({
        code: 'self-loop',
        message: `Edge loops back to itself on node "${e.source}"`,
        severity: 'error',
      });
    }
  }

  const edgeKeys = new Set<string>();
  for (const e of edges) {
    const key = `${e.source}→${e.target}`;
    if (edgeKeys.has(key)) {
      issues.push({
        code: 'duplicate-edge',
        message: `Duplicate edge: ${key}`,
        severity: 'warning',
      });
    }
    edgeKeys.add(key);
  }

  for (const e of edges) {
    if (!nodeIds.has(e.source))
      issues.push({
        code: 'dangling-source',
        message: `Edge source "${e.source}" not found`,
        severity: 'error',
      });
    if (!nodeIds.has(e.target))
      issues.push({
        code: 'dangling-target',
        message: `Edge target "${e.target}" not found`,
        severity: 'error',
      });
  }

  return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
}

// ─── Node Utilities ─────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  // Simplified categories (user-facing)
  input: 'Input',
  process: 'Process',
  deliverable: 'Deliverable',
  review: 'Review',
  note: 'Note',
  // Legacy categories (backward compatible)
  output: 'Output',
  trigger: 'Trigger',
  test: 'Test',
  action: 'Action',
  state: 'State',
  artifact: 'Artifact',
  cid: 'CID Action',
  policy: 'Policy',
  patch: 'Patch',
  dependency: 'Dependency',
};

/** Convert markdown text to basic HTML for PDF/HTML export */
export function markdownToHTML(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
    .replace(/<p><h([123])>/g, '<h$1>')
    .replace(/<\/h([123])><\/p>/g, '</h$1>')
    .replace(/<p><ul>/g, '<ul>')
    .replace(/<\/ul><\/p>/g, '</ul>')
    .replace(/<p><hr><\/p>/g, '<hr>')
    .replace(/<p><blockquote>/g, '<blockquote>')
    .replace(/<\/blockquote><\/p>/g, '</blockquote>')
    .replace(/<p>\s*<\/p>/g, '');
}
