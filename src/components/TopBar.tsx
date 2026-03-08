'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bot, Activity, Layers, Circle, Plus, Undo2, Redo2, Search,
  Download, Upload, Heart, FilePlus2, Play,
} from 'lucide-react';
import { useLifecycleStore } from '@/store/useStore';
import type { NodeCategory } from '@/lib/types';
import { getNodeColors, getCategoryIcon } from '@/lib/types';
import { getAgent } from '@/lib/agents';

const BUILT_IN_TYPES: { category: NodeCategory; label: string }[] = [
  { category: 'input', label: 'Input' },
  { category: 'trigger', label: 'Trigger' },
  { category: 'state', label: 'State' },
  { category: 'artifact', label: 'Artifact' },
  { category: 'note', label: 'Note' },
  { category: 'cid', label: 'CID Action' },
  { category: 'action', label: 'Action' },
  { category: 'review', label: 'Review' },
  { category: 'test', label: 'Test' },
  { category: 'policy', label: 'Policy' },
  { category: 'patch', label: 'Patch' },
  { category: 'dependency', label: 'Dependency' },
  { category: 'output', label: 'Output' },
];

export default function TopBar() {
  const { nodes, toggleCIDPanel, toggleActivityPanel, togglePreviewPanel, showCIDPanel, showActivityPanel, showPreviewPanel, createNewNode, undo, redo, history, future, cidMode, exportWorkflow, importWorkflow, newProject, messages, getHealthScore } = useLifecycleStore();
  const agent = getAgent(cidMode);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastSeenCount = useRef(0);

  useEffect(() => { setMounted(true); }, []);

  // Track seen message count when panel is open
  useEffect(() => {
    if (showCIDPanel) lastSeenCount.current = messages.length;
  }, [showCIDPanel, messages.length]);

  // Derive hasUnread from ref — acceptable ref read since it's only updated in effects above
  // eslint-disable-next-line react-hooks/refs -- lastSeenCount is effect-synchronized, safe to read
  const hasUnread = !showCIDPanel && messages.length > lastSeenCount.current;

  const activeCount = nodes.filter((n) => n.data.status === 'active').length;
  const staleCount = nodes.filter((n) => n.data.status === 'stale').length;
  const reviewCount = nodes.filter((n) => n.data.status === 'reviewing').length;

  const healthScore = getHealthScore();

  // Discover custom categories from existing nodes
  const allNodeTypes = useMemo(() => {
    const builtInSet = new Set(BUILT_IN_TYPES.map((t) => t.category));
    const customCategories = Array.from(new Set(
      nodes.map((n) => n.data.category).filter((c) => !builtInSet.has(c))
    ));
    return [
      ...BUILT_IN_TYPES,
      ...customCategories.map((cat) => ({
        category: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
      })),
    ];
  }, [nodes]);

  useEffect(() => {
    if (!showAddMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setShowAddMenu(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showAddMenu]);

  return (
    <div className="h-12 border-b border-white/[0.06] bg-[#0a0a0f]/90 backdrop-blur-xl flex items-center justify-between px-5 z-30 relative">
      {/* Left */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center border border-emerald-500/20">
            <Layers size={14} className="text-emerald-400" />
          </div>
          <span className="text-sm font-semibold text-white/90 tracking-tight">Lifecycle Agent</span>
        </div>
        <div className="h-4 w-px bg-white/[0.08]" />

        {/* New Project */}
        <button
          onClick={() => {
            if (nodes.length > 0 && !window.confirm('Start a new project? Current workflow will be cleared.')) return;
            newProject();
          }}
          title="New project"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/40 text-[11px] font-medium hover:text-white/70 hover:bg-white/[0.07] transition-colors"
        >
          <FilePlus2 size={12} />
          New
        </button>

        {/* Add Node */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/20 transition-colors"
          >
            <Plus size={12} />
            Add Node
          </button>
          {showAddMenu && (
            <div className="absolute top-full left-0 mt-1 min-w-[170px] rounded-xl border border-white/[0.08] bg-[#0e0e18]/95 backdrop-blur-xl overflow-hidden shadow-2xl z-50">
              <div className="py-1">
                {allNodeTypes.map(({ category, label }) => {
                  const Icon = getCategoryIcon(category);
                  const colors = getNodeColors(category);
                  const count = nodes.filter(n => n.data.category === category).length;
                  return (
                    <button
                      key={category}
                      onClick={() => { createNewNode(category); setShowAddMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-white/60 hover:text-white/90 hover:bg-white/[0.05] transition-colors"
                    >
                      <Icon size={12} style={{ color: colors.primary }} />
                      <span>{label}</span>
                      {count > 0 && <span className="ml-auto text-[9px] text-white/20 font-mono">{count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={history.length === 0}
            title="Undo (Ctrl+Z)"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-white/30"
          >
            <Undo2 size={13} />
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            title="Redo (Ctrl+Shift+Z)"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-white/30"
          >
            <Redo2 size={13} />
          </button>
        </div>

        {/* Export/Import */}
        {mounted && nodes.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const json = exportWorkflow();
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `lifecycle-workflow-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              title="Export workflow as JSON"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <Download size={13} />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import workflow from JSON"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
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
                    if (!ok) alert('Invalid workflow file. The file may be corrupted or in an unsupported format.');
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
      <div className="hidden sm:flex items-center gap-4">
        {mounted && nodes.length > 0 ? (
          <>
            <div className="flex items-center gap-1.5 text-[10px]" title={`${activeCount} active nodes`}>
              <Circle size={6} fill="#22c55e" className="text-emerald-500" />
              <span className="text-white/40">{activeCount} <span className="hidden md:inline">active</span></span>
            </div>
            {staleCount > 0 && (
              <div className="flex items-center gap-1.5 text-[10px]" title={`${staleCount} stale nodes`}>
                <Circle size={6} fill="#f59e0b" className="text-amber-500" />
                <span className="text-amber-400/60">{staleCount} <span className="hidden md:inline">stale</span></span>
              </div>
            )}
            {reviewCount > 0 && (
              <div className="flex items-center gap-1.5 text-[10px]" title={`${reviewCount} reviewing`}>
                <Circle size={6} fill="#f43f5e" className="text-rose-500" />
                <span className="text-rose-400/60">{reviewCount} <span className="hidden md:inline">reviewing</span></span>
              </div>
            )}
            <div className="hidden lg:flex items-center gap-1.5 text-[10px]" title={`${nodes.length} total nodes`}>
              <span className="text-white/20">{nodes.length} nodes</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]" title={`Graph health: ${healthScore}%`}>
              <Heart size={8} className={healthScore >= 80 ? 'text-emerald-400' : healthScore >= 50 ? 'text-amber-400' : 'text-rose-400'} fill={healthScore >= 80 ? '#22c55e' : healthScore >= 50 ? '#f59e0b' : '#f43f5e'} />
              <span className={healthScore >= 80 ? 'text-emerald-400/60' : healthScore >= 50 ? 'text-amber-400/60' : 'text-rose-400/60'}>{healthScore}%</span>
            </div>
          </>
        ) : (
          <span className="text-[11px] text-white/20">{agent.topBarHint}</span>
        )}
      </div>

      {/* Right - Toggles */}
      <div className="flex items-center gap-2">
        {mounted && nodes.length > 0 && (
          <>
            <button
              onClick={togglePreviewPanel}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                showPreviewPanel
                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                  : 'bg-white/[0.04] text-white/40 border border-white/[0.06] hover:text-white/60'
              }`}
            >
              <Play size={12} />
              <span className="hidden sm:inline">Preview</span>
            </button>
            <button
              onClick={toggleActivityPanel}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                showActivityPanel
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                  : 'bg-white/[0.04] text-white/40 border border-white/[0.06] hover:text-white/60'
              }`}
            >
              <Activity size={12} />
              <span className="hidden sm:inline">Activity</span>
            </button>
          </>
        )}
        <button
          onClick={toggleCIDPanel}
          className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
            showCIDPanel
              ? agent.accent === 'amber'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-white/[0.04] text-white/40 border border-white/[0.06] hover:text-white/60'
          }`}
        >
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
          {agent.accent === 'amber' ? <Search size={12} /> : <Bot size={12} />}
          {agent.name}
        </button>
      </div>
    </div>
  );
}
