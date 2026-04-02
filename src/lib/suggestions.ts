/**
 * Proactive CID Suggestions — graph-aware analysis that suggests specific next actions.
 * Pure functions, no store dependency. Used after workflow generation and execution.
 */

import type { Node, Edge } from '@xyflow/react';
import type { NodeData, EdgeCondition } from '@/lib/types';
import { analyzeRunPatterns, type ExecutionRunSummary } from '@/lib/prompts';

export type SuggestionPriority = 'high' | 'medium' | 'low';
export type SuggestionActionType =
  | 'add-node'
  | 'add-edge'
  | 'generate-content'
  | 'run-workflow'
  | 'command';

export interface ProactiveSuggestion {
  id: string;
  priority: SuggestionPriority;
  message: string;
  /** The display label for the clickable chip */
  chipLabel: string;
  /** Action type determines how CIDPanel handles the click */
  actionType: SuggestionActionType;
  /** For add-node: {label, category, connectAfter}. For add-edge: {from, to, label}. For command: the command string. */
  actionPayload: Record<string, string>;
}

/**
 * Analyze the graph and return specific, actionable suggestions.
 * Called after workflow generation and after execution.
 *
 * @param nodes        Current workflow nodes
 * @param edges        Current workflow edges
 * @param runHistory   Optional recent execution history for cross-run memory suggestions
 */
export function generateProactiveSuggestions(
  nodes: Node<NodeData>[],
  edges: Edge[],
  runHistory?: ExecutionRunSummary[],
): ProactiveSuggestion[] {
  if (nodes.length === 0) return [];

  const suggestions: ProactiveSuggestion[] = [];
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }
  const _nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e.target);
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
  }

  // ── 1. Missing output node ─────────────────────────────────────────────
  const hasOutput = nodes.some((n) => n.data.category === 'output');
  const leafNodes = nodes.filter((n) => !outgoing.has(n.id) || outgoing.get(n.id)!.length === 0);
  const nonOutputLeaves = leafNodes.filter(
    (n) => n.data.category !== 'output' && n.data.category !== 'note',
  );
  if (!hasOutput && nonOutputLeaves.length > 0) {
    const last = nonOutputLeaves[nonOutputLeaves.length - 1];
    suggestions.push({
      id: 'add-output',
      priority: 'high',
      message: `No output node — add one after "${last.data.label}" to capture the final deliverable`,
      chipLabel: `Add output after ${last.data.label}`,
      actionType: 'add-node',
      actionPayload: { label: 'Output', category: 'output', connectAfter: last.data.label },
    });
  }

  // ── 2. Dead-end producer nodes ─────────────────────────────────────────
  // Nodes that produce content but nothing consumes it (not output/note)
  if (hasOutput) {
    for (const leaf of nonOutputLeaves.slice(0, 2)) {
      if (['artifact', 'action', 'cid', 'state'].includes(leaf.data.category)) {
        suggestions.push({
          id: `dead-end-${leaf.id}`,
          priority: 'medium',
          message: `"${leaf.data.label}" produces content but nothing uses it`,
          chipLabel: `Connect ${leaf.data.label} →`,
          actionType: 'command',
          actionPayload: { command: `connect "${leaf.data.label}" to ` },
        });
      }
    }
  }

  // ── 3. Empty content nodes ─────────────────────────────────────────────
  const contentCategories = new Set([
    'artifact',
    'note',
    'policy',
    'state',
    'review',
    'action',
    'cid',
    'test',
    'patch',
  ]);
  const emptyNodes = nodes.filter(
    (n) =>
      contentCategories.has(n.data.category) &&
      !n.data.content &&
      !n.data.description &&
      !n.data.executionResult,
  );
  if (emptyNodes.length > 0 && emptyNodes.length <= 5) {
    const names = emptyNodes.slice(0, 3).map((n) => n.data.label);
    suggestions.push({
      id: 'generate-empty',
      priority: 'medium',
      message: `${emptyNodes.length} node${emptyNodes.length > 1 ? 's' : ''} have no content yet: ${names.join(', ')}`,
      chipLabel: `Generate content for ${emptyNodes.length} node${emptyNodes.length > 1 ? 's' : ''}`,
      actionType: 'command',
      actionPayload: { command: 'auto describe' },
    });
  }

  // ── 4. No review gate in a workflow with 4+ nodes ─────────────────────
  const hasReview = nodes.some((n) => n.data.category === 'review');
  if (!hasReview && nodes.length >= 4) {
    // Find the best place: after artifact/action nodes, before output
    const artifacts = nodes.filter(
      (n) => n.data.category === 'artifact' && (outgoing.get(n.id)?.length ?? 0) > 0,
    );
    const target =
      artifacts[artifacts.length - 1] || leafNodes.find((n) => n.data.category !== 'output');
    if (target) {
      suggestions.push({
        id: 'add-review',
        priority: 'medium',
        message: `No review gate — add one after "${target.data.label}" for quality control`,
        chipLabel: `Add review gate`,
        actionType: 'add-node',
        actionPayload: {
          label: 'Review Gate',
          category: 'review',
          connectAfter: target.data.label,
        },
      });
    }
  }

  // ── 5. Linear workflow without parallel branches ───────────────────────
  const maxFanOut = Math.max(0, ...nodes.map((n) => outgoing.get(n.id)?.length ?? 0));
  if (maxFanOut <= 1 && nodes.length >= 5) {
    // Find a node that could fan out
    const generators = nodes.filter(
      (n) =>
        ['cid', 'state', 'action'].includes(n.data.category) &&
        (outgoing.get(n.id)?.length ?? 0) === 1,
    );
    if (generators.length > 0) {
      suggestions.push({
        id: 'suggest-parallel',
        priority: 'low',
        message:
          'This workflow is purely linear — consider adding parallel branches for independent tasks',
        chipLabel: 'Suggest parallel branches',
        actionType: 'command',
        actionPayload: { command: 'optimize' },
      });
    }
  }

  // ── 6. Unexecuted workflow (all idle) ──────────────────────────────────
  const allIdle = nodes.every((n) => !n.data.executionStatus || n.data.executionStatus === 'idle');
  const hasContent = nodes.some((n) => n.data.content || n.data.description);
  if (allIdle && hasContent && nodes.length >= 3) {
    suggestions.push({
      id: 'run-workflow',
      priority: 'high',
      message: "Workflow is ready but hasn't been executed yet",
      chipLabel: 'Run workflow',
      actionType: 'command',
      actionPayload: { command: 'run workflow' },
    });
  }

  // ── 7. Execution bottlenecks ────────────────────────────────────────────
  const timedNodes = nodes.filter(
    (n) =>
      n.data._executionDurationMs != null &&
      n.data._executionDurationMs > 0 &&
      n.data.executionStatus === 'success',
  );
  if (timedNodes.length >= 2) {
    const durations = timedNodes.map((n) => n.data._executionDurationMs!).sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    const median =
      durations.length % 2 === 0 ? (durations[mid - 1] + durations[mid]) / 2 : durations[mid];
    const slowest = timedNodes.reduce((a, b) =>
      (a.data._executionDurationMs ?? 0) > (b.data._executionDurationMs ?? 0) ? a : b,
    );
    const slowMs = slowest.data._executionDurationMs ?? 0;
    if (slowMs > 5000 || (median > 0 && slowMs > median * 2)) {
      suggestions.push({
        id: 'bottleneck-optimize',
        priority: slowMs > 10000 ? 'high' : 'medium',
        message: `"${slowest.data.label}" took ${(slowMs / 1000).toFixed(1)}s (median: ${(median / 1000).toFixed(1)}s) — consider simplifying its prompt or splitting into smaller nodes`,
        chipLabel: 'Show bottlenecks',
        actionType: 'command',
        actionPayload: { command: 'bottlenecks' },
      });
    }
  }

  // ── 8. Stale nodes after execution ─────────────────────────────────────
  const staleNodes = nodes.filter((n) => n.data.status === 'stale');
  if (staleNodes.length > 0) {
    suggestions.push({
      id: 'refresh-stale',
      priority: 'high',
      message: `${staleNodes.length} stale node${staleNodes.length > 1 ? 's' : ''} need refreshing`,
      chipLabel: 'Refresh stale',
      actionType: 'command',
      actionPayload: { command: 'refresh stale' },
    });
  }

  // ── 9. Decision node with too few outgoing branches ─────────────────────
  // A decision node with 0 or 1 outgoing edges cannot meaningfully route.
  const decisionNodes = nodes.filter((n) => n.data.category === 'decision');
  for (const dn of decisionNodes) {
    const outEdgeCount = edges.filter((e) => e.source === dn.id).length;
    if (outEdgeCount <= 1) {
      suggestions.push({
        id: `decision-needs-branches`,
        priority: 'high',
        message: `Decision node "${dn.data.label}" has ${outEdgeCount === 0 ? 'no' : 'only 1'} outgoing branch — add 2+ edges with conditions for routing to work`,
        chipLabel: `Fix decision branches`,
        actionType: 'command',
        actionPayload: { command: `focus ${dn.data.label}` },
      });
      break; // one decision warning at a time
    }
  }

  // ── 10. Low-confidence decision after execution ──────────────────────────
  // Surfaces decisions where the LLM was uncertain — the routing may be fragile.
  const lowConfDecisions = nodes.filter(
    (n) =>
      n.data.category === 'decision' &&
      n.data.executionStatus === 'success' &&
      n.data.decisionConfidence !== undefined &&
      n.data.decisionConfidence < 0.5,
  );
  if (lowConfDecisions.length > 0) {
    const dn = lowConfDecisions[0];
    const confPct = Math.round((dn.data.decisionConfidence ?? 0) * 100);
    suggestions.push({
      id: 'low-confidence-decision',
      priority: 'high',
      message: `"${dn.data.label}" routed with only ${confPct}% confidence — the decision may be unreliable; consider adding more context upstream`,
      chipLabel: 'Review decision',
      actionType: 'command',
      actionPayload: { command: `focus ${dn.data.label}` },
    });
  }

  // ── 11. Decision edges without conditions ────────────────────────────────
  // A decision node whose outgoing edges lack `decision-is` conditions will
  // execute ALL downstream branches regardless of the routing outcome.
  for (const dn of decisionNodes) {
    const outEdges = edges.filter((e) => e.source === dn.id);
    if (outEdges.length >= 2) {
      const unconditioned = outEdges.filter((e) => {
        const cond = e.data?.condition as EdgeCondition | undefined;
        return !cond || cond.type !== 'decision-is';
      });
      if (unconditioned.length > 0) {
        suggestions.push({
          id: `decision-missing-conditions`,
          priority: 'high',
          message: `Decision node "${dn.data.label}" has ${unconditioned.length} outgoing edge${unconditioned.length > 1 ? 's' : ''} without "decision-is" conditions — all branches will execute regardless of the routing choice`,
          chipLabel: `Fix ${dn.data.label} conditions`,
          actionType: 'command',
          actionPayload: { command: `focus ${dn.data.label}` },
        });
        break; // one at a time
      }
    }
  }

  // ── 12–14. Cross-run memory suggestions ─────────────────────────────────
  // Leverage execution history to surface patterns invisible in a single run.
  if (runHistory && runHistory.length >= 2) {
    const patterns = analyzeRunPatterns(runHistory);
    if (patterns) {
      // 12. Recurring failures — same node fails across multiple runs
      if (patterns.recurringFailures.length > 0) {
        const label = patterns.recurringFailures[0];
        const failCount = runHistory.filter((r) => r.failedNodeLabels.includes(label)).length;
        suggestions.push({
          id: 'recurring-failure',
          priority: 'high',
          message: `"${label}" has failed in ${failCount} of the last ${runHistory.length} run${runHistory.length > 1 ? 's' : ''} — this may be a structural issue, not a transient error`,
          chipLabel: `Investigate ${label}`,
          actionType: 'command',
          actionPayload: { command: `focus ${label}` },
        });
      }

      // 13. Performance degradation — runs are taking longer over time
      if (patterns.performanceTrend === 'degrading') {
        const latest = runHistory[0];
        const oldest = runHistory[Math.min(runHistory.length - 1, 3)];
        const deltaSec = Math.round((latest.durationMs - oldest.durationMs) / 1000);
        suggestions.push({
          id: 'performance-degrading',
          priority: 'medium',
          message: `Workflow execution time is increasing (+${deltaSec}s over recent runs) — consider splitting slow nodes or reducing prompt size`,
          chipLabel: 'Show bottlenecks',
          actionType: 'command',
          actionPayload: { command: 'bottlenecks' },
        });
      }

      // 14. Stable decision — same branch chosen every run; workflow may be over-engineered
      if (patterns.stableDecisions.length > 0) {
        const sd = patterns.stableDecisions[0];
        suggestions.push({
          id: 'stable-decision',
          priority: 'low',
          message: `Decision node "${sd.label}" always routes to "${sd.decision}" (${sd.runCount}× consistent) — this branch may be predictable enough to hardcode`,
          chipLabel: `Review ${sd.label}`,
          actionType: 'command',
          actionPayload: { command: `focus ${sd.label}` },
        });
      }
    }
  }

  // Sort by priority, then diversify: pick max 1 per category to avoid clustering
  const priorityOrder: Record<SuggestionPriority, number> = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Categorize suggestions by type for diversity
  const typeMap: Record<string, string> = {
    'add-output': 'structure',
    'add-review': 'structure',
    'suggest-parallel': 'structure',
    'generate-empty': 'content',
    'run-workflow': 'execution',
    'refresh-stale': 'execution',
    'bottleneck-optimize': 'performance',
    'decision-needs-branches': 'decision',
    'decision-missing-conditions': 'decision',
    'low-confidence-decision': 'decision',
    'recurring-failure': 'memory',
    'performance-degrading': 'memory',
    'stable-decision': 'memory',
  };
  const diverse: ProactiveSuggestion[] = [];
  const seenCategories = new Set<string>();
  // First pass: pick highest-priority unique categories
  for (const s of suggestions) {
    const cat = typeMap[s.id] || s.id.split('-')[0] || 'other';
    if (!seenCategories.has(cat)) {
      diverse.push(s);
      seenCategories.add(cat);
      if (diverse.length >= 3) break;
    }
  }
  // Second pass: fill remaining slots if we have <3
  if (diverse.length < 3) {
    for (const s of suggestions) {
      if (!diverse.includes(s)) {
        diverse.push(s);
        if (diverse.length >= 3) break;
      }
    }
  }
  return diverse;
}

/**
 * Format suggestions into a CID message with clickable suggestion chips.
 * Returns { message, suggestions } where suggestions use the "action:" prefix pattern.
 */
export function formatSuggestionsMessage(
  suggestions: ProactiveSuggestion[],
  context: 'post-build' | 'post-execution',
): { content: string; suggestionChips: string[] } | null {
  if (suggestions.length === 0) return null;

  const header = context === 'post-build' ? '### Suggestions' : '### Next Steps';

  const lines = suggestions.map((s) => `- ${s.message}`);
  const content = `${header}\n${lines.join('\n')}`;

  // Encode suggestions as "action:id|chipLabel" for CIDPanel to detect
  const suggestionChips = suggestions.map((s) => `action:${s.id}|${s.chipLabel}`);

  return { content, suggestionChips };
}
