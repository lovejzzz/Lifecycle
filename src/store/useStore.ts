'use client';

import { create } from 'zustand';
import type { Node, Edge, Connection } from '@xyflow/react';
import type { NodeData, LifecycleEvent, CIDMessage, NodeCategory, CIDMode, AgentPersonalityLayers, HabitLayer, GenerationLayer, ReflectionLayer, DrivingForceLayer, CentralContext, ArtifactContract, SurgicalDiff, Override } from '@/lib/types';
import { registerCustomCategory, EDGE_LABEL_COLORS, BUILT_IN_CATEGORIES } from '@/lib/types';
import { getAgent, getInterviewQuestions, buildEnrichedPrompt, getAdaptiveInterview, shouldSkipRemainingQuestions } from '@/lib/agents';
import { buildSystemPrompt, buildMessages, getExecutionSystemPrompt, inferEffortFromCategory, buildNoteRefinementPrompt } from '@/lib/prompts';
import type { NoteRefinementResult } from '@/lib/prompts';
import { classifyEdit } from '@/lib/edits';
import { buildCacheKey, sha256, getCacheEntry, setCacheEntry, createEmptyUsageStats } from '@/lib/cache';
import { validateOutput, extractKeywords } from '@/lib/validate';
import type { UsageStats } from '@/lib/cache';
import {
  createDefaultHabits, createDefaultGeneration, createDefaultReflection,
  migrateHabitsV1toV2, migrateReflectionV1toV2,
  computeGenerationContext, reflectOnInteraction, applyReflectionActions, updateGrowthEdges,
  computeCuriositySpikes, applyTemperamentReframing, generateSpontaneousDirectives,
  resolveDriverTensions,
} from '@/lib/reflection';
import {
  NODE_W, NODE_H, findFreePosition,
  topoSort, getParallelGroups, getUpstreamSubgraph,
  ANIMATED_LABELS, createStyledEdge, inferEdgeLabel,
  findNodeByName, CATEGORY_LABELS, markdownToHTML,
  detectCycle, validateGraphInvariants,
} from '@/lib/graph';
import { buildNodesFromPrompt } from '@/lib/intent';
import { assessWorkflowHealth, formatHealthReport, issueFingerprint } from '@/lib/health';
import { generateProactiveSuggestions, formatSuggestionsMessage } from '@/lib/suggestions';
import type { ProactiveSuggestion } from '@/lib/suggestions';
import { analyzeGraphForOptimization, formatOptimizations } from '@/lib/optimizer';
import { compileDocument, exportAndDownload } from '@/lib/export';
import type { ExportFormat } from '@/lib/export';
import {
  listProjects as listStorageProjects, loadProject, saveProject as saveStorageProject,
  deleteProject as deleteStorageProject, createProject as createStorageProject,
  renameProject as renameStorageProject, migrateLegacyProject,
} from '@/lib/storage';
import type { ProjectMeta } from '@/lib/storage';
import type { Optimization } from '@/lib/optimizer';

// Store types imported from dedicated file for maintainability
import type { LifecycleStore, UndoOperation, PoirotContext } from './types';
export type { LifecycleStore, UndoOperation, PoirotContext } from './types';
// Extracted slices
import { createUISlice } from './slices/uiSlice';
import { createArtifactSlice } from './slices/artifactSlice';
export { cidLog } from './helpers';
import { cidLog, MAX_HISTORY, computeUndoOp, applyUndo, applyRedo } from './helpers';

// cidLog imported from ./helpers

let nodeCounter = 100;
const uid = () => `node-${++nodeCounter}`;

// Initialize nodeCounter from persisted data to avoid duplicate keys
function initNodeCounter(items: { id: string }[][]) {
  let max = 100;
  for (const list of items) {
    for (const n of list) {
      const m = n.id.match(/^node-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  nodeCounter = max;
}

// Track animation timeouts to cancel on new workflow generation
const animationTimers = new Set<ReturnType<typeof setTimeout>>();
function clearAnimationTimers() {
  animationTimers.forEach(t => clearTimeout(t));
  animationTimers.clear();
}
function trackTimeout(fn: () => void, ms: number) {
  const id = setTimeout(() => {
    animationTimers.delete(id);
    fn();
  }, ms);
  animationTimers.add(id);
  return id;
}

// Stream a message word-by-word into the store (35ms/word)
function streamMessageToStore(
  msgId: string,
  fullText: string,
  updateFn: (id: string, content: string) => void,
  onDone?: () => void,
) {
  const words = fullText.split(' ');
  let current = '';
  let i = 0;
  const interval = setInterval(() => {
    if (i >= words.length) {
      clearInterval(interval);
      onDone?.();
      return;
    }
    current += (i > 0 ? ' ' : '') + words[i];
    updateFn(msgId, current);
    i++;
  }, 35);
  return () => clearInterval(interval);
}

/** Generate 2-3 contextual follow-up suggestions based on current graph state */
export function getSmartSuggestions(nodes: Node<NodeData>[], edges: Edge[]): string[] {
  if (nodes.length === 0) return ['Build a workflow', 'help'];
  const suggestions: string[] = [];
  const stale = nodes.filter(n => n.data.status === 'stale').length;
  const orphans = nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id)).length;
  const reviewing = nodes.filter(n => n.data.status === 'reviewing').length;
  const hasReview = nodes.some(n => n.data.category === 'review');
  const emptyContent = nodes.filter(n => ['artifact', 'note', 'policy'].includes(n.data.category) && !n.data.content && !n.data.description).length;

  if (stale > 0) suggestions.push('refresh stale');
  if (orphans > 0) suggestions.push('solve');
  if (reviewing > 0) suggestions.push('approve all');
  if (!hasReview && nodes.length >= 3) suggestions.push('add review gate');
  if (emptyContent > 0) suggestions.push(`describe ${nodes.find(n => !n.data.content && !n.data.description && ['artifact', 'note'].includes(n.data.category))?.data.label ?? 'node'} as ...`);
  if (suggestions.length === 0) {
    suggestions.push('explain', 'status');
    if (nodes.length >= 4) suggestions.push('summarize');
  }
  return suggestions.slice(0, 3);
}

function buildPostBuildSuggestions(nodes: Node<NodeData>[], edges: Edge[]): { text: string; suggestions: string[] } | null {
  if (nodes.length === 0) return null;
  const tips: string[] = [];
  const suggestions: string[] = [];
  const hasReview = nodes.some(n => n.data.category === 'review');
  const hasPolicy = nodes.some(n => n.data.category === 'policy');
  const hasMonitoring = nodes.some(n => n.data.label.toLowerCase().includes('monitor') || n.data.category === 'state');
  const orphans = nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id));

  if (!hasReview) { tips.push('Add a review checkpoint'); suggestions.push('add a review gate'); }
  if (!hasPolicy && nodes.length >= 5) { tips.push('Add governance policies'); suggestions.push('add a policy node'); }
  if (orphans.length > 0) { tips.push(`Connect ${orphans.length} orphaned node${orphans.length > 1 ? 's' : ''}`); suggestions.push('solve'); }
  if (!hasMonitoring && nodes.length >= 4) { tips.push('Add monitoring'); suggestions.push('add monitoring and alerts'); }
  suggestions.push('explain');

  if (tips.length === 0) return null;
  return { text: `### Next Steps\n${tips.slice(0, 3).map(t => `- ${t}`).join('\n')}`, suggestions: suggestions.slice(0, 3) };
}

/** Generate a context-aware next-step hint based on current graph state. Exported for CIDPanel. */
export function getNextHint(nodes: Node<NodeData>[], edges: Edge[]): string | null {
  if (nodes.length === 0) return null;
  const stale = nodes.filter(n => n.data.status === 'stale').length;
  const orphans = nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id)).length;
  const reviewing = nodes.filter(n => n.data.status === 'reviewing').length;
  const emptyContent = nodes.filter(n => ['artifact', 'note', 'policy', 'state'].includes(n.data.category) && !n.data.content && !n.data.description).length;

  if (stale > 0) return `\n\n💡 **Tip:** ${stale} stale node${stale > 1 ? 's' : ''} detected — try \`refresh stale\``;
  if (orphans > 0) return `\n\n💡 **Tip:** ${orphans} orphan node${orphans > 1 ? 's' : ''} found — try \`solve\` to auto-connect`;
  if (reviewing > 0) return `\n\n💡 **Tip:** ${reviewing} node${reviewing > 1 ? 's' : ''} awaiting review — try \`approve all\``;
  if (emptyContent > 0) return `\n\n💡 **Tip:** ${emptyContent} node${emptyContent > 1 ? 's' : ''} missing content — click to add`;
  return null;
}

const STORAGE_KEY = 'lifecycle-store';
const STORAGE_VERSION = 2; // Bump to reset users from demo-data era

function loadFromStorage(): Partial<Pick<LifecycleStore, 'nodes' | 'edges' | 'events' | 'messages'>> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // If stored data is from an older version, discard it
    if (parsed._version !== STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (parsed.nodes?.length) {
      const maxId = parsed.nodes.reduce((max: number, n: Node<NodeData>) => {
        const num = parseInt(n.id.replace('node-', ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      if (maxId >= nodeCounter) nodeCounter = maxId + 1;
    }
    return parsed;
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaveArgs: { state: Pick<LifecycleStore, 'nodes' | 'edges' | 'events' | 'messages'>; cidMode?: CIDMode } | null = null;

function flushSave() {
  // Cancel pending debounce timer
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }

  // Use lastSaveArgs if available (pending debounced save), otherwise read directly from store
  const store = typeof useLifecycleStore !== 'undefined' ? useLifecycleStore.getState() : null;
  const state = lastSaveArgs?.state ?? (store ? { nodes: store.nodes, edges: store.edges, events: store.events, messages: store.messages } : null);
  const cidMode = lastSaveArgs?.cidMode ?? store?.cidMode;
  lastSaveArgs = null;
  if (!state) return;
  if (typeof window === 'undefined') return;

  // Cap events and filter ephemeral messages to prevent quota bloat
  const cappedEvents = state.events.slice(-200);
  const cappedMessages = state.messages.filter(m => !m._ephemeral).slice(-100);
  const saveNodes = state.nodes.map(n => ({ ...n }));

  // Include centralContext if available
  const store2 = typeof useLifecycleStore !== 'undefined' ? useLifecycleStore.getState() : null;
  const centralContext = store2?.centralContext ?? null;

  const data = {
    _version: STORAGE_VERSION,
    nodes: saveNodes,
    edges: state.edges,
    events: cappedEvents,
    messages: cappedMessages,
    ...(cidMode !== undefined && { cidMode }),
    cidAIModel: currentAIModel,
    ...(centralContext && { centralContext }),
  };

  const json = JSON.stringify(data);
  const sizeKB = Math.round(json.length / 1024);

  // Quota warning: trim large execution results if approaching 4MB
  if (sizeKB > 4096) {
    console.warn(`[Storage] Near quota: ${sizeKB}KB. Trimming execution results.`);
    for (const node of data.nodes) {
      if (node.data.executionResult && node.data.executionResult.length > 2000) {
        node.data.executionResult = node.data.executionResult.slice(0, 2000) + '\n\n... (truncated for storage)';
      }
    }
  }

  try {
    // Save to legacy key (backward compat) + project-specific key
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    // Also persist to current project
    const store = useLifecycleStore.getState();
    if (store.currentProjectId) {
      saveStorageProject(
        store.currentProjectId,
        store.currentProjectName,
        data,
        saveNodes.length,
        state.edges.length,
      );
    }
    // Update auto-save indicator timestamp
    useLifecycleStore.setState({ lastSavedAt: Date.now() });
  } catch (e) {
    console.error('[Storage] Save failed:', e);
    // Emergency save with aggressive trimming
    try {
      for (const node of data.nodes) {
        if (node.data.executionResult) {
          node.data.executionResult = node.data.executionResult.slice(0, 500);
        }
      }
      data.events = data.events.slice(-50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      useLifecycleStore.getState().addToast('Storage full — execution results trimmed to fit', 'warning');
    } catch {
      useLifecycleStore.getState().addToast('Storage completely full. Export your workflow to avoid data loss.', 'error', 0);
    }
  }
}

function saveToStorage(state: Pick<LifecycleStore, 'nodes' | 'edges' | 'events' | 'messages'>, cidMode?: CIDMode) {
  lastSaveArgs = { state, cidMode };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 150);
}

// Flush pending saves before browser closes to prevent data loss
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      flushSave();
    }
  });
}

// Graph utilities (layout, edges, node search) → src/lib/graph.ts
// Intent analysis & node builder → src/lib/intent.ts
// Re-exported for backward compat:
export { resolveOverlap, findNodeByName } from '@/lib/graph';

// ─── REMOVED: ~650 lines moved to graph.ts and intent.ts ─── //
// The following was here: nodesOverlap, findFreePosition, resolveOverlap,
// topoSort, createStyledEdge, inferEdgeLabel, findNodeByName, CATEGORY_LABELS,
// markdownToHTML, KNOWN_SERVICES, FILE_TYPE_MAP, OUTPUT_FORMATS, analyzeIntent,
// buildNodesFromPrompt — all now imported from lib modules.

// (old code removed — now in lib/graph.ts and lib/intent.ts)

// ── CID Build Memory — tracks what was built and why for context-aware follow-ups ──
interface BuildMemoryEntry {
  prompt: string;
  nodeCount: number;
  edgeCount: number;
  nodeLabels: string[];
  timestamp: number;
  mode: 'api' | 'template' | 'fallback';
}
let buildMemory: BuildMemoryEntry[] = [];
function recordBuild(entry: BuildMemoryEntry) {
  buildMemory = [entry, ...buildMemory].slice(0, 10);
}
/** Returns a compact summary of recent builds for LLM context injection */
export function getBuildContext(): string {
  if (buildMemory.length === 0) return '';
  const recent = buildMemory.slice(0, 3);
  const lines = recent.map((b, i) => {
    const ago = Math.round((Date.now() - b.timestamp) / 60000);
    return `${i + 1}. "${b.prompt}" → ${b.nodeCount} nodes (${b.nodeLabels.slice(0, 5).join(', ')}) [${ago}m ago]`;
  });
  return `\n\nBUILD HISTORY (what CID created recently):\n${lines.join('\n')}`;
}

/** Shared post-build finalization: optimize layout, auto-validate, health alert.
 *  Call from within the store after nodes are finalized (generating→active). */
function postBuildFinalize(getStore: () => LifecycleStore) {
  trackTimeout(() => { if (getStore().nodes.length > 2) getStore().optimizeLayout(); }, 400);

  // ── Post-build auto-fix: detect and repair structural issues ──
  trackTimeout(() => {
    const s = getStore();
    const { nodes, edges } = s;
    if (nodes.length < 2) return;

    const fixes: string[] = [];
    const hasIncoming = new Set(edges.map(e => e.target));
    const hasOutgoing = new Set(edges.map(e => e.source));

    // 1. Fix orphan nodes (no edges at all) — connect to nearest neighbor
    const orphans = nodes.filter(n => !hasIncoming.has(n.id) && !hasOutgoing.has(n.id));
    for (const orphan of orphans) {
      // Find nearest non-orphan node by position
      const candidates = nodes.filter(n => n.id !== orphan.id && (hasIncoming.has(n.id) || hasOutgoing.has(n.id)));
      if (candidates.length > 0) {
        const nearest = candidates.reduce((best, n) => {
          const dist = Math.abs(n.position.x - orphan.position.x) + Math.abs(n.position.y - orphan.position.y);
          const bestDist = Math.abs(best.position.x - orphan.position.x) + Math.abs(best.position.y - orphan.position.y);
          return dist < bestDist ? n : best;
        });
        // Connect: if orphan is to the right, it's downstream; otherwise upstream
        if (orphan.position.x > nearest.position.x) {
          s.addEdge(createStyledEdge(nearest.id, orphan.id, inferEdgeLabel(nearest.data.category, orphan.data.category)));
        } else {
          s.addEdge(createStyledEdge(orphan.id, nearest.id, inferEdgeLabel(orphan.data.category, nearest.data.category)));
        }
        fixes.push(`Connected orphan "${orphan.data.label}" to "${nearest.data.label}"`);
      }
    }

    // 2. Ensure flow: check that a path exists from first to last node
    const startNodes = nodes.filter(n => n.data.category === 'input' || n.data.category === 'trigger');
    const endNodes = nodes.filter(n => n.data.category === 'output');
    if (startNodes.length > 0 && endNodes.length > 0) {
      // BFS from start to see if we reach end
      const visited = new Set<string>();
      const queue = startNodes.map(n => n.id);
      visited.add(queue[0]);
      while (queue.length > 0) {
        const current = queue.shift()!;
        visited.add(current);
        for (const edge of getStore().edges) {
          if (edge.source === current && !visited.has(edge.target)) {
            queue.push(edge.target);
          }
        }
      }
      // Check if any output is unreachable
      for (const endNode of endNodes) {
        if (!visited.has(endNode.id)) {
          // Find the last reachable node and connect it to the output
          const reachableNodes = nodes.filter(n => visited.has(n.id));
          if (reachableNodes.length > 0) {
            const lastReachable = reachableNodes.reduce((best, n) =>
              n.position.x > best.position.x ? n : best
            );
            s.addEdge(createStyledEdge(lastReachable.id, endNode.id, 'outputs'));
            fixes.push(`Connected "${lastReachable.data.label}" → "${endNode.data.label}" (was unreachable)`);
          }
        }
      }
    }

    // 3. Check for nodes with outgoing edges but no incoming (except start nodes)
    const nonStartRoots = nodes.filter(n =>
      !hasIncoming.has(n.id) &&
      hasOutgoing.has(n.id) &&
      n.data.category !== 'input' &&
      n.data.category !== 'trigger' &&
      n.data.category !== 'policy' // policy nodes can legitimately have no incoming
    );
    for (const root of nonStartRoots) {
      // Find a good predecessor by looking at position
      const predecessors = nodes.filter(n =>
        n.id !== root.id &&
        n.position.x < root.position.x &&
        hasOutgoing.has(n.id)
      );
      if (predecessors.length > 0) {
        const nearest = predecessors.reduce((best, n) => {
          const dist = Math.abs(n.position.x - root.position.x) + Math.abs(n.position.y - root.position.y);
          const bestDist = Math.abs(best.position.x - root.position.x) + Math.abs(best.position.y - root.position.y);
          return dist < bestDist ? n : best;
        });
        const exists = getStore().edges.some(e => e.source === nearest.id && e.target === root.id);
        if (!exists) {
          s.addEdge(createStyledEdge(nearest.id, root.id, inferEdgeLabel(nearest.data.category, root.data.category)));
          fixes.push(`Wired "${nearest.data.label}" → "${root.data.label}" (was disconnected root)`);
        }
      }
    }

    // Report fixes
    if (fixes.length > 0) {
      const isPoirot = s.cidMode === 'poirot';
      const prefix = isPoirot
        ? '🔍 The little grey cells detected structural issues and repaired them automatically:'
        : '🔧 Post-build QA detected and auto-fixed structural issues:';
      const fixReport = `${prefix}\n${fixes.map(f => `- ✅ ${f}`).join('\n')}\n\nWorkflow is now structurally sound.`;
      s.addMessage({ id: uid(), role: 'cid', content: fixReport, timestamp: Date.now(), _ephemeral: true });
      s.addEvent({ id: `ev-${Date.now()}`, type: 'edited', message: `Auto-fixed ${fixes.length} structural issue(s)`, timestamp: Date.now(), agent: true });
    }
  }, 800);

  trackTimeout(() => {
    const validation = getStore().validate();
    if (validation.includes('Issue')) {
      getStore().addMessage({ id: uid(), role: 'cid', content: validation, timestamp: Date.now() });
    }
  }, 1500);
  trackTimeout(() => {
    const s = getStore();
    const health = s.getHealthScore();
    if (health < 60) {
      const warn = s.cidMode === 'poirot'
        ? `🔍 Mon ami, the workflow health is only **${health}/100**. The little grey cells detect problems — perhaps \`solve\` or \`propagate\` would help?`
        : `⚠ Health score: **${health}/100**. Run \`solve\` or \`propagate\` to fix.`;
      s.addMessage({ id: uid(), role: 'cid', content: warn, timestamp: Date.now() });
    }
  }, 2300);
  // Auto-enrich: generate descriptions for nodes missing them (non-blocking)
  trackTimeout(() => {
    const s = getStore();
    const noDesc = s.nodes.filter(n => !n.data.description);
    if (noDesc.length > 0 && s.nodes.length >= 3) {
      s.autoDescribe();
    }
  }, 2800);
}

const persisted = loadFromStorage();
const persistedMode: CIDMode = (persisted as any)?.cidMode === 'poirot' ? 'poirot' : 'rowan';
const persistedModel: string = (persisted as any)?.cidAIModel || 'deepseek-chat';
let currentAIModel: string = persistedModel;

// Multi-project migration: move legacy data into a named project on first load
const migratedProjectId = migrateLegacyProject();
// Determine current project from migration or first existing project
let initialProjectId: string | null = null;
let initialProjectName = 'Untitled';
const existingProjects = listStorageProjects();
// Ensure nodeCounter starts above any existing node/message IDs to prevent duplicates
initNodeCounter([persisted?.nodes ?? [], persisted?.messages ?? [], persisted?.events ?? []]);
if (migratedProjectId) {
  initialProjectId = migratedProjectId;
  initialProjectName = 'My Workflow';
} else if (existingProjects.length > 0) {
  // Find most recently modified
  const sorted = [...existingProjects].sort((a, b) => b.lastModified - a.lastModified);
  initialProjectId = sorted[0].id;
  initialProjectName = sorted[0].name;
} else if (persisted) {
  // Data exists but no projects — create one
  const id = createStorageProject('My Workflow');
  initialProjectId = id;
  initialProjectName = 'My Workflow';
}

// CID Rules persistence
const RULES_KEY = 'lifecycle-cid-rules';
function loadRules(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(RULES_KEY) || '[]'); } catch { return []; }
}
function saveRules(rules: string[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); } catch { /* ignore */ }
}

// ─── 5-Layer Living Generative Entity State ─────────────────────────────────
// Temperament → Driving Force → Habit → Generation → Reflection
// Layers 1-2 (static) live in agents.ts. Layers 3-5 (evolving) live here.
// Drive evolution (Layer 2 mutations) are also persisted here.
const HABITS_KEY = 'lifecycle-agent-habits';
const REFLECTION_KEY = 'lifecycle-agent-reflection';
const DRIVES_KEY = 'lifecycle-agent-drives';

function loadHabits(): Record<CIDMode, HabitLayer> {
  if (typeof window === 'undefined') return { rowan: createDefaultHabits('rowan'), poirot: createDefaultHabits('poirot') };
  try {
    const raw = localStorage.getItem(HABITS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // V1 → V2 migration: convert old flat habits to new rich model
      return {
        rowan: migrateHabitsV1toV2(parsed.rowan || {}, 'rowan'),
        poirot: migrateHabitsV1toV2(parsed.poirot || {}, 'poirot'),
      };
    }
  } catch { /* ignore */ }
  return { rowan: createDefaultHabits('rowan'), poirot: createDefaultHabits('poirot') };
}

function saveHabits(habits: Record<CIDMode, HabitLayer>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(HABITS_KEY, JSON.stringify(habits)); } catch { /* ignore */ }
}

function loadReflection(): Record<CIDMode, ReflectionLayer> {
  if (typeof window === 'undefined') return { rowan: createDefaultReflection(), poirot: createDefaultReflection() };
  try {
    const raw = localStorage.getItem(REFLECTION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        rowan: migrateReflectionV1toV2(parsed.rowan || {}),
        poirot: migrateReflectionV1toV2(parsed.poirot || {}),
      };
    }
  } catch { /* ignore */ }
  return { rowan: createDefaultReflection(), poirot: createDefaultReflection() };
}

function saveReflection(reflection: Record<CIDMode, ReflectionLayer>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(REFLECTION_KEY, JSON.stringify(reflection)); } catch { /* ignore */ }
}

// Drive evolution — persisted separately from static agent config
function loadDriveEvolution(): Record<CIDMode, Record<string, number>> {
  if (typeof window === 'undefined') return { rowan: {}, poirot: {} };
  try {
    const raw = localStorage.getItem(DRIVES_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { rowan: {}, poirot: {} };
}

function saveDriveEvolution(drives: Record<CIDMode, Record<string, number>>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(DRIVES_KEY, JSON.stringify(drives)); } catch { /* ignore */ }
}

// Ephemeral generation state (reset each session)
const sessionGeneration: Record<CIDMode, GenerationLayer> = {
  rowan: createDefaultGeneration(),
  poirot: createDefaultGeneration(),
};

// Loaded at startup with migration
const loadedHabits = loadHabits();
const loadedReflection = loadReflection();
const loadedDriveEvolution = loadDriveEvolution();
saveHabits(loadedHabits);
saveReflection(loadedReflection);

/** Get current personality layers for an agent — assembles all 5 layers into a living entity */
function getAgentLayers(mode: CIDMode): AgentPersonalityLayers {
  const agent = getAgent(mode);
  // Merge evolved drive weights into the driving force layer
  const drivingForce: DrivingForceLayer = {
    ...agent.drivingForce,
    evolvedWeights: loadedDriveEvolution[mode],
  };
  return {
    temperament: agent.temperament,
    drivingForce,
    habits: loadedHabits[mode],
    generation: sessionGeneration[mode],
    reflection: loadedReflection[mode],
  };
}

/** Update generation context from current interaction signals — the LIVING part */
function refreshGenerationContext(mode: CIDMode, userMessage: string, nodeCount: number, recentMessages: string[]) {
  const agent = getAgent(mode);
  const ctx = computeGenerationContext(userMessage, nodeCount, recentMessages, sessionGeneration[mode].sessionStartedAt);
  sessionGeneration[mode].context = ctx;

  // Layer 1: Temperament reframing — how the agent PERCEIVES this input
  const learnedRules = loadedReflection[mode].learnedReframingRules || [];
  const reframed = applyTemperamentReframing(agent.temperament, learnedRules, userMessage);
  sessionGeneration[mode].reframedInput = reframed;

  // Layer 2: Curiosity spikes — drives that are triggered by this input
  const spikedForce = computeCuriositySpikes(agent.drivingForce, userMessage);
  // Store spikes transiently on the agent's drives for prompt compilation
  for (let i = 0; i < agent.drivingForce.drives.length; i++) {
    agent.drivingForce.drives[i].currentSpike = spikedForce.drives[i]?.currentSpike ?? 0;
  }

  // Layer 4: Spontaneous directives — novel, on-the-spot guidance
  const { dominant } = resolveDriverTensions(
    { ...agent.drivingForce, evolvedWeights: loadedDriveEvolution[mode] },
    ctx,
  );
  const directives = generateSpontaneousDirectives(userMessage, ctx, loadedHabits[mode], dominant);
  sessionGeneration[mode].spontaneousDirectives = directives;
}

/** Run reflection on an interaction and apply results — the METACOGNITION engine */
function runReflection(mode: CIDMode, userMessage: string, agentResponse: string) {
  const agent = getAgent(mode);
  // Pass drives so reflection can detect curiosity spike patterns and trigger drive reorganization
  const effectiveForce: DrivingForceLayer = {
    ...agent.drivingForce,
    evolvedWeights: loadedDriveEvolution[mode],
  };
  const actions = reflectOnInteraction(userMessage, agentResponse, loadedHabits[mode], sessionGeneration[mode].context, effectiveForce);
  if (actions.length === 0) return;

  const { habits, drives } = applyReflectionActions(actions, loadedHabits[mode], effectiveForce);
  loadedHabits[mode] = habits;

  // DRIVE EVOLUTION — persist evolved weights (no longer void'd!)
  if (drives.evolvedWeights) {
    loadedDriveEvolution[mode] = { ...loadedDriveEvolution[mode], ...drives.evolvedWeights };
    saveDriveEvolution(loadedDriveEvolution);
  }

  // Update growth edges, learned reframing rules, and drive evolution log
  loadedReflection[mode] = updateGrowthEdges(loadedReflection[mode], actions);

  saveHabits(loadedHabits);
  saveReflection(loadedReflection);

  // Log reflection with sedimentation info
  const topSedimented = loadedHabits[mode].domainExpertise
    .filter(d => (d.sedimentation ?? 0) > 0.2)
    .map(d => d.domain);
  cidLog('reflection', {
    mode,
    actions: actions.length,
    domains: loadedHabits[mode].domainExpertise.length,
    depth: loadedHabits[mode].relationshipDepth.toFixed(2),
    sedimented: topSedimented.length,
    driveShifts: Object.keys(loadedDriveEvolution[mode]).length,
    learnedRules: (loadedReflection[mode].learnedReframingRules || []).length,
  });
}

// Context-aware welcome: when returning to a saved workflow, add a summary greeting
function buildWelcomeBack(nodes: Node<NodeData>[], edges: Edge[], mode: CIDMode): CIDMessage | null {
  if (!nodes || nodes.length === 0) return null;
  const _agent = getAgent(mode);
  const stale = nodes.filter(n => n.data.status === 'stale').length;
  const reviewing = nodes.filter(n => n.data.status === 'reviewing').length;
  const parts: string[] = [];
  parts.push(`${nodes.length} node${nodes.length > 1 ? 's' : ''}, ${edges.length} edge${edges.length > 1 ? 's' : ''}`);
  if (stale > 0) parts.push(`${stale} stale`);
  if (reviewing > 0) parts.push(`${reviewing} in review`);
  const summary = parts.join(', ');
  const content = mode === 'poirot'
    ? `Ah, welcome back, mon ami! I see you have a case in progress — ${summary}. Shall I investigate, or do you have new instructions?`
    : `Welcome back. Current state: ${summary}. Ready for orders.`;
  return { id: `wb-${Date.now()}`, role: 'cid' as const, content, timestamp: Date.now() };
}

// MAX_HISTORY, computeUndoOp, applyUndo, applyRedo, stripExecutionData — imported from ./helpers

export const useLifecycleStore = create<LifecycleStore>((set, get, api) => ({
  // ── Extracted slices (spread first, inline code can override) ──
  ...createUISlice(set, get, api),
  ...createArtifactSlice(set, get, api),
  nodes: (() => {
    const raw = persisted?.nodes ?? [];
    // Deduplicate by ID (keep last occurrence)
    const seen = new Map<string, typeof raw[0]>();
    for (const n of raw) seen.set(n.id, n);
    return [...seen.values()];
  })(),
  edges: persisted?.edges ?? [],
  events: persisted?.events ?? [],
  centralContext: (persisted as Record<string, unknown>)?.centralContext as CentralContext | null ?? null,
  // Welcome-back messages are ephemeral — appended at init but filtered out before saving
  messages: (() => {
    if (persisted?.messages) {
      const wb = buildWelcomeBack(persisted.nodes ?? [], persisted.edges ?? [], persistedMode);
      return wb ? [...persisted.messages, { ...wb, _ephemeral: true }] : persisted.messages;
    }
    return [{ id: 'init-1', role: 'cid' as const, content: getAgent(persistedMode).welcome, timestamp: Date.now() }];
  })(),
  // selectedNodeId, showCIDPanel, showPreviewPanel — from UISlice
  isProcessing: false,
  // fitViewCounter, requestFitView — from UISlice

  // AI model for CID (persisted)
  cidAIModel: persistedModel,
  setCIDAIModel: (model) => {
    currentAIModel = model;
    set({ cidAIModel: model });
  },

  // Usage stats
  _usageStats: createEmptyUsageStats(),
  resetUsageStats: () => set({ _usageStats: createEmptyUsageStats() }),

  // Agent mode
  cidMode: persistedMode,
  setCIDMode: (mode) => set((s) => {
    const oldMode = s.cidMode;
    const agent = getAgent(mode);

    // Layer 5: Run reflection for outgoing agent on mode switch
    const lastUserMsg = s.messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    const lastCidMsg = s.messages.filter(m => m.role === 'cid').slice(-1)[0]?.content || '';
    if (lastUserMsg) runReflection(oldMode, lastUserMsg, lastCidMsg);
    // Reset generation state for new agent
    sessionGeneration[mode] = createDefaultGeneration();

    // Keep conversation history, just add a mode-switch message
    const switchMessage: CIDMessage = {
      id: `switch-${Date.now()}`, role: 'cid',
      content: `— Switched to **${agent.name}** —\n\n${agent.welcome}`,
      timestamp: Date.now(),
    };
    const messages = [...s.messages, switchMessage];
    saveToStorage({ nodes: s.nodes, edges: s.edges, events: s.events, messages }, mode);
    return {
      cidMode: mode,
      messages,
      poirotContext: { phase: 'idle', originalPrompt: '', answers: {}, questionIndex: 0 },
    };
  }),
  poirotContext: { phase: 'idle', originalPrompt: '', answers: {}, questionIndex: 0 },

  handleCardSelect: (cardId, cardLabel) => {
    const store = get();
    const ctx = store.poirotContext;
    if (ctx.phase !== 'interviewing') return;

    store.addMessage({ id: `msg-${Date.now()}`, role: 'user', content: cardLabel, timestamp: Date.now() });

    const allQuestions = getInterviewQuestions(ctx.originalPrompt, store.nodes, store.edges, store.cidMode);
    const { questions: adaptiveQuestions, preAnswers } = getAdaptiveInterview(ctx.originalPrompt, store.nodes, store.edges, store.cidMode);
    const agent = getAgent(store.cidMode);

    // Merge pre-answers with user answers; map adaptive index to original index
    const adaptiveQ = adaptiveQuestions[ctx.questionIndex];
    const originalIdx = allQuestions.findIndex(q => q.key === adaptiveQ?.key);
    const newAnswers = { ...ctx.answers, ...preAnswers, [`q${originalIdx >= 0 ? originalIdx : ctx.questionIndex}`]: cardId };
    const nextQ = ctx.questionIndex + 1;

    // Check for early exit: if high-priority questions are all answered, skip the rest
    const canEarlyExit = shouldSkipRemainingQuestions(newAnswers, allQuestions);

    if (nextQ < adaptiveQuestions.length && !canEarlyExit) {
      set({ poirotContext: { ...ctx, answers: newAnswers, questionIndex: nextQ } });
      setTimeout(() => {
        const q = adaptiveQuestions[nextQ];
        store.addMessage({
          id: `msg-${Date.now()}-q`, role: 'cid',
          content: q.question,
          timestamp: Date.now(),
          cards: q.cards,
          cardPrompt: q.question,
        });
      }, 600);
    } else {
      set({ poirotContext: { ...ctx, answers: newAnswers, questionIndex: nextQ, phase: 'revealing' } });
      setTimeout(() => {
        store.addMessage({
          id: `msg-${Date.now()}-reveal`, role: 'cid',
          content: agent.interviewReveal,
          timestamp: Date.now(), action: 'investigating',
        });
        setTimeout(() => {
          const enrichedPrompt = buildEnrichedPrompt(ctx.originalPrompt, newAnswers, allQuestions);
          store.generateWorkflow(enrichedPrompt);
          set({ poirotContext: { phase: 'idle', originalPrompt: '', answers: {}, questionIndex: 0 } });
        }, 1500);
      }, 600);
    }
  },

  // Named snapshots
  snapshots: new Map(),

  // pinnedMessageIds, togglePinMessage — from UISlice

  cloneWorkflow: () => {
    cidLog('cloneWorkflow');
    const { nodes, edges, pushHistory } = get();
    if (nodes.length === 0) return 'No workflow to clone.';
    pushHistory();
    const idMap = new Map<string, string>();
    nodes.forEach(n => idMap.set(n.id, uid()));
    // Find bounding box to offset the clone
    const maxX = Math.max(...nodes.map(n => n.position.x));
    const offsetX = maxX + NODE_W + 150;
    const clonedNodes: Node<NodeData>[] = nodes.map(n => ({
      ...n,
      id: idMap.get(n.id)!,
      position: { x: n.position.x + offsetX, y: n.position.y },
      data: { ...n.data, label: `${n.data.label} (copy)`, version: 1, lastUpdated: Date.now() },
    }));
    const clonedEdges: Edge[] = edges
      .filter(e => idMap.has(e.source) && idMap.has(e.target))
      .map(e => ({
        ...e,
        id: `e-${idMap.get(e.source)!}-${idMap.get(e.target)!}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
      }));
    set(s => ({
      nodes: [...s.nodes, ...clonedNodes],
      edges: [...s.edges, ...clonedEdges],
    }));
    const s = get();
    saveToStorage({ nodes: s.nodes, edges: s.edges, events: s.events, messages: s.messages });
    return `Cloned **${nodes.length}** nodes and **${edges.length}** edges. The copy is placed to the right of the original.`;
  },

  whatIf: (prompt) => {
    cidLog('whatIf', prompt);
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No workflow to analyze.';
    const nameMatch = prompt.match(/(?:what\s*if|impact|remove|without)\s+(?:i\s+)?(?:remove|delete|drop)?\s*["']?(.+?)["']?\s*$/i);
    if (!nameMatch) return 'Usage: `what if remove <node name>` — simulate removing a node and see the impact.';
    const target = findNodeByName(nameMatch[1], nodes);
    if (!target) return `No node matching "${nameMatch[1]}". Available: ${nodes.map(n => n.data.label).join(', ')}.`;

    const targetId = target.id;
    // Find directly affected edges
    const affectedEdges = edges.filter(e => e.source === targetId || e.target === targetId);
    const upstreamIds = new Set(affectedEdges.filter(e => e.target === targetId).map(e => e.source));
    const downstreamIds = new Set(affectedEdges.filter(e => e.source === targetId).map(e => e.target));

    // Find nodes that would become orphaned (no remaining connections after removal)
    const remainingEdges = edges.filter(e => e.source !== targetId && e.target !== targetId);
    const connectedAfter = new Set<string>();
    remainingEdges.forEach(e => { connectedAfter.add(e.source); connectedAfter.add(e.target); });
    const wouldOrphan = nodes.filter(n => n.id !== targetId && !connectedAfter.has(n.id) && edges.some(e => e.source === n.id || e.target === n.id));

    // Find broken paths — downstream nodes that lose their only incoming connection
    const downstreamLoseInput = nodes.filter(n => {
      if (!downstreamIds.has(n.id)) return false;
      const incomingAfter = remainingEdges.filter(e => e.target === n.id);
      return incomingAfter.length === 0;
    });

    const parts: string[] = [];
    parts.push(`### Impact Analysis: Remove "${target.data.label}"`);
    parts.push('');
    parts.push(`**${affectedEdges.length}** connection${affectedEdges.length !== 1 ? 's' : ''} would break:`);
    if (upstreamIds.size > 0) {
      const names = nodes.filter(n => upstreamIds.has(n.id)).map(n => `\`${n.data.label}\``);
      parts.push(`- **Upstream** (feeds into this): ${names.join(', ')}`);
    }
    if (downstreamIds.size > 0) {
      const names = nodes.filter(n => downstreamIds.has(n.id)).map(n => `\`${n.data.label}\``);
      parts.push(`- **Downstream** (depends on this): ${names.join(', ')}`);
    }
    if (downstreamLoseInput.length > 0) {
      parts.push('');
      parts.push(`**${downstreamLoseInput.length}** node${downstreamLoseInput.length !== 1 ? 's' : ''} would lose all input:`);
      downstreamLoseInput.forEach(n => parts.push(`- \`${n.data.label}\` — will have no incoming connections`));
    }
    if (wouldOrphan.length > 0) {
      parts.push('');
      parts.push(`**${wouldOrphan.length}** node${wouldOrphan.length !== 1 ? 's' : ''} would become completely disconnected:`);
      wouldOrphan.forEach(n => parts.push(`- \`${n.data.label}\``));
    }
    if (affectedEdges.length === 0) {
      parts.push('');
      parts.push('This node has no connections — removing it has no structural impact.');
    }
    const remainingCount = nodes.length - 1;
    parts.push('');
    parts.push(`Workflow would shrink to **${remainingCount}** node${remainingCount !== 1 ? 's' : ''} and **${remainingEdges.length}** edge${remainingEdges.length !== 1 ? 's' : ''}.`);
    return parts.join('\n');
  },

  executeNode: async (nodeId: string) => {
    // Mutex: prevent double-execution of same node
    if (get()._executingNodeIds.has(nodeId)) {
      cidLog('executeNode:skipped', { nodeId, reason: 'already executing' });
      return;
    }
    get()._lockNode(nodeId);

    const store = get();
    const node = store.nodes.find(n => n.id === nodeId);
    if (!node) { get()._unlockNode(nodeId); return; }
    cidLog('executeNode', { nodeId, label: node.data.label, category: node.data.category });

    const d = node.data;
    const _execStart = Date.now();

    // Passthrough categories: these don't call the AI API, they pass data downstream
    if (d.category === 'input') {
      const value = d.inputValue || d.content || '';
      store.updateNodeData(nodeId, { executionResult: value, executionStatus: value ? 'success' : 'idle', _executionStartedAt: _execStart, _executionDurationMs: Date.now() - _execStart });
      get()._unlockNode(nodeId);
      return;
    }
    if (d.category === 'trigger') {
      // Triggers are initiators — they pass through their description/content as context
      const value = d.content || d.description || `Trigger: ${d.label}`;
      store.updateNodeData(nodeId, { executionResult: value, executionStatus: 'success', _executionStartedAt: _execStart, _executionDurationMs: Date.now() - _execStart });
      get()._unlockNode(nodeId);
      return;
    }
    if (d.category === 'dependency') {
      // Dependencies are prerequisites — pass through as metadata
      const value = d.content || d.description || `Dependency: ${d.label}`;
      store.updateNodeData(nodeId, { executionResult: value, executionStatus: 'success', _executionStartedAt: _execStart, _executionDurationMs: Date.now() - _execStart });
      get()._unlockNode(nodeId);
      return;
    }

    // Decision nodes get a special execution prompt that forces a routing decision
    if (d.category === 'decision') {
      const inEdges = store.edges.filter(e => e.target === nodeId);
      const upstreamData = inEdges.map(e => {
        const src = store.nodes.find(n => n.id === e.source);
        return src ? `[${src.data.label}]: ${(src.data.executionResult || src.data.content || '').slice(0, 1000)}` : '';
      }).filter(Boolean).join('\n\n');

      const outEdges = store.edges.filter(e => e.source === nodeId);
      const options = d.decisionOptions || outEdges.map(e => {
        const cond = e.data?.condition as import('@/lib/types').EdgeCondition | undefined;
        if (cond?.type === 'decision-is') return cond.value;
        const tgt = store.nodes.find(n => n.id === e.target);
        return tgt?.data.label || 'unknown';
      });

      const decisionPrompt = d.aiPrompt || d.content || `Evaluate the upstream data and decide which path to take.`;
      const systemPrompt = `You are a decision-making agent. Analyze the input and choose ONE of the available options.\n\nAvailable options: ${options.join(', ')}\n\nIMPORTANT: Your response MUST start with "DECISION: <chosen option>" on the first line. Then explain your reasoning below.`;

      try {
        store.updateNodeData(nodeId, { executionStatus: 'running', _executionStartedAt: _execStart });
        const res = await fetch('/api/cid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt,
            messages: [{ role: 'user', content: `${decisionPrompt}\n\n--- UPSTREAM DATA ---\n${upstreamData}` }],
            model: store.cidAIModel,
            taskType: 'analyze',
          }),
          signal: AbortSignal.timeout(60000),
        });
        const data = await res.json();
        const output = data.result?.message || data.result?.content || '';
        const _execDuration = Date.now() - _execStart;
        store.updateNodeData(nodeId, {
          executionResult: output,
          executionStatus: 'success',
          _executionDurationMs: _execDuration,
        });
        cidLog('executeNode:decision', { nodeId, label: d.label, output: output.slice(0, 100) });
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
    const incomingEdges = store.edges.filter(e => e.target === nodeId);

    // Circuit breaker: skip if any required upstream node failed
    const upstreamNodes = incomingEdges.map(e => store.nodes.find(n => n.id === e.source)).filter(Boolean);
    const failedUpstream = upstreamNodes.filter(n => n!.data.executionStatus === 'error');
    if (failedUpstream.length > 0 && d.category !== 'note') {
      const failNames = failedUpstream.map(n => n!.data.label).join(', ');
      store.updateNodeData(nodeId, {
        executionStatus: 'error',
        executionError: `Skipped: upstream node(s) failed (${failNames}). Fix upstream errors first.`,
        _executionStartedAt: _execStart,
        _executionDurationMs: 0,
      });
      get()._unlockNode(nodeId);
      return;
    }

    const upstreamResults = incomingEdges.map(e => {
      const src = store.nodes.find(n => n.id === e.source);
      return src?.data.executionResult || src?.data.content || '';
    }).filter(Boolean);

    // Output node with file format — trigger actual file download
    if (d.category === 'output' && d.outputFormat) {
      const content = upstreamResults.join('\n\n---\n\n') || d.content || '';
      if (!content) {
        store.updateNodeData(nodeId, { executionStatus: 'error', executionError: 'No content from upstream nodes to export.', _executionStartedAt: _execStart, _executionDurationMs: Date.now() - _execStart });
        get()._unlockNode(nodeId);
        return;
      }

      try {
        let blob: Blob;
        const filename = `${d.label.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;

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
          store.updateNodeData(nodeId, { executionResult: content, executionStatus: 'success', _executionStartedAt: _execStart, _executionDurationMs: Date.now() - _execStart });
          store.addToast(`PDF ready — use your browser's print dialog to save as PDF`, 'success');
          get()._unlockNode(nodeId);
          return;
        } else if (d.outputFormat === 'html') {
          const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${d.label}</title></head><body>${markdownToHTML(content)}</body></html>`;
          blob = new Blob([htmlContent], { type: 'text/html' });
        } else if (d.outputFormat === 'json') {
          blob = new Blob([JSON.stringify({ title: d.label, content, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
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

        store.updateNodeData(nodeId, { executionResult: content, executionStatus: 'success', _executionStartedAt: _execStart, _executionDurationMs: Date.now() - _execStart });
        store.addToast(`Downloaded ${d.outputFormatLabel || d.outputFormat.toUpperCase()} file`, 'success');
        get()._unlockNode(nodeId);
        return;
      } catch {
        store.updateNodeData(nodeId, { executionStatus: 'error', executionError: 'Failed to export file.', _executionStartedAt: _execStart, _executionDurationMs: Date.now() - _execStart });
        get()._unlockNode(nodeId);
        return;
      }
    }

    // If node already has rich content and upstream nodes have no execution results
    // (i.e. content was pre-generated by API), use existing content as execution result
    const hasUpstreamExecResults = incomingEdges.some(e => {
      const src = store.nodes.find(n => n.id === e.source);
      return src?.data.executionResult && src.data.executionResult !== src.data.content;
    });
    if (d.content && d.content.length > 50 && !hasUpstreamExecResults && !d.aiPrompt) {
      store.updateNodeData(nodeId, { executionResult: d.content, executionStatus: 'success', _executionStartedAt: _execStart, _executionDurationMs: Date.now() - _execStart });
      get()._unlockNode(nodeId);
      return;
    }

    // Build edge-aware context: which upstream nodes feed this one and via which relationship
    const edgeContext = incomingEdges.map(e => {
      const src = store.nodes.find(n => n.id === e.source);
      const label = (typeof e.label === 'string' ? e.label : e.data?.label as string) || 'connects';
      return { from: src?.data.label || 'Unknown', relationship: label, category: src?.data.category || '' };
    });
    const relationshipHint = edgeContext.length > 0
      ? ` You receive input via: ${edgeContext.map(e => `"${e.relationship}" from "${e.from}" (${e.category})`).join(', ')}.`
      : '';

    // Downstream awareness — tell the node what consumers expect
    const outgoingEdges = store.edges.filter(e => e.source === nodeId);
    const downstreamHint = outgoingEdges.length > 0
      ? ` Your output will be used by: ${outgoingEdges.map(e => {
          const tgt = store.nodes.find(n => n.id === e.target);
          const label = (typeof e.label === 'string' ? e.label : e.data?.label as string) || 'next step';
          return `"${tgt?.data.label}" (${label})`;
        }).join(', ')}. Tailor your output format accordingly.`
      : '';

    // Build an execution prompt — either from explicit aiPrompt or auto-generated from node context
    const autoPrompt = d.aiPrompt || (() => {
      const cat = d.category;
      const label = d.label;
      const desc = d.description || '';
      // Edge-semantic overrides for specific category+edge combinations
      const hasValidatesEdge = edgeContext.some(e => e.relationship === 'validates');
      const hasMonitorsEdge = edgeContext.some(e => e.relationship === 'monitors');
      const hasTriggersEdge = edgeContext.some(e => e.relationship === 'triggers');
      if (cat === 'review' && hasValidatesEdge) return `Review and validate the content received from upstream for "${label}".${relationshipHint}${downstreamHint} ${desc}`;
      if (cat === 'policy' && hasMonitorsEdge) return `Check the content against policy rules for "${label}".${relationshipHint}${downstreamHint} ${desc}`;
      if (cat === 'action' && hasTriggersEdge) return `Execute this action triggered by upstream for "${label}".${relationshipHint}${downstreamHint} ${desc}`;
      if (cat === 'cid') return `Process and transform the input content for "${label}".${relationshipHint}${downstreamHint} ${desc}`;
      if (cat === 'artifact') return `Generate detailed, professional content for "${label}".${relationshipHint}${downstreamHint} ${desc} Include all relevant sections. Write real content, not placeholders. Use markdown formatting.`;
      if (cat === 'state') return `Analyze and organize the input content for "${label}".${relationshipHint}${downstreamHint} ${desc} Structure the information clearly and extract key points.`;
      if (cat === 'review') return `Review the following content for quality, completeness, and accuracy. Provide a brief assessment and note any issues. For "${label}":${relationshipHint}${downstreamHint} ${desc}`;
      if (cat === 'note') return `Summarize and organize research notes for "${label}".${relationshipHint}${downstreamHint} ${desc} Extract key insights and organize them clearly.`;
      if (cat === 'policy') return `Define and document the policy rules for "${label}".${relationshipHint}${downstreamHint} ${desc}`;
      if (cat === 'trigger') return `Define the trigger conditions for "${label}".${relationshipHint}${downstreamHint} ${desc} Specify what events, schedules, or conditions activate this step.`;
      if (cat === 'test') return `Design and execute tests for "${label}".${relationshipHint}${downstreamHint} ${desc} Define test cases, expected outcomes, and report pass/fail results.`;
      if (cat === 'action') return `Execute the action for "${label}".${relationshipHint}${downstreamHint} ${desc} Describe the operation, its inputs, outputs, and any side effects.`;
      if (cat === 'patch') return `Generate a patch or fix for "${label}".${relationshipHint}${downstreamHint} ${desc} Identify the issue, describe the fix, and provide the corrected content.`;
      if (cat === 'dependency') return `Analyze and resolve dependencies for "${label}".${relationshipHint}${downstreamHint} ${desc} List required dependencies, their status, and any conflicts.`;
      if (cat === 'output' && !d.outputFormat) return null; // Output nodes pass through upstream content
      if (cat === 'process') return `Process and transform the input for "${label}".${relationshipHint}${downstreamHint} ${desc} Be thorough and structured.`;
      if (cat === 'deliverable') return `Generate detailed, professional content for "${label}".${relationshipHint}${downstreamHint} ${desc} Include all relevant sections. Write real content, not placeholders. Use markdown formatting.`;
      return null;
    })();

    // If no prompt could be generated, pass through upstream content
    if (!autoPrompt) {
      const passthrough = upstreamResults.join('\n\n---\n\n') || d.content || '';
      store.updateNodeData(nodeId, { executionResult: passthrough, executionStatus: passthrough ? 'success' : 'idle', _executionStartedAt: _execStart, _executionDurationMs: Date.now() - _execStart });
      get()._unlockNode(nodeId);
      return;
    }

    // JIT context scoping: full results from direct parents, truncated from ancestors
    const directParentIds = new Set(incomingEdges.map(e => e.source));
    const collectAncestors = (parentIds: Set<string>, depth: number): Array<{ label: string; result: string }> => {
      if (depth <= 0 || parentIds.size === 0) return [];
      const grandparentEdges = store.edges.filter(e => parentIds.has(e.target) && !directParentIds.has(e.source));
      const grandparents = new Map<string, { label: string; result: string }>();
      for (const e of grandparentEdges) {
        const src = store.nodes.find(n => n.id === e.source);
        if (src && !grandparents.has(src.id)) {
          const result = src.data.executionResult || src.data.content || '';
          grandparents.set(src.id, { label: src.data.label, result: result.slice(0, 200) + (result.length > 200 ? '...' : '') });
        }
      }
      const gpIds = new Set(grandparents.keys());
      return [...grandparents.values(), ...collectAncestors(gpIds, depth - 1)];
    };

    const directContext = incomingEdges.map(e => {
      const src = store.nodes.find(n => n.id === e.source);
      const edgeLabel = (typeof e.label === 'string' ? e.label : e.data?.label as string) || 'connects';
      const srcResult = src?.data.executionResult || src?.data.content || '';
      return srcResult ? `## From "${src?.data.label}" (${edgeLabel})\n${srcResult}` : '';
    }).filter(Boolean).join('\n\n---\n\n');

    const ancestors = collectAncestors(directParentIds, 2);
    const ancestorSummary = ancestors.length > 0
      ? `\n\n## Background context (summarized):\n${ancestors.map(a => `[${a.label}]: ${a.result}`).join('\n')}`
      : '';

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
      set((s) => ({ _usageStats: { ...s._usageStats, totalCalls: s._usageStats.totalCalls + 1, cachedSkips: s._usageStats.cachedSkips + 1 } }));
      get()._unlockNode(nodeId);
      return;
    }

    store.updateNodeData(nodeId, { executionStatus: 'running', executionError: undefined, _executionStartedAt: _execStart });
    store.updateNodeStatus(nodeId, 'generating');
    set({ executionStartTime: _execStart });
    cidLog('executeNode:running', { nodeId, label: d.label, model: store.cidAIModel, upstreamCount: upstreamResults.length });

    // Timeout abort controller — 120s max
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 120_000);

    try {
      // All AI execution routes through the server-side /api/cid route
      let output = '';

      {
        const { buildToolPrompt, parseToolCalls, executeTool, formatToolResults } = await import('@/lib/agentTools');
        const agentConfig = d.agentConfig;
        const tools = agentConfig?.tools || [];
        const toolPromptSuffix = buildToolPrompt(tools);
        const maxIterations = (agentConfig?.enableLooping && agentConfig?.maxLoopIterations) || (tools.length > 0 ? 3 : 1);
        const maxRetries = agentConfig?.maxRetries || 0;
        const timeoutMs = agentConfig?.timeoutMs || 120_000;

        // Override abort controller with agent-specific timeout
        clearTimeout(timeoutId);
        const agentAbort = new AbortController();
        const agentTimeoutId = setTimeout(() => agentAbort.abort(), timeoutMs);

        const systemPrompt = getExecutionSystemPrompt(d.category, d.label, inputContext) + toolPromptSuffix;
        const effortLevel = d._effortLevel || inferEffortFromCategory(d.category);
        let messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
          { role: 'user', content: `${autoPrompt}\n\n${inputContext}` },
        ];
        let lastError: string | null = null;

        // ── Agent loop: iterate with tool calls ──
        for (let iteration = 0; iteration < maxIterations; iteration++) {
          let attempt = 0;
          let res: Response | null = null;
          let result: Record<string, unknown> | null = null;

          // ── Retry loop on failure ──
          while (attempt <= maxRetries) {
            try {
              res = await fetch('/api/cid', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  systemPrompt,
                  model: store.cidAIModel,
                  taskType: 'execute',
                  effortLevel,
                  messages,
                }),
                signal: agentAbort.signal,
              });

              if (!res.ok) {
                lastError = `CID API error ${res.status}`;
                attempt++;
                if (attempt <= maxRetries) {
                  cidLog('executeNode:retry', { nodeId, attempt, maxRetries, error: lastError });
                  await new Promise(r => setTimeout(r, 1000 * attempt));
                  continue;
                }
                break;
              }
              result = await res.json();
              if ((result as Record<string, unknown>).error) {
                const errResult = result as { error: string; message?: string };
                lastError = errResult.error === 'no_api_key' ? 'No API key configured on server.' : (errResult.message || errResult.error);
                attempt++;
                if (attempt <= maxRetries) {
                  cidLog('executeNode:retry', { nodeId, attempt, maxRetries, error: lastError });
                  await new Promise(r => setTimeout(r, 1000 * attempt));
                  continue;
                }
                break;
              }
              lastError = null;
              break;
            } catch (fetchErr) {
              lastError = fetchErr instanceof Error ? fetchErr.message : 'Fetch failed';
              attempt++;
              if (attempt <= maxRetries) {
                cidLog('executeNode:retry', { nodeId, attempt, maxRetries, error: lastError });
                await new Promise(r => setTimeout(r, 1000 * attempt));
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
              store.updateNodeData(nodeId, { executionStatus: 'idle', executionError: `Skipped: ${lastError}`, _executionDurationMs: Date.now() - _execStart });
              store.updateNodeStatus(nodeId, 'active');
              get()._unlockNode(nodeId);
              return;
            }
            store.updateNodeData(nodeId, { executionStatus: 'error', executionError: lastError || 'Unknown error', _executionDurationMs: Date.now() - _execStart });
            store.updateNodeStatus(nodeId, 'active');
            get()._unlockNode(nodeId);
            return;
          }

          // The response may be parsed JSON or raw text
          const resultData = result as { result?: { content?: string; message?: string }; usage?: { prompt_tokens?: number; completion_tokens?: number } };
          const rawOutput = resultData.result?.content || resultData.result?.message || (typeof resultData.result === 'string' ? resultData.result : JSON.stringify(resultData.result));

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
          cidLog('executeNode:tools', { nodeId, label: d.label, iteration, toolCount: toolCalls.length, tools: toolCalls.map(t => t.name) });
          const toolResults = await Promise.all(
            toolCalls.map(tc => executeTool(tc))
          );
          const toolResultsText = formatToolResults(toolResults);

          // Add assistant response + tool results to conversation for next iteration
          messages = [
            ...messages,
            { role: 'assistant' as const, content: rawOutput },
            { role: 'user' as const, content: `Tool results:\n\n${toolResultsText}\n\nContinue with your task using these results. If you need more tools, call them. Otherwise, provide your final output.` },
          ];
        }
      }

      const _execDuration = Date.now() - _execStart;
      // Version snapshot before overwriting execution result
      const preExecNode = get().nodes.find(n => n.id === nodeId);
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
      const validationWarnings = validateOutput(output, d.category, d.label, extractKeywords(autoPrompt));

      store.updateNodeData(nodeId, { executionResult: output, executionStatus: 'success', executionError: undefined, apiKey: undefined, _executionDurationMs: _execDuration, _validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined });
      store.updateNodeStatus(nodeId, 'active');
      store.addEvent({ id: uid(), type: 'regenerated', message: `Executed "${d.label}" successfully (${(_execDuration / 1000).toFixed(1)}s)${validationWarnings.length > 0 ? ` [${validationWarnings.length} warning${validationWarnings.length > 1 ? 's' : ''}]` : ''}`, timestamp: Date.now(), nodeId, agent: true });
      cidLog('executeNode:success', { nodeId, outputLength: output.length, durationMs: _execDuration, validationWarnings: validationWarnings.length });

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
        : (err instanceof Error ? err.message : 'Execution failed');
      store.updateNodeData(nodeId, { executionStatus: 'error', executionError: errMsg, _executionDurationMs: Date.now() - _execStart });
      store.updateNodeStatus(nodeId, 'active');
      store.addToast(
        isTimeout
          ? `Node "${d.label}" timed out. Try again or skip.`
          : `Node "${d.label}" failed: ${errMsg.slice(0, 80)}`,
        'error'
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
    const mode = get().cidMode;

    // ── Initialize workflow context for agentic routing ──
    const workflowContext: import('@/lib/types').WorkflowContext = {
      sessionId: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startedAt: Date.now(),
      shared: {},
      decisions: {},
      skippedNodeIds: new Set<string>(),
    };

    // Save current results as snapshot for diff
    const snapshot = new Map<string, string>();
    nodes.forEach(n => {
      if (n.data.executionResult) snapshot.set(n.id, n.data.executionResult);
    });
    set({ lastExecutionSnapshot: snapshot });

    // ── Pre-execution validation ──
    const nodeIds = new Set(nodes.map(n => n.id));
    const issues: string[] = [];

    // Check for cycles
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    const W = 0, G = 1, B = 2;
    const clr = new Map<string, number>();
    nodes.forEach(n => clr.set(n.id, W));
    let hasCycle = false;
    const cycleLabels: string[] = [];
    const dfsCycle = (id: string) => {
      clr.set(id, G);
      for (const child of adj.get(id) || []) {
        if (clr.get(child) === G) {
          hasCycle = true;
          const n = nodes.find(nd => nd.id === child);
          if (n) cycleLabels.push(n.data.label);
        }
        if (clr.get(child) === W) dfsCycle(child);
      }
      clr.set(id, B);
    };
    for (const n of nodes) { if (clr.get(n.id) === W) dfsCycle(n.id); }
    if (hasCycle) issues.push(`Cycle detected involving: ${cycleLabels.join(', ')}`);

    // Check for orphaned edges
    const orphaned = edges.filter(e => !nodeIds.has(e.source) || !nodeIds.has(e.target));
    if (orphaned.length > 0) issues.push(`${orphaned.length} orphaned edge(s)`);

    // Check for disconnected nodes (no edges at all)
    const connectedIds = new Set<string>();
    edges.forEach(e => { connectedIds.add(e.source); connectedIds.add(e.target); });
    const disconnected = nodes.filter(n => !connectedIds.has(n.id));
    if (disconnected.length > 0 && nodes.length > 1) {
      issues.push(`${disconnected.length} disconnected node(s): ${disconnected.map(n => n.data.label).join(', ')}`);
    }

    // Report validation issues (but continue — only cycles are blocking)
    if (issues.length > 0) {
      const validationMsg = mode === 'poirot'
        ? `Attention, mon ami! My little grey cells detect ${issues.length} issue${issues.length > 1 ? 's' : ''} before execution:\n${issues.map(i => `- ${i}`).join('\n')}${hasCycle ? '\n\nThe cycle, it prevents execution. Fix it first!' : '\n\nProceeding despite warnings...'}`
        : `Pre-flight check: ${issues.length} issue${issues.length > 1 ? 's' : ''} found:\n${issues.map(i => `- ${i}`).join('\n')}${hasCycle ? '\n\nBlocked: fix cycle first.' : '\n\nContinuing.'}`;
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
        const nodeLabel = nodes.find(n => n.id === nodeId)?.data.label ?? nodeId;
        set({ executionProgress: {
          current: completed, total: order.length, currentLabel: nodeLabel, running: true,
          stage: stageIdx, totalStages: sortedLevels.length,
          succeeded: successCount, failed: errorCount, skipped: skippedCount,
        } });

        // ── Agentic routing: check if this node should be skipped ──

        // 1. Skip if already marked as skipped by decision routing
        if (workflowContext.skippedNodeIds.has(nodeId)) {
          skippedCount++;
          skippedNames.push(nodeLabel);
          store.updateNodeData(nodeId, { executionStatus: 'idle', executionError: 'Skipped: conditional routing' });
          cidLog('executeWorkflow:skip', { nodeId, label: nodeLabel, reason: 'conditional routing' });
          completed++;
          return;
        }

        // 2. Skip if any upstream dependency failed (cascade skip)
        const upstreamEdges = edges.filter(e => e.target === nodeId);
        const hasFailedUpstream = upstreamEdges.some(e => {
          const src = get().nodes.find(n => n.id === e.source);
          return src?.data.executionStatus === 'error';
        });
        if (hasFailedUpstream) {
          skippedCount++;
          skippedNames.push(nodeLabel);
          store.updateNodeData(nodeId, { executionStatus: 'error', executionError: 'Skipped: upstream dependency failed' });
          cidLog('executeWorkflow:skip', { nodeId, label: nodeLabel, reason: 'upstream failed' });
          completed++;
          return;
        }

        // 3. Check conditional edges — all incoming conditions must be satisfied
        const conditionalEdges = upstreamEdges.filter(e => e.data?.condition);
        if (conditionalEdges.length > 0) {
          const allConditionsMet = conditionalEdges.every(e => {
            const cond = e.data?.condition as import('@/lib/types').EdgeCondition | undefined;
            if (!cond) return true;
            const srcNode = get().nodes.find(n => n.id === e.source);
            if (!srcNode) return false;
            const output = srcNode.data.executionResult || '';
            const status = srcNode.data.executionStatus || 'idle';
            let result = false;
            switch (cond.type) {
              case 'output-contains':
                result = output.toLowerCase().includes(cond.value.toLowerCase());
                break;
              case 'output-matches':
                try { result = new RegExp(cond.value, 'i').test(output); } catch { result = false; }
                break;
              case 'status-is':
                result = status === cond.value;
                break;
              case 'decision-is':
                result = (srcNode.data.decisionResult || '').toLowerCase() === cond.value.toLowerCase();
                break;
            }
            return cond.negate ? !result : result;
          });
          if (!allConditionsMet) {
            skippedCount++;
            skippedNames.push(nodeLabel);
            workflowContext.skippedNodeIds.add(nodeId);
            store.updateNodeData(nodeId, { executionStatus: 'idle', executionError: 'Skipped: edge condition not met' });
            cidLog('executeWorkflow:skip', { nodeId, label: nodeLabel, reason: 'condition not met' });
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
        const updated = get().nodes.find(n => n.id === nodeId);
        if (updated?.data.executionStatus === 'error') {
          errorCount++;
          failedNames.push(nodeLabel);
        } else {
          successCount++;

          // ── Decision node routing ──
          // After a decision node executes, parse its output to determine which path
          if (updated?.data.category === 'decision') {
            const output = (updated.data.executionResult || '').trim();
            // Extract decision: look for a line starting with "DECISION:" or the first word
            const decisionMatch = output.match(/(?:DECISION|CHOICE|ROUTE|PATH):\s*(.+)/i);
            const decision = decisionMatch ? decisionMatch[1].trim() : output.split('\n')[0].trim();
            store.updateNodeData(nodeId, { decisionResult: decision });
            workflowContext.decisions[nodeId] = decision;
            cidLog('executeWorkflow:decision', { nodeId, label: nodeLabel, decision });

            // Find outgoing edges and skip paths that don't match the decision
            const outgoing = edges.filter(e => e.source === nodeId);
            for (const edge of outgoing) {
              const cond = edge.data?.condition as import('@/lib/types').EdgeCondition | undefined;
              if (cond && cond.type === 'decision-is') {
                const matches = decision.toLowerCase().includes(cond.value.toLowerCase());
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
            id: uid(), role: 'cid', timestamp: Date.now(),
            content: `Stage ${stageIdx}/${sortedLevels.length} complete. Hélas! ${stageErrors} node${stageErrors > 1 ? 's' : ''} failed. The investigation continues with caution...`,
          });
        } else if (stageNodes > 1) {
          store.addMessage({
            id: uid(), role: 'cid', timestamp: Date.now(),
            content: `Stage ${stageIdx}/${sortedLevels.length}: ${stageNodes} nodes executed successfully. Proceeding to the next stage...`,
          });
        }
      }
      // Rowan: silent execution, no stage reports — just gets it done
    }

    set({ executionProgress: null });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const parallelNote = sortedLevels.length < order.length ? ` (${sortedLevels.length} parallel stages)` : '';

    // Build per-node timing breakdown
    const currentNodes = get().nodes;
    const timingLines = order.map(id => {
      const n = currentNodes.find(x => x.id === id);
      if (!n) return null;
      const ms = n.data._executionDurationMs;
      const status = n.data.executionStatus;
      const icon = status === 'success' ? '✓' : status === 'error' ? '✗' : '○';
      const time = ms != null ? (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`) : '-';
      return `${icon} ${n.data.label}: ${time}`;
    }).filter(Boolean);

    // Build actionable next-step suggestions
    const nextSteps: string[] = [];
    const outputNodes = currentNodes.filter(n => n.data.category === 'output' && n.data.executionStatus === 'success');
    const reviewNodes = currentNodes.filter(n => n.data.category === 'review' && n.data.executionStatus === 'success');

    if (errorCount > 0) nextSteps.push('`retry failed` to re-run failed nodes');
    if (outputNodes.length > 0) nextSteps.push('Check output nodes for final deliverables');
    if (reviewNodes.length > 0) nextSteps.push('Review gate results before proceeding');
    if (errorCount === 0 && skippedCount === 0) nextSteps.push('`diff last run` to compare with previous execution');

    let msg: string;
    if (errorCount === 0 && skippedCount === 0) {
      msg = mode === 'poirot'
        ? `Magnifique! All **${order.length}** nodes executed flawlessly in ${elapsed}s${parallelNote}. The workflow, it purrs like a well-oiled machine.`
        : `Workflow complete. **${order.length}** nodes processed in ${elapsed}s${parallelNote}. All clear.`;
    } else {
      const parts = [`**${successCount}** succeeded`];
      if (errorCount > 0) parts.push(`**${errorCount}** failed (${failedNames.join(', ')})`);
      if (skippedCount > 0) parts.push(`**${skippedCount}** skipped (${skippedNames.join(', ')})`);
      msg = mode === 'poirot'
        ? `Execution finished in ${elapsed}s${parallelNote}. ${parts.join(', ')}. These culprits require investigation, mon ami.`
        : `Done in ${elapsed}s${parallelNote}. ${parts.join(', ')}.`;
    }
    if (timingLines.length > 0) {
      msg += '\n\n**Timing:**\n' + timingLines.map(l => `- ${l}`).join('\n');
    }
    if (nextSteps.length > 0) {
      msg += '\n\n**Next:** ' + nextSteps.join(' · ');
    }
    store.addMessage({ id: uid(), role: 'cid', content: msg, timestamp: Date.now() });
    cidLog('executeWorkflow:complete', { nodesProcessed: order.length, errors: errorCount, skipped: skippedCount, elapsed, parallelStages: sortedLevels.length });

    // Post-execution health check
    setTimeout(() => get().runHealthCheck(), 500);

    // Proactive post-execution suggestions
    setTimeout(() => {
      const s = get();
      const dismissed = s._dismissedSuggestionIds;
      const proactive = generateProactiveSuggestions(s.nodes, s.edges)
        .filter(ps => !dismissed.has(ps.id));
      const formatted = formatSuggestionsMessage(proactive, 'post-execution');
      if (formatted) {
        store.addMessage({ id: uid(), role: 'cid', content: formatted.content, timestamp: Date.now(), suggestions: formatted.suggestionChips });
        set({ _lastSuggestions: proactive });
      }
    }, 1500);
  },

  executeBranch: async (targetNodeId: string) => {
    const store = get();
    const { nodes, edges } = store;
    const targetNode = nodes.find(n => n.id === targetNodeId);
    if (!targetNode) return;

    // Get only the upstream subgraph for this node
    const subgraph = getUpstreamSubgraph(targetNodeId, nodes, edges);
    const { order } = topoSort(subgraph.nodes, subgraph.edges);

    // Skip already-executed nodes (cache hit)
    const toExecute = order.filter(id => {
      const n = store.nodes.find(x => x.id === id);
      return n && n.data.executionStatus !== 'success';
    });

    if (toExecute.length === 0) {
      store.addMessage({ id: uid(), role: 'cid', content: `All upstream nodes for "${targetNode.data.label}" are already executed.`, timestamp: Date.now(), _ephemeral: true });
      return;
    }

    cidLog('executeBranch', { target: targetNode.data.label, total: order.length, toExecute: toExecute.length });
    store.addMessage({ id: uid(), role: 'cid', content: `Running branch for "${targetNode.data.label}": ${toExecute.length} node(s) to execute...`, timestamp: Date.now(), _ephemeral: true });

    for (const nodeId of toExecute) {
      await store.executeNode(nodeId);
    }

    const elapsed = toExecute.map(id => {
      const n = get().nodes.find(x => x.id === id);
      return n?.data._executionDurationMs || 0;
    }).reduce((a, b) => a + b, 0);

    store.addMessage({
      id: uid(), role: 'cid', timestamp: Date.now(),
      content: `Branch execution complete for "${targetNode.data.label}". ${toExecute.length} node(s) in ${(elapsed / 1000).toFixed(1)}s.`,
    });
  },

  // Undo/Redo — operation-based (stores only changed nodes/edges, not full snapshots)
  history: [],
  future: [],

  pushHistory: () => {
    // Capture a "before" snapshot. A microtask will compute the diff after the mutation.
    const before = { nodes: structuredClone(get().nodes), edges: structuredClone(get().edges) };
    // Use queueMicrotask so the actual mutation happens first, then we diff
    queueMicrotask(() => {
      const after = get();
      const op = computeUndoOp(before.nodes, after.nodes, before.edges, after.edges);
      if (!op) return; // no changes detected
      set((s) => ({
        history: [...s.history.slice(-(MAX_HISTORY - 1)), op],
        future: [],
      }));
    });
  },

  undo: () => {
    const s = get();
    if (s.history.length === 0) return;
    const op = s.history[s.history.length - 1];
    const result = applyUndo(op, s.nodes, s.edges);
    set({
      nodes: result.nodes,
      edges: result.edges,
      history: s.history.slice(0, -1),
      future: [op, ...s.future],
    });
    saveToStorage({ nodes: result.nodes, edges: result.edges, events: s.events, messages: s.messages });
    // Sync nodeCounter to restored nodes to prevent ID collisions
    const maxUndoId = result.nodes.reduce((max, n) => {
      const num = parseInt(n.id.replace('node-', ''), 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    nodeCounter = Math.max(maxUndoId + 1, 100);
    // Build descriptive toast
    const parts: string[] = [];
    if (op.createdNodeIds.length > 0) parts.push(`-${op.createdNodeIds.length} node${op.createdNodeIds.length > 1 ? 's' : ''}`);
    if (op.deletedNodeIds.length > 0) parts.push(`+${op.deletedNodeIds.length} node${op.deletedNodeIds.length > 1 ? 's' : ''}`);
    const modifiedNodes = [...op.beforeNodes.keys()].filter(id => !op.deletedNodeIds.includes(id));
    if (modifiedNodes.length > 0) parts.push(`${modifiedNodes.length} node${modifiedNodes.length > 1 ? 's' : ''} reverted`);
    if (op.createdEdgeIds.length > 0) parts.push(`-${op.createdEdgeIds.length} edge${op.createdEdgeIds.length > 1 ? 's' : ''}`);
    if (op.deletedEdgeIds.length > 0) parts.push(`+${op.deletedEdgeIds.length} edge${op.deletedEdgeIds.length > 1 ? 's' : ''}`);
    s.addToast(`Undo${parts.length ? ': ' + parts.join(', ') : ''}`, 'info');
  },

  redo: () => {
    const s = get();
    if (s.future.length === 0) return;
    const op = s.future[0];
    const result = applyRedo(op, s.nodes, s.edges);
    set({
      nodes: result.nodes,
      edges: result.edges,
      future: s.future.slice(1),
      history: [...s.history, op],
    });
    saveToStorage({ nodes: result.nodes, edges: result.edges, events: s.events, messages: s.messages });
    // Sync nodeCounter to restored nodes to prevent ID collisions
    const maxRedoId = result.nodes.reduce((max, n) => {
      const num = parseInt(n.id.replace('node-', ''), 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    nodeCounter = Math.max(maxRedoId + 1, 100);
    const parts: string[] = [];
    if (op.createdNodeIds.length > 0) parts.push(`+${op.createdNodeIds.length} node${op.createdNodeIds.length > 1 ? 's' : ''}`);
    if (op.deletedNodeIds.length > 0) parts.push(`-${op.deletedNodeIds.length} node${op.deletedNodeIds.length > 1 ? 's' : ''}`);
    const modifiedNodes = [...op.afterNodes.keys()].filter(id => !op.createdNodeIds.includes(id));
    if (modifiedNodes.length > 0) parts.push(`${modifiedNodes.length} node${modifiedNodes.length > 1 ? 's' : ''} updated`);
    if (op.createdEdgeIds.length > 0) parts.push(`+${op.createdEdgeIds.length} edge${op.createdEdgeIds.length > 1 ? 's' : ''}`);
    if (op.deletedEdgeIds.length > 0) parts.push(`-${op.deletedEdgeIds.length} edge${op.deletedEdgeIds.length > 1 ? 's' : ''}`);
    s.addToast(`Redo${parts.length ? ': ' + parts.join(', ') : ''}`, 'info');
  },

  // Context menu
  contextMenu: null,
  // contextMenu, openContextMenu, closeContextMenu — from UISlice

  setNodes: (nodesOrFn) =>
    set((s) => {
      const nodes = typeof nodesOrFn === 'function' ? nodesOrFn(s.nodes) : nodesOrFn;
      saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
      return { nodes };
    }),

  setEdges: (edgesOrFn) =>
    set((s) => {
      const edges = typeof edgesOrFn === 'function' ? edgesOrFn(s.edges) : edgesOrFn;
      saveToStorage({ nodes: s.nodes, edges, events: s.events, messages: s.messages });
      return { edges };
    }),

  // selectNode, multiSelectedIds, toggleMultiSelect, clearMultiSelect — from UISlice
  deleteMultiSelected: () => {
    const store = get();
    const ids = store.multiSelectedIds;
    if (ids.size === 0) return 0;
    store.pushHistory();
    const count = ids.size;
    set((s) => {
      const nodeSet = new Set(ids);
      const nodes = s.nodes.filter(n => !nodeSet.has(n.id));
      const edges = s.edges.filter(e => !nodeSet.has(e.source) && !nodeSet.has(e.target));
      saveToStorage({ nodes, edges, events: s.events, messages: s.messages });
      return { nodes, edges, selectedNodeId: null, multiSelectedIds: new Set() };
    });
    store.addEvent({
      id: `ev-${Date.now()}`, type: 'edited' as const,
      message: `Deleted ${count} nodes`,
      timestamp: Date.now(), agent: false,
    });
    return count;
  },

  // toggleCIDPanel, togglePreviewPanel — from UISlice

  addEvent: (event) =>
    set((s) => {
      const events = [event, ...s.events].slice(0, 50);
      saveToStorage({ nodes: s.nodes, edges: s.edges, events, messages: s.messages });
      return { events };
    }),

  addMessage: (message) =>
    set((s) => {
      const messages = [...s.messages, message];
      saveToStorage({ nodes: s.nodes, edges: s.edges, events: s.events, messages });
      return { messages };
    }),

  updateStreamingMessage: (id, content) =>
    set((s) => {
      const messages = s.messages.map((m) => m.id === id ? { ...m, content } : m);
      // Only persist at key intervals to avoid thrashing localStorage during streaming
      if (content.split(' ').length % 10 === 0) {
        saveToStorage({ nodes: s.nodes, edges: s.edges, events: s.events, messages });
      }
      return { messages };
    }),

  addNode: (node) =>
    set((s) => {
      // Prevent duplicate IDs
      if (s.nodes.some(n => n.id === node.id)) return {};
      const nodes = [...s.nodes, node];
      saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
      return { nodes };
    }),

  addEdge: (edge) =>
    set((s) => {
      // Deduplicate by ID — replace existing edge if same ID, else append
      const existing = s.edges.findIndex(e => e.id === edge.id);
      const edges = existing >= 0
        ? s.edges.map((e, i) => i === existing ? edge : e)
        : [...s.edges, edge];
      saveToStorage({ nodes: s.nodes, edges, events: s.events, messages: s.messages });
      return { edges };
    }),

  createNewNode: (category) => {
    const store = get();
    store.pushHistory();
    // Place near center of existing nodes or at a default position
    const avgX = store.nodes.length > 0 ? store.nodes.reduce((s, n) => s + n.position.x, 0) / store.nodes.length : 400;
    const avgY = store.nodes.length > 0 ? store.nodes.reduce((s, n) => s + n.position.y, 0) / store.nodes.length : 300;
    const desired = { x: avgX, y: avgY + 180 };
    const position = findFreePosition(desired, store.nodes.map(n => n.position));
    const id = uid();
    const node: Node<NodeData> = {
      id,
      type: 'lifecycleNode',
      position,
      data: {
        label: CATEGORY_LABELS[category] ?? (category.charAt(0).toUpperCase() + category.slice(1)),
        category,
        status: 'active',
        description: '',
        version: 1,
        lastUpdated: Date.now(),
      },
    };
    store.addNode(node);
    store.addEvent({
      id: `ev-${Date.now()}`, type: 'created',
      message: `Created new ${category} node: ${CATEGORY_LABELS[category] ?? category}`,
      timestamp: Date.now(), nodeId: id,
    });
    set({ selectedNodeId: id });

    // Suggest auto-connect via interactive cards (only when 2+ nodes exist)
    if (store.nodes.length >= 2) {
      // Defer to next tick so the node is fully in state
      setTimeout(() => get().suggestAutoConnect(id), 0);
    }
  },

  duplicateNode: (id) => {
    const store = get();
    const source = store.nodes.find((n) => n.id === id);
    if (!source) return;
    store.pushHistory();
    const newId = uid();
    const desired = { x: source.position.x + NODE_W, y: source.position.y };
    const position = findFreePosition(desired, store.nodes.map(n => n.position));
    const node: Node<NodeData> = {
      id: newId,
      type: 'lifecycleNode',
      position,
      data: { ...source.data, label: `${source.data.label} (copy)`, version: 1, lastUpdated: Date.now() },
    };
    store.addNode(node);
    store.addEvent({
      id: `ev-${Date.now()}`, type: 'created',
      message: `Duplicated ${source.data.label}`,
      timestamp: Date.now(), nodeId: newId,
    });
    set({ selectedNodeId: newId });
  },

  updateNodeStatus: (id, status) =>
    set((s) => {
      let nodes = s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, status, locked: status === 'locked' ? true : status === 'active' ? false : n.data.locked } } : n));

      // Cascade staleness: if a node goes stale, mark all downstream dependents stale too
      // Locked nodes are protected — staleness stops at them (spec Section 18)
      if (status === 'stale') {
        const downstream = new Set<string>();
        const visited = new Set<string>([id]);
        const queue = [id];
        while (queue.length > 0) {
          const current = queue.shift()!;
          for (const edge of s.edges) {
            if (edge.source === current && !visited.has(edge.target)) {
              visited.add(edge.target);
              const targetNode = nodes.find(n => n.id === edge.target);
              // Locked nodes are protected from becoming stale themselves,
              // but we still traverse THROUGH them so their downstream gets notified
              if (!targetNode?.data.locked) {
                downstream.add(edge.target);
              }
              queue.push(edge.target); // always continue BFS through locked nodes
            }
          }
        }
        if (downstream.size > 0) {
          // Mark downstream nodes stale — any non-locked, non-stale status should become stale
          // (active, reviewing, pending, generating all go stale when upstream changes)
          const staleableStatuses = new Set(['active', 'reviewing', 'pending', 'generating']);
          const affected = nodes.filter(n => downstream.has(n.id) && staleableStatuses.has(n.data.status));
          if (affected.length > 0) {
            nodes = nodes.map((n) =>
              downstream.has(n.id) && staleableStatuses.has(n.data.status)
                ? { ...n, data: { ...n.data, status: 'stale' as const } }
                : n
            );
            // Alert user about cascade via CID message
            const srcLabel = s.nodes.find(n => n.id === id)?.data.label ?? id;
            const names = affected.map(n => n.data.label).slice(0, 5);
            const mode = s.cidMode ?? 'rowan';
            const alert = mode === 'poirot'
              ? `🔍 Interesting — marking **${srcLabel}** stale has cascaded to ${affected.length} downstream node${affected.length > 1 ? 's' : ''}: ${names.join(', ')}${affected.length > 5 ? '...' : ''}. The evidence of decay spreads, mon ami.`
              : `⚡ Cascade: **${srcLabel}** → ${affected.length} downstream node${affected.length > 1 ? 's' : ''} now stale (${names.join(', ')}${affected.length > 5 ? '...' : ''}). Run \`propagate\` to sync.`;
            setTimeout(() => get().addMessage({ id: uid(), role: 'cid', content: alert, timestamp: Date.now() }), 300);
          }
        }
      }

      saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
      return { nodes };
    }),

  updateNodeData: (id, partial) => {
    // Mutex guard: block non-execution mutations on locked nodes
    if (get()._executingNodeIds.has(id)) {
      const executionKeys = new Set(['executionResult', 'executionStatus', 'executionError', '_executionDurationMs', '_executionStartedAt', 'apiKey', '_versionHistory', 'version', '_validationWarnings']);
      const isExecutionUpdate = Object.keys(partial).every(k => executionKeys.has(k));
      if (!isExecutionUpdate) {
        cidLog('updateNodeData:blocked', { id, reason: 'node is executing', keys: Object.keys(partial) });
        return;
      }
    }

    // Classify the edit to determine propagation behavior
    const currentNode = get().nodes.find(n => n.id === id);
    const edit = classifyEdit(
      currentNode?.data.content || '',
      partial.content,
      currentNode?.data.label || '',
      partial.label,
      currentNode?.data.category || '',
      partial.category,
    );

    set((s) => {
      const nodes = s.nodes.map((n) => {
        if (n.id !== id) return n;
        const updated = { ...n.data, ...partial, lastUpdated: Date.now() };

        // Version snapshot: save current content before overwriting on semantic/structural edits
        if ((edit.type === 'semantic' || edit.type === 'structural') && n.data.content) {
          const history = [...(n.data._versionHistory || [])];
          const currentVersion = n.data.version ?? 1;
          history.push({
            version: currentVersion,
            content: n.data.content,
            timestamp: Date.now(),
            trigger: 'user-edit' as const,
          });
          // Cap at 10 versions
          if (history.length > 10) history.splice(0, history.length - 10);
          updated._versionHistory = history;
          updated.version = currentVersion + 1;
        }

        return { ...n, data: updated };
      });
      saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
      return { nodes };
    });

    // Central Brain: detect override on CID-managed artifacts (skip when it's a sync update from CID)
    const isSyncUpdate = partial.artifactContract?.syncStatus === 'current' && partial.status === 'active';
    if ((edit.type === 'semantic' || edit.type === 'structural') && currentNode?.data.artifactContract && partial.content && !isSyncUpdate) {
      get().recordOverride(id, 'content', currentNode.data.content || '', partial.content);
      cidLog('updateNodeData:override-detected', { id, label: currentNode.data.label });
    }

    // Only propagate for semantic and structural edits (not cosmetic or local)
    // Skip propagation when this is a Central Brain sync (artifactContract update with status: 'active')
    const isCentralBrainSync = partial.artifactContract?.syncStatus === 'current' && partial.status === 'active';
    if (edit.shouldPropagate && !get()._executingNodeIds.has(id) && !isCentralBrainSync) {
      get().updateNodeStatus(id, 'stale');
      get().addEvent({
        id: `ev-${Date.now()}-${id}`, type: 'edited',
        message: `${currentNode?.data.label ?? id}: ${edit.type} edit — ${edit.reason}`,
        timestamp: Date.now(), nodeId: id,
      });
      cidLog('updateNodeData:propagate', { id, editType: edit.type, reason: edit.reason });

      // Note implicit dependency: when a note is semantically edited, find nodes
      // that reference the note's label in their content and mark them stale too
      // (even without explicit edges — notes influence by reference)
      if (currentNode?.data.category === 'note' && currentNode.data.label) {
        const noteLabel = currentNode.data.label.toLowerCase();
        const state = get();
        const hasEdgeFrom = new Set(state.edges.filter(e => e.source === id).map(e => e.target));
        const referencingNodes = state.nodes.filter(n =>
          n.id !== id &&
          !hasEdgeFrom.has(n.id) && // skip nodes already connected via edge (handled by BFS)
          !n.data.locked &&
          n.data.status === 'active' &&
          n.data.content?.toLowerCase().includes(noteLabel)
        );
        for (const refNode of referencingNodes) {
          get().updateNodeStatus(refNode.id, 'stale');
          cidLog('updateNodeData:note-implicit', { noteId: id, noteLabel: currentNode.data.label, refNodeId: refNode.id, refLabel: refNode.data.label });
        }
      }
    } else if (edit.type === 'local') {
      // Local edits: record but don't propagate
      get().addEvent({
        id: `ev-${Date.now()}-${id}`, type: 'edited',
        message: `${currentNode?.data.label ?? id}: minor edit — ${edit.reason}`,
        timestamp: Date.now(), nodeId: id,
      });
    }
    // Cosmetic edits: no event, no propagation — silent save
  },

  deleteNode: (id) => {
    const store = get();
    // Prevent deleting a node that is currently being executed
    if (store._executingNodeIds.has(id)) {
      store.addToast('Cannot delete node while it is executing', 'error');
      return;
    }
    store.pushHistory();
    set((s) => {
      const deletedNode = s.nodes.find((n) => n.id === id);
      const nodes = s.nodes.filter((n) => n.id !== id);
      const edges = s.edges.filter((e) => e.source !== id && e.target !== id);
      const events = [
        { id: `ev-${Date.now()}`, type: 'edited' as const, message: `Deleted node: ${deletedNode?.data.label ?? id}`, timestamp: Date.now() },
        ...s.events,
      ].slice(0, 50);
      const selectedNodeId = s.selectedNodeId === id ? null : s.selectedNodeId;
      saveToStorage({ nodes, edges, events, messages: s.messages });
      return { nodes, edges, events, selectedNodeId };
    });
  },

  deleteEdge: (id) => {
    get().pushHistory();
    set((s) => {
      const edges = s.edges.filter((e) => e.id !== id);
      saveToStorage({ nodes: s.nodes, edges, events: s.events, messages: s.messages });
      return { edges };
    });
  },

  onConnect: (connection) => {
    const store = get();
    if (!connection.source || !connection.target) return;
    // Prevent self-loops
    if (connection.source === connection.target) return;
    // Prevent cycles: check if adding this edge would create a cycle
    const proposedEdges = [
      ...store.edges.map(e => ({ source: e.source, target: e.target, label: typeof e.label === 'string' ? e.label : undefined })),
      { source: connection.source, target: connection.target },
    ];
    const { hasCycle } = detectCycle(store.nodes, proposedEdges, { excludeLabels: [] });
    if (hasCycle) {
      store.addToast('Cannot connect: this would create a cycle in the workflow', 'warning');
      return;
    }
    store.pushHistory();
    set((s) => {
      const exists = s.edges.some(
        (e) => e.source === connection.source && e.target === connection.target
      );
      if (exists) return s;
      const sourceNode = s.nodes.find((n) => n.id === connection.source);
      const targetNode = s.nodes.find((n) => n.id === connection.target);
      // Auto-infer edge label from source→target category pair
      const label = inferEdgeLabel(sourceNode?.data.category, targetNode?.data.category);
      const newEdge: Edge = createStyledEdge(connection.source, connection.target, label);
      const edges = [...s.edges, newEdge];
      const events = [
        { id: `ev-${Date.now()}`, type: 'created' as const, message: `Connected ${sourceNode?.data.label ?? connection.source} → ${targetNode?.data.label ?? connection.target} (${label})`, timestamp: Date.now() },
        ...s.events,
      ].slice(0, 50);
      saveToStorage({ nodes: s.nodes, edges, events, messages: s.messages });
      return { edges, events };
    });
  },

  setProcessing: (v) => set({ isProcessing: v }),

  lockNode: (id) =>
    set((s) => {
      const nodes = s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, locked: true, status: 'locked' as const } } : n
      );
      const events = [
        { id: uid(), type: 'locked' as const, message: `${s.nodes.find((n) => n.id === id)?.data.label} locked by user`, timestamp: Date.now(), nodeId: id },
        ...s.events,
      ];
      saveToStorage({ nodes, edges: s.edges, events, messages: s.messages });
      return { nodes, events };
    }),

  approveNode: (id) =>
    set((s) => {
      const nodes = s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, status: 'active' as const } } : n
      );
      const events = [
        { id: uid(), type: 'approved' as const, message: `${s.nodes.find((n) => n.id === id)?.data.label} approved`, timestamp: Date.now(), nodeId: id },
        ...s.events,
      ];
      saveToStorage({ nodes, edges: s.edges, events, messages: s.messages });
      return { nodes, events };
    }),

  // Functional CID action: propagate stale nodes
  propagateStale: async () => {
    const store = get();
    const staleNodes = store.nodes.filter((n) => n.data.status === 'stale');
    cidLog('propagateStale', { staleCount: staleNodes.length });
    if (staleNodes.length === 0) {
      store.addMessage({ id: uid(), role: 'cid', content: 'All nodes are up to date. Nothing to refresh.', timestamp: Date.now(), _ephemeral: true });
      return;
    }

    store.pushHistory();
    const staleIds = new Set(staleNodes.map(n => n.id));
    const mode = get().cidMode ?? 'rowan';

    // Topologically sort stale nodes so upstream refreshes before downstream
    const { order } = topoSort(store.nodes, store.edges);
    const staleOrder = order.filter(id => staleIds.has(id));

    const names = staleNodes.map(n => n.data.label).slice(0, 6);
    const startMsg = mode === 'poirot'
      ? `Refreshing ${staleNodes.length} stale node${staleNodes.length > 1 ? 's' : ''}: ${names.join(', ')}${staleNodes.length > 6 ? '...' : ''}. Let us see what the evidence reveals after these changes, mon ami.`
      : `Refreshing ${staleNodes.length} stale node${staleNodes.length > 1 ? 's' : ''}: ${names.join(', ')}${staleNodes.length > 6 ? '...' : ''}.`;
    store.addMessage({ id: uid(), role: 'cid', content: startMsg, timestamp: Date.now() });

    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    for (const nodeId of staleOrder) {
      // Re-check: node might have been refreshed by a prior execution in this loop
      const current = get().nodes.find(n => n.id === nodeId);
      if (!current || current.data.status !== 'stale') continue;

      await store.executeNode(nodeId);
      const updated = get().nodes.find(n => n.id === nodeId);
      if (updated?.data.executionStatus === 'error') {
        errorCount++;
      } else {
        successCount++;
        // Mark as active after successful re-execution
        store.updateNodeStatus(nodeId, 'active');
        store.addEvent({
          id: `ev-${Date.now()}-${nodeId}`, type: 'regenerated',
          message: `${updated?.data.label} refreshed to v${(updated?.data.version ?? 1) + 1}`,
          timestamp: Date.now(), nodeId, agent: true,
        });
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const doneMsg = errorCount === 0
      ? (mode === 'poirot'
        ? `Magnifique! All ${successCount} node${successCount > 1 ? 's' : ''} refreshed in ${elapsed}s. The lifecycle, it flows again.`
        : `Done. ${successCount} node${successCount > 1 ? 's' : ''} refreshed in ${elapsed}s.`)
      : (mode === 'poirot'
        ? `${successCount} refreshed, ${errorCount} failed in ${elapsed}s. These failures require investigation.`
        : `${successCount} refreshed, ${errorCount} failed in ${elapsed}s.`);
    store.addMessage({ id: uid(), role: 'cid', content: doneMsg, timestamp: Date.now() });
    // Hide impact preview after regeneration
    set({ impactPreview: null });
    // Post-propagation health check
    setTimeout(() => get().runHealthCheck(), 500);
  },

  // ── Impact Preview ──
  impactPreview: null,

  showImpactPreview: () => {
    const store = get();
    const staleNodes = store.nodes
      .filter((n) => n.data.status === 'stale')
      .map((n) => ({ id: n.id, label: n.data.label, category: n.data.category }));
    if (staleNodes.length === 0) return;

    // Build topological execution order for stale nodes
    const { order } = topoSort(store.nodes, store.edges);
    const staleIds = new Set(staleNodes.map(n => n.id));
    const executionOrder = order.filter(id => staleIds.has(id));

    set({
      impactPreview: {
        visible: true,
        staleNodes,
        executionOrder,
        estimatedCalls: staleNodes.length,
        selectedNodeIds: new Set(staleNodes.map(n => n.id)),
      },
    });
  },

  hideImpactPreview: () => {
    set({ impactPreview: null });
  },

  toggleImpactNodeSelection: (nodeId: string) => {
    const preview = get().impactPreview;
    if (!preview) return;
    const next = new Set(preview.selectedNodeIds);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    set({ impactPreview: { ...preview, selectedNodeIds: next, estimatedCalls: next.size } });
  },

  selectAllImpactNodes: () => {
    const preview = get().impactPreview;
    if (!preview) return;
    const all = new Set(preview.staleNodes.map(n => n.id));
    set({ impactPreview: { ...preview, selectedNodeIds: all, estimatedCalls: all.size } });
  },

  deselectAllImpactNodes: () => {
    const preview = get().impactPreview;
    if (!preview) return;
    set({ impactPreview: { ...preview, selectedNodeIds: new Set<string>(), estimatedCalls: 0 } });
  },

  regenerateSelected: async (nodeIds?: string[]) => {
    const store = get();
    const preview = store.impactPreview;
    const idsToRegenerate = nodeIds ?? (preview ? [...preview.selectedNodeIds] : []);
    if (idsToRegenerate.length === 0) return;

    // Hide preview
    set({ impactPreview: null });

    store.pushHistory();
    const mode = get().cidMode ?? 'rowan';
    const { order } = topoSort(store.nodes, store.edges);
    const idSet = new Set(idsToRegenerate);
    const sortedIds = order.filter(id => idSet.has(id));

    const names = sortedIds.map(id => store.nodes.find(n => n.id === id)?.data.label).filter(Boolean).slice(0, 6);
    const startMsg = mode === 'poirot'
      ? `Regenerating ${sortedIds.length} selected node${sortedIds.length > 1 ? 's' : ''}: ${names.join(', ')}${sortedIds.length > 6 ? '...' : ''}. Observe closely, mon ami.`
      : `Regenerating ${sortedIds.length} selected node${sortedIds.length > 1 ? 's' : ''}: ${names.join(', ')}${sortedIds.length > 6 ? '...' : ''}.`;
    store.addMessage({ id: uid(), role: 'cid', content: startMsg, timestamp: Date.now() });

    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    for (const nodeId of sortedIds) {
      const current = get().nodes.find(n => n.id === nodeId);
      if (!current || current.data.status !== 'stale') continue;

      await store.executeNode(nodeId);
      const updated = get().nodes.find(n => n.id === nodeId);
      if (updated?.data.executionStatus === 'error') {
        errorCount++;
      } else {
        successCount++;
        store.updateNodeStatus(nodeId, 'active');
        store.addEvent({
          id: `ev-${Date.now()}-${nodeId}`, type: 'regenerated',
          message: `${updated?.data.label} selectively refreshed`,
          timestamp: Date.now(), nodeId, agent: true,
        });
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const doneMsg = errorCount === 0
      ? `${successCount} node${successCount > 1 ? 's' : ''} regenerated in ${elapsed}s.`
      : `${successCount} regenerated, ${errorCount} failed in ${elapsed}s.`;
    store.addMessage({ id: uid(), role: 'cid', content: doneMsg, timestamp: Date.now() });
  },

  // ── Workflow Health Monitor ──
  _lastHealthFingerprint: '',

  runHealthCheck: (silent = false) => {
    const store = get();
    const { nodes, edges } = store;
    if (nodes.length === 0) return;

    const report = assessWorkflowHealth(nodes, edges);
    const fingerprint = issueFingerprint(report.issues);

    // Only surface new issues (avoid spam)
    if (!silent && fingerprint !== store._lastHealthFingerprint && report.issues.length > 0) {
      // Pick top 1-2 high-priority issues to surface
      const highIssues = report.issues.filter(i => i.priority === 'high').slice(0, 2);
      const toSurface = highIssues.length > 0 ? highIssues : report.issues.slice(0, 1);

      if (toSurface.length > 0) {
        const mode = store.cidMode ?? 'rowan';
        const issueSummary = toSurface.map(i => i.message).join('. ');
        const suggestion = report.suggestions[0];
        const msg = mode === 'poirot'
          ? `🔍 The little grey cells detect: ${issueSummary}.${suggestion ? ` Perhaps: ${suggestion.message}.` : ''}`
          : `⚠ ${issueSummary}.${suggestion ? ` Suggestion: ${suggestion.message}.` : ''}`;
        store.addMessage({ id: uid(), role: 'cid', content: msg, timestamp: Date.now(), _ephemeral: true });
      }
    }

    set({ _lastHealthFingerprint: fingerprint });
  },

  // ── Proactive Suggestions ──
  _lastSuggestions: [],
  _dismissedSuggestionIds: new Set<string>(),

  applySuggestion: (suggestionId: string) => {
    const store = get();
    const suggestion = store._lastSuggestions.find(s => s.id === suggestionId);
    if (!suggestion) return;

    if (suggestion.actionType === 'add-node') {
      const { label, category, connectAfter } = suggestion.actionPayload;
      const afterNode = store.nodes.find(n => n.data.label === connectAfter);
      const desired = afterNode
        ? { x: afterNode.position.x + 300, y: afterNode.position.y }
        : { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 };
      const pos = findFreePosition(desired, store.nodes.map(n => n.position));
      const newId = uid();
      const newNode: Node<NodeData> = {
        id: newId,
        type: 'lifecycleNode',
        position: pos,
        data: {
          label,
          category: category as NodeCategory,
          status: 'active',
          description: `${label} node`,
          version: 1,
        },
      };
      const newEdges = [...store.edges];
      if (afterNode) {
        newEdges.push(createStyledEdge(afterNode.id, newId, inferEdgeLabel(afterNode.data.category, category as NodeCategory)));
      }
      store.pushHistory();
      const newNodes = [...store.nodes, newNode];
      saveToStorage({ nodes: newNodes, edges: newEdges, events: store.events, messages: store.messages });
      set({ nodes: newNodes, edges: newEdges });
      store.addEvent({ id: uid(), type: 'created', message: `Created "${label}" (${category}) from suggestion`, timestamp: Date.now(), nodeId: newId, agent: true });
      store.addMessage({ id: uid(), role: 'cid', content: `Created **${label}** (${category})${afterNode ? ` connected after "${afterNode.data.label}"` : ''}.`, timestamp: Date.now(), _ephemeral: true });
    } else if (suggestion.actionType === 'add-edge') {
      const { from, to, label } = suggestion.actionPayload;
      const srcNode = store.nodes.find(n => n.data.label === from);
      const tgtNode = store.nodes.find(n => n.data.label === to);
      if (srcNode && tgtNode) {
        store.pushHistory();
        const newEdge = createStyledEdge(srcNode.id, tgtNode.id, label || 'connects');
        const newEdges = [...store.edges, newEdge];
        saveToStorage({ nodes: store.nodes, edges: newEdges, events: store.events, messages: store.messages });
        set({ edges: newEdges });
        store.addMessage({ id: uid(), role: 'cid', content: `Connected **${from}** → **${to}**.`, timestamp: Date.now(), _ephemeral: true });
      }
    } else if (suggestion.actionType === 'command') {
      // Execute as a CID chat command
      const { command } = suggestion.actionPayload;
      if (command) {
        store.chatWithCID(command);
      }
    }

    // Remove this suggestion from the list
    set(s => ({ _lastSuggestions: s._lastSuggestions.filter(x => x.id !== suggestionId) }));
  },

  dismissSuggestion: (suggestionId: string) => {
    set(s => ({
      _dismissedSuggestionIds: new Set([...s._dismissedSuggestionIds, suggestionId]),
      _lastSuggestions: s._lastSuggestions.filter(x => x.id !== suggestionId),
    }));
  },

  // ── Smart Auto-Connect Suggestions ──
  suggestAutoConnect: (nodeId: string) => {
    const store = get();
    const newNode = store.nodes.find(n => n.id === nodeId);
    if (!newNode) return;

    const category = newNode.data.category;
    const otherNodes = store.nodes.filter(n => n.id !== nodeId);
    if (otherNodes.length === 0) return;

    // Score each candidate connection
    type Candidate = { node: Node<NodeData>; srcId: string; tgtId: string; label: string; score: number };
    const candidates: Candidate[] = [];

    for (const other of otherNodes) {
      // Try both directions
      const fwdLabel = inferEdgeLabel(other.data.category, category);
      const revLabel = inferEdgeLabel(category, other.data.category);
      const fwdScore = fwdLabel !== 'connects' ? 2 : 0;
      const revScore = revLabel !== 'connects' ? 2 : 0;

      // Prefer leaf nodes (no outgoing edges) as sources
      const isLeaf = !store.edges.some(e => e.source === other.id);
      const leafBonus = isLeaf ? 1 : 0;

      // Prefer orphan nodes (no edges at all) — connecting them is high value
      const isOrphan = !store.edges.some(e => e.source === other.id || e.target === other.id);
      const orphanBonus = isOrphan ? 1 : 0;

      // Already connected to this node? skip
      const alreadyConnected = store.edges.some(
        e => (e.source === other.id && e.target === nodeId) || (e.source === nodeId && e.target === other.id)
      );
      if (alreadyConnected) continue;

      // Pick the best direction
      if (fwdScore >= revScore && fwdScore > 0) {
        // other → newNode
        candidates.push({ node: other, srcId: other.id, tgtId: nodeId, label: fwdLabel, score: fwdScore + leafBonus + orphanBonus });
      } else if (revScore > 0) {
        // newNode → other
        candidates.push({ node: other, srcId: nodeId, tgtId: other.id, label: revLabel, score: revScore + orphanBonus });
      }
    }

    // Sort by score descending, take top 2
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, 2);

    if (top.length === 0) {
      // No good matches — just inform
      if (store.showCIDPanel) {
        const ag = getAgent(store.cidMode);
        const existingNames = otherNodes.map(n => n.data.label).slice(0, 5);
        const msg = ag.accent === 'amber'
          ? `A new node appears — **${newNode.data.label}**. I could not determine a logical connection. Perhaps it relates to: ${existingNames.join(', ')}?`
          : `New node: **${newNode.data.label}**. No auto-connection inferred. Drag handles to connect or use \`connect\`.`;
        store.addMessage({ id: `msg-${Date.now()}-suggest`, role: 'cid', content: msg, timestamp: Date.now() });
      }
      return;
    }

    // Build suggestion cards and ProactiveSuggestion entries
    const suggestions: ProactiveSuggestion[] = [];
    const chipLabels: string[] = [];
    const lines: string[] = [];
    const ag = getAgent(store.cidMode);

    const intro = ag.accent === 'amber'
      ? `Ah, a new node — **${newNode.data.label}**. I see ${top.length === 1 ? 'a possible connection' : 'possible connections'}:`
      : `New node: **${newNode.data.label}**. Suggested connection${top.length > 1 ? 's' : ''}:`;
    lines.push(intro);

    for (let i = 0; i < top.length; i++) {
      const c = top[i];
      const srcNode = store.nodes.find(n => n.id === c.srcId)!;
      const tgtNode = store.nodes.find(n => n.id === c.tgtId)!;
      const suggId = `autoconnect-${nodeId}-${i}`;
      const chipLabel = `Connect: ${srcNode.data.label} → ${tgtNode.data.label}`;

      lines.push(`- **${srcNode.data.label}** —[${c.label}]→ **${tgtNode.data.label}**`);
      chipLabels.push(`${suggId}|${chipLabel}`);

      suggestions.push({
        id: suggId,
        priority: 'medium' as const,
        message: `${srcNode.data.label} → ${tgtNode.data.label} (${c.label})`,
        chipLabel,
        actionType: 'add-edge',
        actionPayload: { from: srcNode.data.label, to: tgtNode.data.label, label: c.label },
      });
    }

    // Register suggestions so applySuggestion can handle clicks
    set(s => ({ _lastSuggestions: [...s._lastSuggestions, ...suggestions] }));

    // Post CID message with clickable suggestion chips
    if (store.showCIDPanel) {
      store.addMessage({
        id: `msg-${Date.now()}-autoconnect`,
        role: 'cid',
        content: lines.join('\n'),
        timestamp: Date.now(),
        suggestions: chipLabels,
      });
    }
  },

  // ── Workflow Optimization ──
  _lastOptimizations: [],

  analyzeOptimizations: () => {
    const store = get();
    const { nodes, edges } = store;
    const agent = getAgent(store.cidMode);
    const opts = analyzeGraphForOptimization(nodes, edges);
    set({ _lastOptimizations: opts });

    if (opts.length === 0) {
      store.addMessage({
        id: uid(), role: 'cid',
        content: store.cidMode === 'poirot'
          ? 'I have examined every corner of this workflow, mon ami. The structure, it is already quite optimal — no redundancies, no bottlenecks.'
          : 'Workflow structure looks clean — no duplicates, bottlenecks, or disconnected chains found.',
        timestamp: Date.now(),
      });
      // Still do layout optimization
      if (nodes.length > 2) store.optimizeLayout();
      return;
    }

    const formatted = formatOptimizations(opts);
    if (formatted) {
      store.addMessage({
        id: uid(), role: 'cid',
        content: formatted.content,
        timestamp: Date.now(),
        suggestions: formatted.suggestionChips,
      });
    }
  },

  applyOptimization: (optimizationId: string) => {
    const store = get();
    // Strip the "opt-" prefix added by formatOptimizations
    const cleanId = optimizationId.startsWith('opt-') ? optimizationId.slice(4) : optimizationId;
    const opt = store._lastOptimizations.find(o => o.id === cleanId);
    if (!opt) {
      cidLog('applyOptimization', `optimization not found: ${optimizationId}`);
      return;
    }

    if (opt.type === 'duplicate-nodes' && opt.mergeTargets) {
      const [keepId, removeId] = opt.mergeTargets;
      const keepNode = store.nodes.find(n => n.id === keepId);
      const removeNode = store.nodes.find(n => n.id === removeId);
      if (!keepNode || !removeNode) return;

      // Use existing mergeByName logic pattern
      store.pushHistory();
      const mergedContent = [keepNode.data.content, removeNode.data.content].filter(Boolean).join('\n\n---\n\n');
      const mergedDesc = [keepNode.data.description, removeNode.data.description].filter(Boolean).join(' | ');

      store.updateNodeData(keepId, {
        description: mergedDesc || undefined,
        content: mergedContent || undefined,
        version: (keepNode.data.version ?? 1) + 1,
      });

      // Re-link edges
      const updatedEdges = store.edges.map(e => {
        if (e.source === removeId && e.target !== keepId) return { ...e, id: `e-${keepId}-${e.target}`, source: keepId };
        if (e.target === removeId && e.source !== keepId) return { ...e, id: `e-${e.source}-${keepId}`, target: keepId };
        return e;
      }).filter(e => !(e.source === removeId || e.target === removeId));

      // Dedup edges
      const seen = new Set<string>();
      const dedupEdges = updatedEdges.filter(e => {
        const key = `${e.source}-${e.target}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const newNodes = store.nodes.filter(n => n.id !== removeId);
      saveToStorage({ nodes: newNodes, edges: dedupEdges, events: store.events, messages: store.messages });
      set({ nodes: newNodes, edges: dedupEdges });
      store.addMessage({ id: uid(), role: 'cid', content: `Merged **${removeNode.data.label}** into **${keepNode.data.label}** — content combined, edges re-linked.`, timestamp: Date.now() });

    } else if (opt.type === 'redundant-edge' && opt.edgeId) {
      store.pushHistory();
      const newEdges = store.edges.filter(e => e.id !== opt.edgeId);
      saveToStorage({ nodes: store.nodes, edges: newEdges, events: store.events, messages: store.messages });
      set({ edges: newEdges });
      store.addMessage({ id: uid(), role: 'cid', content: `Removed redundant edge — ${opt.description.split(' — ')[1] || 'graph simplified'}.`, timestamp: Date.now() });

    } else if (opt.type === 'missing-feedback') {
      // Add a review gate before the output node
      const targetId = opt.affectedNodeIds[0];
      const targetNode = store.nodes.find(n => n.id === targetId);
      if (!targetNode) return;
      store.chatWithCID(`add a review gate before ${targetNode.data.label}`);

    } else if (opt.type === 'orphan-chain') {
      // Try to connect the orphan chain to the main workflow
      store.chatWithCID('solve');

    } else {
      // For overloaded-fanout and others, present as advisory
      store.addMessage({ id: uid(), role: 'cid', content: `This optimization requires manual restructuring: ${opt.proposedAction}`, timestamp: Date.now() });
    }

    // Remove applied optimization from list
    set(s => ({ _lastOptimizations: s._lastOptimizations.filter(o => o.id !== cleanId) }));
  },

  // ── Node Versioning ──
  rollbackNode: (nodeId: string, versionNumber: number) => {
    const store = get();
    const node = store.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const history = node.data._versionHistory || [];
    const target = history.find(v => v.version === versionNumber);
    if (!target) return;

    store.pushHistory();

    // Snapshot current content before rollback
    const currentContent = node.data.content || node.data.executionResult || '';
    const currentVersion = node.data.version ?? 1;
    const newHistory = [...history];
    if (currentContent) {
      newHistory.push({
        version: currentVersion,
        content: currentContent,
        timestamp: Date.now(),
        trigger: 'rollback' as const,
      });
      if (newHistory.length > 10) newHistory.splice(0, newHistory.length - 10);
    }

    // Restore content — if the versioned content was an execution result, restore as executionResult
    const isExecResult = target.trigger === 'execution';
    const updates: Partial<NodeData> = {
      _versionHistory: newHistory,
      version: currentVersion + 1,
    };
    if (isExecResult) {
      updates.executionResult = target.content;
    } else {
      updates.content = target.content;
    }

    store.updateNodeData(nodeId, updates);
    // Propagate staleness — downstream nodes may depend on old content
    store.updateNodeStatus(nodeId, 'stale');
    store.addEvent({
      id: `ev-${Date.now()}-${nodeId}`, type: 'edited',
      message: `Rolled back "${node.data.label}" to v${versionNumber}`,
      timestamp: Date.now(), nodeId,
    });
    store.addMessage({
      id: uid(), role: 'cid',
      content: `Rolled back "${node.data.label}" to version ${versionNumber}. Downstream nodes marked stale.`,
      timestamp: Date.now(), _ephemeral: true,
    });
  },

  // ── Note Refinement ──
  refineNote: async (nodeId: string) => {
    const store = get();
    const node = store.nodes.find(n => n.id === nodeId);
    if (!node || node.data.category !== 'note') {
      store.addMessage({ id: uid(), role: 'cid', content: 'Only note nodes can be refined.', timestamp: Date.now(), _ephemeral: true });
      return;
    }
    const noteContent = node.data.content || node.data.description || '';
    if (!noteContent.trim()) {
      store.addMessage({ id: uid(), role: 'cid', content: `"${node.data.label}" has no content to refine. Write something first.`, timestamp: Date.now(), _ephemeral: true });
      return;
    }

    const existingNodes = store.nodes
      .filter(n => n.id !== nodeId)
      .map(n => ({ label: n.data.label, category: n.data.category }));

    const { system, user } = buildNoteRefinementPrompt(noteContent, existingNodes);

    store.addMessage({
      id: uid(), role: 'cid', content: `Analyzing note "${node.data.label}"...`, timestamp: Date.now(), action: 'refining',
    });

    try {
      const res = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: system,
          model: store.cidAIModel,
          taskType: 'execute',
          effortLevel: 'medium',
          messages: [{ role: 'user', content: user }],
        }),
      });

      if (!res.ok) {
        store.addMessage({ id: uid(), role: 'cid', content: `Refinement failed (API ${res.status}).`, timestamp: Date.now() });
        return;
      }

      const result = await res.json();
      const raw = result.result?.content || result.result?.message || (typeof result.result === 'string' ? result.result : '');

      // Parse JSON from LLM response (may have preamble text)
      let parsed: NoteRefinementResult;
      try {
        // Find first { and last } using brace counting
        let depth = 0;
        let start = -1;
        let end = -1;
        for (let i = 0; i < raw.length; i++) {
          if (raw[i] === '{') { if (depth === 0) start = i; depth++; }
          if (raw[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
        }
        if (start === -1 || end === -1) throw new Error('No JSON found');
        parsed = JSON.parse(raw.slice(start, end));
      } catch {
        store.addMessage({ id: uid(), role: 'cid', content: `Could not parse refinement result. Try again.`, timestamp: Date.now() });
        return;
      }

      // Build interactive suggestion cards and message
      const suggestions: string[] = [];
      const cards: Array<{ id: string; label: string; description?: string }> = [];

      if (parsed.summary) {
        suggestions.push(`**Summary:** ${parsed.summary}`);
      }

      if (parsed.suggestedNodes && parsed.suggestedNodes.length > 0) {
        suggestions.push(`\n**Suggested nodes:**`);
        parsed.suggestedNodes.forEach((sn, i) => {
          suggestions.push(`- **${sn.label}** (${sn.category})`);
          // Find if any suggested edge connects this to an existing node
          const edgeToExisting = parsed.suggestedEdges?.find(
            se => se.from === sn.label && existingNodes.some(en => en.label === se.to)
          );
          cards.push({
            id: `refine-node-${i}`,
            label: `Create: ${sn.label}`,
            description: `${sn.category} node${edgeToExisting ? ` → connects to "${edgeToExisting.to}"` : ''}`,
          });
        });
      }

      if (parsed.suggestedEdges && parsed.suggestedEdges.length > 0) {
        const edgesBetweenExisting = parsed.suggestedEdges.filter(
          se => existingNodes.some(n => n.label === se.from) && existingNodes.some(n => n.label === se.to)
        );
        if (edgesBetweenExisting.length > 0) {
          suggestions.push(`\n**Suggested connections:**`);
          edgesBetweenExisting.forEach((se, i) => {
            suggestions.push(`- ${se.from} —[${se.label}]→ ${se.to}`);
            cards.push({
              id: `refine-edge-${i}`,
              label: `Connect: ${se.from} → ${se.to}`,
              description: se.label,
            });
          });
        }
      }

      if (parsed.cleanedContent) {
        cards.push({
          id: 'refine-clean',
          label: 'Update note content',
          description: 'Replace with cleaner, structured version',
        });
      }

      // Store the parsed result for card click handling
      const storeKey = `_refinement_${nodeId}_${Date.now()}`;
      (globalThis as Record<string, unknown>)[storeKey] = { parsed, noteNodeId: nodeId, existingNodes };

      store.addMessage({
        id: uid(),
        role: 'cid',
        content: suggestions.join('\n'),
        timestamp: Date.now(),
        suggestions: cards.map(c => `${c.id}|${c.label}`),
        _ephemeral: false,
      });

      // Store refinement data on the window for suggestion click handling
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__lifecycleRefinement = { parsed, noteNodeId: nodeId };
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      store.addMessage({ id: uid(), role: 'cid', content: `Refinement failed: ${msg}`, timestamp: Date.now() });
    }
  },

  applyRefinementSuggestion: (suggestion) => {
    const store = get();
    store.pushHistory();

    if (suggestion.type === 'node') {
      // Create a new node from the suggestion
      const { label, category, content, connectTo, edgeLabel } = suggestion;
      const desired = { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 };
      const pos = findFreePosition(desired, store.nodes.map(n => n.position));
      const newId = uid();
      const newNode: Node<NodeData> = {
        id: newId,
        type: 'lifecycleNode',
        position: pos,
        data: {
          label,
          category: category as NodeCategory,
          status: 'active',
          description: content.slice(0, 100),
          content,
          version: 1,
        },
      };
      const newEdges = [...store.edges];

      // Connect to specified node if given
      if (connectTo) {
        const target = store.nodes.find(n => n.data.label === connectTo);
        if (target) {
          newEdges.push(createStyledEdge(newId, target.id, edgeLabel || inferEdgeLabel(category as NodeCategory, target.data.category)));
        }
      }

      const newNodes = [...store.nodes, newNode];
      saveToStorage({ nodes: newNodes, edges: newEdges, events: store.events, messages: store.messages });
      set({ nodes: newNodes, edges: newEdges });
      store.addEvent({ id: uid(), type: 'created', message: `Created "${label}" from note refinement`, timestamp: Date.now(), nodeId: newId, agent: true });
      store.addMessage({ id: uid(), role: 'cid', content: `Created **${label}** (${category}).`, timestamp: Date.now(), _ephemeral: true });
    } else if (suggestion.type === 'edge') {
      const { from, to, label } = suggestion;
      const srcNode = store.nodes.find(n => n.data.label === from);
      const tgtNode = store.nodes.find(n => n.data.label === to);
      if (srcNode && tgtNode) {
        const newEdge = createStyledEdge(srcNode.id, tgtNode.id, label);
        const newEdges = [...store.edges, newEdge];
        saveToStorage({ nodes: store.nodes, edges: newEdges, events: store.events, messages: store.messages });
        set({ edges: newEdges });
        store.addMessage({ id: uid(), role: 'cid', content: `Connected **${from}** → **${to}** (${label}).`, timestamp: Date.now(), _ephemeral: true });
      } else {
        store.addMessage({ id: uid(), role: 'cid', content: `Could not find nodes "${from}" or "${to}" to connect.`, timestamp: Date.now(), _ephemeral: true });
      }
    } else if (suggestion.type === 'clean') {
      const { content: newContent, nodeId } = suggestion;
      store.updateNodeData(nodeId, { content: newContent });
      store.addEvent({ id: uid(), type: 'refined', message: `Note content refined by CID`, timestamp: Date.now(), nodeId, agent: true });
      store.addMessage({ id: uid(), role: 'cid', content: `Note content updated with structured version.`, timestamp: Date.now(), _ephemeral: true });
    }
  },

  // Functional CID action: auto-layout nodes in a clean grid
  optimizeLayout: () => {
    const store = get();
    store.pushHistory();
    const { nodes, edges } = store;
    cidLog('optimizeLayout', { nodeCount: nodes.length, edgeCount: edges.length });
    if (nodes.length === 0) return;

    // Left-to-right layout: categories become columns in workflow order
    const colOrder: NodeCategory[] = ['input', 'note', 'state', 'artifact', 'policy', 'review', 'patch', 'cid', 'dependency', 'output'];
    const grouped = new Map<NodeCategory, Node<NodeData>[]>();
    for (const n of nodes) {
      const cat = n.data.category;
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(n);
    }
    // Add custom categories at the end
    for (const cat of grouped.keys()) {
      if (!colOrder.includes(cat)) colOrder.push(cat);
    }

    const COL_GAP = NODE_W + 80;
    const ROW_GAP = NODE_H + 40;
    let currentX = 0;
    const newPositions = new Map<string, { x: number; y: number }>();
    const placedPositions: { x: number; y: number }[] = [];

    for (const col of colOrder) {
      const group = grouped.get(col);
      if (!group || group.length === 0) continue;
      // Stack nodes vertically within each column, centered around y=0
      const totalHeight = group.length * ROW_GAP;
      const startY = Math.max(0, (400 - totalHeight) / 2);
      group.forEach((n, i) => {
        const desired = { x: currentX, y: startY + i * ROW_GAP };
        const pos = findFreePosition(desired, placedPositions);
        newPositions.set(n.id, pos);
        placedPositions.push(pos);
      });
      currentX += COL_GAP;
    }

    set((s) => {
      const nodes = s.nodes.map((n) => {
        const pos = newPositions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      });
      saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
      return { nodes };
    });

    store.addEvent({
      id: `ev-${Date.now()}`, type: 'optimized',
      message: `Optimized layout: ${nodes.length} nodes arranged in ${grouped.size} tiers`,
      timestamp: Date.now(), agent: true,
    });
  },

  // CID autonomous problem solver — analyzes graph and creates custom node types
  cidSolve: () => {
    const store = get();
    const { nodes, edges } = store;
    cidLog('cidSolve', { nodeCount: nodes.length, edgeCount: edges.length });
    if (nodes.length === 0) return { created: 0, message: 'No nodes in the workflow to analyze.' };

    store.pushHistory();
    const createdNodes: string[] = [];

    // Build adjacency info
    const hasIncoming = new Set(edges.map((e) => e.target));
    const hasOutgoing = new Set(edges.map((e) => e.source));
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // 1. Detect isolated nodes (no edges at all) → create "connector" node
    const isolatedNodes = nodes.filter((n) => !hasIncoming.has(n.id) && !hasOutgoing.has(n.id));
    if (isolatedNodes.length >= 2) {
      registerCustomCategory('connector', '#14b8a6');
      const connId = uid();
      const avgX = isolatedNodes.reduce((s, n) => s + n.position.x, 0) / isolatedNodes.length;
      const avgY = isolatedNodes.reduce((s, n) => s + n.position.y, 0) / isolatedNodes.length;
      store.addNode({
        id: connId, type: 'lifecycleNode',
        position: findFreePosition({ x: avgX, y: avgY - 120 }, store.nodes.map(n => n.position)),
        data: {
          label: 'CID: Connector Hub',
          category: 'connector',
          status: 'generating',
          description: `Bridges ${isolatedNodes.length} isolated nodes into the workflow`,
          version: 1, lastUpdated: Date.now(),
        },
      });
      // Connect isolated nodes to the hub
      isolatedNodes.forEach((n) => {
        store.addEdge(createStyledEdge(connId, n.id, 'connects', { animated: true }));
      });
      store.addEvent({
        id: `ev-${Date.now()}-conn`, type: 'created',
        message: `CID created Connector Hub to bridge ${isolatedNodes.length} isolated nodes`,
        timestamp: Date.now(), nodeId: connId, agent: true,
      });
      createdNodes.push('Connector Hub');
    }

    // 2. Detect artifacts with no review downstream → create "validator" node
    const artifactNodes = nodes.filter((n) => n.data.category === 'artifact');
    const artifactsWithReview = new Set<string>();
    for (const e of edges) {
      const target = nodeMap.get(e.target);
      if (target?.data.category === 'review') {
        artifactsWithReview.add(e.source);
      }
    }
    const unvalidatedArtifacts = artifactNodes.filter((n) => !artifactsWithReview.has(n.id));
    if (unvalidatedArtifacts.length > 0) {
      registerCustomCategory('validator', '#a855f7');
      const valId = uid();
      const maxY = Math.max(...unvalidatedArtifacts.map((n) => n.position.y));
      const avgX = unvalidatedArtifacts.reduce((s, n) => s + n.position.x, 0) / unvalidatedArtifacts.length;
      store.addNode({
        id: valId, type: 'lifecycleNode',
        position: findFreePosition({ x: avgX, y: maxY + 200 }, store.nodes.map(n => n.position)),
        data: {
          label: 'CID: Quality Validator',
          category: 'validator',
          status: 'generating',
          description: `Auto-validates ${unvalidatedArtifacts.length} artifact${unvalidatedArtifacts.length > 1 ? 's' : ''} missing review gates`,
          version: 1, lastUpdated: Date.now(),
        },
      });
      unvalidatedArtifacts.forEach((n) => {
        store.addEdge(createStyledEdge(n.id, valId, 'validates', { animated: true }));
      });
      store.addEvent({
        id: `ev-${Date.now()}-val`, type: 'created',
        message: `CID created Quality Validator for ${unvalidatedArtifacts.length} unvalidated artifact${unvalidatedArtifacts.length > 1 ? 's' : ''}`,
        timestamp: Date.now(), nodeId: valId, agent: true,
      });
      createdNodes.push('Quality Validator');
    }

    // 3. Detect leaf nodes (no outgoing edges, not review/policy) → create "output" node
    const leafNodes = nodes.filter(
      (n) => !hasOutgoing.has(n.id) && !['review', 'policy', 'validator', 'output', 'watchdog'].includes(n.data.category)
    );
    if (leafNodes.length >= 2) {
      registerCustomCategory('output', '#eab308');
      const outId = uid();
      const maxY = Math.max(...leafNodes.map((n) => n.position.y));
      const avgX = leafNodes.reduce((s, n) => s + n.position.x, 0) / leafNodes.length;
      store.addNode({
        id: outId, type: 'lifecycleNode',
        position: findFreePosition({ x: avgX, y: maxY + 200 }, store.nodes.map(n => n.position)),
        data: {
          label: 'CID: Output Collector',
          category: 'output',
          status: 'generating',
          description: `Collects outputs from ${leafNodes.length} terminal nodes for export`,
          version: 1, lastUpdated: Date.now(),
        },
      });
      leafNodes.forEach((n) => {
        store.addEdge(createStyledEdge(n.id, outId, 'outputs', { dashed: true }));
      });
      store.addEvent({
        id: `ev-${Date.now()}-out`, type: 'created',
        message: `CID created Output Collector for ${leafNodes.length} leaf nodes`,
        timestamp: Date.now(), nodeId: outId, agent: true,
      });
      createdNodes.push('Output Collector');
    }

    // 4. Detect multiple stale nodes → create "cascade-update" node
    const staleNodes = nodes.filter((n) => n.data.status === 'stale');
    if (staleNodes.length >= 2) {
      registerCustomCategory('cascade', '#f97316');
      const casId = uid();
      const avgX = staleNodes.reduce((s, n) => s + n.position.x, 0) / staleNodes.length;
      const minY = Math.min(...staleNodes.map((n) => n.position.y));
      store.addNode({
        id: casId, type: 'lifecycleNode',
        position: findFreePosition({ x: avgX + 300, y: minY }, store.nodes.map(n => n.position)),
        data: {
          label: 'CID: Cascade Updater',
          category: 'cascade',
          status: 'generating',
          description: `Orchestrates cascading updates across ${staleNodes.length} stale nodes`,
          version: 1, lastUpdated: Date.now(),
        },
      });
      staleNodes.forEach((n) => {
        store.addEdge(createStyledEdge(casId, n.id, 'updates', { animated: true }));
      });
      store.addEvent({
        id: `ev-${Date.now()}-cas`, type: 'created',
        message: `CID created Cascade Updater to manage ${staleNodes.length} stale nodes`,
        timestamp: Date.now(), nodeId: casId, agent: true,
      });
      createdNodes.push('Cascade Updater');
    }

    // 5. Detect no CID monitoring node → create "watchdog" node
    const hasCidMonitor = nodes.some(
      (n) => n.data.category === 'cid' && /monitor|watch|propagat/i.test(n.data.label)
    );
    if (!hasCidMonitor && nodes.length >= 3) {
      registerCustomCategory('watchdog', '#22d3ee');
      const watchId = uid();
      const maxX = Math.max(...nodes.map((n) => n.position.x));
      const avgY = nodes.reduce((s, n) => s + n.position.y, 0) / nodes.length;
      store.addNode({
        id: watchId, type: 'lifecycleNode',
        position: findFreePosition({ x: maxX + 200, y: avgY }, store.nodes.map(n => n.position)),
        data: {
          label: 'CID: Watchdog',
          category: 'watchdog',
          status: 'generating',
          description: 'Monitors the entire workflow for drift, inconsistencies, and stale chains',
          version: 1, lastUpdated: Date.now(),
        },
      });
      // Connect to state nodes for monitoring
      const stateNodes = nodes.filter((n) => n.data.category === 'state');
      stateNodes.forEach((n) => {
        store.addEdge(createStyledEdge(n.id, watchId, 'watches', { dashed: true }));
      });
      store.addEvent({
        id: `ev-${Date.now()}-watch`, type: 'created',
        message: 'CID created Watchdog to monitor workflow health',
        timestamp: Date.now(), nodeId: watchId, agent: true,
      });
      createdNodes.push('Watchdog');
    }

    // 6. Detect nodes with empty content or description (advisory)
    const contentCategories = ['artifact', 'note', 'policy', 'state', 'input', 'output'];
    const emptyContentNodes = nodes.filter(n =>
      contentCategories.includes(n.data.category) && !n.data.content && !n.data.description
    );

    // Finalize — set all new generating nodes to active after a delay
    if (createdNodes.length > 0) {
      setTimeout(() => {
        set((s) => {
          const nodes = s.nodes.map((n) =>
            n.data.status === 'generating' && n.data.label.startsWith('CID:')
              ? { ...n, data: { ...n.data, status: 'active' as const } }
              : n
          );
          saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
          return { nodes };
        });
      }, 1500);
    }

    const agent = getAgent(get().cidMode);
    let message = createdNodes.length > 0
      ? agent.responses.solveFound(createdNodes.length, createdNodes)
      : agent.responses.solveClean();

    // Append content advisory if applicable
    if (emptyContentNodes.length > 0) {
      const names = emptyContentNodes.map(n => `**${n.data.label}**`).join(', ');
      message += `\n\nAdvisory: ${emptyContentNodes.length} node${emptyContentNodes.length > 1 ? 's have' : ' has'} no content or description: ${names}. Consider adding details to make the workflow more useful.`;
    }

    return { created: createdNodes.length, message };
  },

  exportWorkflow: () => {
    const { nodes, edges, events, messages } = get();
    // Validate graph integrity before export
    const { issues } = validateGraphInvariants(
      nodes.map(n => ({ id: n.id })),
      edges.map(e => ({ source: e.source, target: e.target })),
    );
    if (issues.length > 0) {
      console.warn(`[Export] Graph has ${issues.length} issue(s):`, issues);
    }
    // Strip sensitive data (API keys) from node data before export
    const safeNodes = nodes.map(n => ({
      ...n,
      data: { ...n.data, apiKey: undefined },
    }));
    return JSON.stringify({ _format: 'lifecycle-agent', _version: 1, nodes: safeNodes, edges, events, messages }, null, 2);
  },

  compileWorkflow: (format: ExportFormat = 'md') => {
    const store = get();
    const { nodes, edges } = store;
    if (nodes.length === 0) {
      store.addMessage({ id: uid(), role: 'cid', content: 'No nodes to compile.', timestamp: Date.now() });
      return;
    }

    // Topological order for document structure
    const { order } = topoSort(nodes, edges);
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    const sections = order
      .map(id => nodeById.get(id))
      .filter((n): n is Node<NodeData> => !!n)
      .filter(n => n.data.executionResult || n.data.content)
      .map(n => ({
        label: n.data.label,
        category: n.data.category,
        content: n.data.executionResult || n.data.content || '',
      }));

    if (sections.length === 0) {
      store.addMessage({ id: uid(), role: 'cid', content: 'No executed content to compile. Run the workflow first.', timestamp: Date.now() });
      return;
    }

    const compiled = compileDocument(sections, 'Workflow Output');
    exportAndDownload(compiled, format, 'workflow-output');
    store.addMessage({
      id: uid(), role: 'cid',
      content: `Compiled **${sections.length}** node outputs into a single ${format.toUpperCase()} document and downloaded.`,
      timestamp: Date.now(),
    });
  },

  importWorkflow: (json) => {
    try {
      const data = JSON.parse(json);
      if (!data.nodes || !Array.isArray(data.nodes)) return false;
      // Validate node structure
      for (const n of data.nodes) {
        if (!n.id || !n.data?.label || !n.data?.category || !n.data?.status) return false;
        if (!n.position || typeof n.position.x !== 'number' || typeof n.position.y !== 'number') return false;
      }
      // Validate edges if present
      const nodeIds = new Set(data.nodes.map((n: any) => n.id));
      if (data.edges && Array.isArray(data.edges)) {
        for (const e of data.edges) {
          if (!e.id || !e.source || !e.target) return false;
          if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return false;
        }
        // Graph invariant validation: remove self-loops & dedup edges
        const { issues } = validateGraphInvariants(
          data.nodes.map((n: any) => ({ id: n.id })),
          data.edges.map((e: any) => ({ source: e.source, target: e.target })),
        );
        if (issues.length > 0) {
          const seen = new Set<string>();
          data.edges = data.edges.filter((e: any) => {
            if (e.source === e.target) return false;
            const key = `${e.source}→${e.target}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          const fixCount = issues.length;
          setTimeout(() => get().addToast(`Import auto-fixed ${fixCount} graph issue(s)`, 'warning'), 100);
        }
      }
      const store = get();
      store.pushHistory();
      // Restore nodeCounter to prevent ID collisions
      if (data.nodes.length > 0) {
        const maxId = data.nodes.reduce((max: number, n: Node<NodeData>) => {
          const num = parseInt(n.id.replace('node-', ''), 10);
          return isNaN(num) ? max : Math.max(max, num);
        }, 0);
        if (maxId >= nodeCounter) nodeCounter = maxId + 1;
      }
      set({
        nodes: data.nodes,
        edges: data.edges || [],
        events: data.events || [],
        messages: data.messages || [],
      });
      saveToStorage({ nodes: data.nodes, edges: data.edges || [], events: data.events || [], messages: data.messages || [] });
      return true;
    } catch {
      return false;
    }
  },

  aiEnabled: false, // Set to true once first API call succeeds

  // searchQuery, setSearchQuery — from UISlice

  // Batch status update — returns count of affected nodes
  batchUpdateStatus: (fromStatus, toStatus) => {
    const store = get();
    const matching = store.nodes.filter(n => n.data.status === fromStatus);
    if (matching.length === 0) return 0;
    store.pushHistory();
    if (toStatus === 'stale') {
      // Use updateNodeStatus for stale to trigger cascade propagation
      for (const n of matching) {
        store.updateNodeStatus(n.id, 'stale');
      }
    } else {
      set(s => {
        const nodes = s.nodes.map(n =>
          n.data.status === fromStatus
            ? { ...n, data: { ...n.data, status: toStatus, locked: toStatus === 'locked' ? true : toStatus === 'active' ? false : n.data.locked } }
            : n
        );
        saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
        return { nodes };
      });
    }
    store.addEvent({
      id: `ev-${Date.now()}`, type: 'edited',
      message: `Batch: ${matching.length} ${fromStatus} node${matching.length > 1 ? 's' : ''} → ${toStatus}`,
      timestamp: Date.now(), agent: true,
    });
    return matching.length;
  },

  // Edge label editing
  updateEdgeLabel: (edgeId, label) => {
    const store = get();
    store.pushHistory();
    set(s => {
      const edges = s.edges.map(e =>
        e.id === edgeId
          ? { ...e, label, animated: ANIMATED_LABELS.has(label), style: { ...e.style, stroke: EDGE_LABEL_COLORS[label] || '#6366f1' } }
          : e
      );
      saveToStorage({ nodes: s.nodes, edges, events: s.events, messages: s.messages });
      return { edges };
    });
  },

  // pendingEdge, setPendingEdge — from UISlice

  // Ask CID about a specific node — sends node context to chatWithCID
  askCIDAboutNode: (nodeId) => {
    const store = get();
    const node = store.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const d = node.data;
    const edges = store.edges.filter(e => e.source === nodeId || e.target === nodeId);
    const connections = edges.map(e => {
      const other = e.source === nodeId
        ? store.nodes.find(n => n.id === e.target)
        : store.nodes.find(n => n.id === e.source);
      const dir = e.source === nodeId ? 'outgoing' : 'incoming';
      return `${dir}: ${other?.data.label ?? '?'} (${e.label || 'connected'})`;
    }).join(', ');
    const prompt = `Analyze the node "${d.label}" (${d.category}, status: ${d.status}, v${d.version ?? 1}). ${d.description ? `Description: ${d.description}.` : ''} ${connections ? `Connections: ${connections}.` : 'No connections.'} What should I know about this node? Any issues or suggestions?`;
    if (!store.showCIDPanel) store.toggleCIDPanel();
    store.chatWithCID(prompt);
  },

  // Generate AI content for a node
  generateNodeContent: async (nodeId) => {
    const store = get();
    const node = store.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const d = node.data;

    // Set generating status
    store.updateNodeStatus(nodeId, 'generating');
    store.addToast(`Generating content for "${d.label}"...`, 'info');

    try {
      const edges = store.edges.filter(e => e.source === nodeId || e.target === nodeId);
      const connections = edges.map(e => {
        const other = e.source === nodeId
          ? store.nodes.find(n => n.id === e.target)
          : store.nodes.find(n => n.id === e.source);
        return other?.data.label ?? '?';
      }).join(', ');

      const systemPrompt = `You are a content generator. Write detailed, professional content for a workflow node. Return ONLY a JSON object: {"content": "the markdown content", "description": "one-line summary"}. No other text.`;
      const userPrompt = `Generate detailed content for a "${d.category}" node called "${d.label}"${d.description ? ` (${d.description})` : ''}${connections ? `. Connected to: ${connections}` : ''}. Write real, substantive content — not placeholders. Use markdown formatting. Content should be 150-400 words.`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, messages: [{ role: 'user', content: userPrompt }], model: get().cidAIModel, taskType: 'analyze' }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (!data.error && data.result) {
        const result = data.result as { content?: string; description?: string; message?: string };
        const content = result.content || result.message || '';
        const description = result.description || d.description || '';
        if (content) {
          store.updateNodeData(nodeId, { content, description: description || d.description });
          store.addToast(`Content generated for "${d.label}"`, 'success');
        }
      }
    } catch {
      store.addToast(`Failed to generate content for "${d.label}"`, 'warning');
    }
    store.updateNodeStatus(nodeId, 'active');
  },

  // Execution mutex — per-node locks to prevent concurrent mutations
  _executingNodeIds: new Set<string>(),
  _lockNode: (nodeId) => {
    set(s => ({ _executingNodeIds: new Set([...s._executingNodeIds, nodeId]) }));
  },
  _unlockNode: (nodeId) => {
    set(s => {
      const next = new Set(s._executingNodeIds);
      next.delete(nodeId);
      return { _executingNodeIds: next };
    });
  },

  // lastSavedAt, toasts, addToast, removeToast — from UISlice

  chatWithCID: async (prompt) => {
    const store = get();
    const agent = getAgent(store.cidMode);
    cidLog('chatWithCID', { prompt: prompt.slice(0, 80), mode: store.cidMode });

    // Auto-inject selected node context into prompt
    let enrichedPrompt = prompt;
    if (store.selectedNodeId) {
      const selNode = store.nodes.find(n => n.id === store.selectedNodeId);
      if (selNode) {
        const d = selNode.data;
        const connEdges = store.edges.filter(e => e.source === store.selectedNodeId || e.target === store.selectedNodeId);
        const connNames = connEdges.map(e => {
          const other = e.source === store.selectedNodeId
            ? store.nodes.find(n => n.id === e.target)
            : store.nodes.find(n => n.id === e.source);
          return `${other?.data.label ?? '?'} (${e.label || 'connected'})`;
        }).join(', ');
        enrichedPrompt = `[Context: Selected node "${d.label}" — ${d.category}, status: ${d.status}${connNames ? `, connections: ${connNames}` : ''}] ${prompt}`;
      }
    }

    store.addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });

    // Show thinking state
    const thinkingId = uid();
    store.addMessage({
      id: thinkingId, role: 'cid', content: '',
      timestamp: Date.now(), action: 'thinking',
    });
    set({ isProcessing: true });

    try {
      // Layer 4: Refresh generation context from real-time signals BEFORE building prompt
      const recentUserMsgs = store.messages.filter(m => m.role === 'user' && m.content).slice(-5).map(m => m.content);
      refreshGenerationContext(store.cidMode, enrichedPrompt, store.nodes.length, recentUserMsgs);

      // Detect if the user is requesting a build/modification (needs more time + creativity)
      const lowerPrompt = enrichedPrompt.toLowerCase();
      const isBuildOrModify = /\b(build|create|generate|make|design|add|remove|change|update|edit|modify|tweak|revise|insert|delete|replace|rename|move|swap|speed\s*up|optimiz|faster|too\s*slow)\b/.test(lowerPrompt);
      const chatTaskType = isBuildOrModify ? 'generate' : 'analyze';

      // Set taskType in generation context so compilePersonalityPrompt can inject goal declarations
      sessionGeneration[store.cidMode].context.taskType = chatTaskType as 'generate' | 'analyze';

      const agent = getAgent(store.cidMode);
      const layers = getAgentLayers(store.cidMode);
      const systemPrompt = buildSystemPrompt(store.cidMode, store.nodes, store.edges, store.cidRules, agent, layers) + getBuildContext();
      const chatHistory = store.messages
        .filter(m => m.content && !m.action)
        .map(m => ({ role: m.role as 'user' | 'cid', content: m.content }));
      const messages = buildMessages(chatHistory, enrichedPrompt);
      const chatTimeoutMs = isBuildOrModify ? 120000 : 45000;

      const chatController = new AbortController();
      const chatTimeout = setTimeout(() => chatController.abort(), chatTimeoutMs);

      // Try streaming for non-build chat requests
      if (!isBuildOrModify) {
        try {
          const streamRes = await fetch('/api/cid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt, messages, model: get().cidAIModel, taskType: chatTaskType, stream: true }),
            signal: chatController.signal,
          });
          clearTimeout(chatTimeout);

          if (streamRes.ok && streamRes.headers.get('content-type')?.includes('text/event-stream') && streamRes.body) {
            // Remove thinking message, create streaming message
            set(s => ({ messages: s.messages.filter(m => m.id !== thinkingId) }));
            const streamMsgId = uid();
            const suggestions = getSmartSuggestions(get().nodes, get().edges);
            store.addMessage({ id: streamMsgId, role: 'cid', content: '', timestamp: Date.now(), suggestions });

            // Read SSE stream
            const reader = streamRes.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let sseBuffer = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              sseBuffer += decoder.decode(value, { stream: true });
              const lines = sseBuffer.split('\n');
              sseBuffer = lines.pop() || '';
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const payload = line.slice(6).trim();
                if (payload === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(payload);
                  if (parsed.token) {
                    fullText += parsed.token;
                    store.updateStreamingMessage(streamMsgId, fullText);
                  }
                } catch { /* skip */ }
              }
            }

            // Check if the streamed text is actually JSON (workflow/modifications)
            const trimmed = fullText.trim();
            if (trimmed.startsWith('{') && (trimmed.includes('"workflow"') || trimmed.includes('"modifications"'))) {
              // It was a build response disguised as chat — reprocess
              try {
                const parsed = JSON.parse(trimmed);
                if (parsed.workflow || parsed.modifications) {
                  // Remove the streaming message and fall through to non-streaming
                  set(s => ({ messages: s.messages.filter(m => m.id !== streamMsgId) }));
                  // We can't easily re-fetch, so just display the message part
                  if (parsed.message) {
                    store.updateStreamingMessage(streamMsgId, parsed.message);
                    // Re-add the message since we removed it
                    store.addMessage({ id: streamMsgId, role: 'cid', content: parsed.message, timestamp: Date.now(), suggestions });
                  }
                }
              } catch { /* keep as-is */ }
            }

            // Layer 4+5: Update generation state
            const curMode = store.cidMode;
            sessionGeneration[curMode].interactionCount++;
            sessionGeneration[curMode].successStreak++;
            runReflection(curMode, prompt, fullText);
            set({ isProcessing: false });
            return;
          }
        } catch {
          // Streaming failed, fall through to non-streaming
          clearTimeout(chatTimeout);
        }
      }

      // Non-streaming path (for build/modify or streaming fallback)
      const nsController = new AbortController();
      const nsTimeout = setTimeout(() => nsController.abort(), chatTimeoutMs);
      const res = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, messages, model: get().cidAIModel, taskType: chatTaskType }),
        signal: nsController.signal,
      });
      clearTimeout(nsTimeout);

      const data = await res.json();

      // Remove thinking message
      set(s => ({ messages: s.messages.filter(m => m.id !== thinkingId) }));

      if (data.error === 'no_api_key') {
        // No API key — use template silently
        set({ isProcessing: false });
        const fallbackMsg = agent.responses.fallback(prompt, get().nodes, get().edges);
        store.addMessage({ id: uid(), role: 'cid', content: fallbackMsg, timestamp: Date.now() });
        return;
      }

      if (data.error === 'api_error') {
        // API error (rate limit, etc.) — inform user and fallback
        set({ isProcessing: false });
        const isRateLimit = data.message?.includes('429') || data.message?.includes('rate');
        const errorNote = isRateLimit
          ? '⚠ AI rate limited — using local intelligence. Try again in a moment.'
          : '⚠ AI temporarily unavailable — using local intelligence.';
        store.addMessage({ id: uid(), role: 'cid', content: errorNote, timestamp: Date.now() });
        setTimeout(() => {
          const fallbackMsg = agent.responses.fallback(prompt, get().nodes, get().edges);
          store.addMessage({ id: uid(), role: 'cid', content: fallbackMsg, timestamp: Date.now() });
        }, 500);
        return;
      }

      set({ aiEnabled: true });

      // Layer 4: Update generation state on success
      const curMode = store.cidMode;
      sessionGeneration[curMode].interactionCount++;
      sessionGeneration[curMode].successStreak++;

      // Safety: ensure data.result is a parsed object, not a raw JSON string
      let result = data.result as { message: string; workflow: null | {
        nodes: Array<{ label: string; category: string; description: string; content?: string; sections?: Array<{ title: string; content?: string }> }>;
        edges: Array<{ from: number; to: number; label: string }>;
      }; modifications?: {
        update_nodes?: Array<{ label: string; changes: Partial<{ label: string; category: string; description: string; content: string; status: string; sections: Array<{ title: string; content?: string; status?: string }> }> }>;
        add_nodes?: Array<{ label: string; category: string; description: string; content?: string; after?: string }>;
        remove_nodes?: string[];
        add_edges?: Array<{ from_label: string; to_label: string; label: string }>;
        remove_edges?: Array<{ from_label: string; to_label: string }>;
        merge_nodes?: Array<{ keep: string; remove: string; new_label?: string; new_content?: string }>;
      }};
      if (typeof data.result === 'string') {
        try { result = JSON.parse(data.result); } catch { /* keep as-is */ }
      }

      // Guard: If the user asked a pure question (what/how/should/why + no action verbs),
      // strip accidental modifications — the LLM sometimes modifies when it should advise
      const isAdviceQuestion = /^(what|how|should|why|tell|explain|describe|can you tell|do you think)\b/i.test(prompt.trim())
        && !/\b(add|remove|change|rename|speed|fix|optimiz|merge|split|delete|move|swap|insert)\b/i.test(prompt.toLowerCase());
      if (isAdviceQuestion && result.modifications && !result.workflow) {
        cidLog('chatWithCID:stripped-modifications', { reason: 'advice question detected', prompt: prompt.slice(0, 60) });
        result.modifications = undefined;
      }

      // ── Handle workflow modifications (edit/tweak existing workflow) ──
      if (result.modifications && !result.workflow) {
        const mods = result.modifications;
        store.pushHistory();
        let modCount = 0;
        const currentNodes = get().nodes;

        // 1. Remove nodes
        if (mods.remove_nodes?.length) {
          for (const label of mods.remove_nodes) {
            const node = currentNodes.find(n => n.data.label.toLowerCase() === label.toLowerCase());
            if (node) {
              get().deleteNode(node.id);
              modCount++;
            }
          }
        }

        // 2. Update nodes (full power — any NodeData field can be changed)
        if (mods.update_nodes?.length) {
          for (const update of mods.update_nodes) {
            const node = get().nodes.find(n => n.data.label.toLowerCase() === update.label.toLowerCase());
            if (node && update.changes) {
              const patch: Partial<NodeData> = {};
              if (update.changes.label) patch.label = update.changes.label;
              if (update.changes.category) patch.category = update.changes.category as NodeCategory;
              if (update.changes.description) patch.description = update.changes.description;
              if (update.changes.content) patch.content = update.changes.content;
              if (update.changes.status) patch.status = update.changes.status as NodeData['status'];
              if (update.changes.sections) patch.sections = update.changes.sections.map(s => ({
                id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title: s.title,
                status: (s.status === 'stale' ? 'stale' : 'current') as 'current' | 'stale' | 'regenerating',
              }));
              patch.lastUpdated = Date.now();
              patch.version = (node.data.version || 1) + 1;
              get().updateNodeData(node.id, patch);
              modCount++;
            }
          }
        }

        // 3. Add nodes
        if (mods.add_nodes?.length) {
          for (const newNode of mods.add_nodes) {
            // Find position: after a named node, or at the end
            let x = 100, y = 100;
            if (newNode.after) {
              const afterNode = get().nodes.find(n => n.data.label.toLowerCase() === newNode.after!.toLowerCase());
              if (afterNode) {
                x = afterNode.position.x + NODE_W + 80;
                y = afterNode.position.y;
              }
            } else {
              const maxX = get().nodes.length > 0 ? Math.max(...get().nodes.map(n => n.position.x)) : 0;
              x = maxX + NODE_W + 80;
            }
            const id = uid();
            get().addNode({
              id, type: 'lifecycleNode',
              position: { x, y },
              data: {
                label: newNode.label,
                category: (newNode.category || 'action') as NodeCategory,
                status: 'active',
                description: newNode.description || '',
                content: newNode.content || '',
                version: 1,
                lastUpdated: Date.now(),
              },
            });
            modCount++;
          }
        }

        // 4. Remove edges
        if (mods.remove_edges?.length) {
          for (const edgeDef of mods.remove_edges) {
            const srcNode = get().nodes.find(n => n.data.label.toLowerCase() === edgeDef.from_label.toLowerCase());
            const tgtNode = get().nodes.find(n => n.data.label.toLowerCase() === edgeDef.to_label.toLowerCase());
            if (srcNode && tgtNode) {
              const edge = get().edges.find(e => e.source === srcNode.id && e.target === tgtNode.id);
              if (edge) {
                get().deleteEdge(edge.id);
                modCount++;
              }
            }
          }
        }

        // 5. Add edges (with cycle detection guard)
        if (mods.add_edges?.length) {
          const addedEdgeIds: string[] = [];
          for (const edgeDef of mods.add_edges) {
            const srcNode = get().nodes.find(n => n.data.label.toLowerCase() === edgeDef.from_label.toLowerCase());
            const tgtNode = get().nodes.find(n => n.data.label.toLowerCase() === edgeDef.to_label.toLowerCase());
            if (srcNode && tgtNode) {
              const exists = get().edges.some(e => e.source === srcNode.id && e.target === tgtNode.id);
              if (!exists) {
                const newEdge = createStyledEdge(srcNode.id, tgtNode.id, edgeDef.label || 'drives');
                get().addEdge(newEdge);
                addedEdgeIds.push(newEdge.id);
                modCount++;
              }
            }
          }
          // Cycle detection: revert edges that create cycles
          if (addedEdgeIds.length > 0) {
            const { hasCycle, cycleNodes } = detectCycle(
              get().nodes.map(n => ({ id: n.id })),
              get().edges.map(e => ({ source: e.source, target: e.target, label: typeof e.label === 'string' ? e.label : undefined })),
            );
            if (hasCycle) {
              set({ edges: get().edges.filter(e => !addedEdgeIds.includes(e.id)) });
              modCount -= addedEdgeIds.length;
              const nodeLabels = cycleNodes.map(id => get().nodes.find(n => n.id === id)?.data.label || id).join(', ');
              store.addMessage({ id: uid(), role: 'cid', content: `⚠️ Blocked ${addedEdgeIds.length} edge(s) that would create a cycle involving: ${nodeLabels}. Cycles prevent workflow execution.`, timestamp: Date.now(), _ephemeral: true });
            }
          }
        }

        // 6. Merge nodes (combine two nodes into one, reconnect edges)
        if (mods.merge_nodes?.length) {
          for (const merge of mods.merge_nodes) {
            const keepNode = get().nodes.find(n => n.data.label.toLowerCase() === merge.keep.toLowerCase());
            const removeNode = get().nodes.find(n => n.data.label.toLowerCase() === merge.remove.toLowerCase());
            if (keepNode && removeNode) {
              // Update the kept node
              const patch: Partial<NodeData> = {
                lastUpdated: Date.now(),
                version: (keepNode.data.version || 1) + 1,
              };
              if (merge.new_label) patch.label = merge.new_label;
              if (merge.new_content) patch.content = merge.new_content;
              get().updateNodeData(keepNode.id, patch);

              // Reconnect edges: any edge TO removeNode → redirect TO keepNode
              const incomingEdges = get().edges.filter(e => e.target === removeNode.id && e.source !== keepNode.id);
              for (const e of incomingEdges) {
                const alreadyExists = get().edges.some(ex => ex.source === e.source && ex.target === keepNode.id);
                if (!alreadyExists) {
                  get().addEdge(createStyledEdge(e.source, keepNode.id, (typeof e.label === 'string' ? e.label : '') || 'feeds'));
                }
              }
              // Reconnect edges: any edge FROM removeNode → redirect FROM keepNode
              const outgoingEdges = get().edges.filter(e => e.source === removeNode.id && e.target !== keepNode.id);
              for (const e of outgoingEdges) {
                const alreadyExists = get().edges.some(ex => ex.source === keepNode.id && ex.target === e.target);
                if (!alreadyExists) {
                  get().addEdge(createStyledEdge(keepNode.id, e.target, (typeof e.label === 'string' ? e.label : '') || 'feeds'));
                }
              }
              // Delete the removed node (auto-removes its edges)
              get().deleteNode(removeNode.id);
              modCount++;
            }
          }
        }

        // Finalize
        set({ isProcessing: false });
        postBuildFinalize(get);

        const modMsg = result.message + `\n\n🔧 **${modCount} modification${modCount !== 1 ? 's' : ''} applied** to the workflow.`;
        const modMsgId = uid();
        const suggestions = getSmartSuggestions(get().nodes, get().edges);
        store.addMessage({ id: modMsgId, role: 'cid', content: '', timestamp: Date.now(), suggestions });
        streamMessageToStore(modMsgId, modMsg, store.updateStreamingMessage);
        store.addEvent({ id: `ev-${Date.now()}`, type: 'edited', message: `Agent modified workflow: ${modCount} changes`, timestamp: Date.now(), agent: true });
        runReflection(curMode, prompt, result.message);
        return;
      }

      // If the API returned a workflow, build it
      if (result.workflow && result.workflow.nodes?.length > 0) {
        store.pushHistory();
        const wf = result.workflow;
        const existingNodes = get().nodes;
        const existingEdges = get().edges;
        const isExtending = existingNodes.length > 0;

        const newNodes: Node<NodeData>[] = [];
        const newEdges: Edge[] = [];

        // Calculate position offset for new nodes (place them to the right of existing)
        const maxX = isExtending ? Math.max(...existingNodes.map(n => n.position.x)) + NODE_W + 120 : 0;

        wf.nodes.forEach((n, i) => {
          // Skip if a node with the same label already exists (extend mode)
          if (isExtending && existingNodes.some(en => en.data.label.toLowerCase() === n.label.toLowerCase())) return;
          const id = uid();
          newNodes.push({
            id,
            type: 'lifecycleNode',
            position: { x: maxX + i * (NODE_W + 80), y: 80 + (i % 2) * 30 },
            data: {
              label: n.label,
              category: n.category as NodeCategory,
              status: 'generating',
              description: n.description || '',
              content: n.content || '',
              version: 1,
              lastUpdated: Date.now(),
              sections: n.sections?.map((s, si) => ({
                id: `s${si}`, title: s.title, status: 'current' as const,
              })),
            },
          });
        });

        // Map from wf index to actual node — check both new and existing by label
        const wfNodeMap = wf.nodes.map(n => {
          const existing = existingNodes.find(en => en.data.label.toLowerCase() === n.label.toLowerCase());
          if (existing) return existing;
          return newNodes.find(nn => nn.data.label.toLowerCase() === n.label.toLowerCase());
        });

        wf.edges?.forEach(e => {
          const srcNode = wfNodeMap[e.from];
          const tgtNode = wfNodeMap[e.to];
          if (srcNode && tgtNode) {
            // Skip duplicate edges
            const edgeExists = existingEdges.some(ee => ee.source === srcNode.id && ee.target === tgtNode.id);
            if (edgeExists) return;
            newEdges.push(createStyledEdge(srcNode.id, tgtNode.id, e.label || 'drives'));
          }
        });

        // Cancel any in-flight animation from a previous generation
        clearAnimationTimers();

        if (isExtending) {
          // Extend mode: append new nodes and edges to existing graph
          newNodes.forEach((node, i) => {
            trackTimeout(() => {
              set(s => ({ nodes: [...s.nodes, node] }));
              get().requestFitView();
            }, 200 + i * 300);
          });
          const extEdgeStart = 200 + newNodes.length * 300 + 200;
          newEdges.forEach((edge, i) => {
            trackTimeout(() => {
              set(s => ({ edges: [...s.edges, edge] }));
              if (i === newEdges.length - 1) get().requestFitView();
            }, extEdgeStart + i * 120);
          });
          const extFinish = extEdgeStart + newEdges.length * 120 + 300;
          trackTimeout(() => {
            set(s => ({
              nodes: s.nodes.map(n => ({
                ...n,
                data: { ...n.data, status: n.data.status === 'generating' ? 'active' as const : n.data.status },
              })),
              isProcessing: false,
                         }));
            postBuildFinalize(get);
          }, extFinish);
        } else {
          // Fresh build: replace everything
          set({ nodes: [], edges: [] });
          newNodes.forEach((node, i) => {
            trackTimeout(() => {
              set(s => ({ nodes: [...s.nodes, node] }));
              get().requestFitView();
            }, 200 + i * 300);
          });
          const chatEdgeStart = 200 + newNodes.length * 300 + 200;
          newEdges.forEach((edge, i) => {
            trackTimeout(() => {
              set(s => ({ edges: [...s.edges, edge] }));
              if (i === newEdges.length - 1) get().requestFitView();
            }, chatEdgeStart + i * 120);
          });
          const chatFinish = chatEdgeStart + newEdges.length * 120 + 300;
          trackTimeout(() => {
            set(s => ({
              nodes: s.nodes.map(n => ({
                ...n,
                data: { ...n.data, status: n.data.status === 'generating' ? 'active' as const : n.data.status },
              })),
              isProcessing: false,
                         }));
            postBuildFinalize(get);
          }, chatFinish);
        }

        // Record build in CID memory
        recordBuild({
          prompt: prompt.slice(0, 120),
          nodeCount: newNodes.length,
          edgeCount: newEdges.length,
          nodeLabels: newNodes.map(n => n.data.label),
          timestamp: Date.now(),
          mode: 'api',
        });

        // Layer 5: Run real reflection on this interaction
        runReflection(curMode, prompt, result.message || `Built ${newNodes.length}-node workflow`);
        // Track domain expertise: increment workflowsBuilt for matching domains
        for (const domain of loadedHabits[curMode].domainExpertise) {
          if (prompt.toLowerCase().includes(domain.domain.toLowerCase().split(' ')[0])) {
            domain.workflowsBuilt++;
          }
        }

        // Workflow diff summary for extend mode
        const diffSuffix = isExtending && (newNodes.length > 0 || newEdges.length > 0)
          ? `\n\n📊 **Diff:** +${newNodes.length} node${newNodes.length !== 1 ? 's' : ''}, +${newEdges.length} edge${newEdges.length !== 1 ? 's' : ''} → ${existingNodes.length + newNodes.length} total nodes`
          : '';

        const buildChatMsgId = uid();
        // Delay suggestion generation until after build finishes (use current state + new counts)
        const buildSuggestions = getSmartSuggestions(
          [...existingNodes, ...newNodes],
          [...existingEdges, ...newEdges],
        );
        store.addMessage({ id: buildChatMsgId, role: 'cid', content: '', timestamp: Date.now(), suggestions: buildSuggestions });
        streamMessageToStore(buildChatMsgId, result.message + diffSuffix, store.updateStreamingMessage);
      } else {
        // Chat-only response — stream word-by-word with smart follow-ups
        const chatMsgId = uid();
        const suggestions = getSmartSuggestions(get().nodes, get().edges);
        store.addMessage({ id: chatMsgId, role: 'cid', content: '', timestamp: Date.now(), suggestions });
        streamMessageToStore(chatMsgId, result.message, store.updateStreamingMessage, () => {
          set({ isProcessing: false });
        });
        // Layer 5: Reflect on chat-only interaction too
        runReflection(curMode, prompt, result.message);
      }
    } catch {
      // Layer 4: Track error in generation state
      const errMode = store.cidMode;
      sessionGeneration[errMode].errorCount++;
      sessionGeneration[errMode].successStreak = 0;

      // Remove thinking, fallback to template
      set(s => ({
        messages: s.messages.filter(m => m.id !== thinkingId),
        isProcessing: false,
      }));
      const fallbackMsg = agent.responses.fallback(prompt, get().nodes, get().edges);
      store.addMessage({ id: uid(), role: 'cid', content: fallbackMsg, timestamp: Date.now() });
    }
  },

  generateWorkflow: (prompt) => {
    const store = get();
    const { cidMode, poirotContext } = store;
    cidLog('generateWorkflow', { prompt: prompt.slice(0, 80), mode: cidMode });

    const agent = getAgent(cidMode);

    // Interview mode: agents with interviewEnabled start interview instead of building
    // Adaptive: detect prompt signals to skip already-answered questions
    if (agent.interviewEnabled && poirotContext.phase === 'idle') {
      store.addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      const allQuestions = getInterviewQuestions(prompt, store.nodes, store.edges, cidMode);
      const { questions: adaptiveQuestions, preAnswers } = getAdaptiveInterview(prompt, store.nodes, store.edges, cidMode);

      // If all questions were pre-answered by signals, skip interview entirely
      if (adaptiveQuestions.length === 0) {
        const enrichedPrompt = buildEnrichedPrompt(prompt, preAnswers, allQuestions);
        set({ poirotContext: { phase: 'revealing', originalPrompt: prompt, answers: preAnswers, questionIndex: allQuestions.length } });
        setTimeout(() => {
          store.addMessage({
            id: `msg-${Date.now()}-reveal`, role: 'cid',
            content: agent.interviewReveal,
            timestamp: Date.now(), action: 'investigating',
          });
          setTimeout(() => {
            store.generateWorkflow(enrichedPrompt);
            set({ poirotContext: { phase: 'idle', originalPrompt: '', answers: {}, questionIndex: 0 } });
          }, 1500);
        }, 600);
        return;
      }

      set({ poirotContext: { phase: 'interviewing', originalPrompt: prompt, answers: preAnswers, questionIndex: 0 } });
      setTimeout(() => {
        store.addMessage({
          id: `msg-${Date.now()}-ack`, role: 'cid',
          content: agent.interviewAck,
          timestamp: Date.now(),
        });
        setTimeout(() => {
          const q = adaptiveQuestions[0];
          store.addMessage({
            id: `msg-${Date.now()}-q0`, role: 'cid',
            content: q.question,
            timestamp: Date.now(),
            cards: q.cards,
            cardPrompt: q.question,
          });
        }, 1200);
      }, 500);
      return;
    }

    store.pushHistory();
    store.setProcessing(true);
    if (!agent.interviewEnabled || poirotContext.phase !== 'revealing') {
      store.addMessage({ id: uid(), role: 'user', content: prompt, timestamp: Date.now() });
    }
    const thinkingId = uid();
    store.addMessage({
      id: thinkingId, role: 'cid',
      content: poirotContext.phase === 'revealing' ? agent.revealAck : agent.buildingAck,
      timestamp: Date.now(), action: 'thinking',
    });

    // Try API-powered generation first, fall back to template-based
    const buildStartTime = Date.now();
    const tryAPIGeneration = async () => {
      cidLog('tryAPIGeneration', 'attempting API call...');
      try {
        const agentConfig = getAgent(cidMode);
        // Set taskType for goal declaration injection
        sessionGeneration[cidMode].context.taskType = 'generate';
        const agentLayers = getAgentLayers(cidMode);
        const systemPrompt = buildSystemPrompt(cidMode, store.nodes, store.edges, store.cidRules, agentConfig, agentLayers);
        const chatHistory = store.messages
          .filter(m => m.content && !m.action)
          .map(m => ({ role: m.role as 'user' | 'cid', content: m.content }));
        const messages = buildMessages(chatHistory, `Build a workflow for: ${prompt}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);
        const res = await fetch('/api/cid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt, messages, model: get().cidAIModel, taskType: 'generate' }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await res.json();
        if (data.error) return false;

        const result = data.result as {
          message: string;
          workflow: null | {
            nodes: Array<{ label: string; category: string; description: string; content?: string; sections?: Array<{ title: string; content?: string }> }>;
            edges: Array<{ from: number; to: number; label: string }>;
          };
        };

        if (!result.workflow?.nodes?.length) return false;

        set(s => ({ messages: s.messages.filter(m => m.id !== thinkingId), aiEnabled: true }));

        const wf = result.workflow;
        const newNodes: Node<NodeData>[] = [];
        const newEdges: Edge[] = [];
        const ctx = get().centralContext;
        const sourceHash = ctx ? btoa(ctx.source.content.slice(0, 500)).slice(0, 32) : '';

        wf.nodes.forEach((n, i) => {
          const id = uid();
          // Attach artifact contract if central context exists and node is a deliverable
          const isDeliverable = ['deliverable', 'artifact', 'output'].includes(n.category);
          const contract: ArtifactContract | undefined = (ctx && isDeliverable) ? {
            nodeId: id,
            artifactType: n.label.toLowerCase().replace(/\s+/g, '-'),
            derivedFields: [{ field: 'body', sourceMapping: 'full source', transform: 'generate' }],
            generationPrompt: prompt,
            model: get().cidAIModel,
            lastSyncedAt: Date.now(),
            lastSourceHash: sourceHash,
            syncStatus: 'current',
            userEdits: [],
          } : undefined;

          newNodes.push({
            id,
            type: 'lifecycleNode',
            position: { x: i * (NODE_W + 80), y: 80 + (i % 2) * 30 },
            data: {
              label: n.label,
              category: n.category as NodeCategory,
              status: 'generating',
              description: n.description || '',
              content: n.content || '',
              version: 1,
              lastUpdated: Date.now(),
              sections: n.sections?.map((s, si) => ({
                id: `s${si}`, title: s.title, status: 'current' as const,
              })),
              ...(contract && { artifactContract: contract }),
            },
          });

          // Register in central context artifacts
          if (contract && ctx) {
            const artifacts = get().centralContext?.artifacts ?? {};
            artifacts[id] = contract;
            set(s => ({ centralContext: s.centralContext ? { ...s.centralContext, artifacts } : null }));
          }
        });

        wf.edges?.forEach(e => {
          if (newNodes[e.from] && newNodes[e.to]) {
            newEdges.push(createStyledEdge(newNodes[e.from].id, newNodes[e.to].id, e.label || 'drives'));
          }
        });

        // Cancel any in-flight animation from a previous generation
        clearAnimationTimers();

        // Animate nodes appearing with fitView, then edges one-by-one
        set({ nodes: [], edges: [] });
        newNodes.forEach((node, i) => {
          trackTimeout(() => {
            set(s => ({ nodes: [...s.nodes, node] }));
            get().requestFitView();
          }, 200 + i * 300);
        });
        const edgeStart = 200 + newNodes.length * 300 + 200;
        newEdges.forEach((edge, i) => {
          trackTimeout(() => {
            set(s => ({ edges: [...s.edges, edge] }));
            if (i === newEdges.length - 1) get().requestFitView();
          }, edgeStart + i * 120);
        });
        const finishTime = edgeStart + newEdges.length * 120 + 300;
        trackTimeout(() => {
          set(s => {
            const nodes = s.nodes.map(n => ({
              ...n,
              data: { ...n.data, status: n.data.status === 'generating' ? 'active' as const : n.data.status },
            }));
            saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
            return { nodes, isProcessing: false };
          });
          postBuildFinalize(get);
        }, finishTime);

        recordBuild({ prompt: prompt.slice(0, 120), nodeCount: newNodes.length, edgeCount: newEdges.length, nodeLabels: newNodes.map(n => n.data.label), timestamp: Date.now(), mode: 'api' });
        const buildElapsed = ((Date.now() - buildStartTime) / 1000).toFixed(1);
        const categories = [...new Set(newNodes.map(n => n.data.category))];
        const buildRecap = `\n\n⏱ Built in ${buildElapsed}s · ${newNodes.length} nodes (${categories.join(', ')}) · ${newEdges.length} edges`;
        store.addMessage({ id: uid(), role: 'cid', content: result.message + buildRecap, timestamp: Date.now() });
        return true;
      } catch {
        return false;
      }
    };

    // Attempt API, fall back to template
    tryAPIGeneration().then(success => {
      cidLog('tryAPIGeneration', success ? 'API succeeded' : 'API failed, falling back to template');
      if (!success) fallbackGenerate(prompt, thinkingId);
    });

    function fallbackGenerate(prompt: string, thinkingId: string) {
      // Remove the thinking placeholder — we'll use a compact building message
      set(s => ({ messages: s.messages.filter(m => m.id !== thinkingId) }));
      const buildMsgId = uid();
      store.addMessage({
        id: buildMsgId, role: 'cid',
        content: poirotContext.phase === 'revealing' ? agent.revealAck : agent.buildingAck,
        timestamp: Date.now(), action: 'building',
      });

      const { nodes: newNodes, edges: newEdges, events: newEvents } = buildNodesFromPrompt(prompt, uid, cidLog);
      const delay = 600;

      // Cancel any in-flight animation from a previous generation
      clearAnimationTimers();

      set({ nodes: [], edges: [] });

      // Step-by-step build — nodes appear on canvas one-by-one with fitView
      newNodes.forEach((node, i) => {
        trackTimeout(() => {
          set((s) => ({ nodes: [...s.nodes, node] }));
          if (newEvents[i]) {
            set((s) => ({ events: [newEvents[i], ...s.events] }));
          }
          // Update the building message with current step
          const stepLabel = node.data.serviceName
            ? `${node.data.serviceIcon || '🔗'} ${node.data.label}`
            : `${node.data.label}`;
          store.updateStreamingMessage(buildMsgId, `${i + 1}/${newNodes.length} — ${stepLabel}`);
          // Auto-fit canvas to show all nodes as they appear
          get().requestFitView();
        }, delay + i * 400);
      });

      const fbEdgeStart = delay + newNodes.length * 400 + 300;
      newEdges.forEach((edge, i) => {
        trackTimeout(() => {
          set(s => ({ edges: [...s.edges, edge] }));
          if (i === newEdges.length - 1) get().requestFitView();
        }, fbEdgeStart + i * 120);
      });
      const fbFinish = fbEdgeStart + newEdges.length * 120 + 200;

      trackTimeout(() => {
        // Remove building progress message
        set(s => ({ messages: s.messages.filter(m => m.id !== buildMsgId) }));

        set((s) => {
          const nodes = s.nodes.map((n) => ({
            ...n,
            data: { ...n.data, status: n.data.status === 'generating' ? 'active' as const : n.data.status },
          }));
          saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
          return { nodes, isProcessing: false };
        });

        trackTimeout(() => {
          const currentStore = get();
          if (currentStore.nodes.length > 2) currentStore.optimizeLayout();
        }, 500);

        trackTimeout(() => {
          const currentStore = get();
          if (currentStore.nodes.length >= 3) {
            const result = currentStore.cidSolve();
            if (result.created > 0) {
              const ag = getAgent(get().cidMode);
              store.addMessage({
                id: uid(), role: 'cid',
                content: ag.responses.buildCompleteWithFixes(newNodes.length, newEdges.length, result.message),
                timestamp: Date.now(),
              });
              return;
            }
          }
          const ag = getAgent(get().cidMode);
          store.addMessage({
            id: uid(), role: 'cid',
            content: ag.responses.buildComplete(newNodes.length, newEdges.length),
            timestamp: Date.now(),
          });
          // Proactive post-build suggestions after a short delay
          trackTimeout(() => {
            const s = get();
            const dismissed = s._dismissedSuggestionIds;
            const proactive = generateProactiveSuggestions(s.nodes, s.edges)
              .filter(ps => !dismissed.has(ps.id));
            const formatted = formatSuggestionsMessage(proactive, 'post-build');
            if (formatted) {
              store.addMessage({ id: uid(), role: 'cid', content: formatted.content, timestamp: Date.now(), suggestions: formatted.suggestionChips });
              set({ _lastSuggestions: proactive });
            }
          }, 2000);
        }, 1200);
      }, fbFinish + 300);
    }
  },

  // Chat management
  clearMessages: () => {
    const agent = getAgent(get().cidMode);
    set({ messages: [{ id: `msg-${Date.now()}`, role: 'cid' as const, content: agent.welcome, timestamp: Date.now() }] });
    const s = get();
    saveToStorage({ nodes: s.nodes, edges: s.edges, events: s.events, messages: s.messages });
  },

  exportChatHistory: () => {
    const { messages, cidMode } = get();
    const agent = getAgent(cidMode);
    const lines = [`Chat History — ${agent.name}`, `Exported: ${new Date().toLocaleString()}`, '---', ''];
    messages.forEach(m => {
      if (m.action === 'thinking' || m.action === 'investigating' || m.action === 'building') return;
      const sender = m.role === 'user' ? 'You' : agent.name;
      lines.push(`[${sender}] ${m.content}`);
      lines.push('');
    });
    return lines.join('\n');
  },

  stopProcessing: () => {
    set(s => {
      // Remove thinking/investigating placeholders, but keep messages that have streamed content
      const messages = s.messages.filter(m => {
        if (m.action === 'thinking' || m.action === 'investigating' || m.action === 'building') {
          // Keep if it has actual content (was being streamed)
          return m.action !== 'building' && m.content.trim().length > 0;
        }
        return true;
      }).map(m => {
        // Clear the action flag on preserved messages so they render normally
        if ((m.action === 'thinking' || m.action === 'investigating') && m.content.trim().length > 0) {
          return { ...m, action: undefined };
        }
        return m;
      });
      saveToStorage({ nodes: s.nodes, edges: s.edges, events: s.events, messages });
      return { isProcessing: false, messages, _executingNodeIds: new Set() };
    });
  },

  deleteMessage: (id) => {
    set(s => {
      const messages = s.messages.filter(m => m.id !== id);
      saveToStorage({ nodes: s.nodes, edges: s.edges, events: s.events, messages });
      return { messages };
    });
  },

  // ── Projects ──
  currentProjectId: initialProjectId,
  currentProjectName: initialProjectName,

  newProject: () => {
    const store = get();
    const agent = getAgent(store.cidMode);

    // Save current project before creating new one
    if (store.currentProjectId) {
      flushSave();
    }

    // Reset nodeCounter for fresh project to avoid ID collisions
    nodeCounter = 100;

    // Create new project in storage
    const projectName = `Project ${listStorageProjects().length + 1}`;
    const newId = createStorageProject(projectName);

    const fresh = {
      nodes: [] as Node<NodeData>[],
      edges: [] as Edge[],
      events: [] as LifecycleEvent[],
      messages: [{ id: `msg-${Date.now()}`, role: 'cid' as const, content: agent.welcome, timestamp: Date.now() }],
      selectedNodeId: null,
      isProcessing: false,
      history: [] as UndoOperation[],
      future: [] as UndoOperation[],
      poirotContext: { phase: 'idle' as const, originalPrompt: '', answers: {}, questionIndex: 0 },
      currentProjectId: newId,
      currentProjectName: projectName,
      centralContext: null as CentralContext | null,
    };
    set(fresh);
    saveToStorage({ nodes: fresh.nodes, edges: fresh.edges, events: fresh.events, messages: fresh.messages });
  },

  switchProject: (id: string) => {
    const store = get();
    // Save current project first
    if (store.currentProjectId) {
      flushSave();
    }

    // Load target project
    const data = loadProject(id);
    if (!data) {
      store.addToast('Project not found', 'error');
      return;
    }

    const projects = listStorageProjects();
    const meta = projects.find(p => p.id === id);

    // Restore nodeCounter from loaded nodes+messages (always reset to match this project)
    const loadedNodes = (data.nodes || []) as Node<NodeData>[];
    initNodeCounter([loadedNodes, (data.messages || []) as { id: string }[], (data.events || []) as { id: string }[]]);

    set({
      nodes: loadedNodes,
      edges: (data.edges || []) as Edge[],
      events: (data.events || []) as LifecycleEvent[],
      messages: (data.messages || []) as CIDMessage[],
      selectedNodeId: null,
           activeArtifactNodeId: null,
      contextMenu: null,
      history: [] as UndoOperation[],
      future: [] as UndoOperation[],
      isProcessing: false,
      currentProjectId: id,
      currentProjectName: meta?.name || 'Untitled',
    });

    // Update legacy key too
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    cidLog('switchProject', `Loaded project "${meta?.name}" (${loadedNodes.length} nodes)`);
  },

  renameCurrentProject: (name: string) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    flushSave();
    renameStorageProject(currentProjectId, name);
    set({ currentProjectName: name });
  },

  deleteCurrentProject: () => {
    const store = get();
    if (!store.currentProjectId) return;

    const projects = listStorageProjects();
    if (projects.length <= 1) {
      store.addToast('Cannot delete the only project', 'warning');
      return;
    }

    deleteStorageProject(store.currentProjectId);

    // Switch to another project
    const remaining = listStorageProjects();
    if (remaining.length > 0) {
      store.switchProject(remaining[0].id);
    }
  },

  listProjects: () => listStorageProjects(),

  loadTemplate: (templateName) => {
    const store = get();
    const templates: Record<string, { nodes: Array<{ label: string; category: NodeCategory; description: string; inputType?: 'text' | 'url' | 'file'; acceptedFileTypes?: string[] }>; edges: Array<{ from: number; to: number; label: string }> }> = {
      'Software Development': {
        nodes: [
          { label: 'Requirements', category: 'input', description: 'User stories, feature specs, and acceptance criteria from stakeholders', inputType: 'file', acceptedFileTypes: ['.pdf', '.docx', '.txt', '.md'] },
          { label: 'Design', category: 'deliverable', description: 'Create architecture diagrams, API contracts, and UI wireframes based on the requirements. Output a concise design document.' },
          { label: 'Development', category: 'process', description: 'Implement the code based on the design document. List the key modules built and their status.' },
          { label: 'Code Review', category: 'review', description: 'Review the implementation for correctness, style, security issues, and adherence to the design. Approve or request changes.' },
          { label: 'Testing', category: 'review', description: 'Run unit tests, integration tests, and manual QA against the acceptance criteria. Report pass/fail results.' },
          { label: 'Deployment', category: 'deliverable', description: 'Deploy to production and confirm the release is live.' },
          { label: 'Monitoring', category: 'process', description: 'Track error rates, latency, and user metrics post-deployment. Report any anomalies.' },
        ],
        edges: [
          { from: 0, to: 1, label: 'drives' }, { from: 1, to: 2, label: 'feeds' },
          { from: 2, to: 3, label: 'triggers' }, { from: 3, to: 4, label: 'validates' },
          { from: 4, to: 5, label: 'approves' }, { from: 5, to: 6, label: 'triggers' },
        ],
      },
      'Content Pipeline': {
        nodes: [
          { label: 'Research', category: 'input', description: 'Topic research, audience analysis, and competitive landscape', inputType: 'file', acceptedFileTypes: ['.pdf', '.docx', '.txt', '.md', '.csv'] },
          { label: 'Brief', category: 'deliverable', description: 'Write a content brief with target audience, key messages, SEO keywords, and outline structure.' },
          { label: 'Writing', category: 'process', description: 'Draft the full article or content piece based on the brief. Write in a clear, engaging style with proper markdown formatting.' },
          { label: 'Editorial Review', category: 'review', description: 'Review the draft for clarity, accuracy, tone, grammar, and alignment with the brief. Note specific improvements needed.' },
          { label: 'SEO & Format', category: 'review', description: 'Check SEO: title tag, meta description, heading hierarchy, keyword density, internal links. Verify formatting meets publishing standards.' },
          { label: 'Published Article', category: 'deliverable', description: 'Final published content ready for distribution.' },
        ],
        edges: [
          { from: 0, to: 1, label: 'drives' }, { from: 1, to: 2, label: 'feeds' },
          { from: 2, to: 3, label: 'triggers' }, { from: 3, to: 4, label: 'validates' },
          { from: 4, to: 5, label: 'outputs' },
        ],
      },
      'Incident Response': {
        nodes: [
          { label: 'Incident Alert', category: 'input', description: 'Incoming incident report: what happened, when, affected systems, severity' },
          { label: 'Triage', category: 'process', description: 'Assess severity (P1-P4), identify affected services, assign incident commander, and set up communication channel.' },
          { label: 'Investigation', category: 'process', description: 'Analyze logs, metrics, and traces to identify root cause. Document the timeline of events and contributing factors.' },
          { label: 'Resolution', category: 'process', description: 'Apply the fix: rollback, hotfix, config change, or scaling action. Verify the fix resolves the issue.' },
          { label: 'Incident Review', category: 'review', description: 'Review the response: Was triage fast enough? Was communication clear? Were the right people involved? Note what went well and what to improve.' },
          { label: 'Postmortem', category: 'deliverable', description: 'Write a blameless postmortem with timeline, root cause, impact, action items, and lessons learned.' },
        ],
        edges: [
          { from: 0, to: 1, label: 'triggers' }, { from: 1, to: 2, label: 'drives' },
          { from: 2, to: 3, label: 'feeds' }, { from: 3, to: 4, label: 'triggers' },
          { from: 4, to: 5, label: 'approves' },
        ],
      },
      'Product Launch': {
        nodes: [
          { label: 'Market Research', category: 'input', description: 'Competitive analysis, user interviews, market sizing, and user needs assessment', inputType: 'file', acceptedFileTypes: ['.pdf', '.docx', '.txt', '.csv', '.xlsx'] },
          { label: 'PRD', category: 'deliverable', description: 'Write a product requirements document: problem statement, target users, key features, success metrics, and constraints.' },
          { label: 'Design & Build', category: 'process', description: 'Design the solution architecture and implement the core features. List key decisions, tradeoffs, and technical approach.' },
          { label: 'Beta Testing', category: 'review', description: 'Run beta with target users. Collect feedback on usability, bugs, and feature gaps. Summarize findings and recommend go/no-go.' },
          { label: 'Marketing Plan', category: 'deliverable', description: 'Create go-to-market strategy: positioning, channels, launch timeline, budget, and success KPIs.' },
          { label: 'Launch', category: 'deliverable', description: 'Execute the launch: deploy to production, publish marketing materials, and announce to users.' },
          { label: 'Post-Launch Metrics', category: 'process', description: 'Track adoption, activation, retention, and revenue KPIs for the first 30 days. Flag any metrics below target.' },
        ],
        edges: [
          { from: 0, to: 1, label: 'drives' }, { from: 1, to: 2, label: 'feeds' },
          { from: 0, to: 4, label: 'drives' }, { from: 2, to: 3, label: 'triggers' },
          { from: 3, to: 5, label: 'approves' }, { from: 4, to: 5, label: 'feeds' },
          { from: 5, to: 6, label: 'triggers' },
        ],
      },
      'Chatbot': {
        nodes: [
          { label: 'User Message', category: 'input', description: 'Incoming user query or command' },
          { label: 'Intent Detection', category: 'process', description: 'Classify the user message into one of: greeting, question, command, feedback, escalation. Return ONLY the classified intent and a one-line summary.' },
          { label: 'Context & Knowledge', category: 'process', description: 'Organize the conversation context. Summarize what the user wants based on the detected intent and any prior context. List key topics mentioned.' },
          { label: 'Response Generation', category: 'process', description: 'Generate a helpful, friendly chatbot response to the user based on the intent classification and context summary. Be conversational and concise. Respond directly to what the user said.' },
          { label: 'Safety Check', category: 'review', description: 'Review the generated response. Check for: harmful content, PII exposure, hallucinated facts, off-topic drift. If the response is safe, pass it through unchanged. If not, flag the issue.' },
          { label: 'Fallback Handler', category: 'process', description: 'If the safety check flagged issues or the intent was unclear, generate a safe fallback response asking for clarification. Otherwise pass through the approved response unchanged.' },
          { label: 'Bot Reply', category: 'deliverable', description: 'Format and deliver the final chatbot response to the user. Pass through the response content from upstream as the final output.' },
        ],
        edges: [
          { from: 0, to: 1, label: 'triggers' }, { from: 1, to: 2, label: 'drives' },
          { from: 2, to: 3, label: 'feeds' }, { from: 3, to: 4, label: 'validates' },
          { from: 4, to: 5, label: 'feeds' }, { from: 5, to: 6, label: 'outputs' },
        ],
      },
      'Course Design': {
        nodes: [
          { label: 'Syllabus', category: 'input', description: 'The uploaded or authored course syllabus: title, description, schedule, policies, and high-level topic sequence.', inputType: 'file', acceptedFileTypes: ['.pdf', '.docx', '.txt', '.md'] },
          { label: 'Learning Objectives', category: 'process', description: 'Extract and organize the course-level learning objectives from the syllabus. Use Bloom\'s taxonomy verbs. Map each objective to the weeks/modules it spans.' },
          { label: 'Lesson Plans', category: 'deliverable', description: 'Generate a lesson plan for each module/week. Include topics, activities, timing, and which learning objectives each lesson addresses.' },
          { label: 'Assignments', category: 'deliverable', description: 'Design assignments aligned to the lesson plans. Each assignment should reference specific learning objectives and lesson topics. Include format, length, and submission guidelines.' },
          { label: 'Rubrics', category: 'deliverable', description: 'Create grading rubrics for each assignment. Define criteria, performance levels, and point allocations that map directly to the assignment requirements.' },
          { label: 'Quiz Bank', category: 'deliverable', description: 'Generate a bank of quiz and exam questions organized by lesson/module. Include multiple question types (MCQ, short answer, essay prompts) covering key concepts from the lesson plans.' },
          { label: 'Study Guide', category: 'deliverable', description: 'Compile a student-facing study guide summarizing key concepts, vocabulary, and review questions for each module. Cross-reference lesson plans and quiz bank topics.' },
          { label: 'Course FAQ', category: 'deliverable', description: 'Generate a comprehensive course FAQ answering common student questions about assignments, grading policies, schedule, and study strategies based on all upstream artifacts.' },
        ],
        edges: [
          // Core chain: Syllabus → Objectives → Lesson Plans
          { from: 0, to: 1, label: 'derives' }, { from: 1, to: 2, label: 'structures' },
          // Lesson Plans produce downstream deliverables
          { from: 2, to: 3, label: 'produces' }, { from: 2, to: 5, label: 'tests' }, { from: 2, to: 6, label: 'guides' },
          // Assignments connect to everything they affect
          { from: 3, to: 4, label: 'validates' }, { from: 3, to: 5, label: 'feeds' }, { from: 3, to: 6, label: 'feeds' },
          // Quiz Bank and Rubrics feed into Study Guide
          { from: 5, to: 6, label: 'feeds' }, { from: 4, to: 7, label: 'feeds' },
          // Study Guide + Assignments feed FAQ
          { from: 6, to: 7, label: 'answers' }, { from: 3, to: 7, label: 'feeds' },
        ],
      },
      'Lesson Planning': {
        nodes: [
          { label: 'Topic', category: 'input', description: 'The lesson topic or theme, including any prerequisites, target audience, and time constraints.' },
          { label: 'Learning Goals', category: 'process', description: 'Define specific, measurable learning goals for this lesson using Bloom\'s taxonomy. State what students should know or be able to do by the end.' },
          { label: 'Activities', category: 'process', description: 'Design a sequence of learning activities (lecture segments, discussions, group work, practice problems) with timing. Each activity should map to at least one learning goal.' },
          { label: 'Materials', category: 'deliverable', description: 'List and create supporting materials: slide outlines, handouts, readings, media links, and any scaffolding resources needed for the activities.' },
          { label: 'Assessment', category: 'deliverable', description: 'Create formative and/or summative assessments to measure whether learning goals were met. Include exit tickets, quiz questions, or short assignments with answer keys.' },
          { label: 'Reflection', category: 'review', description: 'Post-lesson reflection template: What worked? What didn\'t? Were learning goals met? Student engagement observations and adjustments for next time.' },
        ],
        edges: [
          { from: 0, to: 1, label: 'defines' }, { from: 1, to: 2, label: 'guides' },
          { from: 2, to: 3, label: 'supports' }, { from: 2, to: 4, label: 'evaluates' },
          { from: 4, to: 5, label: 'refines' },
        ],
      },
      'Assignment Design': {
        nodes: [
          { label: 'Brief', category: 'input', description: 'The assignment brief: what students should produce, the learning objectives it assesses, target skill level, and any constraints (length, format, tools allowed).', inputType: 'file', acceptedFileTypes: ['.pdf', '.docx', '.txt', '.md'] },
          { label: 'Requirements', category: 'process', description: 'Break the brief into detailed, actionable requirements. List deliverables, evaluation criteria, academic integrity expectations, and submission format.' },
          { label: 'Rubric', category: 'deliverable', description: 'Build a detailed grading rubric with criteria derived from the requirements. Define performance levels (excellent, proficient, developing, beginning) with point allocations and descriptors.' },
          { label: 'Sample Solution', category: 'deliverable', description: 'Produce an exemplary sample solution or annotated example that meets all rubric criteria at the highest level. Include inline notes explaining why each element earns full marks.' },
          { label: 'Student Guide', category: 'deliverable', description: 'Write a student-facing guide that explains the assignment expectations, tips for success, common pitfalls to avoid, and how the rubric will be applied. Reference the requirements without revealing the sample solution.' },
        ],
        edges: [
          { from: 0, to: 1, label: 'specifies' }, { from: 1, to: 2, label: 'validates' },
          { from: 2, to: 3, label: 'demonstrates' }, { from: 2, to: 4, label: 'guides' },
        ],
      },
    };

    const template = templates[templateName];
    if (!template) { store.addToast(`Template "${templateName}" not found`, 'warning'); return; }

    store.pushHistory();
    clearAnimationTimers();

    const newNodes: Node<NodeData>[] = template.nodes.map((n, i) => ({
      id: uid(),
      type: 'lifecycleNode',
      position: { x: i * (NODE_W + 80), y: 80 + (i % 2) * 30 },
      data: {
        label: n.label, category: n.category, status: 'generating' as const,
        description: n.description, version: 1, lastUpdated: Date.now(),
        ...(n.inputType && { inputType: n.inputType }),
        ...(n.acceptedFileTypes && { acceptedFileTypes: n.acceptedFileTypes }),
      },
    }));

    const newEdges: Edge[] = template.edges.map(e => createStyledEdge(newNodes[e.from].id, newNodes[e.to].id, e.label));

    set({ nodes: [], edges: [] });
    newNodes.forEach((node, i) => {
      trackTimeout(() => {
        set(s => ({ nodes: [...s.nodes, node] }));
        get().requestFitView();
      }, 100 + i * 200);
    });
    const eStart = 100 + newNodes.length * 200 + 150;
    newEdges.forEach((edge, i) => {
      trackTimeout(() => {
        set(s => ({ edges: [...s.edges, edge] }));
        if (i === newEdges.length - 1) get().requestFitView();
      }, eStart + i * 80);
    });
    trackTimeout(() => {
      set(s => {
        const nodes = s.nodes.map(n => ({ ...n, data: { ...n.data, status: n.data.status === 'generating' ? 'active' as const : n.data.status } }));
        saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
        return { nodes };
      });
      trackTimeout(() => { if (get().nodes.length > 2) get().optimizeLayout(); }, 300);
    }, eStart + newEdges.length * 80 + 200);

    const agent = getAgent(get().cidMode);
    store.addMessage({ id: uid(), role: 'cid', content: `Loaded **${templateName}** template — ${newNodes.length} nodes, ${newEdges.length} connections. ${agent.name === 'Rowan' ? 'Ready to customize.' : 'Voilà! A foundation for your investigation.'}`, timestamp: Date.now() });
    store.addToast(`Template "${templateName}" loaded`, 'success');
  },

  connectByName: (prompt) => {
    cidLog('connectByName', prompt);
    const store = get();
    const { nodes, edges } = store;
    if (nodes.length < 2) return { success: false, message: 'Need at least 2 nodes to create a connection.' };

    // Parse "connect X to Y" or "link X to Y" patterns
    // Use greedy first capture (.+) to match the last separator, avoiding incorrect splits
    // when node names contain "to" (e.g., "connect Path to Production to Review Gate")
    const connectMatch = prompt.match(/(?:connect|link|wire|attach)\s+["']?(.+)["']?\s+(?:to|with|→|->)\s+["']?(.+?)["']?(?:\s+(?:with|as|label|using)\s+["']?(\w+)["']?)?$/i);
    if (!connectMatch) return { success: false, message: 'Could not parse connection. Try: "connect Node A to Node B" or "connect Node A to Node B with drives".' };

    const [, srcName, tgtName, edgeLabel] = connectMatch;

    const srcNode = findNodeByName(srcName, nodes);
    const tgtNode = findNodeByName(tgtName, nodes);

    if (!srcNode) return { success: false, message: `Could not find a node matching "${srcName}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };
    if (!tgtNode) return { success: false, message: `Could not find a node matching "${tgtName}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };
    if (srcNode.id === tgtNode.id) return { success: false, message: 'Cannot connect a node to itself.' };

    // Check if edge already exists
    if (edges.some(e => e.source === srcNode.id && e.target === tgtNode.id)) {
      return { success: false, message: `**${srcNode.data.label}** and **${tgtNode.data.label}** are already connected.` };
    }

    store.pushHistory();
    const label = edgeLabel || inferEdgeLabel(srcNode.data.category, tgtNode.data.category);
    const newEdge: Edge = createStyledEdge(srcNode.id, tgtNode.id, label);
    store.addEdge(newEdge);
    store.addEvent({
      id: `ev-${Date.now()}`, type: 'created',
      message: `Connected ${srcNode.data.label} → ${tgtNode.data.label} (${label})`,
      timestamp: Date.now(), agent: true,
    });

    return { success: true, message: `Connected **${srcNode.data.label}** → **${tgtNode.data.label}** with "${label}".` };
  },

  disconnectByName: (prompt) => {
    const store = get();
    const { nodes, edges } = store;
    if (edges.length === 0) return { success: false, message: 'No connections to remove.' };

    // Parse "disconnect X from Y"
    const match = prompt.match(/(?:disconnect|unlink|unwire|detach)\s+["']?(.+)["']?\s+(?:from|and|→|->)\s+["']?(.+?)["']?\s*$/i);
    if (!match) return { success: false, message: 'Could not parse. Try: "disconnect Node A from Node B".' };

    const [, nameA, nameB] = match;
    if (!nameA.trim() || !nameB.trim()) return { success: false, message: 'Could not parse. Try: "disconnect Node A from Node B".' };

    const nodeA = findNodeByName(nameA, nodes);
    const nodeB = findNodeByName(nameB, nodes);

    if (!nodeA) return { success: false, message: `No node matching "${nameA}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };
    if (!nodeB) return { success: false, message: `No node matching "${nameB}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };

    // Find edge in either direction
    const edge = edges.find(e =>
      (e.source === nodeA.id && e.target === nodeB.id) ||
      (e.source === nodeB.id && e.target === nodeA.id)
    );
    if (!edge) return { success: false, message: `**${nodeA.data.label}** and **${nodeB.data.label}** are not connected.` };

    store.pushHistory();
    store.deleteEdge(edge.id);
    store.addEvent({
      id: `ev-${Date.now()}`, type: 'edited',
      message: `Disconnected ${nodeA.data.label} ↔ ${nodeB.data.label}`,
      timestamp: Date.now(), agent: true,
    });

    return { success: true, message: `Disconnected **${nodeA.data.label}** from **${nodeB.data.label}**.` };
  },

  getStatusReport: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No workflow yet. Tell me what to build.';

    const _agent = getAgent(get().cidMode);
    const stale = nodes.filter(n => n.data.status === 'stale');
    const reviewing = nodes.filter(n => n.data.status === 'reviewing');
    const locked = nodes.filter(n => n.data.status === 'locked');
    const generating = nodes.filter(n => n.data.status === 'generating');
    const active = nodes.filter(n => n.data.status === 'active');
    const orphans = nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id));
    const hasReview = nodes.some(n => n.data.category === 'review');
    const categories = [...new Set(nodes.map(n => n.data.category))];

    const score = get().getHealthScore();

    const parts: string[] = [];
    parts.push(`### Graph Overview`);
    parts.push(`- **${nodes.length}** nodes, **${edges.length}** edges`);
    parts.push(`- Health: **${score}%** ${score >= 80 ? '(healthy)' : score >= 50 ? '(needs attention)' : '(critical)'}`);
    const cx = get().getComplexityScore();
    parts.push(`- Complexity: **${cx.score}** (${cx.label})`);
    parts.push(`- Categories: ${categories.join(', ')}`);
    parts.push('');

    parts.push(`### Status Breakdown`);
    if (active.length > 0) parts.push(`- **${active.length}** active`);
    if (stale.length > 0) parts.push(`- **${stale.length}** stale: ${stale.map(n => n.data.label).join(', ')}`);
    if (reviewing.length > 0) parts.push(`- **${reviewing.length}** reviewing: ${reviewing.map(n => n.data.label).join(', ')}`);
    if (locked.length > 0) parts.push(`- **${locked.length}** locked: ${locked.map(n => n.data.label).join(', ')}`);
    if (generating.length > 0) parts.push(`- **${generating.length}** generating`);
    parts.push('');

    // Issues
    const issues: string[] = [];
    if (stale.length > 0) issues.push(`Propagate ${stale.length} stale node${stale.length > 1 ? 's' : ''}`);
    if (orphans.length > 0) issues.push(`Connect ${orphans.length} orphaned node${orphans.length > 1 ? 's' : ''}: ${orphans.map(n => n.data.label).join(', ')}`);
    if (!hasReview) issues.push('Add a review gate for quality control');
    if (reviewing.length > 0) issues.push(`Approve ${reviewing.length} node${reviewing.length > 1 ? 's' : ''} in review`);

    if (issues.length > 0) {
      parts.push(`### Action Items`);
      issues.forEach((issue, i) => parts.push(`${i + 1}. ${issue}`));
    } else {
      parts.push(`### Status: All Clear`);
      parts.push('No issues detected. The workflow is healthy.');
    }

    return parts.join('\n');
  },

  deleteByName: (prompt) => {
    cidLog('deleteByName', prompt);
    const store = get();
    const { nodes, edges } = store;
    if (nodes.length === 0) return { success: false, message: 'No nodes to delete.' };

    const match = prompt.match(/(?:delete|remove|drop|destroy)\s+["']?(.+?)["']?\s*$/i);
    if (!match || !match[1].trim()) return { success: false, message: 'Could not parse. Try: "delete Node Name".' };

    const name = match[1].trim();
    const node = findNodeByName(name, nodes);

    if (!node) return { success: false, message: `No node matching "${name}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };

    const connCount = edges.filter(e => e.source === node.id || e.target === node.id).length;
    store.pushHistory();
    store.deleteNode(node.id);

    return { success: true, message: `Deleted **${node.data.label}**${connCount > 0 ? ` and removed ${connCount} connection${connCount > 1 ? 's' : ''}` : ''}.` };
  },

  renameByName: (prompt) => {
    const store = get();
    const { nodes } = store;
    if (nodes.length === 0) return { success: false, message: 'No nodes to rename.' };

    const match = prompt.match(/(?:rename|change name|relabel)\s+["']?(.+)["']?\s+(?:to|as|→|->)\s+["']?(.+?)["']?\s*$/i);
    if (!match || !match[1].trim() || !match[2].trim()) return { success: false, message: 'Could not parse. Try: "rename Old Name to New Name".' };

    const [, oldName, newName] = match;
    const node = findNodeByName(oldName, nodes);

    if (!node) return { success: false, message: `No node matching "${oldName}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };

    const trimmed = newName.trim();
    if (!trimmed) return { success: false, message: 'New name cannot be empty.' };

    const oldLabel = node.data.label;
    store.pushHistory();
    store.updateNodeData(node.id, { label: trimmed });
    store.addEvent({ id: `ev-${Date.now()}`, type: 'edited' as const, message: `Renamed "${oldLabel}" → "${trimmed}"`, timestamp: Date.now(), nodeId: node.id, agent: true });

    return { success: true, message: `Renamed **${oldLabel}** → **${trimmed}**.` };
  },

  explainWorkflow: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No workflow yet. Tell me what to build.';

    const _agent = getAgent(get().cidMode);

    // Find root nodes (no incoming edges)
    const hasIncoming = new Set(edges.map(e => e.target));
    const roots = nodes.filter(n => !hasIncoming.has(n.id));
    const leafIds = new Set(nodes.filter(n => !edges.some(e => e.source === n.id)).map(n => n.id));

    // BFS to describe flow
    const visited = new Set<string>();
    const flowSteps: string[] = [];
    const queue = roots.length > 0 ? [...roots] : [nodes[0]];

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node.id)) continue;
      visited.add(node.id);

      const outEdges = edges.filter(e => e.source === node.id);
      const targets = outEdges.map(e => {
        const t = nodes.find(n => n.id === e.target);
        return t ? `**${t.data.label}** (${e.label || 'connected'})` : null;
      }).filter(Boolean);

      if (targets.length > 0) {
        flowSteps.push(`**${node.data.label}** (${node.data.category}) ${targets.length === 1 ? `→ ${targets[0]}` : `→ ${targets.join(', ')}`}`);
      } else if (leafIds.has(node.id)) {
        flowSteps.push(`**${node.data.label}** (${node.data.category}) — endpoint`);
      }

      for (const e of outEdges) {
        const t = nodes.find(n => n.id === e.target);
        if (t && !visited.has(t.id)) queue.push(t);
      }
    }

    // Unvisited nodes (disconnected)
    const unvisited = nodes.filter(n => !visited.has(n.id));
    if (unvisited.length > 0) {
      flowSteps.push(`\n**Disconnected:** ${unvisited.map(n => `${n.data.label} (${n.data.category})`).join(', ')}`);
    }

    const categories = [...new Set(nodes.map(n => n.data.category))];
    const lines = [
      `### Workflow Narrative`,
      `This workflow has **${nodes.length} nodes** across ${categories.length} categories (${categories.join(', ')}) connected by **${edges.length} edges**.`,
      '',
      '### Flow',
      ...flowSteps.map((s, i) => `${i + 1}. ${s}`),
    ];

    return lines.join('\n');
  },

  addNodeByName: (prompt) => {
    const store = get();
    // Parse "add [category] called [name]" or "add [category] [name]"
    const match = prompt.match(/(?:add|create|new)\s+(\w+)\s+(?:called|named|:)\s+["']?(.+?)["']?\s*$/i)
      || prompt.match(/(?:add|create|new)\s+(\w+)\s+["'](.+?)["']\s*$/i);
    if (!match) return { success: false, message: 'Could not parse. Try: "add artifact called PRD" or "add note called Research".' };

    const [, rawCategory, name] = match;
    const category = rawCategory.toLowerCase();
    const validCategories = [...BUILT_IN_CATEGORIES, ...new Set(store.nodes.map(n => n.data.category))];
    if (!validCategories.includes(category)) {
      // Still allow it but register as custom
      registerCustomCategory(category);
    }

    const id = uid();
    // Place relative to existing nodes
    const maxX = store.nodes.length > 0 ? Math.max(...store.nodes.map(n => n.position.x)) : 0;
    const avgY = store.nodes.length > 0 ? store.nodes.reduce((s, n) => s + n.position.y, 0) / store.nodes.length : 200;
    const position = findFreePosition({ x: maxX + NODE_W + 80, y: avgY }, store.nodes.map(n => n.position));

    store.pushHistory();
    store.addNode({
      id,
      type: 'lifecycleNode',
      position,
      data: {
        label: name.trim(),
        category: category as NodeCategory,
        status: 'active',
        description: '',
        version: 1,
        lastUpdated: Date.now(),
      },
    });
    store.addEvent({
      id: `ev-${Date.now()}`, type: 'created',
      message: `Created ${category} node "${name.trim()}"`,
      timestamp: Date.now(), nodeId: id, agent: true,
    });

    // Suggest auto-connect via interactive cards (only when 2+ nodes exist)
    if (store.nodes.length >= 2) {
      setTimeout(() => get().suggestAutoConnect(id), 0);
    }

    return { success: true, message: `Created **${name.trim()}** (${category}). Select it to add content and description.` };
  },

  setStatusByName: (prompt) => {
    const store = get();
    const { nodes } = store;
    if (nodes.length === 0) return { success: false, message: 'No nodes in the workflow.' };

    const VALID_STATUSES = ['active', 'stale', 'pending', 'locked', 'generating', 'reviewing'];

    // Parse "set X to stale", "lock X", "mark X as reviewing"
    const setMatch = prompt.match(/(?:set|mark|change)\s+["']?(.+?)["']?\s+(?:to|as|→)\s+(\w+)\s*$/i);
    const lockMatch = !setMatch && prompt.match(/^lock\s+["']?(.+?)["']?\s*$/i);
    const unlockMatch = !setMatch && !lockMatch && prompt.match(/^unlock\s+["']?(.+?)["']?\s*$/i);

    let nodeName: string;
    let targetStatus: string;

    if (setMatch) {
      nodeName = setMatch[1].trim();
      targetStatus = setMatch[2].toLowerCase();
    } else if (lockMatch) {
      nodeName = lockMatch[1].trim();
      targetStatus = 'locked';
    } else if (unlockMatch) {
      nodeName = unlockMatch[1].trim();
      targetStatus = 'active';
    } else {
      return { success: false, message: 'Could not parse. Try: "set PRD to stale", "lock Tech Spec", or "unlock Research".' };
    }

    if (!nodeName) return { success: false, message: 'Could not parse node name.' };
    if (!VALID_STATUSES.includes(targetStatus)) {
      return { success: false, message: `Invalid status "${targetStatus}". Valid: ${VALID_STATUSES.join(', ')}.` };
    }

    const node = findNodeByName(nodeName, nodes);

    if (!node) return { success: false, message: `No node matching "${nodeName}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };

    const oldStatus = node.data.status;
    if (oldStatus === targetStatus) return { success: false, message: `**${node.data.label}** is already ${targetStatus}.` };

    store.pushHistory();
    if (targetStatus === 'locked') {
      store.lockNode(node.id);
    } else {
      store.updateNodeStatus(node.id, targetStatus as NodeData['status']);
    }
    store.addEvent({
      id: `ev-${Date.now()}`, type: 'edited' as const,
      message: `Changed ${node.data.label} status: ${oldStatus} → ${targetStatus}`,
      timestamp: Date.now(), nodeId: node.id, agent: true,
    });

    return { success: true, message: `Changed **${node.data.label}** from ${oldStatus} → **${targetStatus}**.` };
  },

  listNodes: (prompt) => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No nodes in the workflow yet.';

    const lower = prompt.toLowerCase();
    let filtered = nodes;
    let filterLabel = 'all';

    // Filter by status
    const statusMatch = lower.match(/(?:list|show)\s+(?:all\s+)?(\w+)\s*$/);
    if (statusMatch) {
      const filter = statusMatch[1];
      const STATUSES = ['active', 'stale', 'pending', 'locked', 'generating', 'reviewing'];
      if (STATUSES.includes(filter)) {
        filtered = nodes.filter(n => n.data.status === filter);
        filterLabel = `${filter} nodes`;
      } else if (BUILT_IN_CATEGORIES.includes(filter) || filter === 'all') {
        if (filter !== 'all') {
          filtered = nodes.filter(n => n.data.category === filter);
          filterLabel = `${filter} nodes`;
        }
      } else {
        // Try as category (including custom)
        const catNodes = nodes.filter(n => n.data.category === filter);
        if (catNodes.length > 0) {
          filtered = catNodes;
          filterLabel = `${filter} nodes`;
        } else {
          // Plural form check (e.g., "artifacts" → "artifact")
          const singular = filter.replace(/s$/, '');
          const singularNodes = nodes.filter(n => n.data.category === singular);
          if (singularNodes.length > 0) {
            filtered = singularNodes;
            filterLabel = `${singular} nodes`;
          }
        }
      }
    }

    if (filtered.length === 0) return `No ${filterLabel} found.`;

    const lines: string[] = [`### ${filterLabel.charAt(0).toUpperCase() + filterLabel.slice(1)} (${filtered.length})`];
    filtered.forEach(n => {
      const conns = edges.filter(e => e.source === n.id || e.target === n.id).length;
      lines.push(`- **${n.data.label}** — ${n.data.category}, ${n.data.status}${conns > 0 ? `, ${conns} connections` : ''}`);
    });

    return lines.join('\n');
  },

  describeByName: (prompt) => {
    const store = get();
    const { nodes } = store;
    if (nodes.length === 0) return { success: false, message: 'No nodes in the workflow.' };

    // Parse "describe X as Y" or "describe X: Y"
    const match = prompt.match(/(?:describe|annotate|document)\s+["']?(.+?)["']?\s+(?:as|:)\s+["']?(.+?)["']?\s*$/i);
    if (!match) return { success: false, message: 'Could not parse. Try: "describe PRD as The main product requirements document".' };

    const [, nodeName, description] = match;
    if (!nodeName.trim() || !description.trim()) return { success: false, message: 'Both node name and description are required.' };

    const node = findNodeByName(nodeName, nodes);

    if (!node) return { success: false, message: `No node matching "${nodeName}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };

    store.pushHistory();
    store.updateNodeData(node.id, { description: description.trim() });
    store.addEvent({
      id: `ev-${Date.now()}`, type: 'edited' as const,
      message: `Updated description of "${node.data.label}"`,
      timestamp: Date.now(), nodeId: node.id, agent: true,
    });

    return { success: true, message: `Updated description of **${node.data.label}**: "${description.trim()}"` };
  },

  swapByName: (prompt) => {
    const store = get();
    const { nodes } = store;
    if (nodes.length < 2) return { success: false, message: 'Need at least 2 nodes to swap.' };

    // Parse "swap X and Y" or "swap X with Y"
    const match = prompt.match(/(?:swap|switch|exchange)\s+["']?(.+?)["']?\s+(?:and|with|↔)\s+["']?(.+?)["']?\s*$/i);
    if (!match) return { success: false, message: 'Could not parse. Try: "swap PRD and Tech Spec".' };

    const [, nameA, nameB] = match;
    if (!nameA.trim() || !nameB.trim()) return { success: false, message: 'Both node names are required.' };

    const nodeA = findNodeByName(nameA, nodes);
    const nodeB = findNodeByName(nameB, nodes);

    if (!nodeA) return { success: false, message: `No node matching "${nameA}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };
    if (!nodeB) return { success: false, message: `No node matching "${nameB}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };
    if (nodeA.id === nodeB.id) return { success: false, message: 'Cannot swap a node with itself.' };

    store.pushHistory();
    const posA = { ...nodeA.position };
    const posB = { ...nodeB.position };
    set(s => {
      const newNodes = s.nodes.map(n => {
        if (n.id === nodeA.id) return { ...n, position: posB };
        if (n.id === nodeB.id) return { ...n, position: posA };
        return n;
      });
      saveToStorage({ nodes: newNodes, edges: s.edges, events: s.events, messages: s.messages });
      return { nodes: newNodes };
    });
    store.addEvent({
      id: `ev-${Date.now()}`, type: 'edited' as const,
      message: `Swapped positions of "${nodeA.data.label}" and "${nodeB.data.label}"`,
      timestamp: Date.now(), agent: true,
    });

    return { success: true, message: `Swapped positions of **${nodeA.data.label}** and **${nodeB.data.label}**.` };
  },

  contentByName: (prompt) => {
    const store = get();
    const { nodes } = store;
    if (nodes.length === 0) return { success: false, message: 'No nodes in the workflow.' };

    // Parse "content X: text" or "content X = text"
    const match = prompt.match(/(?:content|write|fill)\s+["']?(.+?)["']?\s*(?::|=)\s+(.+)$/i);
    if (!match) return { success: false, message: 'Could not parse. Try: "content PRD: Your content here".' };

    const [, nodeName, content] = match;
    if (!nodeName.trim() || !content.trim()) return { success: false, message: 'Both node name and content are required.' };

    const node = findNodeByName(nodeName, nodes);
    if (!node) return { success: false, message: `No node matching "${nodeName}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };

    store.pushHistory();
    store.updateNodeData(node.id, { content: content.trim() });
    store.addEvent({
      id: `ev-${Date.now()}`, type: 'edited' as const,
      message: `Updated content of "${node.data.label}"`,
      timestamp: Date.now(), nodeId: node.id, agent: true,
    });

    const preview = content.trim().length > 60 ? content.trim().slice(0, 60) + '...' : content.trim();
    return { success: true, message: `Updated content of **${node.data.label}**: "${preview}"` };
  },

  getHealthScore: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return 100;
    let score = 100;
    score -= nodes.filter(n => n.data.status === 'stale').length * 10;
    const orphans = nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id)).length;
    score -= orphans * 8;
    if (!nodes.some(n => n.data.category === 'review')) score -= 15;
    score -= nodes.filter(n => n.data.status === 'locked').length * 3;
    return Math.max(0, Math.min(100, score));
  },

  getComplexityScore: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return { score: 0, label: 'Empty' };
    const n = nodes.length;
    const e = edges.length;
    const density = n > 1 ? e / (n * (n - 1)) : 0;
    const cats = new Set(nodes.map(nd => nd.data.category)).size;
    const diversity = Math.min(cats / Math.max(n, 1), 1);
    // Longest path via BFS
    const adj = new Map<string, string[]>();
    for (const ed of edges) {
      if (!adj.has(ed.source)) adj.set(ed.source, []);
      adj.get(ed.source)!.push(ed.target);
    }
    let maxDepth = 0;
    const roots = nodes.filter(nd => !edges.some(ed => ed.target === nd.id));
    for (const root of (roots.length > 0 ? roots : [nodes[0]])) {
      const visited = new Set<string>();
      const queue: [string, number][] = [[root.id, 0]];
      while (queue.length > 0) {
        const [id, depth] = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        maxDepth = Math.max(maxDepth, depth);
        for (const next of (adj.get(id) || [])) queue.push([next, depth + 1]);
      }
    }
    const sizeScore = Math.min(n / 20, 1) * 30;
    const densityScore = Math.min(density * 5, 1) * 25;
    const depthScore = Math.min(maxDepth / 8, 1) * 25;
    const diversityScore = diversity * 20;
    const score = Math.round(sizeScore + densityScore + depthScore + diversityScore);
    const label = score < 20 ? 'Simple' : score < 45 ? 'Moderate' : score < 70 ? 'Complex' : 'Intricate';
    return { score, label };
  },

  groupByCategory: () => {
    const store = get();
    const { nodes, edges } = store;
    if (nodes.length === 0) return { success: false, message: 'No nodes to group.' };

    store.pushHistory();
    const categories = [...new Set(nodes.map(n => n.data.category))];
    const COL_GAP = 360;
    const ROW_GAP = 180;

    const updated = nodes.map(n => {
      const colIndex = categories.indexOf(n.data.category);
      const nodesInCat = nodes.filter(m => m.data.category === n.data.category);
      const rowIndex = nodesInCat.indexOf(n);
      return { ...n, position: { x: colIndex * COL_GAP, y: rowIndex * ROW_GAP + 80 } };
    });

    set({ nodes: updated });
    saveToStorage({ nodes: updated, edges, events: store.events, messages: store.messages });
    store.addEvent({ id: `ev-${Date.now()}`, type: 'optimized', message: `Grouped ${nodes.length} nodes into ${categories.length} category columns`, timestamp: Date.now(), agent: true });
    return { success: true, message: `Grouped **${nodes.length}** nodes into **${categories.length}** category columns: ${categories.join(', ')}.` };
  },

  clearStale: () => {
    const store = get();
    const { nodes, edges } = store;
    const staleNodes = nodes.filter(n => n.data.status === 'stale');
    if (staleNodes.length === 0) return { count: 0, message: 'No stale nodes to clear.' };

    store.pushHistory();
    const staleIds = new Set(staleNodes.map(n => n.id));
    const newNodes = nodes.filter(n => !staleIds.has(n.id));
    const newEdges = edges.filter(e => !staleIds.has(e.source) && !staleIds.has(e.target));

    // Clear selection if selected node was removed
    const selectedNodeId = store.selectedNodeId && staleIds.has(store.selectedNodeId) ? null : store.selectedNodeId;
    // Remove deleted nodes from multi-selection
    const multiSelectedIds = new Set([...store.multiSelectedIds].filter(id => !staleIds.has(id)));

    set({ nodes: newNodes, edges: newEdges, selectedNodeId, multiSelectedIds });
    saveToStorage({ nodes: newNodes, edges: newEdges, events: store.events, messages: store.messages });
    const names = staleNodes.map(n => n.data.label);
    store.addEvent({ id: `ev-${Date.now()}`, type: 'edited', message: `Cleared ${staleNodes.length} stale node(s): ${names.join(', ')}`, timestamp: Date.now(), agent: true });
    return { count: staleNodes.length, message: `Removed **${staleNodes.length}** stale node${staleNodes.length > 1 ? 's' : ''}: ${names.join(', ')}.` };
  },

  findOrphans: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No nodes in the workflow.';
    const orphans = nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id));
    if (orphans.length === 0) return 'No orphan nodes — every node has at least one connection.';
    const list = orphans.map(n => `- **${n.data.label}** (${n.data.category}, ${n.data.status})`).join('\n');
    return `### Orphan Nodes (${orphans.length})\n${list}\n\nUse \`solve\` to auto-connect them, or \`connect <name> to <name>\` manually.`;
  },

  countNodes: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No nodes in the workflow yet.';

    const byCat = new Map<string, number>();
    const byStatus = new Map<string, number>();
    for (const n of nodes) {
      byCat.set(n.data.category, (byCat.get(n.data.category) || 0) + 1);
      byStatus.set(n.data.status, (byStatus.get(n.data.status) || 0) + 1);
    }

    const catLines = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([cat, count]) => `- **${cat}**: ${count}`).join('\n');
    const statusLines = [...byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => `- **${status}**: ${count}`).join('\n');

    return `### Node Count: ${nodes.length} nodes, ${edges.length} edges\n\n**By Category**\n${catLines}\n\n**By Status**\n${statusLines}`;
  },

  mergeByName: (prompt) => {
    const store = get();
    const { nodes, edges } = store;
    if (nodes.length < 2) return { success: false, message: 'Need at least 2 nodes to merge.' };

    // Parse "merge A and B" or "merge A with B" or "merge A into B"
    const match = prompt.match(/(?:merge|combine|fuse)\s+["']?(.+?)["']?\s+(?:and|with|into|&)\s+["']?(.+?)["']?\s*$/i);
    if (!match) return { success: false, message: 'Could not parse. Try: "merge Node A and Node B".' };

    const nodeA = findNodeByName(match[1], nodes);
    const nodeB = findNodeByName(match[2], nodes);
    if (!nodeA) return { success: false, message: `No node matching "${match[1]}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };
    if (!nodeB) return { success: false, message: `No node matching "${match[2]}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };
    if (nodeA.id === nodeB.id) return { success: false, message: 'Cannot merge a node with itself.' };

    store.pushHistory();

    // Merge B into A: combine descriptions, content, sections
    const mergedDesc = [nodeA.data.description, nodeB.data.description].filter(Boolean).join(' | ');
    const mergedContent = [nodeA.data.content, nodeB.data.content].filter(Boolean).join('\n\n---\n\n');
    const mergedSections = [...(nodeA.data.sections || []), ...(nodeB.data.sections || [])];

    store.updateNodeData(nodeA.id, {
      description: mergedDesc || undefined,
      content: mergedContent || undefined,
      sections: mergedSections.length > 0 ? mergedSections : undefined,
      version: (nodeA.data.version ?? 1) + 1,
    });

    // Re-link edges from B to A
    const updatedEdges = edges.map(e => {
      if (e.source === nodeB.id && e.target !== nodeA.id) return { ...e, id: `e-${nodeA.id}-${e.target}`, source: nodeA.id };
      if (e.target === nodeB.id && e.source !== nodeA.id) return { ...e, id: `e-${e.source}-${nodeA.id}`, target: nodeA.id };
      return e;
    }).filter(e => !(e.source === nodeB.id || e.target === nodeB.id));

    // Remove duplicates
    const seen = new Set<string>();
    const dedupEdges = updatedEdges.filter(e => {
      const key = `${e.source}-${e.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Delete node B — use fresh nodes since updateNodeData changed them
    const newNodes = get().nodes.filter(n => n.id !== nodeB.id);
    set({ nodes: newNodes, edges: dedupEdges });

    store.addEvent({
      id: `ev-${Date.now()}`, type: 'edited',
      message: `Merged "${nodeB.data.label}" into "${nodeA.data.label}"`,
      timestamp: Date.now(), nodeId: nodeA.id, agent: true,
    });

    return { success: true, message: `Merged **${nodeB.data.label}** into **${nodeA.data.label}**. All connections re-linked, content combined.` };
  },

  depsByName: (prompt) => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No nodes in the workflow.';

    const match = prompt.match(/(?:deps|dependencies|depend|upstream|downstream|chain|trace)\s+(?:of\s+|for\s+)?["']?(.+?)["']?\s*$/i);
    if (!match) return 'Could not parse. Try: "deps PRD" or "dependencies of Tech Spec".';

    const node = findNodeByName(match[1], nodes);
    if (!node) return `No node matching "${match[1]}". Available: ${nodes.map(n => n.data.label).join(', ')}.`;

    // BFS upstream (nodes that feed into this one)
    const upstream: string[] = [];
    const visitedUp = new Set<string>();
    const queueUp = [node.id];
    while (queueUp.length > 0) {
      const current = queueUp.shift()!;
      for (const e of edges) {
        if (e.target === current && !visitedUp.has(e.source)) {
          visitedUp.add(e.source);
          queueUp.push(e.source);
          const found = nodes.find(nd => nd.id === e.source);
          if (found) upstream.push(`${found.data.label} (${found.data.category})`);
        }
      }
    }

    // BFS downstream (nodes this feeds into)
    const downstream: string[] = [];
    const visitedDown = new Set<string>();
    const queueDown = [node.id];
    while (queueDown.length > 0) {
      const current = queueDown.shift()!;
      for (const e of edges) {
        if (e.source === current && !visitedDown.has(e.target)) {
          visitedDown.add(e.target);
          queueDown.push(e.target);
          const found = nodes.find(nd => nd.id === e.target);
          if (found) downstream.push(`${found.data.label} (${found.data.category})`);
        }
      }
    }

    const parts: string[] = [`### Dependencies: ${node.data.label}`];
    parts.push('');
    if (upstream.length > 0) {
      parts.push(`**Upstream** (${upstream.length}):`);
      upstream.forEach(n => parts.push(`- ${n}`));
    } else {
      parts.push('**Upstream**: None (root node)');
    }
    parts.push('');
    if (downstream.length > 0) {
      parts.push(`**Downstream** (${downstream.length}):`);
      downstream.forEach(n => parts.push(`- ${n}`));
    } else {
      parts.push('**Downstream**: None (leaf node)');
    }

    return parts.join('\n');
  },

  reverseByName: (prompt) => {
    const store = get();
    const { nodes, edges } = store;
    if (nodes.length === 0) return { success: false, message: 'No nodes in the workflow.' };

    const match = prompt.match(/(?:reverse|flip|invert)\s+(?:edges?\s+(?:of|for|on)\s+)?["']?(.+?)["']?\s*$/i);
    if (!match) return { success: false, message: 'Could not parse. Try: "reverse edges of PRD".' };

    const node = findNodeByName(match[1], nodes);
    if (!node) return { success: false, message: `No node matching "${match[1]}". Available: ${nodes.map(n => n.data.label).join(', ')}.` };

    const nodeEdges = edges.filter(e => e.source === node.id || e.target === node.id);
    if (nodeEdges.length === 0) return { success: false, message: `**${node.data.label}** has no connections to reverse.` };

    store.pushHistory();
    const edgeIds = new Set(nodeEdges.map(e => e.id));
    const newEdges = edges.map(e => {
      if (!edgeIds.has(e.id)) return e;
      return { ...e, id: `e-${e.target}-${e.source}`, source: e.target, target: e.source };
    });

    set({ edges: newEdges });
    saveToStorage({ nodes, edges: newEdges, events: store.events, messages: store.messages });
    store.addEvent({
      id: `ev-${Date.now()}`, type: 'edited',
      message: `Reversed ${nodeEdges.length} edge(s) on "${node.data.label}"`,
      timestamp: Date.now(), nodeId: node.id, agent: true,
    });

    return { success: true, message: `Reversed **${nodeEdges.length}** edge${nodeEdges.length > 1 ? 's' : ''} on **${node.data.label}**. Incoming ↔ outgoing swapped.` };
  },

  saveSnapshot: (name) => {
    const { nodes, edges, snapshots } = get();
    if (nodes.length === 0) return 'No nodes to snapshot.';
    const trimmed = name.trim() || `snapshot-${Date.now()}`;
    const updated = new Map(snapshots);
    updated.set(trimmed, { nodes: structuredClone(nodes), edges: structuredClone(edges), timestamp: Date.now() });
    set({ snapshots: updated });
    return `Saved snapshot **"${trimmed}"** (${nodes.length} nodes, ${edges.length} edges). Use \`restore ${trimmed}\` to restore it.`;
  },

  restoreSnapshot: (name) => {
    const { snapshots } = get();
    const trimmed = name.trim();
    const snap = snapshots.get(trimmed);
    if (!snap) {
      const available = [...snapshots.keys()];
      return { success: false, message: available.length > 0 ? `No snapshot "${trimmed}". Available: ${available.join(', ')}.` : 'No snapshots saved yet. Use `save <name>` to create one.' };
    }
    const store = get();
    store.pushHistory();
    set({ nodes: structuredClone(snap.nodes), edges: structuredClone(snap.edges) });
    store.addEvent({ id: `ev-${Date.now()}`, type: 'edited', message: `Restored snapshot "${trimmed}"`, timestamp: Date.now(), agent: true });
    return { success: true, message: `Restored snapshot **"${trimmed}"** (${snap.nodes.length} nodes, ${snap.edges.length} edges). Previous state saved to undo history.` };
  },

  listSnapshots: () => {
    const { snapshots } = get();
    if (snapshots.size === 0) return 'No snapshots saved. Use `save <name>` to create one.';
    const lines = [...snapshots.entries()].map(([name, snap]) => {
      const ago = new Date(snap.timestamp).toLocaleTimeString();
      return `- **${name}** — ${snap.nodes.length} nodes, ${snap.edges.length} edges (saved ${ago})`;
    });
    return `### Snapshots (${snapshots.size})\n${lines.join('\n')}\n\nUse \`restore <name>\` to restore.`;
  },

  criticalPath: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No nodes in the workflow.';
    if (edges.length === 0) return 'No edges — cannot compute a path. Connect some nodes first.';

    // Find all root nodes (no incoming edges)
    const hasIncoming = new Set(edges.map(e => e.target));
    const roots = nodes.filter(n => !hasIncoming.has(n.id));
    if (roots.length === 0) return 'No root nodes found (possible cycle). Every node has an incoming edge.';

    // BFS/DFS longest path from each root
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }

    let longestPath: string[] = [];
    for (const root of roots) {
      // DFS with path tracking
      const stack: { id: string; path: string[] }[] = [{ id: root.id, path: [root.id] }];
      while (stack.length > 0) {
        const { id, path } = stack.pop()!;
        if (path.length > longestPath.length) longestPath = path;
        const children = adj.get(id) || [];
        for (const child of children) {
          if (!path.includes(child)) { // avoid cycles
            stack.push({ id: child, path: [...path, child] });
          }
        }
      }
    }

    if (longestPath.length <= 1) return 'No multi-node paths found.';

    const pathNames = longestPath.map(id => {
      const n = nodeMap.get(id);
      return n ? `**${n.data.label}** (${n.data.category})` : id;
    });
    const chain = longestPath.map(id => nodeMap.get(id)?.data.label ?? id).join(' → ');

    return `### Critical Path (${longestPath.length} nodes)\n\n${chain}\n\n**Breakdown:**\n${pathNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}\n\nThis is the longest dependency chain. Any delay here delays the entire workflow.`;
  },

  isolateByName: (prompt) => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No nodes in the workflow.';

    const match = prompt.match(/(?:isolate|subgraph|neighborhood|around|focus on|neighbours?)\s+(?:of\s+|for\s+)?["']?(.+?)["']?\s*$/i);
    if (!match) return 'Could not parse. Try: "isolate PRD" or "subgraph of Tech Spec".';

    const node = findNodeByName(match[1], nodes);
    if (!node) return `No node matching "${match[1]}". Available: ${nodes.map(n => n.data.label).join(', ')}.`;

    // BFS in both directions to find all connected nodes
    const visited = new Set<string>([node.id]);
    const queue = [node.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const e of edges) {
        if (e.source === current && !visited.has(e.target)) {
          visited.add(e.target);
          queue.push(e.target);
        }
        if (e.target === current && !visited.has(e.source)) {
          visited.add(e.source);
          queue.push(e.source);
        }
      }
    }

    if (visited.size === 1) return `**${node.data.label}** has no connections — it is already isolated.`;

    const subNodes = nodes.filter(n => visited.has(n.id));
    const subEdges = edges.filter(e => visited.has(e.source) && visited.has(e.target));
    const outside = nodes.length - subNodes.length;

    const nodeList = subNodes.map(n => {
      const isCenter = n.id === node.id;
      return `- ${isCenter ? '**→ ' : ''}**${n.data.label}** (${n.data.category}, ${n.data.status})${isCenter ? ' ← center' : ''}`;
    });

    return `### Subgraph: ${node.data.label} (${subNodes.length} nodes, ${subEdges.length} edges)\n\n${nodeList.join('\n')}\n\n${outside > 0 ? `${outside} node${outside > 1 ? 's are' : ' is'} outside this subgraph.` : 'This is the entire graph — all nodes are connected.'}`;
  },

  summarize: () => {
    cidLog('summarize');
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No workflow to summarize. Tell me what to build.';

    const categories = [...new Set(nodes.map(n => n.data.category))];
    const hasIncoming = new Set(edges.map(e => e.target));
    const hasOutgoing = new Set(edges.map(e => e.source));
    const roots = nodes.filter(n => !hasIncoming.has(n.id));
    const leaves = nodes.filter(n => !hasOutgoing.has(n.id));
    const stale = nodes.filter(n => n.data.status === 'stale');
    const reviewing = nodes.filter(n => n.data.status === 'reviewing');
    const score = get().getHealthScore();

    const rootNames = roots.map(n => n.data.label).slice(0, 3).join(', ');
    const leafNames = leaves.map(n => n.data.label).slice(0, 3).join(', ');

    const parts: string[] = [];
    parts.push(`### Executive Summary`);
    parts.push('');
    parts.push(`This workflow contains **${nodes.length} nodes** and **${edges.length} connections** spanning ${categories.length} categor${categories.length > 1 ? 'ies' : 'y'} (${categories.join(', ')}). Health score: **${score}%**.`);
    parts.push('');
    parts.push(`**Entry points:** ${roots.length > 0 ? rootNames : 'None (cycle detected)'}`);
    parts.push(`**Deliverables:** ${leaves.length > 0 ? leafNames : 'None (all nodes feed forward)'}`);
    parts.push('');

    if (stale.length > 0 || reviewing.length > 0) {
      parts.push('**Attention needed:**');
      if (stale.length > 0) parts.push(`- ${stale.length} stale node${stale.length > 1 ? 's' : ''}: ${stale.map(n => n.data.label).join(', ')}`);
      if (reviewing.length > 0) parts.push(`- ${reviewing.length} awaiting review: ${reviewing.map(n => n.data.label).join(', ')}`);
    } else {
      parts.push('**Status:** All nodes are active and synchronized. No action required.');
    }

    return parts.join('\n');
  },

  validate: () => {
    cidLog('validate');
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No workflow to validate.';

    const issues: string[] = [];
    const nodeIds = new Set(nodes.map(n => n.id));

    // 1. Orphaned edges (pointing to non-existent nodes)
    const orphanedEdges = edges.filter(e => !nodeIds.has(e.source) || !nodeIds.has(e.target));
    if (orphanedEdges.length > 0) {
      issues.push(`**${orphanedEdges.length} orphaned edge${orphanedEdges.length > 1 ? 's' : ''}** pointing to deleted nodes — run \`solve\` to clean up`);
    }

    // 2. Duplicate edges (same source→target)
    const edgeKeys = new Set<string>();
    let dupeCount = 0;
    for (const e of edges) {
      const key = `${e.source}->${e.target}`;
      if (edgeKeys.has(key)) dupeCount++;
      edgeKeys.add(key);
    }
    if (dupeCount > 0) {
      issues.push(`**${dupeCount} duplicate edge${dupeCount > 1 ? 's' : ''}** (same source→target)`);
    }

    // 3. Self-loops
    const selfLoops = edges.filter(e => e.source === e.target);
    if (selfLoops.length > 0) {
      issues.push(`**${selfLoops.length} self-loop${selfLoops.length > 1 ? 's' : ''}** (node connected to itself)`);
    }

    // 4. Cycles detection (using DFS)
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    nodes.forEach(n => color.set(n.id, WHITE));
    let hasCycle = false;
    const cycleNodes: string[] = [];
    const dfs = (id: string) => {
      color.set(id, GRAY);
      for (const child of adj.get(id) || []) {
        if (color.get(child) === GRAY) {
          hasCycle = true;
          const n = nodes.find(nd => nd.id === child);
          if (n && !cycleNodes.includes(n.data.label)) cycleNodes.push(n.data.label);
        }
        if (color.get(child) === WHITE) dfs(child);
      }
      color.set(id, BLACK);
    };
    for (const n of nodes) {
      if (color.get(n.id) === WHITE) dfs(n.id);
    }
    if (hasCycle) {
      issues.push(`**Cycle detected** involving: ${cycleNodes.join(', ')} — this may cause infinite propagation`);
    }

    // 5. Locked nodes with stale status (contradiction)
    const contradictions = nodes.filter(n => n.data.locked && n.data.status === 'stale');
    if (contradictions.length > 0) {
      issues.push(`**${contradictions.length} locked+stale node${contradictions.length > 1 ? 's' : ''}**: ${contradictions.map(n => n.data.label).join(', ')} — locked nodes can't be propagated`);
    }

    // 6. Nodes stuck in "generating" status
    const stuck = nodes.filter(n => n.data.status === 'generating');
    if (stuck.length > 0) {
      issues.push(`**${stuck.length} node${stuck.length > 1 ? 's' : ''} stuck in "generating"**: ${stuck.map(n => n.data.label).join(', ')} — may need manual status reset`);
    }

    if (issues.length === 0) {
      return `### Validation: All Clear ✓\n\nNo integrity issues found. ${nodes.length} nodes, ${edges.length} edges — all valid.`;
    }

    return `### Validation: ${issues.length} Issue${issues.length > 1 ? 's' : ''} Found\n\n${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}\n\nUse \`solve\` to auto-fix structural problems, or address issues manually.`;
  },

  whyNode: (prompt) => {
    const { nodes, edges } = get();
    const match = prompt.match(/(?:why|reason|purpose)\s+(?:does\s+)?["']?(.+?)["']?\s*(?:\?|$)/i);
    const name = match?.[1]?.trim() || prompt.replace(/^why\s+/i, '').trim();
    const node = findNodeByName(name, nodes);
    if (!node) return `No node matching "${name}". Available: ${nodes.map(n => n.data.label).join(', ')}.`;

    const incoming = edges.filter(e => e.target === node.id);
    const outgoing = edges.filter(e => e.source === node.id);

    if (incoming.length === 0 && outgoing.length === 0) {
      return `**${node.data.label}** is an orphan node with no connections. It exists as a standalone ${node.data.category} node${node.data.description ? `: "${node.data.description}"` : ''}.`;
    }

    const parts: string[] = [`### Why does "${node.data.label}" exist?`];
    parts.push(`**Category:** ${node.data.category} · **Status:** ${node.data.status}`);
    if (node.data.description) parts.push(`**Purpose:** ${node.data.description}`);
    parts.push('');

    if (incoming.length > 0) {
      parts.push('**Driven by:**');
      for (const e of incoming) {
        const src = nodes.find(n => n.id === e.source);
        parts.push(`- **${src?.data.label ?? '?'}** (${src?.data.category ?? '?'}) —[${e.label || 'connected'}]→ this node`);
      }
      parts.push('');
    }

    if (outgoing.length > 0) {
      parts.push('**Feeds into:**');
      for (const e of outgoing) {
        const tgt = nodes.find(n => n.id === e.target);
        parts.push(`- This node —[${e.label || 'connected'}]→ **${tgt?.data.label ?? '?'}** (${tgt?.data.category ?? '?'})`);
      }
      parts.push('');
    }

    // Trace upstream chain (max 5 hops)
    const chain: string[] = [];
    let current = node.id;
    const visited = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const inEdge = edges.find(e => e.target === current && !visited.has(e.source));
      if (!inEdge) break;
      visited.add(inEdge.source);
      const src = nodes.find(n => n.id === inEdge.source);
      if (src) chain.unshift(src.data.label);
      current = inEdge.source;
    }
    if (chain.length > 0) {
      chain.push(node.data.label);
      parts.push(`**Upstream chain:** ${chain.join(' → ')}`);
    }

    return parts.join('\n');
  },

  relabelAllEdges: () => {
    const store = get();
    const { nodes, edges } = store;
    if (edges.length === 0) return { count: 0, message: 'No edges to relabel.' };

    store.pushHistory();
    let changed = 0;
    const newEdges = edges.map(e => {
      const src = nodes.find(n => n.id === e.source);
      const tgt = nodes.find(n => n.id === e.target);
      const inferred = inferEdgeLabel(src?.data.category, tgt?.data.category);
      if (inferred !== 'connects' && e.label !== inferred) {
        changed++;
        return {
          ...e,
          label: inferred,
          style: { ...e.style, stroke: EDGE_LABEL_COLORS[inferred] || '#6366f1', strokeWidth: 2 },
          animated: ANIMATED_LABELS.has(inferred),
        };
      }
      return e;
    });

    if (changed === 0) return { count: 0, message: 'All edges already have correct labels.' };
    set({ edges: newEdges });
    saveToStorage({ nodes, edges: newEdges, events: store.events, messages: store.messages });
    store.addEvent({ id: `ev-${Date.now()}`, type: 'edited' as const, message: `Relabeled ${changed} edge${changed > 1 ? 's' : ''} using category inference`, timestamp: Date.now(), agent: true });
    return { count: changed, message: `Re-inferred labels on **${changed}** edge${changed > 1 ? 's' : ''}. All edges now match their source→target category pair.` };
  },

  // CID learned rules
  cidRules: loadRules(),
  addCIDRule: (rule) => {
    const rules = [...get().cidRules, rule];
    set({ cidRules: rules });
    saveRules(rules);
    cidLog('addCIDRule', rule);
    return `Learned: "${rule}". I now have **${rules.length}** rule${rules.length > 1 ? 's' : ''}. Use \`rules\` to see all, or \`forget <number>\` to remove.`;
  },
  removeCIDRule: (index) => {
    const rules = [...get().cidRules];
    if (index < 0 || index >= rules.length) return `Invalid rule number. You have ${rules.length} rule${rules.length > 1 ? 's' : ''}.`;
    const removed = rules.splice(index, 1)[0];
    set({ cidRules: rules });
    saveRules(rules);
    cidLog('removeCIDRule', removed);
    return `Forgot: "${removed}". ${rules.length} rule${rules.length !== 1 ? 's' : ''} remaining.`;
  },
  listCIDRules: () => {
    const rules = get().cidRules;
    if (rules.length === 0) return 'No rules learned yet. Use `teach: <rule>` to teach me something.';
    const lines = rules.map((r, i) => `${i + 1}. ${r}`);
    return `### CID Rules (${rules.length})\n${lines.join('\n')}\n\nUse \`forget <number>\` to remove a rule.`;
  },

  // Workflow progress
  getWorkflowProgress: () => {
    const { nodes } = get();
    if (nodes.length === 0) return { percent: 0, done: 0, total: 0, blocked: 0 };
    const done = nodes.filter(n => n.data.executionStatus === 'success').length;
    const blocked = nodes.filter(n => n.data.status === 'stale' || n.data.executionStatus === 'error').length;
    const percent = Math.round((done / nodes.length) * 100);
    return { percent, done, total: nodes.length, blocked };
  },

  // Diff current workflow vs a saved snapshot
  diffSnapshot: (name: string) => {
    const { nodes, edges, snapshots } = get();
    const snap = snapshots.get(name);
    if (!snap) {
      const available = [...snapshots.keys()];
      return available.length > 0
        ? `No snapshot named "${name}". Available: ${available.join(', ')}`
        : 'No snapshots saved yet. Use `save <name>` first.';
    }
    const snapNodeLabels = new Set(snap.nodes.map(n => n.data.label));
    const currentNodeLabels = new Set(nodes.map(n => n.data.label));
    const added = nodes.filter(n => !snapNodeLabels.has(n.data.label));
    const removed = snap.nodes.filter(n => !currentNodeLabels.has(n.data.label));
    const modified = nodes.filter(n => {
      const old = snap.nodes.find(sn => sn.data.label === n.data.label);
      if (!old) return false;
      return old.data.status !== n.data.status || old.data.version !== n.data.version || old.data.description !== n.data.description;
    });
    const edgeDiff = edges.length - snap.edges.length;
    const parts: string[] = ['### Workflow Diff vs "' + name + '"', ''];
    if (added.length === 0 && removed.length === 0 && modified.length === 0 && edgeDiff === 0) {
      parts.push('No changes detected — workflow matches snapshot.');
    } else {
      if (added.length > 0) parts.push(`**Added** (${added.length}): ${added.map(n => `\`${n.data.label}\``).join(', ')}`);
      if (removed.length > 0) parts.push(`**Removed** (${removed.length}): ${removed.map(n => `\`${n.data.label}\``).join(', ')}`);
      if (modified.length > 0) parts.push(`**Modified** (${modified.length}): ${modified.map(n => `\`${n.data.label}\` (${n.data.status})`).join(', ')}`);
      if (edgeDiff !== 0) parts.push(`**Edges**: ${edgeDiff > 0 ? '+' : ''}${edgeDiff} (${snap.edges.length} → ${edges.length})`);
    }
    return parts.join('\n');
  },

  // Batch operations with conditions: "batch <status> where <condition>"
  batchWhere: (prompt: string) => {
    const store = get();
    // Parse: batch <targetStatus> where <field>=<value>
    const match = prompt.match(/^batch\s+(\w+)\s+where\s+(\w+)\s*[=:]\s*(.+)$/i);
    if (!match) return { success: false, message: 'Usage: `batch <status> where <field>=<value>`\nExample: `batch lock where category=review`' };
    const targetStatus = match[1].toLowerCase();
    const field = match[2].toLowerCase();
    const value = match[3].trim().toLowerCase();
    const validStatuses = ['active', 'stale', 'pending', 'locked', 'reviewing'];
    if (!validStatuses.includes(targetStatus)) {
      return { success: false, message: `Invalid status "${targetStatus}". Valid: ${validStatuses.join(', ')}` };
    }
    // Find matching nodes
    const matching = store.nodes.filter(n => {
      const d = n.data;
      if (field === 'category' || field === 'type') return d.category.toLowerCase() === value;
      if (field === 'status') return d.status.toLowerCase() === value;
      if (field === 'label' || field === 'name') return d.label.toLowerCase().includes(value);
      return false;
    });
    if (matching.length === 0) return { success: false, message: `No nodes match ${field}=${value}.` };
    store.pushHistory();
    let count = 0;
    for (const n of matching) {
      if (n.data.status === targetStatus) continue;
      if (targetStatus === 'locked') store.lockNode(n.id);
      else store.updateNodeStatus(n.id, targetStatus as NodeData['status']);
      count++;
    }
    if (count === 0) return { success: true, message: `All ${matching.length} matching nodes already have status "${targetStatus}".` };
    store.addEvent({ id: `ev-${Date.now()}`, type: 'edited' as any, message: `Batch ${targetStatus}: ${count} nodes where ${field}=${value}`, timestamp: Date.now() });
    return { success: true, message: `Done. Set ${count} node${count > 1 ? 's' : ''} to **${targetStatus}** (matched ${field}=${value}).` };
  },

  // breadcrumbs, addBreadcrumb, clearBreadcrumbs — from UISlice

  // Generate topological execution plan
  generatePlan: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No workflow to plan. Build something first.';
    const { order, levels } = topoSort(nodes, edges);
    // Detect cycles
    if (order.length < nodes.length) {
      const missing = nodes.filter(n => !order.includes(n.id)).map(n => n.data.label);
      return `### Execution Plan\n\nCycle detected involving: ${missing.join(', ')}. Cannot generate linear plan. Use \`validate\` to find the cycle.`;
    }
    // Group by level for parallel execution
    const maxLevel = Math.max(...[...levels.values()], 0);
    const parts: string[] = ['### Execution Plan', ''];
    for (let lvl = 0; lvl <= maxLevel; lvl++) {
      const atLevel = order.filter(id => levels.get(id) === lvl);
      const nodeNames = atLevel.map(id => {
        const n = nodes.find(nd => nd.id === id);
        if (!n) return '?';
        const statusIcon = n.data.status === 'active' ? '✓' : n.data.status === 'locked' ? '🔒' : n.data.status === 'stale' ? '⚠' : '○';
        return `${statusIcon} **${n.data.label}** (${n.data.category})`;
      });
      const parallel = atLevel.length > 1 ? ' *(parallel)*' : '';
      parts.push(`**Step ${lvl + 1}**${parallel}`);
      nodeNames.forEach(name => parts.push(`- ${name}`));
      parts.push('');
    }
    const done = nodes.filter(n => n.data.status === 'active' || n.data.status === 'locked').length;
    parts.push(`---\n**${done}/${nodes.length}** steps complete | ${maxLevel + 1} execution phases`);
    return parts.join('\n');
  },

  // Search chat history
  searchMessages: (query: string) => {
    const { messages } = get();
    const q = query.toLowerCase();
    const matches = messages.filter(m => m.content.toLowerCase().includes(q));
    if (matches.length === 0) return `No messages matching "${query}".`;
    const parts: string[] = [`### Search: "${query}" (${matches.length} result${matches.length > 1 ? 's' : ''})`, ''];
    for (const m of matches.slice(-8)) {
      const who = m.role === 'user' ? '**You**' : '**CID**';
      const preview = m.content.slice(0, 120).replace(/\n/g, ' ');
      parts.push(`- ${who}: ${preview}${m.content.length > 120 ? '...' : ''}`);
    }
    if (matches.length > 8) parts.push(`\n*...and ${matches.length - 8} more*`);
    return parts.join('\n');
  },

  // Check for issues after destructive mutations
  checkPostMutation: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return null;
    const issues: string[] = [];
    const orphans = nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id));
    if (orphans.length > 0) issues.push(`${orphans.length} orphaned node${orphans.length > 1 ? 's' : ''} (${orphans.map(n => n.data.label).join(', ')})`);
    const health = get().getHealthScore();
    if (health < 50) issues.push(`health score dropped to ${health}/100`);
    if (issues.length === 0) return null;
    return issues.join(' | ');
  },

  // Custom templates — persist to localStorage
  customTemplates: (() => {
    if (typeof window === 'undefined') return new Map();
    try {
      const raw = localStorage.getItem('lifecycle-custom-templates');
      if (!raw) return new Map();
      return new Map(JSON.parse(raw));
    } catch { return new Map(); }
  })(),

  saveAsTemplate: (name: string) => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return 'No workflow to save as template.';
    const trimmed = name.trim();
    if (!trimmed) return 'Please provide a template name.';
    set(s => {
      const updated = new Map(s.customTemplates);
      updated.set(trimmed, { nodes: structuredClone(nodes), edges: structuredClone(edges), timestamp: Date.now() });
      try { localStorage.setItem('lifecycle-custom-templates', JSON.stringify([...updated])); } catch { /* ignore */ }
      return { customTemplates: updated };
    });
    return `Saved **${trimmed}** as template (${nodes.length} nodes, ${edges.length} edges). Load anytime with \`load template ${trimmed}\`.`;
  },

  loadCustomTemplate: (name: string) => {
    const { customTemplates, pushHistory } = get();
    const trimmed = name.trim();
    const tmpl = customTemplates.get(trimmed);
    if (!tmpl) {
      const available = [...customTemplates.keys()];
      return available.length > 0
        ? `No template "${trimmed}". Available: ${available.join(', ')}`
        : 'No custom templates saved yet. Use `save template <name>` first.';
    }
    pushHistory();
    const nodes = structuredClone(tmpl.nodes);
    const edges = structuredClone(tmpl.edges);
    set({ nodes, edges });
    saveToStorage({ nodes, edges, events: get().events, messages: get().messages });
    get().addEvent({ id: `ev-${Date.now()}`, type: 'created' as any, message: `Loaded template "${trimmed}"`, timestamp: Date.now() });
    get().requestFitView();
    return `Loaded template **${trimmed}** (${nodes.length} nodes, ${edges.length} edges).`;
  },

  listCustomTemplates: () => {
    const { customTemplates } = get();
    if (customTemplates.size === 0) return 'No custom templates saved. Use `save template <name>` to create one.';
    const parts: string[] = ['### Custom Templates', ''];
    for (const [name, tmpl] of customTemplates) {
      const date = new Date(tmpl.timestamp).toLocaleDateString();
      parts.push(`- **${name}** — ${tmpl.nodes.length} nodes, ${tmpl.edges.length} edges (saved ${date})`);
    }
    parts.push('', 'Load with: `load template <name>`');
    return parts.join('\n');
  },

  // Export chat as markdown
  exportChatMarkdown: () => {
    const { messages, cidMode } = get();
    if (messages.length === 0) return '';
    const agentName = cidMode === 'poirot' ? 'Poirot' : 'Rowan';
    const lines: string[] = [
      `# Lifecycle Agent — CID (${agentName}) Conversation`,
      `*Exported ${new Date().toLocaleString()}*`,
      '',
      '---',
      '',
    ];
    for (const m of messages) {
      const time = new Date(m.timestamp).toLocaleTimeString();
      if (m.role === 'user') {
        lines.push(`### You (${time})`);
      } else {
        lines.push(`### CID (${time})`);
      }
      lines.push('', m.content, '');
    }
    return lines.join('\n');
  },

  // Auto-describe — uses AI to fill descriptions for empty nodes
  autoDescribe: async () => {
    const store = get();
    const empty = store.nodes.filter(n => !n.data.description && !n.data.content);
    if (empty.length === 0) {
      store.addMessage({ id: `msg-${Date.now()}`, role: 'cid', content: 'All nodes already have descriptions.', timestamp: Date.now() });
      return;
    }
    store.addMessage({ id: `msg-${Date.now()}`, role: 'cid', content: `Generating descriptions for **${empty.length}** nodes...`, timestamp: Date.now(), action: 'thinking' });
    // Build context for AI
    const nodeList = empty.map(n => `- "${n.data.label}" (${n.data.category})`).join('\n');
    const context = store.nodes.map(n => n.data.label).join(', ');
    const prompt = `Given a workflow with these nodes: ${context}\n\nGenerate concise 1-sentence descriptions for each of these nodes that currently lack descriptions:\n${nodeList}\n\nRespond with JSON: { "descriptions": { "NodeLabel": "description" } }. Only include the nodes listed above.`;
    try {
      const descAgent = getAgent(store.cidMode);
      const descLayers = getAgentLayers(store.cidMode);
      const systemPrompt = buildSystemPrompt(store.cidMode, store.nodes, store.edges, store.cidRules, descAgent, descLayers);
      const res = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, messages: [{ role: 'user', content: prompt }], model: store.cidAIModel, taskType: 'execute' }),
      });
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      // API returns { result: { message, workflow } } — text in result.message
      const rawText = data.result?.message || data.response || '';
      const cleaned = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      const descriptions = parsed.descriptions || parsed;
      let count = 0;
      for (const node of empty) {
        const desc = descriptions[node.data.label];
        if (desc && typeof desc === 'string') {
          store.updateNodeData(node.id, { description: desc });
          count++;
        }
      }
      store.addMessage({ id: `msg-${Date.now()}-done`, role: 'cid', content: `Done. Added descriptions to **${count}/${empty.length}** nodes.`, timestamp: Date.now() });
    } catch {
      // Fallback: generate simple descriptions from category and connections
      let count = 0;
      for (const node of empty) {
        const incoming = store.edges.filter(e => e.target === node.id).map(e => store.nodes.find(n => n.id === e.source)?.data.label).filter(Boolean);
        const outgoing = store.edges.filter(e => e.source === node.id).map(e => store.nodes.find(n => n.id === e.target)?.data.label).filter(Boolean);
        const parts: string[] = [];
        if (incoming.length > 0) parts.push(`Receives from ${incoming.join(', ')}`);
        if (outgoing.length > 0) parts.push(`feeds ${outgoing.join(', ')}`);
        const desc = parts.length > 0 ? `${node.data.category} node. ${parts.join('; ')}.` : `${node.data.category} node in the workflow.`;
        store.updateNodeData(node.id, { description: desc });
        count++;
      }
      store.addMessage({ id: `msg-${Date.now()}-fb`, role: 'cid', content: `Generated basic descriptions for **${count}** nodes (AI unavailable, used graph context).`, timestamp: Date.now() });
    }
  },

  // Workflow compression — find duplicates, redundant pass-through nodes, and boilerplate
  compressWorkflow: () => {
    const { nodes, cidMode, pushHistory } = get();
    if (nodes.length === 0) return 'No workflow to compress.';
    const findings: string[] = [];
    let removedCount = 0;
    let mergedCount = 0;

    // 1. Duplicate detection — same label AND category
    const seen = new Map<string, string[]>();
    for (const n of nodes) {
      const key = `${n.data.label.toLowerCase()}|${n.data.category}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(n.id);
    }
    const duplicates = [...seen.entries()].filter(([, ids]) => ids.length > 1);
    if (duplicates.length > 0) {
      pushHistory();
      for (const [key, ids] of duplicates) {
        const keep = ids[0];
        for (let i = 1; i < ids.length; i++) {
          const removeId = ids[i];
          // Rewire edges from duplicate to the kept node
          set(s => ({
            edges: s.edges.map(e => ({
              ...e,
              source: e.source === removeId ? keep : e.source,
              target: e.target === removeId ? keep : e.target,
            })).filter(e => e.source !== e.target), // remove self-loops
            nodes: s.nodes.filter(n => n.id !== removeId),
          }));
          removedCount++;
        }
        const label = key.split('|')[0];
        findings.push(`Merged duplicate "${label}" (${ids.length} → 1)`);
        mergedCount++;
      }
    }

    // 2. Pass-through detection — nodes with exactly 1 input and 1 output, no content/description
    const currentNodes = get().nodes;
    const currentEdges = get().edges;
    const passThrough: string[] = [];
    for (const n of currentNodes) {
      const incoming = currentEdges.filter(e => e.target === n.id);
      const outgoing = currentEdges.filter(e => e.source === n.id);
      if (incoming.length === 1 && outgoing.length === 1 && !n.data.content && !n.data.description && !n.data.sections?.length) {
        passThrough.push(n.id);
      }
    }
    if (passThrough.length > 0 && duplicates.length === 0) pushHistory();
    for (const ptId of passThrough) {
      const state = get();
      const inEdge = state.edges.find(e => e.target === ptId);
      const outEdge = state.edges.find(e => e.source === ptId);
      if (!inEdge || !outEdge) continue;
      const ptNode = state.nodes.find(n => n.id === ptId);
      // Create direct edge from upstream to downstream
      const newEdge = { ...inEdge, id: `e-${inEdge.source}-${outEdge.target}`, target: outEdge.target };
      set(s => ({
        nodes: s.nodes.filter(n => n.id !== ptId),
        edges: [...s.edges.filter(e => e.id !== inEdge.id && e.id !== outEdge.id), newEdge],
      }));
      findings.push(`Removed pass-through "${ptNode?.data.label ?? ptId}" — connected upstream directly to downstream`);
      removedCount++;
    }

    // 3. Orphan warning (no removal — just report)
    const finalNodes = get().nodes;
    const finalEdges = get().edges;
    const orphans = finalNodes.filter(n => !finalEdges.some(e => e.source === n.id || e.target === n.id));
    if (orphans.length > 0) {
      findings.push(`Found ${orphans.length} orphan node${orphans.length > 1 ? 's' : ''} with no connections: ${orphans.map(n => n.data.label).slice(0, 5).join(', ')}${orphans.length > 5 ? '...' : ''}`);
    }

    if (findings.length === 0) {
      return cidMode === 'poirot'
        ? 'I examined every node with my little grey cells, mon ami. The workflow is already lean — no redundancy detected.'
        : 'Workflow is clean. No duplicates, pass-throughs, or orphans found.';
    }

    saveToStorage({ nodes: get().nodes, edges: get().edges, events: get().events, messages: get().messages });
    const summary = cidMode === 'poirot'
      ? `### Compression Report\n\n${findings.map(f => `- ${f}`).join('\n')}\n\n---\n*Voilà!* Removed **${removedCount}** redundant node${removedCount !== 1 ? 's' : ''}, merged **${mergedCount}** duplicate${mergedCount !== 1 ? 's' : ''}. The workflow breathes easier now.`
      : `### Compression Report\n\n${findings.map(f => `- ${f}`).join('\n')}\n\n---\nRemoved **${removedCount}** node${removedCount !== 1 ? 's' : ''}. ${mergedCount} merge${mergedCount !== 1 ? 's' : ''}.`;
    return summary;
  },

  // Bottleneck detection — identify choke points (high fan-in) and hubs (high fan-out)
  findBottlenecks: () => {
    const { nodes, edges, cidMode } = get();
    if (nodes.length === 0) return 'No workflow to analyze.';
    if (edges.length === 0) return 'No edges — cannot detect bottlenecks.';

    const inCount = new Map<string, number>();
    const outCount = new Map<string, number>();
    for (const n of nodes) { inCount.set(n.id, 0); outCount.set(n.id, 0); }
    for (const e of edges) {
      inCount.set(e.target, (inCount.get(e.target) || 0) + 1);
      outCount.set(e.source, (outCount.get(e.source) || 0) + 1);
    }

    // Choke points: high fan-in (3+ incoming)
    const chokePoints = nodes
      .filter(n => (inCount.get(n.id) || 0) >= 3)
      .sort((a, b) => (inCount.get(b.id) || 0) - (inCount.get(a.id) || 0));

    // Hub nodes: high fan-out (3+ outgoing)
    const hubs = nodes
      .filter(n => (outCount.get(n.id) || 0) >= 3)
      .sort((a, b) => (outCount.get(b.id) || 0) - (outCount.get(a.id) || 0));

    // Single points of failure: nodes where removal disconnects the graph
    const spofs: string[] = [];
    for (const n of nodes) {
      if (nodes.length <= 2) break;
      const otherNodes = nodes.filter(nd => nd.id !== n.id);
      const otherEdges = edges.filter(e => e.source !== n.id && e.target !== n.id);
      if (otherEdges.length === 0 && otherNodes.length > 1) { spofs.push(n.data.label); continue; }
      // BFS from first remaining node
      const visited = new Set<string>();
      const queue = [otherNodes[0].id];
      visited.add(queue[0]);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const e of otherEdges) {
          if (e.source === cur && !visited.has(e.target)) { visited.add(e.target); queue.push(e.target); }
          if (e.target === cur && !visited.has(e.source)) { visited.add(e.source); queue.push(e.source); }
        }
      }
      if (visited.size < otherNodes.length) spofs.push(n.data.label);
    }

    const parts: string[] = ['### Bottleneck Analysis', ''];

    if (chokePoints.length > 0) {
      parts.push('**Choke Points** (high fan-in — potential slowdowns)');
      for (const n of chokePoints.slice(0, 5)) {
        parts.push(`- **${n.data.label}** ← ${inCount.get(n.id)} incoming edges (${n.data.category})`);
      }
      parts.push('');
    }

    if (hubs.length > 0) {
      parts.push('**Hub Nodes** (high fan-out — single source of truth)');
      for (const n of hubs.slice(0, 5)) {
        parts.push(`- **${n.data.label}** → ${outCount.get(n.id)} outgoing edges (${n.data.category})`);
      }
      parts.push('');
    }

    if (spofs.length > 0) {
      parts.push('**Single Points of Failure** (removal disconnects the graph)');
      for (const name of spofs.slice(0, 5)) {
        parts.push(`- ⚠ **${name}**`);
      }
      parts.push('');
    }

    if (chokePoints.length === 0 && hubs.length === 0 && spofs.length === 0) {
      return cidMode === 'poirot'
        ? 'The workflow topology is well-balanced, mon ami. No bottlenecks, no choke points. A clean case indeed.'
        : 'No bottlenecks detected. The graph is well-distributed.';
    }

    // Summary
    const total = chokePoints.length + hubs.length + spofs.length;
    const advice = cidMode === 'poirot'
      ? `---\n*${total} point${total !== 1 ? 's' : ''} of interest detected.* The little grey cells suggest reviewing these structural concentrations — they may conceal weaknesses, mon ami.`
      : `---\n${total} structural concentration${total !== 1 ? 's' : ''}. Consider adding redundancy or splitting high-fanout nodes.`;
    parts.push(advice);
    return parts.join('\n');
  },

  // Execution progress state
  executionProgress: null,

  // Elapsed time for node execution
  executionStartTime: null,

  // Context-aware next-step suggestions — analyzes full graph state
  suggestNextSteps: () => {
    const { nodes, edges, cidMode } = get();
    if (nodes.length === 0) return 'No workflow yet. Start by describing what you want to build.';

    const suggestions: string[] = [];
    const stale = nodes.filter(n => n.data.status === 'stale');
    const reviewing = nodes.filter(n => n.data.status === 'reviewing');
    const orphans = nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id));
    const emptyContent = nodes.filter(n => ['artifact', 'note', 'policy', 'state'].includes(n.data.category) && !n.data.content && !n.data.description);
    const locked = nodes.filter(n => n.data.status === 'locked');

    // Priority-ordered suggestions
    if (stale.length > 0) suggestions.push(`**${stale.length} stale node${stale.length > 1 ? 's' : ''}** — run \`propagate\` to sync downstream changes (${stale.map(n => n.data.label).slice(0, 3).join(', ')})`);
    if (orphans.length > 0) suggestions.push(`**${orphans.length} orphan${orphans.length > 1 ? 's' : ''}** — run \`solve\` to auto-connect or \`delete\` to clean up (${orphans.map(n => n.data.label).slice(0, 3).join(', ')})`);
    if (reviewing.length > 0) suggestions.push(`**${reviewing.length} node${reviewing.length > 1 ? 's' : ''} in review** — run \`approve all\` or review individually`);
    if (emptyContent.length > 0) suggestions.push(`**${emptyContent.length} node${emptyContent.length > 1 ? 's' : ''} missing content** — run \`auto-describe\` or click to add manually`);
    if (locked.length > 0 && locked.length === nodes.length) suggestions.push('All nodes are locked — run `unlock all` to resume editing');

    // Structural suggestions
    const { order } = topoSort(nodes, edges);
    if (order.length < nodes.length) suggestions.push('**Cycle detected** in the graph — run `validate` to identify the loop');

    // Growth suggestions
    const categories = [...new Set(nodes.map(n => n.data.category))];
    if (!categories.includes('review') && nodes.length >= 4) suggestions.push('No review gates — consider adding a `review` node for quality assurance');
    if (!categories.includes('output') && nodes.length >= 4) suggestions.push('No output nodes — consider adding an `output` node to collect deliverables');
    if (edges.length < nodes.length - 1) suggestions.push(`Graph is sparse (${edges.length} edges for ${nodes.length} nodes) — run \`solve\` to suggest connections`);

    if (suggestions.length === 0) {
      return cidMode === 'poirot'
        ? 'Remarkable, mon ami! The workflow is in excellent shape. No pressing issues — perhaps extend it with new capabilities?'
        : 'Workflow looks solid. No issues found. Ready to extend or execute.';
    }

    const header = cidMode === 'poirot'
      ? '### The Little Grey Cells Suggest...'
      : '### Suggested Next Steps';
    const numbered = suggestions.slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join('\n');
    return `${header}\n\n${numbered}`;
  },

  // Detailed health breakdown with structured assessment
  healthBreakdown: () => {
    const { nodes, edges, cidMode, getComplexityScore } = get();
    if (nodes.length === 0) return 'No workflow to analyze.';

    const report = assessWorkflowHealth(nodes, edges);
    const complexity = getComplexityScore();
    const parts: string[] = ['### Health Assessment', ''];

    // Main health report
    parts.push(formatHealthReport(report, cidMode));
    parts.push('');

    // Complexity
    parts.push(`**Complexity:** ${complexity.label} (${complexity.score})`);
    parts.push('');

    // Per-category breakdown
    const categories = [...new Set(nodes.map(n => n.data.category))];
    parts.push('**By Category**');
    for (const cat of categories) {
      const catNodes = nodes.filter(n => n.data.category === cat);
      const active = catNodes.filter(n => n.data.status === 'active').length;
      const stale = catNodes.filter(n => n.data.status === 'stale').length;
      const catHealth = catNodes.length > 0 ? Math.round((active / catNodes.length) * 100) : 100;
      const icon = catHealth >= 80 ? '✓' : catHealth >= 50 ? '⚠' : '✗';
      parts.push(`- ${icon} **${cat}** — ${catNodes.length} node${catNodes.length > 1 ? 's' : ''}, ${catHealth}% active${stale > 0 ? ` (${stale} stale)` : ''}`);
    }

    // Content completeness
    const withContent = nodes.filter(n => n.data.content || n.data.description || n.data.sections?.length).length;
    const contentPct = Math.round((withContent / nodes.length) * 100);
    parts.push('');
    parts.push(`**Content:** ${withContent}/${nodes.length} nodes have content (${contentPct}%)`);

    // Update health fingerprint (so proactive alerts know this was already shown)
    set({ _lastHealthFingerprint: issueFingerprint(report.issues) });

    return parts.join('\n');
  },

  retryFailed: async () => {
    const store = get();
    const { nodes, cidMode } = store;
    const failedNodes = nodes.filter(n =>
      n.data.executionStatus === 'error' && n.data.executionError !== 'Skipped: upstream dependency failed'
    );
    if (failedNodes.length === 0) {
      store.addMessage({ id: uid(), role: 'cid', content: cidMode === 'poirot'
        ? 'There are no failed nodes to retry, mon ami. The case is clean.'
        : 'No failed nodes to retry.', timestamp: Date.now() });
      return;
    }

    // Clear error status on failed nodes and their downstream skipped nodes
    const _failedIds = new Set(failedNodes.map(n => n.id));
    const skippedNodes = nodes.filter(n =>
      n.data.executionStatus === 'error' && n.data.executionError === 'Skipped: upstream dependency failed'
    );
    for (const n of [...failedNodes, ...skippedNodes]) {
      store.updateNodeData(n.id, { executionStatus: 'idle', executionError: undefined, executionResult: undefined });
    }

    const retryMsg = cidMode === 'poirot'
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
      ? `Cleared execution results from **${cleared}** node${cleared !== 1 ? 's' : ''}. The slate is clean, mon ami — ready for a fresh investigation.`
      : `Cleared ${cleared} node${cleared !== 1 ? 's' : ''}. Ready for re-execution.`;
  },

  getPreFlightSummary: () => {
    const { nodes, edges, cidMode } = get();
    if (nodes.length === 0) return 'No workflow to execute.';

    const { order, levels } = topoSort(nodes, edges);
    const levelGroups = new Map<number, string[]>();
    for (const nodeId of order) {
      const level = levels.get(nodeId) ?? 0;
      if (!levelGroups.has(level)) levelGroups.set(level, []);
      levelGroups.get(level)!.push(nodeId);
    }
    const stages = [...levelGroups.keys()].sort((a, b) => a - b);
    const parallelNodes = stages.filter(l => (levelGroups.get(l)?.length ?? 0) > 1).length;

    const inputNodes = nodes.filter(n => n.data.category === 'input');
    const outputNodes = nodes.filter(n => n.data.category === 'output');
    const aiNodes = nodes.filter(n => n.data.aiPrompt || ['cid', 'artifact'].includes(n.data.category));
    const withContent = nodes.filter(n => (n.data.content?.length ?? 0) > 50 && !n.data.aiPrompt);

    const parts = ['### Pre-Flight Summary', ''];
    parts.push(`**Pipeline:** ${nodes.length} nodes → ${stages.length} stages${parallelNodes > 0 ? ` (${parallelNodes} parallel)` : ' (sequential)'}`);
    parts.push(`**Inputs:** ${inputNodes.length} · **Outputs:** ${outputNodes.length} · **AI-processed:** ${aiNodes.length}`);
    if (withContent.length > 0) parts.push(`**Pre-loaded content:** ${withContent.length} nodes (will bypass AI)`);

    // Time estimation: ~5-8s per AI call, parallel stages share the max
    const stageEstimates: number[] = [];
    for (const level of stages) {
      const ids = levelGroups.get(level) || [];
      const aiCount = ids.filter(id => {
        const n = nodes.find(nd => nd.id === id);
        if (!n) return false;
        const hasRichContent = (n.data.content?.length ?? 0) > 50 && !n.data.aiPrompt;
        return !hasRichContent && n.data.category !== 'input';
      }).length;
      stageEstimates.push(aiCount > 0 ? 7 : 0); // ~7s per AI stage (parallel within stage)
    }
    const totalSec = stageEstimates.reduce((a, b) => a + b, 0);
    if (totalSec > 0) parts.push(`**Est. time:** ~${totalSec}s (${stages.length} stage${stages.length > 1 ? 's' : ''}, AI calls run in parallel within each stage)`);
    parts.push('');

    parts.push('**Execution order:**');
    for (const level of stages) {
      const levelNodeIds = levelGroups.get(level) || [];
      const labels = levelNodeIds.map(id => {
        const n = nodes.find(nd => nd.id === id);
        return n?.data.label ?? id;
      });
      if (labels.length === 1) {
        parts.push(`${level + 1}. ${labels[0]}`);
      } else {
        parts.push(`${level + 1}. ${labels.join(' ‖ ')} *(parallel)*`);
      }
    }

    const tail = cidMode === 'poirot'
      ? `\n---\n*Say \`run workflow\` to begin the investigation, mon ami.*`
      : `\n---\nSay \`run workflow\` to execute.`;
    parts.push(tail);
    return parts.join('\n');
  },

  lastExecutionSnapshot: new Map(),

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
        parts.push(`- **${n.data.label}**: ✨ new result (${current.length} chars)`);
      } else if (current && previous && current !== previous) {
        changed++;
        const lenDiff = current.length - previous.length;
        parts.push(`- **${n.data.label}**: ↔ changed (${lenDiff > 0 ? '+' : ''}${lenDiff} chars)`);
      } else if (current && previous && current === previous) {
        unchanged++;
      } else if (!current && previous) {
        removed++;
        parts.push(`- **${n.data.label}**: ✗ result cleared`);
      }
    }

    if (newResults === 0 && changed === 0 && removed === 0) {
      parts.push('No changes detected — all results identical to last run.');
    } else {
      parts.push('');
      parts.push(`**Summary:** ${newResults} new, ${changed} changed, ${unchanged} unchanged, ${removed} cleared`);
    }

    return parts.join('\n');
  },

  // ── Artifact Preview/Edit Panel ──
  // ── Artifact Preview/Edit Panel — from ArtifactSlice ──

  // ═══════════════════════════════════════════════════════════════════════════
  // ── Central Brain Architecture ──
  // CID IS the product. The canvas is CID's visual workspace.
  // ═══════════════════════════════════════════════════════════════════════════

  hasContext: () => !!get().centralContext,

  getUnderstanding: () => get().centralContext?.understanding ?? null,

  getArtifactContracts: () => get().centralContext?.artifacts ?? {},

  ingestSource: async (input, contentType, title) => {
    const store = get();
    cidLog('ingestSource', { contentType, length: input.length, title });
    store.setProcessing(true);

    const thinkingId = uid();
    store.addMessage({
      id: thinkingId, role: 'cid', content: '',
      timestamp: Date.now(), action: 'analyzing',
    });

    try {
      const agent = getAgent(store.cidMode);
      const layers = getAgentLayers(store.cidMode);
      const systemPrompt = `You are CID, an AI agent analyzing source material for a content lifecycle system.

Analyze the following source material and return a JSON object with this exact structure:
{
  "summary": "2-3 sentence summary of the content",
  "keyEntities": ["entity1", "entity2"],
  "tone": "professional|casual|technical|academic|playful",
  "audience": "who this content is for",
  "intent": "what the author is trying to achieve",
  "constraints": ["things to preserve or respect"],
  "suggestedArtifacts": ["blog-post", "email", "social-thread", "ad-copy", "press-release", "landing-page", "newsletter", "product-description"]
}

Only suggest artifact types that make sense for this content. Be specific about tone, audience, and intent.
Return ONLY valid JSON, no other text.`;

      const ingestController = new AbortController();
      const ingestTimeout = setTimeout(() => ingestController.abort(), 90000);
      const res = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          messages: [{ role: 'user', content: `Analyze this source material:\n\n${input.slice(0, 8000)}` }],
          model: store.cidAIModel,
          taskType: 'generate',
        }),
        signal: ingestController.signal,
      });
      clearTimeout(ingestTimeout);

      const data = await res.json();
      set(s => ({ messages: s.messages.filter(m => m.id !== thinkingId) }));

      let understanding;
      if (data.result) {
        const raw = typeof data.result === 'string' ? data.result : data.result.message || JSON.stringify(data.result);
        try {
          // Extract JSON from response (handle markdown code blocks)
          const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
          understanding = JSON.parse(jsonMatch[1]!.trim());
        } catch {
          // Fallback: basic understanding without AI
          understanding = {
            summary: input.slice(0, 200) + '...',
            keyEntities: [],
            tone: 'professional',
            audience: 'general',
            intent: 'content creation',
            constraints: [],
            suggestedArtifacts: ['blog-post', 'email', 'social-thread'],
          };
        }
      } else {
        understanding = {
          summary: input.slice(0, 200) + '...',
          keyEntities: [],
          tone: 'professional',
          audience: 'general',
          intent: 'content creation',
          constraints: [],
          suggestedArtifacts: ['blog-post', 'email', 'social-thread'],
        };
      }

      // Simple hash of source content for change detection
      const sourceHash = btoa(input.slice(0, 500)).slice(0, 32);

      const newContext: CentralContext = {
        source: {
          content: input,
          contentType,
          title: title || understanding.keyEntities?.[0] || 'Untitled',
          lastUpdated: Date.now(),
        },
        understanding,
        artifacts: get().centralContext?.artifacts ?? {},
        overrides: get().centralContext?.overrides ?? [],
      };

      set({ centralContext: newContext, isProcessing: false });
      saveToStorage({ nodes: store.nodes, edges: store.edges, events: store.events, messages: store.messages });

      // Build response message with suggestions
      const artifactSuggestions = understanding.suggestedArtifacts?.slice(0, 6) || [];
      const agentObj = getAgent(store.cidMode);
      const emoji = store.cidMode === 'rowan' ? '🎯' : '🔍';
      const responseMsg = `${emoji} **Source ingested.** Here's what I understand:

**Summary:** ${understanding.summary}
**Tone:** ${understanding.tone} · **Audience:** ${understanding.audience}
**Key entities:** ${understanding.keyEntities?.join(', ') || 'none identified'}
**Intent:** ${understanding.intent}

I can generate these artifact types from your content:
${artifactSuggestions.map((a: string) => `• ${a.replace(/-/g, ' ')}`).join('\n')}

What should I build first?`;

      store.addMessage({
        id: uid(), role: 'cid', content: responseMsg, timestamp: Date.now(),
        suggestions: artifactSuggestions.map((a: string) => `create ${a.replace(/-/g, ' ')}`),
      });

      cidLog('ingestSource:complete', { entities: understanding.keyEntities?.length, artifacts: artifactSuggestions.length });
    } catch (err) {
      set(s => ({ messages: s.messages.filter(m => m.id !== thinkingId), isProcessing: false }));
      store.addMessage({
        id: uid(), role: 'cid',
        content: '⚠ Failed to analyze source material. I\'ve stored the raw content — you can still ask me to generate artifacts from it.',
        timestamp: Date.now(),
      });
      // Still store the raw context even on AI failure — preserve existing artifacts/overrides
      const existingCtx = get().centralContext;
      set({
        centralContext: {
          source: { content: input, contentType, title: title || existingCtx?.source?.title || 'Untitled', lastUpdated: Date.now() },
          understanding: existingCtx?.understanding ?? { summary: input.slice(0, 200), keyEntities: [], tone: 'professional', audience: 'general', intent: 'content creation', constraints: [], suggestedArtifacts: [] },
          artifacts: existingCtx?.artifacts ?? {},
          overrides: existingCtx?.overrides ?? [],
        },
      });
    }
  },

  updateSource: async (newContent) => {
    const store = get();
    const ctx = store.centralContext;
    if (!ctx) {
      // No existing context — treat as fresh ingestion
      return store.ingestSource(newContent, 'text');
    }

    cidLog('updateSource', { oldLength: ctx.source.content.length, newLength: newContent.length });

    // Update source and re-analyze
    const oldContent = ctx.source.content;
    set({
      centralContext: {
        ...ctx,
        source: { ...ctx.source, content: newContent, lastUpdated: Date.now() },
      },
    });

    // Mark all artifacts as stale
    const artifacts = { ...ctx.artifacts };
    console.error('[CID:updateSource]', 'marking stale:', Object.keys(artifacts));
    for (const nodeId of Object.keys(artifacts)) {
      artifacts[nodeId] = { ...artifacts[nodeId], syncStatus: 'stale' };
      // Also mark the node itself as stale on canvas
      const node = store.nodes.find(n => n.id === nodeId);
      if (node) {
        store.updateNodeData(nodeId, {
          status: 'stale',
          artifactContract: { ...artifacts[nodeId] },
        });
      }
    }
    set(s => ({
      centralContext: s.centralContext ? { ...s.centralContext, artifacts } : null,
    }));

    // Re-ingest to update understanding
    await store.ingestSource(newContent, ctx.source.contentType, ctx.source.title);
  },

  createArtifact: async (artifactType, customPrompt) => {
    const store = get();
    const ctx = store.centralContext;
    if (!ctx) {
      store.addMessage({ id: uid(), role: 'cid', content: '⚠ No source material ingested yet. Paste or describe your content first, and I\'ll analyze it before generating artifacts.', timestamp: Date.now() });
      return null;
    }

    cidLog('createArtifact', { artifactType });
    store.setProcessing(true);
    store.pushHistory();

    const thinkingId = uid();
    store.addMessage({
      id: thinkingId, role: 'cid', content: '',
      timestamp: Date.now(), action: 'building',
    });

    try {
      const prompt = customPrompt || `Generate a ${artifactType.replace(/-/g, ' ')} from the source material.`;
      const systemPrompt = `You are CID, an AI agent generating content artifacts.

SOURCE MATERIAL:
${ctx.source.content.slice(0, 6000)}

UNDERSTANDING:
- Summary: ${ctx.understanding.summary}
- Tone: ${ctx.understanding.tone}
- Audience: ${ctx.understanding.audience}
- Intent: ${ctx.understanding.intent}
- Key entities: ${ctx.understanding.keyEntities.join(', ')}
- Constraints: ${ctx.understanding.constraints.join(', ') || 'none'}

${ctx.overrides.filter(o => o.scope === 'global').map(o => `GLOBAL OVERRIDE: ${o.cidInterpretation || o.field + ': ' + o.userValue}`).join('\n')}

Generate a high-quality ${artifactType.replace(/-/g, ' ')} based on this source material.
Return ONLY valid JSON:
{
  "title": "artifact title",
  "content": "full artifact content in markdown (at least 300 chars, real content not placeholders)",
  "derivedFields": [
    { "field": "field name (e.g. headline, body, cta)", "sourceMapping": "what part of source this came from", "transform": "how it was transformed" }
  ]
}`;

      const res = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          messages: [{ role: 'user', content: prompt }],
          model: store.cidAIModel,
          taskType: 'generate',
        }),
      });

      const data = await res.json();
      set(s => ({ messages: s.messages.filter(m => m.id !== thinkingId) }));

      if (data.error) {
        set({ isProcessing: false });
        store.addMessage({ id: uid(), role: 'cid', content: '⚠ Failed to generate artifact. Try again or rephrase.', timestamp: Date.now() });
        return null;
      }

      let result;
      const raw = typeof data.result === 'string' ? data.result : data.result?.message || JSON.stringify(data.result);
      try {
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
        result = JSON.parse(jsonMatch[1]!.trim());
      } catch {
        // AI returned plain text — use it as content directly
        result = {
          title: `${artifactType.replace(/-/g, ' ')} — ${ctx.source.title || 'Untitled'}`,
          content: raw,
          derivedFields: [{ field: 'body', sourceMapping: 'full source', transform: 'generate' }],
        };
      }

      // Create the node on canvas
      const nodeId = uid();
      const sourceHash = btoa(ctx.source.content.slice(0, 500)).slice(0, 32);
      const contract: ArtifactContract = {
        nodeId,
        artifactType,
        derivedFields: result.derivedFields || [],
        generationPrompt: prompt,
        model: store.cidAIModel,
        lastSyncedAt: Date.now(),
        lastSourceHash: sourceHash,
        syncStatus: 'current',
        userEdits: [],
      };

      // Position: find a good spot radiating from center
      const existingNodes = get().nodes;
      const centerX = existingNodes.length > 0
        ? existingNodes.reduce((sum, n) => sum + n.position.x, 0) / existingNodes.length
        : 400;
      const centerY = existingNodes.length > 0
        ? existingNodes.reduce((sum, n) => sum + n.position.y, 0) / existingNodes.length
        : 300;
      const angle = (Object.keys(ctx.artifacts).length) * (2 * Math.PI / Math.max(Object.keys(ctx.artifacts).length + 1, 4));
      const radius = 300;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      const newNode: Node<NodeData> = {
        id: nodeId,
        type: 'lifecycleNode',
        position: { x, y },
        data: {
          label: result.title || `${artifactType.replace(/-/g, ' ')}`,
          category: 'deliverable' as NodeCategory,
          status: 'active',
          description: `CID-managed ${artifactType.replace(/-/g, ' ')} · derived from source`,
          content: result.content || '',
          version: 1,
          lastUpdated: Date.now(),
          artifactContract: contract,
        },
      };

      // Add node and update central context
      set(s => {
        const updatedArtifacts = { ...(s.centralContext?.artifacts ?? {}), [nodeId]: contract };
        return {
          nodes: [...s.nodes, newNode],
          centralContext: s.centralContext ? { ...s.centralContext, artifacts: updatedArtifacts } : null,
          isProcessing: false,
        };
      });

      get().requestFitView();
      saveToStorage({ nodes: get().nodes, edges: get().edges, events: get().events, messages: get().messages });

      const agentEmoji = store.cidMode === 'rowan' ? '✅' : '📋';
      store.addMessage({
        id: uid(), role: 'cid',
        content: `${agentEmoji} **${result.title || artifactType}** created and added to canvas.\n\n${(result.derivedFields || []).length} fields derived from source. This artifact is now tracked — I'll keep it in sync when your source changes.`,
        timestamp: Date.now(),
        suggestions: [
          ...(ctx?.understanding?.suggestedArtifacts || [])
            .filter(a => a !== artifactType)
            .slice(0, 2)
            .map(a => `create ${a.replace(/-/g, ' ')}`),
          'sync all',
          'show understanding',
          `edit ${result.title || artifactType}`,
        ],
      });

      cidLog('createArtifact:complete', { nodeId, artifactType, contentLength: result.content?.length });
      return nodeId;
    } catch (err) {
      set(s => ({ messages: s.messages.filter(m => m.id !== thinkingId), isProcessing: false }));
      store.addMessage({ id: uid(), role: 'cid', content: '⚠ Artifact generation failed. Try again.', timestamp: Date.now() });
      return null;
    }
  },

  syncArtifact: async (nodeId) => {
    const store = get();
    const ctx = store.centralContext;
    if (!ctx) { (window as any).__cidSync = { exit: 'no context' }; return null; }

    const contract = ctx.artifacts[nodeId];
    if (!contract) { (window as any).__cidSync = { exit: 'no contract', nodeId, artifactKeys: Object.keys(ctx.artifacts) }; return null; }
    if (contract.syncStatus === 'current') { (window as any).__cidSync = { exit: 'already current', nodeId }; return null; }

    cidLog('syncArtifact', { nodeId, artifactType: contract.artifactType });

    const node = store.nodes.find(n => n.id === nodeId);
    if (!node) { (window as any).__cidSync = { exit: 'node not found', nodeId }; return null; }

    // Mark as regenerating
    store.updateNodeData(nodeId, {
      status: 'generating',
      artifactContract: { ...contract, syncStatus: 'regenerating' },
    });

    try {
      const overrides = ctx.overrides.filter(o => o.nodeId === nodeId);
      const overrideInstructions = overrides.length > 0
        ? `\n\nUSER OVERRIDES (respect these — do not change these aspects):\n${overrides.map(o => `- ${o.field}: "${o.userValue}" (reason: ${o.cidInterpretation || 'user preference'})`).join('\n')}`
        : '';

      const systemPrompt = `You are CID performing a surgical sync on an artifact.

SOURCE MATERIAL (updated):
${ctx.source.content.slice(0, 6000)}

CURRENT ARTIFACT CONTENT:
${node.data.content?.slice(0, 4000) || '(empty)'}

ARTIFACT CONTRACT:
- Type: ${contract.artifactType}
- Derived fields: ${contract.derivedFields.map(f => `${f.field} (from: ${f.sourceMapping}, transform: ${f.transform})`).join('; ')}
${overrideInstructions}

The source material has been updated since this artifact was last synced.
Surgically update ONLY the parts of the artifact that are affected by the source changes.
Preserve the overall structure and any user overrides.

Return JSON:
{
  "updatedContent": "the full updated artifact content",
  "changes": [
    { "field": "field name", "before": "old text snippet", "after": "new text snippet", "reason": "why this changed" }
  ],
  "skipped": [
    { "field": "field name", "reason": "why this was not changed" }
  ],
  "confidence": 0.85
}`;

      const syncController = new AbortController();
      const syncTimeout = setTimeout(() => syncController.abort(), 90000);
      const res = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          messages: [{ role: 'user', content: 'Perform surgical sync now.' }],
          model: store.cidAIModel,
          taskType: 'generate',
        }),
        signal: syncController.signal,
      });
      clearTimeout(syncTimeout);

      const data = await res.json();
      (window as any).__cidSync = { stage: 'api_response', status: res.status, hasError: !!data.error, hasResult: !!data.result, resultType: typeof data.result };
      if (data.error) {
        (window as any).__cidSync = { exit: 'api_error', error: data.error };
        store.updateNodeData(nodeId, { status: 'stale' });
        return null;
      }

      let result;
      const raw = typeof data.result === 'string' ? data.result : data.result?.message || JSON.stringify(data.result);
      cidLog('syncArtifact:rawResponse', { nodeId, rawLength: raw?.length, rawPreview: raw?.slice(0, 200) });
      try {
        // Try to extract JSON from code blocks or raw text
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/) || [null, raw];
        result = JSON.parse(jsonMatch[1]!.trim());
      } catch (parseErr) {
        (window as any).__cidSync = { exit: 'parse_error', error: String(parseErr), rawPreview: raw?.slice(0, 300) };
        store.updateNodeData(nodeId, { status: 'stale' });
        return null;
      }

      // Apply the sync
      const sourceHash = btoa(ctx.source.content.slice(0, 500)).slice(0, 32);
      const updatedContract: ArtifactContract = {
        ...contract,
        lastSyncedAt: Date.now(),
        lastSourceHash: sourceHash,
        syncStatus: 'current',
      };

      store.updateNodeData(nodeId, {
        content: result.updatedContent || node.data.content,
        status: 'active',
        artifactContract: updatedContract,
        version: (node.data.version || 1) + 1,
        lastUpdated: Date.now(),
      });

      // Update central context
      set(s => ({
        centralContext: s.centralContext ? {
          ...s.centralContext,
          artifacts: { ...s.centralContext.artifacts, [nodeId]: updatedContract },
        } : null,
      }));

      const diff: SurgicalDiff = {
        nodeId,
        changes: result.changes || [],
        skipped: result.skipped || [],
        confidence: result.confidence || 0.8,
      };

      cidLog('syncArtifact:complete', { nodeId, changes: diff.changes.length, skipped: diff.skipped.length });
      return diff;
    } catch (outerErr) {
      (window as any).__cidSync = { exit: 'outer_catch', error: String(outerErr) };
      store.updateNodeData(nodeId, { status: 'stale' });
      return null;
    }
  },

  syncAllStale: async () => {
    const store = get();
    const ctx = store.centralContext;
    if (!ctx) return [];

    const allArtifacts = Object.entries(ctx.artifacts);
    console.error('[CID:syncAllStale]', 'artifacts:', allArtifacts.map(([id, c]) => `${id}:${c.syncStatus}`));
    const staleIds = allArtifacts
      .filter(([, c]) => c.syncStatus === 'stale')
      .map(([id]) => id);

    if (staleIds.length === 0) {
      store.addMessage({ id: uid(), role: 'cid', content: 'All artifacts are current. Nothing to sync.', timestamp: Date.now() });
      return [];
    }

    store.addMessage({
      id: uid(), role: 'cid',
      content: `🔄 Syncing ${staleIds.length} stale artifact${staleIds.length > 1 ? 's' : ''}...`,
      timestamp: Date.now(),
    });

    const results: SurgicalDiff[] = [];
    for (const nodeId of staleIds) {
      const diff = await store.syncArtifact(nodeId);
      if (diff) results.push(diff);
    }

    const totalChanges = results.reduce((sum, d) => sum + d.changes.length, 0);
    const totalSkipped = results.reduce((sum, d) => sum + d.skipped.length, 0);
    store.addMessage({
      id: uid(), role: 'cid',
      content: `✅ Sync complete. **${results.length}** artifact${results.length > 1 ? 's' : ''} updated with **${totalChanges}** surgical change${totalChanges !== 1 ? 's' : ''}. ${totalSkipped} field${totalSkipped !== 1 ? 's' : ''} unchanged.`,
      timestamp: Date.now(),
      suggestions: ['status', 'show understanding', 'diff'],
    });

    return results;
  },

  previewSync: () => {
    const ctx = get().centralContext;
    if (!ctx) return [];
    return Object.entries(ctx.artifacts)
      .filter(([, c]) => c.syncStatus === 'stale')
      .map(([nodeId, c]) => ({
        nodeId,
        reason: `${c.artifactType} is stale — source changed since last sync`,
      }));
  },

  recordOverride: (nodeId, field, oldVal, newVal) => {
    const ctx = get().centralContext;
    if (!ctx) return;

    const override: Override = {
      id: `ovr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nodeId,
      field,
      originalValue: oldVal,
      userValue: newVal,
      timestamp: Date.now(),
      propagated: false,
      scope: 'this-node',
    };

    set(s => ({
      centralContext: s.centralContext ? {
        ...s.centralContext,
        overrides: [...s.centralContext.overrides, override],
      } : null,
    }));

    // Also update the artifact contract's userEdits
    const contract = ctx.artifacts[nodeId];
    if (contract) {
      const updatedContract: ArtifactContract = {
        ...contract,
        syncStatus: 'override',
        userEdits: [...contract.userEdits, {
          field,
          originalValue: oldVal,
          userValue: newVal,
          timestamp: Date.now(),
        }],
      };
      set(s => ({
        centralContext: s.centralContext ? {
          ...s.centralContext,
          artifacts: { ...s.centralContext.artifacts, [nodeId]: updatedContract },
        } : null,
      }));
    }

    cidLog('recordOverride', { nodeId, field });
  },

  interpretOverride: async (overrideId) => {
    const store = get();
    const ctx = store.centralContext;
    if (!ctx) return null;

    const override = ctx.overrides.find(o => o.id === overrideId);
    if (!override) return null;

    const node = store.nodes.find(n => n.id === override.nodeId);
    const nodeLabel = node?.data?.label || override.nodeId;
    const contract = ctx.artifacts[override.nodeId];

    cidLog('interpretOverride', { overrideId, nodeId: override.nodeId, field: override.field });

    try {
      const res = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: `You are CID, a content intelligence agent. Analyze a user's manual edit to an AI-generated artifact and deduce the user's intent. Be concise — one sentence explaining what the user wanted and why. Examples: "User wants a more casual tone for social content", "User corrected a factual error about pricing", "User prefers shorter paragraphs for readability".`,
          model: store.cidAIModel,
          taskType: 'analyze',
          effortLevel: 'low',
          messages: [{
            role: 'user',
            content: `Artifact: "${nodeLabel}" (${contract?.artifactType || 'unknown type'})\nField changed: ${override.field}\n\nOriginal value:\n${override.originalValue.slice(0, 500)}\n\nUser's new value:\n${override.userValue.slice(0, 500)}\n\nWhat was the user's intent with this edit? Respond with a single concise sentence.`,
          }],
        }),
      });

      if (!res.ok) return null;
      const result = await res.json();
      const interpretation = (result.content || result.message || '').trim();
      if (!interpretation) return null;

      // Store the interpretation on the override
      set(s => ({
        centralContext: s.centralContext ? {
          ...s.centralContext,
          overrides: s.centralContext.overrides.map(o =>
            o.id === overrideId ? { ...o, cidInterpretation: interpretation } : o
          ),
        } : null,
      }));

      cidLog('interpretOverride:done', { overrideId, interpretation: interpretation.slice(0, 80) });
      return interpretation;
    } catch (err) {
      cidLog('interpretOverride:error', String(err));
      return null;
    }
  },

  propagateOverride: async (overrideId, scope) => {
    const store = get();
    const ctx = store.centralContext;
    if (!ctx) return;

    const override = ctx.overrides.find(o => o.id === overrideId);
    if (!override) return;

    cidLog('propagateOverride', { overrideId, scope });

    // Ensure we have an interpretation first
    let interpretation = override.cidInterpretation;
    if (!interpretation) {
      interpretation = await store.interpretOverride(overrideId) || undefined;
    }

    if (scope === 'this-node') {
      // Already scoped — just mark as propagated
      set(s => ({
        centralContext: s.centralContext ? {
          ...s.centralContext,
          overrides: s.centralContext.overrides.map(o =>
            o.id === overrideId ? { ...o, scope: 'this-node', propagated: true } : o
          ),
        } : null,
      }));
      store.addMessage({
        id: `msg-${Date.now()}`,
        role: 'cid',
        content: `Override kept for this node only. I'll respect "${override.field}" edits on "${store.nodes.find(n => n.id === override.nodeId)?.data?.label || override.nodeId}" going forward.`,
        timestamp: Date.now(),
      });
    } else if (scope === 'all-similar') {
      // Apply the override intent to all artifacts of the same type
      const sourceContract = ctx.artifacts[override.nodeId];
      if (!sourceContract) return;
      const similarNodeIds = Object.entries(ctx.artifacts)
        .filter(([id, c]) => id !== override.nodeId && c.artifactType === sourceContract.artifactType)
        .map(([id]) => id);

      // Record override on similar nodes
      for (const nodeId of similarNodeIds) {
        store.recordOverride(nodeId, override.field, '', override.userValue);
      }

      set(s => ({
        centralContext: s.centralContext ? {
          ...s.centralContext,
          overrides: s.centralContext.overrides.map(o =>
            o.id === overrideId ? { ...o, scope: 'all-similar', propagated: true } : o
          ),
        } : null,
      }));

      const names = similarNodeIds.map(id => store.nodes.find(n => n.id === id)?.data?.label || id);
      store.addMessage({
        id: `msg-${Date.now()}`,
        role: 'cid',
        content: similarNodeIds.length > 0
          ? `Override applied to ${similarNodeIds.length} similar artifact${similarNodeIds.length > 1 ? 's' : ''}: ${names.join(', ')}. ${interpretation ? `Intent: ${interpretation}` : ''}`
          : `No other artifacts of the same type found. Override kept on this node.`,
        timestamp: Date.now(),
      });
    } else if (scope === 'global') {
      // Update the central context understanding based on the override intent
      if (interpretation) {
        set(s => {
          if (!s.centralContext) return {};
          const currentConstraints = s.centralContext.understanding.constraints || [];
          return {
            centralContext: {
              ...s.centralContext,
              understanding: {
                ...s.centralContext.understanding,
                constraints: [...currentConstraints, interpretation],
              },
              overrides: s.centralContext.overrides.map(o =>
                o.id === overrideId ? { ...o, scope: 'global', propagated: true } : o
              ),
            },
          };
        });

        store.addMessage({
          id: `msg-${Date.now()}`,
          role: 'cid',
          content: `Updated my understanding globally: "${interpretation}". All future artifacts will respect this preference.`,
          timestamp: Date.now(),
        });
      } else {
        store.addMessage({
          id: `msg-${Date.now()}`,
          role: 'cid',
          content: `I couldn't determine the intent of this edit clearly enough to apply it globally. Try describing what you want in the chat instead.`,
          timestamp: Date.now(),
        });
      }
    }

    cidLog('propagateOverride:done', { overrideId, scope });
  },

  forgetOverride: (overrideId) => {
    set(s => ({
      centralContext: s.centralContext ? {
        ...s.centralContext,
        overrides: s.centralContext.overrides.filter(o => o.id !== overrideId),
      } : null,
    }));
  },

}));
