'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Eye, Pencil, Save, RotateCcw, Copy, Check,
  ChevronDown, ChevronRight, Sparkles, GitBranch, Loader2, ArrowRight,
  Maximize2, Minimize2, Search, Replace, Bold, Italic, Code, Heading2,
  List, ListOrdered, Quote, Columns2, Minus,
  ChevronLeft, BookOpen,
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
  isSyncing,
}: {
  downstream: Array<{ id: string; label: string; category: string }>;
  onSync: () => void;
  isSyncing?: boolean;
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
          disabled={isSyncing}
          className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-md border transition-colors ${
            isSyncing
              ? 'bg-amber-500/5 border-amber-500/10 text-amber-400/40 cursor-wait'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400/70 hover:bg-amber-500/20'
          }`}
        >
          {isSyncing ? <Loader2 size={9} className="animate-spin" /> : <ArrowRight size={9} />}
          {isSyncing ? 'Syncing...' : 'Sync & Run'}
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

// ─── Markdown Toolbar ────────────────────────────────────────────────────────

function MarkdownToolbar({
  textareaRef,
  onInsert,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInsert: (newText: string) => void;
}) {
  const wrap = (before: string, after: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.slice(start, end);
    const newText = text.slice(0, start) + before + (selected || 'text') + after + text.slice(end);
    onInsert(newText);
    // Restore cursor after React re-renders
    requestAnimationFrame(() => {
      ta.focus();
      const newStart = start + before.length;
      const newEnd = selected ? newStart + selected.length : newStart + 4;
      ta.setSelectionRange(newStart, newEnd);
    });
  };

  const insertLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const text = ta.value;
    // Find beginning of current line
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const newText = text.slice(0, lineStart) + prefix + text.slice(lineStart);
    onInsert(newText);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length);
    });
  };

  const [flashBtn, setFlashBtn] = useState<string | null>(null);
  const flash = (id: string, action: () => void) => {
    action();
    setFlashBtn(id);
    setTimeout(() => setFlashBtn(null), 150);
  };

  const btn = (id: string) =>
    `p-1 rounded transition-colors ${flashBtn === id ? 'bg-white/[0.15] text-white/80' : 'hover:bg-white/[0.08] text-white/30 hover:text-white/60'}`;
  const sep = "w-px h-3.5 bg-white/[0.06] mx-0.5";

  return (
    <div className="flex items-center gap-0.5 px-1 py-1 border-b border-white/[0.04] bg-white/[0.02]">
      <button className={btn('bold')} onClick={() => flash('bold', () => wrap('**', '**'))} title="Bold (Ctrl+B)"><Bold size={11} /></button>
      <button className={btn('italic')} onClick={() => flash('italic', () => wrap('*', '*'))} title="Italic (Ctrl+I)"><Italic size={11} /></button>
      <button className={btn('code')} onClick={() => flash('code', () => wrap('`', '`'))} title="Inline Code"><Code size={11} /></button>
      <div className={sep} />
      <button className={btn('h2')} onClick={() => flash('h2', () => insertLine('## '))} title="Heading"><Heading2 size={11} /></button>
      <button className={btn('ul')} onClick={() => flash('ul', () => insertLine('- '))} title="Bullet List"><List size={11} /></button>
      <button className={btn('ol')} onClick={() => flash('ol', () => insertLine('1. '))} title="Numbered List"><ListOrdered size={11} /></button>
      <button className={btn('quote')} onClick={() => flash('quote', () => insertLine('> '))} title="Blockquote"><Quote size={11} /></button>
      <div className={sep} />
      <button className={btn('codeblock')} onClick={() => flash('codeblock', () => wrap('\n```\n', '\n```\n'))} title="Code Block"><Code size={11} className="text-emerald-400/50" /></button>
      <button className={btn('hr')} onClick={() => flash('hr', () => insertLine('---\n'))} title="Horizontal Rule"><Minus size={11} /></button>
    </div>
  );
}

// ─── Find & Replace ──────────────────────────────────────────────────────────

function FindReplace({
  text,
  onReplace,
  onClose,
  contentRef,
}: {
  text: string;
  onReplace: (newText: string) => void;
  onClose: () => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [query, setQuery] = useState('');
  const [replaceVal, setReplaceVal] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const matches = query
    ? [...text.matchAll(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))]
    : [];

  const handleReplaceOne = () => {
    if (matches.length === 0 || !query) return;
    const m = matches[matchIdx % matches.length];
    const newText = text.slice(0, m.index!) + replaceVal + text.slice(m.index! + m[0].length);
    onReplace(newText);
  };

  const handleReplaceAll = () => {
    if (!query) return;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    onReplace(text.replace(new RegExp(escaped, 'gi'), replaceVal));
  };

  // Highlight matches in preview using CSS custom highlight API fallback
  useEffect(() => {
    if (!contentRef.current || !query) return;
    // Simple approach: use mark-style highlighting
    const el = contentRef.current;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const ranges: Range[] = [];
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(node.textContent || '')) !== null) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        ranges.push(range);
      }
    }
    // Use CSS Highlight API if available
    if ('Highlight' in window && CSS.highlights) {
      const highlight = new Highlight(...ranges);
      CSS.highlights.set('artifact-search', highlight);
      return () => { CSS.highlights?.delete('artifact-search'); };
    }
  }, [query, text, contentRef]);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="border-b border-white/[0.04] px-3 py-2 bg-white/[0.02] space-y-1.5 overflow-hidden"
    >
      <div className="flex items-center gap-1.5">
        <Search size={11} className="text-white/30 flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setMatchIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setMatchIdx(i => (i + 1) % Math.max(1, matches.length)); }
            if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); setMatchIdx(i => (i - 1 + matches.length) % Math.max(1, matches.length)); }
            // Ctrl/Cmd+G: next match, Shift+Ctrl/Cmd+G: prev match
            if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey) { e.preventDefault(); setMatchIdx(i => (i + 1) % Math.max(1, matches.length)); }
            if ((e.metaKey || e.ctrlKey) && e.key === 'g' && e.shiftKey) { e.preventDefault(); setMatchIdx(i => (i - 1 + matches.length) % Math.max(1, matches.length)); }
          }}
          placeholder="Find... (Enter/Shift+Enter to navigate)"
          className="bg-transparent text-[11px] text-white/70 placeholder:text-white/20 outline-none flex-1"
        />
        <span className={`text-[9px] tabular-nums w-14 text-right ${query && matches.length === 0 ? 'text-red-400/60' : 'text-white/30'}`}>
          {query ? `${matches.length > 0 ? (matchIdx % matches.length) + 1 : 0} of ${matches.length}` : ''}
        </span>
        <button onClick={() => setShowReplace(!showReplace)} className="p-0.5 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/50 transition-colors" title="Toggle Replace">
          <Replace size={11} />
        </button>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/50 transition-colors">
          <X size={11} />
        </button>
      </div>
      <AnimatePresence>
        {showReplace && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex items-center gap-1.5 overflow-hidden"
          >
            <Replace size={11} className="text-white/30 flex-shrink-0" />
            <input
              value={replaceVal}
              onChange={(e) => setReplaceVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleReplaceOne(); }}
              placeholder="Replace..."
              className="bg-transparent text-[11px] text-white/70 placeholder:text-white/20 outline-none flex-1"
            />
            <button onClick={handleReplaceOne} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors">
              One
            </button>
            <button onClick={handleReplaceAll} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors">
              All
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Editor Stats Bar ────────────────────────────────────────────────────────

function EditorStats({ text }: { text: string }) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text ? text.split('\n').length : 0;
  const chars = text.length;
  const readingMin = Math.max(1, Math.ceil(words / 200));

  return (
    <div className="flex items-center gap-3 text-[9px] text-white/20 tabular-nums">
      <span>{words.toLocaleString()} words</span>
      <span>{lines} lines</span>
      <span>{chars.toLocaleString()} chars</span>
      <span>~{readingMin} min read</span>
    </div>
  );
}

// ─── Reading Mode Content ────────────────────────────────────────────────────

function ReadingModeContent({
  nodes: allNodes,
  executedNodes,
  activeNodeId,
  onNavigate,
}: {
  nodes: Array<{ id: string; data: NodeData; [key: string]: unknown }>;
  executedNodes: Array<{ id: string; label: string; category: string }>;
  activeNodeId: string;
  onNavigate: (nodeId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active node on mount
  useEffect(() => {
    const el = scrollRef.current?.querySelector(`[data-node-section="${activeNodeId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeNodeId]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
      <div className="max-w-[700px] mx-auto">
        <h1 className="text-[14px] font-bold text-white/80 mb-1">Workflow Output</h1>
        <p className="text-[10px] text-white/25 mb-4">{executedNodes.length} nodes with content</p>
        {executedNodes.map((en, i) => {
          const fullNode = allNodes.find(n => n.id === en.id);
          if (!fullNode) return null;
          const content = fullNode.data.executionResult || fullNode.data.content || '';
          const isRunning = fullNode.data.executionStatus === 'running';
          const colors = getNodeColors(en.category as NodeData['category']);

          return (
            <div key={en.id} data-node-section={en.id} className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-white/20 font-mono">{i + 1}.</span>
                <span style={{ color: colors.primary }}>
                  <CategoryIcon category={en.category as NodeData['category']} size={11} />
                </span>
                <button
                  onClick={() => onNavigate(en.id)}
                  className="text-[11px] font-semibold text-white/60 hover:text-white/90 transition-colors"
                >
                  {en.label}
                </button>
                <span className="text-[9px] text-white/20">{en.category}</span>
              </div>
              {isRunning ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 bg-white/[0.04] rounded w-3/4" />
                  <div className="h-3 bg-white/[0.04] rounded w-full" />
                  <div className="h-3 bg-white/[0.04] rounded w-5/6" />
                  <div className="flex items-center gap-2 mt-2">
                    <Loader2 size={10} className="animate-spin text-cyan-400/40" />
                    <span className="text-[10px] text-cyan-400/40">Executing...</span>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-white/55 leading-relaxed">
                  {content ? renderMarkdown(content) : (
                    <span className="text-white/20 italic">No content yet</span>
                  )}
                </div>
              )}
              {i < executedNodes.length - 1 && (
                <hr className="border-white/[0.06] mt-6" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Artifact Panel ─────────────────────────────────────────────────────

export default function ArtifactPanel() {
  const {
    nodes, edges, activeArtifactNodeId, artifactPanelTab, artifactPanelMode,
    artifactVersions, closeArtifactPanel, setArtifactTab, setArtifactMode,
    saveArtifactVersion, restoreArtifactVersion, rewriteArtifactSelection,
    getDownstreamNodes, updateNodeData, updateNodeStatus, executeNode,
    addEvent, pushHistory, selectNode,
    artifactReadingMode, setArtifactReadingMode, getExecutedNodesInOrder,
    openArtifactPanel,
  } = useLifecycleStore();

  const node = nodes.find(n => n.id === activeArtifactNodeId);
  const [editDraft, setEditDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<{ x: number; y: number; text: string } | null>(null);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isSplitView, setIsSplitView] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync edit draft when source content, node, tab, or mode changes
  const currentText = node
    ? (artifactPanelTab === 'result' ? (node.data.executionResult || '') : (node.data.content || ''))
    : '';
  const prevSyncKeyRef = useRef('');
  useEffect(() => {
    const syncKey = `${activeArtifactNodeId}:${artifactPanelTab}:${artifactPanelMode}:${currentText}`;
    if (syncKey !== prevSyncKeyRef.current) {
      prevSyncKeyRef.current = syncKey;
      if (editDraft !== currentText) setEditDraft(currentText);
    }
  }, [activeArtifactNodeId, artifactPanelTab, artifactPanelMode, currentText, editDraft]);

  // Ref to allow save shortcut to call handleSave without stale closure
  const saveRef = useRef<(() => void) | null>(null);

  // Keyboard shortcuts: Ctrl+F (find), Ctrl+B/I (format), Ctrl+S (save), Escape (close fullscreen)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!activeArtifactNodeId) return;
      const isInPanel = panelRef.current?.contains(document.activeElement as globalThis.Node | null);

      // Ctrl/Cmd+F: Toggle find/replace (when focused in panel)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && isInPanel) {
        e.preventDefault();
        setShowFindReplace(v => !v);
      }
      // Ctrl/Cmd+S: Save (in edit or split mode, when panel is focused)
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && isInPanel && (artifactPanelMode === 'edit' || isSplitView)) {
        e.preventDefault();
        saveRef.current?.();
      }
      // Escape: close fullscreen first, then find, then panel
      if (e.key === 'Escape') {
        if (showFindReplace) { setShowFindReplace(false); return; }
        if (isFullScreen) { setIsFullScreen(false); return; }
      }
      // Ctrl+B: Bold (in edit mode)
      if ((e.metaKey || e.ctrlKey) && e.key === 'b' && artifactPanelMode === 'edit' && textareaRef.current === document.activeElement) {
        e.preventDefault();
        const ta = textareaRef.current!;
        const s = ta.selectionStart, end = ta.selectionEnd;
        const sel = editDraft.slice(s, end);
        const newText = editDraft.slice(0, s) + '**' + (sel || 'bold') + '**' + editDraft.slice(end);
        setEditDraft(newText);
      }
      // Ctrl+I: Italic (in edit mode)
      if ((e.metaKey || e.ctrlKey) && e.key === 'i' && artifactPanelMode === 'edit' && textareaRef.current === document.activeElement) {
        e.preventDefault();
        const ta = textareaRef.current!;
        const s = ta.selectionStart, end = ta.selectionEnd;
        const sel = editDraft.slice(s, end);
        const newText = editDraft.slice(0, s) + '*' + (sel || 'italic') + '*' + editDraft.slice(end);
        setEditDraft(newText);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeArtifactNodeId, showFindReplace, isFullScreen, artifactPanelMode, isSplitView, editDraft]);

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

  // Navigation: prev/next through executed nodes in topo order
  const executedNodes = getExecutedNodesInOrder();
  const currentIdx = executedNodes.findIndex(n => n.id === activeArtifactNodeId);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < executedNodes.length - 1;
  const navigateTo = (idx: number) => {
    if (idx >= 0 && idx < executedNodes.length) {
      openArtifactPanel(executedNodes[idx].id);
    }
  };

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
    // In split view, stay in edit mode — both panes are always visible
    if (!isSplitView) setArtifactMode('preview');
    // Auto-mark downstream nodes stale after save
    if (downstream.length > 0) {
      for (const d of downstream) updateNodeStatus(d.id, 'stale');
    }
  };

  // Keep save ref current for keyboard shortcut
  saveRef.current = handleSave; // eslint-disable-line react-hooks/refs

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

  const handleSync = async () => {
    setIsSyncing(true);
    // Mark all downstream stale first
    for (const d of downstream) updateNodeStatus(d.id, 'stale');
    addEvent({
      id: `ev-${Date.now()}`,
      type: 'propagated',
      message: `Propagated changes from "${node.data.label}" to ${downstream.length} downstream nodes`,
      timestamp: Date.now(),
      nodeId: activeArtifactNodeId,
      agent: false,
    });
    // Re-execute immediate downstream nodes (1 level deep — they'll cascade)
    const immediateDown = downstream.filter(d => {
      const store = useLifecycleStore.getState();
      return store.edges.some(e => e.source === activeArtifactNodeId && e.target === d.id);
    });
    for (const d of immediateDown) {
      try { await executeNode(d.id); } catch { /* node execution handles its own errors */ }
    }
    setIsSyncing(false);
  };

  return (
    <motion.div
      ref={panelRef}
      initial={{ x: 500, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 500, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`fixed bg-[#0c0c14]/95 backdrop-blur-xl border-l border-white/[0.06] z-40 flex flex-col transition-all duration-200 ${
        isFullScreen
          ? 'inset-0 w-full border-l-0'
          : 'right-0 top-0 bottom-0 w-[500px]'
      }`}
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
        <div className="flex items-center gap-0.5">
          {/* Prev/Next Navigation */}
          {executedNodes.length > 1 && !artifactReadingMode && (
            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={() => navigateTo(currentIdx - 1)}
                disabled={!hasPrev}
                className="p-1 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors disabled:opacity-20 disabled:cursor-default"
                title="Previous node"
              >
                <ChevronLeft size={12} />
              </button>
              <span className="text-[9px] text-white/25 tabular-nums min-w-[28px] text-center">
                {currentIdx + 1}/{executedNodes.length}
              </span>
              <button
                onClick={() => navigateTo(currentIdx + 1)}
                disabled={!hasNext}
                className="p-1 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors disabled:opacity-20 disabled:cursor-default"
                title="Next node"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          )}
          {/* Reading Mode */}
          <button
            onClick={() => setArtifactReadingMode(!artifactReadingMode)}
            className={`p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors ${artifactReadingMode ? 'text-cyan-400/60' : 'text-white/30 hover:text-white/60'}`}
            title={artifactReadingMode ? 'Exit Reading Mode' : 'Reading Mode — all nodes as document'}
          >
            <BookOpen size={12} />
          </button>
          {/* Find */}
          <button onClick={() => setShowFindReplace(v => !v)} className={`p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors ${showFindReplace ? 'text-cyan-400/60' : 'text-white/30 hover:text-white/60'}`} title="Find & Replace (⌘F)">
            <Search size={12} />
          </button>
          {/* Split View */}
          {!artifactReadingMode && (
            <button onClick={() => { setIsSplitView(v => !v); if (!isSplitView) setArtifactMode('edit'); }} className={`p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors ${isSplitView ? 'text-cyan-400/60' : 'text-white/30 hover:text-white/60'}`} title="Split View">
              <Columns2 size={12} />
            </button>
          )}
          {/* Copy */}
          <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors" title="Copy">
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>
          {/* Full Screen */}
          <button onClick={() => setIsFullScreen(v => !v)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors" title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}>
            {isFullScreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          {/* Close */}
          <button onClick={closeArtifactPanel} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tab Bar + Mode Toggle (hidden in reading mode) */}
      {!artifactReadingMode && <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04]">
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
        {/* Hide mode toggle when in split view — both show simultaneously */}
        {!isSplitView && (
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
        )}
      </div>}

      {/* Find & Replace Bar */}
      <AnimatePresence>
        {showFindReplace && (
          <FindReplace
            text={isSplitView || artifactPanelMode === 'edit' ? editDraft : activeText}
            onReplace={(newText) => {
              // Switch to edit mode on replace so changes are editable/saveable
              if (artifactPanelMode !== 'edit' && !isSplitView) setArtifactMode('edit');
              setEditDraft(newText);
            }}
            onClose={() => setShowFindReplace(false)}
            contentRef={contentRef}
          />
        )}
      </AnimatePresence>

      {/* Content Area */}
      <div className={`flex-1 overflow-hidden relative ${isSplitView && !artifactReadingMode ? 'flex' : 'flex flex-col'}`}>
        {artifactReadingMode ? (
          <ReadingModeContent nodes={nodes} executedNodes={executedNodes} activeNodeId={activeArtifactNodeId} onNavigate={(id) => { setArtifactReadingMode(false); openArtifactPanel(id); }} />
        ) : isSplitView ? (
          <>
            {/* Split: Editor Left */}
            <div className="flex-1 flex flex-col border-r border-white/[0.06] overflow-hidden">
              <MarkdownToolbar textareaRef={textareaRef} onInsert={setEditDraft} />
              <textarea
                ref={textareaRef}
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                className="flex-1 bg-black/20 p-3 text-[11px] text-white/70 font-mono leading-relaxed resize-none outline-none scrollbar-thin"
                placeholder={`Write ${artifactPanelTab === 'result' ? 'execution result' : 'content'} here... (Markdown supported)`}
                spellCheck={false}
              />
            </div>
            {/* Split: Preview Right */}
            <div className="flex-1 overflow-y-auto px-4 py-3" ref={contentRef}>
              <div
                className="text-[11px] text-white/60 leading-relaxed select-text"
                onMouseUp={handleMouseUp}
              >
                {editDraft ? renderMarkdown(editDraft) : (
                  <div className="text-white/20 italic text-center mt-12">Preview will appear here</div>
                )}
              </div>
            </div>
          </>
        ) : artifactPanelMode === 'preview' ? (
          <div
            className="flex-1 overflow-y-auto px-4 py-3"
            ref={contentRef}
          >
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
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <MarkdownToolbar textareaRef={textareaRef} onInsert={setEditDraft} />
            <textarea
              ref={textareaRef}
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              className="flex-1 bg-black/20 mx-4 mt-2 mb-1 border border-white/[0.06] rounded-lg p-3 text-[11px] text-white/70 font-mono leading-relaxed resize-none outline-none focus:border-white/[0.12] transition-colors scrollbar-thin"
              placeholder={`Write ${artifactPanelTab === 'result' ? 'execution result' : 'content'} here... (Markdown supported)`}
              spellCheck={false}
            />
            <div className="flex items-center justify-between px-4 py-2">
              <EditorStats text={editDraft} />
              <div className="flex gap-1.5">
                <button
                  onClick={() => setArtifactMode('preview')}
                  className="px-2.5 py-1 rounded-md text-[10px] text-white/30 hover:text-white/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  title="Save (Ctrl+S)"
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

      {/* Footer: Versions + Downstream + Stats (hidden in reading mode) */}
      {!artifactReadingMode && <div className="px-4 py-2 space-y-2 border-t border-white/[0.04]">
        {isSplitView && (
          <div className="flex items-center justify-between">
            <EditorStats text={editDraft} />
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-emerald-500/15 border border-emerald-500/20 text-emerald-400/80 hover:bg-emerald-500/25 transition-colors"
            >
              <Save size={10} />
              Save
            </button>
          </div>
        )}
        <VersionHistory
          versions={versions}
          onRestore={(idx) => restoreArtifactVersion(activeArtifactNodeId, idx)}
        />
        <DownstreamImpact
          downstream={downstream}
          onSync={handleSync}
          isSyncing={isSyncing}
        />
      </div>}
    </motion.div>
  );
}
