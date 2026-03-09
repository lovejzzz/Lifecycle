'use client';

import React from 'react';
import { Check, Undo2 } from 'lucide-react';
import { computeDiff, diffSummary, formatDiffSummary } from '@/lib/diff';
import type { DiffLine } from '@/lib/diff';

interface DiffViewProps {
  oldText: string;
  newText: string;
  /** Called when user accepts the new version (keeps current) */
  onAccept?: () => void;
  /** Called when user reverts to old version */
  onRevert?: () => void;
  /** Compact mode for inline use in NodeDetailPanel */
  compact?: boolean;
  /** Max lines to show before truncation (default: 50) */
  maxLines?: number;
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const colors = {
    added: 'bg-emerald-500/[0.08] text-emerald-300/80',
    removed: 'bg-rose-500/[0.08] text-rose-300/80 line-through',
    unchanged: 'text-white/30',
  };
  const prefix = { added: '+', removed: '-', unchanged: ' ' };
  const lineNum = line.type === 'removed' ? line.oldLineNum : line.newLineNum;

  return (
    <div className={`flex font-mono text-[10px] leading-[18px] ${colors[line.type]}`}>
      <span className="w-7 text-right pr-1.5 text-white/15 select-none shrink-0">
        {lineNum ?? ''}
      </span>
      <span className="w-3 text-center select-none shrink-0 text-white/20">
        {prefix[line.type]}
      </span>
      <span className="flex-1 px-1 whitespace-pre-wrap break-all">
        {line.content || '\u00a0'}
      </span>
    </div>
  );
}

export default function DiffView({
  oldText,
  newText,
  onAccept,
  onRevert,
  compact = false,
  maxLines = 50,
}: DiffViewProps) {
  const lines = computeDiff(oldText, newText);
  const summary = diffSummary(lines);
  const truncated = lines.length > maxLines;
  const displayLines = truncated ? lines.slice(0, maxLines) : lines;

  if (summary.identical) {
    return (
      <div className="text-[10px] text-white/25 italic px-3 py-2">
        No changes detected
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-white/[0.06] overflow-hidden ${compact ? '' : 'max-h-[400px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.06]">
        <span className="text-[9px] text-white/30 font-medium tracking-wide uppercase">
          Changes: {formatDiffSummary(summary)}
        </span>
        <div className="flex items-center gap-1.5">
          {onRevert && (
            <button
              onClick={onRevert}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-rose-400/60 bg-rose-500/[0.06] border border-rose-500/10 hover:bg-rose-500/[0.12] transition-colors"
              title="Revert to previous version"
            >
              <Undo2 size={8} />
              Revert
            </button>
          )}
          {onAccept && (
            <button
              onClick={onAccept}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-emerald-400/60 bg-emerald-500/[0.06] border border-emerald-500/10 hover:bg-emerald-500/[0.12] transition-colors"
              title="Accept changes"
            >
              <Check size={8} />
              Accept
            </button>
          )}
        </div>
      </div>

      {/* Diff lines */}
      <div className={`overflow-y-auto ${compact ? 'max-h-[150px]' : 'max-h-[350px]'}`}>
        {displayLines.map((line, i) => (
          <DiffLineRow key={i} line={line} />
        ))}
        {truncated && (
          <div className="text-[9px] text-white/20 text-center py-1 bg-white/[0.02]">
            ... {lines.length - maxLines} more lines
          </div>
        )}
      </div>
    </div>
  );
}
