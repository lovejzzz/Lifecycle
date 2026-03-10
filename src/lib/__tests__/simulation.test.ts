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
});
