/**
 * Workflow Health Assessment — structured analysis of workflow issues and suggestions.
 * Pure functions, no store dependency. Used by the Workflow Health Monitor (Roadmap Item 7).
 */

import type { Node, Edge } from '@xyflow/react';
import type { NodeData } from '@/lib/types';

export type IssuePriority = 'high' | 'medium' | 'low';

export interface HealthIssue {
  id: string;
  priority: IssuePriority;
  message: string;
  nodeIds?: string[];
}

export interface HealthSuggestion {
  id: string;
  message: string;
  action?: string; // CID chat command to fix it
  nodeIds?: string[];
}

export interface BottleneckInfo {
  nodeId: string;
  label: string;
  durationMs: number;
  reason: 'absolute' | 'relative'; // >5s or >2x median
}

export interface BottleneckChain {
  nodeIds: string[];
  labels: string[];
  totalMs: number;
  parallelizable: boolean; // true if nodes share no edges between them
}

export interface BottleneckReport {
  slowNodes: BottleneckInfo[];
  chains: BottleneckChain[];
  medianMs: number;
}

export interface HealthReport {
  score: number;
  issues: HealthIssue[];
  suggestions: HealthSuggestion[];
  bottlenecks?: BottleneckReport;
}

// ── Bottleneck Detection ──────────────────────────────────────────────────────

const ABSOLUTE_SLOW_THRESHOLD_MS = 5000; // 5 seconds
const RELATIVE_SLOW_FACTOR = 2; // 2x median

/**
 * Detect execution bottlenecks using timing data from `_executionDurationMs`.
 * Identifies individually slow nodes and sequential chains of slow nodes
 * that could potentially be parallelized.
 */
export function detectBottlenecks(
  nodes: Node<NodeData>[],
  edges: Edge[],
): BottleneckReport {
  // Collect nodes with valid execution timing
  const timed = nodes.filter(n =>
    n.data._executionDurationMs != null && n.data._executionDurationMs > 0 &&
    n.data.executionStatus === 'success'
  );

  if (timed.length === 0) {
    return { slowNodes: [], chains: [], medianMs: 0 };
  }

  // Compute median execution time
  const sorted = [...timed].sort((a, b) => a.data._executionDurationMs! - b.data._executionDurationMs!);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0
    ? (sorted[mid - 1].data._executionDurationMs! + sorted[mid].data._executionDurationMs!) / 2
    : sorted[mid].data._executionDurationMs!;

  const relativeThreshold = medianMs * RELATIVE_SLOW_FACTOR;

  // Find slow nodes (>5s or >2x median)
  const slowNodes: BottleneckInfo[] = [];
  const slowIds = new Set<string>();
  for (const n of timed) {
    const ms = n.data._executionDurationMs!;
    if (ms > ABSOLUTE_SLOW_THRESHOLD_MS) {
      slowNodes.push({ nodeId: n.id, label: n.data.label, durationMs: ms, reason: 'absolute' });
      slowIds.add(n.id);
    } else if (ms > relativeThreshold && relativeThreshold > 0) {
      slowNodes.push({ nodeId: n.id, label: n.data.label, durationMs: ms, reason: 'relative' });
      slowIds.add(n.id);
    }
  }

  // Sort by duration descending
  slowNodes.sort((a, b) => b.durationMs - a.durationMs);

  // Find sequential chains of slow nodes that could be parallelized.
  // A chain is: A → B → C where each is slow and they have no shared dependencies
  // (i.e., B doesn't actually depend on A's output — they could run in parallel).
  // For now, detect linear chains of slow nodes connected by single edges.
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e.target);
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
  }

  const chains: BottleneckChain[] = [];
  const visitedInChain = new Set<string>();

  for (const n of slowNodes) {
    if (visitedInChain.has(n.nodeId)) continue;

    // Walk backward through slow single-parent edges to find chain start
    const prefix: BottleneckInfo[] = [];
    let current = n.nodeId;
    while (true) {
      const parents = incoming.get(current) || [];
      if (parents.length !== 1) break;
      const parent = parents[0];
      if (visitedInChain.has(parent) || !slowIds.has(parent)) break;
      const parentInfo = slowNodes.find(s => s.nodeId === parent);
      if (!parentInfo) break;
      prefix.unshift(parentInfo);
      current = parent;
    }

    // Build chain: prefix + current node + forward walk
    const chain: BottleneckInfo[] = [...prefix, n];
    current = n.nodeId;
    // Walk forward through slow single-child edges
    while (true) {
      const children = outgoing.get(current) || [];
      if (children.length !== 1) break;
      const child = children[0];
      if (visitedInChain.has(child) || !slowIds.has(child)) break;
      const childInfo = slowNodes.find(s => s.nodeId === child);
      if (!childInfo) break;
      chain.push(childInfo);
      current = child;
    }

    // Mark all chain members as visited
    for (const c of chain) visitedInChain.add(c.nodeId);

    if (chain.length >= 2) {
      // Check if chain nodes are truly sequential (each has exactly 1 incoming from chain)
      // If so, they might be parallelizable if they don't actually depend on each other's output
      const parallelizable = chain.every((info, i) => {
        if (i === 0) return true;
        const parents = incoming.get(info.nodeId) || [];
        // Parallelizable if the only parent is the previous chain node
        return parents.length === 1 && parents[0] === chain[i - 1].nodeId;
      });

      chains.push({
        nodeIds: chain.map(c => c.nodeId),
        labels: chain.map(c => c.label),
        totalMs: chain.reduce((sum, c) => sum + c.durationMs, 0),
        parallelizable,
      });
    }
  }

  return { slowNodes, chains, medianMs };
}

/**
 * Assess workflow health — returns structured issues and suggestions.
 * Designed to be called after execution, propagation, or on-demand.
 */
export function assessWorkflowHealth(
  nodes: Node<NodeData>[],
  edges: Edge[],
  now: number = Date.now(),
): HealthReport {
  if (nodes.length === 0) {
    return { score: 100, issues: [], suggestions: [] };
  }

  const issues: HealthIssue[] = [];
  const suggestions: HealthSuggestion[] = [];
  let score = 100;
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // ── 1. Disconnected nodes (orphans) ──────────────────────────────────────
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }
  const orphans = nodes.filter(n => !connectedIds.has(n.id));
  if (orphans.length > 0) {
    // Scale penalty by workflow size — 1 orphan in 5 nodes is severe, in 50 is minor
    const orphanPenalty = nodes.length >= 20 ? 3 : nodes.length >= 10 ? 5 : 8;
    score -= orphans.length * orphanPenalty;
    issues.push({
      id: 'orphan-nodes',
      priority: 'medium',
      message: `${orphans.length} disconnected node${orphans.length > 1 ? 's' : ''}: ${orphans.map(n => n.data.label).slice(0, 4).join(', ')}${orphans.length > 4 ? '...' : ''}`,
      nodeIds: orphans.map(n => n.id),
    });
    for (const n of orphans.slice(0, 2)) {
      if (n.data.category === 'output' || n.data.category === 'input') {
        suggestions.push({
          id: `connect-orphan-${n.id}`,
          message: `"${n.data.label}" (${n.data.category}) has no connections — is it part of the workflow?`,
          nodeIds: [n.id],
        });
      }
    }
  }

  // ── 2. Stale nodes with root-cause analysis ─────────────────────────────
  const staleNodes = nodes.filter(n => n.data.status === 'stale');
  // Build incoming adjacency for root-cause tracing
  const incomingMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!incomingMap.has(e.target)) incomingMap.set(e.target, []);
    incomingMap.get(e.target)!.push(e.source);
  }
  if (staleNodes.length > 0) {
    // Scale penalty by workflow size — 1 orphan in 5 nodes is worse than 1 in 50
    const penaltyPerNode = nodes.length >= 20 ? 5 : nodes.length >= 10 ? 8 : 10;
    score -= staleNodes.length * penaltyPerNode;
    const longStale = staleNodes.filter(n => {
      const lastUpdated = n.data.lastUpdated ?? 0;
      return lastUpdated > 0 && (now - lastUpdated) > 5 * 60 * 1000; // >5 min
    });

    // Root-cause analysis: trace each stale node to its upstream cause
    const rootCauses = new Map<string, string[]>(); // root node label → stale descendant labels
    for (const sn of staleNodes) {
      // Walk upstream to find the non-stale ancestor (the edit source)
      let current = sn.id;
      let rootLabel = sn.data.label;
      const visited = new Set<string>();
      while (true) {
        visited.add(current);
        const parents = incomingMap.get(current) || [];
        const staleParent = parents.find(p => !visited.has(p) && nodeById.get(p)?.data.status === 'stale');
        if (staleParent) {
          current = staleParent;
          continue;
        }
        // Found a non-stale parent or a root — this is the likely cause
        const editedParent = parents.find(p => !visited.has(p) && nodeById.get(p)?.data.status === 'active');
        if (editedParent) {
          rootLabel = nodeById.get(editedParent)?.data.label || editedParent;
        } else {
          rootLabel = nodeById.get(current)?.data.label || current;
        }
        break;
      }
      if (!rootCauses.has(rootLabel)) rootCauses.set(rootLabel, []);
      rootCauses.get(rootLabel)!.push(sn.data.label);
    }

    if (longStale.length > 0) {
      // Include root cause in the message
      const causeDetails = [...rootCauses.entries()]
        .slice(0, 2)
        .map(([root, affected]) => `"${root}" → ${affected.length} stale`)
        .join('; ');
      issues.push({
        id: 'long-stale',
        priority: 'high',
        message: `${longStale.length} node${longStale.length > 1 ? 's' : ''} stale for over 5 minutes${causeDetails ? ` (cause: ${causeDetails})` : ''}: ${longStale.map(n => n.data.label).slice(0, 3).join(', ')}`,
        nodeIds: longStale.map(n => n.id),
      });
      suggestions.push({
        id: 'refresh-long-stale',
        message: `Refresh ${longStale.length} long-stale node${longStale.length > 1 ? 's' : ''} to keep the workflow current`,
        action: 'refresh stale',
      });
    } else if (staleNodes.length > 0) {
      const causeDetails = [...rootCauses.entries()]
        .slice(0, 2)
        .map(([root, affected]) => `"${root}" → ${affected.join(', ')}`)
        .join('; ');
      issues.push({
        id: 'stale-nodes',
        priority: 'medium',
        message: `${staleNodes.length} stale node${staleNodes.length > 1 ? 's' : ''}${causeDetails ? ` (caused by: ${causeDetails})` : ''}`,
        nodeIds: staleNodes.map(n => n.id),
      });
    }
  }

  // ── 3. Nodes with no content ─────────────────────────────────────────────
  const contentCategories = new Set(['artifact', 'note', 'policy', 'state', 'review', 'action', 'cid', 'test', 'patch']);
  const emptyNodes = nodes.filter(n =>
    contentCategories.has(n.data.category) &&
    !n.data.content &&
    !n.data.description &&
    !n.data.executionResult
  );
  if (emptyNodes.length > 0) {
    score -= emptyNodes.length * 5;
    issues.push({
      id: 'empty-content',
      priority: 'low',
      message: `${emptyNodes.length} node${emptyNodes.length > 1 ? 's' : ''} with no content: ${emptyNodes.map(n => n.data.label).slice(0, 3).join(', ')}`,
      nodeIds: emptyNodes.map(n => n.id),
    });
    if (emptyNodes.length <= 3) {
      suggestions.push({
        id: 'auto-describe',
        message: `Generate content for ${emptyNodes.length} empty node${emptyNodes.length > 1 ? 's' : ''} with AI`,
        action: 'auto describe',
      });
    }
  }

  // ── 4. Long chains without review gates ──────────────────────────────────
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  // Find longest path from each root without hitting a review node
  const roots = nodes.filter(n => !edges.some(e => e.target === n.id));
  let maxChainWithoutReview = 0;
  let chainEndLabel = '';
  for (const root of (roots.length > 0 ? roots : [nodes[0]])) {
    const visited = new Set<string>();
    const stack: [string, number][] = [[root.id, 0]];
    while (stack.length > 0) {
      const [id, depth] = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodeById.get(id);
      const isReview = node?.data.category === 'review';
      const chainLen = isReview ? 0 : depth;
      if (chainLen > maxChainWithoutReview) {
        maxChainWithoutReview = chainLen;
        chainEndLabel = node?.data.label || id;
      }
      for (const next of (adj.get(id) || [])) {
        stack.push([next, isReview ? 0 : depth + 1]);
      }
    }
  }
  if (maxChainWithoutReview >= 5) {
    score -= 10;
    issues.push({
      id: 'no-review-gate',
      priority: 'medium',
      message: `Chain of ${maxChainWithoutReview}+ nodes without a review gate (ending at "${chainEndLabel}")`,
    });
    suggestions.push({
      id: 'add-review',
      message: `Add a review node before "${chainEndLabel}" to create a quality gate`,
    });
  }

  // ── 5. Missing output nodes ──────────────────────────────────────────────
  const hasOutput = nodes.some(n => n.data.category === 'output');
  const leafNodes = nodes.filter(n => !edges.some(e => e.source === n.id));
  const nonOutputLeaves = leafNodes.filter(n => n.data.category !== 'output');
  if (!hasOutput && nodes.length >= 3) {
    score -= 10;
    issues.push({
      id: 'no-output',
      priority: 'medium',
      message: 'No output node in the workflow — where do results go?',
    });
    if (nonOutputLeaves.length > 0) {
      suggestions.push({
        id: 'add-output',
        message: `"${nonOutputLeaves[0].data.label}" is a terminal node — consider adding an output node after it`,
        nodeIds: [nonOutputLeaves[0].id],
      });
    }
  } else if (nonOutputLeaves.length > 0 && hasOutput) {
    // Non-output terminal nodes
    for (const n of nonOutputLeaves.slice(0, 2)) {
      if (n.data.category !== 'review' && n.data.category !== 'note') {
        suggestions.push({
          id: `terminal-${n.id}`,
          message: `"${n.data.label}" has no downstream — is it an output or should it connect to something?`,
          nodeIds: [n.id],
        });
      }
    }
  }

  // ── 6. Execution failures ────────────────────────────────────────────────
  const failedNodes = nodes.filter(n => n.data.executionStatus === 'error');
  if (failedNodes.length > 0) {
    score -= failedNodes.length * 8;
    issues.push({
      id: 'exec-failures',
      priority: 'high',
      message: `${failedNodes.length} node${failedNodes.length > 1 ? 's' : ''} with execution errors: ${failedNodes.map(n => n.data.label).slice(0, 3).join(', ')}`,
      nodeIds: failedNodes.map(n => n.id),
    });
    suggestions.push({
      id: 'retry-failed',
      message: `Retry ${failedNodes.length} failed node${failedNodes.length > 1 ? 's' : ''}`,
      action: 'retry failed',
    });
  }

  // ── 7. No review node at all ─────────────────────────────────────────────
  const hasReview = nodes.some(n => n.data.category === 'review');
  if (!hasReview && nodes.length >= 4) {
    score -= 10;
    suggestions.push({
      id: 'suggest-review',
      message: 'No review node in the workflow — consider adding a quality gate',
    });
  }

  // ── 8. Execution bottlenecks ──────────────────────────────────────────────
  const bottlenecks = detectBottlenecks(nodes, edges);
  if (bottlenecks.slowNodes.length > 0) {
    score -= Math.min(15, bottlenecks.slowNodes.length * 3);
    const top = bottlenecks.slowNodes.slice(0, 3);
    const topLabels = top.map(s => `"${s.label}" (${(s.durationMs / 1000).toFixed(1)}s)`).join(', ');
    issues.push({
      id: 'bottleneck-slow-nodes',
      priority: bottlenecks.slowNodes.some(s => s.durationMs > 10000) ? 'high' : 'medium',
      message: `${bottlenecks.slowNodes.length} slow node${bottlenecks.slowNodes.length > 1 ? 's' : ''}: ${topLabels}`,
      nodeIds: bottlenecks.slowNodes.map(s => s.nodeId),
    });
  }
  if (bottlenecks.chains.length > 0) {
    const chain = bottlenecks.chains[0]; // highlight the worst chain
    if (chain.parallelizable) {
      suggestions.push({
        id: 'parallelize-chain',
        message: `Sequential chain [${chain.labels.join(' → ')}] took ${(chain.totalMs / 1000).toFixed(1)}s — these nodes may run in parallel`,
        action: 'optimize',
        nodeIds: chain.nodeIds,
      });
    } else {
      suggestions.push({
        id: 'optimize-chain',
        message: `Slow chain [${chain.labels.join(' → ')}] took ${(chain.totalMs / 1000).toFixed(1)}s total — consider simplifying prompts or splitting work`,
        nodeIds: chain.nodeIds,
      });
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    suggestions,
    bottlenecks: bottlenecks.slowNodes.length > 0 ? bottlenecks : undefined,
  };
}

/**
 * Format a health report as a readable markdown string.
 */
export function formatHealthReport(report: HealthReport, agentMode?: 'rowan' | 'poirot'): string {
  const { score, issues, suggestions } = report;
  const parts: string[] = [];

  // Score bar
  const barLen = 20;
  const filled = Math.round((score / 100) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  const level = score >= 80 ? 'healthy' : score >= 50 ? 'needs attention' : 'critical';
  parts.push(`**Health: \`${bar}\` ${score}/100** (${level})`);

  if (issues.length > 0) {
    parts.push('');
    parts.push('**Issues:**');
    const highFirst = [...issues].sort((a, b) => {
      const ord: Record<IssuePriority, number> = { high: 0, medium: 1, low: 2 };
      return ord[a.priority] - ord[b.priority];
    });
    for (const issue of highFirst) {
      const icon = issue.priority === 'high' ? '🔴' : issue.priority === 'medium' ? '🟡' : '🔵';
      parts.push(`${icon} ${issue.message}`);
    }
  }

  if (suggestions.length > 0) {
    parts.push('');
    parts.push('**Suggestions:**');
    for (const s of suggestions.slice(0, 4)) {
      parts.push(`- ${s.message}${s.action ? ` → \`${s.action}\`` : ''}`);
    }
  }

  if (issues.length === 0 && suggestions.length === 0) {
    parts.push('');
    parts.push(agentMode === 'poirot'
      ? 'The case is in excellent order, mon ami. No issues detected.'
      : 'All clear — no issues detected.');
  }

  return parts.join('\n');
}

/**
 * Compute a stable fingerprint for a set of issues, so we can detect when new issues appear.
 */
export function issueFingerprint(issues: HealthIssue[]): string {
  return issues.map(i => i.id).sort().join('|');
}
