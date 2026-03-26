'use client';

import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, AlertTriangle, Loader2, Eye, Link, Upload, Play, Pencil,
} from 'lucide-react';
import type { NodeData } from '@/lib/types';
import { getNodeColors, CategoryIcon } from '@/lib/types';
import { useLifecycleStore } from '@/store/useStore';
import NodeHoverPreview from './NodeHoverPreview';

const STATUS_INDICATOR: Record<string, { icon: React.ElementType | null; color: string; pulse: boolean }> = {
  active: { icon: null, color: '#22c55e', pulse: false },
  stale: { icon: AlertTriangle, color: '#f59e0b', pulse: true },
  pending: { icon: Loader2, color: '#6366f1', pulse: true },
  locked: { icon: Lock, color: '#94a3b8', pulse: false },
  generating: { icon: Loader2, color: '#06b6d4', pulse: true },
  reviewing: { icon: Eye, color: '#f43f5e', pulse: true },
};

function LifecycleNode({ data, id, dragging }: NodeProps) {
  const nodeData = data as NodeData;
  const { category, label, status, description, version, locked, sections, acceptedFileTypes, inputType, serviceName, serviceIcon, placeholder } = nodeData;
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
  const isImpactHighlighted = useLifecycleStore((s) => s.impactPreview?.visible && s.impactPreview.selectedNodeIds.has(id));
  const isImpactDimmed = useLifecycleStore((s) => s.impactPreview?.visible && !s.impactPreview.selectedNodeIds.has(id) && status !== 'stale');
  const isImpactStaleUnselected = useLifecycleStore((s) => s.impactPreview?.visible && status === 'stale' && !s.impactPreview.selectedNodeIds.has(id));
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
  const isInputCategory = category === 'input' || category === 'trigger' || category === 'dependency';

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
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
        content: preview + (data.text?.length > 2000 ? '\n\n... (truncated — full document parsed)' : ''),
        label: label === 'Input' || label === 'Untitled' ? file.name.replace(/\.[^.]+$/, '') : label,
        description: `Uploaded: ${file.name} (${data.type}, ~${data.tokenEstimate} tokens, ${data.sections?.length ?? 0} sections)`,
      });
      addToast(`${file.name} loaded into "${label}"`, 'success');
      addEvent({ id: `ev-${Date.now()}`, type: 'edited' as const, message: `Uploaded ${file.name} to "${label}"`, timestamp: Date.now(), nodeId: id });
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    }
  }, [id, label, isInputCategory, updateNodeData, addEvent, addToast]);

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
      ref={nodeRef}
      className={`group relative ${dragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
      aria-label={`${label} — ${category} node, status: ${status}${locked ? ', locked' : ''}`}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25, duration: 0.3 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDragOver={isInputCategory ? (e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); } : undefined}
      onDragLeave={isInputCategory ? (e) => { e.preventDefault(); setIsDragOver(false); } : undefined}
      onDrop={isInputCategory ? handleFileDrop : undefined}
    >
      <div
        className={`relative rounded-xl border backdrop-blur-2xl transition-all duration-300 hover:scale-[1.02]${
          status === 'generating' ? ' animate-pulse' : ''
        }`}
        style={{
          background: `linear-gradient(145deg, ${colors.bg}, rgba(10,10,18,0.92))`,
          borderColor: dragging ? colors.primary : isImpactHighlighted ? '#f59e0b' : isMultiSelected ? '#60a5fa' : isSelected ? colors.primary : status === 'generating' ? colors.primary : colors.border,
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
            className="absolute inset-0 rounded-xl pointer-events-none z-10 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ background: 'rgba(6, 182, 212, 0.15)', border: '2px dashed rgba(6, 182, 212, 0.5)' }}
          >
            <div className="flex items-center gap-1.5 text-cyan-400 text-[11px] font-medium">
              <Upload size={14} />
              Drop file here
            </div>
          </motion.div>
        )}
        {/* Scroll-to highlight pulse ring */}
        {showPulse && (
          <motion.div
            className="absolute inset-0 rounded-xl pointer-events-none"
            initial={{ boxShadow: `0 0 0 0px ${colors.primary}60`, opacity: 1 }}
            animate={{ boxShadow: `0 0 0 12px ${colors.primary}00`, opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        )}
        {/* Top accent line — CID-managed nodes get a cyan accent */}
        <div
          className="h-px rounded-t-xl opacity-80"
          style={{ background: nodeData.artifactContract
            ? `linear-gradient(90deg, transparent 5%, #06b6d480, transparent 95%)`
            : `linear-gradient(90deg, transparent 5%, ${colors.primary}80, transparent 95%)` }}
        />

        <div className="px-4 py-3">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-2">
            <motion.div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${colors.primary}18, ${colors.primary}08)`,
                border: `1px solid ${colors.primary}20`,
              }}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            >
              <CategoryIcon category={category} size={13} style={{ color: colors.primary }} />
            </motion.div>
            <div className="flex-1 min-w-0">
              {editingLabel ? (
                <motion.input
                  ref={inputRef}
                  initial={{ opacity: 0.6, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.15 }}
                  value={labelDraft}
                  onChange={e => setLabelDraft(e.target.value)}
                  onBlur={commitLabel}
                  onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setLabelDraft(label); setEditingLabel(false); } }}
                  className="text-[12.5px] font-semibold text-white/90 leading-tight bg-white/10 rounded px-1 py-0.5 border border-white/20 outline-none w-full nodrag"
                />
              ) : (
                <div
                  className="group/label flex items-center gap-1 cursor-text"
                  onDoubleClick={(e) => { e.stopPropagation(); setLabelDraft(label); setEditingLabel(true); }}
                  title="Double-click to rename"
                >
                  <span className="text-[12.5px] font-semibold text-white/90 truncate leading-tight">
                    {label}
                  </span>
                  <Pencil size={9} className="flex-shrink-0 text-white/0 group-hover/label:text-white/30 transition-colors duration-200" />
                </div>
              )}
              <div className="text-[10px] text-white/50 uppercase tracking-[0.1em] font-medium mt-0.5">
                {category}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {locked && <Lock size={10} className="text-white/30" />}
              <motion.div
                className="relative flex items-center justify-center w-4 h-4 rounded-full cursor-pointer hover:bg-white/10 transition-colors nodrag"
                role="button"
                aria-label={`Status: ${status} — click to cycle`}
                title={`Status: ${status} — click to cycle`}
                whileHover={{ scale: 1.25 }}
                whileTap={{ scale: 0.75, transition: { duration: 0.08 } }}
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
                  className="w-[9px] h-[9px] rounded-full relative"
                  style={{ backgroundColor: statusInfo.color }}
                />
              </motion.div>
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
            <p className="text-[10.5px] text-white/50 leading-relaxed mb-2 line-clamp-2">
              {description}
            </p>
          )}

          {/* On-canvas content preview (execution result or content snippet) */}
          {status !== 'generating' && (() => {
            const previewText = (nodeData.executionResult || nodeData.content || '').replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim();
            if (!previewText) return null;
            const snippet = previewText.length > 80 ? previewText.slice(0, 80) + '...' : previewText;
            return (
              <div className="mb-2 pt-1.5 border-t border-white/[0.06]">
                <p className="text-[10px] text-white/40 leading-[1.4] line-clamp-3 overflow-hidden">
                  {snippet}
                </p>
              </div>
            );
          })()}

          {/* URL Input for service-linked nodes */}
          {inputType === 'url' && (
            <div
              className="mb-2 rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 flex items-center gap-2 nodrag"
              title={serviceName ? `Paste ${serviceName} link` : 'Paste URL'}
            >
              {serviceIcon && <span className="text-[12px] flex-shrink-0">{serviceIcon}</span>}
              <span className="text-[10px] text-white/40 truncate flex-1">
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
              <Upload size={12} className="text-white/35" />
              <span className="text-[10px] text-white/40 text-center leading-tight">
                Drop files here
              </span>
              <span className="text-[9px] text-white/35 font-mono">
                {acceptedFileTypes.slice(0, 4).join(' ')}
                {acceptedFileTypes.length > 4 ? ` +${acceptedFileTypes.length - 4}` : ''}
              </span>
            </div>
          )}

          {/* Content Preview */}
          {nodeData.content && !sections?.length && (
            <p className="text-[10px] text-white/40 leading-relaxed mb-2 line-clamp-2 italic">
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
                  <span className="text-[9px] text-white/40">{current}/{sections.length} sections</span>
                  <span className="text-[9px] text-white/40 font-mono">{pct}%</span>
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
                <span className="text-[9px] font-medium uppercase tracking-wider flex-1">
                  {nodeData.executionStatus === 'running'
                    ? ({ artifact: 'Generating...', test: 'Testing...', review: 'Reviewing...', action: 'Running action...', policy: 'Evaluating...', input: 'Processing...', trigger: 'Triggering...', output: 'Producing output...', patch: 'Patching...', dependency: 'Resolving...' }[category] ?? 'Executing...')
                    : nodeData.executionStatus === 'success' ? '✓ Executed' : '✗ Failed'}
                </span>
                {nodeData.executionResult && nodeData.executionStatus === 'success' && (
                  <span className="text-[8px] text-emerald-400/50 font-mono">
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
                        onClick={(e) => { e.stopPropagation(); openArtifactPanel(id); }}
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
                <p className="text-[8px] text-rose-400/50 mt-1 line-clamp-1">
                  {nodeData.executionError}
                </p>
              )}
              {/* Validation warnings badge */}
              {nodeData._validationWarnings && nodeData._validationWarnings.length > 0 && (
                <div className="flex items-center gap-1 mt-1" title={nodeData._validationWarnings.map(w => w.message).join('\n')}>
                  <AlertTriangle size={8} className="text-amber-400/60" />
                  <span className="text-[7.5px] text-amber-400/50">
                    {nodeData._validationWarnings.length} warning{nodeData._validationWarnings.length > 1 ? 's' : ''}
                  </span>
                </div>
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
            <div className="flex items-center gap-1.5">
              {version !== undefined && (
                <span className="text-[9px] text-white/40 font-mono tracking-wide">v{version}</span>
              )}
              {nodeData.artifactContract && (
                <>
                  <span className={`text-[8px] px-1 py-px rounded font-medium ${
                    nodeData.artifactContract.syncStatus === 'current' ? 'bg-emerald-500/15 text-emerald-400/70' :
                    nodeData.artifactContract.syncStatus === 'stale' ? 'bg-amber-500/15 text-amber-400/70' :
                    nodeData.artifactContract.syncStatus === 'override' ? 'bg-blue-500/15 text-blue-400/70' :
                    'bg-cyan-500/15 text-cyan-400/70'
                  }`} title={`CID-managed · ${nodeData.artifactContract.syncStatus}${nodeData.artifactContract.userEdits.length > 0 ? ` · ${nodeData.artifactContract.userEdits.length} override(s)` : ''}${nodeData.artifactContract.lastSyncedAt ? ` · synced ${new Date(nodeData.artifactContract.lastSyncedAt).toLocaleTimeString()}` : ''}`}>
                    🧠 {nodeData.artifactContract.syncStatus}
                  </span>
                  {nodeData.artifactContract.userEdits.length > 0 && (
                    <span className="text-[7px] px-1 py-px rounded bg-blue-500/10 text-blue-400/60 font-medium" title={`${nodeData.artifactContract.userEdits.length} field(s) manually edited`}>
                      override
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {nodeData.aiPrompt && (
                <span className="text-[8px] text-cyan-400/40" title="Has AI prompt">⚡</span>
              )}
              {totalConns > 0 && (
                <span className={`text-[9px] flex items-center gap-0.5 ${
                  totalConns >= 4 ? 'text-cyan-400/50' : totalConns >= 2 ? 'text-white/40' : 'text-white/30'
                }`} title={`${inCount} upstream, ${outCount} downstream${totalConns >= 4 ? ' — hub node' : ''}`}>
                  {inCount > 0 && <span className="text-white/30">{inCount}↓</span>}
                  <Link size={7} className={totalConns >= 4 ? 'text-cyan-400/40' : 'text-white/30'} />
                  {outCount > 0 && <span className="text-white/30">{outCount}↑</span>}
                  {totalConns >= 4 && <span className="text-[7px] text-cyan-400/40 ml-0.5">hub</span>}
                </span>
              )}
              <span className="text-[9px] text-white/40 capitalize tracking-wide">{status}</span>
              {/* Run Branch button — visible on hover when node has upstream deps */}
              {inCount > 0 && (
                <motion.button
                  className="opacity-30 group-hover:opacity-100 text-white/20 hover:text-emerald-400/70 transition-colors nodrag"
                  onClick={(e) => { e.stopPropagation(); useLifecycleStore.getState().executeBranch(id); }}
                  title="Run this branch only"
                  whileHover={{ scale: 1.25, y: -1 }}
                  whileTap={{ scale: 0.8 }}
                >
                  <Play size={10} />
                </motion.button>
              )}
              {/* Preview button — visible on hover */}
              {(nodeData.content || nodeData.executionResult) && (
                <motion.button
                  className="opacity-30 group-hover:opacity-100 text-white/20 hover:text-cyan-400/70 transition-colors nodrag"
                  onClick={(e) => { e.stopPropagation(); openArtifactPanel(id); }}
                  title="Open artifact preview"
                  whileHover={{ scale: 1.25, y: -1 }}
                  whileTap={{ scale: 0.8 }}
                >
                  <Eye size={10} />
                </motion.button>
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
