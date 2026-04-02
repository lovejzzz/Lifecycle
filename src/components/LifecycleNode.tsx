'use client';

import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, AlertTriangle, Loader2, Eye, Link, Upload, Play, Pencil } from 'lucide-react';
import type { NodeData } from '@/lib/types';
import { getNodeColors, CategoryIcon } from '@/lib/types';
import { useLifecycleStore } from '@/store/useStore';
import NodeHoverPreview from './NodeHoverPreview';

const STATUS_INDICATOR: Record<
  string,
  { icon: React.ElementType | null; color: string; pulse: boolean }
> = {
  active: { icon: null, color: '#22c55e', pulse: false },
  stale: { icon: AlertTriangle, color: '#f59e0b', pulse: true },
  pending: { icon: Loader2, color: '#6366f1', pulse: true },
  locked: { icon: Lock, color: '#94a3b8', pulse: false },
  generating: { icon: Loader2, color: '#06b6d4', pulse: true },
  reviewing: { icon: Eye, color: '#f43f5e', pulse: true },
};

function LifecycleNode({ data, id, dragging }: NodeProps) {
  const nodeData = data as NodeData;
  const {
    category,
    label,
    status,
    description,
    version,
    locked,
    sections,
    acceptedFileTypes,
    inputType,
    serviceName,
    serviceIcon,
    placeholder,
  } = nodeData;
  const colors = getNodeColors(category);
  const statusInfo = STATUS_INDICATOR[status] || STATUS_INDICATOR.active;
  const StatusIcon = statusInfo.icon;
  const isSelected = useLifecycleStore((s) => s.selectedNodeId === id);
  const updateNodeData = useLifecycleStore((s) => s.updateNodeData);
  const openArtifactPanel = useLifecycleStore((s) => s.openArtifactPanel);
  const updateNodeStatus = useLifecycleStore((s) => s.updateNodeStatus);
  const addEvent = useLifecycleStore((s) => s.addEvent);
  const addToast = useLifecycleStore((s) => s.addToast);
  const isMultiSelected = useLifecycleStore((s) => s.multiSelectedIds.has(id));
  const isImpactHighlighted = useLifecycleStore(
    (s) => s.impactPreview?.visible && s.impactPreview.selectedNodeIds.has(id),
  );
  const isImpactDimmed = useLifecycleStore(
    (s) =>
      s.impactPreview?.visible && !s.impactPreview.selectedNodeIds.has(id) && status !== 'stale',
  );
  const isImpactStaleUnselected = useLifecycleStore(
    (s) =>
      s.impactPreview?.visible && status === 'stale' && !s.impactPreview.selectedNodeIds.has(id),
  );
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
    for (const e of s.edges) {
      if (e.target === id) count++;
    }
    return count;
  });
  const outCount = totalConns - inCount;

  // Highlight pulse when node becomes selected (e.g. from search, breadcrumb, activity)
  const [showPulse, setShowPulse] = useState(false);
  const prevSelectedRef = useRef(isSelected);
  useEffect(() => {
    if (isSelected && !prevSelectedRef.current) {
      setShowPulse(true);
      const t = setTimeout(() => setShowPulse(false), 800);
      return () => clearTimeout(t);
    }
    prevSelectedRef.current = isSelected;
  }, [isSelected]);

  // Hover preview
  const [showHoverPreview, setShowHoverPreview] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<'above' | 'below'>('above');
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (isSelected || dragging) return;
    hoverTimerRef.current = setTimeout(() => {
      // Determine position: if node is in upper half of viewport, show below; else above
      if (nodeRef.current) {
        const rect = nodeRef.current.getBoundingClientRect();
        setHoverPosition(rect.top < window.innerHeight / 2 ? 'below' : 'above');
      }
      setShowHoverPreview(true);
    }, 500);
  }, [isSelected, dragging]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setShowHoverPreview(false);
  }, []);

  // Dismiss preview when node becomes selected or starts dragging
  useEffect(() => {
    if (isSelected || dragging) {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setShowHoverPreview(false);
    }
  }, [isSelected, dragging]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // File drop zone (input nodes only)
  const [isDragOver, setIsDragOver] = useState(false);
  const isInputCategory =
    category === 'input' || category === 'trigger' || category === 'dependency';

  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (!isInputCategory) return;

      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      // Validate file type
      const ext = file.name.toLowerCase().split('.').pop() ?? '';
      if (!['pdf', 'docx', 'txt', 'md', 'csv'].includes(ext)) {
        addToast(`Unsupported file: ${file.name}`, 'error');
        return;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();

        if (!res.ok) {
          addToast(data.message || 'Upload failed', 'error');
          return;
        }

        // Set the parsed text as the node's content
        const preview = data.text?.slice(0, 2000) || '';
        updateNodeData(id, {
          content:
            preview +
            (data.text?.length > 2000 ? '\n\n... (truncated — full document parsed)' : ''),
          label:
            label === 'Input' || label === 'Untitled' ? file.name.replace(/\.[^.]+$/, '') : label,
          description: `Uploaded: ${file.name} (${data.type}, ~${data.tokenEstimate} tokens, ${data.sections?.length ?? 0} sections)`,
        });
        addToast(`${file.name} loaded into "${label}"`, 'success');
        addEvent({
          id: `ev-${Date.now()}`,
          type: 'edited' as const,
          message: `Uploaded ${file.name} to "${label}"`,
          timestamp: Date.now(),
          nodeId: id,
        });
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
      }
    },
    [id, label, isInputCategory, updateNodeData, addEvent, addToast],
  );

  // Inline label editing
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingLabel) inputRef.current?.select();
  }, [editingLabel]);

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== label) {
      updateNodeData(id, { label: trimmed });
      addEvent({
        id: `ev-${Date.now()}`,
        type: 'edited' as const,
        message: `Renamed "${label}" → "${trimmed}"`,
        timestamp: Date.now(),
        nodeId: id,
      });
    } else {
      setLabelDraft(label);
    }
    setEditingLabel(false);
  };

  return (
    <motion.div
      ref={nodeRef}
      className={`group relative ${dragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
      aria-label={`${label} — ${category} node, status: ${status}${locked ? ', locked' : ''}`}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25, duration: 0.3 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDragOver={
        isInputCategory
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(true);
            }
          : undefined
      }
      onDragLeave={
        isInputCategory
          ? (e) => {
              e.preventDefault();
              setIsDragOver(false);
            }
          : undefined
      }
      onDrop={isInputCategory ? handleFileDrop : undefined}
    >
      <div
        className={`relative rounded-xl border backdrop-blur-2xl transition-all duration-300 hover:scale-[1.02]${
          status === 'generating' ? 'animate-pulse' : ''
        }`}
        style={{
          background: `linear-gradient(145deg, ${colors.bg}, rgba(10,10,18,0.92))`,
          borderColor: dragging
            ? colors.primary
            : isImpactHighlighted
              ? '#f59e0b'
              : isMultiSelected
                ? '#60a5fa'
                : isSelected
                  ? colors.primary
                  : status === 'generating'
                    ? colors.primary
                    : colors.border,
          outline: isMultiSelected ? '2px dashed rgba(96, 165, 250, 0.4)' : 'none',
          outlineOffset: '3px',
          boxShadow: dragging
            ? `0 0 32px ${colors.glow}, 0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px ${colors.primary}40`
            : isImpactHighlighted
              ? `0 0 24px rgba(245,158,11,0.3), 0 0 48px rgba(245,158,11,0.15), 0 4px 30px rgba(0,0,0,0.4)`
              : status === 'generating'
                ? `0 0 30px ${colors.glow}, 0 0 60px ${colors.glow}, 0 4px 30px rgba(0,0,0,0.4)`
                : isSelected
                  ? `0 0 24px ${colors.glow}, 0 4px 30px rgba(0,0,0,0.4)`
                  : `0 2px 20px rgba(0,0,0,0.3), 0 0 12px ${colors.glow}`,
          opacity: isImpactDimmed ? 0.35 : isImpactStaleUnselected ? 0.5 : 1,
          transform: dragging ? 'scale(1.04) rotate(-0.5deg)' : undefined,
          minWidth: 210,
          maxWidth: 270,
        }}
      >
        {/* File drop zone indicator */}
        {isDragOver && isInputCategory && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              background: 'rgba(6, 182, 212, 0.15)',
              border: '2px dashed rgba(6, 182, 212, 0.5)',
            }}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-cyan-400">
              <Upload size={14} />
              Drop file here
            </div>
          </motion.div>
        )}
        {/* Scroll-to highlight pulse ring */}
        {showPulse && (
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-xl"
            initial={{ boxShadow: `0 0 0 0px ${colors.primary}60`, opacity: 1 }}
            animate={{ boxShadow: `0 0 0 12px ${colors.primary}00`, opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        )}
        {/* Top accent line — CID-managed nodes get a cyan accent */}
        <div
          className="h-px rounded-t-xl opacity-80"
          style={{
            background: nodeData.artifactContract
              ? `linear-gradient(90deg, transparent 5%, #06b6d480, transparent 95%)`
              : `linear-gradient(90deg, transparent 5%, ${colors.primary}80, transparent 95%)`,
          }}
        />

        <div className="px-4 py-3">
          {/* Header */}
          <div className="mb-2 flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${colors.primary}18, ${colors.primary}08)`,
                border: `1px solid ${colors.primary}20`,
              }}
            >
              <CategoryIcon category={category} size={13} style={{ color: colors.primary }} />
            </div>
            <div className="min-w-0 flex-1">
              {editingLabel ? (
                <motion.input
                  ref={inputRef}
                  initial={{ opacity: 0.6, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.15 }}
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onBlur={commitLabel}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitLabel();
                    if (e.key === 'Escape') {
                      setLabelDraft(label);
                      setEditingLabel(false);
                    }
                  }}
                  className="nodrag w-full rounded border border-white/20 bg-white/10 px-1 py-0.5 text-[12.5px] leading-tight font-semibold text-white/90 outline-none"
                />
              ) : (
                <div
                  className="group/label flex cursor-text items-center gap-1"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setLabelDraft(label);
                    setEditingLabel(true);
                  }}
                  title="Double-click to rename"
                >
                  <span className="truncate text-[12.5px] leading-tight font-semibold text-white/90">
                    {label}
                  </span>
                  <Pencil
                    size={9}
                    className="flex-shrink-0 text-white/0 transition-colors duration-200 group-hover/label:text-white/30"
                  />
                </div>
              )}
              <div className="mt-0.5 text-[10px] font-medium tracking-[0.1em] text-white/50 uppercase">
                {category}
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              {locked && <Lock size={10} className="text-white/30" />}
              <div
                className="nodrag relative flex h-4 w-4 cursor-pointer items-center justify-center rounded-full transition-all hover:scale-125 hover:bg-white/10"
                role="button"
                aria-label={`Status: ${status} — click to cycle`}
                title={`Status: ${status} — click to cycle`}
                onClick={(e) => {
                  e.stopPropagation();
                  const cycle: NodeData['status'][] = [
                    'active',
                    'stale',
                    'pending',
                    'reviewing',
                    'locked',
                  ];
                  const idx = cycle.indexOf(status);
                  const next = cycle[(idx + 1) % cycle.length];
                  updateNodeStatus(id, next);
                  addEvent({
                    id: `ev-${Date.now()}`,
                    type: 'edited' as const,
                    message: `${label}: ${status} → ${next}`,
                    timestamp: Date.now(),
                    nodeId: id,
                  });
                }}
              >
                {statusInfo.pulse && (
                  <span
                    className="absolute inset-0 animate-ping rounded-full"
                    style={{ backgroundColor: statusInfo.color, opacity: 0.3 }}
                  />
                )}
                <span
                  className="relative h-[9px] w-[9px] rounded-full"
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
            <p className="mb-2 line-clamp-2 text-[10.5px] leading-relaxed text-white/50">
              {description}
            </p>
          )}

          {/* On-canvas content preview (execution result or content snippet) */}
          {status !== 'generating' &&
            (() => {
              const previewText = (nodeData.executionResult || nodeData.content || '')
                .replace(/^#+\s*/gm, '')
                .replace(/\*\*/g, '')
                .trim();
              if (!previewText) return null;
              const snippet =
                previewText.length > 80 ? previewText.slice(0, 80) + '...' : previewText;
              return (
                <div className="mb-2 border-t border-white/[0.06] pt-1.5">
                  <p className="line-clamp-3 overflow-hidden text-[10px] leading-[1.4] text-white/40">
                    {snippet}
                  </p>
                </div>
              );
            })()}

          {/* URL Input for service-linked nodes */}
          {inputType === 'url' && (
            <div
              className="nodrag mb-2 flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2"
              title={serviceName ? `Paste ${serviceName} link` : 'Paste URL'}
            >
              {serviceIcon && <span className="flex-shrink-0 text-[12px]">{serviceIcon}</span>}
              <span className="flex-1 truncate text-[10px] text-white/40">
                {placeholder || 'Paste link here...'}
              </span>
              <Link size={10} className="flex-shrink-0 text-white/20" />
            </div>
          )}

          {/* Service badge for output nodes */}
          {!inputType && serviceName && serviceIcon && (
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <span className="text-[11px]">{serviceIcon}</span>
              <span className="text-[9px] font-medium text-white/35">{serviceName}</span>
            </div>
          )}

          {/* Output format download badge */}
          {nodeData.outputFormat && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-cyan-500/[0.15] bg-cyan-500/[0.04] px-2 py-1.5">
              <span className="text-[11px]">{nodeData.serviceIcon || '📄'}</span>
              <span className="flex-1 text-[9px] font-medium text-cyan-400/60">
                {nodeData.outputFormatLabel || nodeData.outputFormat.toUpperCase()} Export
              </span>
              <span className="text-[8px] tracking-wider text-cyan-400/40 uppercase">
                ↓ download
              </span>
            </div>
          )}

          {/* File Drop Zone for file input nodes */}
          {inputType === 'file' && acceptedFileTypes && acceptedFileTypes.length > 0 && (
            <div
              className="nodrag mb-2 flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-white/[0.12] bg-white/[0.03] px-2.5 py-2 transition-all hover:border-white/[0.2] hover:bg-white/[0.06]"
              title={`Accepts: ${acceptedFileTypes.join(', ')}`}
            >
              <Upload size={12} className="text-white/35" />
              <span className="text-center text-[10px] leading-tight text-white/40">
                Drop files here
              </span>
              <span className="font-mono text-[9px] text-white/35">
                {acceptedFileTypes.slice(0, 4).join(' ')}
                {acceptedFileTypes.length > 4 ? ` +${acceptedFileTypes.length - 4}` : ''}
              </span>
            </div>
          )}

          {/* Content Preview */}
          {nodeData.content && !sections?.length && (
            <p className="mb-2 line-clamp-2 text-[10px] leading-relaxed text-white/40 italic">
              {nodeData.content.slice(0, 120)}
            </p>
          )}

          {/* Sections */}
          {sections && sections.length > 0 && (
            <div className="mb-2.5 space-y-[5px]">
              {sections.slice(0, 4).map((sec) => (
                <div key={sec.id} className="flex items-center gap-1.5">
                  <span
                    className="h-[5px] w-[5px] flex-shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        sec.status === 'current'
                          ? '#22c55e'
                          : sec.status === 'stale'
                            ? '#f59e0b'
                            : '#06b6d4',
                    }}
                  />
                  <span className="truncate text-[10px] text-white/40">{sec.title}</span>
                  {sec.status === 'stale' && (
                    <span className="ml-auto text-[8px] font-semibold tracking-wider text-amber-400/60 uppercase">
                      stale
                    </span>
                  )}
                  {sec.status === 'regenerating' && (
                    <Loader2 size={8} className="ml-auto animate-spin text-cyan-400" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress bar for nodes with sections */}
          {sections &&
            sections.length > 0 &&
            (() => {
              const current = sections.filter((s) => s.status === 'current').length;
              const pct = Math.round((current / sections.length) * 100);
              return (
                <div className="mb-1.5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[9px] text-white/40">
                      {current}/{sections.length} sections
                    </span>
                    <span className="font-mono text-[9px] text-white/40">{pct}%</span>
                  </div>
                  <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background:
                          pct === 100
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
            <div
              className={`mb-1.5 rounded-lg border px-2 py-1.5 ${
                nodeData.executionStatus === 'running'
                  ? 'border-cyan-500/20 bg-cyan-500/[0.04]'
                  : nodeData.executionStatus === 'success'
                    ? 'border-emerald-500/15 bg-emerald-500/[0.03]'
                    : 'border-rose-500/15 bg-rose-500/[0.03]'
              }`}
            >
              <div
                className={`flex items-center gap-1.5 ${
                  nodeData.executionStatus === 'running'
                    ? 'text-cyan-400/70'
                    : nodeData.executionStatus === 'success'
                      ? 'text-emerald-400/70'
                      : 'text-rose-400/70'
                }`}
              >
                {nodeData.executionStatus === 'running' && (
                  <Loader2 size={9} className="animate-spin" />
                )}
                <span className="flex-1 text-[9px] font-medium tracking-wider uppercase">
                  {nodeData.executionStatus === 'running'
                    ? ({
                        artifact: 'Generating...',
                        test: 'Testing...',
                        review: 'Reviewing...',
                        action: 'Running action...',
                        policy: 'Evaluating...',
                        input: 'Processing...',
                        trigger: 'Triggering...',
                        output: 'Producing output...',
                        patch: 'Patching...',
                        dependency: 'Resolving...',
                      }[category] ?? 'Executing...')
                    : nodeData.executionStatus === 'success'
                      ? '✓ Executed'
                      : '✗ Failed'}
                </span>
                {nodeData.executionResult && nodeData.executionStatus === 'success' && (
                  <span className="font-mono text-[8px] text-emerald-400/50">
                    {nodeData.executionResult.length > 1000
                      ? `${(nodeData.executionResult.length / 1000).toFixed(1)}k`
                      : `${nodeData.executionResult.length}`}{' '}
                    chars
                  </span>
                )}
              </div>
              {/* Running shimmer effect */}
              {nodeData.executionStatus === 'running' && (
                <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-cyan-500/[0.08]">
                  <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
                </div>
              )}
              {/* Result preview for success */}
              {nodeData.executionStatus === 'success' &&
                nodeData.executionResult &&
                (() => {
                  const clean = nodeData.executionResult
                    .replace(/^#+\s*/gm, '')
                    .replace(/\*\*/g, '')
                    .trim();
                  const lines = clean.split('\n').filter((l) => l.trim());
                  const firstLine = lines[0]?.slice(0, 120) || '';
                  const hasMore = clean.length > 120 || lines.length > 1;
                  return (
                    <div className="mt-1">
                      <p className="line-clamp-2 text-[8.5px] leading-relaxed text-white/25">
                        {firstLine}
                      </p>
                      {hasMore && (
                        <button
                          className="nodrag mt-0.5 text-[7.5px] text-cyan-400/40 transition-colors hover:text-cyan-400/70"
                          onClick={(e) => {
                            e.stopPropagation();
                            openArtifactPanel(id);
                          }}
                          title="Open artifact preview"
                        >
                          ↳ preview result
                        </button>
                      )}
                    </div>
                  );
                })()}
              {/* Error message */}
              {nodeData.executionStatus === 'error' && nodeData.executionError && (
                <p className="mt-1 line-clamp-1 text-[8px] text-rose-400/50">
                  {nodeData.executionError}
                </p>
              )}
              {/* Validation warnings badge */}
              {nodeData._validationWarnings && nodeData._validationWarnings.length > 0 && (
                <div
                  className="mt-1 flex items-center gap-1"
                  title={nodeData._validationWarnings.map((w) => w.message).join('\n')}
                >
                  <AlertTriangle size={8} className="text-amber-400/60" />
                  <span className="text-[7.5px] text-amber-400/50">
                    {nodeData._validationWarnings.length} warning
                    {nodeData._validationWarnings.length > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Content completeness indicator */}
          {['artifact', 'note', 'policy', 'state', 'input', 'output'].includes(category) &&
            !sections?.length &&
            (() => {
              const contentLen = (nodeData.content?.length || 0) + (description?.length || 0);
              const level = contentLen === 0 ? 'empty' : contentLen < 100 ? 'partial' : 'complete';
              const levelColor =
                level === 'complete'
                  ? '#22c55e'
                  : level === 'partial'
                    ? '#f59e0b'
                    : 'rgba(255,255,255,0.08)';
              const levelWidth = level === 'complete' ? '100%' : level === 'partial' ? '40%' : '0%';
              return (
                <div
                  className="mb-1.5"
                  title={
                    level === 'empty'
                      ? 'No content — click to add'
                      : level === 'partial'
                        ? 'Partial content'
                        : 'Content complete'
                  }
                >
                  <div className="h-[2px] overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: levelWidth, backgroundColor: levelColor }}
                    />
                  </div>
                </div>
              );
            })()}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/[0.04] pt-1">
            <div className="flex items-center gap-1.5">
              {version !== undefined && (
                <span className="font-mono text-[9px] tracking-wide text-white/40">v{version}</span>
              )}
              {nodeData.artifactContract && (
                <>
                  <span
                    className={`rounded px-1 py-px text-[8px] font-medium ${
                      nodeData.artifactContract.syncStatus === 'current'
                        ? 'bg-emerald-500/15 text-emerald-400/70'
                        : nodeData.artifactContract.syncStatus === 'stale'
                          ? 'bg-amber-500/15 text-amber-400/70'
                          : nodeData.artifactContract.syncStatus === 'override'
                            ? 'bg-blue-500/15 text-blue-400/70'
                            : 'bg-cyan-500/15 text-cyan-400/70'
                    }`}
                    title={`CID-managed · ${nodeData.artifactContract.syncStatus}${nodeData.artifactContract.userEdits.length > 0 ? ` · ${nodeData.artifactContract.userEdits.length} override(s)` : ''}${nodeData.artifactContract.lastSyncedAt ? ` · synced ${new Date(nodeData.artifactContract.lastSyncedAt).toLocaleTimeString()}` : ''}`}
                  >
                    🧠 {nodeData.artifactContract.syncStatus}
                  </span>
                  {nodeData.artifactContract.userEdits.length > 0 && (
                    <span
                      className="rounded bg-blue-500/10 px-1 py-px text-[7px] font-medium text-blue-400/60"
                      title={`${nodeData.artifactContract.userEdits.length} field(s) manually edited`}
                    >
                      override
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {nodeData.aiPrompt && (
                <span className="text-[8px] text-cyan-400/40" title="Has AI prompt">
                  ⚡
                </span>
              )}
              {totalConns > 0 && (
                <span
                  className={`flex items-center gap-0.5 text-[9px] ${
                    totalConns >= 4
                      ? 'text-cyan-400/50'
                      : totalConns >= 2
                        ? 'text-white/40'
                        : 'text-white/30'
                  }`}
                  title={`${inCount} upstream, ${outCount} downstream${totalConns >= 4 ? ' — hub node' : ''}`}
                >
                  {inCount > 0 && <span className="text-white/30">{inCount}↓</span>}
                  <Link
                    size={7}
                    className={totalConns >= 4 ? 'text-cyan-400/40' : 'text-white/30'}
                  />
                  {outCount > 0 && <span className="text-white/30">{outCount}↑</span>}
                  {totalConns >= 4 && (
                    <span className="ml-0.5 text-[7px] text-cyan-400/40">hub</span>
                  )}
                </span>
              )}
              <span className="text-[9px] tracking-wide text-white/40 capitalize">{status}</span>
              {/* Run Branch button — visible on hover when node has upstream deps */}
              {inCount > 0 && (
                <button
                  className="nodrag text-white/20 opacity-30 transition-all group-hover:opacity-100 hover:text-emerald-400/70"
                  onClick={(e) => {
                    e.stopPropagation();
                    useLifecycleStore.getState().executeBranch(id);
                  }}
                  title="Run this branch only"
                >
                  <Play size={10} />
                </button>
              )}
              {/* Preview button — visible on hover */}
              {(nodeData.content || nodeData.executionResult) && (
                <button
                  className="nodrag text-white/20 opacity-30 transition-all group-hover:opacity-100 hover:text-cyan-400/70"
                  onClick={(e) => {
                    e.stopPropagation();
                    openArtifactPanel(id);
                  }}
                  title="Open artifact preview"
                >
                  <Eye size={10} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hover preview card */}
      <AnimatePresence>
        {showHoverPreview && !editingLabel && (
          <NodeHoverPreview nodeData={nodeData} position={hoverPosition} />
        )}
      </AnimatePresence>

      <Handle
        type="target"
        position={Position.Left}
        className="!-left-[5px] !h-2.5 !w-2.5 !rounded-full !border-[1.5px]"
        style={{
          borderColor: colors.primary,
          backgroundColor: '#0a0a10',
          boxShadow: `0 0 6px ${colors.primary}40`,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!-right-[5px] !h-2.5 !w-2.5 !rounded-full !border-[1.5px]"
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
