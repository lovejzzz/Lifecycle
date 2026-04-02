/**
 * Semantic Diff — line-level LCS diff with no external dependencies.
 * Used for comparing node content versions before/after regeneration.
 */

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  /** Original line number (1-based) in old text, undefined for added lines */
  oldLineNum?: number;
  /** Original line number (1-based) in new text, undefined for removed lines */
  newLineNum?: number;
}

export interface DiffSummary {
  added: number;
  removed: number;
  unchanged: number;
  /** true if old and new are identical */
  identical: boolean;
}

/**
 * Compute a line-level diff between two texts using LCS (Longest Common Subsequence).
 * Returns an array of DiffLines with type markers and line numbers.
 */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  if (oldText === newText) {
    return oldText.split('\n').map((line, i) => ({
      type: 'unchanged' as const,
      content: line,
      oldLineNum: i + 1,
      newLineNum: i + 1,
    }));
  }

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  // Use flat array for performance: dp[i][j] = dp[i * (n+1) + j]
  const dp = new Uint16Array((m + 1) * (n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i * (n + 1) + j] = dp[(i - 1) * (n + 1) + (j - 1)] + 1;
      } else {
        dp[i * (n + 1) + j] = Math.max(dp[(i - 1) * (n + 1) + j], dp[i * (n + 1) + (j - 1)]);
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m,
    j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'unchanged', content: oldLines[i - 1], oldLineNum: i, newLineNum: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i * (n + 1) + (j - 1)] >= dp[(i - 1) * (n + 1) + j])) {
      result.push({ type: 'added', content: newLines[j - 1], newLineNum: j });
      j--;
    } else {
      result.push({ type: 'removed', content: oldLines[i - 1], oldLineNum: i });
      i--;
    }
  }

  return result.reverse();
}

/**
 * Compute a summary of the diff (counts of each line type).
 */
export function diffSummary(lines: DiffLine[]): DiffSummary {
  let added = 0,
    removed = 0,
    unchanged = 0;
  for (const line of lines) {
    if (line.type === 'added') added++;
    else if (line.type === 'removed') removed++;
    else unchanged++;
  }
  return { added, removed, unchanged, identical: added === 0 && removed === 0 };
}

/**
 * Format a diff as a compact text summary (for CID messages).
 */
export function formatDiffSummary(summary: DiffSummary): string {
  if (summary.identical) return 'No changes';
  const parts: string[] = [];
  if (summary.added > 0) parts.push(`+${summary.added} line${summary.added > 1 ? 's' : ''}`);
  if (summary.removed > 0) parts.push(`-${summary.removed} line${summary.removed > 1 ? 's' : ''}`);
  return parts.join(', ');
}
