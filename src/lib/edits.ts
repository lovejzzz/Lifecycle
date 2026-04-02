/**
 * Edit classification — determines whether a change to a node's content
 * is cosmetic, local, semantic, or structural. Controls staleness propagation.
 *
 * Cosmetic: whitespace, punctuation, formatting only → no propagation
 * Local: key terms preserved, minor rewording → no propagation
 * Semantic: meaningful content changed → propagates staleness downstream
 * Structural: label, category, or connections changed → propagates + structural event
 *
 * All heuristic-based — no LLM calls. Designed to be "local-ready" for future
 * API-free deployment.
 */

export type EditType = 'cosmetic' | 'local' | 'semantic' | 'structural';

export interface EditClassification {
  type: EditType;
  reason: string;
  shouldPropagate: boolean;
}

/** Normalize text for comparison: strip markdown formatting, collapse whitespace */
function normalizeForComparison(text: string): string {
  return (
    text
      // Strip markdown formatting (bold, italic, headers, links, code blocks)
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      // Strip bullets and numbering
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

/** Extract key terms: words 4+ chars, excluding common stop words */
function extractKeyTerms(text: string): Set<string> {
  const stopWords = new Set([
    'this',
    'that',
    'with',
    'from',
    'have',
    'been',
    'will',
    'would',
    'could',
    'should',
    'about',
    'which',
    'their',
    'there',
    'these',
    'those',
    'other',
    'into',
    'also',
    'than',
    'then',
    'when',
    'what',
    'some',
    'each',
    'every',
    'more',
    'most',
    'such',
    'only',
    'very',
    'just',
    'over',
    'after',
    'before',
    'between',
    'through',
    'during',
    'without',
    'however',
    'because',
    'while',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w));

  return new Set(words);
}

/** Simple edit distance (Levenshtein) for short strings */
function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return matrix[a.length][b.length];
}

/** Fuzzy Jaccard similarity — terms within edit distance ≤ 2 count as matching */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const aArr = [...a];
  const bArr = [...b];

  // For each term in a, check if it has a fuzzy match in b
  let matchCount = 0;
  const matchedB = new Set<string>();
  for (const termA of aArr) {
    if (b.has(termA)) {
      matchCount++;
      matchedB.add(termA);
    } else {
      // Fuzzy: find closest term in b within edit distance 2
      for (const termB of bArr) {
        if (!matchedB.has(termB) && editDistance(termA, termB) <= 2) {
          matchCount++;
          matchedB.add(termB);
          break;
        }
      }
    }
  }

  const unionSize = new Set([...a, ...b]).size;
  return unionSize === 0 ? 1 : matchCount / unionSize;
}

/**
 * Classify an edit to a node's data.
 *
 * @param oldContent - previous content text
 * @param newContent - updated content text (undefined if unchanged)
 * @param oldLabel - previous node label
 * @param newLabel - updated label (undefined if unchanged)
 * @param oldCategory - previous node category
 * @param newCategory - updated category (undefined if unchanged)
 */
export function classifyEdit(
  oldContent: string,
  newContent: string | undefined,
  oldLabel: string,
  newLabel: string | undefined,
  oldCategory: string,
  newCategory: string | undefined,
): EditClassification {
  // Structural: label or category changed
  if (newCategory !== undefined && newCategory !== oldCategory) {
    return {
      type: 'structural',
      reason: `Category changed: ${oldCategory} → ${newCategory}`,
      shouldPropagate: true,
    };
  }
  if (newLabel !== undefined && newLabel !== oldLabel) {
    return {
      type: 'structural',
      reason: `Label changed: "${oldLabel}" → "${newLabel}"`,
      shouldPropagate: true,
    };
  }

  // No content change
  if (newContent === undefined || newContent === oldContent) {
    return { type: 'cosmetic', reason: 'No content change', shouldPropagate: false };
  }

  // Cosmetic: normalized text is identical (whitespace/formatting only)
  const oldNorm = normalizeForComparison(oldContent);
  const newNorm = normalizeForComparison(newContent);
  if (oldNorm === newNorm) {
    return {
      type: 'cosmetic',
      reason: 'Formatting/whitespace change only',
      shouldPropagate: false,
    };
  }

  // Cosmetic: typo fix — only 1-2 characters changed in normalized form
  const normDist = editDistance(oldNorm, newNorm);
  if (normDist <= 2 && oldNorm.length > 10) {
    return {
      type: 'cosmetic',
      reason: `Typo fix (${normDist} char${normDist > 1 ? 's' : ''} changed)`,
      shouldPropagate: false,
    };
  }

  // Extract key terms for local vs semantic distinction
  const oldTerms = extractKeyTerms(oldContent);
  const newTerms = extractKeyTerms(newContent);
  const similarity = jaccardSimilarity(oldTerms, newTerms);

  // Length change ratio
  const lengthRatio =
    oldContent.length > 0
      ? Math.abs(newContent.length - oldContent.length) / oldContent.length
      : newContent.length > 0
        ? 1
        : 0;

  // Detect high-impact education keywords added/removed (not just present in both)
  const HIGH_IMPACT_PATTERNS = [
    /\b(?:learning\s+)?objectives?\b/i,
    /\b(?:rubric|criteria|grading)\b/i,
    /\b(?:assessment|evaluation|exam|quiz|test)\b/i,
    /\b(?:prerequisite|requirement|outcome)\b/i,
    /\b(?:deadline|due\s+date|schedule|timeline)\b/i,
  ];
  const oldMatchedIdx = new Set(
    HIGH_IMPACT_PATTERNS.map((p, i) => (p.test(oldContent) ? i : -1)).filter((i) => i >= 0),
  );
  const newMatchedIdx = new Set(
    HIGH_IMPACT_PATTERNS.map((p, i) => (p.test(newContent) ? i : -1)).filter((i) => i >= 0),
  );
  const highImpactAdded = [...newMatchedIdx].some((i) => !oldMatchedIdx.has(i));
  const highImpactRemoved = [...oldMatchedIdx].some((i) => !newMatchedIdx.has(i));

  // If high-impact terms were added or removed, force semantic even if overlap is high
  if (highImpactAdded || highImpactRemoved) {
    const action = highImpactAdded ? 'added' : 'removed';
    return {
      type: 'semantic',
      reason: `High-impact education terms ${action}`,
      shouldPropagate: true,
    };
  }

  // Detect numeric value changes (grade weights, percentages, counts)
  const oldNumbers = (oldNorm.match(/\d+/g) || []).join(',');
  const newNumbers = (newNorm.match(/\d+/g) || []).join(',');
  const numbersChanged = oldNumbers !== newNumbers && oldNumbers.length > 0;

  // Local: high term overlap AND small length change — minor rewording
  // But if numbers changed, don't classify as local (could be grade weights, dates, etc.)
  if (similarity >= 0.7 && lengthRatio < 0.3 && !numbersChanged) {
    return {
      type: 'local',
      reason: `Minor rewording (${Math.round(similarity * 100)}% term overlap)`,
      shouldPropagate: false,
    };
  }

  // Local: content grew but all old terms preserved (appending examples/details)
  if (similarity >= 0.4 && newContent.length > oldContent.length && !numbersChanged) {
    const oldArr = [...oldTerms];
    const allOldPreserved = oldArr.every((t) => newTerms.has(t));
    if (allOldPreserved && oldTerms.size >= 3) {
      const newOnlyTerms = [...newTerms].filter((t) => !oldTerms.has(t));
      // Check if addition is illustrative (example/note) or introduces new structural sections
      const isIllustrative = /\b(?:for example|e\.g\.|for instance|such as|note:|hint:)\b/i.test(
        newContent,
      );
      const addedNewSections = /^#{1,6}\s+/m.test(newContent.slice(oldContent.length));
      // Stricter ratio for short content (small term sets are sensitive to additions)
      const maxNewRatio = oldTerms.size <= 6 ? 0.3 : 0.5;
      // Local if: few new terms OR illustrative language, but NOT if it adds new sections
      if (
        !addedNewSections &&
        (newOnlyTerms.length <= oldTerms.size * maxNewRatio || isIllustrative)
      ) {
        return {
          type: 'local',
          reason: `Details/examples added (all ${oldTerms.size} key terms preserved)`,
          shouldPropagate: false,
        };
      }
    }
  }

  // Semantic: meaningful content change (default)
  const detail =
    similarity < 0.3
      ? 'Major content rewrite'
      : similarity < 0.6
        ? 'Significant content change'
        : 'Content modified with new key terms';
  return {
    type: 'semantic',
    reason: `${detail} (${Math.round(similarity * 100)}% term overlap)`,
    shouldPropagate: true,
  };
}
