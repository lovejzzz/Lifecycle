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
export function findFreePosition(desired: { x: number; y: number }, existing: { x: number; y: number }[]): { x: number; y: number } {
  let pos = { ...desired };
  let attempts = 0;
  while (attempts < 50 && existing.some(e => nodesOverlap(pos, e))) {
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
  const others = allNodes.filter(n => n.id !== draggedId).map(n => n.position);
  const overlapping = others.filter(o => nodesOverlap(draggedPos, o));
  if (overlapping.length === 0) return null;
  return findFreePosition(draggedPos, others);
}

// ─── Topological Sort ───────────────────────────────────────────────────────

/** Kahn's topological sort — returns ordered node IDs and per-node levels for parallel grouping. */
export function topoSort(nodes: Node<NodeData>[], edges: Edge[]): { order: string[]; levels: Map<string, number> } {
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) { inDeg.set(n.id, 0); adj.set(n.id, []); }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
  }
  const queue: string[] = [];
  const levels = new Map<string, number>();
  for (const [id, deg] of inDeg) { if (deg === 0) { queue.push(id); levels.set(id, 0); } }
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of (adj.get(id) || [])) {
      const newDeg = (inDeg.get(next) || 1) - 1;
      inDeg.set(next, newDeg);
      levels.set(next, Math.max(levels.get(next) || 0, (levels.get(id) || 0) + 1));
      if (newDeg === 0) queue.push(next);
    }
  }
  return { order, levels };
}

// ─── Edge Utilities ─────────────────────────────────────────────────────────

export const ANIMATED_LABELS = new Set(['monitors', 'watches', 'validates']);

/** Create a styled edge with proper colors, animation, and label. DRY helper. */
export function createStyledEdge(sourceId: string, targetId: string, label: string, opts?: { animated?: boolean; dashed?: boolean }): Edge {
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
    'input->state': 'feeds', 'input->artifact': 'feeds', 'input->cid': 'feeds',
    'input->note': 'feeds', 'input->output': 'feeds',
    'state->artifact': 'drives', 'state->review': 'triggers', 'state->output': 'outputs',
    'state->cid': 'feeds', 'state->state': 'updates',
    'artifact->review': 'validates', 'artifact->output': 'outputs', 'artifact->artifact': 'refines',
    'artifact->state': 'updates', 'artifact->cid': 'feeds',
    'note->artifact': 'drives', 'note->state': 'informs', 'note->cid': 'feeds',
    'note->note': 'refines',
    'cid->state': 'monitors', 'cid->artifact': 'drives', 'cid->review': 'validates',
    'cid->output': 'outputs', 'cid->cid': 'feeds',
    'review->output': 'approves', 'review->state': 'approves', 'review->artifact': 'refines',
    'review->cid': 'triggers',
    'policy->state': 'blocks', 'policy->artifact': 'blocks', 'policy->review': 'requires',
    'policy->output': 'blocks',
    'patch->state': 'updates', 'patch->artifact': 'refines', 'patch->review': 'triggers',
    'dependency->state': 'requires', 'dependency->artifact': 'requires',
    'trigger->state': 'triggers', 'trigger->cid': 'triggers', 'trigger->action': 'triggers',
    'trigger->artifact': 'triggers', 'trigger->input': 'feeds',
    'test->review': 'validates', 'test->output': 'validates', 'test->state': 'validates',
    'test->artifact': 'validates', 'test->action': 'validates',
    'action->state': 'updates', 'action->output': 'outputs', 'action->artifact': 'drives',
    'action->review': 'triggers', 'action->test': 'triggers', 'action->cid': 'feeds',
    'output->state': 'informs', 'output->cid': 'triggers',
  };
  return EDGE_INFERENCE[key] || 'connects';
}

// ─── Node Utilities ─────────────────────────────────────────────────────────

/** Fuzzy find a node by name: exact match → includes → reverse includes */
export function findNodeByName(name: string, nodes: Node<NodeData>[]): Node<NodeData> | undefined {
  const lower = name.toLowerCase().trim();
  return nodes.find(n => n.data.label.toLowerCase() === lower) ||
         nodes.find(n => n.data.label.toLowerCase().includes(lower)) ||
         nodes.find(n => lower.includes(n.data.label.toLowerCase()));
}

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  input: 'Input',
  output: 'Output',
  trigger: 'Trigger',
  test: 'Test',
  action: 'Action',
  state: 'New State',
  artifact: 'New Artifact',
  note: 'New Note',
  cid: 'CID Action',
  review: 'Review Gate',
  policy: 'Policy Rule',
  patch: 'Patch',
  dependency: 'Dependency',
};

/** Convert markdown text to basic HTML for PDF/HTML export */
export function markdownToHTML(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
    .replace(/^/, '<p>').replace(/$/, '</p>')
    .replace(/<p><h([123])>/g, '<h$1>').replace(/<\/h([123])><\/p>/g, '</h$1>')
    .replace(/<p><ul>/g, '<ul>').replace(/<\/ul><\/p>/g, '</ul>')
    .replace(/<p><hr><\/p>/g, '<hr>')
    .replace(/<p><blockquote>/g, '<blockquote>').replace(/<\/blockquote><\/p>/g, '</blockquote>')
    .replace(/<p>\s*<\/p>/g, '');
}
