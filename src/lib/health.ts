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

export interface HealthReport {
  score: number;
  issues: HealthIssue[];
  suggestions: HealthSuggestion[];
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

  // ── 1. Disconnected nodes (orphans) ──────────────────────────────────────
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }
  const orphans = nodes.filter(n => !connectedIds.has(n.id));
  if (orphans.length > 0) {
    score -= orphans.length * 8;
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

  // ── 2. Stale nodes sitting too long ──────────────────────────────────────
  const staleNodes = nodes.filter(n => n.data.status === 'stale');
  if (staleNodes.length > 0) {
    score -= staleNodes.length * 10;
    const longStale = staleNodes.filter(n => {
      const lastUpdated = n.data.lastUpdated ?? 0;
      return lastUpdated > 0 && (now - lastUpdated) > 5 * 60 * 1000; // >5 min
    });
    if (longStale.length > 0) {
      issues.push({
        id: 'long-stale',
        priority: 'high',
        message: `${longStale.length} node${longStale.length > 1 ? 's' : ''} stale for over 5 minutes: ${longStale.map(n => n.data.label).slice(0, 3).join(', ')}`,
        nodeIds: longStale.map(n => n.id),
      });
      suggestions.push({
        id: 'refresh-long-stale',
        message: `Refresh ${longStale.length} long-stale node${longStale.length > 1 ? 's' : ''} to keep the workflow current`,
        action: 'refresh stale',
      });
    } else if (staleNodes.length > 0) {
      issues.push({
        id: 'stale-nodes',
        priority: 'medium',
        message: `${staleNodes.length} stale node${staleNodes.length > 1 ? 's' : ''}`,
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
  const nodeById = new Map(nodes.map(n => [n.id, n]));
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

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    suggestions,
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
