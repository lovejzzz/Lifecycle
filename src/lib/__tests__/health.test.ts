import { describe, it, expect } from 'vitest';
import { assessWorkflowHealth, issueFingerprint, formatHealthReport, detectBottlenecks } from '../health';
import type { HealthReport } from '../health';
import type { Node, Edge } from '@xyflow/react';
import type { NodeData } from '../types';

function makeNode(id: string, label: string, category: string, overrides?: Partial<NodeData>): Node<NodeData> {
  return {
    id,
    type: 'lifecycleNode',
    position: { x: 0, y: 0 },
    data: {
      label,
      category,
      status: 'active',
      content: 'some content',
      ...overrides,
    } as NodeData,
  };
}

function makeEdge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target };
}

describe('assessWorkflowHealth', () => {
  it('returns perfect score for empty workflow', () => {
    const report = assessWorkflowHealth([], []);
    expect(report.score).toBe(100);
    expect(report.issues).toHaveLength(0);
  });

  it('detects orphan nodes', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Orphan', 'action'),
      makeNode('3', 'Output', 'output'),
    ];
    const edges = [makeEdge('1', '3')];
    const report = assessWorkflowHealth(nodes, edges);
    expect(report.issues.some(i => i.id === 'orphan-nodes')).toBe(true);
    expect(report.score).toBeLessThan(100);
  });

  it('detects stale nodes', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Stale', 'artifact', { status: 'stale' }),
    ];
    const edges = [makeEdge('1', '2')];
    const report = assessWorkflowHealth(nodes, edges);
    expect(report.issues.some(i => i.id === 'stale-nodes')).toBe(true);
  });

  it('detects long-stale nodes (>5min)', () => {
    const now = Date.now();
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Old Stale', 'artifact', { status: 'stale', lastUpdated: now - 10 * 60 * 1000 }),
    ];
    const edges = [makeEdge('1', '2')];
    const report = assessWorkflowHealth(nodes, edges, now);
    expect(report.issues.some(i => i.id === 'long-stale')).toBe(true);
    expect(report.suggestions.some(s => s.action === 'refresh stale')).toBe(true);
  });

  it('detects empty content nodes', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Empty', 'artifact', { content: undefined, description: undefined }),
    ];
    const edges = [makeEdge('1', '2')];
    const report = assessWorkflowHealth(nodes, edges);
    expect(report.issues.some(i => i.id === 'empty-content')).toBe(true);
  });

  it('detects missing output node', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Action', 'action'),
      makeNode('3', 'Review', 'review'),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3')];
    const report = assessWorkflowHealth(nodes, edges);
    expect(report.issues.some(i => i.id === 'no-output')).toBe(true);
  });

  it('detects execution failures', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Failed', 'action', { executionStatus: 'error' }),
    ];
    const edges = [makeEdge('1', '2')];
    const report = assessWorkflowHealth(nodes, edges);
    expect(report.issues.some(i => i.id === 'exec-failures')).toBe(true);
    expect(report.suggestions.some(s => s.action === 'retry failed')).toBe(true);
  });

  it('detects long chains without review gates', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Step1', 'action'),
      makeNode('3', 'Step2', 'artifact'),
      makeNode('4', 'Step3', 'state'),
      makeNode('5', 'Step4', 'cid'),
      makeNode('6', 'Step5', 'output'),
    ];
    const edges = [
      makeEdge('1', '2'), makeEdge('2', '3'), makeEdge('3', '4'),
      makeEdge('4', '5'), makeEdge('5', '6'),
    ];
    const report = assessWorkflowHealth(nodes, edges);
    expect(report.issues.some(i => i.id === 'no-review-gate')).toBe(true);
  });

  it('does not flag review gate issue if review exists in chain', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Step1', 'action'),
      makeNode('3', 'Review', 'review'),
      makeNode('4', 'Step2', 'artifact'),
      makeNode('5', 'Step3', 'state'),
      makeNode('6', 'Output', 'output'),
    ];
    const edges = [
      makeEdge('1', '2'), makeEdge('2', '3'), makeEdge('3', '4'),
      makeEdge('4', '5'), makeEdge('5', '6'),
    ];
    const report = assessWorkflowHealth(nodes, edges);
    expect(report.issues.some(i => i.id === 'no-review-gate')).toBe(false);
  });
});

describe('issueFingerprint', () => {
  it('produces stable fingerprint for same issues', () => {
    const issues = [
      { id: 'orphan-nodes', priority: 'medium' as const, message: '' },
      { id: 'stale-nodes', priority: 'high' as const, message: '' },
    ];
    const fp1 = issueFingerprint(issues);
    const fp2 = issueFingerprint([...issues].reverse());
    expect(fp1).toBe(fp2); // order-independent
  });

  it('produces different fingerprint for different issues', () => {
    const fp1 = issueFingerprint([{ id: 'orphan-nodes', priority: 'medium' as const, message: '' }]);
    const fp2 = issueFingerprint([{ id: 'stale-nodes', priority: 'high' as const, message: '' }]);
    expect(fp1).not.toBe(fp2);
  });
});

describe('formatHealthReport', () => {
  it('renders score bar with healthy level', () => {
    const report: HealthReport = { score: 90, issues: [], suggestions: [] };
    const result = formatHealthReport(report);
    expect(result).toContain('90/100');
    expect(result).toContain('healthy');
    expect(result).toContain('█');
    expect(result).toContain('░');
  });

  it('renders needs-attention level for mid scores', () => {
    const report: HealthReport = { score: 60, issues: [], suggestions: [] };
    const result = formatHealthReport(report);
    expect(result).toContain('needs attention');
  });

  it('renders critical level for low scores', () => {
    const report: HealthReport = { score: 30, issues: [], suggestions: [] };
    const result = formatHealthReport(report);
    expect(result).toContain('critical');
  });

  it('sorts issues by priority (high first)', () => {
    const report: HealthReport = {
      score: 50,
      issues: [
        { id: 'low-1', priority: 'low', message: 'Low issue' },
        { id: 'high-1', priority: 'high', message: 'High issue' },
        { id: 'med-1', priority: 'medium', message: 'Medium issue' },
      ],
      suggestions: [],
    };
    const result = formatHealthReport(report);
    expect(result).toContain('**Issues:**');
    const highIdx = result.indexOf('High issue');
    const medIdx = result.indexOf('Medium issue');
    const lowIdx = result.indexOf('Low issue');
    expect(highIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  it('uses correct emoji icons per priority', () => {
    const report: HealthReport = {
      score: 40,
      issues: [
        { id: 'h', priority: 'high', message: 'High' },
        { id: 'm', priority: 'medium', message: 'Med' },
        { id: 'l', priority: 'low', message: 'Low' },
      ],
      suggestions: [],
    };
    const result = formatHealthReport(report);
    expect(result).toContain('🔴 High');
    expect(result).toContain('🟡 Med');
    expect(result).toContain('🔵 Low');
  });

  it('renders suggestions with action commands', () => {
    const report: HealthReport = {
      score: 70,
      issues: [{ id: 'x', priority: 'medium', message: 'Something' }],
      suggestions: [
        { id: 's1', message: 'Fix this', action: 'refresh stale' },
        { id: 's2', message: 'Also fix', action: undefined },
      ],
    };
    const result = formatHealthReport(report);
    expect(result).toContain('**Suggestions:**');
    expect(result).toContain('Fix this');
    expect(result).toContain('`refresh stale`');
    expect(result).toContain('Also fix');
  });

  it('caps suggestions at 4', () => {
    const report: HealthReport = {
      score: 50,
      issues: [{ id: 'x', priority: 'low', message: 'X' }],
      suggestions: Array.from({ length: 6 }, (_, i) => ({
        id: `s${i}`, message: `Suggestion ${i}`,
      })),
    };
    const result = formatHealthReport(report);
    expect(result).toContain('Suggestion 3');
    expect(result).not.toContain('Suggestion 4');
  });

  it('shows rowan all-clear message when no issues and no suggestions', () => {
    const report: HealthReport = { score: 100, issues: [], suggestions: [] };
    const result = formatHealthReport(report, 'rowan');
    expect(result).toContain('All clear');
  });

  it('shows poirot all-clear message when no issues and no suggestions', () => {
    const report: HealthReport = { score: 100, issues: [], suggestions: [] };
    const result = formatHealthReport(report, 'poirot');
    expect(result).toContain('mon ami');
  });

  it('does not show all-clear when issues exist', () => {
    const report: HealthReport = {
      score: 60,
      issues: [{ id: 'x', priority: 'low', message: 'Something' }],
      suggestions: [],
    };
    const result = formatHealthReport(report);
    expect(result).not.toContain('All clear');
    expect(result).not.toContain('mon ami');
  });
});

describe('detectBottlenecks', () => {
  it('returns empty report when no nodes have timing data', () => {
    const nodes = [
      makeNode('1', 'Input', 'input'),
      makeNode('2', 'Action', 'action'),
    ];
    const edges = [makeEdge('1', '2')];
    const report = detectBottlenecks(nodes, edges);
    expect(report.slowNodes).toHaveLength(0);
    expect(report.chains).toHaveLength(0);
    expect(report.medianMs).toBe(0);
  });

  it('detects nodes exceeding absolute threshold (>5s)', () => {
    const nodes = [
      makeNode('1', 'Fast', 'action', { _executionDurationMs: 1000, executionStatus: 'success' }),
      makeNode('2', 'Slow', 'artifact', { _executionDurationMs: 8000, executionStatus: 'success' }),
      makeNode('3', 'Medium', 'cid', { _executionDurationMs: 2000, executionStatus: 'success' }),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3')];
    const report = detectBottlenecks(nodes, edges);
    expect(report.slowNodes).toHaveLength(1);
    expect(report.slowNodes[0].nodeId).toBe('2');
    expect(report.slowNodes[0].reason).toBe('absolute');
  });

  it('detects nodes exceeding relative threshold (>2x median)', () => {
    // Median of [500, 600, 700] = 600. 2x = 1200. Node with 1500ms qualifies.
    const nodes = [
      makeNode('1', 'A', 'action', { _executionDurationMs: 500, executionStatus: 'success' }),
      makeNode('2', 'B', 'action', { _executionDurationMs: 600, executionStatus: 'success' }),
      makeNode('3', 'C', 'action', { _executionDurationMs: 700, executionStatus: 'success' }),
      makeNode('4', 'Slow', 'action', { _executionDurationMs: 1500, executionStatus: 'success' }),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3'), makeEdge('3', '4')];
    const report = detectBottlenecks(nodes, edges);
    expect(report.slowNodes).toHaveLength(1);
    expect(report.slowNodes[0].nodeId).toBe('4');
    expect(report.slowNodes[0].reason).toBe('relative');
    expect(report.medianMs).toBe(650); // (600+700)/2
  });

  it('ignores nodes with error status', () => {
    const nodes = [
      makeNode('1', 'Fast', 'action', { _executionDurationMs: 1000, executionStatus: 'success' }),
      makeNode('2', 'Errored', 'artifact', { _executionDurationMs: 8000, executionStatus: 'error' }),
    ];
    const edges = [makeEdge('1', '2')];
    const report = detectBottlenecks(nodes, edges);
    expect(report.slowNodes).toHaveLength(0);
  });

  it('detects sequential chains of slow nodes', () => {
    const nodes = [
      makeNode('1', 'SlowA', 'action', { _executionDurationMs: 6000, executionStatus: 'success' }),
      makeNode('2', 'SlowB', 'artifact', { _executionDurationMs: 7000, executionStatus: 'success' }),
      makeNode('3', 'SlowC', 'cid', { _executionDurationMs: 8000, executionStatus: 'success' }),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3')];
    const report = detectBottlenecks(nodes, edges);
    expect(report.chains).toHaveLength(1);
    expect(report.chains[0].nodeIds).toEqual(['1', '2', '3']); // topological order
    expect(report.chains[0].totalMs).toBe(21000);
    expect(report.chains[0].parallelizable).toBe(true);
  });

  it('does not chain slow nodes that are not directly connected', () => {
    const nodes = [
      makeNode('1', 'SlowA', 'action', { _executionDurationMs: 6000, executionStatus: 'success' }),
      makeNode('2', 'Fast', 'action', { _executionDurationMs: 500, executionStatus: 'success' }),
      makeNode('3', 'SlowB', 'cid', { _executionDurationMs: 7000, executionStatus: 'success' }),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3')];
    const report = detectBottlenecks(nodes, edges);
    // Each slow node is isolated (not chained) because the middle one is fast
    expect(report.chains).toHaveLength(0);
  });

  it('computes correct median for odd number of nodes', () => {
    const nodes = [
      makeNode('1', 'A', 'action', { _executionDurationMs: 100, executionStatus: 'success' }),
      makeNode('2', 'B', 'action', { _executionDurationMs: 200, executionStatus: 'success' }),
      makeNode('3', 'C', 'action', { _executionDurationMs: 300, executionStatus: 'success' }),
    ];
    const report = detectBottlenecks(nodes, []);
    expect(report.medianMs).toBe(200);
  });
});

describe('assessWorkflowHealth — bottleneck integration', () => {
  it('adds bottleneck issue for slow nodes', () => {
    const nodes = [
      makeNode('1', 'Input', 'input', { _executionDurationMs: 100, executionStatus: 'success' }),
      makeNode('2', 'Slow AI', 'cid', { _executionDurationMs: 12000, executionStatus: 'success' }),
      makeNode('3', 'Output', 'output', { _executionDurationMs: 200, executionStatus: 'success' }),
    ];
    const edges = [makeEdge('1', '2'), makeEdge('2', '3')];
    const report = assessWorkflowHealth(nodes, edges);
    expect(report.issues.some(i => i.id === 'bottleneck-slow-nodes')).toBe(true);
    expect(report.bottlenecks).toBeDefined();
    expect(report.bottlenecks!.slowNodes.length).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);
  });

  it('suggests parallelization for sequential slow chains', () => {
    const nodes = [
      makeNode('1', 'SlowA', 'action', { _executionDurationMs: 6000, executionStatus: 'success' }),
      makeNode('2', 'SlowB', 'artifact', { _executionDurationMs: 7000, executionStatus: 'success' }),
    ];
    const edges = [makeEdge('1', '2')];
    const report = assessWorkflowHealth(nodes, edges);
    expect(report.suggestions.some(s => s.id === 'parallelize-chain' || s.id === 'optimize-chain')).toBe(true);
  });

  it('does not include bottleneck report when no slow nodes', () => {
    const nodes = [
      makeNode('1', 'Fast', 'action', { _executionDurationMs: 500, executionStatus: 'success' }),
      makeNode('2', 'AlsoFast', 'artifact', { _executionDurationMs: 600, executionStatus: 'success' }),
    ];
    const edges = [makeEdge('1', '2')];
    const report = assessWorkflowHealth(nodes, edges);
    expect(report.bottlenecks).toBeUndefined();
  });
});
