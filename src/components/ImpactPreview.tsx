'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  CheckSquare,
  Square,
  Zap,
  AlertTriangle,
  ChevronRight,
  DollarSign,
} from 'lucide-react';
import { useLifecycleStore } from '@/store/useStore';
import { getCategoryIcon, getNodeColors } from '@/lib/types';
import { estimateBatchCost, formatCost } from '@/lib/cache';

export default function ImpactPreview() {
  const {
    impactPreview,
    hideImpactPreview,
    toggleImpactNodeSelection,
    selectAllImpactNodes,
    deselectAllImpactNodes,
    regenerateSelected,
    selectNode: _selectNode,
    isProcessing,
    setProcessing,
    cidAIModel,
  } = useLifecycleStore();

  if (!impactPreview || !impactPreview.visible) return null;

  const {
    staleNodes,
    executionOrder,
    estimatedCalls: _estimatedCalls,
    selectedNodeIds,
  } = impactPreview;
  const allSelected = selectedNodeIds.size === staleNodes.length;
  const noneSelected = selectedNodeIds.size === 0;

  const handleRegenerate = async () => {
    if (noneSelected || isProcessing) return;
    setProcessing(true);
    try {
      await regenerateSelected();
    } finally {
      setProcessing(false);
    }
  };

  const handleShiftRegenerate = async (e: React.MouseEvent) => {
    if (e.shiftKey) {
      // Quick-refresh: skip preview, regenerate all immediately
      selectAllImpactNodes();
      // Must read fresh state — noneSelected was captured before selectAll
      setProcessing(true);
      try {
        await regenerateSelected();
      } finally {
        setProcessing(false);
      }
    }
  };

  // Order stale nodes by execution order for display
  const orderedNodes = executionOrder
    .map((id) => staleNodes.find((n) => n.id === id))
    .filter(Boolean) as typeof staleNodes;

  // Estimate cost for selected nodes
  const selectedNodes = orderedNodes.filter((n) => selectedNodeIds.has(n.id));
  const costEstimate = estimateBatchCost(
    selectedNodes.map((n) => ({ promptLength: (n.label?.length || 20) * 10 + 500 })),
    cidAIModel,
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="fixed bottom-6 left-1/2 z-50 w-[420px] max-w-[90vw] -translate-x-1/2 rounded-2xl border border-amber-500/20 bg-[#0e0e18]/95 shadow-2xl shadow-amber-500/5 backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Impact Preview"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" />
            <span className="text-sm font-semibold text-white/90">Impact Preview</span>
            <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400/70">
              {staleNodes.length} stale
            </span>
          </div>
          <button
            onClick={hideImpactPreview}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
          >
            <X size={14} />
          </button>
        </div>

        {/* Node list */}
        <div className="max-h-[240px] overflow-y-auto px-3 pb-2">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <button
              onClick={allSelected ? deselectAllImpactNodes : selectAllImpactNodes}
              className="text-[10px] text-white/30 transition-colors hover:text-white/60"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-[10px] text-white/20">execution order {'\u2193'}</span>
          </div>
          <div className="space-y-1">
            {orderedNodes.map((node, idx) => {
              const selected = selectedNodeIds.has(node.id);
              const Icon = getCategoryIcon(node.category);
              const colors = getNodeColors(node.category);
              return (
                <div
                  key={node.id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-all ${
                    selected
                      ? 'border-amber-500/20 bg-amber-500/5'
                      : 'border-white/[0.04] bg-white/[0.02] opacity-50'
                  }`}
                  onClick={() => toggleImpactNodeSelection(node.id)}
                >
                  {selected ? (
                    <CheckSquare size={13} className="shrink-0 text-amber-400" />
                  ) : (
                    <Square size={13} className="shrink-0 text-white/20" />
                  )}
                  <span className="w-4 shrink-0 font-mono text-[10px] text-white/20">
                    {idx + 1}
                  </span>
                  <Icon size={12} style={{ color: colors.primary }} className="shrink-0" />
                  <span className="flex-1 truncate text-[11px] text-white/70">{node.label}</span>
                  <span className="shrink-0 text-[9px] text-white/20">{node.category}</span>
                  {idx < orderedNodes.length - 1 && (
                    <ChevronRight size={10} className="shrink-0 text-white/25" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-3 text-[10px] text-white/30">
            <span className="flex items-center gap-1">
              <Zap size={10} />
              {selectedNodeIds.size} call{selectedNodeIds.size !== 1 ? 's' : ''}
            </span>
            {selectedNodeIds.size > 0 && (
              <span className="flex items-center gap-1">
                <DollarSign size={10} />
                {formatCost(costEstimate.totalCostUSD)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={hideImpactPreview}
              className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/40 transition-colors hover:bg-white/[0.07] hover:text-white/60"
            >
              Cancel
            </button>
            <button
              onClick={(e) => {
                handleShiftRegenerate(e);
                if (!e.shiftKey) handleRegenerate();
              }}
              disabled={noneSelected || isProcessing}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-30"
              title="Hold Shift to skip preview next time"
            >
              <Play size={11} />
              Regenerate
              {selectedNodeIds.size < staleNodes.length ? ` (${selectedNodeIds.size})` : ' all'}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
