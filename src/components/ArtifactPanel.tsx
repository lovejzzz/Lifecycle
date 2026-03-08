'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Eye, Pencil, Save, RotateCcw, Copy, Check,
  ChevronDown, ChevronRight, Sparkles, GitBranch, Loader2, ArrowRight,
} from 'lucide-react';
import { useLifecycleStore } from '@/store/useStore';
import { getNodeColors, CategoryIcon } from '@/lib/types';
import type { NodeData } from '@/lib/types';
import { renderMarkdown } from '@/lib/markdown';

// ─── Selection Toolbar ───────────────────────────────────────────────────────

function SelectionToolbar({
  position,
  onRewrite,
  onClose,
  isRewriting,
}: {
  position: { x: number; y: number };
  onRewrite: (instruction: string) => void;
  onClose: () => void;
  isRewriting: boolean;
}) {
  const [instruction, setInstruction] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      className="absolute z-50 bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 flex items-center gap-2"
      style={{ left: Math.min(position.x, 280), top: position.y }}
    >
      <Sparkles size={12} className="text-cyan-400/60 flex-shrink-0" />
      <input
        ref={inputRef}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && instruction.trim()) onRewrite(instruction.trim());
          if (e.key === 'Escape') onClose();
        }}
        placeholder="How should CID rewrite this?"
        className="bg-transparent text-[11px] text-white/80 placeholder:text-white/25 outline-none w-[220px]"
        disabled={isRewriting}
      />
      {isRewriting ? (
        <Loader2 size={12} className="text-cyan-400/60 animate-spin flex-shrink-0" />
      ) : (
        <button
          onClick={() => instruction.trim() && onRewrite(instruction.trim())}
          className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300/80 hover:bg-cyan-500/30 transition-colors flex-shrink-0"
        >
          Rewrite
        </button>
      )}
    </motion.div>
  );
}

// ─── Version History ─────────────────────────────────────────────────────────

function VersionHistory({
  versions,
  onRestore,
}: {
  versions: Array<{ content: string; result?: string; timestamp: number; label: string }>;
  onRestore: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (versions.length <= 1) return null;

  return (
    <div className="border-t border-white/[0.06] pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-white/40 hover:text-white/60 transition-colors w-full"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <RotateCcw size={10} />
        <span>{versions.length} versions</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 space-y-1 max-h-[120px] overflow-y-auto scrollbar-thin">
              {[...versions].reverse().map((v, i) => {
                const realIndex = versions.length - 1 - i;
                const isLatest = realIndex === versions.length - 1;
                return (
                  <button
                    key={realIndex}
                    onClick={() => !isLatest && onRestore(realIndex)}
                    disabled={isLatest}
                    className={`flex items-center justify-between w-full px-2 py-1 rounded text-[10px] transition-colors ${
                      isLatest
                        ? 'bg-white/[0.04] text-white/50'
                        : 'hover:bg-white/[0.06] text-white/35 hover:text-white/60'
                    }`}
                  >
                    <span className="font-mono">{v.label}</span>
                    <span className="text-white/20">
                      {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Downstream Impact ───────────────────────────────────────────────────────

function DownstreamImpact({
  downstream,
  onSync,
}: {
  downstream: Array<{ id: string; label: string; category: string }>;
  onSync: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (downstream.length === 0) return null;

  return (
    <div className="border-t border-white/[0.06] pt-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[10px] text-white/40 hover:text-white/60 transition-colors"
        >
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <GitBranch size={10} />
          <span>{downstream.length} downstream node{downstream.length > 1 ? 's' : ''}</span>
        </button>
        <button
          onClick={onSync}
          className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400/70 hover:bg-amber-500/20 transition-colors"
        >
          <ArrowRight size={9} />
          Sync
        </button>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 space-y-0.5">
              {downstream.map(n => {
                const colors = getNodeColors(n.category as NodeData['category']);
                return (
                  <div key={n.id} className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-white/40">
                    <span style={{ color: colors.primary }}><CategoryIcon category={n.category as NodeData['category']} size={10} /></span>
                    <span>{n.label}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Artifact Panel ─────────────────────────────────────────────────────

export default function ArtifactPanel() {
  const {
    nodes, activeArtifactNodeId, artifactPanelTab, artifactPanelMode,
    artifactVersions, closeArtifactPanel, setArtifactTab, setArtifactMode,
    saveArtifactVersion, restoreArtifactVersion, rewriteArtifactSelection,
    getDownstreamNodes, updateNodeData, updateNodeStatus,
    addEvent, pushHistory, selectNode,
  } = useLifecycleStore();

  const node = nodes.find(n => n.id === activeArtifactNodeId);
  const [editDraft, setEditDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<{ x: number; y: number; text: string } | null>(null);
  const [isRewriting, setIsRewriting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync edit draft when node/tab/mode changes
  const currentText = node
    ? (artifactPanelTab === 'result' ? (node.data.executionResult || '') : (node.data.content || ''))
    : '';
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync draft with source content on mode/tab/node change
  useEffect(() => { setEditDraft(currentText); }, [currentText, artifactPanelMode, artifactPanelTab]);

  // Handle text selection for AI rewrite
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      return;
    }
    const text = selection.toString().trim();
    if (text.length < 3) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect();
    if (!panelRect) return;

    setSelectionToolbar({
      x: rect.left - panelRect.left,
      y: rect.bottom - panelRect.top + 8,
      text,
    });
  }, [setSelectionToolbar]);

  // Close selection toolbar on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectionToolbar && !(e.target as HTMLElement).closest('[data-selection-toolbar]')) {
        setSelectionToolbar(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectionToolbar]);

  if (!node || !activeArtifactNodeId) return null;

  const colors = getNodeColors(node.data.category);
  const hasResult = !!node.data.executionResult;
  const activeText = artifactPanelTab === 'result'
    ? (node.data.executionResult || '')
    : (node.data.content || '');
  const versions = artifactVersions[activeArtifactNodeId] || [];
  const downstream = getDownstreamNodes(activeArtifactNodeId);

  const handleSave = () => {
    pushHistory();
    saveArtifactVersion(activeArtifactNodeId);
    if (artifactPanelTab === 'result') {
      updateNodeData(activeArtifactNodeId, { executionResult: editDraft });
    } else {
      updateNodeData(activeArtifactNodeId, { content: editDraft });
    }
    addEvent({
      id: `ev-${Date.now()}`,
      type: 'edited',
      message: `Edited ${artifactPanelTab === 'result' ? 'execution result' : 'content'} of "${node.data.label}"`,
      timestamp: Date.now(),
      nodeId: activeArtifactNodeId,
      agent: false,
    });
    setArtifactMode('preview');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(activeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRewrite = async (instruction: string) => {
    if (!selectionToolbar) return;
    setIsRewriting(true);
    await rewriteArtifactSelection(activeArtifactNodeId, selectionToolbar.text, instruction);
    setIsRewriting(false);
    setSelectionToolbar(null);
  };

  const handleSync = () => {
    for (const d of downstream) {
      updateNodeStatus(d.id, 'stale');
    }
    addEvent({
      id: `ev-${Date.now()}`,
      type: 'propagated',
      message: `Propagated changes from "${node.data.label}" to ${downstream.length} downstream nodes`,
      timestamp: Date.now(),
      nodeId: activeArtifactNodeId,
      agent: false,
    });
  };

  return (
    <motion.div
      ref={panelRef}
      initial={{ x: 500, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 500, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed right-0 top-0 bottom-0 w-[500px] bg-[#0c0c14]/95 backdrop-blur-xl border-l border-white/[0.06] z-40 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span style={{ color: colors.primary }}>
            <CategoryIcon category={node.data.category} size={14} />
          </span>
          <div className="min-w-0">
            <button
              onClick={() => { selectNode(activeArtifactNodeId); }}
              className="text-[12px] font-semibold text-white/90 hover:text-white transition-colors truncate block"
            >
              {node.data.label}
            </button>
            {node.data.description && (
              <div className="text-[9.5px] text-white/30 truncate">{node.data.description}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Copy */}
          <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors">
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>
          {/* Close */}
          <button onClick={closeArtifactPanel} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tab Bar + Mode Toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04]">
        <div className="flex gap-1">
          <button
            onClick={() => setArtifactTab('content')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
              artifactPanelTab === 'content'
                ? 'bg-white/[0.08] text-white/80'
                : 'text-white/30 hover:text-white/50'
            }`}
          >
            Content
          </button>
          {hasResult && (
            <button
              onClick={() => setArtifactTab('result')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                artifactPanelTab === 'result'
                  ? 'bg-white/[0.08] text-white/80'
                  : 'text-white/30 hover:text-white/50'
              }`}
            >
              Execution Result
            </button>
          )}
        </div>
        <div className="flex gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
          <button
            onClick={() => setArtifactMode('preview')}
            className={`p-1 rounded-md transition-colors ${
              artifactPanelMode === 'preview'
                ? 'bg-white/[0.1] text-white/70'
                : 'text-white/25 hover:text-white/50'
            }`}
          >
            <Eye size={12} />
          </button>
          <button
            onClick={() => setArtifactMode('edit')}
            className={`p-1 rounded-md transition-colors ${
              artifactPanelMode === 'edit'
                ? 'bg-white/[0.1] text-white/70'
                : 'text-white/25 hover:text-white/50'
            }`}
          >
            <Pencil size={12} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 relative" ref={contentRef}>
        {artifactPanelMode === 'preview' ? (
          <div
            className="text-[11px] text-white/60 leading-relaxed select-text"
            onMouseUp={handleMouseUp}
          >
            {activeText ? (
              renderMarkdown(activeText)
            ) : (
              <div className="text-white/20 italic text-center mt-12">
                No {artifactPanelTab === 'result' ? 'execution result' : 'content'} yet.
                {artifactPanelTab === 'content' && (
                  <button
                    onClick={() => setArtifactMode('edit')}
                    className="block mx-auto mt-2 text-cyan-400/50 hover:text-cyan-400/80 transition-colors"
                  >
                    Start writing
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full gap-2">
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              className="flex-1 bg-black/20 border border-white/[0.06] rounded-lg p-3 text-[11px] text-white/70 font-mono leading-relaxed resize-none outline-none focus:border-white/[0.12] transition-colors scrollbar-thin"
              placeholder={`Write ${artifactPanelTab === 'result' ? 'execution result' : 'content'} here... (Markdown supported)`}
              spellCheck={false}
            />
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/20">{editDraft.length} chars • Markdown supported</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setArtifactMode('preview')}
                  className="px-2.5 py-1 rounded-md text-[10px] text-white/30 hover:text-white/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-emerald-500/15 border border-emerald-500/20 text-emerald-400/80 hover:bg-emerald-500/25 transition-colors"
                >
                  <Save size={10} />
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Selection Toolbar */}
        <AnimatePresence>
          {selectionToolbar && (
            <div data-selection-toolbar>
              <SelectionToolbar
                position={{ x: selectionToolbar.x, y: selectionToolbar.y }}
                onRewrite={handleRewrite}
                onClose={() => setSelectionToolbar(null)}
                isRewriting={isRewriting}
              />
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer: Versions + Downstream */}
      <div className="px-4 py-2 space-y-2 border-t border-white/[0.04]">
        <VersionHistory
          versions={versions}
          onRestore={(idx) => restoreArtifactVersion(activeArtifactNodeId, idx)}
        />
        <DownstreamImpact
          downstream={downstream}
          onSync={handleSync}
        />
      </div>
    </motion.div>
  );
}
