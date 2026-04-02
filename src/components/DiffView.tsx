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
      <span className="w-7 shrink-0 pr-1.5 text-right text-white/30 select-none">
        {lineNum ?? ''}
      </span>
      <span className="w-3 shrink-0 text-center text-white/20 select-none">
        {prefix[line.type]}
      </span>
      <span className="flex-1 px-1 break-all whitespace-pre-wrap">{line.content || '\u00a0'}</span>
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
    return <div className="px-3 py-2 text-[10px] text-white/25 italic">No changes detected</div>;
  }

  return (
    <div
      className={`overflow-hidden rounded-lg border border-white/[0.06] ${compact ? '' : 'max-h-[400px]'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
        <span className="text-[9px] font-medium tracking-wide text-white/30 uppercase">
          Changes: {formatDiffSummary(summary)}
        </span>
        <div className="flex items-center gap-1.5">
          {onRevert && (
            <button
              onClick={onRevert}
              className="flex items-center gap-1 rounded border border-rose-500/10 bg-rose-500/[0.06] px-2 py-0.5 text-[9px] text-rose-400/60 transition-colors hover:bg-rose-500/[0.12]"
              title="Revert to previous version"
            >
              <Undo2 size={8} />
              Revert
            </button>
          )}
          {onAccept && (
            <button
              onClick={onAccept}
              className="flex items-center gap-1 rounded border border-emerald-500/10 bg-emerald-500/[0.06] px-2 py-0.5 text-[9px] text-emerald-400/60 transition-colors hover:bg-emerald-500/[0.12]"
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
          <div className="bg-white/[0.02] py-1 text-center text-[9px] text-white/20">
            ... {lines.length - maxLines} more lines
          </div>
        )}
      </div>
    </div>
  );
}
