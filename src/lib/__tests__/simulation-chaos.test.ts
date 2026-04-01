/**
 * Chaos / Fuzz Testing — generates RANDOM sequences of valid store operations
 * and verifies invariants never break.
 *
 * Uses a seeded PRNG so failures are reproducible.
 * Logs the full operation sequence on failure for replay.
 */
import { describe, it, beforeEach, vi } from 'vitest';

// ── Mock browser globals BEFORE store import ──────────────────────────────────
const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, val: string) => {
    storage[key] = val;
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
  clear: () => {
    Object.keys(storage).forEach((k) => delete storage[k]);
  },
};

Object.defineProperty(globalThis, 'window', {
  value: { location: { origin: 'http://localhost:3000' } },
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

const mockFetch = vi.fn(async () => ({
  ok: true,
  json: async () => ({ result: 'AI response.' }),
}));
Object.defineProperty(globalThis, 'fetch', {
  value: mockFetch,
  writable: true,
  configurable: true,
});

if (!globalThis.AbortController) {
  globalThis.AbortController = class {
    signal = { addEventListener: () => {}, aborted: false };
    abort() {
      (this.signal as any).aborted = true;
    }
  } as unknown as typeof AbortController;
}

// Now import the store (after mocks are in place)
import { useLifecycleStore } from '@/store/useStore';
import type { Node, Edge } from '@xyflow/react';
import type { NodeData, NodeCategory } from '@/lib/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: NodeCategory[] = [
  'input',
  'trigger',
  'state',
  'artifact',
  'note',
  'cid',
  'action',
  'review',
  'test',
  'policy',
  'patch',
  'dependency',
  'output',
];

const STATUSES: NodeData['status'][] = [
  'active',
  'stale',
  'pending',
  'locked',
  'generating',
  'reviewing',
];

// ── Seeded PRNG ───────────────────────────────────────────────────────────────

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0xffffffff;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStore() {
  return useLifecycleStore.getState();
}

function resetStore() {
  Object.keys(storage).forEach((k) => delete storage[k]);
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

let nodeCounter = 0;
let edgeCounter = 0;

function mkNode(category: NodeCategory, rand: () => number): Node<NodeData> {
  const id = `chaos-n-${++nodeCounter}`;
  return {
    id,
    type: 'lifecycleNode',
    position: { x: Math.floor(rand() * 1200), y: Math.floor(rand() * 800) },
    data: {
      label: `${category}-${nodeCounter}`,
      category,
      content: `Content for ${id}`,
      status: 'active' as const,
    },
  };
}

function mkEdge(source: string, target: string): Edge {
  const id = `chaos-e-${++edgeCounter}`;
  return { id, source, target, label: 'feeds', type: 'default' };
}

// ── Invariant Checks ──────────────────────────────────────────────────────────

function checkInvariants(opLog: string[]): void {
  const s = getStore();

  // No duplicate node IDs
  const nodeIds = new Set(s.nodes.map((n) => n.id));
  if (nodeIds.size !== s.nodes.length) {
    const dupes = s.nodes.map((n) => n.id).filter((id, i, arr) => arr.indexOf(id) !== i);
    throw new Error(`Duplicate node IDs: ${dupes.join(', ')}\nOp log:\n${opLog.join('\n')}`);
  }

  // No duplicate edge IDs
  const edgeIds = new Set(s.edges.map((e) => e.id));
  if (edgeIds.size !== s.edges.length) {
    const dupes = s.edges.map((e) => e.id).filter((id, i, arr) => arr.indexOf(id) !== i);
    throw new Error(`Duplicate edge IDs: ${dupes.join(', ')}\nOp log:\n${opLog.join('\n')}`);
  }

  // All edges reference existing nodes
  for (const edge of s.edges) {
    if (!nodeIds.has(edge.source)) {
      throw new Error(
        `Edge ${edge.id} references missing source ${edge.source}\nOp log:\n${opLog.join('\n')}`,
      );
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(
        `Edge ${edge.id} references missing target ${edge.target}\nOp log:\n${opLog.join('\n')}`,
      );
    }
  }

  // All nodes have label and category
  for (const node of s.nodes) {
    if (!node.data.label) {
      throw new Error(`Node ${node.id} missing label\nOp log:\n${opLog.join('\n')}`);
    }
    if (!node.data.category) {
      throw new Error(`Node ${node.id} missing category\nOp log:\n${opLog.join('\n')}`);
    }
  }

  // selectedNodeId is null or references existing node
  if (s.selectedNodeId && !nodeIds.has(s.selectedNodeId)) {
    throw new Error(
      `selectedNodeId "${s.selectedNodeId}" references missing node\nOp log:\n${opLog.join('\n')}`,
    );
  }

  // history and future are arrays
  if (!Array.isArray(s.history)) {
    throw new Error(`history is not an array\nOp log:\n${opLog.join('\n')}`);
  }
  if (!Array.isArray(s.future)) {
    throw new Error(`future is not an array\nOp log:\n${opLog.join('\n')}`);
  }

  // No NaN in node positions
  for (const node of s.nodes) {
    if (Number.isNaN(node.position.x) || Number.isNaN(node.position.y)) {
      throw new Error(
        `Node ${node.id} has NaN position: (${node.position.x}, ${node.position.y})\nOp log:\n${opLog.join('\n')}`,
      );
    }
  }
}

// ── Operation Definitions ─────────────────────────────────────────────────────

type Operation = {
  name: string;
  canRun: () => boolean;
  run: (rand: () => number) => string; // returns description of what was done
};

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function buildOperations(): Operation[] {
  return [
    {
      name: 'addNode',
      canRun: () => true,
      run: (rand) => {
        const cat = pick(CATEGORIES, rand);
        const node = mkNode(cat, rand);
        getStore().addNode(node);
        return `addNode(${node.id}, ${cat})`;
      },
    },
    {
      name: 'deleteNode',
      canRun: () => getStore().nodes.length > 0,
      run: (rand) => {
        const node = pick(getStore().nodes, rand);
        getStore().deleteNode(node.id);
        return `deleteNode(${node.id})`;
      },
    },
    {
      name: 'updateNodeData',
      canRun: () => getStore().nodes.length > 0,
      run: (rand) => {
        const node = pick(getStore().nodes, rand);
        const newContent = `Updated-${Math.floor(rand() * 10000)}`;
        getStore().updateNodeData(node.id, { content: newContent });
        return `updateNodeData(${node.id}, content="${newContent}")`;
      },
    },
    {
      name: 'updateNodeStatus',
      canRun: () => getStore().nodes.length > 0,
      run: (rand) => {
        const node = pick(getStore().nodes, rand);
        const status = pick(STATUSES, rand);
        getStore().updateNodeStatus(node.id, status);
        return `updateNodeStatus(${node.id}, ${status})`;
      },
    },
    {
      name: 'addEdge',
      canRun: () => getStore().nodes.length >= 2,
      run: (rand) => {
        const nodes = getStore().nodes;
        const src = pick(nodes, rand);
        let tgt = pick(nodes, rand);
        // Try to pick a different target
        let attempts = 0;
        while (tgt.id === src.id && attempts < 5) {
          tgt = pick(nodes, rand);
          attempts++;
        }
        if (tgt.id === src.id) return 'addEdge(skipped, same src/tgt)';
        const edge = mkEdge(src.id, tgt.id);
        getStore().addEdge(edge);
        return `addEdge(${edge.id}, ${src.id} -> ${tgt.id})`;
      },
    },
    {
      name: 'deleteEdge',
      canRun: () => getStore().edges.length > 0,
      run: (rand) => {
        const edge = pick(getStore().edges, rand);
        getStore().deleteEdge(edge.id);
        return `deleteEdge(${edge.id})`;
      },
    },
    {
      name: 'onConnect',
      canRun: () => getStore().nodes.length >= 2,
      run: (rand) => {
        const nodes = getStore().nodes;
        const src = pick(nodes, rand);
        let tgt = pick(nodes, rand);
        let attempts = 0;
        while (tgt.id === src.id && attempts < 5) {
          tgt = pick(nodes, rand);
          attempts++;
        }
        if (tgt.id === src.id) return 'onConnect(skipped, same src/tgt)';
        getStore().onConnect({
          source: src.id,
          target: tgt.id,
          sourceHandle: null,
          targetHandle: null,
        });
        return `onConnect(${src.id} -> ${tgt.id})`;
      },
    },
    {
      name: 'duplicateNode',
      canRun: () => getStore().nodes.length > 0,
      run: (rand) => {
        const node = pick(getStore().nodes, rand);
        getStore().duplicateNode(node.id);
        return `duplicateNode(${node.id})`;
      },
    },
    {
      name: 'pushHistory+undo',
      canRun: () => true,
      run: () => {
        getStore().pushHistory();
        getStore().undo();
        return 'pushHistory+undo';
      },
    },
    {
      name: 'redo',
      canRun: () => getStore().future.length > 0,
      run: () => {
        getStore().redo();
        return 'redo';
      },
    },
    {
      name: 'selectNode',
      canRun: () => true,
      run: (rand) => {
        const nodes = getStore().nodes;
        if (nodes.length === 0 || rand() < 0.3) {
          getStore().selectNode(null);
          return 'selectNode(null)';
        }
        const node = pick(nodes, rand);
        getStore().selectNode(node.id);
        return `selectNode(${node.id})`;
      },
    },
    {
      name: 'toggleMultiSelect+deleteMultiSelected',
      canRun: () => getStore().nodes.length > 0,
      run: (rand) => {
        const nodes = getStore().nodes;
        // Select 1-3 random nodes
        const count = Math.min(nodes.length, 1 + Math.floor(rand() * 3));
        const selected: string[] = [];
        for (let i = 0; i < count; i++) {
          const node = pick(nodes, rand);
          getStore().toggleMultiSelect(node.id);
          selected.push(node.id);
        }
        const deleted = getStore().deleteMultiSelected();
        return `toggleMultiSelect(${selected.join(',')})+deleteMultiSelected=${deleted}`;
      },
    },
    {
      name: 'optimizeLayout',
      canRun: () => getStore().nodes.length > 0,
      run: () => {
        getStore().optimizeLayout();
        return 'optimizeLayout';
      },
    },
    {
      name: 'lockNode',
      canRun: () => getStore().nodes.length > 0,
      run: (rand) => {
        const node = pick(getStore().nodes, rand);
        getStore().lockNode(node.id);
        return `lockNode(${node.id})`;
      },
    },
    {
      name: 'approveNode',
      canRun: () => getStore().nodes.length > 0,
      run: (rand) => {
        const node = pick(getStore().nodes, rand);
        getStore().approveNode(node.id);
        return `approveNode(${node.id})`;
      },
    },
    {
      name: 'clearStale',
      canRun: () => true,
      run: () => {
        getStore().clearStale();
        return 'clearStale';
      },
    },
  ];
}

// ── Chaos Runner ──────────────────────────────────────────────────────────────

interface ChaosConfig {
  seed: number;
  opCount: number;
  /** Bias weights: operation name -> relative probability */
  bias?: Record<string, number>;
}

function runChaos(config: ChaosConfig): void {
  const rand = seededRandom(config.seed);
  const ops = buildOperations();
  const opLog: string[] = [];

  for (let i = 0; i < config.opCount; i++) {
    // Filter to runnable operations
    let runnable = ops.filter((op) => op.canRun());
    if (runnable.length === 0) {
      opLog.push(`[${i}] NO RUNNABLE OPS — skip`);
      continue;
    }

    // Apply bias weights if provided
    if (config.bias) {
      const weighted: Operation[] = [];
      for (const op of runnable) {
        const weight = config.bias[op.name] ?? 1;
        for (let w = 0; w < weight; w++) weighted.push(op);
      }
      if (weighted.length > 0) runnable = weighted;
    }

    const op = pick(runnable, rand);
    try {
      const desc = op.run(rand);
      opLog.push(`[${i}] ${desc}`);
    } catch (err) {
      opLog.push(`[${i}] ${op.name} THREW: ${(err as Error).message}`);
      // The operation itself crashing is a genuine failure
      throw new Error(
        `Operation "${op.name}" crashed at step ${i}.\n` +
          `Error: ${(err as Error).message}\n` +
          `Op log:\n${opLog.join('\n')}`,
      );
    }

    // Check invariants after every operation
    checkInvariants(opLog);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CHAOS TEST SUITES
// ══════════════════════════════════════════════════════════════════════════════

describe('Chaos / Fuzz Testing', () => {
  beforeEach(() => {
    resetStore();
    nodeCounter = 0;
    edgeCounter = 0;
  });

  // ── Light chaos: broad coverage ─────────────────────────────────────────────
  describe('Light chaos (100 ops)', () => {
    it('seed 42 — invariants hold across 100 random operations', () => {
      runChaos({ seed: 42, opCount: 100 });
    });

    it('seed 1337 — invariants hold across 100 random operations', () => {
      runChaos({ seed: 1337, opCount: 100 });
    });

    it('seed 9999 — invariants hold across 100 random operations', () => {
      runChaos({ seed: 9999, opCount: 100 });
    });
  });

  // ── Heavy chaos: stress test ────────────────────────────────────────────────
  describe('Heavy chaos (500 ops)', () => {
    it('seed 12345 — invariants hold across 500 random operations', () => {
      runChaos({ seed: 12345, opCount: 500 });
    });

    it('seed 54321 — invariants hold across 500 random operations', () => {
      runChaos({ seed: 54321, opCount: 500 });
    });
  });

  // ── Undo stress: heavy undo/redo usage ──────────────────────────────────────
  describe('Undo stress (200 ops, 40% undo/redo)', () => {
    it('seed 7777 — undo/redo-heavy sequence', () => {
      runChaos({
        seed: 7777,
        opCount: 200,
        bias: {
          'pushHistory+undo': 4,
          redo: 4,
          addNode: 2,
          deleteNode: 1,
          addEdge: 1,
        },
      });
    });

    it('seed 8888 — undo/redo-heavy sequence', () => {
      runChaos({
        seed: 8888,
        opCount: 200,
        bias: {
          'pushHistory+undo': 4,
          redo: 4,
          addNode: 2,
          deleteNode: 1,
          addEdge: 1,
        },
      });
    });
  });

  // ── Delete storm: heavy deletion ────────────────────────────────────────────
  describe('Delete storm (200 ops, 60% deletes)', () => {
    it('seed 5555 — delete-heavy sequence', () => {
      runChaos({
        seed: 5555,
        opCount: 200,
        bias: {
          deleteNode: 6,
          deleteEdge: 6,
          'toggleMultiSelect+deleteMultiSelected': 6,
          addNode: 3,
          addEdge: 2,
          onConnect: 1,
        },
      });
    });

    it('seed 6666 — delete-heavy sequence', () => {
      runChaos({
        seed: 6666,
        opCount: 200,
        bias: {
          deleteNode: 6,
          deleteEdge: 6,
          'toggleMultiSelect+deleteMultiSelected': 6,
          addNode: 3,
          addEdge: 2,
          onConnect: 1,
        },
      });
    });
  });

  // ── Mixed stress: all operations equally weighted ───────────────────────────
  describe('Mixed stress (300 ops)', () => {
    it('seed 11111 — all operations equally likely', () => {
      runChaos({ seed: 11111, opCount: 300 });
    });
  });

  // ── Rapid create-destroy cycles ─────────────────────────────────────────────
  describe('Create-destroy cycles (200 ops)', () => {
    it('seed 22222 — rapid creation followed by destruction', () => {
      runChaos({
        seed: 22222,
        opCount: 200,
        bias: {
          addNode: 5,
          deleteNode: 5,
          duplicateNode: 3,
          'toggleMultiSelect+deleteMultiSelected': 3,
        },
      });
    });
  });

  // ── Edge-heavy chaos ────────────────────────────────────────────────────────
  describe('Edge-heavy chaos (200 ops)', () => {
    it('seed 33333 — focus on edge operations', () => {
      runChaos({
        seed: 33333,
        opCount: 200,
        bias: {
          addNode: 3,
          addEdge: 5,
          deleteEdge: 5,
          onConnect: 5,
          deleteNode: 1,
        },
      });
    });
  });

  // ── Layout + selection chaos ────────────────────────────────────────────────
  describe('Layout + selection chaos (150 ops)', () => {
    it('seed 44444 — layout and selection heavy', () => {
      runChaos({
        seed: 44444,
        opCount: 150,
        bias: {
          addNode: 3,
          selectNode: 5,
          optimizeLayout: 4,
          lockNode: 3,
          approveNode: 3,
          clearStale: 2,
          updateNodeStatus: 4,
        },
      });
    });
  });
});
