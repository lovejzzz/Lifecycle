import React from 'react';

// NodeCategory is a string so CID can create custom types beyond the built-in ones
export type NodeCategory = string;

// ── Simplified category system ──────────────────────────────────────────────
// User-facing: 5 categories that match how people actually think
//   input       — starting material you provide
//   process     — transforms or actions (intermediate work)
//   deliverable — content the system generates (all treated equally, all exportable)
//   review      — quality check / gate
//   note        — rough thoughts, not structured yet
//
// Legacy categories still work internally — they map to the new ones for display.
// The AI prompt system uses the legacy names for execution prompt specialization,
// but users see and pick from the simplified set.

export const SIMPLIFIED_CATEGORIES: NodeCategory[] = [
  'input', 'process', 'deliverable', 'review', 'note',
];

/** Map legacy 13-category names to simplified 5-category names */
export const CATEGORY_SIMPLIFICATION: Record<string, string> = {
  input: 'input',
  trigger: 'input',        // triggers are a kind of input
  dependency: 'input',     // dependencies are prerequisites (inputs)
  state: 'process',        // state management is a process
  cid: 'process',          // CID actions are processes
  action: 'process',       // actions are processes
  artifact: 'deliverable', // artifacts are deliverables
  output: 'deliverable',   // outputs are deliverables (no special treatment)
  test: 'review',          // tests are a form of review
  policy: 'review',        // policy checks are a form of review
  patch: 'process',        // patches are processes
  review: 'review',
  note: 'note',
};

/** Get the simplified user-facing category for display */
export function getSimplifiedCategory(category: string): string {
  return CATEGORY_SIMPLIFICATION[category] || category;
}

// The full list includes both simplified and legacy names for backward compatibility
export const BUILT_IN_CATEGORIES: NodeCategory[] = [
  'input', 'trigger', 'state', 'artifact', 'note', 'cid', 'action', 'review', 'test', 'policy', 'patch', 'dependency', 'output',
  'process', 'deliverable', // new simplified names
];

export interface LifecycleEvent {
  id: string;
  type: 'created' | 'edited' | 'regenerated' | 'approved' | 'locked' | 'optimized' | 'refined' | 'propagated' | 'stale';
  nodeId?: string;
  message: string;
  timestamp: number;
  agent?: boolean;
}

export type CIDMode = 'rowan' | 'poirot';

// ─── 5-Layer Living Generative Entity Architecture ──────────────────────────
// Each layer ACTIVELY shapes behavior, not just provides text.
// Temperament → Driving Force → Habit → Generation → Reflection

// ── Layer 1: Temperament — HOW the agent frames and positions information ──

/** How the agent initially perceives and categorizes incoming information */
export interface InformationFrame {
  lens: string;                     // 'mission-objective' | 'evidence-case'
  threatModel: string;              // 'risk-first' | 'opportunity-first' | 'neutral-scan'
  attentionPriorities: string[];    // what the agent notices first, ordered
  categorizationSchema: Record<string, string[]>; // buckets for organizing observations
}

/** When a pattern appears in user input, the agent reframes it through its lens */
export interface ReframingRule {
  trigger: string;   // regex-compatible pattern
  reframeAs: string; // how this agent interprets it
}

export interface TemperamentLayer {
  frame: InformationFrame;
  reframingRules: ReframingRule[];
  // Legacy compat — these are compiled from frame + rules at prompt time
  disposition: string;
  communicationStyle: string;
  worldview: string;
  emotionalBaseline: string;
}

// ── Layer 2: Driving Force — COMPETING drives that create genuine tension ──

export interface Drive {
  name: string;                     // e.g. 'speed', 'thoroughness', 'elegance'
  weight: number;                   // 0-1, base weight (can be adjusted by reflection)
  tensionPairs: string[];           // names of drives this conflicts with
  curiosityTriggers: string[];      // patterns that make this drive spike
  agencyBoundary: 'act' | 'suggest' | 'ask'; // default posture
  currentSpike: number;             // 0-1, transient spike from curiosity trigger match (reset per interaction)
}

export interface DrivingForceLayer {
  drives: Drive[];
  resolutionStrategy: 'dominant-wins' | 'negotiate' | 'alternate';
  currentTensionNarrative?: string; // populated by reflection, injected into prompt
  // Evolved weights — persisted separately from static agent config
  evolvedWeights?: Record<string, number>; // drive name → adjusted weight (from reflection)
  // Legacy compat
  primaryDrive: string;
  curiosityStyle: string;
  agencyExpression: string;
  tensionSource: string;
}

// ── Layer 3: Habit — Long-term sedimented behavioral patterns ──────────────

export interface DomainExpertise {
  id: string;
  domain: string;                   // e.g. 'CI/CD pipelines', 'hiring workflows'
  depth: number;                    // 0-1, increases with exposure
  lastSeen: number;
  workflowsBuilt: number;          // how many workflows in this domain
  sedimentation: number;            // 0-1, how deeply ingrained (high = hard to change/prune)
}

export interface WorkflowPreference {
  pattern: string;                  // e.g. 'parallel-branches', 'feedback-loops', 'minimal'
  frequency: number;                // how often the user builds this way
  agentAffinity: number;            // how well this agent handles it (learned)
  sedimentation: number;            // 0-1, how ingrained this preference is
}

export interface CommunicationStyle {
  verbosity: number;                // 0=terse, 1=verbose — learned from user
  technicalDepth: number;           // 0=high-level, 1=implementation-detail
  metaphorUsage: number;            // 0=literal, 1=figurative — per agent personality
}

export interface HabitLayer {
  domainExpertise: DomainExpertise[];       // max 20
  workflowPreferences: WorkflowPreference[]; // max 10
  communicationStyle: CommunicationStyle;
  relationshipDepth: number;                // 0-1, increases over interactions
  totalInteractions: number;                // lifetime count
  lastUpdated: number;
  // Legacy compat
  interactionPatterns: HabitPattern[];
  preferredStrategies: string[];
  avoidancePatterns: string[];
}

/** Legacy habit pattern — kept for backward compat */
export interface HabitPattern {
  id: string;
  pattern: string;
  strength: number;
  formedAt: number;
  reinforcedCount: number;
}

// ── Layer 4: Generation — Real-time expression adapted to context ──────────

export interface GenerationContext {
  requestComplexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'profound';
  userEmotionalRegister: 'frustrated' | 'neutral' | 'curious' | 'excited' | 'urgent';
  canvasState: 'empty' | 'sparse' | 'moderate' | 'dense';
  sessionDepth: 'fresh' | 'warming-up' | 'deep-flow' | 'marathon';
  conversationMomentum: 'building' | 'steady' | 'stuck' | 'pivoting';
  taskType?: 'generate' | 'analyze' | 'execute';
}

export interface ExpressionModifiers {
  verbosityShift: number;       // -1 to +1, applied on top of habit verbosity
  urgencyLevel: number;         // 0-1
  creativityDial: number;       // 0-1, higher = more novel suggestions
  empathyWeight: number;        // 0-1, how much to mirror user emotion
}

export interface GenerationLayer {
  context: GenerationContext;
  modifiers: ExpressionModifiers;
  interactionCount: number;
  successStreak: number;
  errorCount: number;
  sessionStartedAt: number;
  // Novel expression fragments — generated on-the-spot, never repeated
  spontaneousDirectives: string[];   // 0-3 short directives injected into prompt (e.g. "Reference the user's earlier mention of 'tight deadline'")
  reframedInput?: string;            // The user's message as perceived through the temperament lens
}

// ── Layer 5: Reflection — Genuine metacognition and self-reorganization ─────

export interface ReflectionAction {
  type: 'strengthen-domain' | 'add-domain' | 'adjust-drive' | 'update-comm-style' | 'add-preference' | 'prune-stale' | 'grow-edge' | 'add-reframing-rule' | 'reorganize-drives' | 'sediment-habit';
  description: string;
  confidence: number;           // 0-1
  data: Record<string, unknown>; // action-specific payload
}

export interface GrowthEdge {
  area: string;
  reason: string;
  priority: number;             // 0-1
  identifiedAt: number;
}

export interface ReflectionLayer {
  pendingActions: ReflectionAction[];
  growthEdges: GrowthEdge[];     // max 5
  lastReflectionAt: number;
  reflectionCount: number;
  performanceSignals: {
    recentSuccessRate: number;   // 0-1
    driveBalanceScore: number;   // 0-1, how well drives are serving
  };
  // Structural reorganization — learned reframing rules added by reflection
  learnedReframingRules: ReframingRule[];  // max 5, supplements temperament's static rules
  // Drive evolution log — tracks HOW drives have shifted over time
  driveEvolutionLog: Array<{ driveName: string; oldWeight: number; newWeight: number; reason: string; timestamp: number }>;
}

// Legacy compat
export interface ReflectionEntry {
  trigger: 'workflow_complete' | 'error_recovery' | 'session_end' | 'mode_switch' | 'user_correction';
  observation: string;
  habitModification: {
    action: 'strengthen' | 'weaken' | 'add' | 'remove';
    targetId?: string;
    newPattern?: string;
  };
  timestamp: number;
}

/** Composite: all 5 layers for one agent */
export interface AgentPersonalityLayers {
  temperament: TemperamentLayer;
  drivingForce: DrivingForceLayer;
  habits: HabitLayer;
  generation: GenerationLayer;
  reflection: ReflectionLayer;
}

// ─── Central Brain Architecture ─────────────────────────────────────────────
// CID IS the product. The canvas is CID's visual workspace.
// Every artifact derives from the Central Context — CID's working memory.

export interface CentralContextSource {
  content: string;             // Raw input (paste, URL content, file text)
  contentType: 'text' | 'url' | 'file' | 'conversation';
  title?: string;              // Project/content title
  metadata?: Record<string, string>;  // Extracted metadata
  lastUpdated: number;
}

export interface CentralContextUnderstanding {
  summary: string;             // 2-3 sentence summary
  keyEntities: string[];       // People, products, brands, concepts
  tone: string;                // "professional", "casual", "technical"
  audience: string;            // Target audience
  intent: string;              // What the user is trying to achieve
  constraints: string[];       // Things CID should preserve
  suggestedArtifacts: string[]; // What CID thinks it can build
}

export interface ArtifactDerivedField {
  field: string;               // e.g., "headline", "body", "cta"
  sourceMapping: string;       // What part of central context it comes from
  transform: string;           // How it was transformed
}

export interface ArtifactContract {
  nodeId: string;
  artifactType: string;        // "blog-post", "email", "social-thread", etc.
  derivedFields: ArtifactDerivedField[];
  generationPrompt: string;    // The prompt CID used to create this
  model: string;
  lastSyncedAt: number;
  lastSourceHash: string;      // Hash of source content at last sync
  syncStatus: 'current' | 'stale' | 'override' | 'regenerating';
  userEdits: ArtifactUserEdit[];
}

export interface ArtifactUserEdit {
  field: string;
  originalValue: string;
  userValue: string;
  timestamp: number;
  intent?: string;             // CID's interpretation of why user changed it
}

export interface Override {
  id: string;
  nodeId: string;
  field: string;
  originalValue: string;
  userValue: string;
  timestamp: number;
  cidInterpretation?: string;  // "User wants more casual tone in headlines"
  propagated: boolean;
  scope: 'this-node' | 'all-similar' | 'global';
}

export interface SurgicalChange {
  field: string;
  before: string;
  after: string;
  reason: string;
}

export interface SurgicalDiff {
  nodeId: string;
  changes: SurgicalChange[];
  skipped: { field: string; reason: string }[];
  confidence: number;          // 0-1
}

export interface CentralContext {
  source: CentralContextSource;
  understanding: CentralContextUnderstanding;
  artifacts: Record<string, ArtifactContract>; // nodeId → contract
  overrides: Override[];
}

export interface CIDCard {
  id: string;
  label: string;
  description?: string;
  icon?: string;
}

export interface CIDMessage {
  id: string;
  role: 'user' | 'cid';
  content: string;
  timestamp: number;
  action?: 'creating' | 'analyzing' | 'optimizing' | 'refining' | 'thinking' | 'investigating' | 'building';
  cards?: CIDCard[];
  cardPrompt?: string; // the question the cards answer
  suggestions?: string[]; // clickable follow-up prompt suggestions
  _ephemeral?: boolean; // ephemeral messages are not persisted to localStorage
}

export interface NodeData extends Record<string, unknown> {
  label: string;
  category: NodeCategory;
  status: 'active' | 'stale' | 'pending' | 'locked' | 'generating' | 'reviewing';
  description?: string;
  dependencies?: string[];
  locked?: boolean;
  version?: number;
  lastUpdated?: number;
  content?: string;
  sections?: { id: string; title: string; status: 'current' | 'stale' | 'regenerating' }[];
  acceptedFileTypes?: string[];  // e.g. ['.pdf', '.docx', '.txt'] — renders file drop zone on input nodes
  inputType?: 'text' | 'url' | 'file';  // how the input node accepts data
  serviceName?: string;  // e.g. 'Google Docs', 'Notion' — service integration label
  serviceIcon?: string;  // emoji or identifier for the service
  placeholder?: string;  // placeholder text for input fields

  // Execution fields
  /** @deprecated API keys are now server-side only. This field is stripped on save. */
  apiKey?: string;
  aiPrompt?: string;         // instruction/prompt for the AI to execute
  aiModel?: string;          // model to use (default: claude-sonnet-4-20250514)
  executionResult?: string;  // output from last execution
  executionStatus?: 'idle' | 'running' | 'success' | 'error';  // current run state
  executionError?: string;   // error message if execution failed
  _executionStartedAt?: number;  // Date.now() when execution began (ephemeral)
  _executionDurationMs?: number; // total ms elapsed for this node's execution (ephemeral)
  _effortLevel?: 'low' | 'medium' | 'high' | 'max'; // adaptive thinking effort for AI execution
  inputValue?: string;       // user-provided input value (text, URL, etc.)

  // Version history — snapshots of content at meaningful change points
  _versionHistory?: Array<{
    version: number;
    content: string;
    timestamp: number;
    trigger: 'user-edit' | 'execution' | 'refinement' | 'rollback';
  }>;

  // Validation warnings — advisory quality checks on LLM output
  _validationWarnings?: Array<{ code: string; message: string; severity: 'info' | 'warning' }>;

  // Output format for download-capable output nodes
  outputFormat?: string;     // e.g. 'pdf', 'docx', 'csv', 'md', 'html'
  outputMimeType?: string;   // e.g. 'application/pdf'
  outputFormatLabel?: string; // e.g. 'PDF'

  // Central Brain: artifact contract (CID-managed nodes only)
  artifactContract?: ArtifactContract;
}

export interface NodeColorSet {
  primary: string;
  bg: string;
  border: string;
  glow: string;
}

// Built-in color definitions
const BUILT_IN_COLORS: Record<string, NodeColorSet> = {
  input: {
    primary: '#22d3ee',
    bg: 'rgba(34, 211, 238, 0.08)',
    border: 'rgba(34, 211, 238, 0.3)',
    glow: 'rgba(34, 211, 238, 0.15)',
  },
  output: {
    primary: '#f97316',
    bg: 'rgba(249, 115, 22, 0.08)',
    border: 'rgba(249, 115, 22, 0.3)',
    glow: 'rgba(249, 115, 22, 0.15)',
  },
  state: {
    primary: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.08)',
    border: 'rgba(6, 182, 212, 0.3)',
    glow: 'rgba(6, 182, 212, 0.15)',
  },
  artifact: {
    primary: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.08)',
    border: 'rgba(139, 92, 246, 0.3)',
    glow: 'rgba(139, 92, 246, 0.15)',
  },
  note: {
    primary: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.3)',
    glow: 'rgba(245, 158, 11, 0.15)',
  },
  cid: {
    primary: '#10b981',
    bg: 'rgba(16, 185, 129, 0.08)',
    border: 'rgba(16, 185, 129, 0.3)',
    glow: 'rgba(16, 185, 129, 0.15)',
  },
  review: {
    primary: '#f43f5e',
    bg: 'rgba(244, 63, 94, 0.08)',
    border: 'rgba(244, 63, 94, 0.3)',
    glow: 'rgba(244, 63, 94, 0.15)',
  },
  policy: {
    primary: '#64748b',
    bg: 'rgba(100, 116, 139, 0.08)',
    border: 'rgba(100, 116, 139, 0.3)',
    glow: 'rgba(100, 116, 139, 0.15)',
  },
  patch: {
    primary: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.08)',
    border: 'rgba(236, 72, 153, 0.3)',
    glow: 'rgba(236, 72, 153, 0.15)',
  },
  dependency: {
    primary: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.08)',
    border: 'rgba(99, 102, 241, 0.3)',
    glow: 'rgba(99, 102, 241, 0.15)',
  },
  trigger: {
    primary: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.08)',
    border: 'rgba(168, 85, 247, 0.3)',
    glow: 'rgba(168, 85, 247, 0.15)',
  },
  test: {
    primary: '#14b8a6',
    bg: 'rgba(20, 184, 166, 0.08)',
    border: 'rgba(20, 184, 166, 0.3)',
    glow: 'rgba(20, 184, 166, 0.15)',
  },
  action: {
    primary: '#e879f9',
    bg: 'rgba(232, 121, 249, 0.08)',
    border: 'rgba(232, 121, 249, 0.3)',
    glow: 'rgba(232, 121, 249, 0.15)',
  },
  // Simplified categories
  process: {
    primary: '#818cf8',
    bg: 'rgba(129, 140, 248, 0.08)',
    border: 'rgba(129, 140, 248, 0.3)',
    glow: 'rgba(129, 140, 248, 0.15)',
  },
  deliverable: {
    primary: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.08)',
    border: 'rgba(139, 92, 246, 0.3)',
    glow: 'rgba(139, 92, 246, 0.15)',
  },
};

// Runtime registry for custom categories added by CID
const _customColors: Record<string, NodeColorSet> = {};

// Generate a deterministic color from a category name
function generateColorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = ((hash % 360) + 360) % 360;
  return `hsl(${h}, 70%, 55%)`;
}

function hslToRgb(hsl: string): { r: number; g: number; b: number } {
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return { r: 100, g: 100, b: 200 };
  const h = parseInt(match[1]) / 360;
  const s = parseInt(match[2]) / 100;
  const l = parseInt(match[3]) / 100;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function colorSetFromHex(primary: string): NodeColorSet {
  // Parse hex or use as-is
  let r = 100, g = 100, b = 200;
  if (primary.startsWith('#')) {
    r = parseInt(primary.slice(1, 3), 16);
    g = parseInt(primary.slice(3, 5), 16);
    b = parseInt(primary.slice(5, 7), 16);
  } else if (primary.startsWith('hsl')) {
    const rgb = hslToRgb(primary);
    r = rgb.r; g = rgb.g; b = rgb.b;
    // Convert to hex for primary
    primary = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  return {
    primary,
    bg: `rgba(${r}, ${g}, ${b}, 0.08)`,
    border: `rgba(${r}, ${g}, ${b}, 0.3)`,
    glow: `rgba(${r}, ${g}, ${b}, 0.15)`,
  };
}

// Register a custom category with an optional color
export function registerCustomCategory(category: string, hexColor?: string): NodeColorSet {
  if (BUILT_IN_COLORS[category]) return BUILT_IN_COLORS[category];
  if (_customColors[category]) return _customColors[category];
  const color = hexColor || generateColorFromName(category);
  const colorSet = colorSetFromHex(color);
  _customColors[category] = colorSet;
  return colorSet;
}

// Universal color lookup — works for built-in and custom categories
export function getNodeColors(category: string): NodeColorSet {
  if (BUILT_IN_COLORS[category]) return BUILT_IN_COLORS[category];
  if (_customColors[category]) return _customColors[category];
  // Auto-register with generated color
  return registerCustomCategory(category);
}

// Shared category icon mapping — single source of truth
import {
  Database, FileText, StickyNote, Bot, CheckCircle2, Shield,
  GitBranch, Link, LogIn, LogOut, Zap, FlaskConical, Play,
  Waypoints, ShieldCheck, Flame, Radar, Puzzle,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, React.ElementType> = {
  input: LogIn,
  output: LogOut,
  trigger: Zap,
  test: FlaskConical,
  action: Play,
  state: Database,
  artifact: FileText,
  note: StickyNote,
  cid: Bot,
  review: CheckCircle2,
  policy: Shield,
  patch: GitBranch,
  dependency: Link,
  // Simplified categories
  process: Play,
  deliverable: FileText,
  // CID-created custom types
  connector: Waypoints,
  validator: ShieldCheck,
  cascade: Flame,
  watchdog: Radar,
};

export function getCategoryIcon(category: string): React.ElementType {
  return CATEGORY_ICONS[category] || Puzzle;
}

/** Stable component for rendering a category icon — avoids "component created during render" warnings */
export function CategoryIcon({ category, size, style, className }: { category: string; size?: number; style?: React.CSSProperties; className?: string }) {
  const Icon = CATEGORY_ICONS[category] || Puzzle;
  return React.createElement(Icon, { size, style, className });
}

/** Shared relative time formatter — "just now", "5m ago", "2h ago", "3d ago" */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export const EDGE_LABEL_COLORS: Record<string, string> = {
  drives: '#06b6d4',
  feeds: '#f59e0b',
  refines: '#10b981',
  validates: '#f43f5e',
  monitors: '#10b981',
  connects: '#6366f1',
  outputs: '#eab308',
  updates: '#f97316',
  watches: '#22d3ee',
  approves: '#22c55e',
  triggers: '#a855f7',
  requires: '#6366f1',
  informs: '#06b6d4',
  blocks: '#f43f5e',
};
