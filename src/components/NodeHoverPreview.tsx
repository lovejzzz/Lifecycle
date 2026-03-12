'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { NodeData } from '@/lib/types';
import { getNodeColors, CategoryIcon } from '@/lib/types';

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  stale: '#f59e0b',
  pending: '#6366f1',
  locked: '#94a3b8',
  generating: '#06b6d4',
  reviewing: '#f43f5e',
};

interface NodeHoverPreviewProps {
  nodeData: NodeData;
  position: 'above' | 'below';
}

export default function NodeHoverPreview({ nodeData, position }: NodeHoverPreviewProps) {
  const { label, category, status, description, version, content, executionResult } = nodeData;
  const colors = getNodeColors(category);
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.active;

  const contentPreview = content ? content.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim().slice(0, 300) : '';
  const resultPreview = executionResult ? executionResult.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim().slice(0, 300) : '';

  // If there's almost nothing to show beyond what the node already displays, skip
  const hasExtra = description || contentPreview.length > 80 || resultPreview.length > 80 || nodeData.artifactContract;
  if (!hasExtra && !executionResult) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: position === 'above' ? 6 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: position === 'above' ? 6 : -6 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="absolute left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
      style={{
        [position === 'above' ? 'bottom' : 'top']: 'calc(100% + 10px)',
        maxWidth: 320,
        minWidth: 220,
      }}
    >
      <div
        className="rounded-lg border shadow-xl backdrop-blur-md overflow-hidden"
        style={{
          background: 'rgba(26, 26, 46, 0.95)',
          borderColor: `${colors.primary}30`,
          boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 12px ${colors.glow}`,
        }}
      >
        {/* Accent line */}
        <div
          className="h-px opacity-70"
          style={{ background: `linear-gradient(90deg, transparent 5%, ${colors.primary}80, transparent 95%)` }}
        />

        <div className="px-3 py-2.5 space-y-2">
          {/* Header: label + category badge + status */}
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
              style={{
                background: `${colors.primary}15`,
                border: `1px solid ${colors.primary}25`,
              }}
            >
              <CategoryIcon category={category} size={11} style={{ color: colors.primary }} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-semibold text-white/90 leading-tight block truncate">
                {label}
              </span>
            </div>
            <span
              className="text-[8px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{
                color: `${colors.primary}cc`,
                background: `${colors.primary}15`,
                border: `1px solid ${colors.primary}20`,
              }}
            >
              {category}
            </span>
          </div>

          {/* Status + version row */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className="w-[6px] h-[6px] rounded-full"
                style={{ backgroundColor: statusColor }}
              />
              <span className="text-[9px] text-white/40 capitalize">{status}</span>
            </div>
            {version !== undefined && (
              <span className="text-[8px] text-white/25 font-mono ml-auto">v{version}</span>
            )}
          </div>

          {/* Description */}
          {description && (
            <p className="text-[9.5px] text-white/40 leading-relaxed line-clamp-3">
              {description}
            </p>
          )}

          {/* Content preview */}
          {contentPreview && (
            <div className="border-t border-white/[0.06] pt-1.5">
              <span className="text-[8px] text-white/20 uppercase tracking-wider font-medium block mb-0.5">Content</span>
              <p className="text-[9px] text-white/35 leading-relaxed line-clamp-4">
                {contentPreview}{contentPreview.length >= 300 ? '...' : ''}
              </p>
            </div>
          )}

          {/* Execution result preview */}
          {resultPreview && (
            <div className="border-t border-white/[0.06] pt-1.5">
              <span className="text-[8px] text-emerald-400/40 uppercase tracking-wider font-medium block mb-0.5">Result</span>
              <p className="text-[9px] text-white/35 leading-relaxed line-clamp-4">
                {resultPreview}{resultPreview.length >= 300 ? '...' : ''}
              </p>
            </div>
          )}

          {/* CID Artifact Contract preview */}
          {nodeData.artifactContract && (
            <div className="border-t border-white/[0.06] pt-1.5">
              <span className="text-[8px] text-cyan-400/40 uppercase tracking-wider font-medium block mb-0.5">CID Contract</span>
              <div className="space-y-0.5">
                <p className="text-[9px] text-white/35">
                  <span className="text-white/20">Type:</span> {nodeData.artifactContract.artifactType}
                </p>
                {nodeData.artifactContract.derivedFields.length > 0 && (
                  <p className="text-[9px] text-white/35">
                    <span className="text-white/20">Fields:</span> {nodeData.artifactContract.derivedFields.map(f => f.field).join(', ')}
                  </p>
                )}
                <p className="text-[9px] text-white/35">
                  <span className="text-white/20">Status:</span>{' '}
                  <span className={
                    nodeData.artifactContract.syncStatus === 'current' ? 'text-emerald-400/60' :
                    nodeData.artifactContract.syncStatus === 'stale' ? 'text-amber-400/60' :
                    nodeData.artifactContract.syncStatus === 'override' ? 'text-blue-400/60' :
                    'text-cyan-400/60'
                  }>{nodeData.artifactContract.syncStatus}</span>
                </p>
                {nodeData.artifactContract.userEdits.length > 0 && (
                  <p className="text-[9px] text-blue-400/50">
                    {nodeData.artifactContract.userEdits.length} override{nodeData.artifactContract.userEdits.length > 1 ? 's' : ''}
                  </p>
                )}
                {nodeData.artifactContract.lastSyncedAt > 0 && (
                  <p className="text-[8px] text-white/20">
                    Synced: {new Date(nodeData.artifactContract.lastSyncedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
