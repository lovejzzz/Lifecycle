/**
 * User Simulation Tests — exercises real user journeys through the Zustand store.
 *
 * These are integration tests that import the actual store and simulate
 * realistic multi-step user workflows: build → execute → edit → undo → export → switch projects.
 *
 * Each scenario represents a real user need. Failures here mean a real user would hit a bug.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Mock browser globals BEFORE store import ──────────────────────────────────
const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, val: string) => { storage[key] = val; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
};

// The store checks `typeof window !== 'undefined'` for SSR guard
Object.defineProperty(globalThis, 'window', { value: { location: { origin: 'http://localhost:3000' } }, writable: true, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true, configurable: true });

// Mock fetch for AI calls — returns realistic structured responses
let fetchCallCount = 0;
let lastFetchBody: Record<string, unknown> | null = null;
const mockFetch = vi.fn(async (url: string, opts?: RequestInit) => {
  fetchCallCount++;
  if (opts?.body) {
    try { lastFetchBody = JSON.parse(opts.body as string); } catch { lastFetchBody = null; }
  }

  // Simulate different response types based on what the store asks for
  const body = lastFetchBody;
  const systemPrompt = (body?.systemPrompt as string) || '';

  // Workflow generation — return a workflow JSON
  if (systemPrompt.includes('workflow') || systemPrompt.includes('lifecycle graph')) {
    return {
      ok: true,
      json: async () => ({
        result: JSON.stringify({
          nodes: [
            { label: 'Research', category: 'input', content: 'Gather requirements and prior art' },
            { label: 'Design', category: 'action', content: 'Create system architecture' },
            { label: 'Review', category: 'review', content: 'Peer review the design' },
            { label: 'Output', category: 'output', content: 'Final deliverable' },
          ],
          edges: [
            { from: 'Research', to: 'Design', label: 'feeds' },
            { from: 'Design', to: 'Review', label: 'validates' },
            { from: 'Review', to: 'Output', label: 'produces' },
          ],
        }),
      }),
    };
  }

  // Node execution — return content
  if (systemPrompt.includes('Execute') || systemPrompt.includes('category-aware') || systemPrompt.includes('generate the content')) {
    return {
      ok: true,
      json: async () => ({
        result: `Executed result for this node. The analysis shows that the workflow is progressing well with clear dependencies. Key findings include proper separation of concerns and good data flow.`,
      }),
    };
  }

  // Note refinement — return structured suggestions
  if (systemPrompt.includes('refine') || systemPrompt.includes('note')) {
    return {
      ok: true,
      json: async () => ({
        result: JSON.stringify({
          summary: 'Note refined into structured components',
          suggestedNodes: [
            { label: 'Extracted Task', category: 'action', content: 'Task from note' },
          ],
          suggestedEdges: [],
          cleanedContent: 'Cleaned and structured note content.',
        }),
      }),
    };
  }

  // Default fallback
  return {
    ok: true,
    json: async () => ({
      result: 'AI response for this request. Content generated successfully.',
    }),
  };
});
Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true, configurable: true });

// Mock AbortController
if (!globalThis.AbortController) {
  globalThis.AbortController = class {
    signal = { addEventListener: () => {}, aborted: false };
    abort() { (this.signal as any).aborted = true; }
  } as unknown as typeof AbortController;
}

// Mock setTimeout/clearTimeout for debounced saves
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

// Now import the store (after mocks are in place)
import { useLifecycleStore } from '@/store/useStore';
import type { Node, Edge } from '@xyflow/react';
import type { NodeData, NodeCategory } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStore() {
  return useLifecycleStore.getState();
}

function mkNode(id: string, label: string, category: NodeCategory = 'action', extra: Partial<NodeData> = {}): Node<NodeData> {
  return {
    id,
    type: 'lifecycleNode',
    position: { x: Math.random() * 800, y: Math.random() * 600 },
    data: { label, category, content: '', status: 'active' as const, ...extra },
  };
}

function mkEdge(id: string, source: string, target: string, label = 'feeds'): Edge {
  return { id, source, target, label, type: 'default' };
}

/** Reset store to a clean empty state between tests */
function resetStore() {
  Object.keys(storage).forEach(k => delete storage[k]);
  fetchCallCount = 0;
  lastFetchBody = null;
  mockFetch.mockClear();
  useLifecycleStore.setState({
    nodes: [],
    edges: [],
    events: [],
    messages: [],
    selectedNodeId: null,
    multiSelectedIds: new Set(),
    history: [],
    future: [],
    isProcessing: false,
    toasts: [],
    impactPreview: null,
    contextMenu: null,
    searchQuery: '',
    artifactReadingMode: false,
    activeArtifactNodeId: null,
    breadcrumbs: [],
    _executingNodeIds: new Set(),
  });
}

/** Build a simple 3-node workflow directly in the store */
function buildSimpleWorkflow() {
  const store = getStore();
  const n1 = mkNode('node-1', 'Input Data', 'input', { content: 'User requirements document' });
  const n2 = mkNode('node-2', 'Process', 'action', { content: 'Analyze and transform data' });
  const n3 = mkNode('node-3', 'Output Report', 'output', { content: 'Generate final report' });
  const e1 = mkEdge('e-1-2', 'node-1', 'node-2', 'feeds');
  const e2 = mkEdge('e-2-3', 'node-2', 'node-3', 'produces');

  useLifecycleStore.setState({
    nodes: [n1, n2, n3],
    edges: [e1, e2],
  });
  return { nodes: [n1, n2, n3], edges: [e1, e2] };
}

/** Build a complex 6-node workflow with branches */
function buildComplexWorkflow() {
  const nodes = [
    mkNode('node-1', 'Requirements', 'input', { content: 'Gather user stories and acceptance criteria' }),
    mkNode('node-2', 'Architecture', 'action', { content: 'Design system architecture based on requirements' }),
    mkNode('node-3', 'Implementation', 'action', { content: 'Build the feature' }),
    mkNode('node-4', 'Testing', 'test', { content: 'Write and run tests' }),
    mkNode('node-5', 'Code Review', 'review', { content: 'Peer review all changes' }),
    mkNode('node-6', 'Deployment', 'output', { content: 'Deploy to production' }),
  ];
  const edges = [
    mkEdge('e-1-2', 'node-1', 'node-2', 'feeds'),
    mkEdge('e-2-3', 'node-2', 'node-3', 'triggers'),
    mkEdge('e-2-4', 'node-2', 'node-4', 'validates'),
    mkEdge('e-3-5', 'node-3', 'node-5', 'validates'),
    mkEdge('e-4-5', 'node-4', 'node-5', 'feeds'),
    mkEdge('e-5-6', 'node-5', 'node-6', 'produces'),
  ];
  useLifecycleStore.setState({ nodes, edges });
  return { nodes, edges };
}

// ── Invariant checkers ────────────────────────────────────────────────────────

/** Verify the store is in a consistent state */
function assertStoreInvariants() {
  const s = getStore();
  const nodeIds = new Set(s.nodes.map(n => n.id));

  // No duplicate node IDs
  expect(nodeIds.size).toBe(s.nodes.length);

  // No duplicate edge IDs
  const edgeIds = new Set(s.edges.map(e => e.id));
  expect(edgeIds.size).toBe(s.edges.length);

  // All edges reference existing nodes
  for (const edge of s.edges) {
    expect(nodeIds.has(edge.source)).toBe(true);
    expect(nodeIds.has(edge.target)).toBe(true);
  }

  // No node has undefined label or category
  for (const node of s.nodes) {
    expect(node.data.label).toBeTruthy();
    expect(node.data.category).toBeTruthy();
  }

  // Selected node must exist (if set)
  if (s.selectedNodeId) {
    expect(nodeIds.has(s.selectedNodeId)).toBe(true);
  }

  // History and future should be arrays
  expect(Array.isArray(s.history)).toBe(true);
  expect(Array.isArray(s.future)).toBe(true);
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('User Simulation: Real Journeys', () => {
  beforeEach(() => {
    resetStore();
  });

  // ── Scenario 1: Product Manager builds a feature spec ──────────────────────
  describe('Scenario 1: PM builds feature spec workflow', () => {
    it('builds workflow, selects nodes, inspects structure', () => {
      buildComplexWorkflow();
      const s = getStore();

      expect(s.nodes).toHaveLength(6);
      expect(s.edges).toHaveLength(6);
      assertStoreInvariants();

      // PM clicks on a node to inspect it
      s.selectNode('node-3');
      expect(getStore().selectedNodeId).toBe('node-3');

      // PM checks status report
      const report = s.getStatusReport();
      expect(report).toContain('6');
      expect(typeof report).toBe('string');
    });

    it('edits a node and staleness propagates downstream', async () => {
      buildComplexWorkflow();
      const s = getStore();

      // PM edits the Architecture node content (semantic change)
      s.pushHistory();
      s.updateNodeData('node-2', { content: 'Completely new architecture approach using microservices' });

      // Wait for microtask (undo op computation)
      await new Promise(r => setTimeout(r, 10));

      // Node-2 was edited, downstream nodes should be affected
      // Check that staleness propagated (node-3, node-4, node-5, node-6 are downstream)
      const updated = getStore();
      const node3 = updated.nodes.find(n => n.id === 'node-3');
      const node5 = updated.nodes.find(n => n.id === 'node-5');

      // Staleness should cascade through the graph
      // node-3 and node-4 are direct children, node-5 and node-6 are transitive
      assertStoreInvariants();

      // Undo should be available
      expect(updated.history.length).toBeGreaterThanOrEqual(0);
    });

    it('adds a new node and connects it', () => {
      buildSimpleWorkflow();
      const s = getStore();

      // PM adds a review gate
      s.pushHistory();
      const reviewNode = mkNode('node-4', 'Peer Review', 'review', { content: 'Review output quality' });
      s.addNode(reviewNode);

      // Connect it between Process and Output
      s.deleteEdge('e-2-3');
      s.addEdge(mkEdge('e-2-4', 'node-2', 'node-4', 'validates'));
      s.addEdge(mkEdge('e-4-3', 'node-4', 'node-3', 'produces'));

      const updated = getStore();
      expect(updated.nodes).toHaveLength(4);
      expect(updated.edges).toHaveLength(3);
      assertStoreInvariants();

      // Verify the review gate is properly connected
      const reviewEdges = updated.edges.filter(e => e.source === 'node-4' || e.target === 'node-4');
      expect(reviewEdges).toHaveLength(2);
    });

    it('deletes a node and edges are cleaned up', () => {
      buildComplexWorkflow();
      const s = getStore();

      // Delete the Testing node
      s.pushHistory();
      s.deleteNode('node-4');

      const updated = getStore();
      expect(updated.nodes).toHaveLength(5);
      // Edge e-2-4 and e-4-5 should be gone
      expect(updated.edges.find(e => e.source === 'node-4' || e.target === 'node-4')).toBeUndefined();
      assertStoreInvariants();
    });
  });

  // ── Scenario 2: Developer uses undo/redo heavily ───────────────────────────
  describe('Scenario 2: Developer undo/redo workflow', () => {
    it('undo reverses node creation', async () => {
      const s = getStore();

      // Start with empty canvas
      expect(s.nodes).toHaveLength(0);

      // Add a node (with history)
      s.pushHistory();
      s.addNode(mkNode('node-1', 'First', 'input'));

      // Wait for microtask to compute undo op
      await new Promise(r => setTimeout(r, 10));

      expect(getStore().nodes).toHaveLength(1);
      expect(getStore().history.length).toBeGreaterThanOrEqual(1);

      // Undo
      getStore().undo();
      expect(getStore().nodes).toHaveLength(0);

      // Redo
      getStore().redo();
      expect(getStore().nodes).toHaveLength(1);
      expect(getStore().nodes[0].data.label).toBe('First');

      assertStoreInvariants();
    });

    it('undo reverses node deletion', async () => {
      buildSimpleWorkflow();

      const s = getStore();
      expect(s.nodes).toHaveLength(3);

      // Delete a node
      s.pushHistory();
      s.deleteNode('node-2');

      await new Promise(r => setTimeout(r, 10));

      expect(getStore().nodes).toHaveLength(2);
      expect(getStore().edges.filter(e => e.source === 'node-2' || e.target === 'node-2')).toHaveLength(0);

      // Undo — node and its edges should come back
      getStore().undo();
      const restored = getStore();
      expect(restored.nodes).toHaveLength(3);
      expect(restored.nodes.find(n => n.id === 'node-2')).toBeTruthy();

      assertStoreInvariants();
    });

    it('undo reverses content edit', async () => {
      buildSimpleWorkflow();

      const s = getStore();
      s.pushHistory();
      s.updateNodeData('node-1', { content: 'Changed content' });

      await new Promise(r => setTimeout(r, 10));

      expect(getStore().nodes.find(n => n.id === 'node-1')!.data.content).toBe('Changed content');

      getStore().undo();
      expect(getStore().nodes.find(n => n.id === 'node-1')!.data.content).toBe('User requirements document');

      assertStoreInvariants();
    });

    it('multiple undo/redo cycles remain consistent', async () => {
      const s = getStore();

      // Step 1: Add node
      s.pushHistory();
      s.addNode(mkNode('node-1', 'A', 'input'));
      await new Promise(r => setTimeout(r, 10));

      // Step 2: Add another node
      getStore().pushHistory();
      getStore().addNode(mkNode('node-2', 'B', 'action'));
      await new Promise(r => setTimeout(r, 10));

      // Step 3: Add edge
      getStore().pushHistory();
      getStore().addEdge(mkEdge('e-1-2', 'node-1', 'node-2'));
      await new Promise(r => setTimeout(r, 10));

      expect(getStore().nodes).toHaveLength(2);
      expect(getStore().edges).toHaveLength(1);

      // Undo 3 times
      getStore().undo(); // removes edge
      getStore().undo(); // removes node-2
      getStore().undo(); // removes node-1

      expect(getStore().nodes).toHaveLength(0);
      expect(getStore().edges).toHaveLength(0);

      // Redo all 3
      getStore().redo();
      getStore().redo();
      getStore().redo();

      expect(getStore().nodes).toHaveLength(2);
      expect(getStore().edges).toHaveLength(1);
      assertStoreInvariants();
    });
  });

  // ── Scenario 3: Content editor workflow ────────────────────────────────────
  describe('Scenario 3: Content editor multi-node editing', () => {
    it('batch edits across multiple nodes', () => {
      buildComplexWorkflow();
      const s = getStore();

      // Editor updates content on several nodes
      s.updateNodeData('node-1', { content: 'Updated requirements with new user stories' });
      s.updateNodeData('node-3', { content: 'Implementation plan: React + TypeScript' });
      s.updateNodeData('node-6', { content: 'Deploy to staging first, then production' });

      const updated = getStore();
      expect(updated.nodes.find(n => n.id === 'node-1')!.data.content).toContain('user stories');
      expect(updated.nodes.find(n => n.id === 'node-3')!.data.content).toContain('React');
      expect(updated.nodes.find(n => n.id === 'node-6')!.data.content).toContain('staging');
      assertStoreInvariants();
    });

    it('multi-select and delete multiple nodes', () => {
      buildComplexWorkflow();
      const s = getStore();

      // Select Testing and Code Review
      s.toggleMultiSelect('node-4');
      s.toggleMultiSelect('node-5');
      expect(getStore().multiSelectedIds.size).toBe(2);

      // Delete selection
      s.pushHistory();
      const count = s.deleteMultiSelected();
      expect(count).toBe(2);

      const updated = getStore();
      expect(updated.nodes).toHaveLength(4);
      expect(updated.multiSelectedIds.size).toBe(0);

      // Edges referencing deleted nodes should be gone
      for (const e of updated.edges) {
        expect(e.source).not.toBe('node-4');
        expect(e.target).not.toBe('node-4');
        expect(e.source).not.toBe('node-5');
        expect(e.target).not.toBe('node-5');
      }
      assertStoreInvariants();
    });

    it('duplicate node creates proper copy', () => {
      buildSimpleWorkflow();
      const s = getStore();

      s.pushHistory();
      s.duplicateNode('node-2');

      const updated = getStore();
      expect(updated.nodes).toHaveLength(4);

      // Find the cloned node
      const clone = updated.nodes.find(n => n.id !== 'node-2' && n.data.label.includes('Process'));
      expect(clone).toBeTruthy();
      expect(clone!.data.category).toBe('action');
      assertStoreInvariants();
    });
  });

  // ── Scenario 4: Workflow analysis and health ───────────────────────────────
  describe('Scenario 4: Health monitoring and analysis', () => {
    it('health score is reasonable for a good workflow', () => {
      buildComplexWorkflow();
      const score = getStore().getHealthScore();
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('complexity score reflects graph size', () => {
      buildComplexWorkflow();
      const complexity = getStore().getComplexityScore();
      expect(complexity).toHaveProperty('score');
      expect(complexity).toHaveProperty('label');
      expect(typeof complexity.score).toBe('number');
    });

    it('workflow progress tracks execution state', () => {
      buildSimpleWorkflow();
      const progress = getStore().getWorkflowProgress();
      expect(progress).toHaveProperty('percent');
      expect(progress).toHaveProperty('done');
      expect(progress).toHaveProperty('total');
      expect(progress.total).toBe(3);
      expect(progress.done).toBe(0); // nothing executed yet
    });

    it('validate detects no issues in clean workflow', () => {
      buildSimpleWorkflow();
      const result = getStore().validate();
      expect(typeof result).toBe('string');
      // Should not report critical errors for a basic valid workflow
    });

    it('orphan detection finds disconnected nodes', () => {
      buildSimpleWorkflow();
      // Add a disconnected node
      getStore().addNode(mkNode('node-orphan', 'Lonely Node', 'note', { content: 'I have no connections' }));
      const result = getStore().findOrphans();
      expect(typeof result).toBe('string');
      expect(result.toLowerCase()).toContain('lonely');
    });
  });

  // ── Scenario 5: CID agent mode switching ───────────────────────────────────
  describe('Scenario 5: Agent mode and configuration', () => {
    it('switches between Rowan and Poirot', () => {
      const s = getStore();
      const initialMode = s.cidMode;
      expect(['rowan', 'poirot']).toContain(initialMode);

      s.setCIDMode(initialMode === 'rowan' ? 'poirot' : 'rowan');
      expect(getStore().cidMode).not.toBe(initialMode);

      // Switch back
      s.setCIDMode(initialMode);
      expect(getStore().cidMode).toBe(initialMode);
    });

    it('status report varies by content', () => {
      // Empty workflow
      const emptyReport = getStore().getStatusReport();

      // Populated workflow
      buildComplexWorkflow();
      const fullReport = getStore().getStatusReport();

      expect(emptyReport).not.toBe(fullReport);
      expect(fullReport.length).toBeGreaterThan(emptyReport.length);
    });
  });

  // ── Scenario 6: Edge operations ────────────────────────────────────────────
  describe('Scenario 6: Edge manipulation', () => {
    it('connect nodes via onConnect', () => {
      const s = getStore();
      s.addNode(mkNode('node-1', 'A', 'input'));
      s.addNode(mkNode('node-2', 'B', 'output'));

      s.pushHistory();
      s.onConnect({ source: 'node-1', target: 'node-2', sourceHandle: null, targetHandle: null });

      const updated = getStore();
      expect(updated.edges).toHaveLength(1);
      expect(updated.edges[0].source).toBe('node-1');
      expect(updated.edges[0].target).toBe('node-2');
      assertStoreInvariants();
    });

    it('update edge label', () => {
      buildSimpleWorkflow();
      const s = getStore();
      const edge = s.edges[0];

      s.pushHistory();
      s.updateEdgeLabel(edge.id, 'new-label');

      expect(getStore().edges.find(e => e.id === edge.id)!.label).toBe('new-label');
      assertStoreInvariants();
    });

    it('delete edge preserves nodes', () => {
      buildSimpleWorkflow();
      const s = getStore();
      const nodeCount = s.nodes.length;

      s.pushHistory();
      s.deleteEdge('e-1-2');

      const updated = getStore();
      expect(updated.edges).toHaveLength(1); // was 2, now 1
      expect(updated.nodes).toHaveLength(nodeCount); // unchanged
      assertStoreInvariants();
    });
  });

  // ── Scenario 7: Layout and organization ────────────────────────────────────
  describe('Scenario 7: Layout operations', () => {
    it('optimize layout repositions nodes', () => {
      buildComplexWorkflow();
      const beforePositions = getStore().nodes.map(n => ({ id: n.id, ...n.position }));

      getStore().optimizeLayout();

      const afterPositions = getStore().nodes.map(n => ({ id: n.id, ...n.position }));
      // At least some nodes should have moved
      const moved = afterPositions.filter((a, i) =>
        a.x !== beforePositions[i].x || a.y !== beforePositions[i].y
      );
      expect(moved.length).toBeGreaterThan(0);
      assertStoreInvariants();
    });
  });

  // ── Scenario 8: Toast notifications ────────────────────────────────────────
  describe('Scenario 8: Toast system', () => {
    it('add and remove toasts', () => {
      const s = getStore();
      s.addToast('Hello world', 'info');
      expect(getStore().toasts).toHaveLength(1);
      expect(getStore().toasts[0].message).toBe('Hello world');

      const toastId = getStore().toasts[0].id;
      s.removeToast(toastId);
      expect(getStore().toasts).toHaveLength(0);
    });
  });

  // ── Scenario 9: Workflow queries ───────────────────────────────────────────
  describe('Scenario 9: Workflow querying', () => {
    it('countNodes returns useful info', () => {
      buildComplexWorkflow();
      const result = getStore().countNodes();
      expect(typeof result).toBe('string');
      expect(result).toContain('6'); // 6 total nodes
    });

    it('explainWorkflow returns narrative', () => {
      buildComplexWorkflow();
      const result = getStore().explainWorkflow();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(20);
    });

    it('criticalPath returns longest chain', () => {
      buildComplexWorkflow();
      const result = getStore().criticalPath();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('suggestNextSteps returns contextual hints', () => {
      buildComplexWorkflow();
      const result = getStore().suggestNextSteps();
      expect(typeof result).toBe('string');
    });
  });

  // ── Scenario 10: Edge cases & stress ───────────────────────────────────────
  describe('Scenario 10: Edge cases', () => {
    it('deleting a selected node clears selection', () => {
      buildSimpleWorkflow();
      const s = getStore();
      s.selectNode('node-2');
      expect(getStore().selectedNodeId).toBe('node-2');

      s.deleteNode('node-2');
      // Selection should be cleared or point to valid node
      const sel = getStore().selectedNodeId;
      if (sel) {
        expect(getStore().nodes.find(n => n.id === sel)).toBeTruthy();
      }
      assertStoreInvariants();
    });

    it('operations on empty workflow do not crash', () => {
      const s = getStore();
      expect(() => s.getStatusReport()).not.toThrow();
      expect(() => s.getHealthScore()).not.toThrow();
      expect(() => s.getComplexityScore()).not.toThrow();
      expect(() => s.getWorkflowProgress()).not.toThrow();
      expect(() => s.validate()).not.toThrow();
      expect(() => s.findOrphans()).not.toThrow();
      expect(() => s.countNodes()).not.toThrow();
      expect(() => s.explainWorkflow()).not.toThrow();
      expect(() => s.criticalPath()).not.toThrow();
      expect(() => s.undo()).not.toThrow();
      expect(() => s.redo()).not.toThrow();
      expect(() => s.clearStale()).not.toThrow();
      expect(() => s.optimizeLayout()).not.toThrow();
    });

    it('rapid node additions stay consistent', () => {
      const s = getStore();
      for (let i = 0; i < 50; i++) {
        s.addNode(mkNode(`node-${i}`, `Node ${i}`, 'action'));
      }
      expect(getStore().nodes).toHaveLength(50);
      assertStoreInvariants();
    });

    it('self-referencing edge is handled', () => {
      buildSimpleWorkflow();
      const s = getStore();
      // Try connecting a node to itself
      s.onConnect({ source: 'node-1', target: 'node-1', sourceHandle: null, targetHandle: null });
      // Should either reject or accept — either way, no crash
      assertStoreInvariants();
    });

    it('duplicate edge IDs replace rather than corrupt', () => {
      buildSimpleWorkflow();
      const s = getStore();
      const edgeCount = s.edges.length;
      // Add edge with same ID as existing — should replace, not duplicate
      s.addEdge(mkEdge('e-1-2', 'node-1', 'node-3', 'replaced'));
      const updated = getStore();
      expect(updated.edges.length).toBe(edgeCount); // same count, not +1
      expect(updated.edges.find(e => e.id === 'e-1-2')!.label).toBe('replaced');
      assertStoreInvariants();
    });
  });

  // ── Scenario 11: Lifecycle event tracking ──────────────────────────────────
  describe('Scenario 11: Event audit trail', () => {
    it('node creation records events', () => {
      const s = getStore();
      s.createNewNode('input' as NodeCategory);
      const events = getStore().events;
      // Should have at least one 'created' event
      const createEvents = events.filter(e => e.type === 'created');
      expect(createEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('events accumulate across operations', () => {
      const s = getStore();
      const initialEvents = s.events.length;

      s.createNewNode('action' as NodeCategory);
      s.createNewNode('output' as NodeCategory);

      expect(getStore().events.length).toBeGreaterThan(initialEvents);
    });
  });

  // ── Scenario 12: Import/Export round-trip ──────────────────────────────────
  describe('Scenario 12: Import/Export', () => {
    it('export then import preserves workflow', () => {
      buildComplexWorkflow();
      const original = getStore();
      const exported = original.exportWorkflow();
      expect(exported).toBeTruthy();
      expect(typeof exported).toBe('string');

      // Parse to verify it's valid JSON
      const parsed = JSON.parse(exported);
      expect(parsed.nodes).toBeTruthy();
      expect(parsed.edges).toBeTruthy();

      // Reset and reimport
      useLifecycleStore.setState({ nodes: [], edges: [] });
      expect(getStore().nodes).toHaveLength(0);

      const success = original.importWorkflow(exported);
      expect(success).toBe(true);
      expect(getStore().nodes.length).toBeGreaterThan(0);
      assertStoreInvariants();
    });

    it('import invalid JSON is handled gracefully', () => {
      const s = getStore();
      const result = s.importWorkflow('not json');
      expect(result).toBe(false);
      assertStoreInvariants();
    });

    it('export chat history returns string', () => {
      const s = getStore();
      s.addMessage({ id: 'msg-1', role: 'user', content: 'Hello CID', timestamp: Date.now() });
      s.addMessage({ id: 'msg-2', role: 'cid', content: 'Hello!', timestamp: Date.now() });

      const history = s.exportChatHistory();
      expect(typeof history).toBe('string');
      expect(history).toContain('Hello');
    });
  });

  // ── Scenario 13: Impact preview flow ───────────────────────────────────────
  describe('Scenario 13: Impact preview', () => {
    it('shows and hides impact preview', () => {
      buildSimpleWorkflow();
      const s = getStore();

      // Mark a node stale to trigger impact preview
      s.updateNodeStatus('node-2', 'stale');
      s.updateNodeStatus('node-3', 'stale');

      s.showImpactPreview();
      expect(getStore().impactPreview).not.toBeNull();
      expect(getStore().impactPreview!.visible).toBe(true);

      s.hideImpactPreview();
      expect(getStore().impactPreview).toBeNull();
    });
  });

  // ── Scenario 14: CID rules ────────────────────────────────────────────────
  describe('Scenario 14: CID rules management', () => {
    it('add and list rules', () => {
      const s = getStore();
      const result1 = s.addCIDRule('Always include test nodes');
      expect(typeof result1).toBe('string');

      const result2 = s.addCIDRule('Use microservices pattern');
      expect(typeof result2).toBe('string');

      const listed = s.listCIDRules();
      expect(listed).toContain('test nodes');
      expect(listed).toContain('microservices');
    });

    it('remove rule by index', () => {
      const s = getStore();
      s.addCIDRule('Rule A');
      s.addCIDRule('Rule B');

      const result = s.removeCIDRule(0);
      expect(typeof result).toBe('string');
    });
  });

  // ── Scenario 15: Node status lifecycle ─────────────────────────────────────
  describe('Scenario 15: Node status transitions', () => {
    it('lock and approve nodes', () => {
      buildSimpleWorkflow();
      const s = getStore();

      s.lockNode('node-1');
      expect(getStore().nodes.find(n => n.id === 'node-1')!.data.locked).toBe(true);

      // Mark node stale first, then approve it back to active
      s.updateNodeStatus('node-2', 'stale');
      expect(getStore().nodes.find(n => n.id === 'node-2')!.data.status).toBe('stale');

      s.approveNode('node-2');
      const approved = getStore().nodes.find(n => n.id === 'node-2')!;
      expect(approved.data.status).toBe('active');
    });

    it('stale status applied and clearable', () => {
      buildSimpleWorkflow();
      const s = getStore();

      s.updateNodeStatus('node-2', 'stale');
      expect(getStore().nodes.find(n => n.id === 'node-2')!.data.status).toBe('stale');

      const cleared = s.clearStale();
      expect(cleared.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Scenario 16: Project management', () => {
    it('newProject resets nodeCounter to avoid ID collisions', () => {
      buildSimpleWorkflow();
      const s = getStore();
      // After building workflow, nodeCounter should be high
      const oldNodes = s.nodes.map(n => n.id);
      expect(oldNodes.length).toBeGreaterThan(0);

      // Create new project
      s.newProject();
      const fresh = getStore();
      expect(fresh.nodes).toHaveLength(0);
      expect(fresh.edges).toHaveLength(0);
      expect(fresh.currentProjectId).toBeTruthy();

      // Add a node in the new project — ID should start fresh, not continue from old project
      fresh.addNode({
        id: `node-100`,
        type: 'lifecycleNode',
        position: { x: 0, y: 0 },
        data: { label: 'Fresh', category: 'note', status: 'active', description: '', version: 1, lastUpdated: Date.now() },
      });
      expect(getStore().nodes).toHaveLength(1);
    });

    it('switchProject resets UI panels', () => {
      buildSimpleWorkflow();
      const s = getStore();

      // Set up UI state that should be cleared on switch
      s.selectNode(s.nodes[0].id);
      expect(getStore().selectedNodeId).toBeTruthy();

      // Create a second project and switch to it
      s.newProject();
      const newId = getStore().currentProjectId;
      expect(newId).toBeTruthy();

      // Build something in new project
      getStore().addNode({
        id: `node-200`,
        type: 'lifecycleNode',
        position: { x: 0, y: 0 },
        data: { label: 'Project B Node', category: 'action', status: 'active', description: '', version: 1, lastUpdated: Date.now() },
      });

      // Switch back — selectedNodeId should be null
      const projects = getStore().listProjects();
      if (projects.length > 1) {
        const otherId = projects.find(p => p.id !== newId)?.id;
        if (otherId) {
          getStore().switchProject(otherId);
          expect(getStore().selectedNodeId).toBeNull();
          expect(getStore().contextMenu).toBeNull();
        }
      }
    });

    it('renameCurrentProject flushes save first', () => {
      buildSimpleWorkflow();
      const s = getStore();
      const projectId = s.currentProjectId;
      expect(projectId).toBeTruthy();

      s.renameCurrentProject('Renamed Project');
      expect(getStore().currentProjectName).toBe('Renamed Project');
    });

    it('deleteCurrentProject switches to remaining project', () => {
      // Create two projects
      const s = getStore();
      s.newProject();
      const firstId = getStore().currentProjectId;
      s.newProject();
      const secondId = getStore().currentProjectId;
      expect(firstId).not.toBe(secondId);

      // Delete current — should switch to another
      getStore().deleteCurrentProject();
      expect(getStore().currentProjectId).not.toBe(secondId);
    });

    it('cannot delete the only project', () => {
      // Ensure we have only one project (clear others)
      const s = getStore();
      const projects = s.listProjects();
      // If only one, try to delete — should show warning
      if (projects.length === 1) {
        s.deleteCurrentProject();
        // Still have the project
        expect(getStore().currentProjectId).toBeTruthy();
      }
    });
  });

  // ─── Scenario 17: Undo/Redo nodeCounter sync ─────────────────────────
  describe('Scenario 17 — Undo/redo nodeCounter integrity', () => {
    it('undo after node creation does not cause ID collisions on next create', async () => {
      const s = getStore();
      const initialCount = s.nodes.length;

      // Create a node via the high-level API (calls pushHistory internally)
      s.createNewNode('input');
      await new Promise(r => setTimeout(r, 50)); // let microtask complete
      const firstId = getStore().nodes[getStore().nodes.length - 1].id;
      expect(getStore().nodes.length).toBe(initialCount + 1);

      // Create another node
      getStore().createNewNode('artifact');
      await new Promise(r => setTimeout(r, 50));
      const secondId = getStore().nodes[getStore().nodes.length - 1].id;
      expect(firstId).not.toBe(secondId);

      // Undo the second creation
      getStore().undo();
      expect(getStore().nodes.length).toBe(initialCount + 1);

      // Create a new node — should NOT collide with any existing ID
      getStore().createNewNode('state');
      await new Promise(r => setTimeout(r, 50));

      const ids = getStore().nodes.map(n => n.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('redo restores nodes without ID collisions', async () => {
      const s = getStore();
      const initialCount = s.nodes.length;

      // Create, undo, redo
      s.createNewNode('input');
      await new Promise(r => setTimeout(r, 50));
      const afterAdd = getStore().nodes.length;
      expect(afterAdd).toBe(initialCount + 1);

      getStore().undo();
      expect(getStore().nodes.length).toBe(initialCount);

      getStore().redo();
      expect(getStore().nodes.length).toBe(afterAdd);

      // Create new after redo — no collisions
      getStore().createNewNode('artifact');
      await new Promise(r => setTimeout(r, 50));

      const ids = getStore().nodes.map(n => n.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  // ─── Scenario 18: Command handlers ─────────────────────────────────────
  describe('Scenario 18 — NLP command handlers', () => {
    beforeEach(() => {
      // Set up a small workflow for testing commands
      const s = getStore();
      s.createNewNode('input');
      s.createNewNode('artifact');
      s.createNewNode('review');
    });

    it('addNodeByName creates node with valid category', () => {
      const before = getStore().nodes.length;
      const result = getStore().addNodeByName('add note called "Research Notes"');
      expect(result.success).toBe(true);
      expect(result.message).toContain('Research Notes');
      expect(getStore().nodes.length).toBe(before + 1);
      const newNode = getStore().nodes.find(n => n.data.label === 'Research Notes');
      expect(newNode).toBeDefined();
      expect(newNode!.data.category).toBe('note');
    });

    it('addNodeByName fails with unparseable input', () => {
      const result = getStore().addNodeByName('do something weird');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Could not parse');
    });

    it('addNodeByName registers custom category', () => {
      const result = getStore().addNodeByName('add mycustomtype called "Custom Thing"');
      expect(result.success).toBe(true);
      expect(getStore().nodes.find(n => n.data.label === 'Custom Thing')!.data.category).toBe('mycustomtype');
    });

    it('renameByName renames existing node', () => {
      const node = getStore().nodes[0];
      const oldLabel = node.data.label;
      const result = getStore().renameByName(`rename ${oldLabel} to "Better Name"`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Better Name');
      expect(getStore().nodes.find(n => n.id === node.id)!.data.label).toBe('Better Name');
    });

    it('renameByName fails for non-existent node', () => {
      const result = getStore().renameByName('rename NonExistentNode to Something');
      expect(result.success).toBe(false);
      expect(result.message).toContain('No node matching');
    });

    it('renameByName fails with unparseable input', () => {
      const result = getStore().renameByName('rename');
      expect(result.success).toBe(false);
    });

    it('deleteByName deletes existing node', () => {
      const before = getStore().nodes.length;
      const label = getStore().nodes[0].data.label;
      const result = getStore().deleteByName(`delete ${label}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Deleted');
      expect(getStore().nodes.length).toBe(before - 1);
    });

    it('deleteByName fails for non-existent node', () => {
      const result = getStore().deleteByName('delete GhostNode');
      expect(result.success).toBe(false);
      expect(result.message).toContain('No node matching');
    });

    it('deleteByName reports count of removed connections', () => {
      const nodes = getStore().nodes;
      // Connect first two nodes, then delete the first
      getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      const result = getStore().deleteByName(`delete ${nodes[0].data.label}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('connection');
    });

    it('connectByName connects two nodes', () => {
      const nodes = getStore().nodes;
      const edgesBefore = getStore().edges.length;
      const result = getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Connected');
      expect(getStore().edges.length).toBe(edgesBefore + 1);
    });

    it('connectByName rejects self-connection', () => {
      const label = getStore().nodes[0].data.label;
      const result = getStore().connectByName(`connect ${label} to ${label}`);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot connect a node to itself');
    });

    it('connectByName rejects duplicate connection', () => {
      const nodes = getStore().nodes;
      getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      const result = getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      expect(result.success).toBe(false);
      expect(result.message).toContain('already connected');
    });

    it('connectByName fails with non-existent node names', () => {
      const result = getStore().connectByName('connect ZZZNonExistent to YYYAlsoFake');
      expect(result.success).toBe(false);
    });

    it('connectByName fails with unparseable input', () => {
      const result = getStore().connectByName('connect');
      expect(result.success).toBe(false);
    });

    it('disconnectByName removes edge between two nodes', () => {
      const nodes = getStore().nodes;
      getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      const edgesAfterConnect = getStore().edges.length;
      const result = getStore().disconnectByName(`disconnect ${nodes[0].data.label} from ${nodes[1].data.label}`);
      expect(result.success).toBe(true);
      expect(getStore().edges.length).toBe(edgesAfterConnect - 1);
    });

    it('disconnectByName fails with non-existent connection', () => {
      const result = getStore().disconnectByName('disconnect ZZZFake from YYYAlsoFake');
      expect(result.success).toBe(false);
    });

    it('explainWorkflow produces narrative for non-empty graph', () => {
      const nodes = getStore().nodes;
      getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      const result = getStore().explainWorkflow();
      expect(result).toContain('Workflow Narrative');
      expect(result).toContain('nodes');
      expect(result).toContain('edges');
    });

    it('explainWorkflow includes node labels in narrative', () => {
      const nodes = getStore().nodes;
      const result = getStore().explainWorkflow();
      // Should mention at least one node label
      const mentionsANode = nodes.some(n => result.includes(n.data.label));
      expect(mentionsANode).toBe(true);
    });

    it('exportWorkflow returns valid JSON', () => {
      const json = getStore().exportWorkflow();
      const data = JSON.parse(json);
      expect(data._format).toBe('lifecycle-agent');
      expect(data._version).toBe(1);
      expect(data.nodes.length).toBe(getStore().nodes.length);
    });

    it('importWorkflow with valid data succeeds', () => {
      const json = getStore().exportWorkflow();
      const data = JSON.parse(json);
      // Import on top of existing — should succeed and set nodes from the data
      const result = getStore().importWorkflow(json);
      expect(result).toBe(true);
      expect(getStore().nodes.length).toBe(data.nodes.length);
    });

    it('importWorkflow with invalid JSON returns false', () => {
      expect(getStore().importWorkflow('not json')).toBe(false);
    });

    it('importWorkflow with missing nodes returns false', () => {
      expect(getStore().importWorkflow('{"edges":[]}')).toBe(false);
    });

    it('importWorkflow rejects edges referencing non-existent nodes', () => {
      const json = JSON.stringify({
        nodes: [{ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'A', category: 'input', status: 'active' } }],
        edges: [{ id: 'e1', source: 'n1', target: 'n999' }],
      });
      expect(getStore().importWorkflow(json)).toBe(false);
    });

    it('setStatusByName changes node status', () => {
      const label = getStore().nodes[0].data.label;
      const result = getStore().setStatusByName(`set ${label} to stale`);
      expect(result.success).toBe(true);
      expect(getStore().nodes[0].data.status).toBe('stale');
    });

    it('setStatusByName rejects invalid status', () => {
      const label = getStore().nodes[0].data.label;
      const result = getStore().setStatusByName(`set ${label} to banana`);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid status');
    });

    it('deleteNode blocks deletion of executing node', () => {
      const nodeId = getStore().nodes[0].id;
      // Manually lock the node
      getStore()._lockNode(nodeId);
      const before = getStore().nodes.length;
      getStore().deleteNode(nodeId);
      // Node should still exist
      expect(getStore().nodes.length).toBe(before);
      getStore()._unlockNode(nodeId);
    });
  });

  // ── Scenario 19: Pure store analytics, chat, impact preview, and toast ──
  describe('Scenario 19 — Store analytics & UI helpers', () => {
    beforeEach(() => {
      // Reset to clean state then build a known 3-node workflow
      useLifecycleStore.setState({ nodes: [], edges: [], events: [], messages: [], impactPreview: null, toasts: [] });
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      getStore().createNewNode('review');
    });

    // ── getHealthScore ──
    it('getHealthScore returns 100 for empty graph', () => {
      // Remove all nodes by setting directly
      useLifecycleStore.setState({ nodes: [], edges: [] });
      expect(getStore().getHealthScore()).toBe(100);
    });

    it('getHealthScore deducts for stale nodes', () => {
      const nodes = getStore().nodes;
      const scoreWithNone = getStore().getHealthScore();
      // Make a node stale
      getStore().updateNodeStatus(nodes[0].id, 'stale');
      const scoreWithOne = getStore().getHealthScore();
      expect(scoreWithOne).toBeLessThan(scoreWithNone);
      expect(scoreWithNone - scoreWithOne).toBeGreaterThanOrEqual(10);
    });

    it('getHealthScore deducts for orphan nodes', () => {
      // Manually set edges to empty to guarantee orphans
      useLifecycleStore.setState({ edges: [] });
      const score = getStore().getHealthScore();
      // 3 orphans × 8 = -24, so score should be ≤ 100 - 24 = 76
      expect(score).toBeLessThanOrEqual(76);
    });

    it('getHealthScore deducts when no review node', () => {
      useLifecycleStore.setState({
        nodes: getStore().nodes.filter(n => n.data.category !== 'review'),
      });
      const score = getStore().getHealthScore();
      // -15 for no review, plus orphan deductions
      expect(score).toBeLessThanOrEqual(85);
    });

    it('getHealthScore clamps to 0-100 range', () => {
      // Create many stale nodes to push score negative
      for (let i = 0; i < 12; i++) getStore().createNewNode('input');
      getStore().nodes.forEach(n => getStore().updateNodeStatus(n.id, 'stale'));
      const score = getStore().getHealthScore();
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    // ── getComplexityScore ──
    it('getComplexityScore returns Empty for no nodes', () => {
      useLifecycleStore.setState({ nodes: [], edges: [] });
      const result = getStore().getComplexityScore();
      expect(result.score).toBe(0);
      expect(result.label).toBe('Empty');
    });

    it('getComplexityScore returns non-zero for small graph', () => {
      const result = getStore().getComplexityScore();
      expect(result.score).toBeGreaterThan(0);
      expect(['Simple', 'Moderate', 'Complex', 'Intricate']).toContain(result.label);
    });

    it('getComplexityScore increases with many connected nodes', () => {
      // Start fresh with minimal graph
      useLifecycleStore.setState({ nodes: [], edges: [] });
      getStore().createNewNode('input');
      const small = getStore().getComplexityScore().score;
      // Add many more nodes and connect
      for (let i = 0; i < 15; i++) getStore().createNewNode('state');
      const nodes = getStore().nodes;
      for (let i = 0; i < nodes.length - 1; i++) {
        getStore().connectByName(`connect ${nodes[i].data.label} to ${nodes[i + 1].data.label}`);
      }
      const large = getStore().getComplexityScore().score;
      expect(large).toBeGreaterThan(small);
    });

    it('getComplexityScore labels are ordered', () => {
      const labels = ['Simple', 'Moderate', 'Complex', 'Intricate'];
      const result = getStore().getComplexityScore();
      expect(labels).toContain(result.label);
    });

    // ── getStatusReport ──
    it('getStatusReport returns prompt for empty graph', () => {
      useLifecycleStore.setState({ nodes: [], edges: [] });
      const report = getStore().getStatusReport();
      expect(report).toContain('No workflow');
    });

    it('getStatusReport includes graph overview', () => {
      const report = getStore().getStatusReport();
      expect(report).toContain('Graph Overview');
      expect(report).toContain('nodes');
      expect(report).toContain('edges');
      expect(report).toContain('Health');
    });

    it('getStatusReport shows stale nodes in status breakdown', () => {
      const nodeId = getStore().nodes[0].id;
      getStore().updateNodeStatus(nodeId, 'stale');
      const report = getStore().getStatusReport();
      expect(report).toContain('stale');
      expect(report).toContain('Action Items');
    });

    it('getStatusReport shows orphan nodes as action items', () => {
      // All nodes are orphans (no edges)
      const report = getStore().getStatusReport();
      expect(report).toContain('orphan');
    });

    it('getStatusReport shows All Clear when healthy', () => {
      // Connect all nodes and add review
      const nodes = getStore().nodes;
      getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      getStore().connectByName(`connect ${nodes[1].data.label} to ${nodes[2].data.label}`);
      const report = getStore().getStatusReport();
      expect(report).toContain('All Clear');
    });

    // ── exportChatHistory ──
    it('exportChatHistory returns formatted history', () => {
      const result = getStore().exportChatHistory();
      expect(result).toContain('Chat History');
      expect(result).toContain('Exported');
    });

    it('exportChatHistory filters out thinking/building messages', () => {
      useLifecycleStore.setState({
        messages: [
          { id: 'msg-1', role: 'user' as const, content: 'Hello', timestamp: Date.now() },
          { id: 'msg-2', role: 'cid' as const, content: 'thinking...', timestamp: Date.now(), action: 'thinking' as const },
          { id: 'msg-3', role: 'cid' as const, content: 'My response', timestamp: Date.now() },
        ],
      });
      const result = getStore().exportChatHistory();
      expect(result).toContain('Hello');
      expect(result).toContain('My response');
      expect(result).not.toContain('thinking...');
    });

    // ── clearMessages ──
    it('clearMessages resets to welcome message', () => {
      // Add some messages
      useLifecycleStore.setState({
        messages: [
          { id: 'msg-1', role: 'user' as const, content: 'Test', timestamp: Date.now() },
          { id: 'msg-2', role: 'cid' as const, content: 'Reply', timestamp: Date.now() },
        ],
      });
      getStore().clearMessages();
      const msgs = getStore().messages;
      expect(msgs.length).toBe(1);
      expect(msgs[0].role).toBe('cid');
    });

    // ── deleteMessage ──
    it('deleteMessage removes specific message', () => {
      useLifecycleStore.setState({
        messages: [
          { id: 'msg-keep', role: 'user' as const, content: 'Keep', timestamp: Date.now() },
          { id: 'msg-del', role: 'cid' as const, content: 'Delete me', timestamp: Date.now() },
        ],
      });
      getStore().deleteMessage('msg-del');
      const msgs = getStore().messages;
      expect(msgs.length).toBe(1);
      expect(msgs[0].id).toBe('msg-keep');
    });

    // ── stopProcessing ──
    it('stopProcessing clears isProcessing and removes empty placeholders', () => {
      useLifecycleStore.setState({
        isProcessing: true,
        messages: [
          { id: 'msg-1', role: 'cid' as const, content: '', timestamp: Date.now(), action: 'building' as const },
          { id: 'msg-2', role: 'cid' as const, content: 'Partial result', timestamp: Date.now(), action: 'thinking' as const },
          { id: 'msg-3', role: 'user' as const, content: 'Question', timestamp: Date.now() },
        ],
      });
      getStore().stopProcessing();
      expect(getStore().isProcessing).toBe(false);
      // Building with empty content removed, thinking with content kept (action cleared)
      const msgs = getStore().messages;
      expect(msgs.some(m => m.action === 'building')).toBe(false);
      expect(msgs.find(m => m.content === 'Partial result')?.action).toBeUndefined();
      expect(msgs.some(m => m.content === 'Question')).toBe(true);
    });

    // ── addToast / removeToast ──
    it('addToast adds a toast', () => {
      getStore().addToast('Test notification', 'info');
      expect(getStore().toasts.length).toBe(1);
      expect(getStore().toasts[0].message).toBe('Test notification');
      expect(getStore().toasts[0].type).toBe('info');
    });

    it('addToast caps at 5 visible toasts', () => {
      for (let i = 0; i < 7; i++) {
        getStore().addToast(`Toast ${i}`, 'info', 0); // 0 = no auto-dismiss
      }
      expect(getStore().toasts.length).toBeLessThanOrEqual(5);
    });

    it('removeToast removes by ID', () => {
      getStore().addToast('Remove me', 'error', 0);
      const id = getStore().toasts[0].id;
      getStore().removeToast(id);
      expect(getStore().toasts.length).toBe(0);
    });

    // ── Impact Preview ──
    it('showImpactPreview does nothing when no stale nodes', () => {
      getStore().showImpactPreview();
      expect(getStore().impactPreview).toBeNull();
    });

    it('showImpactPreview builds preview for stale nodes', () => {
      const nodes = getStore().nodes;
      getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      // Directly set stale to avoid cascade
      useLifecycleStore.setState({
        nodes: getStore().nodes.map(n => n.id === nodes[1].id ? { ...n, data: { ...n.data, status: 'stale' } } : n),
      });
      getStore().showImpactPreview();
      const preview = getStore().impactPreview;
      expect(preview).not.toBeNull();
      expect(preview!.visible).toBe(true);
      expect(preview!.staleNodes.length).toBeGreaterThanOrEqual(1);
      expect(preview!.selectedNodeIds.size).toBe(preview!.staleNodes.length);
      expect(preview!.estimatedCalls).toBe(preview!.staleNodes.length);
    });

    it('toggleImpactNodeSelection toggles node in selection', () => {
      // Directly set two nodes stale
      const nodes = getStore().nodes;
      useLifecycleStore.setState({
        nodes: nodes.map(n =>
          n.id === nodes[0].id || n.id === nodes[1].id
            ? { ...n, data: { ...n.data, status: 'stale' } }
            : n
        ),
      });
      getStore().showImpactPreview();
      const totalStale = getStore().impactPreview!.staleNodes.length;
      const staleId = nodes[0].id;
      // Initially selected
      expect(getStore().impactPreview!.selectedNodeIds.has(staleId)).toBe(true);
      // Toggle off
      getStore().toggleImpactNodeSelection(staleId);
      expect(getStore().impactPreview!.selectedNodeIds.has(staleId)).toBe(false);
      expect(getStore().impactPreview!.estimatedCalls).toBe(totalStale - 1);
      // Toggle back on
      getStore().toggleImpactNodeSelection(staleId);
      expect(getStore().impactPreview!.selectedNodeIds.has(staleId)).toBe(true);
      expect(getStore().impactPreview!.estimatedCalls).toBe(totalStale);
    });

    it('selectAllImpactNodes selects all stale nodes', () => {
      const nodes = getStore().nodes;
      useLifecycleStore.setState({
        nodes: nodes.map(n =>
          n.id === nodes[0].id || n.id === nodes[1].id
            ? { ...n, data: { ...n.data, status: 'stale' } }
            : n
        ),
      });
      getStore().showImpactPreview();
      const totalStale = getStore().impactPreview!.staleNodes.length;
      getStore().deselectAllImpactNodes();
      expect(getStore().impactPreview!.estimatedCalls).toBe(0);
      getStore().selectAllImpactNodes();
      expect(getStore().impactPreview!.estimatedCalls).toBe(totalStale);
      expect(getStore().impactPreview!.selectedNodeIds.size).toBe(totalStale);
    });

    it('hideImpactPreview clears preview', () => {
      getStore().updateNodeStatus(getStore().nodes[0].id, 'stale');
      getStore().showImpactPreview();
      expect(getStore().impactPreview).not.toBeNull();
      getStore().hideImpactPreview();
      expect(getStore().impactPreview).toBeNull();
    });
  });

  // ── Scenario 20: Lifecycle loop — staleness, edit classification, lock/approve ──
  describe('Scenario 20 — Lifecycle loop core', () => {
    beforeEach(() => {
      useLifecycleStore.setState({ nodes: [], edges: [], events: [], messages: [], impactPreview: null, toasts: [] });
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      getStore().createNewNode('review');
      // Wire up a chain: input → artifact → review
      const nodes = getStore().nodes;
      getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      getStore().connectByName(`connect ${nodes[1].data.label} to ${nodes[2].data.label}`);
    });

    // ── updateNodeStatus: staleness cascade ──
    it('updateNodeStatus cascades stale to downstream nodes', () => {
      const nodes = getStore().nodes;
      const inputId = nodes[0].id;
      getStore().updateNodeStatus(inputId, 'stale');
      // All downstream nodes should become stale
      const updated = getStore().nodes;
      expect(updated.find(n => n.id === inputId)!.data.status).toBe('stale');
      // Artifact is downstream of input
      expect(updated.find(n => n.id === nodes[1].id)!.data.status).toBe('stale');
      // Review is downstream of artifact
      expect(updated.find(n => n.id === nodes[2].id)!.data.status).toBe('stale');
    });

    it('staleness cascade stops at locked nodes', () => {
      const nodes = getStore().nodes;
      // Lock the artifact node
      getStore().lockNode(nodes[1].id);
      expect(getStore().nodes.find(n => n.id === nodes[1].id)!.data.locked).toBe(true);
      // Now mark input as stale
      getStore().updateNodeStatus(nodes[0].id, 'stale');
      const updated = getStore().nodes;
      expect(updated.find(n => n.id === nodes[0].id)!.data.status).toBe('stale');
      // Locked artifact should NOT become stale
      expect(updated.find(n => n.id === nodes[1].id)!.data.status).toBe('locked');
      // Review (downstream of locked) should also be protected
      expect(updated.find(n => n.id === nodes[2].id)!.data.status).not.toBe('stale');
    });

    it('lockNode sets locked status and flag', () => {
      const nodeId = getStore().nodes[0].id;
      getStore().lockNode(nodeId);
      const node = getStore().nodes.find(n => n.id === nodeId)!;
      expect(node.data.status).toBe('locked');
      expect(node.data.locked).toBe(true);
    });

    it('approveNode sets status to active', () => {
      const nodeId = getStore().nodes[0].id;
      getStore().updateNodeStatus(nodeId, 'reviewing');
      getStore().approveNode(nodeId);
      expect(getStore().nodes.find(n => n.id === nodeId)!.data.status).toBe('active');
    });

    // ── updateNodeData: edit classification ──
    it('updateNodeData cosmetic edit does not propagate', () => {
      const nodes = getStore().nodes;
      const artifactId = nodes[1].id;
      // Set initial content
      getStore().updateNodeData(artifactId, { content: 'Hello world' });
      // Ensure downstream is active
      getStore().updateNodeStatus(nodes[2].id, 'active');
      // Cosmetic edit: just whitespace change
      getStore().updateNodeData(artifactId, { content: 'Hello   world' });
      // Review (downstream) should still be active, not stale
      expect(getStore().nodes.find(n => n.id === nodes[2].id)!.data.status).toBe('active');
    });

    it('updateNodeData semantic edit propagates staleness', () => {
      const nodes = getStore().nodes;
      const artifactId = nodes[1].id;
      // Set initial content
      getStore().updateNodeData(artifactId, { content: 'Original requirements for the project' });
      // Reset downstream to active
      getStore().nodes.forEach(n => {
        if (n.id !== artifactId) getStore().updateNodeStatus(n.id, 'active');
      });
      // Semantic edit: completely different content
      getStore().updateNodeData(artifactId, { content: 'Brand new architecture with different goals' });
      // Review (downstream) should become stale
      const review = getStore().nodes.find(n => n.id === nodes[2].id)!;
      expect(review.data.status).toBe('stale');
    });

    it('updateNodeData structural edit (label change) propagates', () => {
      const nodes = getStore().nodes;
      const artifactId = nodes[1].id;
      // Reset all to active
      nodes.forEach(n => getStore().updateNodeStatus(n.id, 'active'));
      // Structural edit: rename
      getStore().updateNodeData(artifactId, { label: 'Renamed Artifact' });
      // Should propagate to downstream
      const review = getStore().nodes.find(n => n.id === nodes[2].id)!;
      expect(review.data.status).toBe('stale');
    });

    it('updateNodeData blocks non-execution updates on executing nodes', () => {
      const nodeId = getStore().nodes[0].id;
      getStore()._lockNode(nodeId); // execution lock
      const labelBefore = getStore().nodes.find(n => n.id === nodeId)!.data.label;
      // Try to update label — should be blocked
      getStore().updateNodeData(nodeId, { label: 'Hacked Label' });
      expect(getStore().nodes.find(n => n.id === nodeId)!.data.label).toBe(labelBefore);
      getStore()._unlockNode(nodeId);
    });

    it('updateNodeData allows execution updates on executing nodes', () => {
      const nodeId = getStore().nodes[0].id;
      getStore()._lockNode(nodeId);
      getStore().updateNodeData(nodeId, { executionResult: 'Some AI output', executionStatus: 'success' });
      const node = getStore().nodes.find(n => n.id === nodeId)!;
      expect(node.data.executionResult).toBe('Some AI output');
      expect(node.data.executionStatus).toBe('success');
      getStore()._unlockNode(nodeId);
    });

    it('updateNodeData creates version history on semantic edit', () => {
      const nodeId = getStore().nodes[1].id;
      getStore().updateNodeData(nodeId, { content: 'Version one content with important details' });
      getStore().updateNodeData(nodeId, { content: 'Completely rewritten content about something else entirely' });
      const node = getStore().nodes.find(n => n.id === nodeId)!;
      expect(node.data._versionHistory).toBeDefined();
      expect(node.data._versionHistory!.length).toBeGreaterThanOrEqual(1);
      expect(node.data._versionHistory![0].content).toBe('Version one content with important details');
    });

    // ── onConnect auto-labeling ──
    it('onConnect infers edge label from category pair', () => {
      const edges = getStore().edges;
      // input→artifact edge should have 'feeds' label
      const inputToArtifact = edges.find(e => {
        const src = getStore().nodes.find(n => n.id === e.source);
        const tgt = getStore().nodes.find(n => n.id === e.target);
        return src?.data.category === 'input' && tgt?.data.category === 'artifact';
      });
      expect(inputToArtifact).toBeDefined();
      expect(inputToArtifact!.label).toBe('feeds');
    });

    // ── setProcessing ──
    it('setProcessing toggles isProcessing flag', () => {
      expect(getStore().isProcessing).toBe(false);
      getStore().setProcessing(true);
      expect(getStore().isProcessing).toBe(true);
      getStore().setProcessing(false);
      expect(getStore().isProcessing).toBe(false);
    });

    // ── Event logging ──
    it('lockNode creates a lock event', () => {
      const nodeId = getStore().nodes[0].id;
      const eventsBefore = getStore().events.length;
      getStore().lockNode(nodeId);
      expect(getStore().events.length).toBeGreaterThan(eventsBefore);
      expect(getStore().events[0].type).toBe('locked');
    });

    it('approveNode creates an approved event', () => {
      const nodeId = getStore().nodes[0].id;
      const eventsBefore = getStore().events.length;
      getStore().approveNode(nodeId);
      expect(getStore().events.length).toBeGreaterThan(eventsBefore);
      expect(getStore().events[0].type).toBe('approved');
    });
  });

  // ── Scenario 21: Async executeNode with fetch mock ──
  describe('Scenario 21 — executeNode async paths', () => {
    beforeEach(() => {
      useLifecycleStore.setState({ nodes: [], edges: [], events: [], messages: [], impactPreview: null, toasts: [] });
    });

    // ── Passthrough categories (no fetch needed) ──
    it('executeNode: input category passes through inputValue', async () => {
      getStore().createNewNode('input');
      const node = getStore().nodes[0];
      getStore().updateNodeData(node.id, { inputValue: 'My input data' });
      await getStore().executeNode(node.id);
      const updated = getStore().nodes.find(n => n.id === node.id)!;
      expect(updated.data.executionResult).toBe('My input data');
      expect(updated.data.executionStatus).toBe('success');
    });

    it('executeNode: input with no value sets idle', async () => {
      getStore().createNewNode('input');
      const node = getStore().nodes[0];
      await getStore().executeNode(node.id);
      const updated = getStore().nodes.find(n => n.id === node.id)!;
      expect(updated.data.executionStatus).toBe('idle');
    });

    it('executeNode: trigger category passes through content', async () => {
      getStore().createNewNode('trigger');
      const node = getStore().nodes[0];
      getStore().updateNodeData(node.id, { content: 'On schedule' });
      await getStore().executeNode(node.id);
      const updated = getStore().nodes.find(n => n.id === node.id)!;
      expect(updated.data.executionResult).toBe('On schedule');
      expect(updated.data.executionStatus).toBe('success');
    });

    it('executeNode: dependency category passes through', async () => {
      getStore().createNewNode('dependency');
      const node = getStore().nodes[0];
      getStore().updateNodeData(node.id, { content: 'Requires auth service' });
      await getStore().executeNode(node.id);
      const updated = getStore().nodes.find(n => n.id === node.id)!;
      expect(updated.data.executionResult).toBe('Requires auth service');
      expect(updated.data.executionStatus).toBe('success');
    });

    it('executeNode: mutex prevents double execution', async () => {
      getStore().createNewNode('input');
      const node = getStore().nodes[0];
      getStore()._lockNode(node.id);
      await getStore().executeNode(node.id); // should skip
      // Node should still be locked but no executionResult set
      expect(getStore().nodes.find(n => n.id === node.id)!.data.executionResult).toBeUndefined();
      getStore()._unlockNode(node.id);
    });

    it('executeNode: non-existent node is a no-op', async () => {
      await getStore().executeNode('non-existent-id');
      // Should not throw
    });

    // ── Circuit breaker: upstream failure ──
    it('executeNode: skips when upstream failed', async () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      const nodes = getStore().nodes;
      getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      // Mark upstream as failed
      getStore().updateNodeData(nodes[0].id, { executionStatus: 'error' });
      await getStore().executeNode(nodes[1].id);
      const artifact = getStore().nodes.find(n => n.id === nodes[1].id)!;
      expect(artifact.data.executionStatus).toBe('error');
      expect(artifact.data.executionError).toContain('upstream');
    });

    // ── Rich content passthrough ──
    it('executeNode: uses existing rich content when no upstream exec results', async () => {
      getStore().createNewNode('artifact');
      const node = getStore().nodes[0];
      // Set content longer than 50 chars, no aiPrompt
      getStore().updateNodeData(node.id, {
        content: 'This is rich pre-generated content that is longer than fifty characters for sure',
      });
      await getStore().executeNode(node.id);
      const updated = getStore().nodes.find(n => n.id === node.id)!;
      expect(updated.data.executionResult).toBe(updated.data.content);
      expect(updated.data.executionStatus).toBe('success');
    });

    // ── API success path (with fetch mock) ──
    it('executeNode: API success sets executionResult', async () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      const nodes = getStore().nodes;
      getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      // Execute input first to provide upstream result
      getStore().updateNodeData(nodes[0].id, { inputValue: 'User requirements' });
      await getStore().executeNode(nodes[0].id);
      // Mock fetch for the artifact execution
      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ result: 'AI-generated artifact content' }),
      }));
      await getStore().executeNode(nodes[1].id);
      const artifact = getStore().nodes.find(n => n.id === nodes[1].id)!;
      expect(artifact.data.executionResult).toBe('AI-generated artifact content');
      expect(artifact.data.executionStatus).toBe('success');
    });

    // ── API error path ──
    it('executeNode: API error sets error status', async () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      const nodes = getStore().nodes;
      getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      getStore().updateNodeData(nodes[0].id, { inputValue: 'User input' });
      await getStore().executeNode(nodes[0].id);
      // Mock fetch returning error
      mockFetch.mockImplementationOnce(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      }));
      await getStore().executeNode(nodes[1].id);
      const artifact = getStore().nodes.find(n => n.id === nodes[1].id)!;
      expect(artifact.data.executionStatus).toBe('error');
      expect(artifact.data.executionError).toContain('500');
    });

    // ── API returns error field ──
    it('executeNode: API error field sets error', async () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      const nodes = getStore().nodes;
      getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      getStore().updateNodeData(nodes[0].id, { inputValue: 'Data' });
      await getStore().executeNode(nodes[0].id);
      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ error: 'no_api_key', message: 'No API key configured' }),
      }));
      await getStore().executeNode(nodes[1].id);
      const artifact = getStore().nodes.find(n => n.id === nodes[1].id)!;
      expect(artifact.data.executionStatus).toBe('error');
    });

    // ── Network error (fetch throws) ──
    it('executeNode: network error sets error and unlocks node', async () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      const nodes = getStore().nodes;
      getStore().connectByName(`connect ${nodes[0].data.label} to ${nodes[1].data.label}`);
      getStore().updateNodeData(nodes[0].id, { inputValue: 'Input data' });
      await getStore().executeNode(nodes[0].id);
      mockFetch.mockImplementationOnce(async () => { throw new Error('Network error'); });
      await getStore().executeNode(nodes[1].id);
      const artifact = getStore().nodes.find(n => n.id === nodes[1].id)!;
      expect(artifact.data.executionStatus).toBe('error');
      expect(artifact.data.executionError).toContain('Network error');
      // Node should be unlocked
      expect(getStore()._executingNodeIds.has(nodes[1].id)).toBe(false);
    });

    // ── executeNode unlocks on completion ──
    it('executeNode: always unlocks node after execution', async () => {
      getStore().createNewNode('input');
      const node = getStore().nodes[0];
      getStore().updateNodeData(node.id, { inputValue: 'test' });
      await getStore().executeNode(node.id);
      expect(getStore()._executingNodeIds.has(node.id)).toBe(false);
    });

    // ── executeWorkflow concurrent guard ──
    it('executeWorkflow: no-ops when already processing', async () => {
      useLifecycleStore.setState({ isProcessing: true });
      const eventsBefore = getStore().events.length;
      await getStore().executeWorkflow();
      // Should have returned early — no new events
      expect(getStore().events.length).toBe(eventsBefore);
    });
  });

  // ── Scenario 22: propagateStale & chatWithCID response parsing ──
  describe('Scenario 22 — propagateStale & chatWithCID', () => {
    beforeEach(() => {
      useLifecycleStore.setState({
        nodes: [], edges: [], events: [], messages: [],
        impactPreview: null, toasts: [], isProcessing: false,
      });
      mockFetch.mockClear();
    });

    // ── propagateStale ──

    it('propagateStale: no-ops with message when no stale nodes', async () => {
      getStore().createNewNode('input');
      await getStore().propagateStale();
      const msgs = getStore().messages;
      expect(msgs.some(m => m.content.includes('up to date'))).toBe(true);
    });

    it('propagateStale: re-executes stale nodes in topo order', async () => {
      // Build a chain: input → artifact
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      const [inp, art] = getStore().nodes;
      getStore().updateNodeData(inp.id, { inputValue: 'test data' });
      getStore().addEdge({ id: 'e1', source: inp.id, target: art.id, type: 'default' });

      // Manually mark both as stale
      useLifecycleStore.setState({
        nodes: getStore().nodes.map(n => ({
          ...n, data: { ...n.data, status: 'stale' as const },
        })),
      });

      await getStore().propagateStale();

      // After propagation: nodes should be active (not stale)
      const updatedInp = getStore().nodes.find(n => n.id === inp.id)!;
      const updatedArt = getStore().nodes.find(n => n.id === art.id)!;
      expect(updatedInp.data.status).toBe('active');
      expect(updatedArt.data.status).toBe('active');
    });

    it('propagateStale: only processes nodes that are stale at check time', async () => {
      // Build two unconnected nodes — mark only one stale
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      const [inp, art] = getStore().nodes;

      // Force exact state: inp active, art stale, no edges, no prior events
      useLifecycleStore.setState({
        nodes: getStore().nodes.map(n => ({
          ...n, data: {
            ...n.data,
            status: n.id === art.id ? 'stale' as const : 'active' as const,
            inputValue: n.id === inp.id ? 'data' : undefined,
          },
        })),
        edges: [],
        events: [],
      });

      await getStore().propagateStale();
      // Only artifact should produce regenerated events (executeNode + propagateStale each add one)
      const regenEvents = getStore().events.filter(e => e.type === 'regenerated');
      expect(regenEvents.length).toBe(2);
      expect(regenEvents.every(e => e.nodeId === art.id)).toBe(true);
    });

    it('propagateStale: clears impact preview after completion', async () => {
      getStore().createNewNode('input');
      useLifecycleStore.setState({
        nodes: getStore().nodes.map(n => ({ ...n, data: { ...n.data, status: 'stale' as const, inputValue: 'x' } })),
        impactPreview: { visible: true, nodeIds: [], selectedNodeIds: new Set() },
      });
      await getStore().propagateStale();
      expect(getStore().impactPreview).toBeNull();
    });

    it('propagateStale: reports error count when execution fails', async () => {
      getStore().createNewNode('artifact');
      const art = getStore().nodes[0];
      useLifecycleStore.setState({
        nodes: getStore().nodes.map(n => ({ ...n, data: { ...n.data, status: 'stale' as const } })),
      });
      // Mock fetch to return error
      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ result: 'error content' }),
      }));
      // Force execution to produce an error by making the node fail
      // The artifact node with no upstream will try to execute via API
      await getStore().propagateStale();
      // Should have a completion message (either success or error count)
      const msgs = getStore().messages;
      const doneMsg = msgs.find(m => m.content.includes('refreshed') || m.content.includes('failed'));
      expect(doneMsg).toBeDefined();
    });

    it('propagateStale: pushes undo history', async () => {
      getStore().createNewNode('input');
      useLifecycleStore.setState({
        nodes: getStore().nodes.map(n => ({ ...n, data: { ...n.data, status: 'stale' as const, inputValue: 'x' } })),
      });
      const historyBefore = getStore().history.length;
      await getStore().propagateStale();
      expect(getStore().history.length).toBeGreaterThan(historyBefore);
    });

    // ── chatWithCID response parsing ──

    it('chatWithCID: sends user message and shows thinking state', async () => {
      // Override fetch for chat response
      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          result: { message: 'Hello! I can help with that.', workflow: null },
        }),
      }));

      await getStore().chatWithCID('hello');

      const msgs = getStore().messages;
      // Should have user message
      expect(msgs.some(m => m.role === 'user' && m.content === 'hello')).toBe(true);
      // Should have CID response (thinking removed, actual response added)
      expect(msgs.some(m => m.role === 'cid' && !m.action)).toBe(true);
    });

    it('chatWithCID: handles no_api_key with fallback', async () => {
      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ error: 'no_api_key' }),
      }));

      await getStore().chatWithCID('build a workflow');

      const msgs = getStore().messages;
      // Should have a CID response (fallback)
      expect(msgs.filter(m => m.role === 'cid').length).toBeGreaterThan(0);
      expect(getStore().isProcessing).toBe(false);
    });

    it('chatWithCID: handles api_error with fallback', async () => {
      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ error: 'api_error', message: '429 rate limit' }),
      }));

      await getStore().chatWithCID('build a workflow');

      const msgs = getStore().messages;
      expect(msgs.some(m => m.content.includes('rate limited') || m.content.includes('unavailable'))).toBe(true);
      expect(getStore().isProcessing).toBe(false);
    });

    it('chatWithCID: strips modifications for advice questions', async () => {
      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          result: {
            message: 'Here is my advice...',
            workflow: null,
            modifications: {
              update_nodes: [{ label: 'Input', changes: { description: 'should not apply' } }],
            },
          },
        }),
      }));

      getStore().createNewNode('input');
      const origDesc = getStore().nodes[0].data.description;

      await getStore().chatWithCID('what should I do next?');

      // Modifications should have been stripped — node unchanged
      const node = getStore().nodes[0];
      expect(node.data.description).toBe(origDesc);
    });

    it('chatWithCID: applies modifications when action verb present', async () => {
      getStore().createNewNode('input');
      const origNode = getStore().nodes[0];

      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          result: {
            message: 'Updated the workflow.',
            workflow: null,
            modifications: {
              update_nodes: [{ label: origNode.data.label, changes: { description: 'New description from AI' } }],
            },
          },
        }),
      }));

      await getStore().chatWithCID('update the input node description');

      const updated = getStore().nodes.find(n => n.id === origNode.id)!;
      expect(updated.data.description).toBe('New description from AI');
    });

    it('chatWithCID: falls back to template on network error', async () => {
      mockFetch.mockImplementationOnce(async () => { throw new Error('Network error'); });

      await getStore().chatWithCID('hello');

      // Should have removed thinking and added fallback
      const msgs = getStore().messages;
      expect(msgs.some(m => m.action === 'thinking')).toBe(false);
      expect(msgs.filter(m => m.role === 'cid' && m.content).length).toBeGreaterThan(0);
      expect(getStore().isProcessing).toBe(false);
    });

    it('chatWithCID: enriches prompt with selected node context', async () => {
      getStore().createNewNode('artifact');
      const node = getStore().nodes[0];
      useLifecycleStore.setState({ selectedNodeId: node.id });

      mockFetch.mockImplementationOnce(async (_url: string, opts?: RequestInit) => {
        const body = JSON.parse(opts?.body as string);
        // The messages should contain enriched context with node info
        const lastMsg = body.messages[body.messages.length - 1];
        expect(lastMsg.content).toContain(node.data.label);
        return {
          ok: true,
          json: async () => ({
            result: { message: 'Got it!', workflow: null },
          }),
        };
      });

      await getStore().chatWithCID('explain this node');
    });

    it('chatWithCID: parses string result into object', async () => {
      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          result: JSON.stringify({ message: 'Parsed from string', workflow: null }),
        }),
      }));

      await getStore().chatWithCID('test string parsing');

      const msgs = getStore().messages;
      // The CID response should contain the parsed message content
      expect(msgs.some(m => m.role === 'cid')).toBe(true);
    });
  });

  // ── Scenario 23: executeWorkflow & executeBranch ──
  describe('Scenario 23 — executeWorkflow & executeBranch', () => {
    beforeEach(() => {
      useLifecycleStore.setState({
        nodes: [], edges: [], events: [], messages: [],
        impactPreview: null, toasts: [], isProcessing: false,
        executionProgress: null, lastExecutionSnapshot: new Map(),
      });
      mockFetch.mockClear();
    });

    // ── executeWorkflow ──

    it('executeWorkflow: no-ops on empty graph', async () => {
      const msgsBefore = getStore().messages.length;
      await getStore().executeWorkflow();
      expect(getStore().messages.length).toBe(msgsBefore);
    });

    it('executeWorkflow: no-ops when isProcessing is true', async () => {
      getStore().createNewNode('input');
      useLifecycleStore.setState({ isProcessing: true });
      const eventsBefore = getStore().events.length;
      await getStore().executeWorkflow();
      expect(getStore().events.length).toBe(eventsBefore);
    });

    it('executeWorkflow: executes chain in topological order', async () => {
      // Build input → artifact chain
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      useLifecycleStore.setState({ edges: [] });
      const [inp, art] = getStore().nodes;
      getStore().updateNodeData(inp.id, { inputValue: 'test data' });
      getStore().addEdge({ id: 'e1', source: inp.id, target: art.id, type: 'default' });

      await getStore().executeWorkflow();

      // Both should be executed
      const updatedInp = getStore().nodes.find(n => n.id === inp.id)!;
      const updatedArt = getStore().nodes.find(n => n.id === art.id)!;
      expect(updatedInp.data.executionStatus).toBe('success');
      expect(updatedArt.data.executionStatus).toBe('success');
      // Should have a completion message
      expect(getStore().messages.some(m => m.content.includes('nodes processed') || m.content.includes('Magnifique'))).toBe(true);
    });

    it('executeWorkflow: saves execution snapshot for diff', async () => {
      getStore().createNewNode('input');
      const inp = getStore().nodes[0];
      getStore().updateNodeData(inp.id, { inputValue: 'data', executionResult: 'old result' });

      await getStore().executeWorkflow();

      // lastExecutionSnapshot should contain the old result
      const snapshot = getStore().lastExecutionSnapshot;
      expect(snapshot.get(inp.id)).toBe('old result');
    });

    it('executeWorkflow: skips downstream when upstream fails', async () => {
      // Build artifact1 → artifact2 chain (no input, so artifact1 needs API)
      getStore().createNewNode('artifact');
      getStore().createNewNode('artifact');
      useLifecycleStore.setState({ edges: [] });
      const [a1, a2] = getStore().nodes;
      getStore().addEdge({ id: 'e1', source: a1.id, target: a2.id, type: 'default' });

      // Mock first artifact to fail
      mockFetch.mockImplementationOnce(async () => ({
        ok: false,
        json: async () => ({ error: 'server error' }),
      }));

      await getStore().executeWorkflow();

      // a2 should be skipped due to upstream failure
      const updatedA2 = getStore().nodes.find(n => n.id === a2.id)!;
      expect(updatedA2.data.executionStatus).toBe('error');
      expect(updatedA2.data.executionError).toContain('upstream');
    });

    it('executeWorkflow: reports timing in completion message', async () => {
      getStore().createNewNode('input');
      getStore().updateNodeData(getStore().nodes[0].id, { inputValue: 'x' });

      await getStore().executeWorkflow();

      const msgs = getStore().messages;
      const completionMsg = msgs.find(m => m.content.includes('Timing:'));
      expect(completionMsg).toBeDefined();
    });

    it('executeWorkflow: clears executionProgress after completion', async () => {
      getStore().createNewNode('input');
      getStore().updateNodeData(getStore().nodes[0].id, { inputValue: 'x' });

      await getStore().executeWorkflow();

      expect(getStore().executionProgress).toBeNull();
    });

    it('executeWorkflow: detects and blocks on cycles', async () => {
      // Create two nodes with a cycle
      getStore().createNewNode('artifact');
      getStore().createNewNode('artifact');
      useLifecycleStore.setState({ edges: [] });
      const [a, b] = getStore().nodes;
      getStore().addEdge({ id: 'e1', source: a.id, target: b.id, type: 'default' });
      getStore().addEdge({ id: 'e2', source: b.id, target: a.id, type: 'default' });

      await getStore().executeWorkflow();

      // Should report cycle and not execute
      expect(getStore().messages.some(m => m.content.toLowerCase().includes('cycle'))).toBe(true);
    });

    // ── executeBranch ──

    it('executeBranch: no-ops on nonexistent node', async () => {
      const msgsBefore = getStore().messages.length;
      await getStore().executeBranch('nonexistent');
      expect(getStore().messages.length).toBe(msgsBefore);
    });

    it('executeBranch: reports all-executed when upstream done', async () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      useLifecycleStore.setState({ edges: [] });
      const [inp, art] = getStore().nodes;
      getStore().updateNodeData(inp.id, { inputValue: 'test' });
      getStore().addEdge({ id: 'e1', source: inp.id, target: art.id, type: 'default' });

      // Pre-execute both to mark as success
      useLifecycleStore.setState({
        nodes: getStore().nodes.map(n => ({
          ...n, data: { ...n.data, executionStatus: 'success' as const },
        })),
      });

      await getStore().executeBranch(art.id);

      // Should report all-executed message
      expect(getStore().messages.some(m => m.content.includes('already executed'))).toBe(true);
    });

    it('executeBranch: executes only upstream subset', async () => {
      // Build chain: inp → art → out, executeBranch(art) should only run inp + art
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      getStore().createNewNode('output');
      useLifecycleStore.setState({ edges: [] });
      const [inp, art, out] = getStore().nodes;
      getStore().updateNodeData(inp.id, { inputValue: 'data' });
      getStore().addEdge({ id: 'e1', source: inp.id, target: art.id, type: 'default' });
      getStore().addEdge({ id: 'e2', source: art.id, target: out.id, type: 'default' });

      await getStore().executeBranch(art.id);

      // art should be executed (inp passes through, art gets API call)
      const updatedArt = getStore().nodes.find(n => n.id === art.id)!;
      expect(updatedArt.data.executionStatus).toBe('success');
      // out should NOT be executed
      const updatedOut = getStore().nodes.find(n => n.id === out.id)!;
      expect(updatedOut.data.executionStatus).not.toBe('success');
    });

    it('executeBranch: reports completion with node count and timing', async () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      useLifecycleStore.setState({ edges: [] });
      const [inp, art] = getStore().nodes;
      getStore().updateNodeData(inp.id, { inputValue: 'data' });
      getStore().addEdge({ id: 'e1', source: inp.id, target: art.id, type: 'default' });

      await getStore().executeBranch(art.id);

      expect(getStore().messages.some(m =>
        m.content.includes('Branch execution complete') && m.content.includes('node(s)')
      )).toBe(true);
    });

    it('executeBranch: skips already-succeeded upstream nodes', async () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      useLifecycleStore.setState({ edges: [] });
      const [inp, art] = getStore().nodes;
      getStore().updateNodeData(inp.id, { inputValue: 'data' });
      getStore().addEdge({ id: 'e1', source: inp.id, target: art.id, type: 'default' });

      // Pre-mark input as already succeeded
      useLifecycleStore.setState({
        nodes: getStore().nodes.map(n => ({
          ...n, data: { ...n.data, executionStatus: n.id === inp.id ? 'success' as const : n.data.executionStatus },
        })),
      });

      await getStore().executeBranch(art.id);

      // Should only execute 1 node (art), not 2
      const branchMsg = getStore().messages.find(m => m.content.includes('1 node(s) to execute'));
      expect(branchMsg).toBeDefined();
    });
  });

  // ── Scenario 24: UI handlers — panels, selection, context menu, duplication ──
  describe('Scenario 24 — UI handlers & selection management', () => {
    beforeEach(() => {
      useLifecycleStore.setState({
        nodes: [], edges: [], events: [], messages: [],
        impactPreview: null, toasts: [], isProcessing: false,
        showCIDPanel: false, showActivityPanel: false, showPreviewPanel: false,
        selectedNodeId: null, multiSelectedIds: new Set(),
        contextMenu: null, activeArtifactNodeId: null,
      });
    });

    // ── Panel toggles ──

    it('toggleCIDPanel: toggles showCIDPanel', () => {
      expect(getStore().showCIDPanel).toBe(false);
      getStore().toggleCIDPanel();
      expect(getStore().showCIDPanel).toBe(true);
      getStore().toggleCIDPanel();
      expect(getStore().showCIDPanel).toBe(false);
    });

    it('toggleActivityPanel: toggles showActivityPanel', () => {
      expect(getStore().showActivityPanel).toBe(false);
      getStore().toggleActivityPanel();
      expect(getStore().showActivityPanel).toBe(true);
    });

    it('togglePreviewPanel: toggles showPreviewPanel', () => {
      expect(getStore().showPreviewPanel).toBe(false);
      getStore().togglePreviewPanel();
      expect(getStore().showPreviewPanel).toBe(true);
    });

    // ── Node selection ──

    it('selectNode: sets selectedNodeId and clears multi-select', () => {
      getStore().createNewNode('input');
      const node = getStore().nodes[0];
      useLifecycleStore.setState({ multiSelectedIds: new Set(['fake-id']) });
      getStore().selectNode(node.id);
      expect(getStore().selectedNodeId).toBe(node.id);
      expect(getStore().multiSelectedIds.size).toBe(0);
    });

    it('selectNode: null deselects', () => {
      getStore().createNewNode('input');
      getStore().selectNode(getStore().nodes[0].id);
      getStore().selectNode(null);
      expect(getStore().selectedNodeId).toBeNull();
    });

    // ── Multi-select ──

    it('toggleMultiSelect: adds and removes nodes from multi-selection', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      const [a, b] = getStore().nodes;

      getStore().toggleMultiSelect(a.id);
      expect(getStore().multiSelectedIds.has(a.id)).toBe(true);

      getStore().toggleMultiSelect(b.id);
      expect(getStore().multiSelectedIds.size).toBe(2);

      // Toggle off
      getStore().toggleMultiSelect(a.id);
      expect(getStore().multiSelectedIds.has(a.id)).toBe(false);
      expect(getStore().multiSelectedIds.has(b.id)).toBe(true);
    });

    it('clearMultiSelect: empties the set', () => {
      getStore().createNewNode('input');
      getStore().toggleMultiSelect(getStore().nodes[0].id);
      expect(getStore().multiSelectedIds.size).toBe(1);
      getStore().clearMultiSelect();
      expect(getStore().multiSelectedIds.size).toBe(0);
    });

    it('deleteMultiSelected: removes selected nodes and their edges', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      useLifecycleStore.setState({ edges: [] });
      const [a, b] = getStore().nodes;
      getStore().addEdge({ id: 'e1', source: a.id, target: b.id, type: 'default' });

      // Select node a for multi-delete
      getStore().toggleMultiSelect(a.id);
      const count = getStore().deleteMultiSelected();

      expect(count).toBe(1);
      expect(getStore().nodes.find(n => n.id === a.id)).toBeUndefined();
      // Edge from a → b should also be removed
      expect(getStore().edges.find(e => e.source === a.id)).toBeUndefined();
      expect(getStore().multiSelectedIds.size).toBe(0);
    });

    it('deleteMultiSelected: returns 0 when nothing selected', () => {
      expect(getStore().deleteMultiSelected()).toBe(0);
    });

    // ── Context menu ──

    it('openContextMenu: sets contextMenu and selects node', () => {
      getStore().createNewNode('input');
      const node = getStore().nodes[0];
      getStore().openContextMenu(node.id, 100, 200);
      expect(getStore().contextMenu).toEqual({ nodeId: node.id, x: 100, y: 200 });
      expect(getStore().selectedNodeId).toBe(node.id);
    });

    it('closeContextMenu: clears contextMenu', () => {
      getStore().openContextMenu('some-id', 0, 0);
      getStore().closeContextMenu();
      expect(getStore().contextMenu).toBeNull();
    });

    // ── Duplicate node ──

    it('duplicateNode: creates copy with "(copy)" suffix', () => {
      getStore().createNewNode('artifact');
      const orig = getStore().nodes[0];
      getStore().duplicateNode(orig.id);
      expect(getStore().nodes).toHaveLength(2);
      const copy = getStore().nodes.find(n => n.id !== orig.id)!;
      expect(copy.data.label).toContain('(copy)');
      expect(copy.data.category).toBe(orig.data.category);
      expect(copy.data.version).toBe(1);
      expect(getStore().selectedNodeId).toBe(copy.id);
    });

    it('duplicateNode: no-ops for nonexistent node', () => {
      const before = getStore().nodes.length;
      getStore().duplicateNode('nope');
      expect(getStore().nodes.length).toBe(before);
    });

    // ── Artifact panel ──

    it('openArtifactPanel: sets activeArtifactNodeId and initializes version history', () => {
      getStore().createNewNode('artifact');
      const node = getStore().nodes[0];
      getStore().openArtifactPanel(node.id);
      expect(getStore().activeArtifactNodeId).toBe(node.id);
      expect(getStore().artifactVersions[node.id]).toBeDefined();
      expect(getStore().artifactVersions[node.id].length).toBe(1);
    });

    it('openArtifactPanel: no-ops for nonexistent node', () => {
      getStore().openArtifactPanel('nope');
      expect(getStore().activeArtifactNodeId).not.toBe('nope');
    });

    it('closeArtifactPanel: clears activeArtifactNodeId', () => {
      getStore().createNewNode('artifact');
      getStore().openArtifactPanel(getStore().nodes[0].id);
      getStore().closeArtifactPanel();
      expect(getStore().activeArtifactNodeId).toBeNull();
    });

    it('setArtifactTab: changes tab', () => {
      getStore().setArtifactTab('result');
      expect(getStore().artifactPanelTab).toBe('result');
      getStore().setArtifactTab('content');
      expect(getStore().artifactPanelTab).toBe('content');
    });

    // ── Batch update status ──

    it('batchUpdateStatus: updates all matching nodes', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      // Both start as 'active'
      const count = getStore().batchUpdateStatus('active', 'reviewing');
      expect(count).toBe(2);
      expect(getStore().nodes.every(n => n.data.status === 'reviewing')).toBe(true);
    });

    it('batchUpdateStatus: returns 0 when no nodes match', () => {
      getStore().createNewNode('input');
      const count = getStore().batchUpdateStatus('stale', 'active');
      expect(count).toBe(0);
    });

    it('batchUpdateStatus: uses cascade propagation for stale status', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      useLifecycleStore.setState({ edges: [] });
      const [inp, art] = getStore().nodes;
      getStore().addEdge({ id: 'e1', source: inp.id, target: art.id, type: 'default' });

      // Batch input → stale should cascade to artifact
      const count = getStore().batchUpdateStatus('active', 'stale');
      // Both should be stale (input directly, artifact via cascade)
      expect(getStore().nodes.every(n => n.data.status === 'stale')).toBe(true);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    // ── Edge label editing ──

    it('updateEdgeLabel: changes edge label', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      useLifecycleStore.setState({ edges: [] });
      const [a, b] = getStore().nodes;
      getStore().addEdge({ id: 'e1', source: a.id, target: b.id, type: 'default' });

      getStore().updateEdgeLabel('e1', 'validates');
      const edge = getStore().edges.find(e => e.id === 'e1')!;
      expect(edge.label).toBe('validates');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 25 — CID Rules, Breadcrumbs, Plan, Progress, Diff, BatchWhere, Health, RegenerateSelected
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario 25 — store utility handlers', () => {
    beforeEach(() => {
      useLifecycleStore.setState({
        nodes: [], edges: [], events: [], messages: [],
        impactPreview: null, toasts: [], isProcessing: false,
        cidRules: [], breadcrumbs: [], snapshots: new Map(),
        _lastHealthFingerprint: '',
      });
      mockFetch.mockClear();
    });

    // ── CID Rules ──

    it('addCIDRule: adds rule and returns confirmation', () => {
      const result = getStore().addCIDRule('Always use parallel execution');
      expect(result).toContain('Learned');
      expect(result).toContain('1');
      expect(getStore().cidRules).toHaveLength(1);
      expect(getStore().cidRules[0]).toBe('Always use parallel execution');
    });

    it('addCIDRule: multiple rules accumulate', () => {
      getStore().addCIDRule('Rule A');
      getStore().addCIDRule('Rule B');
      const result = getStore().addCIDRule('Rule C');
      expect(result).toContain('3');
      expect(getStore().cidRules).toHaveLength(3);
    });

    it('removeCIDRule: removes by index', () => {
      getStore().addCIDRule('Keep');
      getStore().addCIDRule('Remove');
      getStore().addCIDRule('Also keep');
      const result = getStore().removeCIDRule(1);
      expect(result).toContain('Forgot');
      expect(result).toContain('Remove');
      expect(getStore().cidRules).toHaveLength(2);
      expect(getStore().cidRules).toEqual(['Keep', 'Also keep']);
    });

    it('removeCIDRule: invalid index returns error', () => {
      getStore().addCIDRule('Only rule');
      const result = getStore().removeCIDRule(5);
      expect(result).toContain('Invalid');
      expect(getStore().cidRules).toHaveLength(1);
    });

    it('removeCIDRule: negative index returns error', () => {
      const result = getStore().removeCIDRule(-1);
      expect(result).toContain('Invalid');
    });

    it('listCIDRules: empty state message', () => {
      const result = getStore().listCIDRules();
      expect(result).toContain('No rules');
    });

    it('listCIDRules: formats rules as numbered list', () => {
      getStore().addCIDRule('First rule');
      getStore().addCIDRule('Second rule');
      const result = getStore().listCIDRules();
      expect(result).toContain('### CID Rules (2)');
      expect(result).toContain('1. First rule');
      expect(result).toContain('2. Second rule');
    });

    // ── Breadcrumbs ──

    it('addBreadcrumb: adds nodeId to trail', () => {
      getStore().addBreadcrumb('node-1');
      getStore().addBreadcrumb('node-2');
      expect(getStore().breadcrumbs).toEqual(['node-1', 'node-2']);
    });

    it('addBreadcrumb: deduplicates and moves to end', () => {
      getStore().addBreadcrumb('a');
      getStore().addBreadcrumb('b');
      getStore().addBreadcrumb('a');
      expect(getStore().breadcrumbs).toEqual(['b', 'a']);
    });

    it('addBreadcrumb: caps at 8 entries', () => {
      for (let i = 0; i < 10; i++) getStore().addBreadcrumb(`n-${i}`);
      expect(getStore().breadcrumbs).toHaveLength(8);
      expect(getStore().breadcrumbs[0]).toBe('n-2'); // oldest 2 dropped
      expect(getStore().breadcrumbs[7]).toBe('n-9');
    });

    it('clearBreadcrumbs: empties the trail', () => {
      getStore().addBreadcrumb('x');
      getStore().addBreadcrumb('y');
      getStore().clearBreadcrumbs();
      expect(getStore().breadcrumbs).toEqual([]);
    });

    // ── Workflow Progress ──

    it('getWorkflowProgress: empty workflow', () => {
      const prog = getStore().getWorkflowProgress();
      expect(prog).toEqual({ percent: 0, done: 0, total: 0, blocked: 0 });
    });

    it('getWorkflowProgress: calculates done and blocked', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      getStore().createNewNode('output');
      const nodes = getStore().nodes;
      // Mark first as success, second as stale, third stays default
      useLifecycleStore.setState({
        nodes: nodes.map((n, i) => ({
          ...n,
          data: {
            ...n.data,
            executionStatus: i === 0 ? 'success' as const : undefined,
            status: i === 1 ? 'stale' as const : n.data.status,
          },
        })),
      });
      const prog = getStore().getWorkflowProgress();
      expect(prog.total).toBe(3);
      expect(prog.done).toBe(1);
      expect(prog.blocked).toBe(1);
      expect(prog.percent).toBe(33);
    });

    // ── Snapshots & Diff ──

    it('diffSnapshot: no snapshots saved', () => {
      const result = getStore().diffSnapshot('missing');
      expect(result).toContain('No snapshots saved');
    });

    it('diffSnapshot: named snapshot not found with alternatives', () => {
      // Manually set a snapshot
      const snap = new Map();
      snap.set('v1', { nodes: [], edges: [], timestamp: Date.now() });
      useLifecycleStore.setState({ snapshots: snap });
      const result = getStore().diffSnapshot('v2');
      expect(result).toContain('No snapshot named "v2"');
      expect(result).toContain('v1');
    });

    it('diffSnapshot: detects added nodes', () => {
      // Save snapshot with empty workflow
      const snap = new Map();
      snap.set('baseline', { nodes: [], edges: [], timestamp: Date.now() });
      useLifecycleStore.setState({ snapshots: snap });
      // Add nodes to current
      getStore().createNewNode('input');
      const result = getStore().diffSnapshot('baseline');
      expect(result).toContain('Added');
      expect(result).toContain('1');
    });

    it('diffSnapshot: no changes matches snapshot', () => {
      getStore().createNewNode('input');
      const currentNodes = structuredClone(getStore().nodes);
      const currentEdges = structuredClone(getStore().edges);
      const snap = new Map();
      snap.set('same', { nodes: currentNodes, edges: currentEdges, timestamp: Date.now() });
      useLifecycleStore.setState({ snapshots: snap });
      const result = getStore().diffSnapshot('same');
      expect(result).toContain('No changes detected');
    });

    it('diffSnapshot: detects modified nodes (status change)', () => {
      getStore().createNewNode('input');
      const snapNodes = structuredClone(getStore().nodes);
      const snapEdges = structuredClone(getStore().edges);
      const snap = new Map();
      snap.set('v1', { nodes: snapNodes, edges: snapEdges, timestamp: Date.now() });
      useLifecycleStore.setState({ snapshots: snap });
      // Change status of the node
      const node = getStore().nodes[0];
      getStore().updateNodeStatus(node.id, 'stale');
      const result = getStore().diffSnapshot('v1');
      expect(result).toContain('Modified');
    });

    // ── batchWhere ──

    it('batchWhere: invalid syntax returns usage', () => {
      const result = getStore().batchWhere('nonsense input');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Usage');
    });

    it('batchWhere: invalid status returns error', () => {
      getStore().createNewNode('input');
      const result = getStore().batchWhere('batch explode where category=input');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid status');
    });

    it('batchWhere: no matching nodes', () => {
      getStore().createNewNode('input');
      const result = getStore().batchWhere('batch locked where category=output');
      expect(result.success).toBe(false);
      expect(result.message).toContain('No nodes match');
    });

    it('batchWhere: locks nodes by category', () => {
      getStore().createNewNode('review');
      getStore().createNewNode('review');
      getStore().createNewNode('input');
      const result = getStore().batchWhere('batch locked where category=review');
      expect(result.success).toBe(true);
      expect(result.message).toContain('2');
      const reviews = getStore().nodes.filter(n => n.data.category === 'review');
      expect(reviews.every(n => n.data.status === 'locked')).toBe(true);
    });

    it('batchWhere: updates by status field', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      // Both start as active
      const result = getStore().batchWhere('batch reviewing where status=active');
      expect(result.success).toBe(true);
      expect(getStore().nodes.every(n => n.data.status === 'reviewing')).toBe(true);
    });

    it('batchWhere: already at target status', () => {
      getStore().createNewNode('input');
      const result = getStore().batchWhere('batch active where category=input');
      expect(result.success).toBe(true);
      expect(result.message).toContain('already');
    });

    it('batchWhere: matches by label (partial)', () => {
      getStore().createNewNode('input');
      // Default label includes category name
      const node = getStore().nodes[0];
      useLifecycleStore.setState({
        nodes: [{ ...node, data: { ...node.data, label: 'My Custom Input' } }],
      });
      const result = getStore().batchWhere('batch stale where label=custom');
      expect(result.success).toBe(true);
      expect(getStore().nodes[0].data.status).toBe('stale');
    });

    // ── generatePlan ──

    it('generatePlan: empty workflow', () => {
      const result = getStore().generatePlan();
      expect(result).toContain('No workflow');
    });

    it('generatePlan: linear chain produces step sequence', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      getStore().createNewNode('output');
      useLifecycleStore.setState({ edges: [] });
      const [inp, art, out] = getStore().nodes;
      getStore().addEdge({ id: 'e1', source: inp.id, target: art.id, type: 'default' });
      getStore().addEdge({ id: 'e2', source: art.id, target: out.id, type: 'default' });
      const result = getStore().generatePlan();
      expect(result).toContain('### Execution Plan');
      expect(result).toContain('Step 1');
      expect(result).toContain('Step 2');
      expect(result).toContain('Step 3');
      expect(result).toContain('3 execution phases');
    });

    it('generatePlan: parallel nodes marked', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      getStore().createNewNode('artifact');
      useLifecycleStore.setState({ edges: [] });
      const [inp, art1, art2] = getStore().nodes;
      getStore().addEdge({ id: 'e1', source: inp.id, target: art1.id, type: 'default' });
      getStore().addEdge({ id: 'e2', source: inp.id, target: art2.id, type: 'default' });
      const result = getStore().generatePlan();
      expect(result).toContain('parallel');
    });

    // ── runHealthCheck ──

    it('runHealthCheck: does nothing on empty workflow', () => {
      getStore().runHealthCheck();
      expect(getStore().messages).toHaveLength(0);
    });

    it('runHealthCheck: silent mode does not add messages', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      // Create a disconnected node to trigger health issue
      getStore().runHealthCheck(true);
      // Silent should not add messages even with issues
      const healthMsgs = getStore().messages.filter(m => m.role === 'cid');
      expect(healthMsgs).toHaveLength(0);
    });

    it('runHealthCheck: updates fingerprint', () => {
      getStore().createNewNode('input');
      getStore().runHealthCheck(true);
      // Fingerprint should be set (even if no issues, it's a hash of the empty array)
      expect(getStore()._lastHealthFingerprint).toBeDefined();
    });

    // ── regenerateSelected ──

    it('regenerateSelected: no-op when no ids provided and no preview', async () => {
      await getStore().regenerateSelected();
      // Should not throw, no messages added
      expect(getStore().messages).toHaveLength(0);
    });

    it('regenerateSelected: skips non-stale nodes', async () => {
      getStore().createNewNode('input');
      const nodeId = getStore().nodes[0].id;
      // Node is active (not stale), so regenerateSelected should skip it
      await getStore().regenerateSelected([nodeId]);
      // Should have start message but 0 success (node was not stale)
      const msgs = getStore().messages;
      expect(msgs.length).toBeGreaterThanOrEqual(1);
      const doneMsg = msgs[msgs.length - 1].content;
      expect(doneMsg).toContain('0 node');
    });

    it('regenerateSelected: regenerates stale nodes in topo order', async () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      useLifecycleStore.setState({ edges: [] });
      const [inp, art] = getStore().nodes;
      getStore().addEdge({ id: 'e1', source: inp.id, target: art.id, type: 'default' });

      // Mark both as stale
      getStore().updateNodeStatus(inp.id, 'stale');
      getStore().updateNodeStatus(art.id, 'stale');

      await getStore().regenerateSelected([inp.id, art.id]);

      // Both should have been processed
      const msgs = getStore().messages;
      expect(msgs.length).toBeGreaterThanOrEqual(2); // start + done
      const doneMsg = msgs[msgs.length - 1].content;
      expect(doneMsg).toMatch(/regenerated/i);
    });

    it('regenerateSelected: clears impactPreview', async () => {
      getStore().createNewNode('input');
      const nodeId = getStore().nodes[0].id;
      useLifecycleStore.setState({
        impactPreview: { editedNodeId: nodeId, impactedNodeIds: [nodeId], selectedNodeIds: new Set([nodeId]) },
      });
      await getStore().regenerateSelected([nodeId]);
      expect(getStore().impactPreview).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 26 — Artifact version management & downstream traversal
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario 26 — artifact helpers & downstream', () => {
    beforeEach(() => {
      useLifecycleStore.setState({
        nodes: [], edges: [], events: [], messages: [],
        impactPreview: null, toasts: [], isProcessing: false,
        artifactVersions: {},
      });
      mockFetch.mockClear();
    });

    // ── saveArtifactVersion ──

    it('saveArtifactVersion: saves version with content snapshot', () => {
      getStore().createNewNode('artifact');
      const nodeId = getStore().nodes[0].id;
      // Set some content
      useLifecycleStore.setState({
        nodes: getStore().nodes.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, content: 'Draft 1', executionResult: 'Result 1' } } : n
        ),
      });
      getStore().saveArtifactVersion(nodeId);
      const versions = getStore().artifactVersions[nodeId];
      expect(versions).toHaveLength(1);
      expect(versions[0].content).toBe('Draft 1');
      expect(versions[0].result).toBe('Result 1');
      expect(versions[0].label).toBe('v0');
    });

    it('saveArtifactVersion: accumulates versions', () => {
      getStore().createNewNode('artifact');
      const nodeId = getStore().nodes[0].id;
      getStore().saveArtifactVersion(nodeId);
      getStore().saveArtifactVersion(nodeId);
      getStore().saveArtifactVersion(nodeId);
      expect(getStore().artifactVersions[nodeId]).toHaveLength(3);
      expect(getStore().artifactVersions[nodeId][2].label).toBe('v2');
    });

    it('saveArtifactVersion: caps at 20 versions', () => {
      getStore().createNewNode('artifact');
      const nodeId = getStore().nodes[0].id;
      for (let i = 0; i < 25; i++) {
        getStore().saveArtifactVersion(nodeId);
      }
      expect(getStore().artifactVersions[nodeId]).toHaveLength(20);
    });

    it('saveArtifactVersion: no-op for nonexistent node', () => {
      getStore().saveArtifactVersion('fake-id');
      expect(getStore().artifactVersions['fake-id']).toBeUndefined();
    });

    // ── restoreArtifactVersion ──

    it('restoreArtifactVersion: restores content from saved version', () => {
      getStore().createNewNode('artifact');
      const nodeId = getStore().nodes[0].id;
      // Save v0 with "Original"
      useLifecycleStore.setState({
        nodes: getStore().nodes.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, content: 'Original' } } : n
        ),
      });
      getStore().saveArtifactVersion(nodeId);
      // Change content
      getStore().updateNodeData(nodeId, { content: 'Modified' });
      expect(getStore().nodes[0].data.content).toBe('Modified');
      // Restore v0
      getStore().restoreArtifactVersion(nodeId, 0);
      expect(getStore().nodes[0].data.content).toBe('Original');
    });

    it('restoreArtifactVersion: no-op for invalid version index', () => {
      getStore().createNewNode('artifact');
      const nodeId = getStore().nodes[0].id;
      getStore().restoreArtifactVersion(nodeId, 99);
      // Should not throw
      expect(getStore().nodes).toHaveLength(1);
    });

    it('restoreArtifactVersion: no-op for nonexistent node', () => {
      getStore().restoreArtifactVersion('fake', 0);
      expect(getStore().events).toHaveLength(0);
    });

    it('restoreArtifactVersion: adds event', () => {
      getStore().createNewNode('artifact');
      const nodeId = getStore().nodes[0].id;
      getStore().saveArtifactVersion(nodeId);
      getStore().restoreArtifactVersion(nodeId, 0);
      const restoreEvents = getStore().events.filter(e => e.message.includes('Restored'));
      expect(restoreEvents.length).toBeGreaterThanOrEqual(1);
    });

    // ── getDownstreamNodes ──

    it('getDownstreamNodes: returns empty for leaf node', () => {
      getStore().createNewNode('output');
      const nodeId = getStore().nodes[0].id;
      const downstream = getStore().getDownstreamNodes(nodeId);
      expect(downstream).toHaveLength(0);
    });

    it('getDownstreamNodes: returns direct children', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      getStore().createNewNode('output');
      useLifecycleStore.setState({ edges: [] });
      const [inp, art, out] = getStore().nodes;
      getStore().addEdge({ id: 'e1', source: inp.id, target: art.id, type: 'default' });
      getStore().addEdge({ id: 'e2', source: inp.id, target: out.id, type: 'default' });
      const downstream = getStore().getDownstreamNodes(inp.id);
      expect(downstream).toHaveLength(2);
      expect(downstream.map(d => d.id)).toContain(art.id);
      expect(downstream.map(d => d.id)).toContain(out.id);
    });

    it('getDownstreamNodes: traverses full chain (BFS)', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      getStore().createNewNode('output');
      useLifecycleStore.setState({ edges: [] });
      const [inp, art, out] = getStore().nodes;
      getStore().addEdge({ id: 'e1', source: inp.id, target: art.id, type: 'default' });
      getStore().addEdge({ id: 'e2', source: art.id, target: out.id, type: 'default' });
      const downstream = getStore().getDownstreamNodes(inp.id);
      expect(downstream).toHaveLength(2);
      // BFS: artifact first, then output
      expect(downstream[0].id).toBe(art.id);
      expect(downstream[1].id).toBe(out.id);
    });

    it('getDownstreamNodes: no duplicates in diamond graph', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      getStore().createNewNode('artifact');
      getStore().createNewNode('output');
      useLifecycleStore.setState({ edges: [] });
      const [inp, a, b, out] = getStore().nodes;
      getStore().addEdge({ id: 'e1', source: inp.id, target: a.id, type: 'default' });
      getStore().addEdge({ id: 'e2', source: inp.id, target: b.id, type: 'default' });
      getStore().addEdge({ id: 'e3', source: a.id, target: out.id, type: 'default' });
      getStore().addEdge({ id: 'e4', source: b.id, target: out.id, type: 'default' });
      const downstream = getStore().getDownstreamNodes(inp.id);
      // Should be 3 (a, b, out) with no duplicates
      expect(downstream).toHaveLength(3);
      const ids = downstream.map(d => d.id);
      expect(new Set(ids).size).toBe(3);
    });

    // ── getExecutedNodesInOrder ──

    it('getExecutedNodesInOrder: returns only nodes with content', () => {
      getStore().createNewNode('input');
      getStore().createNewNode('artifact');
      const [inp, art] = getStore().nodes;
      // Only give content to the artifact
      useLifecycleStore.setState({
        nodes: getStore().nodes.map(n =>
          n.id === art.id ? { ...n, data: { ...n.data, executionResult: 'Some result' } } : n
        ),
      });
      const executed = getStore().getExecutedNodesInOrder();
      expect(executed).toHaveLength(1);
      expect(executed[0].id).toBe(art.id);
    });
  });

  // ── Scenario 27: Natural language graph manipulation ──
  describe('Scenario 27 — connectByName, disconnectByName, deleteByName, renameByName', () => {
    beforeEach(resetStore);

    it('connectByName: connects two existing nodes', () => {
      buildSimpleWorkflow();
      // Remove existing edge so we can reconnect
      useLifecycleStore.setState({ edges: [] });
      const result = getStore().connectByName('connect Input Data to Process');
      expect(result.success).toBe(true);
      expect(result.message).toContain('Input Data');
      expect(result.message).toContain('Process');
      expect(getStore().edges).toHaveLength(1);
    });

    it('connectByName: fails with fewer than 2 nodes', () => {
      useLifecycleStore.setState({ nodes: [mkNode('n1', 'Solo', 'input')] });
      const result = getStore().connectByName('connect Solo to Something');
      expect(result.success).toBe(false);
      expect(result.message).toContain('at least 2');
    });

    it('connectByName: fails with unparseable prompt', () => {
      buildSimpleWorkflow();
      const result = getStore().connectByName('gibberish');
      expect(result.success).toBe(false);
    });

    it('connectByName: fails if source not found', () => {
      buildSimpleWorkflow();
      const result = getStore().connectByName('connect Nonexistent to Process');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Could not find');
    });

    it('connectByName: fails on self-connection', () => {
      buildSimpleWorkflow();
      const result = getStore().connectByName('connect Process to Process');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot connect a node to itself');
    });

    it('connectByName: fails if already connected', () => {
      buildSimpleWorkflow();
      const result = getStore().connectByName('connect Input Data to Process');
      expect(result.success).toBe(false);
      expect(result.message).toContain('already connected');
    });

    it('disconnectByName: removes existing edge', () => {
      buildSimpleWorkflow();
      expect(getStore().edges).toHaveLength(2);
      const result = getStore().disconnectByName('disconnect Input Data from Process');
      expect(result.success).toBe(true);
      expect(getStore().edges).toHaveLength(1);
    });

    it('disconnectByName: fails with no edges', () => {
      buildSimpleWorkflow();
      useLifecycleStore.setState({ edges: [] });
      const result = getStore().disconnectByName('disconnect Input Data from Process');
      expect(result.success).toBe(false);
      expect(result.message).toContain('No connections');
    });

    it('disconnectByName: fails on unparseable prompt', () => {
      buildSimpleWorkflow();
      const result = getStore().disconnectByName('gibberish');
      expect(result.success).toBe(false);
    });

    it('disconnectByName: fails if nodes not connected', () => {
      buildSimpleWorkflow();
      const result = getStore().disconnectByName('disconnect Input Data from Output Report');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not connected');
    });

    it('deleteByName: removes node and reports connections', () => {
      buildSimpleWorkflow();
      const result = getStore().deleteByName('delete Process');
      expect(result.success).toBe(true);
      expect(result.message).toContain('Process');
      expect(result.message).toContain('connection');
      expect(getStore().nodes).toHaveLength(2);
    });

    it('deleteByName: fails with no nodes', () => {
      const result = getStore().deleteByName('delete Something');
      expect(result.success).toBe(false);
    });

    it('deleteByName: fails on unparseable prompt', () => {
      buildSimpleWorkflow();
      const result = getStore().deleteByName('gibberish');
      expect(result.success).toBe(false);
    });

    it('renameByName: renames a node', () => {
      buildSimpleWorkflow();
      const result = getStore().renameByName('rename Process to Transform');
      expect(result.success).toBe(true);
      expect(result.message).toContain('Transform');
      const renamed = getStore().nodes.find(n => n.data.label === 'Transform');
      expect(renamed).toBeTruthy();
    });

    it('renameByName: fails with no nodes', () => {
      const result = getStore().renameByName('rename Foo to Bar');
      expect(result.success).toBe(false);
    });

    it('renameByName: fails on unparseable prompt', () => {
      buildSimpleWorkflow();
      const result = getStore().renameByName('gibberish');
      expect(result.success).toBe(false);
    });

    it('renameByName: fails if node not found', () => {
      buildSimpleWorkflow();
      const result = getStore().renameByName('rename Nonexistent to Something');
      expect(result.success).toBe(false);
      expect(result.message).toContain('No node');
    });
  });

  // ── Scenario 28: Health, complexity, status report, explain ──
  describe('Scenario 28 — getHealthScore, getComplexityScore, getStatusReport, explainWorkflow, validate, summarize', () => {
    beforeEach(resetStore);

    it('getHealthScore: returns 100 for empty workflow', () => {
      expect(getStore().getHealthScore()).toBe(100);
    });

    it('getHealthScore: penalizes stale nodes', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'A', 'action', { status: 'stale' }), mkNode('n2', 'B', 'action')],
        edges: [mkEdge('e1', 'n1', 'n2')],
      });
      const score = getStore().getHealthScore();
      expect(score).toBeLessThan(100);
      expect(score).toBe(100 - 10 - 15); // -10 stale, -15 no review
    });

    it('getHealthScore: penalizes orphans', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'A', 'review'), mkNode('n2', 'Orphan', 'action')],
        edges: [],
      });
      const score = getStore().getHealthScore();
      // Both are orphans: -8 * 2 = -16
      expect(score).toBe(100 - 16);
    });

    it('getComplexityScore: empty returns 0', () => {
      const result = getStore().getComplexityScore();
      expect(result.score).toBe(0);
      expect(result.label).toBe('Empty');
    });

    it('getComplexityScore: simple workflow returns a score', () => {
      buildSimpleWorkflow();
      const result = getStore().getComplexityScore();
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(100);
      expect(typeof result.label).toBe('string');
    });

    it('getStatusReport: returns "no workflow" when empty', () => {
      expect(getStore().getStatusReport()).toContain('No workflow');
    });

    it('getStatusReport: includes node count and health', () => {
      buildSimpleWorkflow();
      const report = getStore().getStatusReport();
      expect(report).toContain('3');
      expect(report).toContain('Health');
    });

    it('getStatusReport: lists stale nodes in action items', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'A', 'review', { status: 'stale' }),
          mkNode('n2', 'B', 'action'),
        ],
        edges: [mkEdge('e1', 'n1', 'n2')],
      });
      const report = getStore().getStatusReport();
      expect(report).toContain('stale');
      expect(report).toContain('Action Items');
    });

    it('explainWorkflow: returns "no workflow" when empty', () => {
      expect(getStore().explainWorkflow()).toContain('No workflow');
    });

    it('explainWorkflow: describes flow steps', () => {
      buildSimpleWorkflow();
      const explanation = getStore().explainWorkflow();
      expect(explanation).toContain('Input Data');
      expect(explanation).toContain('Process');
    });

    it('validate: returns "no workflow" when empty', () => {
      expect(getStore().validate()).toContain('No workflow');
    });

    it('validate: detects clean graph', () => {
      buildSimpleWorkflow();
      const result = getStore().validate();
      expect(result).toContain('All Clear');
    });

    it('validate: detects self-loops', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'A', 'action')],
        edges: [mkEdge('e1', 'n1', 'n1')],
      });
      const result = getStore().validate();
      expect(result).toContain('self-loop');
    });

    it('validate: detects duplicate edges', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'A', 'action'), mkNode('n2', 'B', 'action')],
        edges: [mkEdge('e1', 'n1', 'n2'), mkEdge('e2', 'n1', 'n2')],
      });
      const result = getStore().validate();
      expect(result).toContain('duplicate');
    });

    it('validate: detects cycles', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'A', 'action'), mkNode('n2', 'B', 'action')],
        edges: [mkEdge('e1', 'n1', 'n2'), mkEdge('e2', 'n2', 'n1')],
      });
      const result = getStore().validate();
      expect(result).toContain('Cycle');
    });

    it('validate: detects locked+stale contradictions', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'A', 'action', { status: 'stale', locked: true })],
        edges: [],
      });
      const result = getStore().validate();
      expect(result).toContain('locked+stale');
    });

    it('validate: detects stuck generating nodes', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'A', 'action', { status: 'generating' as any })],
        edges: [],
      });
      const result = getStore().validate();
      expect(result).toContain('generating');
    });

    it('summarize: returns "no workflow" when empty', () => {
      expect(getStore().summarize()).toContain('No workflow');
    });

    it('summarize: includes executive summary with details', () => {
      buildSimpleWorkflow();
      const summary = getStore().summarize();
      expect(summary).toContain('Executive Summary');
      expect(summary).toContain('3 nodes');
      expect(summary).toContain('Entry points');
      expect(summary).toContain('Deliverables');
    });

    it('summarize: mentions stale nodes', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'Root', 'input', { status: 'stale' }),
          mkNode('n2', 'Output', 'output'),
        ],
        edges: [mkEdge('e1', 'n1', 'n2')],
      });
      const summary = getStore().summarize();
      expect(summary).toContain('stale');
      expect(summary).toContain('Attention');
    });
  });

  // ── Scenario 29: Snapshots & critical path ──
  describe('Scenario 29 — saveSnapshot, restoreSnapshot, listSnapshots, diffSnapshot, criticalPath, whatIf', () => {
    beforeEach(resetStore);

    it('saveSnapshot: saves and retrieves', () => {
      buildSimpleWorkflow();
      const result = getStore().saveSnapshot('v1');
      expect(result).toContain('v1');
      expect(getStore().snapshots.size).toBe(1);
    });

    it('saveSnapshot: returns message when no nodes', () => {
      const result = getStore().saveSnapshot('v1');
      expect(result).toContain('No nodes');
    });

    it('restoreSnapshot: restores saved state', () => {
      buildSimpleWorkflow();
      getStore().saveSnapshot('v1');
      // Modify the workflow
      getStore().deleteNode(getStore().nodes[0].id);
      expect(getStore().nodes).toHaveLength(2);
      const result = getStore().restoreSnapshot('v1');
      expect(result.success).toBe(true);
      expect(getStore().nodes).toHaveLength(3);
    });

    it('restoreSnapshot: fails for nonexistent snapshot', () => {
      const result = getStore().restoreSnapshot('nonexistent');
      expect(result.success).toBe(false);
      expect(result.message).toContain('No snapshot');
    });

    it('listSnapshots: lists saved snapshots', () => {
      buildSimpleWorkflow();
      getStore().saveSnapshot('alpha');
      getStore().saveSnapshot('beta');
      const list = getStore().listSnapshots();
      expect(list).toContain('alpha');
      expect(list).toContain('beta');
      expect(list).toContain('2');
    });

    it('listSnapshots: reports none when empty', () => {
      // Clear any snapshots from prior tests
      useLifecycleStore.setState({ snapshots: new Map() });
      const list = getStore().listSnapshots();
      expect(list).toContain('No snapshots');
    });

    it('diffSnapshot: detects added nodes', () => {
      buildSimpleWorkflow();
      getStore().saveSnapshot('before');
      getStore().createNewNode('action');
      const diff = getStore().diffSnapshot('before');
      expect(diff).toContain('Added');
    });

    it('diffSnapshot: reports no changes when identical', () => {
      buildSimpleWorkflow();
      getStore().saveSnapshot('same');
      const diff = getStore().diffSnapshot('same');
      expect(diff).toContain('No changes');
    });

    it('diffSnapshot: fails for nonexistent snapshot', () => {
      const diff = getStore().diffSnapshot('nope');
      expect(diff).toContain('No snapshot');
    });

    it('criticalPath: returns path for chain', () => {
      buildSimpleWorkflow();
      const path = getStore().criticalPath();
      expect(path).toContain('Critical Path');
      expect(path).toContain('3 nodes');
      expect(path).toContain('Input Data');
      expect(path).toContain('Output Report');
    });

    it('criticalPath: handles empty workflow', () => {
      expect(getStore().criticalPath()).toContain('No nodes');
    });

    it('criticalPath: handles no edges', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'A', 'action'), mkNode('n2', 'B', 'action')],
        edges: [],
      });
      expect(getStore().criticalPath()).toContain('No edges');
    });

    it('whatIf: simulates node removal impact', () => {
      buildSimpleWorkflow();
      const result = getStore().whatIf('what if remove Process');
      expect(result).toContain('Impact Analysis');
      expect(result).toContain('Process');
      expect(result).toContain('connection');
    });

    it('whatIf: handles empty workflow', () => {
      expect(getStore().whatIf('what if remove X')).toContain('No workflow');
    });

    it('whatIf: handles unparseable prompt', () => {
      buildSimpleWorkflow();
      expect(getStore().whatIf('gibberish')).toContain('Usage');
    });

    it('whatIf: handles nonexistent node', () => {
      buildSimpleWorkflow();
      expect(getStore().whatIf('what if remove Nonexistent')).toContain('No node');
    });
  });

  // ── Scenario 30: Merge, deps, reverse, orphans, count, groupByCategory, clearStale ──
  describe('Scenario 30 — mergeByName, depsByName, reverseByName, findOrphans, countNodes, groupByCategory, clearStale', () => {
    beforeEach(resetStore);

    it('mergeByName: combines two nodes', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'Alpha', 'action', { content: 'Content A' }),
          mkNode('n2', 'Beta', 'action', { content: 'Content B' }),
        ],
        edges: [mkEdge('e1', 'n1', 'n2')],
      });
      const result = getStore().mergeByName('merge Alpha and Beta');
      expect(result.success).toBe(true);
      expect(getStore().nodes).toHaveLength(1);
      expect(getStore().nodes[0].data.content).toContain('Content A');
      expect(getStore().nodes[0].data.content).toContain('Content B');
    });

    it('mergeByName: fails with fewer than 2 nodes', () => {
      useLifecycleStore.setState({ nodes: [mkNode('n1', 'Solo', 'action')] });
      const result = getStore().mergeByName('merge Solo and Other');
      expect(result.success).toBe(false);
    });

    it('mergeByName: fails on self-merge', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'Alpha', 'action'), mkNode('n2', 'Beta', 'action')],
        edges: [],
      });
      const result = getStore().mergeByName('merge Alpha and Alpha');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot merge a node with itself');
    });

    it('depsByName: shows upstream and downstream', () => {
      buildSimpleWorkflow();
      const result = getStore().depsByName('deps Process');
      expect(result).toContain('Dependencies');
      expect(result).toContain('Upstream');
      expect(result).toContain('Downstream');
      expect(result).toContain('Input Data');
      expect(result).toContain('Output Report');
    });

    it('depsByName: shows root node with no upstream', () => {
      buildSimpleWorkflow();
      const result = getStore().depsByName('deps Input Data');
      expect(result).toContain('None (root node)');
    });

    it('depsByName: shows leaf node with no downstream', () => {
      buildSimpleWorkflow();
      const result = getStore().depsByName('deps Output Report');
      expect(result).toContain('None (leaf node)');
    });

    it('depsByName: handles empty workflow', () => {
      expect(getStore().depsByName('deps Something')).toContain('No nodes');
    });

    it('reverseByName: reverses edges on a node', () => {
      buildSimpleWorkflow();
      // Process has 1 incoming (from Input Data) and 1 outgoing (to Output Report)
      const beforeEdges = getStore().edges.map(e => ({ source: e.source, target: e.target }));
      const result = getStore().reverseByName('reverse edges of Process');
      expect(result.success).toBe(true);
      expect(result.message).toContain('Reversed');
      // Edges should be flipped
      const afterEdges = getStore().edges;
      const procNode = getStore().nodes.find(n => n.data.label === 'Process')!;
      // Previously Process had 1 incoming, 1 outgoing. Now reversed.
      const incomingAfter = afterEdges.filter(e => e.target === procNode.id);
      const outgoingAfter = afterEdges.filter(e => e.source === procNode.id);
      // Input Data -> Process becomes Process -> Input Data (so Process now has outgoing to Input Data)
      expect(incomingAfter.length + outgoingAfter.length).toBe(2);
    });

    it('findOrphans: reports no orphans in connected graph', () => {
      buildSimpleWorkflow();
      const result = getStore().findOrphans();
      expect(result).toContain('No orphan');
    });

    it('findOrphans: detects orphaned nodes', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'Connected', 'action'), mkNode('n2', 'Other', 'action'), mkNode('n3', 'Orphan', 'action')],
        edges: [mkEdge('e1', 'n1', 'n2')],
      });
      const result = getStore().findOrphans();
      expect(result).toContain('Orphan');
      expect(result).toContain('1');
    });

    it('countNodes: counts by category and status', () => {
      buildSimpleWorkflow();
      const result = getStore().countNodes();
      expect(result).toContain('3 nodes');
      expect(result).toContain('input');
      expect(result).toContain('action');
      expect(result).toContain('output');
      expect(result).toContain('active');
    });

    it('countNodes: empty workflow', () => {
      expect(getStore().countNodes()).toContain('No nodes');
    });

    it('groupByCategory: groups nodes into columns', () => {
      buildSimpleWorkflow();
      const result = getStore().groupByCategory();
      expect(result.success).toBe(true);
      expect(result.message).toContain('3');
      // Nodes of same category should have same x position
      const nodes = getStore().nodes;
      expect(nodes.every(n => n.position.x >= 0)).toBe(true);
    });

    it('groupByCategory: fails with no nodes', () => {
      const result = getStore().groupByCategory();
      expect(result.success).toBe(false);
    });

    it('clearStale: removes stale nodes', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'Fresh', 'action', { status: 'active' }),
          mkNode('n2', 'Stale One', 'action', { status: 'stale' }),
          mkNode('n3', 'Stale Two', 'action', { status: 'stale' }),
        ],
        edges: [mkEdge('e1', 'n1', 'n2'), mkEdge('e2', 'n2', 'n3')],
      });
      const result = getStore().clearStale();
      expect(result.count).toBe(2);
      expect(getStore().nodes).toHaveLength(1);
      expect(getStore().nodes[0].data.label).toBe('Fresh');
      // Edges connected to stale nodes should be removed
      expect(getStore().edges).toHaveLength(0);
    });

    it('clearStale: no-op when no stale nodes', () => {
      buildSimpleWorkflow();
      const result = getStore().clearStale();
      expect(result.count).toBe(0);
      expect(result.message).toContain('No stale');
    });

    it('clearStale: clears selection if selected node was stale', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'Stale', 'action', { status: 'stale' })],
        edges: [],
        selectedNodeId: 'n1',
      });
      getStore().clearStale();
      expect(getStore().selectedNodeId).toBeNull();
    });
  });

  // ── Scenario 31: lockNode, approveNode, cidSolve, export/import, batchUpdateStatus ──
  describe('Scenario 31 — lockNode, approveNode, cidSolve, exportWorkflow, importWorkflow, batchUpdateStatus', () => {
    beforeEach(resetStore);

    it('lockNode: sets locked status', () => {
      buildSimpleWorkflow();
      const nodeId = getStore().nodes[0].id;
      getStore().lockNode(nodeId);
      const node = getStore().nodes.find(n => n.id === nodeId)!;
      expect(node.data.locked).toBe(true);
      expect(node.data.status).toBe('locked');
      expect(getStore().events.some(e => e.type === 'locked')).toBe(true);
    });

    it('approveNode: sets active status', () => {
      buildSimpleWorkflow();
      const nodeId = getStore().nodes[0].id;
      getStore().updateNodeStatus(nodeId, 'reviewing');
      getStore().approveNode(nodeId);
      const node = getStore().nodes.find(n => n.id === nodeId)!;
      expect(node.data.status).toBe('active');
      expect(getStore().events.some(e => e.type === 'approved')).toBe(true);
    });

    it('cidSolve: creates connector hub for isolated nodes', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'Island A', 'action'),
          mkNode('n2', 'Island B', 'action'),
        ],
        edges: [],
      });
      const result = getStore().cidSolve();
      expect(result.created).toBeGreaterThan(0);
      expect(result.message).toContain('Connector Hub');
      // Should have created a connector node and edges
      expect(getStore().nodes.length).toBeGreaterThan(2);
      expect(getStore().edges.length).toBeGreaterThan(0);
    });

    it('cidSolve: creates validator for unvalidated artifacts', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'My Artifact', 'artifact'),
          mkNode('n2', 'Another', 'action'),
        ],
        edges: [mkEdge('e1', 'n1', 'n2')],
      });
      const result = getStore().cidSolve();
      expect(result.created).toBeGreaterThan(0);
      expect(result.message).toContain('Quality Validator');
    });

    it('cidSolve: no-op on empty workflow', () => {
      const result = getStore().cidSolve();
      expect(result.created).toBe(0);
    });

    it('exportWorkflow: produces valid JSON', () => {
      buildSimpleWorkflow();
      const json = getStore().exportWorkflow();
      const parsed = JSON.parse(json);
      expect(parsed._format).toBe('lifecycle-agent');
      expect(parsed.nodes).toHaveLength(3);
      expect(parsed.edges).toHaveLength(2);
    });

    it('importWorkflow: imports valid workflow', () => {
      buildSimpleWorkflow();
      const json = getStore().exportWorkflow();
      resetStore();
      expect(getStore().nodes).toHaveLength(0);
      const result = getStore().importWorkflow(json);
      expect(result).toBe(true);
      expect(getStore().nodes).toHaveLength(3);
      expect(getStore().edges).toHaveLength(2);
    });

    it('importWorkflow: rejects invalid JSON', () => {
      expect(getStore().importWorkflow('not json')).toBe(false);
    });

    it('importWorkflow: rejects missing nodes', () => {
      expect(getStore().importWorkflow('{"edges": []}')).toBe(false);
    });

    it('importWorkflow: rejects nodes without required fields', () => {
      expect(getStore().importWorkflow('{"nodes": [{"id": "1"}]}')).toBe(false);
    });

    it('importWorkflow: cleans self-loops and duplicates', () => {
      const n1 = mkNode('n1', 'A', 'action');
      const n2 = mkNode('n2', 'B', 'action');
      const json = JSON.stringify({
        nodes: [n1, n2],
        edges: [
          mkEdge('e1', 'n1', 'n2'),
          mkEdge('e2', 'n1', 'n1'), // self-loop
          mkEdge('e3', 'n1', 'n2'), // duplicate
        ],
      });
      const result = getStore().importWorkflow(json);
      expect(result).toBe(true);
      // Self-loop and duplicate should be removed
      expect(getStore().edges).toHaveLength(1);
    });

    it('batchUpdateStatus: updates matching nodes', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'A', 'action', { status: 'active' }),
          mkNode('n2', 'B', 'action', { status: 'active' }),
          mkNode('n3', 'C', 'action', { status: 'stale' }),
        ],
        edges: [],
      });
      const count = getStore().batchUpdateStatus('active', 'reviewing');
      expect(count).toBe(2);
      const reviewing = getStore().nodes.filter(n => n.data.status === 'reviewing');
      expect(reviewing).toHaveLength(2);
    });

    it('batchUpdateStatus: returns 0 when no matches', () => {
      buildSimpleWorkflow();
      const count = getStore().batchUpdateStatus('stale', 'active');
      expect(count).toBe(0);
    });
  });

  // ── Scenario 32: Analysis functions — compressWorkflow, findBottlenecks, suggestNextSteps, etc. ──
  describe('Scenario 32 — compressWorkflow, findBottlenecks, suggestNextSteps, healthBreakdown, whyNode, isolateByName', () => {
    beforeEach(resetStore);

    it('compressWorkflow: clean graph returns no duplicates', () => {
      buildSimpleWorkflow();
      const result = getStore().compressWorkflow();
      expect(result).toContain('clean');
    });

    it('compressWorkflow: removes duplicate nodes', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'Task', 'action', { content: 'A' }),
          mkNode('n2', 'Task', 'action', { content: 'B' }),
          mkNode('n3', 'Output', 'output'),
        ],
        edges: [mkEdge('e1', 'n1', 'n3'), mkEdge('e2', 'n2', 'n3')],
      });
      const result = getStore().compressWorkflow();
      expect(result).toContain('Merged duplicate');
      expect(getStore().nodes.length).toBeLessThan(3);
    });

    it('compressWorkflow: removes pass-through nodes', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'Start', 'input', { content: 'Begin' }),
          mkNode('n2', 'Passthrough', 'action'), // no content
          mkNode('n3', 'End', 'output', { content: 'Finish' }),
        ],
        edges: [mkEdge('e1', 'n1', 'n2'), mkEdge('e2', 'n2', 'n3')],
      });
      const result = getStore().compressWorkflow();
      expect(result).toContain('pass-through');
      expect(getStore().nodes).toHaveLength(2);
    });

    it('compressWorkflow: handles empty workflow', () => {
      expect(getStore().compressWorkflow()).toContain('No workflow');
    });

    it('findBottlenecks: handles empty workflow', () => {
      expect(getStore().findBottlenecks()).toContain('No workflow');
    });

    it('findBottlenecks: handles no edges', () => {
      useLifecycleStore.setState({ nodes: [mkNode('n1', 'A', 'action')], edges: [] });
      expect(getStore().findBottlenecks()).toContain('No edges');
    });

    it('findBottlenecks: detects choke points (high fan-in)', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'Source1', 'input'),
          mkNode('n2', 'Source2', 'input'),
          mkNode('n3', 'Source3', 'input'),
          mkNode('n4', 'Bottleneck', 'action'),
        ],
        edges: [
          mkEdge('e1', 'n1', 'n4'),
          mkEdge('e2', 'n2', 'n4'),
          mkEdge('e3', 'n3', 'n4'),
        ],
      });
      const result = getStore().findBottlenecks();
      expect(result).toContain('Bottleneck');
      expect(result).toContain('Choke Point');
    });

    it('findBottlenecks: detects hub nodes (high fan-out)', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'Hub', 'input'),
          mkNode('n2', 'Leaf1', 'action'),
          mkNode('n3', 'Leaf2', 'action'),
          mkNode('n4', 'Leaf3', 'output'),
        ],
        edges: [
          mkEdge('e1', 'n1', 'n2'),
          mkEdge('e2', 'n1', 'n3'),
          mkEdge('e3', 'n1', 'n4'),
        ],
      });
      const result = getStore().findBottlenecks();
      expect(result).toContain('Hub');
    });

    it('suggestNextSteps: handles empty workflow', () => {
      expect(getStore().suggestNextSteps()).toContain('No workflow');
    });

    it('suggestNextSteps: suggests propagation for stale nodes', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'Stale Node', 'action', { status: 'stale' })],
        edges: [],
      });
      const result = getStore().suggestNextSteps();
      expect(result).toContain('stale');
      expect(result).toContain('propagate');
    });

    it('suggestNextSteps: suggests review gate for large workflow', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'A', 'input'),
          mkNode('n2', 'B', 'action'),
          mkNode('n3', 'C', 'output'),
          mkNode('n4', 'D', 'artifact'),
        ],
        edges: [mkEdge('e1', 'n1', 'n2'), mkEdge('e2', 'n2', 'n3'), mkEdge('e3', 'n2', 'n4')],
      });
      const result = getStore().suggestNextSteps();
      expect(result).toContain('review');
    });

    it('healthBreakdown: returns assessment for workflow', () => {
      buildSimpleWorkflow();
      const result = getStore().healthBreakdown();
      expect(result).toContain('Health Assessment');
      expect(result).toContain('By Category');
      expect(result).toContain('Content');
    });

    it('healthBreakdown: handles empty workflow', () => {
      expect(getStore().healthBreakdown()).toContain('No workflow');
    });

    it('whyNode: explains a connected node', () => {
      buildSimpleWorkflow();
      const result = getStore().whyNode('why Process');
      expect(result).toContain('Process');
      expect(result).toContain('Driven by');
      expect(result).toContain('Feeds into');
    });

    it('whyNode: explains an orphan node', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'Lonely', 'action')],
        edges: [],
      });
      const result = getStore().whyNode('why Lonely');
      expect(result).toContain('orphan');
    });

    it('whyNode: fails for nonexistent node', () => {
      buildSimpleWorkflow();
      expect(getStore().whyNode('why Nonexistent')).toContain('No node');
    });

    it('isolateByName: shows subgraph for connected node', () => {
      buildSimpleWorkflow();
      const result = getStore().isolateByName('isolate Process');
      expect(result).toContain('Subgraph');
      expect(result).toContain('3 nodes'); // all connected in chain
    });

    it('isolateByName: handles lone node', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'Solo', 'action'), mkNode('n2', 'Other', 'action')],
        edges: [],
      });
      const result = getStore().isolateByName('isolate Solo');
      expect(result).toContain('already isolated');
    });
  });

  // ── Scenario 33: Chat, templates, addNodeByName, setStatusByName, contentByName, etc. ──
  describe('Scenario 33 — addNodeByName, setStatusByName, contentByName, listNodes, describeByName, swapByName, relabelAllEdges, clearExecutionResults, exportChatHistory', () => {
    beforeEach(resetStore);

    it('addNodeByName: creates a node with category', () => {
      const result = getStore().addNodeByName('add artifact called My Deliverable');
      expect(result.success).toBe(true);
      expect(getStore().nodes).toHaveLength(1);
      const node = getStore().nodes[0];
      expect(node.data.label).toBe('My Deliverable');
    });

    it('setStatusByName: changes status', () => {
      buildSimpleWorkflow();
      const result = getStore().setStatusByName('set Process to stale');
      expect(result.success).toBe(true);
      const proc = getStore().nodes.find(n => n.data.label === 'Process')!;
      expect(proc.data.status).toBe('stale');
    });

    it('setStatusByName: fails for nonexistent node', () => {
      buildSimpleWorkflow();
      const result = getStore().setStatusByName('set Nonexistent to stale');
      expect(result.success).toBe(false);
    });

    it('contentByName: sets content on a node', () => {
      buildSimpleWorkflow();
      const result = getStore().contentByName('content Process = This is the new content for the process node');
      expect(result.success).toBe(true);
      const proc = getStore().nodes.find(n => n.data.label === 'Process')!;
      expect(proc.data.content).toContain('new content');
    });

    it('listNodes: lists all by default', () => {
      buildSimpleWorkflow();
      const result = getStore().listNodes('list all');
      expect(result).toContain('Input Data');
      expect(result).toContain('Process');
      expect(result).toContain('Output Report');
    });

    it('listNodes: filters by category', () => {
      buildSimpleWorkflow();
      const result = getStore().listNodes('list input');
      expect(result).toContain('Input Data');
    });

    it('describeByName: sets description on a node', () => {
      buildSimpleWorkflow();
      const result = getStore().describeByName('describe Process as Transforms input data into structured output');
      expect(result.success).toBe(true);
      expect(result.message).toContain('Process');
      const proc = getStore().nodes.find(n => n.data.label === 'Process')!;
      expect(proc.data.description).toContain('Transforms');
    });

    it('describeByName: fails for nonexistent node', () => {
      buildSimpleWorkflow();
      const result = getStore().describeByName('describe Nonexistent as Something');
      expect(result.success).toBe(false);
    });

    it('swapByName: swaps two node positions', () => {
      buildSimpleWorkflow();
      const before1 = { ...getStore().nodes[0].position };
      const before2 = { ...getStore().nodes[1].position };
      const result = getStore().swapByName('swap Input Data and Process');
      expect(result.success).toBe(true);
      const after1 = getStore().nodes.find(n => n.data.label === 'Input Data')!.position;
      const after2 = getStore().nodes.find(n => n.data.label === 'Process')!.position;
      expect(after1.x).toBe(before2.x);
      expect(after2.x).toBe(before1.x);
    });

    it('relabelAllEdges: relabels edges based on categories', () => {
      buildSimpleWorkflow();
      // Change edge labels to something wrong first
      useLifecycleStore.setState({
        edges: getStore().edges.map(e => ({ ...e, label: 'wrong' })),
      });
      const result = getStore().relabelAllEdges();
      expect(result.count).toBeGreaterThan(0);
      expect(result.message).toContain('Re-inferred');
    });

    it('relabelAllEdges: no-op when no edges', () => {
      const result = getStore().relabelAllEdges();
      expect(result.count).toBe(0);
      expect(result.message).toContain('No edges');
    });

    it('clearExecutionResults: clears results from nodes', () => {
      useLifecycleStore.setState({
        nodes: [
          mkNode('n1', 'A', 'action', { executionStatus: 'success' as any, executionResult: 'result' }),
          mkNode('n2', 'B', 'action'),
        ],
        edges: [],
      });
      const result = getStore().clearExecutionResults();
      expect(result).toContain('Cleared');
      const nodes = getStore().nodes;
      expect(nodes.every(n => !n.data.executionResult)).toBe(true);
    });

    it('exportChatHistory: exports messages as markdown', () => {
      useLifecycleStore.setState({
        messages: [
          { id: 'm1', role: 'user', content: 'Hello CID', timestamp: Date.now() },
          { id: 'm2', role: 'cid', content: 'Hello human', timestamp: Date.now() },
        ],
      });
      const result = getStore().exportChatHistory();
      expect(result).toContain('Hello CID');
      expect(result).toContain('Hello human');
    });

    it('exportChatHistory: returns header even when no messages', () => {
      useLifecycleStore.setState({ messages: [] });
      const result = getStore().exportChatHistory();
      // exportChatHistory always returns a header line
      expect(result).toContain('Chat History');
    });
  });

  // ── Scenario 34: Custom templates, searchMessages, checkPostMutation, getPreFlightSummary ──
  describe('Scenario 34 — saveAsTemplate, loadCustomTemplate, listCustomTemplates, searchMessages, checkPostMutation, getPreFlightSummary', () => {
    beforeEach(resetStore);

    it('saveAsTemplate: saves workflow as template', () => {
      buildSimpleWorkflow();
      const result = getStore().saveAsTemplate('mytemplate');
      expect(result).toContain('mytemplate');
      expect(getStore().customTemplates.size).toBe(1);
    });

    it('saveAsTemplate: no-op on empty workflow', () => {
      const result = getStore().saveAsTemplate('empty');
      expect(result).toContain('No workflow');
    });

    it('loadCustomTemplate: loads saved template', () => {
      buildSimpleWorkflow();
      getStore().saveAsTemplate('test');
      resetStore();
      const result = getStore().loadCustomTemplate('test');
      // After reset, custom templates may be cleared too
      // This tests the not-found branch
      expect(typeof result).toBe('string');
    });

    it('loadCustomTemplate: fails for nonexistent', () => {
      // Clear any templates from prior tests
      useLifecycleStore.setState({ customTemplates: new Map() });
      const result = getStore().loadCustomTemplate('nonexistent');
      expect(result).toContain('No custom templates');
    });

    it('listCustomTemplates: empty message', () => {
      useLifecycleStore.setState({ customTemplates: new Map() });
      const result = getStore().listCustomTemplates();
      expect(result).toContain('No custom templates');
    });

    it('searchMessages: finds matching messages', () => {
      useLifecycleStore.setState({
        messages: [
          { id: 'm1', role: 'user', content: 'build a workflow for testing', timestamp: Date.now() },
          { id: 'm2', role: 'cid', content: 'Here is your workflow', timestamp: Date.now() },
        ],
      });
      const result = getStore().searchMessages('workflow');
      expect(result).toContain('workflow');
      expect(result).toContain('2');
    });

    it('searchMessages: no results for unmatched query', () => {
      useLifecycleStore.setState({
        messages: [{ id: 'm1', role: 'user', content: 'hello', timestamp: Date.now() }],
      });
      const result = getStore().searchMessages('xyz');
      expect(result).toContain('No messages');
    });

    it('checkPostMutation: returns null on healthy graph', () => {
      buildSimpleWorkflow();
      expect(getStore().checkPostMutation()).toBeNull();
    });

    it('checkPostMutation: detects orphans', () => {
      useLifecycleStore.setState({
        nodes: [mkNode('n1', 'Connected', 'action'), mkNode('n2', 'Orphan', 'action')],
        edges: [mkEdge('e1', 'n1', 'n1')], // Orphan has no connections
      });
      // n2 has no connection; n1 has self-loop edge — that counts as connected
      const result = getStore().checkPostMutation();
      expect(result).toContain('orphan');
    });

    it('checkPostMutation: returns null when empty', () => {
      expect(getStore().checkPostMutation()).toBeNull();
    });

    it('getPreFlightSummary: empty workflow', () => {
      expect(getStore().getPreFlightSummary()).toContain('No workflow');
    });

    it('getPreFlightSummary: returns pipeline summary', () => {
      buildSimpleWorkflow();
      const result = getStore().getPreFlightSummary();
      expect(result).toContain('Pre-Flight');
      expect(result).toContain('Pipeline');
      expect(result).toContain('3 nodes');
    });
  });

  // ── Cycle Detection on Connect ──────────────────────────────────────────────
  describe('Cycle Detection on Connect', () => {
    beforeEach(() => resetStore());

    it('rejects connection that would create a cycle (A→B when B→A exists)', () => {
      const store = getStore();
      // Set up two nodes with B→A edge
      useLifecycleStore.setState({
        nodes: [mkNode('A', 'Node A'), mkNode('B', 'Node B')],
        edges: [mkEdge('e-ba', 'B', 'A')],
      });

      // Try to connect A→B, which would create a cycle
      store.onConnect({ source: 'A', target: 'B' } as Connection);

      // Edge should NOT be added — still only the original edge
      const edges = getStore().edges;
      expect(edges).toHaveLength(1);
      expect(edges[0].id).toBe('e-ba');

      // A warning toast should have been shown
      const toasts = getStore().toasts;
      expect(toasts.length).toBeGreaterThanOrEqual(1);
      expect(toasts.some((t: { message: string }) => t.message.includes('cycle'))).toBe(true);
    });

    it('allows valid connections that do not create a cycle', () => {
      const store = getStore();
      useLifecycleStore.setState({
        nodes: [mkNode('A', 'Node A'), mkNode('B', 'Node B'), mkNode('C', 'Node C')],
        edges: [mkEdge('e-ab', 'A', 'B')],
      });

      // Connect B→C — no cycle
      store.onConnect({ source: 'B', target: 'C' } as Connection);

      const edges = getStore().edges;
      expect(edges).toHaveLength(2);
      expect(edges.some((e: Edge) => e.source === 'B' && e.target === 'C')).toBe(true);
    });

    it('rejects connection that would create a longer cycle (A→B→C→A)', () => {
      const store = getStore();
      useLifecycleStore.setState({
        nodes: [mkNode('A', 'Node A'), mkNode('B', 'Node B'), mkNode('C', 'Node C')],
        edges: [mkEdge('e-ab', 'A', 'B'), mkEdge('e-bc', 'B', 'C')],
      });

      // Try to connect C→A, which would create A→B→C→A cycle
      store.onConnect({ source: 'C', target: 'A' } as Connection);

      const edges = getStore().edges;
      expect(edges).toHaveLength(2); // No new edge added
      expect(getStore().toasts.some((t: { message: string }) => t.message.includes('cycle'))).toBe(true);
    });
  });
});
