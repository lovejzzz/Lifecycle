/**
 * Workflow Optimization — graph-aware structural analysis that proposes
 * concrete improvements. Pure functions, no store dependency.
 *
 * Detects: duplicate nodes, overloaded fan-out, orphan chains,
 * missing feedback loops, and redundant edges.
 */

import type { Node, Edge } from '@xyflow/react';
import type { NodeData } from '@/lib/types';

export type OptimizationType =
  | 'duplicate-nodes'
  | 'overloaded-fanout'
  | 'orphan-chain'
  | 'missing-feedback'
  | 'redundant-edge';

export interface Optimization {
  id: string;
  type: OptimizationType;
  description: string;
  /** Human-readable proposed action */
  proposedAction: string;
  /** Node IDs involved */
  affectedNodeIds: string[];
  /** For duplicate-nodes: the two node IDs to merge */
  mergeTargets?: [string, string];
  /** For redundant-edge: the edge ID to remove */
  edgeId?: string;
}

/**
 * Simple edit distance (Levenshtein) for short strings.
 * Used to detect near-duplicate node labels.
 */
export function levenshtein(a: string, b: string): number {
  const la = a.length,
    lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Use single-row DP for space efficiency
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    const curr = [i];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    prev = curr;
  }
  return prev[lb];
}

/**
 * Analyze the graph and return a list of proposed structural optimizations.
 */
export function analyzeGraphForOptimization(
  nodes: Node<NodeData>[],
  edges: Edge[],
): Optimization[] {
  if (nodes.length < 2) return [];

  const optimizations: Optimization[] = [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const connectedIds = new Set<string>();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e.target);
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }

  // ── 1. Duplicate nodes ─────────────────────────────────────────────────────
  // Same category + similar labels (Levenshtein < 3)
  const checked = new Set<string>();
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      const key = `${a.id}:${b.id}`;
      if (checked.has(key)) continue;
      checked.add(key);

      if (a.data.category !== b.data.category) continue;
      // Skip input/output — those are typically intentionally separate
      if (['input', 'output'].includes(a.data.category)) continue;

      const dist = levenshtein(a.data.label.toLowerCase(), b.data.label.toLowerCase());
      if (dist < 3) {
        optimizations.push({
          id: `dup-${a.id}-${b.id}`,
          type: 'duplicate-nodes',
          description: `"${a.data.label}" and "${b.data.label}" are both ${a.data.category} nodes with similar names`,
          proposedAction: `Merge "${b.data.label}" into "${a.data.label}" — content will be combined, edges re-linked`,
          affectedNodeIds: [a.id, b.id],
          mergeTargets: [a.id, b.id],
        });
      }
    }
  }

  // ── 2. Overloaded fan-out ──────────────────────────────────────────────────
  // Nodes with 5+ downstream connections
  for (const node of nodes) {
    const out = outgoing.get(node.id) ?? [];
    if (out.length >= 5) {
      optimizations.push({
        id: `fanout-${node.id}`,
        type: 'overloaded-fanout',
        description: `"${node.data.label}" has ${out.length} downstream connections — potential bottleneck`,
        proposedAction: `Consider splitting "${node.data.label}" into sub-tasks or adding intermediate coordinator nodes`,
        affectedNodeIds: [node.id, ...out],
      });
    }
  }

  // ── 3. Orphan chains ──────────────────────────────────────────────────────
  // Find connected components; any component not connected to an input/output is orphaned
  const visited = new Set<string>();
  const components: Set<string>[] = [];

  function bfs(start: string): Set<string> {
    const component = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (component.has(current)) continue;
      component.add(current);
      for (const t of outgoing.get(current) ?? []) if (!component.has(t)) queue.push(t);
      for (const s of incoming.get(current) ?? []) if (!component.has(s)) queue.push(s);
    }
    return component;
  }

  for (const node of nodes) {
    if (!visited.has(node.id) && connectedIds.has(node.id)) {
      const comp = bfs(node.id);
      comp.forEach((id) => visited.add(id));
      components.push(comp);
    }
  }

  // Find main component (largest, or one containing input/output)
  const mainComponent = components.reduce((best, comp) => {
    const hasIO = [...comp].some((id) => {
      const n = nodeById.get(id);
      return n && (n.data.category === 'input' || n.data.category === 'output');
    });
    if (hasIO) return comp;
    return comp.size > best.size ? comp : best;
  }, new Set<string>());

  for (const comp of components) {
    if (comp === mainComponent || comp.size < 2) continue;
    const compNodes = [...comp].map((id) => nodeById.get(id)!).filter(Boolean);
    const names = compNodes.slice(0, 3).map((n) => n.data.label);
    optimizations.push({
      id: `orphan-chain-${[...comp][0]}`,
      type: 'orphan-chain',
      description: `${comp.size} nodes (${names.join(', ')}${comp.size > 3 ? '...' : ''}) form a disconnected subgraph`,
      proposedAction: `Connect this group to the main workflow, or remove if redundant`,
      affectedNodeIds: [...comp],
    });
  }

  // ── 4. Missing feedback loop ───────────────────────────────────────────────
  // Output nodes with no path back to review/policy nodes
  const outputNodes = nodes.filter((n) => n.data.category === 'output');
  const reviewPolicyNodes = nodes.filter((n) => ['review', 'policy'].includes(n.data.category));
  if (outputNodes.length > 0 && reviewPolicyNodes.length > 0) {
    for (const outNode of outputNodes) {
      // Check if any review/policy node has a path to this output
      const hasReviewUpstream = reviewPolicyNodes.some((rp) => {
        // BFS from rp to see if we can reach outNode
        const seen = new Set<string>();
        const q = [rp.id];
        while (q.length > 0) {
          const curr = q.shift()!;
          if (curr === outNode.id) return true;
          if (seen.has(curr)) continue;
          seen.add(curr);
          for (const t of outgoing.get(curr) ?? []) if (!seen.has(t)) q.push(t);
        }
        return false;
      });
      if (!hasReviewUpstream) {
        optimizations.push({
          id: `feedback-${outNode.id}`,
          type: 'missing-feedback',
          description: `"${outNode.data.label}" output has no review/policy gate upstream`,
          proposedAction: `Add a review gate before "${outNode.data.label}" for quality control`,
          affectedNodeIds: [outNode.id],
        });
      }
    }
  }

  // ── 5. Redundant edges ─────────────────────────────────────────────────────
  // If A→B and A→C→B both exist, the direct A→B may be redundant (transitive)
  for (const edge of edges) {
    const { source, target } = edge;
    const sourceOuts = outgoing.get(source) ?? [];
    // Check if there's an indirect path from source to target through exactly one intermediate
    for (const mid of sourceOuts) {
      if (mid === target) continue;
      const midOuts = outgoing.get(mid) ?? [];
      if (midOuts.includes(target)) {
        optimizations.push({
          id: `redundant-${edge.id}`,
          type: 'redundant-edge',
          description: `Edge from "${nodeById.get(source)?.data.label}" to "${nodeById.get(target)?.data.label}" is redundant — data already flows through "${nodeById.get(mid)?.data.label}"`,
          proposedAction: `Remove the direct edge to simplify the graph`,
          affectedNodeIds: [source, mid, target],
          edgeId: edge.id,
        });
        break; // One report per edge is enough
      }
    }
  }

  return optimizations;
}

/**
 * Format optimizations as a CID message with suggestion chips.
 */
export function formatOptimizations(
  optimizations: Optimization[],
): { content: string; suggestionChips: string[] } | null {
  if (optimizations.length === 0) return null;

  const lines = optimizations.slice(0, 5).map((opt, i) => {
    const icon = {
      'duplicate-nodes': '🔀',
      'overloaded-fanout': '⚡',
      'orphan-chain': '🔗',
      'missing-feedback': '🔄',
      'redundant-edge': '✂️',
    }[opt.type];
    return `${i + 1}. ${icon} **${opt.description}**\n   → ${opt.proposedAction}`;
  });

  const content = `### Optimization Proposals\n\n${lines.join('\n\n')}`;

  // Encode as action chips for CIDPanel
  const suggestionChips = optimizations.slice(0, 3).map((opt) => {
    const shortLabel = {
      'duplicate-nodes': 'Merge duplicates',
      'overloaded-fanout': 'Split bottleneck',
      'orphan-chain': 'Connect orphans',
      'missing-feedback': 'Add review gate',
      'redundant-edge': 'Remove redundant edge',
    }[opt.type];
    return `action:opt-${opt.id}|${shortLabel}`;
  });

  return { content, suggestionChips };
}
