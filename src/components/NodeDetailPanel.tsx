'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Lock,
  Unlock,
  CheckCircle2,
  RefreshCw,
  Clock,
  Trash2,
  Pencil,
  Check,
  Eye,
  AlertTriangle,
  Zap,
  Plus,
  Trash,
  ChevronDown,
  Copy,
  Bot,
  Download,
} from 'lucide-react';
import { useLifecycleStore } from '@/store/useStore';
import {
  getNodeColors,
  CategoryIcon,
  BUILT_IN_CATEGORIES,
  EDGE_LABEL_COLORS,
  relativeTime,
} from '@/lib/types';
import type { NodeData, NodeCategory } from '@/lib/types';
import DiffView from './DiffView';
import { exportAndDownload } from '@/lib/export';
import type { ExportFormat } from '@/lib/export';

const ALL_STATUSES: NodeData['status'][] = [
  'active',
  'stale',
  'pending',
  'locked',
  'generating',
  'reviewing',
];

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  stale: '#f59e0b',
  pending: '#6366f1',
  locked: '#94a3b8',
  generating: '#06b6d4',
  reviewing: '#f43f5e',
};

// ─── Content Editor ──────────────────────────────────────────────────────────

function ContentEditor({
  content,
  nodeId,
  updateNodeData,
  addEvent,
  label,
}: {
  content: string;
  nodeId: string;
  updateNodeData: (id: string, partial: Partial<NodeData>) => void;
  addEvent: (event: any) => void;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(content);
  const [copied, setCopied] = useState(false);
  const isLong = content.length > 200;

  const commitContent = () => {
    if (draft !== content) {
      updateNodeData(nodeId, { content: draft });
      addEvent({
        id: `ev-${Date.now()}`,
        type: 'edited',
        message: `Updated content of ${label}`,
        timestamp: Date.now(),
        nodeId,
      });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] tracking-wider text-white/35 uppercase">Content</span>
        </div>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEditing(false);
              setDraft(content);
            }
          }}
          rows={8}
          className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[11px] leading-relaxed text-white/60 outline-none"
        />
        <div className="mt-1.5 flex justify-end gap-1.5">
          <button
            onClick={() => {
              setEditing(false);
              setDraft(content);
            }}
            className="rounded px-2 py-0.5 text-[10px] text-white/30 hover:text-white/50"
          >
            Cancel
          </button>
          <button
            onClick={commitContent}
            className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 hover:text-emerald-300"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] tracking-wider text-white/35 uppercase">Content</span>
        <div className="flex items-center gap-2">
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[9px] text-cyan-400/60 transition-colors hover:text-cyan-400"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
          {content && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              title="Copy content"
              className="text-white/20 transition-colors hover:text-white/50"
            >
              {copied ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
            </button>
          )}
          <button
            onClick={() => {
              setDraft(content);
              setEditing(true);
            }}
            className="text-white/20 transition-colors hover:text-white/50"
          >
            <Pencil size={9} />
          </button>
        </div>
      </div>
      <div
        onClick={() => {
          setDraft(content);
          setEditing(true);
        }}
        className={`cursor-pointer overflow-y-auto rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-white/45 transition-colors hover:border-white/[0.1] ${
          expanded ? 'max-h-[300px]' : 'max-h-[80px]'
        } transition-all duration-300`}
      >
        {content || <span className="text-white/30 italic">Click to add content...</span>}
      </div>
    </div>
  );
}

// ─── Status Picker ───────────────────────────────────────────────────────────

function StatusPicker({
  status,
  nodeId,
  updateNodeStatus,
  lockNode,
}: {
  status: NodeData['status'];
  nodeId: string;
  updateNodeStatus: (id: string, status: NodeData['status']) => void;
  lockNode: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-center justify-between">
      <span className="text-[10px] tracking-wider text-white/35 uppercase">Status</span>
      <button
        onClick={() => setOpen(!open)}
        className="group flex items-center gap-1.5 rounded-md px-2 py-0.5 transition-colors hover:bg-white/[0.05]"
      >
        <span
          className="h-[6px] w-[6px] rounded-full"
          style={{ background: STATUS_COLORS[status] }}
        />
        <span className="text-[11px] text-white/60 capitalize">{status}</span>
        <ChevronDown
          size={9}
          className="text-white/20 transition-colors group-hover:text-white/40"
        />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 min-w-[130px] overflow-hidden rounded-lg border border-white/[0.08] bg-[#0e0e18]/95 shadow-2xl backdrop-blur-xl">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => {
                if (s === 'locked') lockNode(nodeId);
                else updateNodeStatus(nodeId, s);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-white/[0.05] ${
                s === status ? 'text-white/90' : 'text-white/50'
              }`}
            >
              <span
                className="h-[6px] w-[6px] rounded-full"
                style={{ background: STATUS_COLORS[s] }}
              />
              <span className="capitalize">{s}</span>
              {s === status && <Check size={10} className="ml-auto text-emerald-400" />}
            </button>
          ))}
          <div className="border-t border-white/[0.05]" />
        </div>
      )}
    </div>
  );
}

// ─── Category Picker ─────────────────────────────────────────────────────────

function CategoryPicker({
  category,
  nodeId,
  updateNodeData,
  addEvent,
  label,
  allCategories,
}: {
  category: NodeCategory;
  nodeId: string;
  updateNodeData: (id: string, partial: Partial<NodeData>) => void;
  addEvent: (event: any) => void;
  label: string;
  allCategories: NodeCategory[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-center justify-between">
      <span className="text-[10px] tracking-wider text-white/35 uppercase">Category</span>
      <button
        onClick={() => setOpen(!open)}
        className="group flex items-center gap-1.5 rounded-md px-2 py-0.5 transition-colors hover:bg-white/[0.05]"
      >
        <CategoryIcon
          category={category}
          size={10}
          style={{ color: getNodeColors(category).primary }}
        />
        <span className="text-[11px] text-white/60 capitalize">{category}</span>
        <ChevronDown
          size={9}
          className="text-white/20 transition-colors group-hover:text-white/40"
        />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 max-h-[220px] min-w-[150px] overflow-y-auto rounded-lg border border-white/[0.08] bg-[#0e0e18]/95 shadow-2xl backdrop-blur-xl">
          {allCategories.map((cat) => {
            const catColors = getNodeColors(cat);
            return (
              <button
                key={cat}
                onClick={() => {
                  if (cat !== category) {
                    updateNodeData(nodeId, { category: cat });
                    addEvent({
                      id: `ev-${Date.now()}`,
                      type: 'edited',
                      message: `Changed ${label} category: ${category} → ${cat}`,
                      timestamp: Date.now(),
                      nodeId,
                    });
                  }
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-white/[0.05] ${
                  cat === category ? 'text-white/90' : 'text-white/50'
                }`}
              >
                <CategoryIcon category={cat} size={11} style={{ color: catColors.primary }} />
                <span className="capitalize">{cat}</span>
                {cat === category && <Check size={10} className="ml-auto text-emerald-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Section Editor ──────────────────────────────────────────────────────────

function SectionEditor({
  nodeId,
  sections,
  updateNodeData,
  addEvent,
  label,
}: {
  nodeId: string;
  sections: NonNullable<NodeData['sections']>;
  updateNodeData: (id: string, partial: Partial<NodeData>) => void;
  addEvent: (event: any) => void;
  label: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const SECTION_STATUSES: Array<'current' | 'stale' | 'regenerating'> = [
    'current',
    'stale',
    'regenerating',
  ];

  const addSection = () => {
    const id = `sec-${Date.now()}`;
    const updated = [...sections, { id, title: 'New Section', status: 'current' as const }];
    updateNodeData(nodeId, { sections: updated });
    addEvent({
      id: `ev-${Date.now()}`,
      type: 'edited',
      message: `Added section to ${label}`,
      timestamp: Date.now(),
      nodeId,
    });
    setDraft('New Section');
    setEditingId(id);
  };

  const renameSection = (secId: string) => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const updated = sections.map((s) => (s.id === secId ? { ...s, title: trimmed } : s));
    updateNodeData(nodeId, { sections: updated });
    setEditingId(null);
  };

  const deleteSection = (secId: string) => {
    const sec = sections.find((s) => s.id === secId);
    const updated = sections.filter((s) => s.id !== secId);
    updateNodeData(nodeId, { sections: updated });
    addEvent({
      id: `ev-${Date.now()}`,
      type: 'edited',
      message: `Removed "${sec?.title}" from ${label}`,
      timestamp: Date.now(),
      nodeId,
    });
  };

  const cycleStatus = (secId: string) => {
    const sec = sections.find((s) => s.id === secId);
    if (!sec) return;
    const idx = SECTION_STATUSES.indexOf(sec.status);
    const next = SECTION_STATUSES[(idx + 1) % SECTION_STATUSES.length];
    const updated = sections.map((s) => (s.id === secId ? { ...s, status: next } : s));
    updateNodeData(nodeId, { sections: updated });
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] tracking-wider text-white/35 uppercase">Sections</span>
        <button
          onClick={addSection}
          className="text-white/20 transition-colors hover:text-emerald-400"
          title="Add section"
        >
          <Plus size={11} />
        </button>
      </div>
      {sections.length > 0 && (
        <div className="space-y-1.5">
          {sections.map((sec) => (
            <div
              key={sec.id}
              className="group/sec flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-1.5"
            >
              {editingId === sec.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => renameSection(sec.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameSection(sec.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="mr-2 flex-1 rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/55 outline-none"
                />
              ) : (
                <span
                  className="cursor-pointer text-[11px] text-white/55 transition-colors hover:text-white/80"
                  onDoubleClick={() => {
                    setDraft(sec.title);
                    setEditingId(sec.id);
                  }}
                  title="Double-click to rename"
                >
                  {sec.title}
                </span>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => cycleStatus(sec.id)}
                  title="Click to cycle status"
                  className={`cursor-pointer text-[9px] font-medium tracking-wider uppercase transition-opacity hover:opacity-80 ${
                    sec.status === 'current'
                      ? 'text-emerald-400'
                      : sec.status === 'stale'
                        ? 'text-amber-400'
                        : 'text-cyan-400'
                  }`}
                >
                  {sec.status}
                </button>
                <button
                  onClick={() => deleteSection(sec.id)}
                  className="text-white/20 opacity-0 transition-all group-hover/sec:opacity-100 hover:text-rose-400"
                  title="Delete section"
                >
                  <Trash size={9} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {sections.length === 0 && (
        <p className="text-[10px] text-white/25 italic">No sections — click + to add</p>
      )}
    </div>
  );
}

// ─── Export Dropdown ─────────────────────────────────────────────────────────

function ExportDropdown({ content, label }: { content: string; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const formats: { format: ExportFormat; label: string }[] = [
    { format: 'md', label: 'Markdown' },
    { format: 'html', label: 'HTML' },
    { format: 'txt', label: 'Plain Text' },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-white/20 transition-colors hover:text-white/50"
        title="Download as..."
      >
        <Download size={9} />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#1a1a2e] shadow-xl">
          {formats.map((f) => (
            <button
              key={f.format}
              onClick={() => {
                exportAndDownload(content, f.format, label);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-[10px] whitespace-nowrap text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/80"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Node Diff Section ──────────────────────────────────────────────────────

function NodeDiffSection({ nodeId, data }: { nodeId: string; data: NodeData }) {
  const [showDiff, setShowDiff] = useState(false);
  const rollbackNode = useLifecycleStore((s) => s.rollbackNode);

  const history = data._versionHistory as
    | Array<{ version: number; content: string; timestamp: number; trigger: string }>
    | undefined;
  if (!history || history.length === 0) return null;

  // Get current content (prefer executionResult, fallback to content)
  const currentContent = data.executionResult || data.content || '';
  // Latest version entry = what content was BEFORE the latest change
  const latestVersion = history[history.length - 1];
  const previousContent = latestVersion.content;

  // Only show if content actually differs
  if (currentContent === previousContent) return null;

  return (
    <div>
      <button
        onClick={() => setShowDiff(!showDiff)}
        className="flex items-center gap-1.5 text-[10px] text-cyan-400/50 transition-colors hover:text-cyan-400/80"
      >
        <Eye size={9} />
        <span>{showDiff ? 'Hide changes' : 'View changes'}</span>
        <span className="text-[9px] text-white/20">vs v{latestVersion.version}</span>
      </button>
      {showDiff && (
        <div className="mt-1.5">
          <DiffView
            oldText={previousContent}
            newText={currentContent}
            compact
            onAccept={() => setShowDiff(false)}
            onRevert={() => {
              if (
                window.confirm(
                  `Revert to v${latestVersion.version}? Downstream nodes will be marked stale.`,
                )
              ) {
                rollbackNode(nodeId, latestVersion.version);
                setShowDiff(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Version History ─────────────────────────────────────────────────────────

function VersionHistory({
  nodeId,
  history,
  currentVersion: _currentVersion,
  currentContent,
}: {
  nodeId: string;
  history: Array<{ version: number; content: string; timestamp: number; trigger: string }>;
  currentVersion: number;
  currentContent: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  const rollbackNode = useLifecycleStore((s) => s.rollbackNode);

  const triggerLabels: Record<string, string> = {
    'user-edit': 'Edit',
    execution: 'Execution',
    refinement: 'Refinement',
    rollback: 'Rollback',
  };

  const viewingEntry =
    viewingVersion !== null ? history.find((v) => v.version === viewingVersion) : null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] tracking-wider text-white/35 uppercase transition-colors hover:text-white/50"
      >
        <Clock size={9} />
        <span>
          History ({history.length} version{history.length !== 1 ? 's' : ''})
        </span>
        <ChevronDown size={9} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {[...history].reverse().map((entry) => (
            <div
              key={entry.version}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-all ${
                viewingVersion === entry.version
                  ? 'border-violet-500/20 bg-violet-500/5'
                  : 'border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
              onClick={() =>
                setViewingVersion(viewingVersion === entry.version ? null : entry.version)
              }
            >
              <span className="w-6 font-mono text-[10px] text-white/30">v{entry.version}</span>
              <span className="flex-1 text-[9px] text-white/20">
                {triggerLabels[entry.trigger] || entry.trigger}
              </span>
              <span className="text-[8px] text-white/30">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    window.confirm(
                      `Restore v${entry.version}? This will mark downstream nodes stale.`,
                    )
                  ) {
                    rollbackNode(nodeId, entry.version);
                    setViewingVersion(null);
                  }
                }}
                className="rounded bg-violet-500/[0.06] px-1.5 py-0.5 text-[9px] text-violet-400/50 transition-colors hover:bg-violet-500/10 hover:text-violet-400"
                title={`Restore to v${entry.version}`}
              >
                Restore
              </button>
            </div>
          ))}
          {viewingEntry && (
            <div className="mt-1.5">
              <DiffView
                oldText={viewingEntry.content}
                newText={currentContent}
                compact
                maxLines={30}
                onRevert={() => {
                  if (
                    window.confirm(
                      `Restore v${viewingEntry.version}? Downstream nodes will be marked stale.`,
                    )
                  ) {
                    rollbackNode(nodeId, viewingEntry.version);
                    setViewingVersion(null);
                  }
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

function NodeDetailPanelContent({ nodeId }: { nodeId: string }) {
  const {
    nodes,
    edges,
    selectedNodeId: _selectedNodeId,
    selectNode,
    lockNode,
    approveNode,
    updateNodeStatus,
    updateNodeData,
    deleteNode,
    deleteEdge,
    addEvent,
    askCIDAboutNode,
    executeNode,
    openArtifactPanel,
    refineNote,
    isProcessing,
  } = useLifecycleStore();
  const node = nodes.find((n) => n.id === nodeId);

  // Track which node the editing state belongs to — auto-resets when selectedNodeId changes (no useEffect needed)
  const [editingLabelFor, setEditingLabelFor] = useState<string | null>(null);
  const [editingDescFor, setEditingDescFor] = useState<string | null>(null);
  const editingLabel = editingLabelFor === nodeId;
  const editingDesc = editingDescFor === nodeId;
  const setEditingLabel = (v: boolean) => setEditingLabelFor(v ? nodeId : null);
  const setEditingDesc = (v: boolean) => setEditingDescFor(v ? nodeId : null);
  const [labelDraft, setLabelDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');

  // Gather all categories (built-in + custom from existing nodes)
  const builtInSet = new Set(BUILT_IN_CATEGORIES);
  const customCategories = Array.from(
    new Set(nodes.map((n) => n.data.category).filter((c) => !builtInSet.has(c))),
  );
  const allCategories = [...BUILT_IN_CATEGORIES, ...customCategories];

  // Compute depth from roots (longest path to this node)
  const nodeDepth = React.useMemo(() => {
    if (!nodeId || edges.length === 0) return 0;
    const hasIncoming = new Set(edges.map((e) => e.target));
    const roots = nodes.filter((n) => !hasIncoming.has(n.id));
    if (roots.length === 0) return 0;
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    let maxDepth = 0;
    for (const root of roots) {
      const stack: { id: string; depth: number }[] = [{ id: root.id, depth: 0 }];
      const visited = new Set<string>();
      while (stack.length > 0) {
        const { id, depth } = stack.pop()!;
        if (id === nodeId) {
          maxDepth = Math.max(maxDepth, depth);
          continue;
        }
        if (visited.has(id)) continue;
        visited.add(id);
        for (const child of adj.get(id) || []) {
          stack.push({ id: child, depth: depth + 1 });
        }
      }
    }
    return maxDepth;
  }, [nodeId, nodes, edges]);

  if (!node) return null;

  const { data } = node;
  const colors = getNodeColors(data.category);

  // Connection info
  const incomingEdges = edges.filter((e) => e.target === node.id);
  const outgoingEdges = edges.filter((e) => e.source === node.id);

  const isRoot = incomingEdges.length === 0 && outgoingEdges.length > 0;
  const isLeaf = outgoingEdges.length === 0 && incomingEdges.length > 0;

  const handleRegenerate = async () => {
    await executeNode(node.id);
  };

  const startEditLabel = () => {
    setLabelDraft(data.label);
    setEditingLabel(true);
  };

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== data.label) {
      updateNodeData(node.id, { label: trimmed });
      addEvent({
        id: `ev-${Date.now()}`,
        type: 'edited',
        message: `Renamed "${data.label}" → "${trimmed}"`,
        timestamp: Date.now(),
        nodeId: node.id,
      });
    }
    setEditingLabel(false);
  };

  const startEditDesc = () => {
    setDescDraft(data.description ?? '');
    setEditingDesc(true);
  };

  const commitDesc = () => {
    const trimmed = descDraft.trim();
    if (trimmed !== (data.description ?? '')) {
      updateNodeData(node.id, { description: trimmed });
      addEvent({
        id: `ev-${Date.now()}`,
        type: 'edited',
        message: `Updated description of ${data.label}`,
        timestamp: Date.now(),
        nodeId: node.id,
      });
    }
    setEditingDesc(false);
  };

  const handleDelete = () => {
    const connCount = incomingEdges.length + outgoingEdges.length;
    if (
      connCount > 0 &&
      !window.confirm(
        `Delete "${data.label}"? This will remove ${connCount} connection${connCount > 1 ? 's' : ''}.`,
      )
    )
      return;
    deleteNode(node.id);
  };

  return (
    <motion.div
      key={node.id}
      initial={{ x: -320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -320, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute top-4 left-4 z-20 flex max-h-[calc(100vh-120px)] w-[300px] flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#0c0c14]/95 shadow-2xl backdrop-blur-xl max-md:right-2 max-md:left-2 max-md:w-[calc(100vw-2rem)]"
      role="complementary"
      aria-label="Node Details"
    >
      {/* Accent */}
      <div
        className="h-[2px] flex-shrink-0"
        style={{ background: `linear-gradient(90deg, ${colors.primary}, transparent)` }}
      />

      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${colors.primary}15` }}
          >
            <CategoryIcon category={data.category} size={15} style={{ color: colors.primary }} />
          </div>
          <div className="min-w-0 flex-1">
            {editingLabel ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onBlur={commitLabel}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitLabel();
                    if (e.key === 'Escape') setEditingLabel(false);
                  }}
                  className="w-full rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-sm font-semibold text-white outline-none"
                />
                <button
                  onClick={commitLabel}
                  className="flex-shrink-0 text-emerald-400 hover:text-emerald-300"
                >
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <div
                className="group/label flex cursor-pointer items-center gap-1.5"
                onClick={startEditLabel}
              >
                <div className="truncate text-sm font-semibold text-white">{data.label}</div>
                <Pencil
                  size={10}
                  className="flex-shrink-0 text-white/30 opacity-0 transition-opacity group-hover/label:opacity-100 hover:text-white/60"
                />
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => selectNode(null)}
          aria-label="Close node details"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
        >
          <X size={14} />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="space-y-3 px-4 py-3">
          {/* Status — clickable dropdown */}
          <StatusPicker
            status={data.status}
            nodeId={node.id}
            updateNodeStatus={updateNodeStatus}
            lockNode={lockNode}
          />

          {/* Category — clickable dropdown */}
          <CategoryPicker
            category={data.category}
            nodeId={node.id}
            updateNodeData={updateNodeData}
            addEvent={addEvent}
            label={data.label}
            allCategories={allCategories}
          />

          {/* Version */}
          {data.version !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-wider text-white/35 uppercase">Version</span>
              <span className="font-mono text-[11px] text-white/60">v{data.version}</span>
            </div>
          )}

          {/* Last Updated */}
          {data.lastUpdated && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-wider text-white/35 uppercase">Updated</span>
              <span className="flex items-center gap-1 text-[11px] text-white/60">
                <Clock size={10} className="text-white/25" />
                {relativeTime(data.lastUpdated)}
              </span>
            </div>
          )}

          {/* Graph Position */}
          {edges.length > 0 && (incomingEdges.length > 0 || outgoingEdges.length > 0) && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-wider text-white/35 uppercase">Position</span>
              <span className="flex items-center gap-1.5 text-[11px] text-white/60">
                {isRoot && (
                  <span className="rounded-full bg-emerald-500/15 px-1.5 py-px text-[8px] font-medium text-emerald-400/80">
                    Root
                  </span>
                )}
                {isLeaf && (
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[8px] font-medium text-amber-400/80">
                    Leaf
                  </span>
                )}
                {!isRoot && !isLeaf && (
                  <span className="rounded-full bg-indigo-500/15 px-1.5 py-px text-[8px] font-medium text-indigo-400/80">
                    Depth {nodeDepth}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Connections summary */}
          {(incomingEdges.length > 0 || outgoingEdges.length > 0) && (
            <div>
              <span className="mb-1.5 block text-[10px] tracking-wider text-white/35 uppercase">
                Connections
              </span>
              <div className="space-y-1">
                {incomingEdges.map((e) => {
                  const src = nodes.find((n) => n.id === e.source);
                  const labelColor = EDGE_LABEL_COLORS[e.label as string] || '#6366f1';
                  return (
                    <div key={e.id} className="group/edge flex items-center gap-1.5">
                      <button
                        onClick={() => selectNode(e.source)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[10px] text-white/40 transition-colors hover:text-white/70"
                      >
                        <span className="text-white/20">←</span>
                        <span className="truncate">{src?.data.label ?? e.source}</span>
                        {e.label && (
                          <span
                            className="ml-auto flex items-center gap-1 text-[9px]"
                            style={{ color: `${labelColor}99` }}
                          >
                            <span
                              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                              style={{ background: labelColor }}
                            />
                            {e.label as string}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => deleteEdge(e.id)}
                        title="Remove connection"
                        className="flex-shrink-0 text-white/30 opacity-0 transition-all group-hover/edge:opacity-100 hover:text-rose-400"
                      >
                        <X size={9} />
                      </button>
                    </div>
                  );
                })}
                {outgoingEdges.map((e) => {
                  const tgt = nodes.find((n) => n.id === e.target);
                  const labelColor = EDGE_LABEL_COLORS[e.label as string] || '#6366f1';
                  return (
                    <div key={e.id} className="group/edge flex items-center gap-1.5">
                      <button
                        onClick={() => selectNode(e.target)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[10px] text-white/40 transition-colors hover:text-white/70"
                      >
                        <span className="text-white/20">→</span>
                        <span className="truncate">{tgt?.data.label ?? e.target}</span>
                        {e.label && (
                          <span
                            className="ml-auto flex items-center gap-1 text-[9px]"
                            style={{ color: `${labelColor}99` }}
                          >
                            <span
                              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                              style={{ background: labelColor }}
                            />
                            {e.label as string}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => deleteEdge(e.id)}
                        title="Remove connection"
                        className="flex-shrink-0 text-white/30 opacity-0 transition-all group-hover/edge:opacity-100 hover:text-rose-400"
                      >
                        <X size={9} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Description — click anywhere to edit */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] tracking-wider text-white/35 uppercase">
                Description
              </span>
              {!editingDesc && (
                <button
                  onClick={startEditDesc}
                  className="text-white/20 transition-colors hover:text-white/50"
                >
                  <Pencil size={9} />
                </button>
              )}
            </div>
            {editingDesc ? (
              <div className="space-y-1.5">
                <textarea
                  autoFocus
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingDesc(false);
                  }}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] leading-relaxed text-white/60 outline-none"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => setEditingDesc(false)}
                    className="rounded px-2 py-0.5 text-[10px] text-white/30 hover:text-white/50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={commitDesc}
                    className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 hover:text-emerald-300"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p
                onClick={startEditDesc}
                className="cursor-pointer text-[11px] leading-relaxed text-white/50 transition-colors hover:text-white/70"
              >
                {data.description || (
                  <span className="text-white/20 italic">Click to add description...</span>
                )}
              </p>
            )}
          </div>

          {/* Input Value — for input nodes */}
          {data.category === 'input' && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] tracking-wider text-white/35 uppercase">
                  {data.inputType === 'url'
                    ? 'URL'
                    : data.inputType === 'file'
                      ? 'File Input'
                      : 'Input Value'}
                </span>
              </div>
              {data.inputType === 'file' ? (
                <label
                  className="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-white/10 bg-white/[0.02] py-4 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('border-cyan-500/40', 'bg-cyan-500/[0.04]');
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('border-cyan-500/40', 'bg-cyan-500/[0.04]');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-cyan-500/40', 'bg-cyan-500/[0.04]');
                    const file = e.dataTransfer.files?.[0];
                    if (file) updateNodeData(node.id, { inputValue: file.name });
                  }}
                >
                  <input
                    type="file"
                    className="hidden"
                    accept={data.acceptedFileTypes?.join(',') ?? undefined}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) updateNodeData(node.id, { inputValue: file.name });
                    }}
                  />
                  <Download size={16} className="text-white/20" />
                  <span className="text-[10px] text-white/40">
                    {data.inputValue ? data.inputValue : 'Drop file here or click to browse'}
                  </span>
                  {data.acceptedFileTypes && data.acceptedFileTypes.length > 0 && (
                    <span className="text-[9px] text-white/20">
                      {data.acceptedFileTypes.join(', ')}
                    </span>
                  )}
                </label>
              ) : (
                <input
                  value={data.inputValue ?? ''}
                  onChange={(e) => updateNodeData(node.id, { inputValue: e.target.value })}
                  placeholder={
                    data.placeholder ||
                    (data.inputType === 'url' ? 'Paste URL here...' : 'Enter input value...')
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/60 outline-none placeholder:text-white/30"
                />
              )}
            </div>
          )}

          {/* AI Execution Config — for CID/AI nodes */}
          {(data.category === 'cid' || data.aiPrompt) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-wider text-white/35 uppercase">
                  AI Execution
                </span>
                {data.executionStatus === 'running' && (
                  <span className="flex items-center gap-1 text-[9px] text-cyan-400">
                    <RefreshCw size={8} className="animate-spin" /> Running &ldquo;{data.label}
                    &rdquo;…
                  </span>
                )}
                {data.executionStatus === 'success' && (
                  <span className="text-[9px] text-emerald-400">Done</span>
                )}
                {data.executionStatus === 'error' && (
                  <span className="text-[9px] text-rose-400">Error</span>
                )}
              </div>
              <textarea
                value={data.aiPrompt ?? ''}
                onChange={(e) => updateNodeData(node.id, { aiPrompt: e.target.value })}
                placeholder="Instruction for the AI (e.g., 'Convert the document into a structured lesson plan with objectives, modules, and exercises')"
                rows={3}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/60 outline-none placeholder:text-white/30"
              />
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] tracking-wider text-white/35 uppercase">Effort</span>
                <select
                  value={data._effortLevel ?? 'auto'}
                  onChange={(e) =>
                    updateNodeData(node.id, {
                      _effortLevel:
                        e.target.value === 'auto'
                          ? undefined
                          : (e.target.value as 'low' | 'medium' | 'high' | 'max'),
                    })
                  }
                  className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60 outline-none"
                >
                  <option value="auto">Auto</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="max">Max</option>
                </select>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => executeNode(node.id)}
                  disabled={data.executionStatus === 'running'}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 py-1.5 text-[10px] font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20 disabled:opacity-30"
                >
                  {data.executionStatus === 'running' ? (
                    <>
                      <RefreshCw size={10} className="animate-spin" /> Running &ldquo;{data.label}
                      &rdquo;…
                    </>
                  ) : (
                    <>▶ Run Node</>
                  )}
                </button>
                {data.category === 'note' && (
                  <button
                    onClick={() => refineNote(node.id)}
                    disabled={isProcessing || !data.content}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/10 py-1.5 text-[10px] font-medium text-violet-400 transition-colors hover:bg-violet-500/20 disabled:opacity-30"
                    title="Extract structured nodes and connections from this note"
                  >
                    <Bot size={10} />
                    Refine
                  </button>
                )}
              </div>
              {data.executionError && (
                <div className="rounded-lg border border-rose-500/10 bg-rose-500/5 px-3 py-2 text-[10px] text-rose-400/80">
                  {data.executionError}
                </div>
              )}
            </div>
          )}

          {/* Execution Result — shown when a node has been executed */}
          {data.executionResult && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] tracking-wider text-white/35 uppercase">
                  Execution Result
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openArtifactPanel(node.id)}
                    className="text-white/20 transition-colors hover:text-cyan-400/60"
                    title="Open in preview"
                  >
                    <Eye size={9} />
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(data.executionResult!);
                      useLifecycleStore.getState().addToast('Copied to clipboard', 'success');
                    }}
                    className="text-white/20 transition-colors hover:text-white/50"
                    title="Copy result"
                  >
                    <Copy size={9} />
                  </button>
                  <ExportDropdown content={data.executionResult!} label={data.label} />
                </div>
              </div>
              <div className="max-h-[120px] overflow-y-auto rounded-lg border border-emerald-500/10 bg-emerald-500/[0.03] px-3 py-2 font-mono text-[10px] whitespace-pre-wrap text-emerald-300/60">
                {data.executionResult.slice(0, 1000)}
                {data.executionResult.length > 1000 ? '...' : ''}
              </div>
            </div>
          )}

          {/* Validation Warnings — advisory quality checks */}
          {data._validationWarnings && data._validationWarnings.length > 0 && (
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-1.5 text-[10px] text-amber-400/50 transition-colors hover:text-amber-400/70">
                <AlertTriangle size={10} />
                <span>
                  {data._validationWarnings.length} quality warning
                  {data._validationWarnings.length > 1 ? 's' : ''}
                </span>
              </summary>
              <div className="mt-1.5 space-y-1 pl-4">
                {data._validationWarnings.map((w, i) => (
                  <div
                    key={i}
                    className={`rounded-md border px-2 py-1 text-[9px] ${
                      w.severity === 'warning'
                        ? 'border-amber-500/10 bg-amber-500/[0.04] text-amber-400/60'
                        : 'border-white/[0.04] bg-white/[0.02] text-white/30'
                    }`}
                  >
                    <span className="mr-1 font-mono text-[8px] text-white/20">{w.code}</span>
                    {w.message}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Semantic Diff — show changes vs previous version after execution/regeneration */}
          <NodeDiffSection nodeId={node.id} data={data} />

          {/* Content — editable */}
          <ContentEditor
            content={data.content ?? ''}
            nodeId={node.id}
            updateNodeData={updateNodeData}
            addEvent={addEvent}
            label={data.label}
          />

          {/* Generate content with AI */}
          {['artifact', 'note', 'policy', 'state', 'output', 'review'].includes(data.category) &&
            !(data.content && data.content.length > 50) && (
              <button
                onClick={() => {
                  const store = useLifecycleStore.getState();
                  store.generateNodeContent(node.id);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/10 py-1.5 text-[10px] font-medium text-indigo-400 transition-colors hover:bg-indigo-500/20"
                title="Let CID generate content for this node based on its category and description"
              >
                <Bot size={10} />
                Generate content with AI
              </button>
            )}

          {/* Version History */}
          {data._versionHistory &&
            (
              data._versionHistory as Array<{
                version: number;
                content: string;
                timestamp: number;
                trigger: string;
              }>
            ).length > 0 && (
              <VersionHistory
                nodeId={node.id}
                history={
                  data._versionHistory as Array<{
                    version: number;
                    content: string;
                    timestamp: number;
                    trigger: string;
                  }>
                }
                currentVersion={data.version ?? 1}
                currentContent={data.executionResult || data.content || ''}
              />
            )}

          {/* Sections */}
          <SectionEditor
            nodeId={node.id}
            sections={data.sections ?? []}
            updateNodeData={updateNodeData}
            addEvent={addEvent}
            label={data.label}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 gap-2 border-t border-white/[0.04] px-4 pt-2 pb-4">
        {data.status === 'stale' && (
          <button
            onClick={handleRegenerate}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 py-2 text-[11px] font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20"
          >
            <RefreshCw size={11} />
            Regenerate
          </button>
        )}
        {data.status === 'reviewing' && (
          <button
            onClick={() => approveNode(node.id)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 py-2 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            <CheckCircle2 size={11} />
            Approve
          </button>
        )}
        {!data.locked && data.status !== 'generating' && (
          <button
            onClick={() => lockNode(node.id)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/[0.07]"
          >
            <Lock size={11} />
            Lock
          </button>
        )}
        {data.locked && (
          <button
            onClick={() => updateNodeStatus(node.id, 'active')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/[0.07]"
          >
            <Unlock size={11} />
            Unlock
          </button>
        )}
        <button
          onClick={() => askCIDAboutNode(node.id)}
          title="Ask CID about this node"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/15 bg-emerald-500/8 px-3 py-2 text-[11px] font-medium text-emerald-400/70 transition-colors hover:bg-emerald-500/15 hover:text-emerald-400"
        >
          <Bot size={11} />
        </button>
        <button
          onClick={handleDelete}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/15 bg-rose-500/8 px-3 py-2 text-[11px] font-medium text-rose-400/70 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </motion.div>
  );
}

function BatchActionPanel() {
  const { multiSelectedIds, clearMultiSelect, deleteMultiSelected, nodes } = useLifecycleStore();
  const count = multiSelectedIds.size;
  const selectedNodes = nodes.filter((n) => multiSelectedIds.has(n.id));

  const batchAction = (action: () => void) => {
    const store = useLifecycleStore.getState();
    store.pushHistory();
    action();
    store.addEvent({
      id: `ev-${Date.now()}`,
      type: 'edited' as any,
      message: `Batch action on ${count} nodes`,
      timestamp: Date.now(),
    });
    clearMultiSelect();
  };

  return (
    <motion.div
      key="batch-panel"
      initial={{ x: -320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -320, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute top-4 left-4 z-20 flex max-h-[calc(100vh-120px)] w-[300px] flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#0c0c14]/95 shadow-2xl backdrop-blur-xl max-md:right-2 max-md:left-2 max-md:w-[calc(100vw-2rem)]"
      role="complementary"
      aria-label="Batch Actions"
    >
      <div className="h-[2px] flex-shrink-0 bg-gradient-to-r from-indigo-500 to-transparent" />

      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10">
            <CheckCircle2 size={15} className="text-indigo-400" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white/80">{count} Selected</div>
            <div className="text-[10px] text-white/30">Batch actions</div>
          </div>
        </div>
        <button
          onClick={clearMultiSelect}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-white/5 hover:text-white/60"
        >
          <X size={16} />
        </button>
      </div>

      {/* Selected nodes list */}
      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
        <span className="text-[10px] tracking-wider text-white/35 uppercase">Nodes</span>
        {selectedNodes.map((n) => (
          <div
            key={n.id}
            className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2 py-1.5"
          >
            <CategoryIcon
              category={n.data.category}
              size={12}
              style={{ color: 'rgba(255,255,255,0.4)' }}
            />
            <span className="truncate text-[11px] text-white/60">{n.data.label}</span>
          </div>
        ))}
      </div>

      {/* Batch actions */}
      <div className="flex-shrink-0 space-y-2 border-t border-white/[0.04] px-4 pt-2 pb-4">
        <div className="flex gap-2">
          <button
            onClick={() =>
              batchAction(() =>
                multiSelectedIds.forEach((id) => useLifecycleStore.getState().lockNode(id)),
              )
            }
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-500/20 bg-slate-500/10 py-2 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-500/20"
          >
            <Lock size={11} />
            Lock All
          </button>
          <button
            onClick={() =>
              batchAction(() =>
                multiSelectedIds.forEach((id) => useLifecycleStore.getState().approveNode(id)),
              )
            }
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 py-2 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            <CheckCircle2 size={11} />
            Approve
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              batchAction(() =>
                multiSelectedIds.forEach((id) =>
                  useLifecycleStore.getState().updateNodeStatus(id, 'active'),
                ),
              )
            }
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 py-2 text-[11px] font-medium text-blue-400 transition-colors hover:bg-blue-500/20"
          >
            <Zap size={11} />
            Activate
          </button>
          <button
            onClick={() =>
              batchAction(() =>
                multiSelectedIds.forEach((id) =>
                  useLifecycleStore.getState().updateNodeStatus(id, 'stale'),
                ),
              )
            }
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 py-2 text-[11px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            <AlertTriangle size={11} />
            Mark Stale
          </button>
        </div>
        <button
          onClick={() => {
            const names = selectedNodes.map((n) => n.data.label).join(', ');
            if (!window.confirm(`Delete ${count} nodes (${names})?`)) return;
            deleteMultiSelected();
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/15 bg-rose-500/8 py-2 text-[11px] font-medium text-rose-400/70 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
        >
          <Trash2 size={11} />
          Delete All
        </button>
      </div>
    </motion.div>
  );
}

export default function NodeDetailPanel() {
  const selectedNodeId = useLifecycleStore((s) => s.selectedNodeId);
  const multiSelectedIds = useLifecycleStore((s) => s.multiSelectedIds);
  const isMultiSelect = multiSelectedIds.size > 1;

  return (
    <AnimatePresence>
      {isMultiSelect ? (
        <BatchActionPanel key="batch" />
      ) : selectedNodeId ? (
        <NodeDetailPanelContent key={selectedNodeId} nodeId={selectedNodeId} />
      ) : null}
    </AnimatePresence>
  );
}
