'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Lock, CheckCircle, AlertTriangle, Zap, Trash2, X } from 'lucide-react';
import { useLifecycleStore } from '@/store/useStore';

export default function BatchToolbar() {
  const multiSelectedIds = useLifecycleStore((s) => s.multiSelectedIds);
  const clearMultiSelect = useLifecycleStore((s) => s.clearMultiSelect);
  const deleteMultiSelected = useLifecycleStore((s) => s.deleteMultiSelected);
  const nodes = useLifecycleStore((s) => s.nodes);
  const selectedNodeId = useLifecycleStore((s) => s.selectedNodeId);
  const leftPanelOpen = !!selectedNodeId;

  const count = multiSelectedIds.size;

  const actions = [
    {
      label: 'Lock All',
      icon: Lock,
      color: '#94a3b8',
      bgHover: 'hover:bg-slate-500/20',
      border: 'border-slate-500/20',
      bg: 'bg-slate-500/10',
      handler: () => {
        const store = useLifecycleStore.getState();
        store.pushHistory();
        multiSelectedIds.forEach((id) => store.lockNode(id));
        store.addEvent({
          id: `ev-${Date.now()}`,
          type: 'edited' as any,
          message: `Batch lock: ${count} nodes`,
          timestamp: Date.now(),
        });
        clearMultiSelect();
      },
    },
    {
      label: 'Approve All',
      icon: CheckCircle,
      color: '#22c55e',
      bgHover: 'hover:bg-emerald-500/20',
      border: 'border-emerald-500/20',
      bg: 'bg-emerald-500/10',
      handler: () => {
        const store = useLifecycleStore.getState();
        store.pushHistory();
        multiSelectedIds.forEach((id) => store.approveNode(id));
        store.addEvent({
          id: `ev-${Date.now()}`,
          type: 'edited' as any,
          message: `Batch approve: ${count} nodes`,
          timestamp: Date.now(),
        });
        clearMultiSelect();
      },
    },
    {
      label: 'Activate',
      icon: Zap,
      color: '#3b82f6',
      bgHover: 'hover:bg-blue-500/20',
      border: 'border-blue-500/20',
      bg: 'bg-blue-500/10',
      handler: () => {
        const store = useLifecycleStore.getState();
        store.pushHistory();
        multiSelectedIds.forEach((id) => store.updateNodeStatus(id, 'active'));
        store.addEvent({
          id: `ev-${Date.now()}`,
          type: 'edited' as any,
          message: `Batch activate: ${count} nodes`,
          timestamp: Date.now(),
        });
        clearMultiSelect();
      },
    },
    {
      label: 'Mark Stale',
      icon: AlertTriangle,
      color: '#f59e0b',
      bgHover: 'hover:bg-amber-500/20',
      border: 'border-amber-500/20',
      bg: 'bg-amber-500/10',
      handler: () => {
        const store = useLifecycleStore.getState();
        store.pushHistory();
        multiSelectedIds.forEach((id) => store.updateNodeStatus(id, 'stale'));
        store.addEvent({
          id: `ev-${Date.now()}`,
          type: 'edited' as any,
          message: `Batch mark stale: ${count} nodes`,
          timestamp: Date.now(),
        });
        clearMultiSelect();
      },
    },
    {
      label: 'Delete All',
      icon: Trash2,
      color: '#f43f5e',
      bgHover: 'hover:bg-rose-500/20',
      border: 'border-rose-500/20',
      bg: 'bg-rose-500/10',
      handler: () => {
        const names = nodes
          .filter((n) => multiSelectedIds.has(n.id))
          .map((n) => n.data.label)
          .join(', ');
        if (!window.confirm(`Delete ${count} nodes (${names})?`)) return;
        deleteMultiSelected();
      },
    },
  ];

  return (
    <AnimatePresence>
      {count > 1 && (
        <motion.div
          key="batch-toolbar"
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.95 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className={`absolute bottom-16 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/[0.1] bg-[#0e0e18]/95 backdrop-blur-xl shadow-xl transition-all ${leftPanelOpen ? 'left-[calc(50%+160px)]' : 'left-1/2'}`}
        >
          {/* Selection count */}
          <span className="text-[11px] text-white/50 font-semibold tracking-wide tabular-nums">
            {count} selected
          </span>

          <div className="h-4 w-px bg-white/[0.08]" />

          {/* Action buttons */}
          {actions.map(({ label, icon: Icon, color, bgHover, border, bg, handler }) => (
            <button
              key={label}
              onClick={handler}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full ${bg} border ${border} text-[10px] font-medium ${bgHover} transition-colors cursor-pointer`}
              style={{ color }}
              title={label}
            >
              <Icon size={12} strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}

          <div className="h-4 w-px bg-white/[0.08]" />

          {/* Deselect */}
          <button
            onClick={clearMultiSelect}
            className="flex items-center gap-1 px-2 py-1.5 rounded-full text-[10px] text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-colors cursor-pointer"
            title="Deselect all"
          >
            <X size={12} strokeWidth={2} />
            <span>Deselect</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
