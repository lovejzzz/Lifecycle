'use client';

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  useViewport,
  type NodeTypes,
  type Connection,
  MiniMap,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Sparkles, ArrowRight, Search, X, HelpCircle, Keyboard, ChevronRight, Copy, Trash2, MessageSquare, Lock, Loader2 } from 'lucide-react';
import { useLifecycleStore, resolveOverlap } from '@/store/useStore';
import LifecycleNode from './LifecycleNode';
import NodeDetailPanel from './NodeDetailPanel';
import ActivityPanel from './ActivityPanel';
import CIDPanel from './CIDPanel';
import NodeContextMenu from './NodeContextMenu';
import ArtifactPanel from './ArtifactPanel';
import { getNodeColors, EDGE_LABEL_COLORS } from '@/lib/types';
import type { NodeData, NodeCategory } from '@/lib/types';
import { getAgent } from '@/lib/agents';

const nodeTypes: NodeTypes = {
  lifecycleNode: LifecycleNode,
};

const EDGE_LABELS = ['drives', 'feeds', 'refines', 'validates', 'monitors', 'connects', 'outputs', 'updates', 'watches', 'approves', 'triggers', 'requires', 'informs', 'blocks'];

const DEFAULT_EDGE_OPTIONS = {
  type: 'smoothstep',
  style: { strokeWidth: 2 },
  labelStyle: { fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 500, letterSpacing: '0.05em' },
  labelBgStyle: { fill: '#0a0a14', fillOpacity: 0.85 },
  labelBgPadding: [6, 3] as [number, number],
  labelBgBorderRadius: 4,
} as const;

// ─── Command Palette (extracted to avoid refs-during-render warning) ─────────

function CommandPalette({ onClose, showCIDPanel, toggleCIDPanel, setShowSearch, focusSearchInput, undo, redo, setShowShortcuts, setShowLegend, nodes, selectNode }: {
  onClose: () => void;
  showCIDPanel: boolean;
  toggleCIDPanel: () => void;
  setShowSearch: (v: boolean) => void;
  focusSearchInput: () => void;
  undo: () => void;
  redo: () => void;
  setShowShortcuts: (v: boolean) => void;
  setShowLegend: (v: boolean | ((prev: boolean) => boolean)) => void;
  nodes: any[];
  selectNode: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo(() => [
    { id: 'cid', label: 'Open CID Chat', icon: '💬', action: () => { if (!showCIDPanel) toggleCIDPanel(); setTimeout(() => document.querySelector<HTMLInputElement>('[data-cid-input]')?.focus(), 100); } },
    { id: 'search', label: 'Search Nodes', icon: '🔍', action: () => { setShowSearch(true); focusSearchInput(); } },
    { id: 'export', label: 'Export Workflow', icon: '📤', action: () => { const s = useLifecycleStore.getState(); const json = s.exportWorkflow(); const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `lifecycle-workflow-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); s.addToast('Workflow exported', 'success'); } },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: '⌨️', action: () => setShowShortcuts(true) },
    { id: 'legend', label: 'Edge Color Legend', icon: '🎨', action: () => setShowLegend(prev => !prev) },
    { id: 'undo', label: 'Undo', icon: '↩️', action: () => undo() },
    { id: 'redo', label: 'Redo', icon: '↪️', action: () => redo() },
    { id: 'plan', label: 'Execution Plan', icon: '📋', action: () => { if (!showCIDPanel) toggleCIDPanel(); setTimeout(() => { const cidInput = document.querySelector<HTMLInputElement>('[data-cid-input]'); if (cidInput) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set; s?.call(cidInput, 'plan'); cidInput.dispatchEvent(new Event('input', { bubbles: true })); cidInput.form?.requestSubmit(); } }, 150); } },
    { id: 'compress', label: 'Compress Workflow', icon: '🗜️', action: () => { if (!showCIDPanel) toggleCIDPanel(); setTimeout(() => { const cidInput = document.querySelector<HTMLInputElement>('[data-cid-input]'); if (cidInput) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set; s?.call(cidInput, 'compress'); cidInput.dispatchEvent(new Event('input', { bubbles: true })); cidInput.form?.requestSubmit(); } }, 150); } },
    { id: 'bottlenecks', label: 'Find Bottlenecks', icon: '🔬', action: () => { if (!showCIDPanel) toggleCIDPanel(); setTimeout(() => { const cidInput = document.querySelector<HTMLInputElement>('[data-cid-input]'); if (cidInput) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set; s?.call(cidInput, 'bottlenecks'); cidInput.dispatchEvent(new Event('input', { bubbles: true })); cidInput.form?.requestSubmit(); } }, 150); } },
  ], [showCIDPanel, toggleCIDPanel, setShowSearch, focusSearchInput, undo, redo, setShowShortcuts, setShowLegend]);

  const nodeItems = useMemo(() => nodes.map(n => ({
    id: `node-${n.id}`,
    label: n.data.label,
    icon: '',
    category: n.data.category,
    action: () => selectNode(n.id),
  })), [nodes, selectNode]);

  const q = query.toLowerCase();
  const filteredCommands = q ? commands.filter(c => c.label.toLowerCase().includes(q)) : commands;
  const filteredNodes = q ? nodeItems.filter(n => n.label.toLowerCase().includes(q)) : [];
  const allItems = [...filteredCommands, ...filteredNodes];
  const safeIndex = Math.min(index, allItems.length - 1);

  return (
    <motion.div
      key="palette"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      className="absolute inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[380px] rounded-xl border border-white/[0.12] bg-[#0e0e18]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
          <Search size={14} className="text-white/30 flex-shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setIndex(0); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, allItems.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); }
              if (e.key === 'Enter' && allItems.length > 0) {
                allItems[safeIndex]?.action();
                onClose();
              }
            }}
            placeholder="Type a command or node name..."
            className="flex-1 bg-transparent text-[13px] text-white/80 placeholder-white/25 outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[9px] font-mono text-white/25">ESC</kbd>
        </div>
        <div className="max-h-[300px] overflow-y-auto py-1">
          {filteredCommands.length > 0 && (
            <>
              <div className="px-4 py-1 text-[9px] text-white/25 uppercase tracking-wider">Commands</div>
              {filteredCommands.map((cmd, idx) => (
                <button
                  key={cmd.id}
                  onClick={() => { cmd.action(); onClose(); }}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-[12px] transition-colors ${
                    idx === safeIndex ? 'bg-white/[0.08] text-white/90' : 'text-white/60 hover:bg-white/[0.05] hover:text-white/80'
                  }`}
                >
                  <span className="text-[14px] w-5 text-center">{cmd.icon}</span>
                  <span>{cmd.label}</span>
                </button>
              ))}
            </>
          )}
          {filteredNodes.length > 0 && (
            <>
              <div className="px-4 py-1 mt-1 text-[9px] text-white/25 uppercase tracking-wider">Nodes</div>
              {filteredNodes.slice(0, 10).map((item, idx) => {
                const globalIdx = filteredCommands.length + idx;
                const colors = getNodeColors(item.category as any);
                return (
                  <button
                    key={item.id}
                    onClick={() => { item.action(); onClose(); }}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-[12px] transition-colors ${
                      globalIdx === safeIndex ? 'bg-white/[0.08] text-white/90' : 'text-white/60 hover:bg-white/[0.05] hover:text-white/80'
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colors.primary }} />
                    <span className="truncate">{item.label}</span>
                    <span className="text-[9px] text-white/20 ml-auto">{item.category}</span>
                  </button>
                );
              })}
            </>
          )}
          {allItems.length === 0 && (
            <div className="px-4 py-6 text-center text-[11px] text-white/25">No results found</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

function CanvasInner() {
  const {
    nodes, edges, setNodes, setEdges, selectNode, showCIDPanel,
    selectedNodeId, deleteNode, deleteEdge, onConnect, undo, redo,
    openContextMenu, closeContextMenu, contextMenu, toggleCIDPanel,
    cidMode, searchQuery, setSearchQuery,
    multiSelectedIds, toggleMultiSelect, clearMultiSelect, deleteMultiSelected,
    pendingEdge, setPendingEdge, updateEdgeLabel,
    addNode, addEvent, breadcrumbs, clearBreadcrumbs,
    duplicateNode, updateNodeStatus, askCIDAboutNode,
    activeArtifactNodeId,
  } = useLifecycleStore();
  const fitViewCounter = useLifecycleStore((s) => s.fitViewCounter);
  const executionProgress = useLifecycleStore((s) => s.executionProgress);

  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard: must setMounted after SSR to avoid mismatch
  useEffect(() => { setMounted(true); }, []);
  const isEmpty = !mounted || nodes.length === 0;
  const agent = getAgent(cidMode);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const viewport = useViewport();

  // Pan to selected node when it changes (from search, activity, connection clicks)
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedNodeId && selectedNodeId !== prevSelectedRef.current && mounted && nodes.length > 0) {
      // Small delay to let React Flow render first
      setTimeout(() => {
        fitView({ nodes: [{ id: selectedNodeId }], duration: 400, padding: 0.5, maxZoom: 1.2 });
      }, 50);
    }
    prevSelectedRef.current = selectedNodeId;
  }, [selectedNodeId, fitView, mounted, nodes.length]);

  // Auto-fit when nodes are being built (store requests fitView)
  useEffect(() => {
    if (fitViewCounter > 0 && mounted) {
      setTimeout(() => {
        fitView({ duration: 300, padding: 0.4, maxZoom: 1.1 });
      }, 50);
    }
  }, [fitViewCounter, fitView, mounted]);

  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const matchingNodes = useMemo(() => searchQuery
    ? nodes.filter(n =>
        n.data.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.data.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [], [searchQuery, nodes]);

  // Node hover tooltip state
  const [tooltip, setTooltip] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => { if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current); };
  }, []);

  // Snap guide lines for node alignment
  const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }[]>([]);

  // Edge label picker state (for click-to-edit)
  const [edgePicker, setEdgePicker] = useState<{ edgeId: string; x: number; y: number } | null>(null);

  // Edge hover tooltip
  const [edgeTooltip, setEdgeTooltip] = useState<{ edgeId: string; x: number; y: number } | null>(null);
  const edgeTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Command palette state
  const [showPalette, setShowPalette] = useState(false);

  const onNodesChange = useCallback(
    (changes: any) => {
      setNodes((nds: any) => applyNodeChanges(changes, nds));
    },
    [setNodes]
  );

  const SNAP_THRESHOLD = 12;
  const onNodeDrag = useCallback(
    (_event: React.MouseEvent, draggedNode: any) => {
      const lines: { x?: number; y?: number }[] = [];
      const dx = draggedNode.position.x;
      const dy = draggedNode.position.y;
      for (const n of nodes) {
        if (n.id === draggedNode.id) continue;
        if (Math.abs(n.position.x - dx) < SNAP_THRESHOLD) lines.push({ x: n.position.x });
        if (Math.abs(n.position.y - dy) < SNAP_THRESHOLD) lines.push({ y: n.position.y });
      }
      setSnapLines(lines.slice(0, 4));
    },
    [nodes]
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: any) => {
      setSnapLines([]);
      setNodes((nds: any) => {
        const newPos = resolveOverlap(draggedNode.id, draggedNode.position, nds);
        if (!newPos) return nds;
        return nds.map((n: any) => n.id === draggedNode.id ? { ...n, position: newPos } : n);
      });
    },
    [setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: any) => {
      setEdges((eds: any) => applyEdgeChanges(changes, eds));
    },
    [setEdges]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    clearMultiSelect();
    closeContextMenu();
    setEdgePicker(null);
    setPendingEdge(null);
  }, [selectNode, clearMultiSelect, closeContextMenu, setPendingEdge]);

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: any) => {
      if (event.shiftKey) {
        event.stopPropagation();
        toggleMultiSelect(node.id);
      } else {
        selectNode(node.id);
      }
    },
    [selectNode, toggleMultiSelect]
  );

  const onPaneDoubleClick = useCallback((event: React.MouseEvent) => {
    // Only create node when double-clicking the pane itself, not nodes
    const target = event.target as HTMLElement;
    if (target.closest('.react-flow__node')) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const id = `node-${Date.now()}`;
    addNode({
      id,
      type: 'lifecycleNode',
      position,
      data: {
        label: 'New Node',
        category: 'note' as NodeCategory,
        status: 'active',
        description: '',
        version: 1,
        lastUpdated: Date.now(),
      },
    });
    addEvent({ id: `ev-${Date.now()}`, type: 'created', message: 'Created new node via double-click', timestamp: Date.now(), nodeId: id });
    selectNode(id);
  }, [screenToFlowPosition, addNode, addEvent, selectNode]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      onConnect(connection);
      // Show label picker for the new edge
      if (connection.source && connection.target) {
        const edgeId = `e-${connection.source}-${connection.target}`;
        // Position the picker at center of viewport
        setTimeout(() => {
          setPendingEdge({ edgeId, x: window.innerWidth / 2 - 80, y: 60 });
        }, 100);
      }
    },
    [onConnect, setPendingEdge]
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault();
      openContextMenu(node.id, event.clientX, event.clientY);
    },
    [openContextMenu]
  );

  const handleNodeMouseEnter = useCallback(
    (_event: React.MouseEvent, node: any) => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = setTimeout(() => {
        setTooltip({ nodeId: node.id, x: _event.clientX, y: _event.clientY });
      }, 500);
    },
    []
  );

  const handleNodeMouseLeave = useCallback(() => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setTooltip(null);
  }, []);

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: any) => {
      _event.stopPropagation();
      setEdgeTooltip(null);
      setEdgePicker({ edgeId: edge.id, x: _event.clientX, y: _event.clientY });
    },
    []
  );

  const handleEdgeMouseEnter = useCallback(
    (_event: React.MouseEvent, edge: any) => {
      if (edgeTooltipTimerRef.current) clearTimeout(edgeTooltipTimerRef.current);
      edgeTooltipTimerRef.current = setTimeout(() => {
        setEdgeTooltip({ edgeId: edge.id, x: _event.clientX, y: _event.clientY });
      }, 400);
    },
    []
  );

  const handleEdgeMouseLeave = useCallback(() => {
    if (edgeTooltipTimerRef.current) clearTimeout(edgeTooltipTimerRef.current);
    setEdgeTooltip(null);
  }, []);

  // Close edge picker on outside click
  useEffect(() => {
    if (!edgePicker) return;
    const handler = (e: MouseEvent) => {
      const el = document.getElementById('edge-picker-panel');
      if (el && !el.contains(e.target as HTMLElement)) setEdgePicker(null);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [edgePicker]);

  // Keyboard shortcuts: Delete, Undo, Redo, Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+? or Cmd+/: toggle shortcuts help
      if ((e.metaKey || e.ctrlKey) && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }

      // Cmd+F / Ctrl+F: open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }

      // Cmd+E / Ctrl+E: export workflow
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        const store = useLifecycleStore.getState();
        const json = store.exportWorkflow();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lifecycle-workflow-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        store.addToast('Workflow exported', 'success');
        return;
      }

      // Escape: close overlays in priority order
      if (e.key === 'Escape') {
        if (showPalette) { setShowPalette(false); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (showSearch) { setShowSearch(false); setSearchQuery(''); setSearchSelectedIndex(0); return; }
        if (edgePicker) { setEdgePicker(null); return; }
        if (pendingEdge) { setPendingEdge(null); return; }
        // Close CID panel if open (unless typing in input)
        const tag = (e.target as HTMLElement)?.tagName;
        if (showCIDPanel && tag !== 'INPUT' && tag !== 'TEXTAREA') { toggleCIDPanel(); return; }
        if (selectedNodeId) { selectNode(null); return; }
        return;
      }

      // Cmd+0: fit view to selected node's connected subgraph (or all)
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        if (selectedNodeId) {
          const currentEdges = useLifecycleStore.getState().edges;
          const visited = new Set<string>([selectedNodeId]);
          const q = [selectedNodeId];
          while (q.length > 0) {
            const cur = q.shift()!;
            for (const edge of currentEdges) {
              if (edge.source === cur && !visited.has(edge.target)) { visited.add(edge.target); q.push(edge.target); }
              if (edge.target === cur && !visited.has(edge.source)) { visited.add(edge.source); q.push(edge.source); }
            }
          }
          fitView({ nodes: [...visited].map(id => ({ id })), duration: 400, padding: 0.4, maxZoom: 1.2 });
        } else {
          fitView({ duration: 400, padding: 0.35, maxZoom: 1.1 });
        }
        return;
      }

      // Cmd+K / Ctrl+K: open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowPalette(prev => !prev);
        return;
      }

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Arrow key navigation between connected nodes
      if (selectedNodeId && ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const { nodes: currentNodes, edges: currentEdges } = useLifecycleStore.getState();
        const currentNode = currentNodes.find(n => n.id === selectedNodeId);
        if (!currentNode) return;
        // ArrowRight/ArrowDown: follow outgoing edges; ArrowLeft/ArrowUp: follow incoming
        const isForward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
        const neighbors = isForward
          ? currentEdges.filter(ed => ed.source === selectedNodeId).map(ed => currentNodes.find(n => n.id === ed.target)).filter(Boolean)
          : currentEdges.filter(ed => ed.target === selectedNodeId).map(ed => currentNodes.find(n => n.id === ed.source)).filter(Boolean);
        if (neighbors.length > 0) {
          // Pick the neighbor closest in the arrow direction
          const sorted = [...neighbors].sort((a, b) => {
            if (e.key === 'ArrowRight') return a!.position.x - b!.position.x;
            if (e.key === 'ArrowLeft') return b!.position.x - a!.position.x;
            if (e.key === 'ArrowDown') return a!.position.y - b!.position.y;
            return b!.position.y - a!.position.y;
          });
          selectNode(sorted[0]!.id);
        }
        return;
      }

      // ? key (no modifier): open CID and show help
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (!showCIDPanel) toggleCIDPanel();
        setTimeout(() => {
          const cidInput = document.querySelector<HTMLInputElement>('[data-cid-input]');
          if (cidInput) { cidInput.value = 'help'; cidInput.dispatchEvent(new Event('input', { bubbles: true })); }
        }, 100);
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && edgePicker) {
        useLifecycleStore.getState().deleteEdge(edgePicker.edgeId);
        setEdgePicker(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && multiSelectedIds.size > 1) {
        const currentNodes = useLifecycleStore.getState().nodes;
        const names = currentNodes.filter(n => multiSelectedIds.has(n.id)).map(n => n.data.label).join(', ');
        if (!window.confirm(`Delete ${multiSelectedIds.size} nodes (${names})?`)) return;
        deleteMultiSelected();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        const { nodes: currentNodes, edges: currentEdges } = useLifecycleStore.getState();
        const node = currentNodes.find(n => n.id === selectedNodeId);
        const connCount = currentEdges.filter(e => e.source === selectedNodeId || e.target === selectedNodeId).length;
        if (connCount > 0 && !window.confirm(`Delete "${node?.data.label ?? selectedNodeId}"? This will remove ${connCount} connection${connCount > 1 ? 's' : ''}.`)) return;
        deleteNode(selectedNodeId);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, deleteNode, undo, redo, showCIDPanel, toggleCIDPanel, showSearch, showShortcuts, showPalette, setSearchQuery, edgePicker, pendingEdge, selectNode, setPendingEdge, searchSelectedIndex, matchingNodes, multiSelectedIds, deleteMultiSelected, fitView]);

  const minimapNodeColor = useCallback((node: any) => {
    const data = node.data as NodeData;
    return getNodeColors(data.category)?.primary || '#444';
  }, []);

  // Connected path highlighting: when a node is selected, highlight its edges and dim others
  // Full path highlighting: BFS upstream + downstream from selected node
  const { connectedEdgeIds, connectedNodeIds } = useMemo(() => {
    if (!selectedNodeId) return { connectedEdgeIds: null, connectedNodeIds: null };
    const visitedNodes = new Set<string>([selectedNodeId]);
    const visitedEdges = new Set<string>();
    const queue = [selectedNodeId];
    // BFS both directions
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const e of edges) {
        if (e.source === current && !visitedNodes.has(e.target)) {
          visitedNodes.add(e.target);
          visitedEdges.add(e.id);
          queue.push(e.target);
        }
        if (e.target === current && !visitedNodes.has(e.source)) {
          visitedNodes.add(e.source);
          visitedEdges.add(e.id);
          queue.push(e.source);
        }
      }
    }
    return {
      connectedEdgeIds: visitedEdges.size > 0 ? visitedEdges : null,
      connectedNodeIds: visitedNodes.size > 1 ? visitedNodes : null,
    };
  }, [selectedNodeId, edges]);

  // Edge connection counts for hub-strength visualization
  const edgeNodeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of edges) {
      counts.set(e.source, (counts.get(e.source) || 0) + 1);
      counts.set(e.target, (counts.get(e.target) || 0) + 1);
    }
    return counts;
  }, [edges]);

  // Memoize edge styles — highlight connected path when a node is selected + hub strength
  const styledEdges = useMemo(() =>
    edges.map(e => {
      const baseColor = (e.label && typeof e.label === 'string' && EDGE_LABEL_COLORS[e.label]) || (e.style as any)?.stroke || '#6366f1';
      const isConnected = connectedEdgeIds?.has(e.id);
      const dimmed = connectedEdgeIds && !isConnected;
      // Hub strength: edges touching high-connection nodes get thicker
      const srcConns = edgeNodeCounts.get(e.source) || 0;
      const tgtConns = edgeNodeCounts.get(e.target) || 0;
      const maxConns = Math.max(srcConns, tgtConns);
      const baseWidth = maxConns >= 5 ? 3.5 : maxConns >= 3 ? 2.5 : 2;
      return {
        ...e,
        style: {
          ...e.style,
          stroke: dimmed ? 'rgba(100,100,140,0.15)' : baseColor,
          strokeWidth: isConnected ? 3.5 : (dimmed ? 1.5 : baseWidth),
          transition: 'stroke 0.3s, stroke-width 0.3s',
        },
        animated: isConnected ? true : (dimmed ? false : e.animated),
      };
    }),
  [edges, connectedEdgeIds, edgeNodeCounts]);

  return (
    <div className="flex w-full h-full overflow-hidden" style={{ flex: '1 1 0%', minHeight: 0 }}>
      <div style={{ flex: '1 1 0%', minWidth: 0, position: 'relative', height: '100%' }}>
        <ReactFlow
          nodes={mounted ? (connectedNodeIds ? nodes.map(n => ({
            ...n,
            style: connectedNodeIds.has(n.id) ? { opacity: 1, transition: 'opacity 0.3s' } : { opacity: 0.3, transition: 'opacity 0.3s' },
          })) : nodes) : []}
          edges={mounted ? styledEdges : []}
          onNodesChange={onNodesChange}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onPaneClick={onPaneClick}
          onNodeClick={onNodeClick}
          onDoubleClick={onPaneDoubleClick}
          onNodeContextMenu={handleNodeContextMenu}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          onEdgeClick={handleEdgeClick}
          onEdgeMouseEnter={handleEdgeMouseEnter}
          onEdgeMouseLeave={handleEdgeMouseLeave}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.35 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          style={{ width: '100%', height: '100%' }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="rgba(255,255,255,0.035)"
          />
          {!isEmpty && (
            <>
              <Controls
                position="bottom-right"
                showInteractive={false}
              />
              <MiniMap
                position="top-right"
                nodeColor={minimapNodeColor}
                nodeStrokeWidth={0}
                maskColor="rgba(0, 0, 0, 0.75)"
                style={{ width: 160, height: 100 }}
                pannable
                zoomable
              />
            </>
          )}
        </ReactFlow>

        {/* Snap alignment guides */}
        {snapLines.length > 0 && snapLines.map((line, i) => {
          if (line.x !== undefined) {
            const screenX = line.x * viewport.zoom + viewport.x;
            return <div key={`sx${i}`} className="absolute top-0 bottom-0 pointer-events-none z-[5]" style={{ left: screenX, width: 1, background: 'rgba(99,102,241,0.4)', borderRight: '1px dashed rgba(99,102,241,0.3)' }} />;
          }
          if (line.y !== undefined) {
            const screenY = line.y * viewport.zoom + viewport.y;
            return <div key={`sy${i}`} className="absolute left-0 right-0 pointer-events-none z-[5]" style={{ top: screenY, height: 1, background: 'rgba(99,102,241,0.4)', borderBottom: '1px dashed rgba(99,102,241,0.3)' }} />;
          }
          return null;
        })}

        {/* Empty state */}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="text-center max-w-md px-8">
              <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto mb-6 ${
                agent.accent === 'amber'
                  ? 'bg-gradient-to-br from-amber-500/15 to-orange-500/15 border-amber-500/20'
                  : 'bg-gradient-to-br from-emerald-500/15 to-cyan-500/15 border-emerald-500/20'
              }`}>
                {agent.accent === 'amber'
                  ? <Search size={28} className="text-amber-400" />
                  : <Sparkles size={28} className="text-emerald-400" />
                }
              </div>
              <h2 className="text-xl font-semibold text-white/80 mb-2">
                {agent.emptyCanvasTitle}
              </h2>
              <p className="text-[13px] text-white/35 leading-relaxed mb-6">
                {agent.emptyCanvasDescription}
              </p>
              {!showCIDPanel && (
                <button
                  onClick={toggleCIDPanel}
                  className={`pointer-events-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    agent.accent === 'amber'
                      ? 'bg-amber-500/15 border border-amber-500/25 text-amber-400 hover:bg-amber-500/25'
                      : 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/25'
                  }`}
                >
                  {agent.accent === 'amber' ? <Search size={16} /> : <Bot size={16} />}
                  Open {agent.name}
                  <ArrowRight size={14} />
                </button>
              )}
              {showCIDPanel && (
                <div className="flex items-center justify-center gap-2 text-[12px] text-white/25">
                  <ArrowRight size={12} />
                  <span>{agent.emptyCanvasHint}</span>
                </div>
              )}
              {/* Template chips */}
              <div className="mt-5 flex flex-wrap justify-center gap-2 pointer-events-auto">
                {[
                  { label: 'Software Development', type: 'template' },
                  { label: 'Content Pipeline', type: 'template' },
                  { label: 'Incident Response', type: 'template' },
                  { label: 'Product Launch', type: 'template' },
                ].map(({ label }) => (
                  <button
                    key={label}
                    onClick={() => {
                      useLifecycleStore.getState().loadTemplate(label);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] border transition-all hover:scale-[1.03] ${
                      agent.accent === 'amber'
                        ? 'border-amber-500/15 text-amber-400/60 bg-amber-500/[0.04] hover:bg-amber-500/[0.1] hover:border-amber-500/25'
                        : 'border-emerald-500/15 text-emerald-400/60 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.1] hover:border-emerald-500/25'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Prompt categories with contextual suggestions */}
              <div className="mt-4 pointer-events-auto space-y-2">
                <div className="text-[9px] text-white/20 uppercase tracking-widest mb-1">or describe what you need</div>
                {[
                  { icon: '📝', prompts: ['Build a blog content pipeline', 'Create a research paper workflow'] },
                  { icon: '🚀', prompts: ['Design a CI/CD pipeline for React', 'Make a product launch workflow'] },
                  { icon: '🎓', prompts: ['Turn a Google Doc into a lesson plan and export to PDF', 'Create an onboarding training system'] },
                  { icon: '🔍', prompts: ['Build a code review and QA pipeline', 'Design an incident response workflow'] },
                ].map((group, gi) => (
                  <div key={gi} className="flex items-center justify-center gap-1.5 flex-wrap">
                    <span className="text-[10px]">{group.icon}</span>
                    {group.prompts.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => {
                          if (!showCIDPanel) toggleCIDPanel();
                          setTimeout(() => {
                            const cidInput = document.querySelector<HTMLInputElement>('[data-cid-input]');
                            if (cidInput) {
                              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                              nativeInputValueSetter?.call(cidInput, prompt);
                              cidInput.dispatchEvent(new Event('input', { bubbles: true }));
                              cidInput.focus();
                            }
                          }, 150);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[9.5px] border transition-all hover:scale-[1.03] ${
                          agent.accent === 'amber'
                            ? 'border-amber-500/10 text-amber-400/50 bg-amber-500/[0.02] hover:bg-amber-500/[0.08] hover:border-amber-500/20'
                            : 'border-emerald-500/10 text-emerald-400/50 bg-emerald-500/[0.02] hover:bg-emerald-500/[0.08] hover:border-emerald-500/20'
                        }`}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-4 text-[10px] text-white/15">
                Press <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] font-mono text-[9px]">⌘K</kbd> to focus CID
              </div>
            </div>
          </div>
        )}

        {/* Floating CID button when panel is closed */}
        {!showCIDPanel && !isEmpty && (
          <button
            onClick={toggleCIDPanel}
            className={`absolute bottom-6 right-6 z-20 w-12 h-12 rounded-xl flex items-center justify-center shadow-2xl border transition-all hover:scale-110 ${
              agent.accent === 'amber'
                ? 'bg-amber-500/15 border-amber-500/25 hover:bg-amber-500/25'
                : 'bg-emerald-500/15 border-emerald-500/25 hover:bg-emerald-500/25'
            }`}
            title={`Open ${agent.name} (⌘K)`}
          >
            {agent.accent === 'amber'
              ? <Search size={20} className="text-amber-400" />
              : <Bot size={20} className="text-emerald-400" />
            }
          </button>
        )}

        {/* Search Bar */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.15 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[320px]"
            >
              <div className="flex items-center gap-2 bg-[#0e0e18]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl px-3 py-2 shadow-2xl">
                <Search size={13} className="text-white/30 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSearchSelectedIndex(0); }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); setSearchSelectedIndex(0); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); setSearchSelectedIndex(i => Math.min(i + 1, Math.min(matchingNodes.length, 8) - 1)); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setSearchSelectedIndex(i => Math.max(i - 1, 0)); }
                    if (e.key === 'Enter' && matchingNodes.length > 0) {
                      selectNode(matchingNodes[searchSelectedIndex]?.id ?? matchingNodes[0].id);
                      setShowSearch(false);
                      setSearchQuery('');
                      setSearchSelectedIndex(0);
                    }
                  }}
                  placeholder="Search nodes..."
                  className="flex-1 bg-transparent text-[12px] text-white/80 placeholder-white/20 outline-none"
                />
                {searchQuery && (
                  <span className="text-[10px] text-white/30 flex-shrink-0">{matchingNodes.length} found</span>
                )}
                <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-white/30 hover:text-white/60">
                  <X size={12} />
                </button>
              </div>
              {searchQuery && matchingNodes.length > 0 && (
                <div className="mt-1 bg-[#0e0e18]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl max-h-[200px] overflow-y-auto">
                  {matchingNodes.slice(0, 8).map((n, idx) => {
                    const colors = getNodeColors(n.data.category);
                    const isSelected = idx === searchSelectedIndex;
                    return (
                      <button
                        key={n.id}
                        onClick={() => { selectNode(n.id); setShowSearch(false); setSearchQuery(''); setSearchSelectedIndex(0); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors ${
                          isSelected ? 'text-white/90 bg-white/[0.08]' : 'text-white/60 hover:text-white/90 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors.primary }} />
                        <span className="truncate">{n.data.label}</span>
                        <span className="text-[9px] text-white/20 ml-auto flex-shrink-0">{n.data.category}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Breadcrumb Navigation */}
        <AnimatePresence>
          {breadcrumbs.length > 1 && !isEmpty && (
            <motion.div
              key="breadcrumbs"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 px-2 py-1.5 rounded-lg bg-[#0e0e18]/80 backdrop-blur-lg border border-white/[0.06]"
            >
              {breadcrumbs.map((id, idx) => {
                const node = nodes.find(n => n.id === id);
                if (!node) return null;
                const colors = getNodeColors(node.data.category);
                const isActive = id === selectedNodeId;
                return (
                  <React.Fragment key={id}>
                    {idx > 0 && <ChevronRight size={10} className="text-white/15 flex-shrink-0" />}
                    <button
                      onClick={() => selectNode(id)}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors flex-shrink-0 ${
                        isActive ? 'bg-white/[0.1] text-white/80' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: colors.primary }} />
                      <span className="truncate max-w-[60px]">{node.data.label}</span>
                    </button>
                  </React.Fragment>
                );
              })}
              <button
                onClick={clearBreadcrumbs}
                className="ml-1 text-white/20 hover:text-white/50 transition-colors"
                title="Clear trail"
              >
                <X size={10} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Node Quick Bar */}
        <AnimatePresence>
          {selectedNodeId && !contextMenu && !edgePicker && (() => {
            const node = nodes.find(n => n.id === selectedNodeId);
            if (!node) return null;
            const screenX = node.position.x * viewport.zoom + viewport.x;
            const screenY = node.position.y * viewport.zoom + viewport.y;
            const barX = Math.max(8, Math.min(screenX, window.innerWidth - 220));
            const barY = screenY - 44;
            if (barY < 0 || barY > window.innerHeight - 40) return null;
            return (
              <motion.div
                key="quick-bar"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="fixed z-40 flex items-center gap-0.5 px-1 py-0.5 rounded-lg bg-[#0e0e18]/90 backdrop-blur-xl border border-white/[0.1] shadow-2xl"
                style={{ left: barX, top: barY }}
              >
                <button
                  onClick={() => duplicateNode(selectedNodeId)}
                  title="Duplicate"
                  className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-colors"
                >
                  <Copy size={12} />
                </button>
                <button
                  onClick={() => { if (!showCIDPanel) toggleCIDPanel(); askCIDAboutNode(selectedNodeId); }}
                  title="Ask CID"
                  className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-colors"
                >
                  <MessageSquare size={12} />
                </button>
                <button
                  onClick={() => updateNodeStatus(selectedNodeId, node.data.status === 'locked' ? 'active' : 'locked')}
                  title={node.data.status === 'locked' ? 'Unlock' : 'Lock'}
                  className={`p-1.5 rounded transition-colors ${node.data.status === 'locked' ? 'text-amber-400/60 hover:text-amber-400' : 'text-white/40 hover:text-white/80'} hover:bg-white/[0.08]`}
                >
                  <Lock size={12} />
                </button>
                <div className="w-px h-4 bg-white/[0.08] mx-0.5" />
                <button
                  onClick={() => {
                    const connCount = edges.filter(e => e.source === selectedNodeId || e.target === selectedNodeId).length;
                    if (connCount > 0 && !window.confirm(`Delete "${node.data.label}"? Removes ${connCount} connection${connCount > 1 ? 's' : ''}.`)) return;
                    deleteNode(selectedNodeId);
                  }}
                  title="Delete"
                  className="p-1.5 rounded text-rose-400/40 hover:text-rose-400 hover:bg-rose-500/[0.08] transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Node Hover Tooltip */}
        <AnimatePresence>
          {tooltip && (() => {
            const node = nodes.find(n => n.id === tooltip.nodeId);
            if (!node) return null;
            const connCount = edges.filter(e => e.source === node.id || e.target === node.id).length;
            const colors = getNodeColors(node.data.category);
            return (
              <motion.div
                key="tooltip"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="fixed z-50 max-w-[220px] rounded-lg border border-white/[0.1] bg-[#0e0e18]/95 backdrop-blur-xl px-3 py-2 shadow-2xl pointer-events-none"
                style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: colors.primary }} />
                  <span className="text-[11px] font-semibold text-white/80 truncate">{node.data.label}</span>
                </div>
                {node.data.description && (
                  <p className="text-[10px] text-white/40 leading-snug mb-1 line-clamp-2">{node.data.description}</p>
                )}
                {node.data.content && !node.data.description && (
                  <p className="text-[10px] text-white/30 leading-snug mb-1 line-clamp-2 italic">{node.data.content.slice(0, 100)}{node.data.content.length > 100 ? '...' : ''}</p>
                )}
                <div className="flex items-center gap-3 text-[9px] text-white/25">
                  <span className="capitalize">{node.data.status}</span>
                  <span>{connCount} connection{connCount !== 1 ? 's' : ''}</span>
                  {node.data.version && <span>v{node.data.version}</span>}
                  {node.data.sections && node.data.sections.length > 0 && <span>{node.data.sections.length} section{node.data.sections.length > 1 ? 's' : ''}</span>}
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Edge Hover Info Card */}
        <AnimatePresence>
          {edgeTooltip && (() => {
            const edge = edges.find(e => e.id === edgeTooltip.edgeId);
            if (!edge) return null;
            const srcNode = nodes.find(n => n.id === edge.source);
            const tgtNode = nodes.find(n => n.id === edge.target);
            if (!srcNode || !tgtNode) return null;
            const label = (typeof edge.label === 'string' ? edge.label : '') || 'connected';
            const color = EDGE_LABEL_COLORS[label] || '#6366f1';
            const srcColors = getNodeColors(srcNode.data.category);
            const tgtColors = getNodeColors(tgtNode.data.category);
            return (
              <motion.div
                key="edge-tooltip"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="fixed z-50 rounded-lg border border-white/[0.1] bg-[#0e0e18]/95 backdrop-blur-xl px-3 py-2 shadow-2xl pointer-events-none min-w-[160px]"
                style={{ left: edgeTooltip.x + 12, top: edgeTooltip.y + 12 }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: srcColors.primary }} />
                  <span className="text-[10px] text-white/60 truncate max-w-[80px]">{srcNode.data.label}</span>
                  <span className="text-[10px] font-medium" style={{ color }}>→ {label}</span>
                  <span className="text-[10px] text-white/60 truncate max-w-[80px]">{tgtNode.data.label}</span>
                  <div className="w-2 h-2 rounded-full" style={{ background: tgtColors.primary }} />
                </div>
                <div className="text-[9px] text-white/25">Click to change label</div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Edge Label Picker (click-to-edit) */}
        <AnimatePresence>
          {edgePicker && (
            <motion.div
              key="edge-picker"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.12 }}
              id="edge-picker-panel"
              className="fixed z-50 rounded-xl border border-white/[0.1] bg-[#0e0e18]/95 backdrop-blur-xl overflow-hidden shadow-2xl"
              style={{ left: edgePicker.x, top: edgePicker.y }}
            >
              <div className="px-3 py-1.5 border-b border-white/[0.05]">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">Edge Label</span>
              </div>
              <div className="py-1 max-h-[240px] overflow-y-auto">
                {EDGE_LABELS.map(label => (
                  <button
                    key={label}
                    onClick={() => { updateEdgeLabel(edgePicker.edgeId, label); setEdgePicker(null); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-white/60 hover:text-white/90 hover:bg-white/[0.05] transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: EDGE_LABEL_COLORS[label] || '#6366f1' }} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <div className="px-3 py-1.5 border-t border-white/[0.05]">
                <button
                  onClick={() => { deleteEdge(edgePicker.edgeId); setEdgePicker(null); }}
                  className="w-full text-left text-[11px] text-rose-400/60 hover:text-rose-400 transition-colors"
                >
                  Delete edge
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pending Edge Label Picker (after drag-connect) */}
        <AnimatePresence>
          {pendingEdge && (
            <motion.div
              key="pending-edge"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="fixed z-50 rounded-xl border border-emerald-500/20 bg-[#0e0e18]/95 backdrop-blur-xl overflow-hidden shadow-2xl"
              style={{ left: pendingEdge.x, top: pendingEdge.y }}
            >
              <div className="px-3 py-1.5 border-b border-white/[0.05]">
                <span className="text-[10px] text-emerald-400/60 uppercase tracking-wider">Name this connection</span>
              </div>
              <div className="py-1 grid grid-cols-2 gap-0.5 max-h-[200px] overflow-y-auto">
                {EDGE_LABELS.map(label => (
                  <button
                    key={label}
                    onClick={() => { updateEdgeLabel(pendingEdge.edgeId, label); setPendingEdge(null); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-white/60 hover:text-white/90 hover:bg-white/[0.05] transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: EDGE_LABEL_COLORS[label] || '#6366f1' }} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="px-3 py-1 border-t border-white/[0.05]">
                <button onClick={() => setPendingEdge(null)} className="text-[9px] text-white/20 hover:text-white/40">Skip</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Execution Progress Overlay */}
        <AnimatePresence>
          {executionProgress && (
            <motion.div
              key="exec-progress"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-cyan-500/20 bg-[#0e0e18]/95 backdrop-blur-xl px-5 py-3 shadow-2xl min-w-[300px]"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-cyan-400/80">Executing Workflow</span>
                <div className="flex items-center gap-2">
                  {executionProgress.totalStages && executionProgress.totalStages > 1 && (
                    <span className="text-[9px] text-white/25 font-mono">
                      stage {executionProgress.stage}/{executionProgress.totalStages}
                    </span>
                  )}
                  <span className="text-[10px] text-white/40 font-mono">{executionProgress.current}/{executionProgress.total}</span>
                </div>
              </div>
              <div className="h-[4px] rounded-full bg-white/[0.06] overflow-hidden mb-2">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(executionProgress.current / executionProgress.total) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 size={10} className="text-cyan-400/60 animate-spin" />
                  <span className="text-[10px] text-white/40 truncate max-w-[160px]">{executionProgress.currentLabel}</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] font-mono">
                  {(executionProgress.succeeded ?? 0) > 0 && (
                    <span className="text-emerald-400/60">{executionProgress.succeeded}✓</span>
                  )}
                  {(executionProgress.failed ?? 0) > 0 && (
                    <span className="text-rose-400/60">{executionProgress.failed}✗</span>
                  )}
                  {(executionProgress.skipped ?? 0) > 0 && (
                    <span className="text-amber-400/60">{executionProgress.skipped}⊘</span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keyboard Shortcuts Help */}
        <AnimatePresence>
          {showShortcuts && (
            <motion.div
              key="shortcuts"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
              onClick={() => setShowShortcuts(false)}
            >
              <div
                className="bg-[#0e0e18]/95 border border-white/[0.1] rounded-2xl shadow-2xl p-6 w-[340px] max-h-[80vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Keyboard size={16} className="text-white/40" />
                    <span className="text-[13px] font-semibold text-white/80">Keyboard Shortcuts</span>
                  </div>
                  <button onClick={() => setShowShortcuts(false)} className="text-white/30 hover:text-white/60">
                    <X size={14} />
                  </button>
                </div>
                {[
                  { keys: ['⌘', 'K'], desc: 'Command palette' },
                  { keys: ['⌘', '0'], desc: 'Fit view to connected nodes' },
                  { keys: ['⌘', 'F'], desc: 'Search nodes' },
                  { keys: ['⌘', 'E'], desc: 'Export workflow' },
                  { keys: ['⌘', '/'], desc: 'Toggle this help' },
                  { keys: ['⌘', 'Z'], desc: 'Undo' },
                  { keys: ['⌘', '⇧', 'Z'], desc: 'Redo' },
                  { keys: ['Delete'], desc: 'Delete selected node' },
                  { keys: ['Escape'], desc: 'Close panel / deselect' },
                  { keys: ['Click edge'], desc: 'Change edge label' },
                  { keys: ['Drag connect'], desc: 'Create edge with label' },
                  { keys: ['Shift', 'Click'], desc: 'Multi-select nodes' },
                  { keys: ['Arrow keys'], desc: 'Navigate connected nodes' },
                  { keys: ['Double-click canvas'], desc: 'Create new node' },
                  { keys: ['Double-click label'], desc: 'Rename node' },
                  { keys: ['Right-click node'], desc: 'Node context menu' },
                  { keys: ['?'], desc: 'Open CID help' },
                ].map(({ keys, desc }) => (
                  <div key={desc} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                    <span className="text-[11px] text-white/50">{desc}</span>
                    <div className="flex items-center gap-1">
                      {keys.map(k => (
                        <kbd key={k} className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[10px] font-mono text-white/40">{k}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Command Palette */}
        <AnimatePresence>
          {showPalette && (
            <CommandPalette
              onClose={() => { setShowPalette(false); }}
              showCIDPanel={showCIDPanel}
              toggleCIDPanel={toggleCIDPanel}
              setShowSearch={setShowSearch}
              focusSearchInput={() => setTimeout(() => searchInputRef.current?.focus(), 50)}
              undo={undo}
              redo={redo}
              setShowShortcuts={setShowShortcuts}
              setShowLegend={setShowLegend}
              nodes={nodes}
              selectNode={selectNode}
            />
          )}
        </AnimatePresence>

        {/* Edge Color Legend — shows only labels actively used in the graph */}
        <AnimatePresence>
          {showLegend && (() => {
            const usedLabels = [...new Set(edges.map(e => typeof e.label === 'string' ? e.label : '').filter(Boolean))];
            const activeLabels = usedLabels.length > 0 ? usedLabels : EDGE_LABELS;
            const labelCounts = new Map<string, number>();
            edges.forEach(e => { const l = typeof e.label === 'string' ? e.label : ''; if (l) labelCounts.set(l, (labelCounts.get(l) || 0) + 1); });
            return (
              <motion.div
                key="legend"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-16 left-4 z-30 rounded-xl border border-white/[0.1] bg-[#0e0e18]/95 backdrop-blur-xl shadow-2xl p-3 w-[175px]"
              >
                <div className="text-[9px] text-white/30 uppercase tracking-wider font-medium mb-2">
                  {usedLabels.length > 0 ? `Active Labels (${usedLabels.length})` : 'Edge Labels'}
                </div>
                <div className="space-y-1">
                  {activeLabels.map(label => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-3 h-[2px] rounded-full flex-shrink-0" style={{ background: EDGE_LABEL_COLORS[label] || '#6366f1' }} />
                      <span className="text-[10px] text-white/50 flex-1">{label}</span>
                      {labelCounts.has(label) && (
                        <span className="text-[8px] text-white/20 font-mono">{labelCounts.get(label)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Shortcuts help button + Legend button */}
        {!isEmpty && (
          <div className="absolute bottom-4 left-4 z-20 flex gap-1.5">
            <button
              onClick={() => setShowShortcuts(true)}
              title="Keyboard shortcuts (⌘/)"
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/[0.08] text-white/25 hover:text-white/50 hover:bg-white/[0.08] transition-colors"
            >
              <HelpCircle size={13} />
            </button>
            {edges.length > 0 && (
              <button
                onClick={() => setShowLegend(prev => !prev)}
                title="Edge color legend"
                className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors ${
                  showLegend ? 'bg-white/[0.08] border-white/[0.15] text-white/60' : 'bg-white/[0.04] border-white/[0.08] text-white/25 hover:text-white/50 hover:bg-white/[0.08]'
                }`}
              >
                <span className="text-[10px] font-bold">E</span>
              </button>
            )}
          </div>
        )}

        {/* Multi-select action bar */}
        <AnimatePresence>
          {multiSelectedIds.size > 1 && (
            <motion.div
              key="multi-bar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/[0.1] bg-[#0e0e18]/95 backdrop-blur-xl shadow-2xl"
            >
              <span className="text-[11px] text-white/50 font-medium">{multiSelectedIds.size} selected</span>
              <div className="h-4 w-px bg-white/[0.08]" />
              {[
                { label: 'Activate', status: 'active' as const, color: '#22c55e' },
                { label: 'Mark stale', status: 'stale' as const, color: '#f59e0b' },
                { label: 'Lock', status: 'locked' as const, color: '#94a3b8' },
              ].map(({ label, status, color }) => (
                <button
                  key={status}
                  onClick={() => {
                    const store = useLifecycleStore.getState();
                    store.pushHistory();
                    multiSelectedIds.forEach(id => {
                      if (status === 'locked') store.lockNode(id);
                      else store.updateNodeStatus(id, status);
                    });
                    store.addEvent({ id: `ev-${Date.now()}`, type: 'edited' as any, message: `Batch ${label.toLowerCase()}: ${multiSelectedIds.size} nodes`, timestamp: Date.now() });
                    clearMultiSelect();
                  }}
                  className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[10px] font-medium hover:bg-white/[0.08] transition-colors"
                  style={{ color }}
                >
                  {label}
                </button>
              ))}
              <div className="h-4 w-px bg-white/[0.08]" />
              <button
                onClick={() => {
                  const names = nodes.filter(n => multiSelectedIds.has(n.id)).map(n => n.data.label).join(', ');
                  if (!window.confirm(`Delete ${multiSelectedIds.size} nodes (${names})?`)) return;
                  deleteMultiSelected();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-medium hover:bg-rose-500/20 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={clearMultiSelect}
                className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Overlays */}
        {mounted && !isEmpty && <NodeDetailPanel />}
        {mounted && !isEmpty && <ActivityPanel />}
        {mounted && contextMenu && <NodeContextMenu />}
        <AnimatePresence>
          {mounted && activeArtifactNodeId && <ArtifactPanel />}
        </AnimatePresence>
      </div>

      {/* CID Panel */}
      {mounted && showCIDPanel && <CIDPanel />}
    </div>
  );
}
