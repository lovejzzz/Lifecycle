'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Eye,
  Pencil,
  Save,
  RotateCcw,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
  GitBranch,
  Loader2,
  ArrowRight,
  Maximize2,
  Minimize2,
  Search,
  Replace,
  Bold,
  Italic,
  Code,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Columns2,
  Minus,
  ChevronLeft,
  BookOpen,
  Download,
  FileText,
  FileCode,
  FileType,
  GripVertical,
  GitCompare,
} from 'lucide-react';
import { useLifecycleStore } from '@/store/useStore';
import { getNodeColors, CategoryIcon } from '@/lib/types';
import type { NodeData } from '@/lib/types';
import { renderMarkdown } from '@/lib/markdown';
import { exportAndDownload } from '@/lib/export';
import DiffView from '@/components/DiffView';

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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      className="absolute z-50 flex items-center gap-2 rounded-xl border border-white/10 bg-[#1a1a2e]/95 p-2 shadow-2xl backdrop-blur-xl"
      style={{ left: Math.min(position.x, 280), top: position.y }}
    >
      <Sparkles size={12} className="flex-shrink-0 text-cyan-400/60" />
      <input
        ref={inputRef}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && instruction.trim()) onRewrite(instruction.trim());
          if (e.key === 'Escape') onClose();
        }}
        placeholder="How should CID rewrite this?"
        className="w-[220px] bg-transparent text-[11px] text-white/80 outline-none placeholder:text-white/25"
        disabled={isRewriting}
      />
      {isRewriting ? (
        <Loader2 size={12} className="flex-shrink-0 animate-spin text-cyan-400/60" />
      ) : (
        <button
          onClick={() => instruction.trim() && onRewrite(instruction.trim())}
          className="flex-shrink-0 rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-300/80 transition-colors hover:bg-cyan-500/30"
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
  currentContent,
}: {
  versions: Array<{ content: string; result?: string; timestamp: number; label: string }>;
  onRestore: (index: number) => void;
  currentContent: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [diffIndex, setDiffIndex] = useState<number | null>(null);

  if (versions.length <= 1) return null;

  return (
    <div className="border-t border-white/[0.06] pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 text-[10px] text-white/40 transition-colors hover:text-white/60"
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
            <div className="scrollbar-thin mt-1.5 max-h-[120px] space-y-1 overflow-y-auto">
              {[...versions].reverse().map((v, i) => {
                const realIndex = versions.length - 1 - i;
                const isLatest = realIndex === versions.length - 1;
                const isDiffing = diffIndex === realIndex;
                return (
                  <div
                    key={realIndex}
                    className={`flex w-full items-center justify-between rounded px-2 py-1 text-[10px] transition-colors ${
                      isDiffing
                        ? 'border border-cyan-500/20 bg-cyan-500/[0.08]'
                        : isLatest
                          ? 'bg-white/[0.04] text-white/50'
                          : 'text-white/35 hover:bg-white/[0.06] hover:text-white/60'
                    }`}
                  >
                    <span className="font-mono">{v.label}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-white/20">
                        {new Date(v.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {!isLatest && (
                        <>
                          <button
                            onClick={() => setDiffIndex(isDiffing ? null : realIndex)}
                            className={`rounded p-0.5 transition-colors ${isDiffing ? 'text-cyan-400/70' : 'text-white/20 hover:text-white/50'}`}
                            title="Compare with current"
                          >
                            <GitCompare size={9} />
                          </button>
                          <button
                            onClick={() => onRestore(realIndex)}
                            className="rounded p-0.5 text-white/20 transition-colors hover:text-amber-400/70"
                            title="Restore this version"
                          >
                            <RotateCcw size={9} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Inline diff view */}
            <AnimatePresence>
              {diffIndex !== null && versions[diffIndex] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="mt-2 overflow-hidden"
                >
                  <div className="mb-1 px-1 text-[9px] text-white/30">
                    Comparing <span className="text-cyan-400/60">{versions[diffIndex].label}</span>{' '}
                    → current
                  </div>
                  <DiffView
                    oldText={versions[diffIndex].content}
                    newText={currentContent}
                    onRevert={() => {
                      onRestore(diffIndex);
                      setDiffIndex(null);
                    }}
                    onAccept={() => setDiffIndex(null)}
                    compact
                  />
                </motion.div>
              )}
            </AnimatePresence>
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
          className="flex items-center gap-1.5 text-[10px] text-white/40 transition-colors hover:text-white/60"
        >
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <GitBranch size={10} />
          <span>
            {downstream.length} downstream node{downstream.length > 1 ? 's' : ''}
          </span>
        </button>
        <button
          onClick={onSync}
          disabled={isSyncing}
          className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] transition-colors ${
            isSyncing
              ? 'cursor-wait border-amber-500/10 bg-amber-500/5 text-amber-400/40'
              : 'border-amber-500/20 bg-amber-500/10 text-amber-400/70 hover:bg-amber-500/20'
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
              {downstream.map((n) => {
                const colors = getNodeColors(n.category as NodeData['category']);
                return (
                  <div
                    key={n.id}
                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-white/40"
                  >
                    <span style={{ color: colors.primary }}>
                      <CategoryIcon category={n.category as NodeData['category']} size={10} />
                    </span>
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
  const sep = 'w-px h-3.5 bg-white/[0.06] mx-0.5';

  return (
    <div className="flex items-center gap-0.5 border-b border-white/[0.04] bg-white/[0.02] px-1 py-1">
      <button
        className={btn('bold')}
        onClick={() => flash('bold', () => wrap('**', '**'))}
        title="Bold (Ctrl+B)"
      >
        <Bold size={11} />
      </button>
      <button
        className={btn('italic')}
        onClick={() => flash('italic', () => wrap('*', '*'))}
        title="Italic (Ctrl+I)"
      >
        <Italic size={11} />
      </button>
      <button
        className={btn('code')}
        onClick={() => flash('code', () => wrap('`', '`'))}
        title="Inline Code"
      >
        <Code size={11} />
      </button>
      <div className={sep} />
      <button
        className={btn('h2')}
        onClick={() => flash('h2', () => insertLine('## '))}
        title="Heading"
      >
        <Heading2 size={11} />
      </button>
      <button
        className={btn('ul')}
        onClick={() => flash('ul', () => insertLine('- '))}
        title="Bullet List"
      >
        <List size={11} />
      </button>
      <button
        className={btn('ol')}
        onClick={() => flash('ol', () => insertLine('1. '))}
        title="Numbered List"
      >
        <ListOrdered size={11} />
      </button>
      <button
        className={btn('quote')}
        onClick={() => flash('quote', () => insertLine('> '))}
        title="Blockquote"
      >
        <Quote size={11} />
      </button>
      <div className={sep} />
      <button
        className={btn('codeblock')}
        onClick={() => flash('codeblock', () => wrap('\n```\n', '\n```\n'))}
        title="Code Block"
      >
        <Code size={11} className="text-emerald-400/50" />
      </button>
      <button
        className={btn('hr')}
        onClick={() => flash('hr', () => insertLine('---\n'))}
        title="Horizontal Rule"
      >
        <Minus size={11} />
      </button>
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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      return () => {
        CSS.highlights?.delete('artifact-search');
      };
    }
  }, [query, text, contentRef]);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="space-y-1.5 overflow-hidden border-b border-white/[0.04] bg-white/[0.02] px-3 py-2"
    >
      <div className="flex items-center gap-1.5">
        <Search size={11} className="flex-shrink-0 text-white/30" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setMatchIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              setMatchIdx((i) => (i + 1) % Math.max(1, matches.length));
            }
            if (e.key === 'Enter' && e.shiftKey) {
              e.preventDefault();
              setMatchIdx((i) => (i - 1 + matches.length) % Math.max(1, matches.length));
            }
            // Ctrl/Cmd+G: next match, Shift+Ctrl/Cmd+G: prev match
            if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey) {
              e.preventDefault();
              setMatchIdx((i) => (i + 1) % Math.max(1, matches.length));
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'g' && e.shiftKey) {
              e.preventDefault();
              setMatchIdx((i) => (i - 1 + matches.length) % Math.max(1, matches.length));
            }
          }}
          placeholder="Find... (Enter/Shift+Enter to navigate)"
          className="flex-1 bg-transparent text-[11px] text-white/70 outline-none placeholder:text-white/20"
        />
        <span
          className={`w-14 text-right text-[9px] tabular-nums ${query && matches.length === 0 ? 'text-red-400/60' : 'text-white/30'}`}
        >
          {query
            ? `${matches.length > 0 ? (matchIdx % matches.length) + 1 : 0} of ${matches.length}`
            : ''}
        </span>
        <button
          onClick={() => setShowReplace(!showReplace)}
          className="rounded p-0.5 text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/50"
          title="Toggle Replace"
        >
          <Replace size={11} />
        </button>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/50"
        >
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
            <Replace size={11} className="flex-shrink-0 text-white/30" />
            <input
              value={replaceVal}
              onChange={(e) => setReplaceVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReplaceOne();
              }}
              placeholder="Replace..."
              className="flex-1 bg-transparent text-[11px] text-white/70 outline-none placeholder:text-white/20"
            />
            <button
              onClick={handleReplaceOne}
              className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/40 transition-colors hover:text-white/60"
            >
              One
            </button>
            <button
              onClick={handleReplaceAll}
              className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/40 transition-colors hover:text-white/60"
            >
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
    <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 py-3">
      <div className="mx-auto max-w-[700px]">
        <h1 className="mb-1 text-[14px] font-bold text-white/80">Workflow Output</h1>
        <p className="mb-4 text-[10px] text-white/25">{executedNodes.length} nodes with content</p>
        {executedNodes.map((en, i) => {
          const fullNode = allNodes.find((n) => n.id === en.id);
          if (!fullNode) return null;
          const content = fullNode.data.executionResult || fullNode.data.content || '';
          const isRunning = fullNode.data.executionStatus === 'running';
          const colors = getNodeColors(en.category as NodeData['category']);

          return (
            <div key={en.id} data-node-section={en.id} className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[10px] text-white/20">{i + 1}.</span>
                <span style={{ color: colors.primary }}>
                  <CategoryIcon category={en.category as NodeData['category']} size={11} />
                </span>
                <button
                  onClick={() => onNavigate(en.id)}
                  className="text-[11px] font-semibold text-white/60 transition-colors hover:text-white/90"
                >
                  {en.label}
                </button>
                <span className="text-[9px] text-white/20">{en.category}</span>
              </div>
              {isRunning ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-3 w-3/4 rounded bg-white/[0.04]" />
                  <div className="h-3 w-full rounded bg-white/[0.04]" />
                  <div className="h-3 w-5/6 rounded bg-white/[0.04]" />
                  <div className="mt-2 flex items-center gap-2">
                    <Loader2 size={10} className="animate-spin text-cyan-400/40" />
                    <span className="text-[10px] text-cyan-400/40">Generating content…</span>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] leading-relaxed text-white/55">
                  {content ? (
                    renderMarkdown(content)
                  ) : (
                    <span className="text-white/20 italic">No content yet</span>
                  )}
                </div>
              )}
              {i < executedNodes.length - 1 && <hr className="mt-6 border-white/[0.06]" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Export Dropdown ──────────────────────────────────────────────────────────

function ExportDropdown({ label, content }: { label: string; content: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!content) return null;

  const formats = [
    { key: 'md' as const, label: 'Markdown', icon: FileText },
    { key: 'html' as const, label: 'HTML', icon: FileCode },
    { key: 'txt' as const, label: 'Plain Text', icon: FileType },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded-lg p-1.5 transition-colors hover:bg-white/[0.06] ${open ? 'text-cyan-400/60' : 'text-white/30 hover:text-white/60'}`}
        title="Export artifact"
      >
        <Download size={12} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute top-full right-0 z-50 mt-1 min-w-[140px] rounded-lg border border-white/10 bg-[#1a1a2e]/95 py-1 shadow-2xl backdrop-blur-xl"
          >
            {formats.map(({ key, label: fmtLabel, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  exportAndDownload(content, key, label);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[10px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/80"
              >
                <Icon size={11} className="text-white/30" />
                {fmtLabel}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Artifact Panel ─────────────────────────────────────────────────────

export default function ArtifactPanel() {
  const {
    nodes,
    edges: _edges,
    activeArtifactNodeId,
    artifactPanelTab,
    artifactPanelMode,
    artifactVersions,
    closeArtifactPanel,
    setArtifactTab,
    setArtifactMode,
    saveArtifactVersion,
    restoreArtifactVersion,
    rewriteArtifactSelection,
    getDownstreamNodes,
    updateNodeData,
    updateNodeStatus,
    executeNode,
    addEvent,
    pushHistory,
    selectNode,
    artifactReadingMode,
    setArtifactReadingMode,
    getExecutedNodesInOrder,
    openArtifactPanel,
  } = useLifecycleStore();

  const node = nodes.find((n) => n.id === activeArtifactNodeId);
  const [editDraft, setEditDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isSplitView, setIsSplitView] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [panelWidth, setPanelWidth] = useState(500);
  const [isDirty, setIsDirty] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isResizingRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync edit draft when source content, node, tab, or mode changes
  const currentText = node
    ? artifactPanelTab === 'result'
      ? node.data.executionResult || ''
      : node.data.content || ''
    : '';
  const prevSyncKeyRef = useRef('');
  useEffect(() => {
    const syncKey = `${activeArtifactNodeId}:${artifactPanelTab}:${artifactPanelMode}:${currentText}`;
    if (syncKey !== prevSyncKeyRef.current) {
      prevSyncKeyRef.current = syncKey;
      if (editDraft !== currentText) setEditDraft(currentText);
    }
  }, [activeArtifactNodeId, artifactPanelTab, artifactPanelMode, currentText, editDraft]);

  // Track dirty state: draft differs from saved content
  useEffect(() => {
    const isEditing = artifactPanelMode === 'edit' || isSplitView;
    setIsDirty(isEditing && editDraft !== currentText);
  }, [editDraft, currentText, artifactPanelMode, isSplitView]);

  // Auto-save after 30s of inactivity when dirty
  useEffect(() => {
    if (!isDirty) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveRef.current?.();
    }, 30000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [isDirty, editDraft]);

  // Resize handler
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      const startX = e.clientX;
      const startWidth = panelWidth;
      const onMove = (me: MouseEvent) => {
        if (!isResizingRef.current) return;
        const delta = startX - me.clientX;
        setPanelWidth(Math.min(Math.max(startWidth + delta, 350), window.innerWidth * 0.8));
      };
      const onUp = () => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [panelWidth],
  );

  // Ref to allow save shortcut to call handleSave without stale closure
  const saveRef = useRef<(() => void) | null>(null);
  // Navigate ref for keyboard shortcuts (must be before early return)
  const navigateRef = useRef<((dir: 'prev' | 'next') => void) | null>(null);

  // Keyboard shortcuts: Ctrl+F (find), Ctrl+B/I (format), Ctrl+S (save), Escape (close fullscreen)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!activeArtifactNodeId) return;
      const isInPanel = panelRef.current?.contains(
        document.activeElement as globalThis.Node | null,
      );

      // Ctrl/Cmd+F: Toggle find/replace (when focused in panel)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && isInPanel) {
        e.preventDefault();
        setShowFindReplace((v) => !v);
      }
      // Ctrl/Cmd+S: Save (in edit or split mode, when panel is focused)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === 's' &&
        isInPanel &&
        (artifactPanelMode === 'edit' || isSplitView)
      ) {
        e.preventDefault();
        saveRef.current?.();
      }
      // Escape: close fullscreen first, then find, then panel
      if (e.key === 'Escape') {
        if (showFindReplace) {
          setShowFindReplace(false);
          return;
        }
        if (isFullScreen) {
          setIsFullScreen(false);
          return;
        }
      }
      // Ctrl+B: Bold (in edit mode)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === 'b' &&
        artifactPanelMode === 'edit' &&
        textareaRef.current === document.activeElement
      ) {
        e.preventDefault();
        const ta = textareaRef.current!;
        const s = ta.selectionStart,
          end = ta.selectionEnd;
        const sel = editDraft.slice(s, end);
        const newText =
          editDraft.slice(0, s) + '**' + (sel || 'bold') + '**' + editDraft.slice(end);
        setEditDraft(newText);
      }
      // Ctrl+I: Italic (in edit mode)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === 'i' &&
        artifactPanelMode === 'edit' &&
        textareaRef.current === document.activeElement
      ) {
        e.preventDefault();
        const ta = textareaRef.current!;
        const s = ta.selectionStart,
          end = ta.selectionEnd;
        const sel = editDraft.slice(s, end);
        const newText =
          editDraft.slice(0, s) + '*' + (sel || 'italic') + '*' + editDraft.slice(end);
        setEditDraft(newText);
      }
      // Ctrl+]/[: Next/Previous node
      if ((e.metaKey || e.ctrlKey) && e.key === ']' && isInPanel) {
        e.preventDefault();
        navigateRef.current?.('next');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '[' && isInPanel) {
        e.preventDefault();
        navigateRef.current?.('prev');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    activeArtifactNodeId,
    showFindReplace,
    isFullScreen,
    artifactPanelMode,
    isSplitView,
    editDraft,
  ]);

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
  const activeText =
    artifactPanelTab === 'result' ? node.data.executionResult || '' : node.data.content || '';
  const versions = artifactVersions[activeArtifactNodeId] || [];
  const downstream = getDownstreamNodes(activeArtifactNodeId);

  // Navigation: prev/next through executed nodes in topo order
  const executedNodes = getExecutedNodesInOrder();
  const currentIdx = executedNodes.findIndex((n) => n.id === activeArtifactNodeId);
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
    setIsDirty(false);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    // In split view, stay in edit mode — both panes are always visible
    if (!isSplitView) setArtifactMode('preview');
    // Note: staleness propagation is handled by updateNodeData via classifyEdit —
    // no need to manually mark downstream nodes stale here (was causing double cascade)
  };

  // Keep save ref current for keyboard shortcut
  saveRef.current = handleSave; // eslint-disable-line react-hooks/immutability

  navigateRef.current = (dir) => {
    const idx = dir === 'next' ? currentIdx + 1 : currentIdx - 1;
    if (idx >= 0 && idx < executedNodes.length) navigateTo(idx);
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
    const immediateDown = downstream.filter((d) => {
      const store = useLifecycleStore.getState();
      return store.edges.some((e) => e.source === activeArtifactNodeId && e.target === d.id);
    });
    for (const d of immediateDown) {
      try {
        await executeNode(d.id);
      } catch {
        /* node execution handles its own errors */
      }
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
      className={`fixed z-[45] flex flex-col border-l border-white/[0.06] bg-[#0c0c14]/95 backdrop-blur-xl ${
        isFullScreen ? 'inset-0 w-full border-l-0' : 'top-0 right-0 bottom-0'
      }`}
      style={isFullScreen ? undefined : { width: panelWidth }}
    >
      {/* Resize Handle */}
      {!isFullScreen && (
        <div
          onMouseDown={startResize}
          className="group absolute top-0 bottom-0 left-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-cyan-500/20 active:bg-cyan-500/30"
        >
          <div className="absolute top-1/2 left-0 -translate-y-1/2 text-white/20 opacity-0 transition-opacity group-hover:opacity-100">
            <GripVertical size={10} />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span style={{ color: colors.primary }}>
            <CategoryIcon category={node.data.category} size={14} />
          </span>
          <div className="min-w-0">
            <button
              onClick={() => {
                selectNode(activeArtifactNodeId);
              }}
              className="block truncate text-[12px] font-semibold text-white/90 transition-colors hover:text-white"
            >
              {node.data.label}
            </button>
            {node.data.description && (
              <div className="truncate text-[9.5px] text-white/45">{node.data.description}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Prev/Next Navigation */}
          {executedNodes.length > 1 && !artifactReadingMode && (
            <div className="mr-1 flex items-center gap-0.5">
              <button
                onClick={() => navigateTo(currentIdx - 1)}
                disabled={!hasPrev}
                className="rounded-lg p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60 disabled:cursor-default disabled:opacity-20"
                title="Previous node"
              >
                <ChevronLeft size={12} />
              </button>
              <span className="min-w-[28px] text-center text-[9px] text-white/40 tabular-nums">
                {currentIdx + 1}/{executedNodes.length}
              </span>
              <button
                onClick={() => navigateTo(currentIdx + 1)}
                disabled={!hasNext}
                className="rounded-lg p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60 disabled:cursor-default disabled:opacity-20"
                title="Next node"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          )}
          {/* Reading Mode */}
          <button
            onClick={() => setArtifactReadingMode(!artifactReadingMode)}
            className={`rounded-lg p-1.5 transition-colors hover:bg-white/[0.06] ${artifactReadingMode ? 'text-cyan-400/60' : 'text-white/30 hover:text-white/60'}`}
            title={
              artifactReadingMode ? 'Exit Reading Mode' : 'Reading Mode — all nodes as document'
            }
          >
            <BookOpen size={12} />
          </button>
          {/* Find */}
          <button
            onClick={() => setShowFindReplace((v) => !v)}
            className={`rounded-lg p-1.5 transition-colors hover:bg-white/[0.06] ${showFindReplace ? 'text-cyan-400/60' : 'text-white/30 hover:text-white/60'}`}
            title="Find & Replace (⌘F)"
          >
            <Search size={12} />
          </button>
          {/* Split View */}
          {!artifactReadingMode && (
            <button
              onClick={() => {
                setIsSplitView((v) => !v);
                if (!isSplitView) setArtifactMode('edit');
              }}
              className={`rounded-lg p-1.5 transition-colors hover:bg-white/[0.06] ${isSplitView ? 'text-cyan-400/60' : 'text-white/30 hover:text-white/60'}`}
              title="Split View"
            >
              <Columns2 size={12} />
            </button>
          )}
          {/* Export */}
          <ExportDropdown label={node.data.label} content={activeText} />
          {/* Copy */}
          <button
            onClick={handleCopy}
            className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
            title="Copy"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>
          {/* Full Screen */}
          <button
            onClick={() => setIsFullScreen((v) => !v)}
            className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
            title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
          >
            {isFullScreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          {/* Close */}
          <button
            onClick={closeArtifactPanel}
            className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tab Bar + Mode Toggle (hidden in reading mode) */}
      {!artifactReadingMode && (
        <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-2">
          <div className="flex gap-1">
            <button
              onClick={() => setArtifactTab('content')}
              className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
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
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  artifactPanelTab === 'result'
                    ? 'bg-white/[0.08] text-white/80'
                    : 'text-white/30 hover:text-white/50'
                }`}
              >
                Execution Result
              </button>
            )}
          </div>
          {/* Dirty indicator */}
          {isDirty && (
            <div className="flex items-center gap-1 text-[9px] text-amber-400/60">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400/60" />
              Unsaved
            </div>
          )}
          {/* Hide mode toggle when in split view — both show simultaneously */}
          {!isSplitView && (
            <div className="flex gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
              <button
                onClick={() => setArtifactMode('preview')}
                className={`rounded-md p-1 transition-colors ${
                  artifactPanelMode === 'preview'
                    ? 'bg-white/[0.1] text-white/70'
                    : 'text-white/25 hover:text-white/50'
                }`}
              >
                <Eye size={12} />
              </button>
              <button
                onClick={() => setArtifactMode('edit')}
                className={`rounded-md p-1 transition-colors ${
                  artifactPanelMode === 'edit'
                    ? 'bg-white/[0.1] text-white/70'
                    : 'text-white/25 hover:text-white/50'
                }`}
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
        </div>
      )}

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
      <div
        className={`relative flex-1 overflow-hidden ${isSplitView && !artifactReadingMode ? 'flex' : 'flex flex-col'}`}
      >
        {artifactReadingMode ? (
          <ReadingModeContent
            nodes={nodes}
            executedNodes={executedNodes}
            activeNodeId={activeArtifactNodeId}
            onNavigate={(id) => {
              setArtifactReadingMode(false);
              openArtifactPanel(id);
            }}
          />
        ) : isSplitView ? (
          <>
            {/* Split: Editor Left */}
            <div className="flex flex-1 flex-col overflow-hidden border-r border-white/[0.06]">
              <MarkdownToolbar textareaRef={textareaRef} onInsert={setEditDraft} />
              <textarea
                ref={textareaRef}
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                className="scrollbar-thin flex-1 resize-none bg-black/20 p-3 font-mono text-[11px] leading-relaxed text-white/70 outline-none"
                placeholder={`Write ${artifactPanelTab === 'result' ? 'execution result' : 'content'} here... (Markdown supported)`}
                spellCheck={false}
              />
            </div>
            {/* Split: Preview Right */}
            <div className="flex-1 overflow-y-auto px-4 py-3" ref={contentRef}>
              <div
                className="text-[11px] leading-relaxed text-white/60 select-text"
                onMouseUp={handleMouseUp}
              >
                {editDraft ? (
                  renderMarkdown(editDraft)
                ) : (
                  <div className="mt-12 text-center text-white/20 italic">
                    Preview will appear here
                  </div>
                )}
              </div>
            </div>
          </>
        ) : artifactPanelMode === 'preview' ? (
          <div className="flex-1 overflow-y-auto px-4 py-3" ref={contentRef}>
            <div
              className="text-[11px] leading-relaxed text-white/60 select-text"
              onMouseUp={handleMouseUp}
            >
              {activeText ? (
                renderMarkdown(activeText)
              ) : (
                <div className="mt-12 text-center text-white/20 italic">
                  No {artifactPanelTab === 'result' ? 'execution result' : 'content'} yet.
                  {artifactPanelTab === 'content' && (
                    <button
                      onClick={() => setArtifactMode('edit')}
                      className="mx-auto mt-2 block text-cyan-400/50 transition-colors hover:text-cyan-400/80"
                    >
                      Start writing
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <MarkdownToolbar textareaRef={textareaRef} onInsert={setEditDraft} />
            <textarea
              ref={textareaRef}
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              className="scrollbar-thin mx-4 mt-2 mb-1 flex-1 resize-none rounded-lg border border-white/[0.06] bg-black/20 p-3 font-mono text-[11px] leading-relaxed text-white/70 transition-colors outline-none focus:border-white/[0.12]"
              placeholder={`Write ${artifactPanelTab === 'result' ? 'execution result' : 'content'} here... (Markdown supported)`}
              spellCheck={false}
            />
            <div className="flex items-center justify-between px-4 py-2">
              <EditorStats text={editDraft} />
              <div className="flex gap-1.5">
                <button
                  onClick={() => setArtifactMode('preview')}
                  className="rounded-md px-2.5 py-1 text-[10px] text-white/30 transition-colors hover:text-white/50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  title="Save (Ctrl+S)"
                  className="flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-medium text-emerald-400/80 transition-colors hover:bg-emerald-500/25"
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
      {!artifactReadingMode && (
        <div className="space-y-2 border-t border-white/[0.04] px-4 py-2">
          {isSplitView && (
            <div className="flex items-center justify-between">
              <EditorStats text={editDraft} />
              <button
                onClick={handleSave}
                className="flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-medium text-emerald-400/80 transition-colors hover:bg-emerald-500/25"
              >
                <Save size={10} />
                Save
              </button>
            </div>
          )}
          <VersionHistory
            versions={versions}
            onRestore={(idx) => restoreArtifactVersion(activeArtifactNodeId, idx)}
            currentContent={activeText}
          />
          <DownstreamImpact downstream={downstream} onSync={handleSync} isSyncing={isSyncing} />
        </div>
      )}
    </motion.div>
  );
}
