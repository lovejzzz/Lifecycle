'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Layers,
  Circle,
  Plus,
  Undo2,
  Redo2,
  Search,
  Download,
  Upload,
  Heart,
  FilePlus2,
  Play,
  LayoutGrid,
  ChevronDown,
  Trash2,
  Pencil,
  Check,
  FolderOpen,
  Zap,
} from 'lucide-react';
import { useLifecycleStore } from '@/store/useStore';
import type { NodeCategory } from '@/lib/types';
import { getNodeColors, getCategoryIcon } from '@/lib/types';
import { getAgent } from '@/lib/agents';

const BUILT_IN_TYPES: { category: NodeCategory; label: string }[] = [
  { category: 'input', label: 'Input' },
  { category: 'process', label: 'Process' },
  { category: 'deliverable', label: 'Deliverable' },
  { category: 'review', label: 'Review' },
  { category: 'note', label: 'Note' },
];

export default function TopBar() {
  const {
    nodes,
    toggleCIDPanel,
    togglePreviewPanel,
    showCIDPanel,
    showPreviewPanel,
    createNewNode,
    undo,
    redo,
    history,
    future,
    cidMode,
    exportWorkflow,
    importWorkflow,
    newProject,
    messages,
    getHealthScore,
    showImpactPreview,
    currentProjectName,
    renameCurrentProject,
    switchProject,
    deleteCurrentProject,
    listProjects,
    currentProjectId,
    _usageStats,
  } = useLifecycleStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addMenuIndex, setAddMenuIndex] = useState(-1);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [projectMenuIndex, setProjectMenuIndex] = useState(-1);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const lastSeenCount = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use 'rowan' default until mounted to prevent hydration mismatch (cidMode comes from localStorage)
  const agent = getAgent(mounted ? cidMode : 'rowan');
  // Platform-aware modifier key for tooltips (use stable default until mounted to avoid hydration mismatch)
  const mod =
    mounted && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
      ? '⌘'
      : 'Ctrl+';

  // Track seen message count when panel is open
  useEffect(() => {
    if (showCIDPanel) lastSeenCount.current = messages.length;
  }, [showCIDPanel, messages.length]);

  // Derive hasUnread from ref — acceptable ref read since it's only updated in effects above
  // eslint-disable-next-line react-hooks/refs -- lastSeenCount is effect-synchronized, safe to read
  const hasUnread = !showCIDPanel && messages.length > lastSeenCount.current;

  // Auto-save indicator — show "Saved" briefly after each save
  const lastSavedAt = useLifecycleStore((s) => s.lastSavedAt);
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (lastSavedAt === 0) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 1500);
    return () => clearTimeout(t);
  }, [lastSavedAt]);

  const activeCount = nodes.filter((n) => n.data.status === 'active').length;
  const staleCount = nodes.filter((n) => n.data.status === 'stale').length;
  const reviewCount = nodes.filter((n) => n.data.status === 'reviewing').length;

  const healthScore = getHealthScore();

  // Discover custom categories from existing nodes
  const allNodeTypes = useMemo(() => {
    const builtInSet = new Set(BUILT_IN_TYPES.map((t) => t.category));
    const customCategories = Array.from(
      new Set(nodes.map((n) => n.data.category).filter((c) => !builtInSet.has(c))),
    );
    return [
      ...BUILT_IN_TYPES,
      ...customCategories.map((cat) => ({
        category: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
      })),
    ];
  }, [nodes]);

  useEffect(() => {
    if (!showAddMenu && !showProjectMenu) return;
    const handler = (e: MouseEvent) => {
      if (showAddMenu && menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setShowAddMenu(false);
      }
      if (
        showProjectMenu &&
        projectMenuRef.current &&
        !projectMenuRef.current.contains(e.target as HTMLElement)
      ) {
        setShowProjectMenu(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showAddMenu, showProjectMenu]);

  return (
    <div className="relative z-50 flex h-12 items-center justify-between border-b border-white/[0.06] bg-[#0a0a0f]/90 px-3 backdrop-blur-xl md:px-5">
      {/* Left */}
      <div className="flex min-w-0 items-center gap-2 md:gap-4">
        <button
          className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-80"
          onClick={() => {
            if (
              nodes.length === 0 ||
              window.confirm(
                'Start a new project? Unsaved changes to the current project will be preserved.',
              )
            ) {
              newProject();
            }
          }}
          title="New project"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20">
            <Layers size={14} className="text-emerald-400" />
          </div>
          <span className="hidden text-sm font-semibold tracking-tight text-white/90 sm:inline">
            Lifecycle
          </span>
        </button>
        <div className="h-4 w-px bg-white/[0.08]" />

        {/* Project Switcher */}
        <div className="relative" ref={projectMenuRef}>
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (nameDraft.trim()) renameCurrentProject(nameDraft.trim());
                setEditingName(false);
              }}
              className="flex items-center gap-1"
            >
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  if (nameDraft.trim()) renameCurrentProject(nameDraft.trim());
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditingName(false);
                }}
                className="w-[120px] rounded border border-white/[0.12] bg-white/[0.06] px-2 py-1 text-[11px] text-white/80 outline-none"
              />
              <button type="submit" className="p-0.5 text-emerald-400/60 hover:text-emerald-400">
                <Check size={11} />
              </button>
            </form>
          ) : (
            <button
              onClick={() => {
                setShowProjectMenu(!showProjectMenu);
                setProjectMenuIndex(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && !showProjectMenu) {
                  e.preventDefault();
                  setShowProjectMenu(true);
                  setProjectMenuIndex(0);
                }
              }}
              className="flex max-w-[180px] items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-white/65 transition-colors hover:bg-white/[0.07] hover:text-white/80"
            >
              <FolderOpen size={11} className="shrink-0" />
              <span className="truncate">{mounted ? currentProjectName : 'Untitled'}</span>
              <ChevronDown size={10} className="shrink-0 text-white/25" />
            </button>
          )}
          {showProjectMenu &&
            (() => {
              const projects = listProjects().sort((a, b) => b.lastModified - a.lastModified);
              const canDelete = projects.length > 1;
              const totalItems = projects.length + 2 + (canDelete ? 1 : 0); // projects + new + rename + (delete?)
              const projectActions = [
                {
                  key: '_new',
                  action: () => {
                    newProject();
                    setShowProjectMenu(false);
                  },
                },
                {
                  key: '_rename',
                  action: () => {
                    setNameDraft(currentProjectName);
                    setEditingName(true);
                    setShowProjectMenu(false);
                  },
                },
                ...(canDelete
                  ? [
                      {
                        key: '_delete',
                        action: () => {
                          if (
                            window.confirm(`Delete "${currentProjectName}"? This cannot be undone.`)
                          ) {
                            deleteCurrentProject();
                            setShowProjectMenu(false);
                          }
                        },
                      },
                    ]
                  : []),
              ];
              const handleProjectKey = (e: React.KeyboardEvent) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setProjectMenuIndex((i) => Math.min(i + 1, totalItems - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setProjectMenuIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter' && projectMenuIndex >= 0) {
                  e.preventDefault();
                  if (projectMenuIndex < projects.length) {
                    const p = projects[projectMenuIndex];
                    if (p.id !== currentProjectId) switchProject(p.id);
                    setShowProjectMenu(false);
                  } else {
                    projectActions[projectMenuIndex - projects.length]?.action();
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowProjectMenu(false);
                }
              };
              return (
                <div
                  className="absolute top-full left-0 z-50 mt-1 min-w-[220px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0e0e18]/95 shadow-2xl backdrop-blur-xl"
                  tabIndex={-1}
                  ref={(el) => {
                    if (el && projectMenuIndex >= 0) el.focus();
                  }}
                  onKeyDown={handleProjectKey}
                >
                  <div className="py-1">
                    {projects.map((p, idx) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (p.id !== currentProjectId) switchProject(p.id);
                          setShowProjectMenu(false);
                        }}
                        onMouseEnter={() => setProjectMenuIndex(idx)}
                        className={`flex w-full items-center justify-between px-3 py-1.5 text-[11px] transition-colors ${
                          idx === projectMenuIndex
                            ? 'bg-white/[0.07] text-white/90'
                            : p.id === currentProjectId
                              ? 'bg-white/[0.06] text-white/80'
                              : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{p.name}</span>
                        </div>
                        <span className="ml-2 shrink-0 text-[10px] text-white/35">
                          {p.nodeCount}n
                        </span>
                      </button>
                    ))}
                    <div className="mt-1 border-t border-white/[0.06] pt-1">
                      <button
                        onClick={() => {
                          newProject();
                          setShowProjectMenu(false);
                        }}
                        onMouseEnter={() => setProjectMenuIndex(projects.length)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${
                          projectMenuIndex === projects.length
                            ? 'bg-white/[0.07] text-emerald-400'
                            : 'text-emerald-400/60 hover:bg-white/[0.04] hover:text-emerald-400'
                        }`}
                      >
                        <FilePlus2 size={11} />
                        New Project
                      </button>
                      <button
                        onClick={() => {
                          setNameDraft(currentProjectName);
                          setEditingName(true);
                          setShowProjectMenu(false);
                        }}
                        onMouseEnter={() => setProjectMenuIndex(projects.length + 1)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${
                          projectMenuIndex === projects.length + 1
                            ? 'bg-white/[0.07] text-white/60'
                            : 'text-white/30 hover:bg-white/[0.04] hover:text-white/60'
                        }`}
                      >
                        <Pencil size={11} />
                        Rename
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete "${currentProjectName}"? This cannot be undone.`,
                              )
                            ) {
                              deleteCurrentProject();
                              setShowProjectMenu(false);
                            }
                          }}
                          onMouseEnter={() => setProjectMenuIndex(projects.length + 2)}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${
                            projectMenuIndex === projects.length + 2
                              ? 'bg-rose-500/[0.08] text-rose-400/80'
                              : 'text-rose-400/40 hover:bg-rose-500/[0.06] hover:text-rose-400/80'
                          }`}
                        >
                          <Trash2 size={11} />
                          Delete Project
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
        </div>

        {/* Add Node */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => {
              setShowAddMenu(!showAddMenu);
              setAddMenuIndex(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && !showAddMenu) {
                e.preventDefault();
                setShowAddMenu(true);
                setAddMenuIndex(0);
              }
            }}
            title="Add a new node (or double-click canvas)"
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            <Plus size={12} />
            Add Node
          </button>
          {showAddMenu && (
            <div
              className="absolute top-full left-0 z-50 mt-1 min-w-[170px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0e0e18]/95 shadow-2xl backdrop-blur-xl"
              tabIndex={-1}
              ref={(el) => {
                if (el && addMenuIndex >= 0) el.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setAddMenuIndex((i) => Math.min(i + 1, allNodeTypes.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setAddMenuIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter' && addMenuIndex >= 0) {
                  e.preventDefault();
                  createNewNode(allNodeTypes[addMenuIndex].category);
                  setShowAddMenu(false);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowAddMenu(false);
                }
              }}
            >
              <div className="py-1">
                {allNodeTypes.map(({ category, label }, idx) => {
                  const Icon = getCategoryIcon(category);
                  const colors = getNodeColors(category);
                  const count = nodes.filter((n) => n.data.category === category).length;
                  return (
                    <button
                      key={category}
                      onClick={() => {
                        createNewNode(category);
                        setShowAddMenu(false);
                      }}
                      onMouseEnter={() => setAddMenuIndex(idx)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-[11px] transition-colors ${
                        idx === addMenuIndex
                          ? 'bg-white/[0.07] text-white/90'
                          : 'text-white/60 hover:bg-white/[0.05] hover:text-white/90'
                      }`}
                    >
                      <Icon size={12} style={{ color: colors.primary }} />
                      <span>{label}</span>
                      {count > 0 && (
                        <span className="ml-auto font-mono text-[10px] text-white/35">{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Undo/Redo */}
        <div
          className="hidden items-center gap-1 sm:flex"
          role="toolbar"
          aria-label="Undo and redo"
        >
          <button
            onClick={undo}
            disabled={history.length === 0}
            title={`Undo (${mod}Z)`}
            aria-label={`Undo (${mod}Z)`}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/5 hover:text-white/60 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-white/30"
          >
            <Undo2 size={13} />
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            title={`Redo (${mod}⇧Z)`}
            aria-label={`Redo (${mod}⇧Z)`}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/5 hover:text-white/60 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-white/30"
          >
            <Redo2 size={13} />
          </button>
        </div>

        {/* Export/Import */}
        {mounted && nodes.length > 0 && (
          <div className="hidden items-center gap-1 md:flex">
            <button
              onClick={() => {
                const json = exportWorkflow();
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `lifecycle-workflow-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
              title={`Export workflow (${mod}E)`}
              aria-label={`Export workflow (${mod}E)`}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
            >
              <Download size={13} />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import workflow from JSON"
              aria-label="Import workflow from JSON"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
            >
              <Upload size={13} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const text = ev.target?.result;
                  if (typeof text === 'string') {
                    const ok = importWorkflow(text);
                    if (!ok)
                      alert(
                        'Invalid workflow file. The file may be corrupted or in an unsupported format.',
                      );
                  }
                };
                reader.readAsText(file);
                e.target.value = '';
              }}
            />
          </div>
        )}
      </div>

      {/* Center - Stats */}
      <div className="hidden items-center gap-4 sm:flex">
        {mounted && nodes.length > 0 ? (
          <>
            <div
              className="flex items-center gap-1.5 text-[10px]"
              title={`${activeCount} active nodes`}
            >
              <Circle size={6} fill="#22c55e" className="text-emerald-500" />
              <span className="text-white/50">
                {activeCount} <span className="hidden md:inline">active</span>
              </span>
            </div>
            {staleCount > 0 && (
              <button
                onClick={showImpactPreview}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-[10px] transition-colors hover:bg-amber-500/10"
                title={`${staleCount} stale nodes — click to preview impact`}
              >
                <Circle size={6} fill="#f59e0b" className="text-amber-500" />
                <span className="text-amber-400/60">
                  {staleCount} <span className="hidden md:inline">stale</span>
                </span>
              </button>
            )}
            {reviewCount > 0 && (
              <div
                className="flex items-center gap-1.5 text-[10px]"
                title={`${reviewCount} reviewing`}
              >
                <Circle size={6} fill="#f43f5e" className="text-rose-500" />
                <span className="text-rose-400/60">
                  {reviewCount} <span className="hidden md:inline">reviewing</span>
                </span>
              </div>
            )}
            <div
              className="hidden items-center gap-1.5 text-[10px] lg:flex"
              title={`${nodes.length} total nodes`}
            >
              <span className="text-white/35">{nodes.length} nodes</span>
            </div>
            <div
              className="flex items-center gap-1.5 text-[10px]"
              title={`Graph health: ${healthScore}%`}
            >
              <Heart
                size={8}
                className={
                  healthScore >= 80
                    ? 'text-emerald-400'
                    : healthScore >= 50
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }
                fill={healthScore >= 80 ? '#22c55e' : healthScore >= 50 ? '#f59e0b' : '#f43f5e'}
              />
              <span
                className={
                  healthScore >= 80
                    ? 'text-emerald-400/60'
                    : healthScore >= 50
                      ? 'text-amber-400/60'
                      : 'text-rose-400/60'
                }
              >
                {healthScore}%
              </span>
            </div>
            {_usageStats.totalCalls > 0 && (
              <div
                className="hidden items-center gap-1.5 text-[10px] lg:flex"
                title={`API: ${_usageStats.totalCalls} calls (${_usageStats.cachedSkips} cached) · ${_usageStats.totalInputTokens + _usageStats.totalOutputTokens} tokens`}
              >
                <Zap size={8} className="text-indigo-400" />
                <span className="text-indigo-400/60">
                  {_usageStats.totalCalls}
                  {_usageStats.cachedSkips > 0 && (
                    <span className="text-emerald-400/50"> ({_usageStats.cachedSkips}✓)</span>
                  )}
                </span>
              </div>
            )}
            <AnimatePresence>
              {showSaved && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-1 text-[10px] text-emerald-400/50"
                >
                  <Check size={8} />
                  <span>Saved</span>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <span className="text-[11px] text-white/40">{agent.topBarHint}</span>
        )}
      </div>

      {/* Right - Toggles */}
      <div className="flex items-center gap-2">
        {mounted && nodes.length > 0 && (
          <>
            <button
              onClick={togglePreviewPanel}
              title="Preview panel"
              aria-label="Preview panel"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
                showPreviewPanel
                  ? 'border border-violet-500/20 bg-violet-500/10 text-violet-400'
                  : 'border border-white/[0.06] bg-white/[0.04] text-white/40 hover:text-white/60'
              }`}
            >
              <Play size={12} />
              <span className="hidden sm:inline">Preview</span>
            </button>
          </>
        )}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('lifecycle:open-template-browser'))}
          title={`Browse templates (${mod}T)`}
          aria-label={`Browse templates (${mod}T)`}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/40 transition-all hover:text-white/60"
        >
          <LayoutGrid size={12} />
          <span className="hidden sm:inline">Templates</span>
        </button>
        <button
          onClick={toggleCIDPanel}
          title={`${agent.name} (${mod}K)`}
          aria-label={`${agent.name} (${mod}K)`}
          className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
            showCIDPanel
              ? agent.accent === 'amber'
                ? 'border border-amber-500/20 bg-amber-500/10 text-amber-400'
                : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border border-white/[0.06] bg-white/[0.04] text-white/40 hover:text-white/60'
          }`}
        >
          {hasUnread && (
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
          )}
          {agent.accent === 'amber' ? <Search size={12} /> : <Bot size={12} />}
          {agent.name}
        </button>
      </div>
    </div>
  );
}
