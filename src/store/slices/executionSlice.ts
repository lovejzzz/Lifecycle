/**
 * Execution Slice — executeNode, executeWorkflow, executeBranch, and related actions.
 * Handles the full agent tool loop, topological sort + parallel execution,
 * pre-flight checks, rollback, retry, and diff.
 *
 * Cross-slice dependencies: nodes, edges, cidMode, cidAIModel, isProcessing,
 *   _executingNodeIds, _lockNode, _unlockNode, _sharedNodeContext, _costBudgetUSD,
 *   _sessionCost, _usageStats, _dismissedSuggestionIds, _lastHealthFingerprint,
 *   _lastSuggestions, addMessage, addEvent, addToast, updateNodeData, updateNodeStatus,
 *   setProcessing, trackCost, snapshotBeforeExecution, runHealthCheck (via get()).
 */

import type { StateCreator } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { LifecycleStore } from '../types';
import type { NodeData, WorkflowContext, EdgeCondition } from '@/lib/types';
import { callCID, callCIDOnce } from '@/lib/cidClient';
import {
  getExecutionSystemPrompt,
  buildRelevanceWeightedContext,
  extractNodeSignal,
  buildAncestorContextHint,
  inferEffortFromCategory,
  recordExecutionRun,
} from '@/lib/prompts';
import type { ExecutionRunSummary } from '@/lib/prompts';
import { topoSort, getUpstreamSubgraph, markdownToHTML, buildExecutionPlan } from '@/lib/graph';
import {
  buildCacheKey,
  sha256,
  getCacheEntry,
  setCacheEntry,
  estimateBatchCost,
} from '@/lib/cache';
import { validateOutput, extractKeywords, buildRefinementPrompt } from '@/lib/validate';
import {
  getDecisionSystemPrompt,
  parseDecisionOutput,
  decisionMatchesCondition,
  normalizeDecisionToOption,
  assessDecisionInputSufficiency,
  buildDecisionContextValue,
  DECISION_LOW_CONFIDENCE_THRESHOLD,
} from '@/lib/decision';
import { generateProactiveSuggestions, formatSuggestionsMessage } from '@/lib/suggestions';
import { cidLog } from '../helpers';
import { uid } from '../useStore';

export interface ExecutionSlice {
  // State
  executionProgress: {
    current: number;
    total: number;
    currentLabel: string;
    running: boolean;
    stage?: number;
    totalStages?: number;
    succeeded?: number;
    failed?: number;
    skipped?: number;
  } | null;
  executionStartTime: number | null;
  lastExecutionSnapshot: Map<string, string>;
  _preExecutionSnapshot: { nodes: Node<NodeData>[]; edges: Edge[] } | null;

  // Actions
  executeNode: (nodeId: string) => Promise<void>;
  executeWorkflow: () => Promise<void>;
  executeBranch: (nodeId: string) => Promise<void>;
  snapshotBeforeExecution: () => void;
  rollbackExecution: () => boolean;
  retryFailed: () => Promise<void>;
  clearExecutionResults: () => string;
  getPreFlightSummary: () => string;
  diffLastRun: () => string;
}

export const createExecutionSlice: StateCreator<LifecycleStore, [], [], ExecutionSlice> = (
  set,
  get,
) => ({
  executionProgress: null,
  executionStartTime: null,
  lastExecutionSnapshot: new Map(),
  _preExecutionSnapshot: null as { nodes: Node<NodeData>[]; edges: Edge[] } | null,

  snapshotBeforeExecution: () => {
    const { nodes, edges } = get();
    set({
      _preExecutionSnapshot: {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      },
    });
  },

  rollbackExecution: () => {
    const snapshot = get()._preExecutionSnapshot;
    if (!snapshot) return false;
    set({ nodes: snapshot.nodes, edges: snapshot.edges, _preExecutionSnapshot: null });
    return true;
  },

  executeNode: async (nodeId: string) => {
    // Mutex: prevent double-execution of same node
    if (get()._executingNodeIds.has(nodeId)) {
      cidLog('executeNode:skipped', { nodeId, reason: 'already executing' });
      return;
    }
    get()._lockNode(nodeId);

    const store = get();
    const node = store.nodes.find((n) => n.id === nodeId);
    if (!node) {
      get()._unlockNode(nodeId);
      return;
    }
    cidLog('executeNode', { nodeId, label: node.data.label, category: node.data.category });

    const d = node.data;
    const _execStart = Date.now();

    // Passthrough categories: these don't call the AI API, they pass data downstream
    if (d.category === 'input') {
      const value = d.inputValue || d.content || '';
      store.updateNodeData(nodeId, {
        executionResult: value,
        executionStatus: value ? 'success' : 'idle',
        _executionStartedAt: _execStart,
        _executionDurationMs: Date.now() - _execStart,
      });
      get()._unlockNode(nodeId);
      return;
    }
    if (d.category === 'trigger') {
      const value = d.content || d.description || `Trigger: ${d.label}`;
      store.updateNodeData(nodeId, {
        executionResult: value,
        executionStatus: 'success',
        _executionStartedAt: _execStart,
        _executionDurationMs: Date.now() - _execStart,
      });
      get()._unlockNode(nodeId);
      return;
    }
    if (d.category === 'dependency') {
      const value = d.content || d.description || `Dependency: ${d.label}`;
      store.updateNodeData(nodeId, {
        executionResult: value,
        executionStatus: 'success',
        _executionStartedAt: _execStart,
        _executionDurationMs: Date.now() - _execStart,
      });
      get()._unlockNode(nodeId);
      return;
    }

    // Decision nodes get a special execution prompt that forces a routing decision
    if (d.category === 'decision') {
      const inEdges = store.edges.filter((e) => e.target === nodeId);
      const upstreamData = inEdges
        .map((e) => {
          const src = store.nodes.find((n) => n.id === e.source);
          if (!src) return '';
          const content = (src.data.executionResult || src.data.content || '').slice(0, 1000);
          const signal = extractNodeSignal(content, src.data.category || '');
          // Include execution status so decision node can factor in upstream errors/skips
          const statusTag =
            src.data.executionStatus === 'error'
              ? ' [ERROR]'
              : src.data.executionStatus === 'skipped'
                ? ' [SKIPPED]'
                : '';
          const prefix = signal
            ? `[${src.data.label}${statusTag}] ${signal}`
            : `[${src.data.label}${statusTag}]`;
          return `${prefix}:\n${content}`;
        })
        .filter(Boolean)
        .join('\n\n');

      const outEdges = store.edges.filter((e) => e.source === nodeId);
      const options =
        d.decisionOptions ||
        outEdges.map((e) => {
          const cond = e.data?.condition as EdgeCondition | undefined;
          if (cond?.type === 'decision-is') return cond.value;
          const tgt = store.nodes.find((n) => n.id === e.target);
          return tgt?.data.label || 'unknown';
        });

      const decisionPrompt =
        d.aiPrompt || d.content || `Evaluate the upstream data and decide which path to take.`;
      const systemPrompt = getDecisionSystemPrompt(
        options,
        d.label,
        d.description,
        store.cidMode,
        store._sharedNodeContext,
      );

      // Assess upstream input quality and append a calibration hint when inputs
      // are empty, all-error, or sparse. This keeps confidence scores honest
      // and nudges the LLM toward fallback branches when nothing is usable.
      const inputSufficiencyHint = assessDecisionInputSufficiency(upstreamData);
      const userContent = inputSufficiencyHint
        ? `${decisionPrompt}\n\n--- UPSTREAM DATA ---\n${upstreamData}${inputSufficiencyHint}`
        : `${decisionPrompt}\n\n--- UPSTREAM DATA ---\n${upstreamData}`;

      try {
        store.updateNodeData(nodeId, {
          executionStatus: 'running',
          _executionStartedAt: _execStart,
        });
        const data = await callCID({
          systemPrompt,
          messages: [
            {
              role: 'user',
              content: userContent,
            },
          ],
          model: store.cidAIModel,
          taskType: 'analyze',
          timeout: 60000,
        });
        if (data.usage)
          store.trackCost(data.usage.prompt_tokens, data.usage.completion_tokens, store.cidAIModel);
        let output = data.result?.message || data.result?.content || '';
        const _execDuration = Date.now() - _execStart;
        // Parse structured output immediately so fields are available in executeNode context
        let parsed = parseDecisionOutput(output);

        // ── Confidence-aware retry ──────────────────────────────────────────
        // When the LLM signals low confidence (< threshold), make a single follow-up
        // call asking it to re-examine the evidence before committing to a branch.
        // Only retry if the initial confidence was explicitly reported (not undefined).
        if (
          parsed.confidence !== undefined &&
          parsed.confidence < DECISION_LOW_CONFIDENCE_THRESHOLD
        ) {
          cidLog('executeNode:decision:low-confidence-retry', {
            nodeId,
            label: d.label,
            confidence: parsed.confidence,
          });
          try {
            const retryData = await callCID({
              systemPrompt,
              messages: [
                {
                  role: 'user',
                  content: userContent,
                },
                { role: 'assistant' as const, content: output },
                {
                  role: 'user' as const,
                  content:
                    `Your confidence was ${parsed.confidence.toFixed(2)}, which is below the required threshold. ` +
                    `Re-examine the upstream evidence more carefully. ` +
                    `Focus on the strongest signals that distinguish between the options. ` +
                    `Respond with the same DECISION/CONFIDENCE/REASONING format — do not add extra text.`,
                },
              ],
              model: store.cidAIModel,
              taskType: 'analyze',
              timeout: 60000,
            });
            if (retryData.usage)
              store.trackCost(
                retryData.usage.prompt_tokens,
                retryData.usage.completion_tokens,
                store.cidAIModel,
              );
            const retryOutput = retryData.result?.message || retryData.result?.content || '';
            if (retryOutput) {
              const retryParsed = parseDecisionOutput(retryOutput);
              // Only accept the retry if it yields equal or higher confidence
              const retryConf = retryParsed.confidence ?? 0;
              const origConf = parsed.confidence ?? 0;
              if (retryConf >= origConf) {
                output = retryOutput;
                parsed = retryParsed;
                cidLog('executeNode:decision:retry-accepted', {
                  nodeId,
                  originalConfidence: origConf,
                  retryConfidence: retryConf,
                });
              }
            }
          } catch {
            // Retry failure is non-fatal — proceed with original parse
          }
        }

        // Normalize to canonical option name so decisionResult is always a clean label
        // (e.g. "I'll escalate this" → "escalate") — critical for reliable edge routing
        const normalizedDecision =
          normalizeDecisionToOption(parsed.decision, options as string[]) ?? parsed.decision;
        store.updateNodeData(nodeId, {
          executionResult: output,
          executionStatus: 'success',
          _executionDurationMs: _execDuration,
          decisionResult: normalizedDecision,
          ...(parsed.confidence !== undefined ? { decisionConfidence: parsed.confidence } : {}),
          ...(parsed.reasoning ? { decisionExplanation: parsed.reasoning } : {}),
          ...(parsed.alternatives?.length ? { decisionAlternatives: parsed.alternatives } : {}),
        });
        // Also persist the decision into the shared node context for single-node
        // executions (outside of executeWorkflow). This ensures downstream prompts
        // can reference the routing decision even when run individually.
        const decisionContextKey = `decision:${d.label}`;
        const decisionContextValue = buildDecisionContextValue(
          normalizedDecision,
          parsed.confidence,
          parsed.reasoning,
        );
        set((s) => ({
          _sharedNodeContext: {
            ...s._sharedNodeContext,
            [decisionContextKey]: decisionContextValue,
          },
        }));
        cidLog('executeNode:decision', {
          nodeId,
          label: d.label,
          decision: normalizedDecision,
          confidence: parsed.confidence,
        });
      } catch (err) {
        store.updateNodeData(nodeId, {
          executionStatus: 'error',
          executionError: err instanceof Error ? err.message : 'Decision node execution failed',
          _executionDurationMs: Date.now() - _execStart,
        });
      }
      get()._unlockNode(nodeId);
      return;
    }

    // For non-AI nodes (artifact, state, review, output, etc.), aggregate upstream results
    const incomingEdges = store.edges.filter((e) => e.target === nodeId);

    // Circuit breaker: skip if any required upstream node failed
    const upstreamNodes = incomingEdges
      .map((e) => store.nodes.find((n) => n.id === e.source))
      .filter(Boolean);
    const failedUpstream = upstreamNodes.filter((n) => n!.data.executionStatus === 'error');
    if (failedUpstream.length > 0 && d.category !== 'note') {
      const failNames = failedUpstream.map((n) => n!.data.label).join(', ');
      store.updateNodeData(nodeId, {
        executionStatus: 'error',
        executionError: `Skipped: upstream node(s) failed (${failNames}). Fix upstream errors first.`,
        _executionStartedAt: _execStart,
        _executionDurationMs: 0,
      });
      get()._unlockNode(nodeId);
      return;
    }

    const upstreamResults = incomingEdges
      .map((e) => {
        const src = store.nodes.find((n) => n.id === e.source);
        return src?.data.executionResult || src?.data.content || '';
      })
      .filter(Boolean);

    // Output node with file format — trigger actual file download
    if (d.category === 'output' && d.outputFormat) {
      const content = upstreamResults.join('\n\n---\n\n') || d.content || '';
      if (!content) {
        store.updateNodeData(nodeId, {
          executionStatus: 'error',
          executionError: 'No content from upstream nodes to export.',
          _executionStartedAt: _execStart,
          _executionDurationMs: Date.now() - _execStart,
        });
        get()._unlockNode(nodeId);
        return;
      }

      try {
        let blob: Blob;
        const filename = `${d.label
          .replace(/[^a-zA-Z0-9 ]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;

        if (d.outputFormat === 'pdf') {
          // Generate a styled HTML document and open print dialog for PDF
          const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${d.label}</title>
<style>body{font-family:'Georgia','Times New Roman',serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.8;color:#1a1a1a}
h1{font-size:28px;border-bottom:2px solid #333;padding-bottom:8px}h2{font-size:22px;margin-top:30px;color:#333}h3{font-size:18px;color:#555}
p{margin:10px 0}ul,ol{margin:10px 0 10px 20px}li{margin:4px 0}
code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:14px}
pre{background:#f4f4f4;padding:16px;border-radius:6px;overflow-x:auto}
blockquote{border-left:4px solid #ddd;margin:16px 0;padding:8px 16px;color:#666}
hr{border:none;border-top:1px solid #ddd;margin:24px 0}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f4f4f4}
@media print{body{margin:0;padding:20px}}</style></head>
<body>${markdownToHTML(content)}</body></html>`;
          // Open in new window for print-to-PDF
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            setTimeout(() => printWindow.print(), 500);
          }
          store.updateNodeData(nodeId, {
            executionResult: content,
            executionStatus: 'success',
            _executionStartedAt: _execStart,
            _executionDurationMs: Date.now() - _execStart,
          });
          store.addToast(`PDF ready — use your browser's print dialog to save as PDF`, 'success');
          get()._unlockNode(nodeId);
          return;
        } else if (d.outputFormat === 'html') {
          const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${d.label}</title></head><body>${markdownToHTML(content)}</body></html>`;
          blob = new Blob([htmlContent], { type: 'text/html' });
        } else if (d.outputFormat === 'json') {
          blob = new Blob(
            [
              JSON.stringify(
                { title: d.label, content, exportedAt: new Date().toISOString() },
                null,
                2,
              ),
            ],
            { type: 'application/json' },
          );
        } else {
          // md, txt, csv, etc. — plain text download
          blob = new Blob([content], { type: d.outputMimeType || 'text/plain' });
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.${d.outputFormat}`;
        a.click();
        URL.revokeObjectURL(url);

        store.updateNodeData(nodeId, {
          executionResult: content,
          executionStatus: 'success',
          _executionStartedAt: _execStart,
          _executionDurationMs: Date.now() - _execStart,
        });
        store.addToast(
          `Downloaded ${d.outputFormatLabel || d.outputFormat.toUpperCase()} file`,
          'success',
        );
        get()._unlockNode(nodeId);
        return;
      } catch {
        store.updateNodeData(nodeId, {
          executionStatus: 'error',
          executionError: 'Failed to export file.',
          _executionStartedAt: _execStart,
          _executionDurationMs: Date.now() - _execStart,
        });
        get()._unlockNode(nodeId);
        return;
      }
    }

    // If node already has rich content and upstream nodes have no execution results
    // (i.e. content was pre-generated by API), use existing content as execution result
    const hasUpstreamExecResults = incomingEdges.some((e) => {
      const src = store.nodes.find((n) => n.id === e.source);
      return src?.data.executionResult && src.data.executionResult !== src.data.content;
    });
    if (d.content && d.content.length > 50 && !hasUpstreamExecResults && !d.aiPrompt) {
      store.updateNodeData(nodeId, {
        executionResult: d.content,
        executionStatus: 'success',
        _executionStartedAt: _execStart,
        _executionDurationMs: Date.now() - _execStart,
      });
      get()._unlockNode(nodeId);
      return;
    }

    // Build edge-aware context: which upstream nodes feed this one and via which relationship
    const edgeContext = incomingEdges.map((e) => {
      const src = store.nodes.find((n) => n.id === e.source);
      const label =
        (typeof e.label === 'string' ? e.label : (e.data?.label as string)) || 'connects';
      return {
        from: src?.data.label || 'Unknown',
        relationship: label,
        category: src?.data.category || '',
      };
    });
    const relationshipHint =
      edgeContext.length > 0
        ? ` You receive input via: ${edgeContext.map((e) => `"${e.relationship}" from "${e.from}" (${e.category})`).join(', ')}.`
        : '';

    // Downstream awareness — tell the node what consumers expect
    const outgoingEdges = store.edges.filter((e) => e.source === nodeId);
    const downstreamHint =
      outgoingEdges.length > 0
        ? ` Your output will be used by: ${outgoingEdges
            .map((e) => {
              const tgt = store.nodes.find((n) => n.id === e.target);
              const label =
                (typeof e.label === 'string' ? e.label : (e.data?.label as string)) || 'next step';
              return `"${tgt?.data.label}" (${label})`;
            })
            .join(', ')}. Tailor your output format accordingly.`
        : '';

    // Build an execution prompt — either from explicit aiPrompt or auto-generated from node context
    const autoPrompt =
      d.aiPrompt ||
      (() => {
        const cat = d.category;
        const label = d.label;
        const desc = d.description || '';
        // Edge-semantic overrides for specific category+edge combinations
        const hasValidatesEdge = edgeContext.some((e) => e.relationship === 'validates');
        const hasMonitorsEdge = edgeContext.some((e) => e.relationship === 'monitors');
        const hasTriggersEdge = edgeContext.some((e) => e.relationship === 'triggers');
        if (cat === 'review' && hasValidatesEdge)
          return `Review and validate the content received from upstream for "${label}".${relationshipHint}${downstreamHint} ${desc}`;
        if (cat === 'policy' && hasMonitorsEdge)
          return `Check the content against policy rules for "${label}".${relationshipHint}${downstreamHint} ${desc}`;
        if (cat === 'action' && hasTriggersEdge)
          return `Execute this action triggered by upstream for "${label}".${relationshipHint}${downstreamHint} ${desc}`;
        if (cat === 'cid')
          return `Process and transform the input content for "${label}".${relationshipHint}${downstreamHint} ${desc}`;
        if (cat === 'artifact')
          return `Generate detailed, professional content for "${label}".${relationshipHint}${downstreamHint} ${desc} Include all relevant sections. Write real content, not placeholders. Use markdown formatting.`;
        if (cat === 'state')
          return `Analyze and organize the input content for "${label}".${relationshipHint}${downstreamHint} ${desc} Structure the information clearly and extract key points.`;
        if (cat === 'review')
          return `Review the following content for quality, completeness, and accuracy. Provide a brief assessment and note any issues. For "${label}":${relationshipHint}${downstreamHint} ${desc}`;
        if (cat === 'note')
          return `Summarize and organize research notes for "${label}".${relationshipHint}${downstreamHint} ${desc} Extract key insights and organize them clearly.`;
        if (cat === 'policy')
          return `Define and document the policy rules for "${label}".${relationshipHint}${downstreamHint} ${desc}`;
        if (cat === 'trigger')
          return `Define the trigger conditions for "${label}".${relationshipHint}${downstreamHint} ${desc} Specify what events, schedules, or conditions activate this step.`;
        if (cat === 'test')
          return `Design and execute tests for "${label}".${relationshipHint}${downstreamHint} ${desc} Define test cases, expected outcomes, and report pass/fail results.`;
        if (cat === 'action')
          return `Execute the action for "${label}".${relationshipHint}${downstreamHint} ${desc} Describe the operation, its inputs, outputs, and any side effects.`;
        if (cat === 'patch')
          return `Generate a patch or fix for "${label}".${relationshipHint}${downstreamHint} ${desc} Identify the issue, describe the fix, and provide the corrected content.`;
        if (cat === 'dependency')
          return `Analyze and resolve dependencies for "${label}".${relationshipHint}${downstreamHint} ${desc} List required dependencies, their status, and any conflicts.`;
        if (cat === 'output' && !d.outputFormat) return null; // Output nodes pass through upstream content
        if (cat === 'process')
          return `Process and transform the input for "${label}".${relationshipHint}${downstreamHint} ${desc} Be thorough and structured.`;
        if (cat === 'deliverable')
          return `Generate detailed, professional content for "${label}".${relationshipHint}${downstreamHint} ${desc} Include all relevant sections. Write real content, not placeholders. Use markdown formatting.`;
        return null;
      })();

    // If no prompt could be generated, pass through upstream content
    if (!autoPrompt) {
      const passthrough = upstreamResults.join('\n\n---\n\n') || d.content || '';
      store.updateNodeData(nodeId, {
        executionResult: passthrough,
        executionStatus: passthrough ? 'success' : 'idle',
        _executionStartedAt: _execStart,
        _executionDurationMs: Date.now() - _execStart,
      });
      get()._unlockNode(nodeId);
      return;
    }

    // JIT context scoping: full results from direct parents, truncated from ancestors
    const directParentIds = new Set(incomingEdges.map((e) => e.source));
    const collectAncestors = (
      parentIds: Set<string>,
      depth: number,
    ): Array<{ label: string; result: string; category?: string }> => {
      if (depth <= 0 || parentIds.size === 0) return [];
      const grandparentEdges = store.edges.filter(
        (e) => parentIds.has(e.target) && !directParentIds.has(e.source),
      );
      const grandparents = new Map<string, { label: string; result: string; category?: string }>();
      for (const e of grandparentEdges) {
        const src = store.nodes.find((n) => n.id === e.source);
        if (src && !grandparents.has(src.id)) {
          const result = src.data.executionResult || src.data.content || '';
          grandparents.set(src.id, { label: src.data.label, result, category: src.data.category });
        }
      }
      const gpIds = new Set(grandparents.keys());
      return [...grandparents.values(), ...collectAncestors(gpIds, depth - 1)];
    };

    // Build relevance-weighted direct context: scores each upstream input against the
    // node's own task prompt so high-signal sources get more of the char budget.
    const directContextInputs = incomingEdges
      .map((e) => {
        const src = store.nodes.find((n) => n.id === e.source);
        const edgeLabel =
          (typeof e.label === 'string' ? e.label : (e.data?.label as string)) || 'connects';
        const srcResult = src?.data.executionResult || src?.data.content || '';
        return srcResult
          ? {
              label: src?.data.label || 'Unknown',
              relationship: edgeLabel,
              content: srcResult,
              category: src?.data.category,
            }
          : null;
      })
      .filter(
        (x): x is { label: string; relationship: string; content: string; category: string } =>
          x !== null,
      );

    const directContext = buildRelevanceWeightedContext(
      directContextInputs,
      autoPrompt || d.label,
      8000,
      d.category,
    );

    const ancestors = collectAncestors(directParentIds, 2);
    const ancestorSummary = buildAncestorContextHint(ancestors);

    const inputContext = directContext
      ? `## Direct inputs:\n${directContext}${ancestorSummary}`
      : d.content || 'No input provided.';

    // ── Cache check: skip LLM call if inputs haven't changed ──
    const cacheKeyRaw = buildCacheKey({
      nodeId,
      prompt: autoPrompt,
      upstreamResults,
      model: store.cidAIModel,
      category: d.category,
      content: d.content,
    });
    const cacheHash = await sha256(cacheKeyRaw);
    const cached = getCacheEntry(nodeId);
    if (cached && cached.hash === cacheHash) {
      cidLog('executeNode:cache-hit', { nodeId, label: d.label });
      store.updateNodeData(nodeId, {
        executionResult: cached.result,
        executionStatus: 'success',
        executionError: undefined,
        _executionStartedAt: _execStart,
        _executionDurationMs: Date.now() - _execStart,
      });
      store.updateNodeStatus(nodeId, 'active');
      // Track cache hit in usage stats
      set((s) => ({
        _usageStats: {
          ...s._usageStats,
          totalCalls: s._usageStats.totalCalls + 1,
          cachedSkips: s._usageStats.cachedSkips + 1,
        },
      }));
      get()._unlockNode(nodeId);
      return;
    }

    store.updateNodeData(nodeId, {
      executionStatus: 'running',
      executionError: undefined,
      _executionStartedAt: _execStart,
    });
    store.updateNodeStatus(nodeId, 'generating');
    set({ executionStartTime: _execStart });
    cidLog('executeNode:running', {
      nodeId,
      label: d.label,
      model: store.cidAIModel,
      upstreamCount: upstreamResults.length,
    });

    // Timeout abort controller — 120s max
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 120_000);

    try {
      // All AI execution routes through the server-side /api/cid route
      let output = '';

      {
        const { buildToolPrompt, parseToolCalls, executeTool, formatToolResults } =
          await import('@/lib/agentTools');
        const agentConfig = d.agentConfig;
        const tools = agentConfig?.tools || [];
        const toolPromptSuffix = buildToolPrompt(tools, store.cidMode);
        const maxIterations =
          (agentConfig?.enableLooping && agentConfig?.maxLoopIterations) ||
          (tools.length > 0 ? 3 : 1);
        const maxRetries = agentConfig?.maxRetries || 0;
        const timeoutMs = agentConfig?.timeoutMs || 120_000;

        // Override abort controller with agent-specific timeout
        clearTimeout(timeoutId);
        const agentAbort = new AbortController();
        const agentTimeoutId = setTimeout(() => agentAbort.abort(), timeoutMs);

        const downstreamCategories = outgoingEdges
          .map((e) => store.nodes.find((n) => n.id === e.target)?.data.category)
          .filter((c): c is string => Boolean(c));
        // Snapshot shared context at execution time — inject into system prompt so the LLM
        // immediately sees what prior nodes stored without needing a read_context tool call.
        const sharedCtxSnapshot = get()._sharedNodeContext;
        const systemPrompt =
          getExecutionSystemPrompt(
            d.category,
            d.label,
            inputContext,
            downstreamCategories,
            store.cidMode,
            Object.keys(sharedCtxSnapshot).length > 0 ? sharedCtxSnapshot : undefined,
            directContextInputs.length,
          ) + toolPromptSuffix;
        const _effortLevel = d._effortLevel || inferEffortFromCategory(d.category);
        let messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
          { role: 'user', content: `${autoPrompt}\n\n${inputContext}` },
        ];
        let lastError: string | null = null;

        // ── Agent loop: iterate with tool calls ──
        for (let iteration = 0; iteration < maxIterations; iteration++) {
          let attempt = 0;
          let result: Record<string, unknown> | null = null;

          // ── Retry loop on failure (node-specific retry semantics from agentConfig) ──
          while (attempt <= maxRetries) {
            try {
              // Use callCIDOnce (no internal retry) — outer loop owns retry semantics
              const cidData = await callCIDOnce({
                systemPrompt,
                model: store.cidAIModel,
                taskType: 'execute',
                messages,
                signal: agentAbort.signal,
              });

              if (cidData.error) {
                lastError =
                  cidData.error === 'no_api_key'
                    ? 'No API key configured on server.'
                    : cidData.message || cidData.error;
                attempt++;
                if (attempt <= maxRetries) {
                  cidLog('executeNode:retry', { nodeId, attempt, maxRetries, error: lastError });
                  await new Promise((r) => setTimeout(r, 1000 * attempt));
                  continue;
                }
                break;
              }
              result = cidData as unknown as Record<string, unknown>;
              lastError = null;
              break;
            } catch (fetchErr) {
              lastError = fetchErr instanceof Error ? fetchErr.message : 'Fetch failed';
              attempt++;
              if (attempt <= maxRetries) {
                cidLog('executeNode:retry', { nodeId, attempt, maxRetries, error: lastError });
                await new Promise((r) => setTimeout(r, 1000 * attempt));
              }
            }
          }

          clearTimeout(agentTimeoutId);

          if (lastError || !result) {
            // Handle fallback strategy
            if (agentConfig?.fallbackStrategy === 'use-cache' && getCacheEntry(nodeId)) {
              const cached = getCacheEntry(nodeId)!;
              output = cached.result;
              cidLog('executeNode:fallback-cache', { nodeId, label: d.label });
              break;
            }
            if (agentConfig?.fallbackStrategy === 'skip') {
              store.updateNodeData(nodeId, {
                executionStatus: 'idle',
                executionError: `Skipped: ${lastError}`,
                _executionDurationMs: Date.now() - _execStart,
              });
              store.updateNodeStatus(nodeId, 'active');
              get()._unlockNode(nodeId);
              return;
            }
            store.updateNodeData(nodeId, {
              executionStatus: 'error',
              executionError: lastError || 'Unknown error',
              _executionDurationMs: Date.now() - _execStart,
            });
            store.updateNodeStatus(nodeId, 'active');
            get()._unlockNode(nodeId);
            return;
          }

          // The response may be parsed JSON or raw text
          const resultData = result as {
            result?: { content?: string; message?: string };
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const rawOutput =
            resultData.result?.content ||
            resultData.result?.message ||
            (typeof resultData.result === 'string'
              ? resultData.result
              : JSON.stringify(resultData.result));

          // Track usage stats
          const usage = resultData.usage;
          const inputTok = usage?.prompt_tokens ?? 0;
          const outputTok = usage?.completion_tokens ?? 0;
          set((s) => ({
            _usageStats: {
              ...s._usageStats,
              totalCalls: s._usageStats.totalCalls + 1,
              totalInputTokens: s._usageStats.totalInputTokens + inputTok,
              totalOutputTokens: s._usageStats.totalOutputTokens + outputTok,
            },
          }));
          store.trackCost(inputTok, outputTok, store.cidAIModel);

          // Parse tool calls from the output
          const { cleanText, toolCalls } = parseToolCalls(rawOutput);
          output = cleanText;

          // If no tool calls or no more iterations, we're done
          if (toolCalls.length === 0 || iteration >= maxIterations - 1) {
            if (toolCalls.length > 0) {
              output += '\n\n*(Tool calls detected but max iterations reached)*';
            }
            break;
          }

          // Execute tool calls and feed results back
          // Pass _sharedNodeContext so store_context/read_context work across nodes
          const sharedCtx = get()._sharedNodeContext;
          cidLog('executeNode:tools', {
            nodeId,
            label: d.label,
            iteration,
            toolCount: toolCalls.length,
            tools: toolCalls.map((t) => t.name),
          });
          const toolResults = await Promise.all(toolCalls.map((tc) => executeTool(tc, sharedCtx)));
          // Persist any mutations from store_context back to store (context is mutated in-place)
          set({ _sharedNodeContext: { ...sharedCtx } });
          const toolResultsText = formatToolResults(toolResults);

          // Add assistant response + tool results to conversation for next iteration
          messages = [
            ...messages,
            { role: 'assistant' as const, content: rawOutput },
            {
              role: 'user' as const,
              content: `Tool results:\n\n${toolResultsText}\n\nContinue with your task using these results. If you need more tools, call them. Otherwise, provide your final output.`,
            },
          ];
        }

        // ── Self-validation refinement: fix actionable quality issues ──
        if (output.length > 0) {
          const earlyWarnings = validateOutput(
            output,
            d.category,
            d.label,
            extractKeywords(autoPrompt),
          );
          const fixableWarnings = earlyWarnings.filter(
            (w) => w.severity === 'warning' && w.code !== 'empty-output',
          );
          if (fixableWarnings.length > 0) {
            cidLog('executeNode:refining', {
              nodeId,
              label: d.label,
              warnings: fixableWarnings.map((w) => w.code),
            });
            try {
              const refinementData = await callCID({
                systemPrompt,
                model: store.cidAIModel,
                taskType: 'analyze',
                timeout: 60_000,
                messages: [
                  messages[0], // original user message for context
                  { role: 'assistant' as const, content: output },
                  { role: 'user' as const, content: buildRefinementPrompt(fixableWarnings) },
                ],
              });
              if (refinementData.usage)
                store.trackCost(
                  refinementData.usage.prompt_tokens,
                  refinementData.usage.completion_tokens,
                  store.cidAIModel,
                );
              if (!refinementData.error) {
                const refinedRaw =
                  refinementData.result?.content || refinementData.result?.message || '';
                if (refinedRaw && refinedRaw.length >= output.length * 0.5) {
                  const { cleanText: refinedClean } = parseToolCalls(refinedRaw);
                  const refined = refinedClean || refinedRaw;
                  // Only accept the refinement if it genuinely improves quality
                  const refinedWarnings = validateOutput(
                    refined,
                    d.category,
                    d.label,
                    extractKeywords(autoPrompt),
                  ).filter((w) => w.severity === 'warning' && w.code !== 'empty-output');
                  if (refinedWarnings.length < fixableWarnings.length) {
                    cidLog('executeNode:refined', {
                      nodeId,
                      label: d.label,
                      originalLen: output.length,
                      refinedLen: refined.length,
                      issuesFixed: fixableWarnings.length - refinedWarnings.length,
                    });
                    output = refined;
                  }
                }
              }
            } catch {
              // Silently keep original output if refinement fails
            }
          }
        }
      }

      const _execDuration = Date.now() - _execStart;
      // Version snapshot before overwriting execution result
      const preExecNode = get().nodes.find((n) => n.id === nodeId);
      const prevResult = preExecNode?.data.executionResult;
      if (prevResult && prevResult !== output) {
        const history = [...(preExecNode?.data._versionHistory || [])];
        const currentVersion = preExecNode?.data.version ?? 1;
        history.push({
          version: currentVersion,
          content: prevResult,
          timestamp: Date.now(),
          trigger: 'execution' as const,
        });
        if (history.length > 10) history.splice(0, history.length - 10);
        store.updateNodeData(nodeId, { _versionHistory: history, version: currentVersion + 1 });
      }
      // Run advisory validation on output
      const validationWarnings = validateOutput(
        output,
        d.category,
        d.label,
        extractKeywords(autoPrompt),
      );

      store.updateNodeData(nodeId, {
        executionResult: output,
        executionStatus: 'success',
        executionError: undefined,
        apiKey: undefined,
        _executionDurationMs: _execDuration,
        _validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
      });
      store.updateNodeStatus(nodeId, 'active');
      store.addEvent({
        id: uid(),
        type: 'regenerated',
        message: `Executed "${d.label}" successfully (${(_execDuration / 1000).toFixed(1)}s)${validationWarnings.length > 0 ? ` [${validationWarnings.length} warning${validationWarnings.length > 1 ? 's' : ''}]` : ''}`,
        timestamp: Date.now(),
        nodeId,
        agent: true,
      });
      cidLog('executeNode:success', {
        nodeId,
        outputLength: output.length,
        durationMs: _execDuration,
        validationWarnings: validationWarnings.length,
      });

      // Cache the result for future deduplication
      setCacheEntry(nodeId, {
        hash: cacheHash,
        result: output,
        timestamp: Date.now(),
        inputTokensEstimate: Math.ceil(cacheKeyRaw.length / 4),
        outputTokensEstimate: Math.ceil(output.length / 4),
      });
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      const errMsg = isTimeout
        ? 'Execution timed out after 120s'
        : err instanceof Error
          ? err.message
          : 'Execution failed';
      store.updateNodeData(nodeId, {
        executionStatus: 'error',
        executionError: errMsg,
        _executionDurationMs: Date.now() - _execStart,
      });
      store.updateNodeStatus(nodeId, 'active');
      store.addToast(
        isTimeout
          ? `Node "${d.label}" timed out. Try again or skip.`
          : `Node "${d.label}" failed: ${errMsg.slice(0, 80)}`,
        'error',
      );
      cidLog('executeNode:error', errMsg);
    } finally {
      clearTimeout(timeoutId);
      set({ executionStartTime: null });
      get()._unlockNode(nodeId);
    }
  },

  executeWorkflow: async () => {
    const store = get();
    // Prevent concurrent workflow execution
    if (store.isProcessing) return;
    const { nodes, edges } = store;
    cidLog('executeWorkflow', { nodeCount: nodes.length, edgeCount: edges.length });
    if (nodes.length === 0) return;
    store.snapshotBeforeExecution();

    // Cost budget check
    const budget = get()._costBudgetUSD;
    if (budget > 0) {
      const staleOrActive = nodes.filter(
        (n) => n.data.status === 'active' || n.data.status === 'stale',
      );
      const estimated = estimateBatchCost(
        staleOrActive.map((n) => ({ promptLength: (n.data.content || '').length + 500 })),
        store.cidAIModel,
      );
      if (estimated.totalCostUSD > budget) {
        store.addToast(
          `Estimated cost ~$${estimated.totalCostUSD.toFixed(2)} exceeds budget $${budget.toFixed(2)}. Increase budget or reduce nodes.`,
          'warning',
        );
        set({ isProcessing: false });
        return;
      }
    }

    const mode = get().cidMode;

    // ── Initialize workflow context for agentic routing ──
    // Reset shared node context so each workflow run starts with a clean slate
    set({ _sharedNodeContext: {} });
    const workflowContext: WorkflowContext = {
      sessionId: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startedAt: Date.now(),
      shared: {},
      decisions: {},
      skippedNodeIds: new Set<string>(),
    };

    // Save current results as snapshot for diff
    const snapshot = new Map<string, string>();
    nodes.forEach((n) => {
      if (n.data.executionResult) snapshot.set(n.id, n.data.executionResult);
    });
    set({ lastExecutionSnapshot: snapshot });

    // ── Pre-execution validation ──
    const nodeIds = new Set(nodes.map((n) => n.id));
    const issues: string[] = [];

    // Check for cycles
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    const W = 0,
      G = 1,
      B = 2;
    const clr = new Map<string, number>();
    nodes.forEach((n) => clr.set(n.id, W));
    let hasCycle = false;
    const cycleLabels: string[] = [];
    const dfsCycle = (id: string) => {
      clr.set(id, G);
      for (const child of adj.get(id) || []) {
        if (clr.get(child) === G) {
          hasCycle = true;
          const n = nodes.find((nd) => nd.id === child);
          if (n) cycleLabels.push(n.data.label);
        }
        if (clr.get(child) === W) dfsCycle(child);
      }
      clr.set(id, B);
    };
    for (const n of nodes) {
      if (clr.get(n.id) === W) dfsCycle(n.id);
    }
    if (hasCycle) issues.push(`Cycle detected involving: ${cycleLabels.join(', ')}`);

    // Check for orphaned edges
    const orphaned = edges.filter((e) => !nodeIds.has(e.source) || !nodeIds.has(e.target));
    if (orphaned.length > 0) issues.push(`${orphaned.length} orphaned edge(s)`);

    // Check for disconnected nodes (no edges at all)
    const connectedIds = new Set<string>();
    edges.forEach((e) => {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    });
    const disconnected = nodes.filter((n) => !connectedIds.has(n.id));
    if (disconnected.length > 0 && nodes.length > 1) {
      issues.push(
        `${disconnected.length} disconnected node(s): ${disconnected.map((n) => n.data.label).join(', ')}`,
      );
    }

    // Report validation issues (but continue — only cycles are blocking)
    if (issues.length > 0) {
      const validationMsg =
        mode === 'poirot'
          ? `Attention, mon ami! My little grey cells detect ${issues.length} issue${issues.length > 1 ? 's' : ''} before execution:\n${issues.map((i) => `- ${i}`).join('\n')}${hasCycle ? '\n\nThe cycle, it prevents execution. Fix it first!' : '\n\nProceeding despite warnings...'}`
          : `Pre-flight check: ${issues.length} issue${issues.length > 1 ? 's' : ''} found:\n${issues.map((i) => `- ${i}`).join('\n')}${hasCycle ? '\n\nBlocked: fix cycle first.' : '\n\nContinuing.'}`;
      store.addMessage({ id: uid(), role: 'cid', content: validationMsg, timestamp: Date.now() });
      if (hasCycle) return;
    }

    const { order, levels } = topoSort(nodes, edges);

    // ── Group nodes by topological level for parallel execution ──
    const levelGroups = new Map<number, string[]>();
    for (const nodeId of order) {
      const level = levels.get(nodeId) ?? 0;
      if (!levelGroups.has(level)) levelGroups.set(level, []);
      levelGroups.get(level)!.push(nodeId);
    }
    const sortedLevels = [...levelGroups.keys()].sort((a, b) => a - b);

    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const failedNames: string[] = [];
    const skippedNames: string[] = [];
    let completed = 0;

    let stageIdx = 0;
    for (const level of sortedLevels) {
      const levelNodeIds = levelGroups.get(level) || [];
      stageIdx++;

      // Execute all nodes at the same level concurrently
      const promises = levelNodeIds.map(async (nodeId) => {
        const nodeLabel = nodes.find((n) => n.id === nodeId)?.data.label ?? nodeId;
        set({
          executionProgress: {
            current: completed,
            total: order.length,
            currentLabel: nodeLabel,
            running: true,
            stage: stageIdx,
            totalStages: sortedLevels.length,
            succeeded: successCount,
            failed: errorCount,
            skipped: skippedCount,
          },
        });

        // ── Agentic routing: check if this node should be skipped ──

        // 1. Skip if already marked as skipped by decision routing
        if (workflowContext.skippedNodeIds.has(nodeId)) {
          skippedCount++;
          skippedNames.push(nodeLabel);
          store.updateNodeData(nodeId, {
            executionStatus: 'idle',
            executionError: 'Skipped: conditional routing',
          });
          cidLog('executeWorkflow:skip', {
            nodeId,
            label: nodeLabel,
            reason: 'conditional routing',
          });
          completed++;
          return;
        }

        // 2. Skip if any upstream dependency failed (cascade skip)
        const upstreamEdges = edges.filter((e) => e.target === nodeId);
        const hasFailedUpstream = upstreamEdges.some((e) => {
          const src = get().nodes.find((n) => n.id === e.source);
          return src?.data.executionStatus === 'error';
        });
        if (hasFailedUpstream) {
          skippedCount++;
          skippedNames.push(nodeLabel);
          store.updateNodeData(nodeId, {
            executionStatus: 'error',
            executionError: 'Skipped: upstream dependency failed',
          });
          cidLog('executeWorkflow:skip', { nodeId, label: nodeLabel, reason: 'upstream failed' });
          completed++;
          return;
        }

        // 3. Check conditional edges — all incoming conditions must be satisfied
        const conditionalEdges = upstreamEdges.filter((e) => e.data?.condition);
        if (conditionalEdges.length > 0) {
          const allConditionsMet = conditionalEdges.every((e) => {
            const cond = e.data?.condition as EdgeCondition | undefined;
            if (!cond) return true;
            const srcNode = get().nodes.find((n) => n.id === e.source);
            if (!srcNode) return false;
            const output = srcNode.data.executionResult || '';
            const status = srcNode.data.executionStatus || 'idle';
            let result = false;
            switch (cond.type) {
              case 'output-contains':
                result = output.toLowerCase().includes(cond.value.toLowerCase());
                break;
              case 'output-matches':
                try {
                  result = new RegExp(cond.value, 'i').test(output);
                } catch {
                  result = false;
                }
                break;
              case 'status-is':
                result = status === cond.value;
                break;
              case 'decision-is':
                result = decisionMatchesCondition(srcNode.data.decisionResult || '', cond.value);
                break;
            }
            return cond.negate ? !result : result;
          });
          if (!allConditionsMet) {
            skippedCount++;
            skippedNames.push(nodeLabel);
            workflowContext.skippedNodeIds.add(nodeId);
            store.updateNodeData(nodeId, {
              executionStatus: 'idle',
              executionError: 'Skipped: edge condition not met',
            });
            cidLog('executeWorkflow:skip', {
              nodeId,
              label: nodeLabel,
              reason: 'condition not met',
            });
            // Cascade skip to all downstream nodes
            const markDownstreamSkipped = (fromId: string) => {
              for (const e of edges) {
                if (e.source === fromId && !workflowContext.skippedNodeIds.has(e.target)) {
                  workflowContext.skippedNodeIds.add(e.target);
                  markDownstreamSkipped(e.target);
                }
              }
            };
            markDownstreamSkipped(nodeId);
            completed++;
            return;
          }
        }

        await store.executeNode(nodeId);
        completed++;
        const updated = get().nodes.find((n) => n.id === nodeId);
        if (updated?.data.executionStatus === 'error') {
          errorCount++;
          failedNames.push(nodeLabel);
        } else {
          successCount++;

          // ── Decision node routing ──
          // After a decision node executes, parse its output to determine which path
          if (updated?.data.category === 'decision') {
            const output = (updated.data.executionResult || '').trim();

            // Use shared parsing utility (handles DECISION/CONFIDENCE/REASONING/ALTERNATIVES)
            const parsed = parseDecisionOutput(output);
            const { confidence, reasoning, alternatives } = parsed;

            // Collect the canonical option list so we can normalize the raw LLM string.
            // Prefer decisionOptions stored on the node; fall back to decision-is condition values.
            const outgoing = edges.filter((e) => e.source === nodeId);
            const conditionOptions = outgoing
              .map((e) => {
                const c = e.data?.condition as EdgeCondition | undefined;
                return c?.type === 'decision-is' ? c.value : null;
              })
              .filter((v): v is string => v !== null);
            const nodeOptions = (updated.data.decisionOptions || []) as string[];
            const knownOptions = nodeOptions.length > 0 ? nodeOptions : conditionOptions;

            // Normalize: snap verbose LLM output to a clean canonical label
            // ("I'll escalate this to management" → "escalate")
            const decision =
              normalizeDecisionToOption(parsed.decision, knownOptions) ?? parsed.decision;

            store.updateNodeData(nodeId, {
              decisionResult: decision,
              ...(confidence !== undefined ? { decisionConfidence: confidence } : {}),
              ...(reasoning ? { decisionExplanation: reasoning } : {}),
              ...(alternatives?.length ? { decisionAlternatives: alternatives } : {}),
            });
            workflowContext.decisions[nodeId] = decision;
            // Persist decision to shared context so downstream node execution prompts
            // can reference it without an extra read_context tool call.
            // buildDecisionContextValue enriches the stored value with a reasoning
            // excerpt so downstream nodes understand *why* the routing was chosen.
            const decisionContextKey = `decision:${nodeLabel}`;
            const decisionContextValue = buildDecisionContextValue(decision, confidence, reasoning);
            set((s) => ({
              _sharedNodeContext: {
                ...s._sharedNodeContext,
                [decisionContextKey]: decisionContextValue,
              },
            }));
            cidLog('executeWorkflow:decision', {
              nodeId,
              label: nodeLabel,
              decision,
              confidence,
              reasoning,
            });

            // Find outgoing edges and skip paths that don't match the decision
            for (const edge of outgoing) {
              const cond = edge.data?.condition as EdgeCondition | undefined;
              if (cond && cond.type === 'decision-is') {
                // Use fuzzy matching from decision module (handles LLM paraphrasing)
                const matches = decisionMatchesCondition(decision, cond.value);
                const shouldSkip = cond.negate ? matches : !matches;
                if (shouldSkip) {
                  workflowContext.skippedNodeIds.add(edge.target);
                  // Cascade skip downstream
                  const cascadeSkip = (fromId: string) => {
                    for (const e of edges) {
                      if (e.source === fromId && !workflowContext.skippedNodeIds.has(e.target)) {
                        workflowContext.skippedNodeIds.add(e.target);
                        cascadeSkip(e.target);
                      }
                    }
                  };
                  cascadeSkip(edge.target);
                }
              }
            }
          }
        }
      });

      await Promise.all(promises);

      // Agent-differentiated behavior between stages
      if (mode === 'poirot' && stageIdx < sortedLevels.length) {
        // Poirot validates between stages — reports progress and checks for issues
        const stageErrors = errorCount;
        const stageNodes = levelNodeIds.length;
        if (stageErrors > 0) {
          store.addMessage({
            id: uid(),
            role: 'cid',
            timestamp: Date.now(),
            content: `Stage ${stageIdx}/${sortedLevels.length} complete. H\u00E9las! ${stageErrors} node${stageErrors > 1 ? 's' : ''} failed. The investigation continues with caution...`,
          });
        } else if (stageNodes > 1) {
          store.addMessage({
            id: uid(),
            role: 'cid',
            timestamp: Date.now(),
            content: `Stage ${stageIdx}/${sortedLevels.length}: ${stageNodes} nodes executed successfully. Proceeding to the next stage...`,
          });
        }
      }
      // Rowan: silent execution, no stage reports — just gets it done
    }

    set({ executionProgress: null });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const parallelNote =
      sortedLevels.length < order.length ? ` (${sortedLevels.length} parallel stages)` : '';

    // Build per-node timing breakdown
    const currentNodes = get().nodes;
    const timingLines = order
      .map((id) => {
        const n = currentNodes.find((x) => x.id === id);
        if (!n) return null;
        const ms = n.data._executionDurationMs;
        const status = n.data.executionStatus;
        const icon = status === 'success' ? '\u2713' : status === 'error' ? '\u2717' : '\u25CB';
        const time = ms != null ? (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`) : '-';
        return `${icon} ${n.data.label}: ${time}`;
      })
      .filter(Boolean);

    // Build actionable next-step suggestions
    const nextSteps: string[] = [];
    const outputNodes = currentNodes.filter(
      (n) => n.data.category === 'output' && n.data.executionStatus === 'success',
    );
    const reviewNodes = currentNodes.filter(
      (n) => n.data.category === 'review' && n.data.executionStatus === 'success',
    );

    if (errorCount > 0) nextSteps.push('`retry failed` to re-run failed nodes');
    if (outputNodes.length > 0) nextSteps.push('Check output nodes for final deliverables');
    if (reviewNodes.length > 0) nextSteps.push('Review gate results before proceeding');
    if (errorCount === 0 && skippedCount === 0)
      nextSteps.push('`diff last run` to compare with previous execution');

    let msg: string;
    if (errorCount === 0 && skippedCount === 0) {
      msg =
        mode === 'poirot'
          ? `Magnifique! All **${order.length}** nodes executed flawlessly in ${elapsed}s${parallelNote}. The workflow, it purrs like a well-oiled machine.`
          : `Workflow complete. **${order.length}** nodes processed in ${elapsed}s${parallelNote}. All clear.`;
    } else {
      const parts = [`**${successCount}** succeeded`];
      if (errorCount > 0) parts.push(`**${errorCount}** failed (${failedNames.join(', ')})`);
      if (skippedCount > 0) parts.push(`**${skippedCount}** skipped (${skippedNames.join(', ')})`);
      msg =
        mode === 'poirot'
          ? `Execution finished in ${elapsed}s${parallelNote}. ${parts.join(', ')}. These culprits require investigation, mon ami.`
          : `Done in ${elapsed}s${parallelNote}. ${parts.join(', ')}.`;
    }
    if (timingLines.length > 0) {
      msg += '\n\n**Timing:**\n' + timingLines.map((l) => `- ${l}`).join('\n');
    }
    if (nextSteps.length > 0) {
      msg += '\n\n**Next:** ' + nextSteps.join(' \u00B7 ');
    }
    store.addMessage({ id: uid(), role: 'cid', content: msg, timestamp: Date.now() });
    cidLog('executeWorkflow:complete', {
      nodesProcessed: order.length,
      errors: errorCount,
      skipped: skippedCount,
      elapsed,
      parallelStages: sortedLevels.length,
    });

    // ── Record execution run in cross-session memory ──
    {
      const finalNodes = get().nodes;
      const decisionSummaries = finalNodes
        .filter((n) => n.data.category === 'decision' && n.data.decisionResult)
        .map((n) => ({
          label: n.data.label,
          decision: n.data.decisionResult!,
          confidence: n.data.decisionConfidence,
          reasoning: n.data.decisionExplanation,
        }));
      const sharedCtxKeys = Object.keys(get()._sharedNodeContext);
      // Count total tool calls from analytics (we import getToolAnalytics lazily to avoid circular deps)
      let toolCallCount = 0;
      try {
        const { getToolAnalytics } = await import('@/lib/agentTools');
        toolCallCount = Object.values(getToolAnalytics()).reduce((sum, e) => sum + e.calls, 0);
      } catch {
        /* analytics unavailable */
      }

      // Identify slow nodes (> 20s wall-clock) for pattern tracking across runs
      const SLOW_NODE_THRESHOLD_MS = 20_000;
      const slowNodeLabels = finalNodes
        .filter(
          (n) =>
            order.includes(n.id) && (n.data._executionDurationMs ?? 0) > SLOW_NODE_THRESHOLD_MS,
        )
        .map((n) => n.data.label);

      // Count total validation warnings across all executed nodes
      const validationWarningCount = finalNodes
        .filter((n) => order.includes(n.id))
        .reduce((sum, n) => sum + (n.data._validationWarnings?.length ?? 0), 0);

      const runSummary: ExecutionRunSummary = {
        sessionId: workflowContext.sessionId,
        timestamp: Date.now(),
        totalNodes: order.length,
        succeeded: successCount,
        failed: errorCount,
        skipped: skippedCount,
        durationMs: Math.round(Date.now() - startTime),
        decisions: decisionSummaries,
        failedNodeLabels: failedNames,
        toolCallCount,
        contextKeysStored: sharedCtxKeys,
        slowNodeLabels,
        validationWarningCount,
      };
      recordExecutionRun(runSummary);
      cidLog('executeWorkflow:memory', {
        sessionId: workflowContext.sessionId,
        decisions: decisionSummaries.length,
        failed: errorCount,
      });
    }

    // Post-execution health check
    setTimeout(() => get().runHealthCheck(), 500);

    // Proactive post-execution suggestions
    setTimeout(() => {
      const s = get();
      const dismissed = s._dismissedSuggestionIds;
      const proactive = generateProactiveSuggestions(s.nodes, s.edges).filter(
        (ps) => !dismissed.has(ps.id),
      );
      const formatted = formatSuggestionsMessage(proactive, 'post-execution');
      if (formatted) {
        store.addMessage({
          id: uid(),
          role: 'cid',
          content: formatted.content,
          timestamp: Date.now(),
          suggestions: formatted.suggestionChips,
        });
        set({ _lastSuggestions: proactive });
      }
    }, 1500);
  },

  executeBranch: async (targetNodeId: string) => {
    const store = get();
    const { nodes, edges } = store;
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) return;

    // Get only the upstream subgraph for this node
    const subgraph = getUpstreamSubgraph(targetNodeId, nodes, edges);
    const { order } = topoSort(subgraph.nodes, subgraph.edges);

    // Skip already-executed nodes (cache hit)
    const toExecute = order.filter((id) => {
      const n = store.nodes.find((x) => x.id === id);
      return n && n.data.executionStatus !== 'success';
    });

    if (toExecute.length === 0) {
      store.addMessage({
        id: uid(),
        role: 'cid',
        content: `All upstream nodes for "${targetNode.data.label}" are already executed.`,
        timestamp: Date.now(),
        _ephemeral: true,
      });
      return;
    }

    cidLog('executeBranch', {
      target: targetNode.data.label,
      total: order.length,
      toExecute: toExecute.length,
    });
    store.addMessage({
      id: uid(),
      role: 'cid',
      content: `Running branch for "${targetNode.data.label}": ${toExecute.length} node(s) to execute...`,
      timestamp: Date.now(),
      _ephemeral: true,
    });

    for (const nodeId of toExecute) {
      await store.executeNode(nodeId);
    }

    const elapsed = toExecute
      .map((id) => {
        const n = get().nodes.find((x) => x.id === id);
        return n?.data._executionDurationMs || 0;
      })
      .reduce((a, b) => a + b, 0);

    store.addMessage({
      id: uid(),
      role: 'cid',
      timestamp: Date.now(),
      content: `Branch execution complete for "${targetNode.data.label}". ${toExecute.length} node(s) in ${(elapsed / 1000).toFixed(1)}s.`,
    });
  },

  retryFailed: async () => {
    const store = get();
    const { nodes, cidMode } = store;
    const failedNodes = nodes.filter(
      (n) =>
        n.data.executionStatus === 'error' &&
        n.data.executionError !== 'Skipped: upstream dependency failed',
    );
    if (failedNodes.length === 0) {
      store.addMessage({
        id: uid(),
        role: 'cid',
        content:
          cidMode === 'poirot'
            ? 'There are no failed nodes to retry, mon ami. The case is clean.'
            : 'No failed nodes to retry.',
        timestamp: Date.now(),
      });
      return;
    }

    // Clear error status on failed nodes and their downstream skipped nodes
    const _failedIds = new Set(failedNodes.map((n) => n.id));
    const skippedNodes = nodes.filter(
      (n) =>
        n.data.executionStatus === 'error' &&
        n.data.executionError === 'Skipped: upstream dependency failed',
    );
    for (const n of [...failedNodes, ...skippedNodes]) {
      store.updateNodeData(n.id, {
        executionStatus: 'idle',
        executionError: undefined,
        executionResult: undefined,
      });
    }

    const retryMsg =
      cidMode === 'poirot'
        ? `Retrying **${failedNodes.length}** failed node${failedNodes.length > 1 ? 's' : ''} + ${skippedNodes.length} skipped downstream...`
        : `Retrying ${failedNodes.length} failed, ${skippedNodes.length} skipped.`;
    store.addMessage({ id: uid(), role: 'cid', content: retryMsg, timestamp: Date.now() });

    // Re-run the full workflow (nodes with successful results will use content bypass)
    await store.executeWorkflow();
  },

  clearExecutionResults: () => {
    const store = get();
    const { nodes, cidMode } = store;
    let cleared = 0;
    for (const n of nodes) {
      if (n.data.executionStatus || n.data.executionResult || n.data.executionError) {
        store.updateNodeData(n.id, {
          executionStatus: 'idle',
          executionResult: undefined,
          executionError: undefined,
        });
        cleared++;
      }
    }
    cidLog('clearExecutionResults', { cleared });
    return cidMode === 'poirot'
      ? `Cleared execution results from **${cleared}** node${cleared !== 1 ? 's' : ''}. The slate is clean, mon ami \u2014 ready for a fresh investigation.`
      : `Cleared ${cleared} node${cleared !== 1 ? 's' : ''}. Ready for re-execution.`;
  },

  getPreFlightSummary: () => {
    const { nodes, edges, cidMode } = get();
    if (nodes.length === 0) return 'No workflow to execute.';

    const plan = buildExecutionPlan(nodes, edges);

    const inputNodes = nodes.filter((n) => n.data.category === 'input');
    const outputNodes = nodes.filter((n) => n.data.category === 'output');
    const aiNodes = nodes.filter(
      (n) => n.data.aiPrompt || ['cid', 'artifact'].includes(n.data.category),
    );
    const withContent = nodes.filter((n) => (n.data.content?.length ?? 0) > 50 && !n.data.aiPrompt);
    const parallelStageCount = plan.stages.filter((s) => s.length > 1).length;

    const parts = ['### Pre-Flight Summary', ''];

    // ── Pipeline overview ──────────────────────────────────────────────────
    parts.push(
      `**Pipeline:** ${nodes.length} nodes \u2192 ${plan.stageCount} stage${plan.stageCount !== 1 ? 's' : ''}` +
        (parallelStageCount > 0 ? ` (${parallelStageCount} parallel)` : ' (sequential)'),
    );
    parts.push(
      `**Inputs:** ${inputNodes.length} \u00B7 **Outputs:** ${outputNodes.length} \u00B7 **AI-processed:** ${aiNodes.length}`,
    );
    if (withContent.length > 0)
      parts.push(`**Pre-loaded content:** ${withContent.length} nodes (will bypass AI)`);

    // ── Execution plan metrics ─────────────────────────────────────────────
    const pctParallel = Math.round(plan.parallelismScore * 100);
    parts.push(
      `**Parallelism:** ${pctParallel}% efficiency` +
        (plan.parallelismScore >= 0.75
          ? ' \u2014 highly parallel'
          : plan.parallelismScore >= 0.4
            ? ' \u2014 moderate'
            : ' \u2014 mostly sequential'),
    );

    // ── Critical path ──────────────────────────────────────────────────────
    if (plan.criticalPath.length > 1) {
      const pathLabels = plan.criticalPath.map(
        (id) => nodes.find((nd) => nd.id === id)?.data.label ?? id,
      );
      parts.push(
        `**Critical path (${plan.criticalPath.length} nodes):** ${pathLabels.join(' \u2192 ')}`,
      );
    }

    // ── Bottlenecks ────────────────────────────────────────────────────────
    if (plan.bottleneckIds.length > 0) {
      // Rank bottlenecks by downstream count, show top 3
      const ranked = [...plan.bottleneckIds]
        .sort((a, b) => (plan.downstreamCount.get(b) || 0) - (plan.downstreamCount.get(a) || 0))
        .slice(0, 3);
      const bottleneckLabels = ranked.map((id) => {
        const label = nodes.find((nd) => nd.id === id)?.data.label ?? id;
        const dc = plan.downstreamCount.get(id) || 0;
        return dc > 0 ? `${label} (${dc} downstream)` : label;
      });
      const prefix = cidMode === 'poirot' ? '\u26A0\uFE0F **Bottlenecks**' : '**Bottlenecks**';
      parts.push(`${prefix}: ${bottleneckLabels.join(', ')}`);
    }

    // ── Independent branches ───────────────────────────────────────────────
    if (plan.independentBranches.length > 1) {
      parts.push(
        `**Independent branches:** ${plan.independentBranches.length} disconnected sub-graphs ` +
          `(${plan.independentBranches.map((b) => b.length + ' node' + (b.length !== 1 ? 's' : '')).join(', ')})`,
      );
    }

    // ── Time estimate ──────────────────────────────────────────────────────
    const stageEstimates: number[] = [];
    for (const stageNodes of plan.stages) {
      const aiCount = stageNodes.filter((id) => {
        const nd = nodes.find((n) => n.id === id);
        if (!nd) return false;
        const hasRichContent = (nd.data.content?.length ?? 0) > 50 && !nd.data.aiPrompt;
        return !hasRichContent && nd.data.category !== 'input';
      }).length;
      stageEstimates.push(aiCount > 0 ? 7 : 0);
    }
    const totalSec = stageEstimates.reduce((a, b) => a + b, 0);
    if (totalSec > 0)
      parts.push(
        `**Est. time:** ~${totalSec}s (${plan.stageCount} stage${plan.stageCount > 1 ? 's' : ''}, AI calls run in parallel within each stage)`,
      );
    parts.push('');

    // ── Execution order ────────────────────────────────────────────────────
    parts.push('**Execution order:**');
    plan.stages.forEach((stageNodes, idx) => {
      const labels = stageNodes.map((id) => nodes.find((nd) => nd.id === id)?.data.label ?? id);
      if (labels.length === 1) {
        parts.push(`${idx + 1}. ${labels[0]}`);
      } else {
        parts.push(`${idx + 1}. ${labels.join(' \u2016 ')} *(parallel)*`);
      }
    });

    const tail =
      cidMode === 'poirot'
        ? `\n---\n*Say \`run workflow\` to begin the investigation, mon ami.*`
        : `\n---\nSay \`run workflow\` to execute.`;
    parts.push(tail);
    return parts.join('\n');
  },

  diffLastRun: () => {
    const { nodes, lastExecutionSnapshot, cidMode } = get();
    if (lastExecutionSnapshot.size === 0) {
      return cidMode === 'poirot'
        ? 'No previous execution to compare against, mon ami. Run the workflow first.'
        : 'No previous run to diff. Run workflow first.';
    }

    const parts: string[] = ['### Execution Diff (vs last run)', ''];
    let newResults = 0;
    let changed = 0;
    let unchanged = 0;
    let removed = 0;

    for (const n of nodes) {
      const current = n.data.executionResult || '';
      const previous = lastExecutionSnapshot.get(n.id) || '';
      if (current && !previous) {
        newResults++;
        parts.push(`- **${n.data.label}**: \u2728 new result (${current.length} chars)`);
      } else if (current && previous && current !== previous) {
        changed++;
        const lenDiff = current.length - previous.length;
        parts.push(
          `- **${n.data.label}**: \u2194 changed (${lenDiff > 0 ? '+' : ''}${lenDiff} chars)`,
        );
      } else if (current && previous && current === previous) {
        unchanged++;
      } else if (!current && previous) {
        removed++;
        parts.push(`- **${n.data.label}**: \u2717 result cleared`);
      }
    }

    if (newResults === 0 && changed === 0 && removed === 0) {
      parts.push('No changes detected \u2014 all results identical to last run.');
    } else {
      parts.push('');
      parts.push(
        `**Summary:** ${newResults} new, ${changed} changed, ${unchanged} unchanged, ${removed} cleared`,
      );
    }

    return parts.join('\n');
  },
});
