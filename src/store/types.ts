/**
 * Store-specific type definitions.
 * Extracted from useStore.ts to enable slice-based decomposition.
 */

import type { Node, Edge, Connection } from '@xyflow/react';
import type {
  NodeData, LifecycleEvent, CIDMessage, NodeCategory, CIDMode,
  CentralContext, ArtifactContract, SurgicalDiff, Override,
} from '@/lib/types';
import type { UsageStats } from '@/lib/cache';
import type { ProjectMeta } from '@/lib/storage';
import type { ProactiveSuggestion } from '@/lib/suggestions';
import type { Optimization } from '@/lib/optimizer';
import type { ExportFormat } from '@/lib/export';

/**
 * Operation-based undo — stores only the changed nodes/edges, not the full state.
 * Each operation is invertible: undo applies `before`, redo applies `after`.
 */
export interface UndoOperation {
  /** Nodes that existed before (for undo). Keyed by node ID. */
  beforeNodes: Map<string, Node<NodeData>>;
  /** Nodes that exist after (for redo). Keyed by node ID. */
  afterNodes: Map<string, Node<NodeData>>;
  /** Edges that existed before. Keyed by edge ID. */
  beforeEdges: Map<string, Edge>;
  /** Edges that exist after. Keyed by edge ID. */
  afterEdges: Map<string, Edge>;
  /** IDs of nodes that were deleted (present before, absent after). */
  deletedNodeIds: string[];
  /** IDs of nodes that were created (absent before, present after). */
  createdNodeIds: string[];
  /** IDs of edges that were deleted. */
  deletedEdgeIds: string[];
  /** IDs of edges that were created. */
  createdEdgeIds: string[];
  /** Human-readable label for toast. */
  label?: string;
}

export interface PoirotContext {
  phase: 'idle' | 'interviewing' | 'investigating' | 'revealing';
  originalPrompt: string;
  answers: Record<string, string>;
  questionIndex: number;
}

export interface LifecycleStore {
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
  showPreviewPanel: boolean;
  togglePreviewPanel: () => void;
  isProcessing: boolean;

  // Agent mode
  cidMode: CIDMode;
  setCIDMode: (mode: CIDMode) => void;
  poirotContext: PoirotContext;
  handleCardSelect: (cardId: string, cardLabel: string) => void;

  // Undo/Redo (operation-based)
  history: UndoOperation[];
  future: UndoOperation[];
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
  compileWorkflow: (format?: 'md' | 'html' | 'txt') => void;
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

  // Auto-save indicator
  lastSavedAt: number;

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

  // Projects
  currentProjectId: string | null;
  currentProjectName: string;
  newProject: () => void;
  switchProject: (id: string) => void;
  renameCurrentProject: (name: string) => void;
  deleteCurrentProject: () => void;
  listProjects: () => ProjectMeta[];

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

  // Fit view trigger
  fitViewCounter: number;
  requestFitView: () => void;

  // AI model selection for CID
  cidAIModel: string;
  setCIDAIModel: (model: string) => void;

  // Usage statistics
  _usageStats: UsageStats;
  resetUsageStats: () => void;

  // CID learned rules
  cidRules: string[];
  addCIDRule: (rule: string) => string;
  removeCIDRule: (index: number) => string;
  listCIDRules: () => string;

  // Workflow progress
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

  // Workflow compression
  compressWorkflow: () => string;

  // Bottleneck detection
  findBottlenecks: () => string;

  // Execution progress tracking
  executionProgress: { current: number; total: number; currentLabel: string; running: boolean; stage?: number; totalStages?: number; succeeded?: number; failed?: number; skipped?: number } | null;

  // Elapsed time tracking for node execution
  executionStartTime: number | null;

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
  artifactReadingMode: boolean;
  openArtifactPanel: (nodeId: string) => void;
  closeArtifactPanel: () => void;
  setArtifactTab: (tab: 'content' | 'result') => void;
  setArtifactMode: (mode: 'preview' | 'edit') => void;
  setArtifactReadingMode: (on: boolean) => void;
  getExecutedNodesInOrder: () => Array<{ id: string; label: string; category: string }>;
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

  // ── Workflow Health Monitor ──
  _lastHealthFingerprint: string;
  runHealthCheck: (silent?: boolean) => void;

  // ── Proactive Suggestions ──
  _lastSuggestions: ProactiveSuggestion[];
  _dismissedSuggestionIds: Set<string>;
  applySuggestion: (suggestionId: string) => void;
  dismissSuggestion: (suggestionId: string) => void;
  suggestAutoConnect: (nodeId: string) => void;

  // ── Workflow Optimization ──
  _lastOptimizations: Optimization[];
  analyzeOptimizations: () => void;
  applyOptimization: (optimizationId: string) => void;

  // ── Node Versioning ──
  rollbackNode: (nodeId: string, versionNumber: number) => void;

  // ── Note Refinement ──
  refineNote: (nodeId: string) => Promise<void>;
  applyRefinementSuggestion: (suggestion: { type: 'node'; label: string; category: string; content: string; connectTo?: string; edgeLabel?: string } | { type: 'edge'; from: string; to: string; label: string } | { type: 'clean'; content: string; nodeId: string }) => void;

  // ── Central Brain Architecture ──
  centralContext: CentralContext | null;
  ingestSource: (input: string, contentType: 'text' | 'url' | 'file' | 'conversation', title?: string) => Promise<void>;
  updateSource: (newContent: string) => Promise<void>;
  getUnderstanding: () => CentralContext['understanding'] | null;
  createArtifact: (artifactType: string, customPrompt?: string) => Promise<string | null>;
  syncArtifact: (nodeId: string) => Promise<SurgicalDiff | null>;
  syncAllStale: () => Promise<SurgicalDiff[]>;
  previewSync: () => { nodeId: string; reason: string }[];
  recordOverride: (nodeId: string, field: string, oldVal: string, newVal: string) => void;
  interpretOverride: (overrideId: string) => Promise<string | null>;
  propagateOverride: (overrideId: string, scope: 'this-node' | 'all-similar' | 'global') => Promise<void>;
  forgetOverride: (overrideId: string) => void;
  getArtifactContracts: () => Record<string, ArtifactContract>;
  hasContext: () => boolean;
}
