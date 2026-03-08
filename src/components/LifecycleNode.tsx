'use client';

import React, { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import {
  Lock, AlertTriangle, Loader2, Eye, Link, Upload,
} from 'lucide-react';
import type { NodeData } from '@/lib/types';
import { getNodeColors, getCategoryIcon } from '@/lib/types';
import { useLifecycleStore } from '@/store/useStore';

const STATUS_INDICATOR: Record<string, { icon: React.ElementType | null; color: string; pulse: boolean }> = {
  active: { icon: null, color: '#22c55e', pulse: false },
  stale: { icon: AlertTriangle, color: '#f59e0b', pulse: true },
  pending: { icon: Loader2, color: '#6366f1', pulse: true },
  locked: { icon: Lock, color: '#94a3b8', pulse: false },
  generating: { icon: Loader2, color: '#06b6d4', pulse: true },
  reviewing: { icon: Eye, color: '#f43f5e', pulse: true },
};

function LifecycleNode({ data, id }: NodeProps) {
  const nodeData = data as NodeData;
  const { category, label, status, description, version, locked, sections, acceptedFileTypes, inputType, serviceName, serviceIcon, placeholder } = nodeData;
  const colors = getNodeColors(category);
  const Icon = getCategoryIcon(category);
  const statusInfo = STATUS_INDICATOR[status] || STATUS_INDICATOR.active;
  const StatusIcon = statusInfo.icon;
  const selectNode = useLifecycleStore((s) => s.selectNode);
  const isSelected = useLifecycleStore((s) => s.selectedNodeId === id);
  const updateNodeData = useLifecycleStore((s) => s.updateNodeData);
  const updateNodeStatus = useLifecycleStore((s) => s.updateNodeStatus);
  const addEvent = useLifecycleStore((s) => s.addEvent);
  const isMultiSelected = useLifecycleStore((s) => s.multiSelectedIds.has(id));
  // Derive connection count with a stable selector to avoid re-render on unrelated edge changes
  const totalConns = useLifecycleStore((s) => {
    let count = 0;
    for (const e of s.edges) {
      if (e.source === id || e.target === id) count++;
    }
    return count;
  });
  const inCount = useLifecycleStore((s) => {
    let count = 0;
    for (const e of s.edges) { if (e.target === id) count++; }
    return count;
  });
  const outCount = totalConns - inCount;

  // Inline label editing
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingLabel) inputRef.current?.select(); }, [editingLabel]);

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== label) {
      updateNodeData(id, { label: trimmed });
      addEvent({ id: `ev-${Date.now()}`, type: 'edited' as const, message: `Renamed "${label}" → "${trimmed}"`, timestamp: Date.now(), nodeId: id });
    } else {
      setLabelDraft(label);
    }
    setEditingLabel(false);
  };

  return (
    <motion.div
      className="group cursor-pointer"
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25, duration: 0.3 }}
    >
      <div
        className={`relative rounded-xl border backdrop-blur-2xl transition-all duration-300 hover:scale-[1.02]${
          status === 'generating' ? ' animate-pulse' : ''
        }`}
        style={{
          background: `linear-gradient(145deg, ${colors.bg}, rgba(10,10,18,0.92))`,
          borderColor: isMultiSelected ? '#60a5fa' : isSelected ? colors.primary : status === 'generating' ? colors.primary : colors.border,
          outline: isMultiSelected ? '2px dashed rgba(96, 165, 250, 0.4)' : 'none',
          outlineOffset: '3px',
          boxShadow: status === 'generating'
            ? `0 0 30px ${colors.glow}, 0 0 60px ${colors.glow}, 0 4px 30px rgba(0,0,0,0.4)`
            : isSelected
              ? `0 0 24px ${colors.glow}, 0 4px 30px rgba(0,0,0,0.4)`
              : `0 2px 20px rgba(0,0,0,0.3), 0 0 12px ${colors.glow}`,
          minWidth: 210,
          maxWidth: 270,
        }}
      >
        {/* Top accent line */}
        <div
          className="h-px rounded-t-xl opacity-80"
          style={{ background: `linear-gradient(90deg, transparent 5%, ${colors.primary}80, transparent 95%)` }}
        />

        <div className="px-4 py-3">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${colors.primary}18, ${colors.primary}08)`,
                border: `1px solid ${colors.primary}20`,
              }}
            >
              <Icon size={13} style={{ color: colors.primary }} />
            </div>
            <div className="flex-1 min-w-0">
              {editingLabel ? (
                <input
                  ref={inputRef}
                  value={labelDraft}
                  onChange={e => setLabelDraft(e.target.value)}
                  onBlur={commitLabel}
                  onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setLabelDraft(label); setEditingLabel(false); } }}
                  className="text-[12.5px] font-semibold text-white/90 leading-tight bg-white/10 rounded px-1 py-0.5 border border-white/20 outline-none w-full nodrag"
                />
              ) : (
                <div
                  className="text-[12.5px] font-semibold text-white/90 truncate leading-tight"
                  onDoubleClick={(e) => { e.stopPropagation(); setLabelDraft(label); setEditingLabel(true); }}
                  title="Double-click to rename"
                >
                  {label}
                </div>
              )}
              <div className="text-[9px] text-white/30 uppercase tracking-[0.1em] font-medium mt-0.5">
                {category}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {locked && <Lock size={10} className="text-white/30" />}
              <div
                className="relative flex items-center justify-center w-4 h-4 cursor-pointer hover:scale-125 transition-transform nodrag"
                title={`Status: ${status} — click to cycle`}
                onClick={(e) => {
                  e.stopPropagation();
                  const cycle: NodeData['status'][] = ['active', 'stale', 'pending', 'reviewing', 'locked'];
                  const idx = cycle.indexOf(status);
                  const next = cycle[(idx + 1) % cycle.length];
                  updateNodeStatus(id, next);
                  addEvent({ id: `ev-${Date.now()}`, type: 'edited' as const, message: `${label}: ${status} → ${next}`, timestamp: Date.now(), nodeId: id });
                }}
              >
                {statusInfo.pulse && (
                  <span
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{ backgroundColor: statusInfo.color, opacity: 0.3 }}
                  />
                )}
                <span
                  className="w-[7px] h-[7px] rounded-full relative"
                  style={{ backgroundColor: statusInfo.color }}
                />
              </div>
              {StatusIcon && (
                <StatusIcon
                  size={11}
                  style={{ color: statusInfo.color }}
                  className={status === 'generating' || status === 'pending' ? 'animate-spin' : ''}
                />
              )}
            </div>
          </div>

          {/* Description */}
          {description && (
            <p className="text-[10.5px] text-white/35 leading-relaxed mb-2 line-clamp-2">
              {description}
            </p>
          )}

          {/* URL Input for service-linked nodes */}
          {inputType === 'url' && (
            <div
              className="mb-2 rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 flex items-center gap-2 nodrag"
              title={serviceName ? `Paste ${serviceName} link` : 'Paste URL'}
            >
              {serviceIcon && <span className="text-[12px] flex-shrink-0">{serviceIcon}</span>}
              <span className="text-[9px] text-white/25 truncate flex-1">
                {placeholder || 'Paste link here...'}
              </span>
              <Link size={10} className="text-white/20 flex-shrink-0" />
            </div>
          )}

          {/* Service badge for output nodes */}
          {!inputType && serviceName && serviceIcon && (
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <span className="text-[11px]">{serviceIcon}</span>
              <span className="text-[9px] text-white/35 font-medium">{serviceName}</span>
            </div>
          )}

          {/* Output format download badge */}
          {nodeData.outputFormat && (
            <div className="mb-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-cyan-500/[0.15] bg-cyan-500/[0.04]">
              <span className="text-[11px]">{nodeData.serviceIcon || '📄'}</span>
              <span className="text-[9px] text-cyan-400/60 font-medium flex-1">
                {nodeData.outputFormatLabel || nodeData.outputFormat.toUpperCase()} Export
              </span>
              <span className="text-[8px] text-cyan-400/40 uppercase tracking-wider">↓ download</span>
            </div>
          )}

          {/* File Drop Zone for file input nodes */}
          {inputType === 'file' && acceptedFileTypes && acceptedFileTypes.length > 0 && (
            <div
              className="mb-2 rounded-lg border border-dashed border-white/[0.12] bg-white/[0.03] px-2.5 py-2 flex flex-col items-center gap-1 cursor-pointer hover:bg-white/[0.06] hover:border-white/[0.2] transition-all nodrag"
              title={`Accepts: ${acceptedFileTypes.join(', ')}`}
            >
              <Upload size={12} className="text-white/25" />
              <span className="text-[9px] text-white/30 text-center leading-tight">
                Drop files here
              </span>
              <span className="text-[8px] text-white/20 font-mono">
                {acceptedFileTypes.slice(0, 4).join(' ')}
                {acceptedFileTypes.length > 4 ? ` +${acceptedFileTypes.length - 4}` : ''}
              </span>
            </div>
          )}

          {/* Content Preview */}
          {nodeData.content && !sections?.length && (
            <p className="text-[9.5px] text-white/25 leading-relaxed mb-2 line-clamp-2 italic">
              {nodeData.content.slice(0, 120)}
            </p>
          )}

          {/* Sections */}
          {sections && sections.length > 0 && (
            <div className="space-y-[5px] mb-2.5">
              {sections.slice(0, 4).map((sec) => (
                <div key={sec.id} className="flex items-center gap-1.5">
                  <span
                    className="w-[5px] h-[5px] rounded-full flex-shrink-0"
                    style={{
                      backgroundColor:
                        sec.status === 'current' ? '#22c55e'
                        : sec.status === 'stale' ? '#f59e0b'
                        : '#06b6d4',
                    }}
                  />
                  <span className="text-[10px] text-white/40 truncate">{sec.title}</span>
                  {sec.status === 'stale' && (
                    <span className="text-[8px] text-amber-400/60 font-semibold ml-auto uppercase tracking-wider">stale</span>
                  )}
                  {sec.status === 'regenerating' && (
                    <Loader2 size={8} className="text-cyan-400 animate-spin ml-auto" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress bar for nodes with sections */}
          {sections && sections.length > 0 && (() => {
            const current = sections.filter(s => s.status === 'current').length;
            const pct = Math.round((current / sections.length) * 100);
            return (
              <div className="mb-1.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] text-white/25">{current}/{sections.length} sections</span>
                  <span className="text-[8px] text-white/25 font-mono">{pct}%</span>
                </div>
                <div className="h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: pct === 100
                        ? '#22c55e'
                        : `linear-gradient(90deg, ${colors.primary}, ${colors.primary}80)`,
                    }}
                  />
                </div>
              </div>
            );
          })()}

          {/* Execution status indicator */}
          {nodeData.executionStatus && nodeData.executionStatus !== 'idle' && (
            <div className={`mb-1.5 rounded-lg border px-2 py-1.5 ${
              nodeData.executionStatus === 'running'
                ? 'border-cyan-500/20 bg-cyan-500/[0.04]'
                : nodeData.executionStatus === 'success'
                  ? 'border-emerald-500/15 bg-emerald-500/[0.03]'
                  : 'border-rose-500/15 bg-rose-500/[0.03]'
            }`}>
              <div className={`flex items-center gap-1.5 ${
                nodeData.executionStatus === 'running' ? 'text-cyan-400/70' :
                nodeData.executionStatus === 'success' ? 'text-emerald-400/70' :
                'text-rose-400/70'
              }`}>
                {nodeData.executionStatus === 'running' && <Loader2 size={9} className="animate-spin" />}
                <span className="text-[8px] font-medium uppercase tracking-wider flex-1">
                  {nodeData.executionStatus === 'running' ? 'Executing...' :
                   nodeData.executionStatus === 'success' ? '✓ Executed' : '✗ Failed'}
                </span>
                {nodeData.executionResult && nodeData.executionStatus === 'success' && (
                  <span className="text-[7px] text-emerald-400/40 font-mono">
                    {nodeData.executionResult.length > 1000
                      ? `${(nodeData.executionResult.length / 1000).toFixed(1)}k`
                      : `${nodeData.executionResult.length}`} chars
                  </span>
                )}
              </div>
              {/* Running shimmer effect */}
              {nodeData.executionStatus === 'running' && (
                <div className="mt-1.5 h-[3px] rounded-full bg-cyan-500/[0.08] overflow-hidden">
                  <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent animate-[shimmer_1.5s_ease-in-out_infinite]" />
                </div>
              )}
              {/* Result preview for success */}
              {nodeData.executionStatus === 'success' && nodeData.executionResult && (() => {
                const clean = nodeData.executionResult.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim();
                const lines = clean.split('\n').filter(l => l.trim());
                const firstLine = lines[0]?.slice(0, 120) || '';
                const hasMore = clean.length > 120 || lines.length > 1;
                return (
                  <div className="mt-1">
                    <p className="text-[8.5px] text-white/25 leading-relaxed line-clamp-2">{firstLine}</p>
                    {hasMore && (
                      <button
                        className="text-[7.5px] text-cyan-400/40 hover:text-cyan-400/70 mt-0.5 nodrag transition-colors"
                        onClick={(e) => { e.stopPropagation(); selectNode(id); }}
                        title="Click to view full result in side panel"
                      >
                        ↳ view full result
                      </button>
                    )}
                  </div>
                );
              })()}
              {/* Error message */}
              {nodeData.executionStatus === 'error' && nodeData.executionError && (
                <p className="text-[8px] text-rose-400/50 mt-1 line-clamp-1">
                  {nodeData.executionError}
                </p>
              )}
            </div>
          )}

          {/* Content completeness indicator */}
          {['artifact', 'note', 'policy', 'state', 'input', 'output'].includes(category) && !sections?.length && (() => {
            const contentLen = (nodeData.content?.length || 0) + (description?.length || 0);
            const level = contentLen === 0 ? 'empty' : contentLen < 100 ? 'partial' : 'complete';
            const levelColor = level === 'complete' ? '#22c55e' : level === 'partial' ? '#f59e0b' : 'rgba(255,255,255,0.08)';
            const levelWidth = level === 'complete' ? '100%' : level === 'partial' ? '40%' : '0%';
            return (
              <div className="mb-1.5" title={level === 'empty' ? 'No content — click to add' : level === 'partial' ? 'Partial content' : 'Content complete'}>
                <div className="h-[2px] rounded-full bg-white/[0.04] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: levelWidth, backgroundColor: levelColor }} />
                </div>
              </div>
            );
          })()}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
            {version !== undefined && (
              <span className="text-[8px] text-white/20 font-mono tracking-wide">v{version}</span>
            )}
            <div className="flex items-center gap-2">
              {nodeData.aiPrompt && (
                <span className="text-[8px] text-cyan-400/40" title="Has AI prompt">⚡</span>
              )}
              {totalConns > 0 && (
                <span className={`text-[8px] flex items-center gap-0.5 ${
                  totalConns >= 4 ? 'text-cyan-400/50' : totalConns >= 2 ? 'text-white/30' : 'text-white/20'
                }`} title={`${inCount} upstream, ${outCount} downstream${totalConns >= 4 ? ' — hub node' : ''}`}>
                  {inCount > 0 && <span className="text-white/20">{inCount}↓</span>}
                  <Link size={7} className={totalConns >= 4 ? 'text-cyan-400/40' : 'text-white/15'} />
                  {outCount > 0 && <span className="text-white/20">{outCount}↑</span>}
                  {totalConns >= 4 && <span className="text-[7px] text-cyan-400/40 ml-0.5">hub</span>}
                </span>
              )}
              <span className="text-[8px] text-white/20 capitalize tracking-wide">{status}</span>
            </div>
          </div>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !border-[1.5px] !rounded-full !-left-[5px]"
        style={{
          borderColor: colors.primary,
          backgroundColor: '#0a0a10',
          boxShadow: `0 0 6px ${colors.primary}40`,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !border-[1.5px] !rounded-full !-right-[5px]"
        style={{
          borderColor: colors.primary,
          backgroundColor: '#0a0a10',
          boxShadow: `0 0 6px ${colors.primary}40`,
        }}
      />
    </motion.div>
  );
}

export default memo(LifecycleNode);
