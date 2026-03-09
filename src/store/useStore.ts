'use client';

import { create } from 'zustand';
import type { Node, Edge, Connection } from '@xyflow/react';
import type { NodeData, LifecycleEvent, CIDMessage, NodeCategory, CIDMode, AgentPersonalityLayers, HabitLayer, GenerationLayer, ReflectionLayer, DrivingForceLayer } from '@/lib/types';
import { registerCustomCategory, EDGE_LABEL_COLORS, BUILT_IN_CATEGORIES } from '@/lib/types';
import { getAgent, getInterviewQuestions, buildEnrichedPrompt } from '@/lib/agents';
import { buildSystemPrompt, buildMessages, getExecutionSystemPrompt, inferEffortFromCategory, buildNoteRefinementPrompt } from '@/lib/prompts';
import type { NoteRefinementResult } from '@/lib/prompts';
import { classifyEdit } from '@/lib/edits';
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

type Snapshot = { nodes: Node<NodeData>[]; edges: Edge[] };

interface PoirotContext {
  phase: 'idle' | 'interviewing' | 'investigating' | 'revealing';
  originalPrompt: string;
  answers: Record<string, string>;
  questionIndex: number;
}

interface LifecycleStore {
  nodes: Node<NodeData>[];
  edges: Edge[];
  events: LifecycleEvent[];
  messages: CIDMessage[];
  selectedNodeId: string | null;
  multiSelectedIds: Set<string>;
  toggleMultiSelect: (id: string) => void;
  clearMultiSelect: () => void;
  deleteMultiSelected: () => number;
  showCIDPanel: boolean;
  showActivityPanel: boolean;
  showPreviewPanel: boolean;
  togglePreviewPanel: () => void;
  isProcessing: boolean;

  // Agent mode
  cidMode: CIDMode;
  setCIDMode: (mode: CIDMode) => void;
  poirotContext: PoirotContext;
  handleCardSelect: (cardId: string, cardLabel: string) => void;

  // Undo/Redo
  history: Snapshot[];
  future: Snapshot[];
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Context menu
  contextMenu: { nodeId: string; x: number; y: number } | null;
  openContextMenu: (nodeId: string, x: number, y: number) => void;
  closeContextMenu: () => void;

  setNodes: (nodes: Node<NodeData>[] | ((prev: Node<NodeData>[]) => Node<NodeData>[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  selectNode: (id: string | null) => void;
  toggleCIDPanel: () => void;
  toggleActivityPanel: () => void;
  addEvent: (event: LifecycleEvent) => void;
  addMessage: (message: CIDMessage) => void;
  updateStreamingMessage: (id: string, content: string) => void;
  addNode: (node: Node<NodeData>) => void;
  addEdge: (edge: Edge) => void;
  createNewNode: (category: NodeCategory) => void;
  duplicateNode: (id: string) => void;
  updateNodeStatus: (id: string, status: NodeData['status']) => void;
  updateNodeData: (id: string, partial: Partial<NodeData>) => void;
  deleteNode: (id: string) => void;
  deleteEdge: (id: string) => void;
  onConnect: (connection: Connection) => void;
  setProcessing: (v: boolean) => void;
  lockNode: (id: string) => void;
  approveNode: (id: string) => void;
  propagateStale: () => Promise<void>;
  optimizeLayout: () => void;
  cidSolve: () => { created: number; message: string };
  generateWorkflow: (prompt: string) => void;
  chatWithCID: (prompt: string) => void;
  aiEnabled: boolean;
  exportWorkflow: () => string;
  importWorkflow: (json: string) => boolean;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Batch actions
  batchUpdateStatus: (fromStatus: NodeData['status'], toStatus: NodeData['status']) => number;

  // Edge label editing
  updateEdgeLabel: (edgeId: string, label: string) => void;

  // Edge label picker after connect
  pendingEdge: { edgeId: string; x: number; y: number } | null;
  setPendingEdge: (pending: { edgeId: string; x: number; y: number } | null) => void;

  // Ask CID about a specific node
  askCIDAboutNode: (nodeId: string) => void;

  // Generate AI content for a node
  generateNodeContent: (nodeId: string) => void;

  // Toast notifications
  toasts: Array<{ id: string; message: string; type: 'success' | 'info' | 'warning' | 'error' }>;
  addToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error', autoDismissMs?: number) => void;
  removeToast: (id: string) => void;

  // Chat management
  clearMessages: () => void;
  exportChatHistory: () => string;

  // Stop processing
  stopProcessing: () => void;

  // Edit & resend
  deleteMessage: (id: string) => void;

  // New project
  newProject: () => void;

  // Load a workflow template by name
  loadTemplate: (templateName: string) => void;

  // Natural language edge creation/removal
  connectByName: (prompt: string) => { success: boolean; message: string };
  disconnectByName: (prompt: string) => { success: boolean; message: string };

  // Status report
  getStatusReport: () => string;

  // Delete node by name
  deleteByName: (prompt: string) => { success: boolean; message: string };

  // Rename node by name
  renameByName: (prompt: string) => { success: boolean; message: string };

  // Explain workflow as narrative
  explainWorkflow: () => string;

  // Add node by name via chat
  addNodeByName: (prompt: string) => { success: boolean; message: string };

  // Set node status by name via chat
  setStatusByName: (prompt: string) => { success: boolean; message: string };

  // List nodes by category or status
  listNodes: (prompt: string) => string;

  // Describe a node via chat
  describeByName: (prompt: string) => { success: boolean; message: string };

  // Swap positions of two nodes
  swapByName: (prompt: string) => { success: boolean; message: string };

  // Set node content via chat
  contentByName: (prompt: string) => { success: boolean; message: string };

  // Health score (0-100)
  getHealthScore: () => number;

  // Complexity score
  getComplexityScore: () => { score: number; label: string };

  // Group nodes by category
  groupByCategory: () => { success: boolean; message: string };

  // Clear stale nodes
  clearStale: () => { count: number; message: string };

  // Find orphan nodes (no connections)
  findOrphans: () => string;

  // Count nodes by category or status
  countNodes: () => string;

  // Merge two nodes into one
  mergeByName: (prompt: string) => { success: boolean; message: string };

  // Show dependency chain for a node
  depsByName: (prompt: string) => string;

  // Reverse edge directions for a node
  reverseByName: (prompt: string) => { success: boolean; message: string };

  // Named snapshots (save/restore workflow state)
  snapshots: Map<string, { nodes: Node<NodeData>[]; edges: Edge[]; timestamp: number }>;
  saveSnapshot: (name: string) => string;
  restoreSnapshot: (name: string) => { success: boolean; message: string };
  listSnapshots: () => string;

  // Critical path analysis
  criticalPath: () => string;

  // Isolate a subgraph around a node
  isolateByName: (prompt: string) => string;

  // Executive summary of entire workflow
  summarize: () => string;

  // Validate workflow integrity
  validate: () => string;

  // Explain why a node exists (trace incoming chain)
  whyNode: (prompt: string) => string;

  // Re-infer all edge labels from category pairs
  relabelAllEdges: () => { count: number; message: string };

  // Pinned messages
  pinnedMessageIds: Set<string>;
  togglePinMessage: (id: string) => void;

  // Clone entire workflow
  cloneWorkflow: () => string;

  // What-if impact analysis
  whatIf: (prompt: string) => string;

  // Workflow execution
  executeNode: (nodeId: string) => Promise<void>;
  executeWorkflow: () => Promise<void>;
  executeBranch: (nodeId: string) => Promise<void>;

  // Execution mutex
  _executingNodeIds: Set<string>;
  _lockNode: (nodeId: string) => void;
  _unlockNode: (nodeId: string) => void;

  // Fit view trigger — Canvas watches this counter and calls fitView when it changes
  fitViewCounter: number;
  requestFitView: () => void;

  // AI model selection for CID
  cidAIModel: string;
  setCIDAIModel: (model: string) => void;

  // CID learned rules (teach command)
  cidRules: string[];
  addCIDRule: (rule: string) => string;
  removeCIDRule: (index: number) => string;
  listCIDRules: () => string;

  // Workflow progress (0-100)
  getWorkflowProgress: () => { percent: number; done: number; total: number; blocked: number };

  // Diff current workflow vs a saved snapshot
  diffSnapshot: (name: string) => string;

  // Batch operations with conditions
  batchWhere: (prompt: string) => { success: boolean; message: string };

  // Navigation breadcrumbs
  breadcrumbs: string[];
  addBreadcrumb: (nodeId: string) => void;
  clearBreadcrumbs: () => void;

  // Execution plan
  generatePlan: () => string;

  // Chat search
  searchMessages: (query: string) => string;

  // Proactive alert after mutations
  checkPostMutation: () => string | null;

  // Custom templates
  customTemplates: Map<string, { nodes: Node<NodeData>[]; edges: Edge[]; timestamp: number }>;
  saveAsTemplate: (name: string) => string;
  loadCustomTemplate: (name: string) => string;
  listCustomTemplates: () => string;

  // Export chat as markdown
  exportChatMarkdown: () => string;

  // Auto-describe empty nodes with AI
  autoDescribe: () => Promise<void>;

  // Workflow compression — find duplicates, boilerplate, and redundant paths
  compressWorkflow: () => string;

  // Bottleneck detection — identify choke points and hubs
  findBottlenecks: () => string;

  // Execution progress tracking
  executionProgress: { current: number; total: number; currentLabel: string; running: boolean; stage?: number; totalStages?: number; succeeded?: number; failed?: number; skipped?: number } | null;

  // Context-aware next-step suggestions
  suggestNextSteps: () => string;

  // Detailed health breakdown
  healthBreakdown: () => string;

  // Re-run only failed/skipped nodes
  retryFailed: () => Promise<void>;

  // Clear all execution results for a fresh run
  clearExecutionResults: () => string;

  // Pre-flight summary before execution
  getPreFlightSummary: () => string;

  // Compare current vs last execution results
  lastExecutionSnapshot: Map<string, string>;
  diffLastRun: () => string;

  // ── Artifact Preview/Edit Panel ──
  activeArtifactNodeId: string | null;
  artifactPanelTab: 'content' | 'result';
  artifactPanelMode: 'preview' | 'edit';
  artifactVersions: Record<string, Array<{ content: string; result?: string; timestamp: number; label: string }>>;
  openArtifactPanel: (nodeId: string) => void;
  closeArtifactPanel: () => void;
  setArtifactTab: (tab: 'content' | 'result') => void;
  setArtifactMode: (mode: 'preview' | 'edit') => void;
  saveArtifactVersion: (nodeId: string) => void;
  restoreArtifactVersion: (nodeId: string, versionIndex: number) => void;
  rewriteArtifactSelection: (nodeId: string, selectedText: string, instruction: string) => Promise<string | null>;
  getDownstreamNodes: (nodeId: string) => Array<{ id: string; label: string; category: string }>;

  // ── Impact Preview ──
  impactPreview: {
    visible: boolean;
    staleNodes: Array<{ id: string; label: string; category: string }>;
    executionOrder: string[];
    estimatedCalls: number;
    selectedNodeIds: Set<string>;
  } | null;
  showImpactPreview: () => void;
  hideImpactPreview: () => void;
  toggleImpactNodeSelection: (nodeId: string) => void;
  selectAllImpactNodes: () => void;
  deselectAllImpactNodes: () => void;
  regenerateSelected: (nodeIds?: string[]) => Promise<void>;

  // ── Node Versioning ──
  rollbackNode: (nodeId: string, versionNumber: number) => void;

  // ── Note Refinement ──
  refineNote: (nodeId: string) => Promise<void>;
  applyRefinementSuggestion: (suggestion: { type: 'node'; label: string; category: string; content: string; connectTo?: string; edgeLabel?: string } | { type: 'edge'; from: string; to: string; label: string } | { type: 'clean'; content: string; nodeId: string }) => void;

  // ── Project Management ──
  projects: Map<string, { nodes: Node<NodeData>[]; edges: Edge[]; messages: CIDMessage[]; cidMode: CIDMode; cidAIModel: string; createdAt: number; updatedAt: number }>;
  currentProjectName: string | null;
  saveProject: (name: string) => string;
  loadProject: (name: string) => { success: boolean; message: string };
  deleteProject: (name: string) => { success: boolean; message: string };
  listProjects: () => string;
  renameProject: (oldName: string, newName: string) => { success: boolean; message: string };
}

// ── Agent activity logger — visible in browser console for debugging ──
const cidLog = (action: string, detail?: string | Record<string, unknown>) => {
  const ts = new Date().toISOString().slice(11, 23);
  const msg = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : '';
  console.log(`%c[CID ${ts}]%c ${action}${msg ? ' — ' + msg : ''}`, 'color: #10b981; font-weight: bold', 'color: inherit');
};

let nodeCounter = 100;
const uid = () => `node-${++nodeCounter}`;

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
  if (!lastSaveArgs) return;
  const { state, cidMode } = lastSaveArgs;
  lastSaveArgs = null;
  if (typeof window === 'undefined') return;

  // Cap events and filter ephemeral messages to prevent quota bloat
  const cappedEvents = state.events.slice(-200);
  const cappedMessages = state.messages.filter(m => !m._ephemeral).slice(-100);
  const saveNodes = state.nodes.map(n => ({ ...n }));

  const data = {
    _version: STORAGE_VERSION,
    nodes: saveNodes,
    edges: state.edges,
    events: cappedEvents,
    messages: cappedMessages,
    ...(cidMode !== undefined && { cidMode }),
    cidAIModel: currentAIModel,
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

const MAX_HISTORY = 30;

export const useLifecycleStore = create<LifecycleStore>((set, get) => ({
  nodes: persisted?.nodes ?? [],
  edges: persisted?.edges ?? [],
  events: persisted?.events ?? [],
  // Welcome-back messages are ephemeral — appended at init but filtered out before saving
  messages: (() => {
    if (persisted?.messages) {
      const wb = buildWelcomeBack(persisted.nodes ?? [], persisted.edges ?? [], persistedMode);
      return wb ? [...persisted.messages, { ...wb, _ephemeral: true }] : persisted.messages;
    }
    return [{ id: 'init-1', role: 'cid' as const, content: getAgent(persistedMode).welcome, timestamp: Date.now() }];
  })(),
  selectedNodeId: null,
  showCIDPanel: true,
  showActivityPanel: false,
  showPreviewPanel: false,
  isProcessing: false,

  // Fit view trigger
  fitViewCounter: 0,
  requestFitView: () => set((s) => ({ fitViewCounter: s.fitViewCounter + 1 })),

  // AI model for CID (persisted)
  cidAIModel: persistedModel,
  setCIDAIModel: (model) => {
    currentAIModel = model;
    set({ cidAIModel: model });
  },

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

    const newAnswers = { ...ctx.answers, [`q${ctx.questionIndex}`]: cardId };
    const nextQ = ctx.questionIndex + 1;
    const questions = getInterviewQuestions(ctx.originalPrompt, store.nodes, store.edges);
    const agent = getAgent(store.cidMode);

    if (nextQ < questions.length) {
      set({ poirotContext: { ...ctx, answers: newAnswers, questionIndex: nextQ } });
      setTimeout(() => {
        const q = questions[nextQ];
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
          const enrichedPrompt = buildEnrichedPrompt(ctx.originalPrompt, newAnswers, questions);
          store.generateWorkflow(enrichedPrompt);
          set({ poirotContext: { phase: 'idle', originalPrompt: '', answers: {}, questionIndex: 0 } });
        }, 1500);
      }, 600);
    }
  },

  // Named snapshots
  snapshots: new Map(),

  // Pinned messages
  pinnedMessageIds: new Set<string>(),
  togglePinMessage: (id) => set(s => {
    const next = new Set(s.pinnedMessageIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    return { pinnedMessageIds: next };
  }),

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
      return null;
    })();

    // If no prompt could be generated, pass through upstream content
    if (!autoPrompt) {
      const passthrough = upstreamResults.join('\n\n---\n\n') || d.content || '';
      store.updateNodeData(nodeId, { executionResult: passthrough, executionStatus: passthrough ? 'success' : 'idle', _executionStartedAt: _execStart, _executionDurationMs: Date.now() - _execStart });
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

    store.updateNodeData(nodeId, { executionStatus: 'running', executionError: undefined, _executionStartedAt: _execStart });
    store.updateNodeStatus(nodeId, 'generating');
    cidLog('executeNode:running', { nodeId, label: d.label, model: store.cidAIModel, upstreamCount: upstreamResults.length });

    try {
      // All AI execution routes through the server-side /api/cid route
      let output = '';

      {
        const systemPrompt = getExecutionSystemPrompt(d.category, d.label, inputContext);
        const effortLevel = d._effortLevel || inferEffortFromCategory(d.category);
        const res = await fetch('/api/cid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt,
            model: store.cidAIModel,
            taskType: 'execute',
            effortLevel,
            messages: [{ role: 'user', content: `${autoPrompt}\n\n${inputContext}` }],
          }),
        });

        if (!res.ok) {
          const errMsg = `CID API error ${res.status}`;
          store.updateNodeData(nodeId, { executionStatus: 'error', executionError: errMsg, _executionDurationMs: Date.now() - _execStart });
          store.updateNodeStatus(nodeId, 'active');
          return;
        }
        const result = await res.json();
        if (result.error) {
          store.updateNodeData(nodeId, { executionStatus: 'error', executionError: result.error === 'no_api_key' ? 'No API key configured on server.' : result.message, _executionDurationMs: Date.now() - _execStart });
          store.updateNodeStatus(nodeId, 'active');
          return;
        }
        // The response may be parsed JSON or raw text
        output = result.result?.content || result.result?.message || (typeof result.result === 'string' ? result.result : JSON.stringify(result.result));
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
      store.updateNodeData(nodeId, { executionResult: output, executionStatus: 'success', executionError: undefined, apiKey: undefined, _executionDurationMs: _execDuration });
      store.updateNodeStatus(nodeId, 'active');
      store.addEvent({ id: uid(), type: 'regenerated', message: `Executed "${d.label}" successfully (${(_execDuration / 1000).toFixed(1)}s)`, timestamp: Date.now(), nodeId, agent: true });
      cidLog('executeNode:success', { nodeId, outputLength: output.length, durationMs: _execDuration });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Execution failed';
      store.updateNodeData(nodeId, { executionStatus: 'error', executionError: errMsg, _executionDurationMs: Date.now() - _execStart });
      store.updateNodeStatus(nodeId, 'active');
      store.addToast(`Node "${d.label}" failed: ${errMsg.slice(0, 80)}`, 'error');
      cidLog('executeNode:error', errMsg);
    } finally {
      get()._unlockNode(nodeId);
    }
  },

  executeWorkflow: async () => {
    const store = get();
    const { nodes, edges } = store;
    cidLog('executeWorkflow', { nodeCount: nodes.length, edgeCount: edges.length });
    if (nodes.length === 0) return;
    const mode = get().cidMode;

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

        // Skip if any upstream dependency failed (cascade skip)
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

        await store.executeNode(nodeId);
        completed++;
        const updated = get().nodes.find(n => n.id === nodeId);
        if (updated?.data.executionStatus === 'error') {
          errorCount++;
          failedNames.push(nodeLabel);
        } else {
          successCount++;
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

  // Undo/Redo
  history: [],
  future: [],

  pushHistory: () =>
    set((s) => ({
      history: [...s.history.slice(-(MAX_HISTORY - 1)), { nodes: s.nodes, edges: s.edges }],
      future: [],
    })),

  undo: () => {
    const s = get();
    if (s.history.length === 0) return;
    const prev = s.history[s.history.length - 1];
    const nodeDiff = prev.nodes.length - s.nodes.length;
    const edgeDiff = prev.edges.length - s.edges.length;
    set({
      nodes: prev.nodes,
      edges: prev.edges,
      history: s.history.slice(0, -1),
      future: [{ nodes: s.nodes, edges: s.edges }, ...s.future],
    });
    saveToStorage({ nodes: prev.nodes, edges: prev.edges, events: s.events, messages: s.messages });
    // Diff toast
    const parts: string[] = [];
    if (nodeDiff > 0) parts.push(`+${nodeDiff} node${nodeDiff > 1 ? 's' : ''}`);
    if (nodeDiff < 0) parts.push(`${nodeDiff} node${nodeDiff < -1 ? 's' : ''}`);
    if (edgeDiff > 0) parts.push(`+${edgeDiff} edge${edgeDiff > 1 ? 's' : ''}`);
    if (edgeDiff < 0) parts.push(`${edgeDiff} edge${edgeDiff < -1 ? 's' : ''}`);
    s.addToast(`Undo${parts.length ? ': ' + parts.join(', ') : ''}`, 'info');
  },

  redo: () => {
    const s = get();
    if (s.future.length === 0) return;
    const next = s.future[0];
    const nodeDiff = next.nodes.length - s.nodes.length;
    const edgeDiff = next.edges.length - s.edges.length;
    set({
      nodes: next.nodes,
      edges: next.edges,
      future: s.future.slice(1),
      history: [...s.history, { nodes: s.nodes, edges: s.edges }],
    });
    saveToStorage({ nodes: next.nodes, edges: next.edges, events: s.events, messages: s.messages });
    const parts: string[] = [];
    if (nodeDiff > 0) parts.push(`+${nodeDiff} node${nodeDiff > 1 ? 's' : ''}`);
    if (nodeDiff < 0) parts.push(`${nodeDiff} node${nodeDiff < -1 ? 's' : ''}`);
    if (edgeDiff > 0) parts.push(`+${edgeDiff} edge${edgeDiff > 1 ? 's' : ''}`);
    if (edgeDiff < 0) parts.push(`${edgeDiff} edge${edgeDiff < -1 ? 's' : ''}`);
    s.addToast(`Redo${parts.length ? ': ' + parts.join(', ') : ''}`, 'info');
  },

  // Context menu
  contextMenu: null,
  openContextMenu: (nodeId, x, y) => set({ contextMenu: { nodeId, x, y }, selectedNodeId: nodeId }),
  closeContextMenu: () => set({ contextMenu: null }),

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

  selectNode: (id) => {
    set({ selectedNodeId: id, multiSelectedIds: new Set() });
    if (id) get().addBreadcrumb(id);
  },

  multiSelectedIds: new Set<string>(),
  toggleMultiSelect: (id) => set((s) => {
    const next = new Set(s.multiSelectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { multiSelectedIds: next, selectedNodeId: id };
  }),
  clearMultiSelect: () => set({ multiSelectedIds: new Set() }),
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

  toggleCIDPanel: () => set((s) => ({ showCIDPanel: !s.showCIDPanel })),
  toggleActivityPanel: () => set((s) => ({ showActivityPanel: !s.showActivityPanel })),
  togglePreviewPanel: () => set((s) => ({ showPreviewPanel: !s.showPreviewPanel })),

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
      const nodes = [...s.nodes, node];
      saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
      return { nodes };
    }),

  addEdge: (edge) =>
    set((s) => {
      const edges = [...s.edges, edge];
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

    // Auto-connect: find the best existing node to connect to based on category inference
    if (store.nodes.length > 1) {
      const otherNodes = store.nodes.filter(n => n.id !== id);
      // Score each potential connection and pick the best
      let bestTarget: Node<NodeData> | null = null;
      let bestScore = 0;
      for (const other of otherNodes) {
        // Try both directions and pick the one with a non-generic label
        const fwdLabel = inferEdgeLabel(category, other.data.category);
        const revLabel = inferEdgeLabel(other.data.category, category);
        const fwdScore = fwdLabel !== 'connects' ? 2 : 0;
        const revScore = revLabel !== 'connects' ? 2 : 0;
        // Prefer leaf nodes (no outgoing edges) as targets for new connections
        const isLeaf = !store.edges.some(e => e.source === other.id);
        const leafBonus = isLeaf ? 1 : 0;
        const score = Math.max(fwdScore, revScore) + leafBonus;
        if (score > bestScore) {
          bestScore = score;
          bestTarget = other;
        }
      }
      if (bestTarget && bestScore > 0) {
        // Determine direction: if reverse scored higher, other→new; else new→other
        const revLabel = inferEdgeLabel(bestTarget.data.category, category);
        const fwdLabel = inferEdgeLabel(category, bestTarget.data.category);
        const isReverse = revLabel !== 'connects' && (fwdLabel === 'connects' || revLabel !== fwdLabel);
        const srcId = isReverse ? bestTarget.id : id;
        const tgtId = isReverse ? id : bestTarget.id;
        const edgeLabel = isReverse ? revLabel : fwdLabel;
        store.addEdge(createStyledEdge(srcId, tgtId, edgeLabel));
        store.addEvent({
          id: `ev-${Date.now()}-ac`, type: 'created',
          message: `Auto-connected ${isReverse ? bestTarget.data.label : node.data.label} → ${isReverse ? node.data.label : bestTarget.data.label} (${edgeLabel})`,
          timestamp: Date.now(), nodeId: id, agent: true,
        });
        if (store.showCIDPanel) {
          const ag = getAgent(store.cidMode);
          const msg = ag.accent === 'amber'
            ? `Ah, a new node — **${node.data.label}**. I have connected it to **${bestTarget.data.label}** (${edgeLabel}). Drag handles to adjust if needed.`
            : `New node: **${node.data.label}** — auto-connected to **${bestTarget.data.label}** (${edgeLabel}). Adjust as needed.`;
          store.addMessage({ id: `msg-${Date.now()}-ac`, role: 'cid', content: msg, timestamp: Date.now() });
        }
      } else if (store.showCIDPanel) {
        const ag = getAgent(store.cidMode);
        const existingNames = otherNodes.map(n => n.data.label).slice(0, 5);
        const msg = ag.accent === 'amber'
          ? `A new node appears — **${node.data.label}**. I could not determine a logical connection. Perhaps it relates to: ${existingNames.join(', ')}?`
          : `New node: **${node.data.label}**. No auto-connection inferred. Drag handles to connect or use \`connect\`.`;
        store.addMessage({ id: `msg-${Date.now()}-suggest`, role: 'cid', content: msg, timestamp: Date.now() });
      }
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
        const queue = [id];
        while (queue.length > 0) {
          const current = queue.shift()!;
          for (const edge of s.edges) {
            if (edge.source === current && !downstream.has(edge.target)) {
              const targetNode = nodes.find(n => n.id === edge.target);
              if (targetNode?.data.locked) continue; // Skip locked nodes
              downstream.add(edge.target);
              queue.push(edge.target);
            }
          }
        }
        if (downstream.size > 0) {
          const affected = nodes.filter(n => downstream.has(n.id) && n.data.status === 'active');
          if (affected.length > 0) {
            nodes = nodes.map((n) =>
              downstream.has(n.id) && n.data.status === 'active'
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
      const executionKeys = new Set(['executionResult', 'executionStatus', 'executionError', '_executionDurationMs', '_executionStartedAt']);
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

    // Only propagate for semantic and structural edits (not cosmetic or local)
    if (edit.shouldPropagate && !get()._executingNodeIds.has(id)) {
      get().updateNodeStatus(id, 'stale');
      get().addEvent({
        id: `ev-${Date.now()}-${id}`, type: 'edited',
        message: `${currentNode?.data.label ?? id}: ${edit.type} edit — ${edit.reason}`,
        timestamp: Date.now(), nodeId: id,
      });
      cidLog('updateNodeData:propagate', { id, editType: edit.type, reason: edit.reason });
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

  deleteEdge: (id) =>
    set((s) => {
      const edges = s.edges.filter((e) => e.id !== id);
      saveToStorage({ nodes: s.nodes, edges, events: s.events, messages: s.messages });
      return { edges };
    }),

  onConnect: (connection) => {
    const store = get();
    store.pushHistory();
    set((s) => {
      if (!connection.source || !connection.target) return s;
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

  // Search
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  // Batch status update — returns count of affected nodes
  batchUpdateStatus: (fromStatus, toStatus) => {
    const store = get();
    const matching = store.nodes.filter(n => n.data.status === fromStatus);
    if (matching.length === 0) return 0;
    store.pushHistory();
    set(s => {
      const nodes = s.nodes.map(n =>
        n.data.status === fromStatus
          ? { ...n, data: { ...n.data, status: toStatus, locked: toStatus === 'locked' ? true : toStatus === 'active' ? false : n.data.locked } }
          : n
      );
      saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
      return { nodes };
    });
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

  // Edge label picker state
  pendingEdge: null,
  setPendingEdge: (pending) => set({ pendingEdge: pending }),

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

  // Toast notifications
  toasts: [],
  addToast: (message, type = 'info', autoDismissMs) => {
    const id = `toast-${Date.now()}`;
    const dismissMs = autoDismissMs ?? (type === 'error' ? 8000 : 3500);
    set(s => ({ toasts: [...s.toasts.slice(-4), { id, message, type }] })); // cap at 5 visible
    if (dismissMs > 0) {
      setTimeout(() => {
        set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
      }, dismissMs);
    }
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

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
      const res = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, messages, model: get().cidAIModel, taskType: chatTaskType }),
        signal: chatController.signal,
      });
      clearTimeout(chatTimeout);

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
        set({ isProcessing: false, showActivityPanel: true });
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
              showActivityPanel: true,
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
              showActivityPanel: true,
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
    if (agent.interviewEnabled && poirotContext.phase === 'idle') {
      store.addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      const questions = getInterviewQuestions(prompt, store.nodes, store.edges);
      set({ poirotContext: { phase: 'interviewing', originalPrompt: prompt, answers: {}, questionIndex: 0 } });
      setTimeout(() => {
        store.addMessage({
          id: `msg-${Date.now()}-ack`, role: 'cid',
          content: agent.interviewAck,
          timestamp: Date.now(),
        });
        setTimeout(() => {
          const q = questions[0];
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

        wf.nodes.forEach((n, i) => {
          const id = uid();
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
            },
          });
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
            return { nodes, isProcessing: false, showActivityPanel: true };
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
          return { nodes, isProcessing: false, showActivityPanel: true };
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
          // Post-build suggestions after a short delay
          trackTimeout(() => {
            const s = get();
            const result = buildPostBuildSuggestions(s.nodes, s.edges);
            if (result) {
              store.addMessage({ id: uid(), role: 'cid', content: result.text, timestamp: Date.now(), suggestions: result.suggestions });
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
      return { isProcessing: false, messages };
    });
  },

  deleteMessage: (id) => {
    set(s => {
      const messages = s.messages.filter(m => m.id !== id);
      saveToStorage({ nodes: s.nodes, edges: s.edges, events: s.events, messages });
      return { messages };
    });
  },

  newProject: () => {
    const agent = getAgent(get().cidMode);
    const fresh = {
      nodes: [] as Node<NodeData>[],
      edges: [] as Edge[],
      events: [] as LifecycleEvent[],
      messages: [{ id: `msg-${Date.now()}`, role: 'cid' as const, content: agent.welcome, timestamp: Date.now() }],
      selectedNodeId: null,
      showActivityPanel: false,
      isProcessing: false,
      history: [] as Snapshot[],
      future: [] as Snapshot[],
      poirotContext: { phase: 'idle' as const, originalPrompt: '', answers: {}, questionIndex: 0 },
    };
    set(fresh);
    saveToStorage({ nodes: fresh.nodes, edges: fresh.edges, events: fresh.events, messages: fresh.messages });
  },

  loadTemplate: (templateName) => {
    const store = get();
    const templates: Record<string, { nodes: Array<{ label: string; category: NodeCategory; description: string }>; edges: Array<{ from: number; to: number; label: string }> }> = {
      'Software Development': {
        nodes: [
          { label: 'Requirements', category: 'input', description: 'User stories, feature specs, and acceptance criteria from stakeholders' },
          { label: 'Design', category: 'artifact', description: 'Create architecture diagrams, API contracts, and UI wireframes based on the requirements. Output a concise design document.' },
          { label: 'Development', category: 'state', description: 'Implement the code based on the design document. List the key modules built and their status.' },
          { label: 'Code Review', category: 'review', description: 'Review the implementation for correctness, style, security issues, and adherence to the design. Approve or request changes.' },
          { label: 'Testing', category: 'test', description: 'Run unit tests, integration tests, and manual QA against the acceptance criteria. Report pass/fail results.' },
          { label: 'Deployment', category: 'output', description: 'Deploy to production and confirm the release is live.' },
          { label: 'Monitoring', category: 'state', description: 'Track error rates, latency, and user metrics post-deployment. Report any anomalies.' },
        ],
        edges: [
          { from: 0, to: 1, label: 'drives' }, { from: 1, to: 2, label: 'feeds' },
          { from: 2, to: 3, label: 'triggers' }, { from: 3, to: 4, label: 'validates' },
          { from: 4, to: 5, label: 'approves' }, { from: 5, to: 6, label: 'triggers' },
        ],
      },
      'Content Pipeline': {
        nodes: [
          { label: 'Research', category: 'input', description: 'Topic research, audience analysis, and competitive landscape' },
          { label: 'Brief', category: 'artifact', description: 'Write a content brief with target audience, key messages, SEO keywords, and outline structure.' },
          { label: 'Writing', category: 'cid', description: 'Draft the full article or content piece based on the brief. Write in a clear, engaging style with proper markdown formatting.' },
          { label: 'Editorial Review', category: 'review', description: 'Review the draft for clarity, accuracy, tone, grammar, and alignment with the brief. Note specific improvements needed.' },
          { label: 'SEO & Format', category: 'policy', description: 'Check SEO: title tag, meta description, heading hierarchy, keyword density, internal links. Verify formatting meets publishing standards.' },
          { label: 'Published Article', category: 'output', description: 'Final published content ready for distribution.' },
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
          { label: 'Triage', category: 'state', description: 'Assess severity (P1-P4), identify affected services, assign incident commander, and set up communication channel.' },
          { label: 'Investigation', category: 'cid', description: 'Analyze logs, metrics, and traces to identify root cause. Document the timeline of events and contributing factors.' },
          { label: 'Resolution', category: 'action', description: 'Apply the fix: rollback, hotfix, config change, or scaling action. Verify the fix resolves the issue.' },
          { label: 'Incident Review', category: 'review', description: 'Review the response: Was triage fast enough? Was communication clear? Were the right people involved? Note what went well and what to improve.' },
          { label: 'Postmortem', category: 'output', description: 'Write a blameless postmortem with timeline, root cause, impact, action items, and lessons learned.' },
        ],
        edges: [
          { from: 0, to: 1, label: 'triggers' }, { from: 1, to: 2, label: 'drives' },
          { from: 2, to: 3, label: 'feeds' }, { from: 3, to: 4, label: 'triggers' },
          { from: 4, to: 5, label: 'approves' },
        ],
      },
      'Product Launch': {
        nodes: [
          { label: 'Market Research', category: 'input', description: 'Competitive analysis, user interviews, market sizing, and user needs assessment' },
          { label: 'PRD', category: 'artifact', description: 'Write a product requirements document: problem statement, target users, key features, success metrics, and constraints.' },
          { label: 'Design & Build', category: 'cid', description: 'Design the solution architecture and implement the core features. List key decisions, tradeoffs, and technical approach.' },
          { label: 'Beta Testing', category: 'review', description: 'Run beta with target users. Collect feedback on usability, bugs, and feature gaps. Summarize findings and recommend go/no-go.' },
          { label: 'Marketing Plan', category: 'artifact', description: 'Create go-to-market strategy: positioning, channels, launch timeline, budget, and success KPIs.' },
          { label: 'Launch', category: 'output', description: 'Execute the launch: deploy to production, publish marketing materials, and announce to users.' },
          { label: 'Post-Launch Metrics', category: 'state', description: 'Track adoption, activation, retention, and revenue KPIs for the first 30 days. Flag any metrics below target.' },
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
          { label: 'Intent Detection', category: 'cid', description: 'Classify the user message into one of: greeting, question, command, feedback, escalation. Return ONLY the classified intent and a one-line summary.' },
          { label: 'Context & Knowledge', category: 'state', description: 'Organize the conversation context. Summarize what the user wants based on the detected intent and any prior context. List key topics mentioned.' },
          { label: 'Response Generation', category: 'cid', description: 'Generate a helpful, friendly chatbot response to the user based on the intent classification and context summary. Be conversational and concise. Respond directly to what the user said.' },
          { label: 'Safety Check', category: 'policy', description: 'Review the generated response. Check for: harmful content, PII exposure, hallucinated facts, off-topic drift. If the response is safe, pass it through unchanged. If not, flag the issue.' },
          { label: 'Fallback Handler', category: 'action', description: 'If the safety check flagged issues or the intent was unclear, generate a safe fallback response asking for clarification. Otherwise pass through the approved response unchanged.' },
          { label: 'Bot Reply', category: 'output', description: 'Format and deliver the final chatbot response to the user. Pass through the response content from upstream as the final output.' },
        ],
        edges: [
          { from: 0, to: 1, label: 'triggers' }, { from: 1, to: 2, label: 'drives' },
          { from: 2, to: 3, label: 'feeds' }, { from: 3, to: 4, label: 'validates' },
          { from: 4, to: 5, label: 'feeds' }, { from: 5, to: 6, label: 'outputs' },
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
        return { nodes, showActivityPanel: true };
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

    set({ nodes: newNodes, edges: newEdges });
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
    const done = nodes.filter(n => n.data.status === 'active' || n.data.status === 'locked').length;
    const blocked = nodes.filter(n => n.data.status === 'stale').length;
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

  // Navigation breadcrumbs
  breadcrumbs: [],
  addBreadcrumb: (nodeId: string) => {
    set(s => {
      const filtered = s.breadcrumbs.filter(id => id !== nodeId);
      return { breadcrumbs: [...filtered, nodeId].slice(-8) };
    });
  },
  clearBreadcrumbs: () => set({ breadcrumbs: [] }),

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

  // Detailed health breakdown with per-category scoring
  healthBreakdown: () => {
    const { nodes, edges, cidMode, getHealthScore, getComplexityScore } = get();
    if (nodes.length === 0) return 'No workflow to analyze.';

    const overallHealth = getHealthScore();
    const complexity = getComplexityScore();
    const parts: string[] = ['### Health Breakdown', ''];

    // Overall score with visual bar
    const barLen = 20;
    const filled = Math.round((overallHealth / 100) * barLen);
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
    const scoreColor = overallHealth >= 80 ? 'healthy' : overallHealth >= 50 ? 'moderate' : 'critical';
    parts.push(`**Overall: \`${bar}\` ${overallHealth}/100** (${scoreColor})`);
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
    parts.push('');

    // Connectivity score
    const maxEdges = nodes.length * (nodes.length - 1) / 2;
    const density = maxEdges > 0 ? Math.round((edges.length / maxEdges) * 100) : 0;
    const orphans = nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id)).length;
    parts.push('**Connectivity**');
    parts.push(`- Graph density: ${density}% (${edges.length} edges / ${maxEdges} possible)`);
    if (orphans > 0) parts.push(`- ⚠ ${orphans} disconnected node${orphans > 1 ? 's' : ''}`);
    else parts.push('- ✓ All nodes connected');
    parts.push('');

    // Content completeness
    const withContent = nodes.filter(n => n.data.content || n.data.description || n.data.sections?.length).length;
    const contentPct = Math.round((withContent / nodes.length) * 100);
    parts.push('**Content Completeness**');
    parts.push(`- ${withContent}/${nodes.length} nodes have content or descriptions (${contentPct}%)`);

    const tail = cidMode === 'poirot'
      ? `\n---\n*A thorough examination, mon ami. ${overallHealth >= 80 ? 'The case is strong.' : 'There are clues that warrant further investigation.'} Use \`suggest\` for recommended actions.*`
      : `\n---\nHealth: ${overallHealth}/100. Run \`suggest\` for recommended actions.`;
    parts.push(tail);
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
  activeArtifactNodeId: null,
  artifactPanelTab: 'content' as const,
  artifactPanelMode: 'preview' as const,
  artifactVersions: {},

  openArtifactPanel: (nodeId) => {
    const node = get().nodes.find(n => n.id === nodeId);
    if (!node) return;
    const versions = get().artifactVersions;
    // Initialize version history if this is the first time opening
    if (!versions[nodeId]) {
      versions[nodeId] = [{
        content: node.data.content || '',
        result: node.data.executionResult || '',
        timestamp: Date.now(),
        label: 'Initial',
      }];
    }
    set({
      activeArtifactNodeId: nodeId,
      artifactPanelTab: node.data.executionResult ? 'result' : 'content',
      artifactPanelMode: 'preview',
      artifactVersions: { ...versions },
    });
    cidLog('artifactPanel', `opened for "${node.data.label}"`);
  },

  closeArtifactPanel: () => set({ activeArtifactNodeId: null }),

  setArtifactTab: (tab) => set({ artifactPanelTab: tab }),
  setArtifactMode: (mode) => set({ artifactPanelMode: mode }),

  saveArtifactVersion: (nodeId) => {
    const node = get().nodes.find(n => n.id === nodeId);
    if (!node) return;
    const versions = { ...get().artifactVersions };
    const history = versions[nodeId] || [];
    history.push({
      content: node.data.content || '',
      result: node.data.executionResult || '',
      timestamp: Date.now(),
      label: `v${history.length}`,
    });
    // Cap at 20 versions
    if (history.length > 20) history.splice(0, history.length - 20);
    versions[nodeId] = history;
    set({ artifactVersions: versions });
    cidLog('artifactVersion', `saved v${history.length - 1} for "${node.data.label}"`);
  },

  restoreArtifactVersion: (nodeId, versionIndex) => {
    const versions = get().artifactVersions[nodeId];
    if (!versions || !versions[versionIndex]) return;
    const version = versions[versionIndex];
    const { pushHistory, updateNodeData, addEvent, nodes } = get();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    pushHistory();
    const updates: Partial<NodeData> = { content: version.content };
    if (version.result) updates.executionResult = version.result;
    updateNodeData(nodeId, updates);
    addEvent({ id: `ev-${Date.now()}`, type: 'edited', message: `Restored ${version.label} of "${node.data.label}"`, timestamp: Date.now(), nodeId, agent: false });
    cidLog('artifactRestore', `restored ${version.label} for "${node.data.label}"`);
  },

  rewriteArtifactSelection: async (nodeId, selectedText, instruction) => {
    const { cidAIModel, nodes } = get();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;
    const tab = get().artifactPanelTab;
    const fullText = tab === 'result' ? (node.data.executionResult || '') : (node.data.content || '');

    try {
      const res = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: 'You are a rewriting assistant. Rewrite ONLY the selected text according to the instruction. Return ONLY the rewritten text — no JSON, no explanation, no wrapping.',
          messages: [{ role: 'user', content: `SELECTED TEXT:\n"${selectedText}"\n\nINSTRUCTION: ${instruction}\n\nFULL CONTEXT (do not rewrite this, only the selected text):\n${fullText.slice(0, 2000)}` }],
          model: cidAIModel,
          taskType: 'analyze',
        }),
      });
      const data = await res.json();
      const rewritten = data.result?.message || data.result?.content || null;
      if (!rewritten) return null;

      // Replace the selected text in the full content
      const newText = fullText.replace(selectedText, rewritten);
      const { pushHistory, updateNodeData, saveArtifactVersion } = get();
      pushHistory();
      saveArtifactVersion(nodeId);
      if (tab === 'result') {
        updateNodeData(nodeId, { executionResult: newText });
      } else {
        updateNodeData(nodeId, { content: newText });
      }
      cidLog('artifactRewrite', `rewrote ${selectedText.length}c → ${rewritten.length}c in "${node.data.label}"`);
      return rewritten;
    } catch (err) {
      console.error('[Artifact] Rewrite failed:', err);
      return null;
    }
  },

  getDownstreamNodes: (nodeId) => {
    const { nodes, edges } = get();
    const downstream: Array<{ id: string; label: string; category: string }> = [];
    const visited = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of edges) {
        if (edge.source === current && !visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
          const n = nodes.find(nd => nd.id === edge.target);
          if (n) downstream.push({ id: n.id, label: n.data.label, category: n.data.category });
        }
      }
    }
    return downstream;
  },

  // ── Project Management ──
  projects: (() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('lifecycle-projects') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        return new Map(Object.entries(parsed));
      }
    } catch { /* ignore */ }
    return new Map();
  })(),
  currentProjectName: null,

  saveProject: (name) => {
    const { nodes, edges, messages, cidMode, cidAIModel, projects } = get();
    const trimmed = name.trim();
    if (!trimmed) return 'Project name cannot be empty.';
    if (nodes.length === 0) return 'No workflow to save. Build something first.';

    const existing = projects.get(trimmed);
    const now = Date.now();
    const project = {
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
      messages: messages.filter(m => !m._ephemeral),
      cidMode,
      cidAIModel,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    const updated = new Map(projects);
    updated.set(trimmed, project);
    set({ projects: updated, currentProjectName: trimmed });
    try { localStorage.setItem('lifecycle-projects', JSON.stringify(Object.fromEntries(updated))); } catch { /* quota */ }
    return existing
      ? `Updated project **"${trimmed}"** (${nodes.length} nodes, ${edges.length} edges).`
      : `Saved project **"${trimmed}"** (${nodes.length} nodes, ${edges.length} edges).`;
  },

  loadProject: (name) => {
    const { projects } = get();
    const trimmed = name.trim();
    const project = projects.get(trimmed);
    if (!project) {
      const available = [...projects.keys()];
      return { success: false, message: available.length > 0 ? `No project "${trimmed}". Available: ${available.join(', ')}.` : 'No saved projects. Use `save <name>` to create one.' };
    }
    const store = get();
    store.pushHistory();
    // Restore nodeCounter to prevent ID collisions
    if (project.nodes.length > 0) {
      const maxId = project.nodes.reduce((max: number, n: Node<NodeData>) => {
        const num = parseInt(n.id.replace('node-', ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      if (maxId >= nodeCounter) nodeCounter = maxId + 1;
    }
    set({
      nodes: structuredClone(project.nodes),
      edges: structuredClone(project.edges),
      messages: project.messages ? structuredClone(project.messages) : [],
      cidMode: project.cidMode || 'rowan',
      cidAIModel: project.cidAIModel || 'deepseek-chat',
      currentProjectName: trimmed,
    });
    saveToStorage({ nodes: project.nodes, edges: project.edges, events: get().events, messages: project.messages || [] });
    return { success: true, message: `Loaded project **"${trimmed}"** (${project.nodes.length} nodes, ${project.edges.length} edges).` };
  },

  deleteProject: (name) => {
    const { projects } = get();
    const trimmed = name.trim();
    if (!projects.has(trimmed)) return { success: false, message: `No project "${trimmed}" found.` };
    const updated = new Map(projects);
    updated.delete(trimmed);
    set({ projects: updated, currentProjectName: get().currentProjectName === trimmed ? null : get().currentProjectName });
    try { localStorage.setItem('lifecycle-projects', JSON.stringify(Object.fromEntries(updated))); } catch { /* quota */ }
    return { success: true, message: `Deleted project **"${trimmed}"**.` };
  },

  listProjects: () => {
    const { projects, currentProjectName } = get();
    if (projects.size === 0) return 'No saved projects. Use `save <name>` to create one.';
    const lines = [...projects.entries()].map(([name, p]) => {
      const date = new Date(p.updatedAt).toLocaleString();
      const current = name === currentProjectName ? ' ← current' : '';
      return `- **${name}** — ${p.nodes.length} nodes, ${p.edges.length} edges (${date})${current}`;
    });
    return `### Projects (${projects.size})\n${lines.join('\n')}\n\nUse \`load <name>\` to open a project.`;
  },

  renameProject: (oldName, newName) => {
    const { projects } = get();
    const trimOld = oldName.trim();
    const trimNew = newName.trim();
    if (!projects.has(trimOld)) return { success: false, message: `No project "${trimOld}" found.` };
    if (projects.has(trimNew)) return { success: false, message: `Project "${trimNew}" already exists.` };
    const updated = new Map(projects);
    const project = updated.get(trimOld)!;
    updated.delete(trimOld);
    updated.set(trimNew, project);
    set({ projects: updated, currentProjectName: get().currentProjectName === trimOld ? trimNew : get().currentProjectName });
    try { localStorage.setItem('lifecycle-projects', JSON.stringify(Object.fromEntries(updated))); } catch { /* quota */ }
    return { success: true, message: `Renamed project **"${trimOld}"** → **"${trimNew}"**.` };
  },
}));
