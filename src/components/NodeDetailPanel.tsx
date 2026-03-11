'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Lock, Unlock, CheckCircle2, RefreshCw, Clock, Trash2,
  Pencil, Check, Eye,
  Plus, Trash, ChevronDown, Copy, Bot, Download,
} from 'lucide-react';
import { useLifecycleStore } from '@/store/useStore';
import { getNodeColors, CategoryIcon, BUILT_IN_CATEGORIES, EDGE_LABEL_COLORS, relativeTime } from '@/lib/types';
import type { NodeData, NodeCategory } from '@/lib/types';
import DiffView from './DiffView';
import { exportAndDownload } from '@/lib/export';
import type { ExportFormat } from '@/lib/export';

const ALL_STATUSES: NodeData['status'][] = ['active', 'stale', 'pending', 'locked', 'generating', 'reviewing'];

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  stale: '#f59e0b',
  pending: '#6366f1',
  locked: '#94a3b8',
  generating: '#06b6d4',
  reviewing: '#f43f5e',
};

// ─── Content Editor ──────────────────────────────────────────────────────────

function ContentEditor({ content, nodeId, updateNodeData, addEvent, label }: {
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
      addEvent({ id: `ev-${Date.now()}`, type: 'edited', message: `Updated content of ${label}`, timestamp: Date.now(), nodeId });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-white/35 uppercase tracking-wider">Content</span>
        </div>
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setDraft(content); } }}
          rows={8}
          className="w-full text-[11px] text-white/60 leading-relaxed bg-white/[0.04] rounded-lg px-3 py-2 border border-white/10 outline-none resize-none font-mono"
        />
        <div className="flex gap-1.5 justify-end mt-1.5">
          <button onClick={() => { setEditing(false); setDraft(content); }} className="text-[10px] text-white/30 hover:text-white/50 px-2 py-0.5 rounded">Cancel</button>
          <button onClick={commitContent} className="text-[10px] text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/10">Save</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/35 uppercase tracking-wider">Content</span>
        <div className="flex items-center gap-2">
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[9px] text-cyan-400/60 hover:text-cyan-400 transition-colors"
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
              className="text-white/20 hover:text-white/50 transition-colors"
            >
              {copied ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
            </button>
          )}
          <button onClick={() => { setDraft(content); setEditing(true); }} className="text-white/20 hover:text-white/50 transition-colors">
            <Pencil size={9} />
          </button>
        </div>
      </div>
      <div
        onClick={() => { setDraft(content); setEditing(true); }}
        className={`text-[11px] text-white/45 leading-relaxed bg-white/[0.02] rounded-lg px-3 py-2 border border-white/[0.04] overflow-y-auto whitespace-pre-wrap cursor-pointer hover:border-white/[0.1] transition-colors ${
          expanded ? 'max-h-[300px]' : 'max-h-[80px]'
        } transition-all duration-300`}
      >
        {content || <span className="text-white/30 italic">Click to add content...</span>}
      </div>
    </div>
  );
}

// ─── Status Picker ───────────────────────────────────────────────────────────

function StatusPicker({ status, nodeId, updateNodeStatus, lockNode }: {
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
    <div ref={ref} className="flex items-center justify-between relative">
      <span className="text-[10px] text-white/35 uppercase tracking-wider">Status</span>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-white/[0.05] transition-colors group"
      >
        <span className="w-[6px] h-[6px] rounded-full" style={{ background: STATUS_COLORS[status] }} />
        <span className="text-[11px] text-white/60 capitalize">{status}</span>
        <ChevronDown size={9} className="text-white/20 group-hover:text-white/40 transition-colors" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[130px] rounded-lg border border-white/[0.08] bg-[#0e0e18]/95 backdrop-blur-xl overflow-hidden shadow-2xl">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => {
                if (s === 'locked') lockNode(nodeId);
                else updateNodeStatus(nodeId, s);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-white/[0.05] transition-colors ${
                s === status ? 'text-white/90' : 'text-white/50'
              }`}
            >
              <span className="w-[6px] h-[6px] rounded-full" style={{ background: STATUS_COLORS[s] }} />
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

function CategoryPicker({ category, nodeId, updateNodeData, addEvent, label, allCategories }: {
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
    <div ref={ref} className="flex items-center justify-between relative">
      <span className="text-[10px] text-white/35 uppercase tracking-wider">Category</span>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-white/[0.05] transition-colors group"
      >
        <CategoryIcon category={category} size={10} style={{ color: getNodeColors(category).primary }} />
        <span className="text-[11px] text-white/60 capitalize">{category}</span>
        <ChevronDown size={9} className="text-white/20 group-hover:text-white/40 transition-colors" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[150px] max-h-[220px] overflow-y-auto rounded-lg border border-white/[0.08] bg-[#0e0e18]/95 backdrop-blur-xl shadow-2xl">
          {allCategories.map(cat => {
            const catColors = getNodeColors(cat);
            return (
              <button
                key={cat}
                onClick={() => {
                  if (cat !== category) {
                    updateNodeData(nodeId, { category: cat });
                    addEvent({ id: `ev-${Date.now()}`, type: 'edited', message: `Changed ${label} category: ${category} → ${cat}`, timestamp: Date.now(), nodeId });
                  }
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-white/[0.05] transition-colors ${
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
  nodeId, sections, updateNodeData, addEvent, label,
}: {
  nodeId: string;
  sections: NonNullable<NodeData['sections']>;
  updateNodeData: (id: string, partial: Partial<NodeData>) => void;
  addEvent: (event: any) => void;
  label: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const SECTION_STATUSES: Array<'current' | 'stale' | 'regenerating'> = ['current', 'stale', 'regenerating'];

  const addSection = () => {
    const id = `sec-${Date.now()}`;
    const updated = [...sections, { id, title: 'New Section', status: 'current' as const }];
    updateNodeData(nodeId, { sections: updated });
    addEvent({ id: `ev-${Date.now()}`, type: 'edited', message: `Added section to ${label}`, timestamp: Date.now(), nodeId });
    setDraft('New Section');
    setEditingId(id);
  };

  const renameSection = (secId: string) => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const updated = sections.map(s => s.id === secId ? { ...s, title: trimmed } : s);
    updateNodeData(nodeId, { sections: updated });
    setEditingId(null);
  };

  const deleteSection = (secId: string) => {
    const sec = sections.find(s => s.id === secId);
    const updated = sections.filter(s => s.id !== secId);
    updateNodeData(nodeId, { sections: updated });
    addEvent({ id: `ev-${Date.now()}`, type: 'edited', message: `Removed "${sec?.title}" from ${label}`, timestamp: Date.now(), nodeId });
  };

  const cycleStatus = (secId: string) => {
    const sec = sections.find(s => s.id === secId);
    if (!sec) return;
    const idx = SECTION_STATUSES.indexOf(sec.status);
    const next = SECTION_STATUSES[(idx + 1) % SECTION_STATUSES.length];
    const updated = sections.map(s => s.id === secId ? { ...s, status: next } : s);
    updateNodeData(nodeId, { sections: updated });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-white/35 uppercase tracking-wider">Sections</span>
        <button onClick={addSection} className="text-white/20 hover:text-emerald-400 transition-colors" title="Add section">
          <Plus size={11} />
        </button>
      </div>
      {sections.length > 0 && (
        <div className="space-y-1.5">
          {sections.map((sec) => (
            <div key={sec.id} className="flex items-center justify-between bg-white/[0.02] rounded-lg px-3 py-1.5 border border-white/[0.04] group/sec">
              {editingId === sec.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={() => renameSection(sec.id)}
                  onKeyDown={e => { if (e.key === 'Enter') renameSection(sec.id); if (e.key === 'Escape') setEditingId(null); }}
                  className="text-[11px] text-white/55 bg-white/[0.06] rounded px-1.5 py-0.5 border border-white/10 outline-none flex-1 mr-2"
                />
              ) : (
                <span
                  className="text-[11px] text-white/55 cursor-pointer hover:text-white/80 transition-colors"
                  onDoubleClick={() => { setDraft(sec.title); setEditingId(sec.id); }}
                  title="Double-click to rename"
                >{sec.title}</span>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => cycleStatus(sec.id)}
                  title="Click to cycle status"
                  className={`text-[9px] font-medium uppercase tracking-wider cursor-pointer hover:opacity-80 transition-opacity ${
                    sec.status === 'current' ? 'text-emerald-400' : sec.status === 'stale' ? 'text-amber-400' : 'text-cyan-400'
                  }`}
                >
                  {sec.status}
                </button>
                <button
                  onClick={() => deleteSection(sec.id)}
                  className="opacity-0 group-hover/sec:opacity-100 text-white/20 hover:text-rose-400 transition-all"
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
        className="text-white/20 hover:text-white/50 transition-colors"
        title="Download as..."
      >
        <Download size={9} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl overflow-hidden">
          {formats.map(f => (
            <button
              key={f.format}
              onClick={() => {
                exportAndDownload(content, f.format, label);
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-[10px] text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors whitespace-nowrap"
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

  const history = data._versionHistory as Array<{ version: number; content: string; timestamp: number; trigger: string }> | undefined;
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
        className="flex items-center gap-1.5 text-[10px] text-cyan-400/50 hover:text-cyan-400/80 transition-colors"
      >
        <Eye size={9} />
        <span>{showDiff ? 'Hide changes' : 'View changes'}</span>
        <span className="text-white/20 text-[9px]">vs v{latestVersion.version}</span>
      </button>
      {showDiff && (
        <div className="mt-1.5">
          <DiffView
            oldText={previousContent}
            newText={currentContent}
            compact
            onAccept={() => setShowDiff(false)}
            onRevert={() => {
              if (window.confirm(`Revert to v${latestVersion.version}? Downstream nodes will be marked stale.`)) {
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

function VersionHistory({ nodeId, history, currentVersion, currentContent }: {
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
    'execution': 'Execution',
    'refinement': 'Refinement',
    'rollback': 'Rollback',
  };

  const viewingEntry = viewingVersion !== null ? history.find(v => v.version === viewingVersion) : null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-white/35 uppercase tracking-wider hover:text-white/50 transition-colors"
      >
        <Clock size={9} />
        <span>History ({history.length} version{history.length !== 1 ? 's' : ''})</span>
        <ChevronDown size={9} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {[...history].reverse().map((entry) => (
            <div
              key={entry.version}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                viewingVersion === entry.version
                  ? 'border-violet-500/20 bg-violet-500/5'
                  : 'border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
              onClick={() => setViewingVersion(viewingVersion === entry.version ? null : entry.version)}
            >
              <span className="text-[10px] text-white/30 font-mono w-6">v{entry.version}</span>
              <span className="text-[9px] text-white/20 flex-1">{triggerLabels[entry.trigger] || entry.trigger}</span>
              <span className="text-[8px] text-white/30">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Restore v${entry.version}? This will mark downstream nodes stale.`)) {
                    rollbackNode(nodeId, entry.version);
                    setViewingVersion(null);
                  }
                }}
                className="text-[9px] text-violet-400/50 hover:text-violet-400 transition-colors px-1.5 py-0.5 rounded bg-violet-500/[0.06] hover:bg-violet-500/10"
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
                  if (window.confirm(`Restore v${viewingEntry.version}? Downstream nodes will be marked stale.`)) {
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
  const { nodes, edges, selectedNodeId, selectNode, lockNode, approveNode, updateNodeStatus, updateNodeData, deleteNode, deleteEdge, addEvent, askCIDAboutNode, executeNode, openArtifactPanel, refineNote, isProcessing } = useLifecycleStore();
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
  const customCategories = Array.from(new Set(nodes.map(n => n.data.category).filter(c => !builtInSet.has(c))));
  const allCategories = [...BUILT_IN_CATEGORIES, ...customCategories];

  // Compute depth from roots (longest path to this node)
  const nodeDepth = React.useMemo(() => {
    if (!nodeId || edges.length === 0) return 0;
    const hasIncoming = new Set(edges.map(e => e.target));
    const roots = nodes.filter(n => !hasIncoming.has(n.id));
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
        if (id === nodeId) { maxDepth = Math.max(maxDepth, depth); continue; }
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
  const incomingEdges = edges.filter(e => e.target === node.id);
  const outgoingEdges = edges.filter(e => e.source === node.id);

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
    if (connCount > 0 && !window.confirm(`Delete "${data.label}"? This will remove ${connCount} connection${connCount > 1 ? 's' : ''}.`)) return;
    deleteNode(node.id);
  };

  return (
    <motion.div
      key={node.id}
      initial={{ x: -320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -320, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute top-4 left-4 w-[300px] max-md:w-[calc(100vw-2rem)] max-md:left-2 max-md:right-2 rounded-xl border border-white/[0.06] bg-[#0c0c14]/95 backdrop-blur-xl overflow-hidden z-20 shadow-2xl max-h-[calc(100vh-120px)] flex flex-col"
      role="complementary"
      aria-label="Node Details"
    >
        {/* Accent */}
        <div className="h-[2px] flex-shrink-0" style={{ background: `linear-gradient(90deg, ${colors.primary}, transparent)` }} />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${colors.primary}15` }}>
              <CategoryIcon category={data.category} size={15} style={{ color: colors.primary }} />
            </div>
            <div className="flex-1 min-w-0">
              {editingLabel ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onBlur={commitLabel}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditingLabel(false); }}
                    className="text-sm font-semibold text-white bg-white/[0.06] rounded px-1.5 py-0.5 border border-white/10 outline-none w-full"
                  />
                  <button onClick={commitLabel} className="text-emerald-400 hover:text-emerald-300 flex-shrink-0">
                    <Check size={12} />
                  </button>
                </div>
              ) : (
                <div
                  className="flex items-center gap-1.5 group/label cursor-pointer"
                  onClick={startEditLabel}
                >
                  <div className="text-sm font-semibold text-white truncate">{data.label}</div>
                  <Pencil size={10} className="opacity-0 group-hover/label:opacity-100 text-white/30 hover:text-white/60 transition-opacity flex-shrink-0" />
                </div>
              )}
            </div>
          </div>
          <button onClick={() => selectNode(null)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors flex-shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="px-4 py-3 space-y-3">
            {/* Status — clickable dropdown */}
            <StatusPicker status={data.status} nodeId={node.id} updateNodeStatus={updateNodeStatus} lockNode={lockNode} />

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
                <span className="text-[10px] text-white/35 uppercase tracking-wider">Version</span>
                <span className="text-[11px] text-white/60 font-mono">v{data.version}</span>
              </div>
            )}

            {/* Last Updated */}
            {data.lastUpdated && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/35 uppercase tracking-wider">Updated</span>
                <span className="text-[11px] text-white/60 flex items-center gap-1">
                  <Clock size={10} className="text-white/25" />
                  {relativeTime(data.lastUpdated)}
                </span>
              </div>
            )}

            {/* Graph Position */}
            {edges.length > 0 && (incomingEdges.length > 0 || outgoingEdges.length > 0) && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/35 uppercase tracking-wider">Position</span>
                <span className="text-[11px] text-white/60 flex items-center gap-1.5">
                  {isRoot && <span className="text-[8px] px-1.5 py-px rounded-full bg-emerald-500/15 text-emerald-400/80 font-medium">Root</span>}
                  {isLeaf && <span className="text-[8px] px-1.5 py-px rounded-full bg-amber-500/15 text-amber-400/80 font-medium">Leaf</span>}
                  {!isRoot && !isLeaf && <span className="text-[8px] px-1.5 py-px rounded-full bg-indigo-500/15 text-indigo-400/80 font-medium">Depth {nodeDepth}</span>}
                </span>
              </div>
            )}

            {/* Connections summary */}
            {(incomingEdges.length > 0 || outgoingEdges.length > 0) && (
              <div>
                <span className="text-[10px] text-white/35 uppercase tracking-wider block mb-1.5">Connections</span>
                <div className="space-y-1">
                  {incomingEdges.map(e => {
                    const src = nodes.find(n => n.id === e.source);
                    const labelColor = EDGE_LABEL_COLORS[e.label as string] || '#6366f1';
                    return (
                      <div key={e.id} className="flex items-center gap-1.5 group/edge">
                        <button
                          onClick={() => selectNode(e.source)}
                          className="flex-1 flex items-center gap-1.5 text-[10px] text-white/40 hover:text-white/70 transition-colors text-left min-w-0"
                        >
                          <span className="text-white/20">←</span>
                          <span className="truncate">{src?.data.label ?? e.source}</span>
                          {e.label && (
                            <span className="ml-auto flex items-center gap-1 text-[9px]" style={{ color: `${labelColor}99` }}>
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: labelColor }} />
                              {e.label as string}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => deleteEdge(e.id)}
                          title="Remove connection"
                          className="opacity-0 group-hover/edge:opacity-100 text-white/30 hover:text-rose-400 transition-all flex-shrink-0"
                        >
                          <X size={9} />
                        </button>
                      </div>
                    );
                  })}
                  {outgoingEdges.map(e => {
                    const tgt = nodes.find(n => n.id === e.target);
                    const labelColor = EDGE_LABEL_COLORS[e.label as string] || '#6366f1';
                    return (
                      <div key={e.id} className="flex items-center gap-1.5 group/edge">
                        <button
                          onClick={() => selectNode(e.target)}
                          className="flex-1 flex items-center gap-1.5 text-[10px] text-white/40 hover:text-white/70 transition-colors text-left min-w-0"
                        >
                          <span className="text-white/20">→</span>
                          <span className="truncate">{tgt?.data.label ?? e.target}</span>
                          {e.label && (
                            <span className="ml-auto flex items-center gap-1 text-[9px]" style={{ color: `${labelColor}99` }}>
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: labelColor }} />
                              {e.label as string}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => deleteEdge(e.id)}
                          title="Remove connection"
                          className="opacity-0 group-hover/edge:opacity-100 text-white/30 hover:text-rose-400 transition-all flex-shrink-0"
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
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-white/35 uppercase tracking-wider">Description</span>
                {!editingDesc && (
                  <button onClick={startEditDesc} className="text-white/20 hover:text-white/50 transition-colors">
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
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingDesc(false); }}
                    rows={3}
                    className="w-full text-[11px] text-white/60 leading-relaxed bg-white/[0.04] rounded-lg px-3 py-2 border border-white/10 outline-none resize-none"
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={() => setEditingDesc(false)} className="text-[10px] text-white/30 hover:text-white/50 px-2 py-0.5 rounded">Cancel</button>
                    <button onClick={commitDesc} className="text-[10px] text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/10">Save</button>
                  </div>
                </div>
              ) : (
                <p
                  onClick={startEditDesc}
                  className="text-[11px] text-white/50 leading-relaxed cursor-pointer hover:text-white/70 transition-colors"
                >
                  {data.description || <span className="text-white/20 italic">Click to add description...</span>}
                </p>
              )}
            </div>

            {/* Input Value — for input nodes */}
            {data.category === 'input' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-white/35 uppercase tracking-wider">
                    {data.inputType === 'url' ? 'URL' : data.inputType === 'file' ? 'File Input' : 'Input Value'}
                  </span>
                </div>
                <input
                  value={data.inputValue ?? ''}
                  onChange={(e) => updateNodeData(node.id, { inputValue: e.target.value })}
                  placeholder={data.placeholder || (data.inputType === 'url' ? 'Paste URL here...' : 'Enter input value...')}
                  className="w-full text-[11px] text-white/60 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/10 outline-none placeholder:text-white/30"
                />
              </div>
            )}

            {/* AI Execution Config — for CID/AI nodes */}
            {(data.category === 'cid' || data.aiPrompt) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/35 uppercase tracking-wider">AI Execution</span>
                  {data.executionStatus === 'running' && (
                    <span className="text-[9px] text-cyan-400 flex items-center gap-1">
                      <RefreshCw size={8} className="animate-spin" /> Running &ldquo;{data.label}&rdquo;…
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
                  className="w-full text-[11px] text-white/60 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/10 outline-none resize-none placeholder:text-white/30"
                />
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-white/35 uppercase tracking-wider">Effort</span>
                  <select
                    value={data._effortLevel ?? 'auto'}
                    onChange={(e) => updateNodeData(node.id, { _effortLevel: e.target.value === 'auto' ? undefined : e.target.value as 'low' | 'medium' | 'high' | 'max' })}
                    className="text-[10px] text-white/60 bg-white/[0.04] rounded px-2 py-0.5 border border-white/10 outline-none"
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
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-medium hover:bg-cyan-500/20 transition-colors disabled:opacity-30"
                  >
                    {data.executionStatus === 'running' ? (
                      <><RefreshCw size={10} className="animate-spin" /> Running &ldquo;{data.label}&rdquo;…</>
                    ) : (
                      <>▶ Run Node</>
                    )}
                  </button>
                  {data.category === 'note' && (
                    <button
                      onClick={() => refineNote(node.id)}
                      disabled={isProcessing || !data.content}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-medium hover:bg-violet-500/20 transition-colors disabled:opacity-30"
                      title="Extract structured nodes and connections from this note"
                    >
                      <Bot size={10} />
                      Refine
                    </button>
                  )}
                </div>
                {data.executionError && (
                  <div className="text-[10px] text-rose-400/80 bg-rose-500/5 rounded-lg px-3 py-2 border border-rose-500/10">
                    {data.executionError}
                  </div>
                )}
              </div>
            )}

            {/* Execution Result — shown when a node has been executed */}
            {data.executionResult && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-white/35 uppercase tracking-wider">Execution Result</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openArtifactPanel(node.id)}
                      className="text-white/20 hover:text-cyan-400/60 transition-colors"
                      title="Open in preview"
                    >
                      <Eye size={9} />
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(data.executionResult!);
                      }}
                      className="text-white/20 hover:text-white/50 transition-colors"
                      title="Copy result"
                    >
                      <Copy size={9} />
                    </button>
                    <ExportDropdown content={data.executionResult!} label={data.label} />
                  </div>
                </div>
                <div className="text-[10px] text-emerald-300/60 bg-emerald-500/[0.03] rounded-lg px-3 py-2 border border-emerald-500/10 max-h-[120px] overflow-y-auto whitespace-pre-wrap font-mono">
                  {data.executionResult.slice(0, 1000)}{data.executionResult.length > 1000 ? '...' : ''}
                </div>
              </div>
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
            {['artifact', 'note', 'policy', 'state', 'output', 'review'].includes(data.category) && !(data.content && data.content.length > 50) && (
              <button
                onClick={() => {
                  const store = useLifecycleStore.getState();
                  store.generateNodeContent(node.id);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-medium hover:bg-indigo-500/20 transition-colors"
                title="Let CID generate content for this node based on its category and description"
              >
                <Bot size={10} />
                Generate content with AI
              </button>
            )}

            {/* Version History */}
            {data._versionHistory && (data._versionHistory as Array<{ version: number; content: string; timestamp: number; trigger: string }>).length > 0 && (
              <VersionHistory
                nodeId={node.id}
                history={data._versionHistory as Array<{ version: number; content: string; timestamp: number; trigger: string }>}
                currentVersion={data.version ?? 1}
                currentContent={data.executionResult || data.content || ''}
              />
            )}

            {/* Sections */}
            <SectionEditor nodeId={node.id} sections={data.sections ?? []} updateNodeData={updateNodeData} addEvent={addEvent} label={data.label} />
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 pt-2 flex gap-2 border-t border-white/[0.04] flex-shrink-0">
          {data.status === 'stale' && (
            <button
              onClick={handleRegenerate}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[11px] font-medium hover:bg-cyan-500/20 transition-colors"
            >
              <RefreshCw size={11} />
              Regenerate
            </button>
          )}
          {data.status === 'reviewing' && (
            <button
              onClick={() => approveNode(node.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/20 transition-colors"
            >
              <CheckCircle2 size={11} />
              Approve
            </button>
          )}
          {!data.locked && data.status !== 'generating' && (
            <button
              onClick={() => lockNode(node.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 text-[11px] font-medium hover:bg-white/[0.07] transition-colors"
            >
              <Lock size={11} />
              Lock
            </button>
          )}
          {data.locked && (
            <button
              onClick={() => updateNodeStatus(node.id, 'active')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 text-[11px] font-medium hover:bg-white/[0.07] transition-colors"
            >
              <Unlock size={11} />
              Unlock
            </button>
          )}
          <button
            onClick={() => askCIDAboutNode(node.id)}
            title="Ask CID about this node"
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-500/8 border border-emerald-500/15 text-emerald-400/70 text-[11px] font-medium hover:bg-emerald-500/15 hover:text-emerald-400 transition-colors"
          >
            <Bot size={11} />
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-rose-500/8 border border-rose-500/15 text-rose-400/70 text-[11px] font-medium hover:bg-rose-500/15 hover:text-rose-400 transition-colors"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </motion.div>
  );
}

export default function NodeDetailPanel() {
  const selectedNodeId = useLifecycleStore((s) => s.selectedNodeId);

  return (
    <AnimatePresence>
      {selectedNodeId && (
        <NodeDetailPanelContent key={selectedNodeId} nodeId={selectedNodeId} />
      )}
    </AnimatePresence>
  );
}
