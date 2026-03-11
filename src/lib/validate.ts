/**
 * Output quality validation — keyword extraction, overlap scoring, category-specific rules.
 *
 * Advisory only: validation never blocks execution, only warns.
 */

// ─── Stopwords ───────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'it', 'its', 'this',
  'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me',
  'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'not', 'no', 'nor', 'if', 'then', 'else', 'so', 'as', 'up', 'out',
  'about', 'into', 'over', 'after', 'before', 'between', 'under',
  'again', 'further', 'once', 'here', 'there', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only',
  'own', 'same', 'than', 'too', 'very', 'just', 'also',
]);

// ─── Keyword Extraction ──────────────────────────────────────────────────────

/** Extract meaningful keywords from text (stopword removal + lowercasing) */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/** Compute keyword overlap score between two texts (0-1) */
export function overlapScore(textA: string, textB: string): number {
  const kwA = new Set(extractKeywords(textA));
  const kwB = new Set(extractKeywords(textB));
  if (kwA.size === 0 || kwB.size === 0) return 0;
  let overlap = 0;
  for (const kw of kwA) {
    if (kwB.has(kw)) overlap++;
  }
  return overlap / Math.min(kwA.size, kwB.size);
}

// ─── Validation Warnings ─────────────────────────────────────────────────────

export interface ValidationWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning';
}

// ─── Category-specific Validation Rules ──────────────────────────────────────

/** Minimum expected output lengths per category (chars) */
const MIN_LENGTHS: Record<string, number> = {
  artifact: 200,
  deliverable: 200,
  process: 100,
  cid: 100,
  action: 50,
  review: 100,
  test: 100,
  policy: 80,
  patch: 40,
};

/** Maximum expected output lengths per category (chars) */
const MAX_LENGTHS: Record<string, number> = {
  action: 8000,
  patch: 4000,
};

/** Keywords that suggest placeholder/stub content */
const PLACEHOLDER_PATTERNS = [
  /\[insert\b/i,
  /\[your\b/i,
  /\[todo\b/i,
  /lorem ipsum/i,
  /placeholder/i,
  /\[fill in\b/i,
  /\[add\s/i,
  /TBD\b/,
  /TODO\b/,
  /FIXME\b/,
];

/** Check for generic/boilerplate opening lines */
const BOILERPLATE_STARTS = [
  /^(sure|certainly|of course|absolutely)[,!.]/i,
  /^(here is|here's|below is|i've created|i have created)/i,
  /^(as requested|as you asked|per your request)/i,
];

/**
 * Validate LLM output for a given node category.
 * Returns advisory warnings — never blocks execution.
 */
export function validateOutput(
  output: string,
  category: string,
  label: string,
  promptKeywords?: string[],
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const trimmed = output.trim();

  // 1. Empty output
  if (trimmed.length === 0) {
    warnings.push({ code: 'empty-output', message: 'Output is empty', severity: 'warning' });
    return warnings; // no point checking further
  }

  // 2. Too short for category
  const minLen = MIN_LENGTHS[category];
  if (minLen && trimmed.length < minLen) {
    warnings.push({
      code: 'too-short',
      message: `Output is short for ${category} (${trimmed.length} chars, expected ≥${minLen})`,
      severity: 'warning',
    });
  }

  // 3. Too long for category
  const maxLen = MAX_LENGTHS[category];
  if (maxLen && trimmed.length > maxLen) {
    warnings.push({
      code: 'too-long',
      message: `Output is unusually long for ${category} (${trimmed.length} chars)`,
      severity: 'info',
    });
  }

  // 4. Placeholder content
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) {
      warnings.push({
        code: 'placeholder',
        message: `Contains placeholder text: "${trimmed.match(pattern)?.[0]}"`,
        severity: 'warning',
      });
      break; // one warning is enough
    }
  }

  // 5. Boilerplate opening (LLM preamble leaked through)
  for (const pattern of BOILERPLATE_STARTS) {
    if (pattern.test(trimmed)) {
      warnings.push({
        code: 'boilerplate-opening',
        message: 'Starts with conversational preamble — may not be direct output',
        severity: 'info',
      });
      break;
    }
  }

  // 6. Low keyword relevance to prompt
  if (promptKeywords && promptKeywords.length > 0) {
    const outputKw = new Set(extractKeywords(trimmed));
    let hits = 0;
    for (const kw of promptKeywords) {
      if (outputKw.has(kw.toLowerCase())) hits++;
    }
    const relevance = hits / promptKeywords.length;
    if (relevance < 0.15 && promptKeywords.length >= 3) {
      warnings.push({
        code: 'low-relevance',
        message: `Output has low keyword overlap with prompt (${Math.round(relevance * 100)}%)`,
        severity: 'warning',
      });
    }
  }

  // 7. Category-specific structural checks
  if (category === 'review' || category === 'test') {
    // Reviews/tests should contain some evaluation language
    const evalPatterns = /\b(pass|fail|approve|reject|issue|concern|good|bad|correct|incorrect|error|warning|valid|invalid)\b/i;
    if (!evalPatterns.test(trimmed)) {
      warnings.push({
        code: 'missing-evaluation',
        message: `${category} output lacks evaluation language (pass/fail/approve/reject)`,
        severity: 'info',
      });
    }
  }

  if (category === 'policy') {
    // Policy nodes should define conditions
    const policyPatterns = /\b(if|when|must|shall|require|condition|rule|prohibit|allow|deny)\b/i;
    if (!policyPatterns.test(trimmed)) {
      warnings.push({
        code: 'missing-conditions',
        message: 'Policy output lacks conditional language (if/when/must/require)',
        severity: 'info',
      });
    }
  }

  if (category === 'patch') {
    // Patches should contain code-like content
    const codePatterns = /[{}\[\]();]|```|function |const |let |var |import |class |def |return /;
    if (!codePatterns.test(trimmed)) {
      warnings.push({
        code: 'missing-code',
        message: 'Patch output lacks code patterns — may not be a valid code change',
        severity: 'info',
      });
    }
  }

  return warnings;
}
