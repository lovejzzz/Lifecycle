/**
 * Output quality validation — keyword extraction, overlap scoring, category-specific rules.
 *
 * Advisory only: validation never blocks execution, only warns.
 */

// ─── Stopwords ───────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'we',
  'they',
  'me',
  'him',
  'her',
  'us',
  'them',
  'my',
  'your',
  'his',
  'our',
  'their',
  'what',
  'which',
  'who',
  'whom',
  'when',
  'where',
  'why',
  'how',
  'not',
  'no',
  'nor',
  'if',
  'then',
  'else',
  'so',
  'as',
  'up',
  'out',
  'about',
  'into',
  'over',
  'after',
  'before',
  'between',
  'under',
  'again',
  'further',
  'once',
  'here',
  'there',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'only',
  'own',
  'same',
  'than',
  'too',
  'very',
  'just',
  'also',
]);

// ─── Keyword Extraction ──────────────────────────────────────────────────────

/** Extract meaningful keywords from text (stopword removal + lowercasing) */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
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
    const evalPatterns =
      /\b(pass|fail|approve|reject|issue|concern|good|bad|correct|incorrect|error|warning|valid|invalid)\b/i;
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

  // 8. Decision nodes must produce DECISION: formatted output for routing
  if (category === 'decision') {
    if (!/^DECISION:\s*/im.test(trimmed)) {
      warnings.push({
        code: 'missing-decision-format',
        message: 'Decision output lacks required DECISION: line — downstream routing will not work',
        severity: 'warning',
      });
    }
  }

  // 9. Artifact/deliverable nodes should have section structure (headings or clear paragraphs)
  if (category === 'artifact' || category === 'deliverable') {
    const headingCount = (trimmed.match(/^#{1,3}\s+\S/gm) || []).length;
    const paragraphBreaks = (trimmed.match(/\n\n/g) || []).length;
    if (headingCount < 2 && paragraphBreaks < 3) {
      warnings.push({
        code: 'missing-structure',
        message: `${category} lacks section headings — use ## Section Name to organize content`,
        severity: 'warning',
      });
    }
  }

  // 10. Action nodes should have numbered steps or bullet-point structure
  if (category === 'action') {
    const hasNumberedSteps = /^\s*\d+[\.\)]\s+\S/m.test(trimmed);
    const hasBulletPoints = /^\s*[-*]\s+\S/m.test(trimmed);
    if (!hasNumberedSteps && !hasBulletPoints) {
      warnings.push({
        code: 'missing-steps',
        message:
          'Action output lacks numbered steps or bullet points — format as step-by-step instructions',
        severity: 'warning',
      });
    }
  }

  // 11. Test nodes should end with an explicit VERDICT summary line
  if (category === 'test') {
    const hasVerdict =
      /\bVERDICT\s*:/i.test(trimmed) || /^(?:PASS|FAIL|BLOCK)\s*[:\-–]/im.test(trimmed);
    if (!hasVerdict) {
      warnings.push({
        code: 'missing-verdict',
        message: 'Test output lacks a final VERDICT: line summarizing the overall result',
        severity: 'warning',
      });
    }
  }

  return warnings;
}

// ─── Refinement Prompt ───────────────────────────────────────────────────────

/**
 * Build a targeted refinement instruction from actionable validation warnings.
 *
 * Each warning code maps to a concrete instruction that tells the LLM exactly
 * what to fix — rather than vague "improve your response" language.
 *
 * Only 'warning' severity issues (not 'info') should be passed here.
 */
export function buildRefinementPrompt(warnings: ValidationWarning[]): string {
  const instructions = warnings.map((w) => {
    switch (w.code) {
      case 'too-short':
        return 'Your response is too brief. Expand it with more specific detail, concrete steps, real examples, and complete coverage of the topic.';
      case 'placeholder':
        return `Replace all placeholder text (${w.message.match(/"([^"]+)"/)?.[1] ?? 'e.g. [insert ...]'}) with real, specific, actionable content.`;
      case 'low-relevance':
        return 'Your response drifts from the task. Rewrite it to stay tightly focused on the specific topic and objectives described in the prompt.';
      case 'missing-evaluation':
        return 'Add explicit evaluation verdicts (PASS / FAIL / APPROVE / REJECT) with supporting evidence for each criterion you assessed.';
      case 'missing-conditions':
        return 'Frame each rule as a condition: IF <condition> THEN <action> (MUST / SHALL / REQUIRE). Include how each rule is enforced.';
      case 'missing-code':
        return 'Include actual code — show the exact before/after diff or complete replacement code blocks. Prose descriptions alone are not sufficient for a patch node.';
      case 'missing-decision-format':
        return (
          'Your response must use the structured decision format — the routing system depends on it:\n\n' +
          'DECISION: <chosen option>\n' +
          'CONFIDENCE: <0.0–1.0>\n' +
          'REASONING: <one sentence explaining why>\n\n' +
          'The DECISION: line must appear first, followed immediately by CONFIDENCE: and REASONING:. ' +
          'No preamble before DECISION:.'
        );
      case 'missing-structure':
        return (
          'Organize your content with markdown section headings (`## Section Title`). ' +
          'Every major topic or phase needs its own named heading — avoid unbroken walls of text. ' +
          'Aim for at least 2–3 distinct sections with substantive content under each heading.'
        );
      case 'missing-steps':
        return (
          'Format your action as numbered steps: `1. Do X`, `2. Do Y`, etc. ' +
          'Each step must be concrete and immediately executable. ' +
          'Use bullet sub-items (`  - detail`) for clarification within steps. ' +
          'Replace prose paragraphs with direct, sequential instructions.'
        );
      case 'missing-verdict':
        return (
          'End your test output with an explicit verdict line: `VERDICT: PASS`, `VERDICT: FAIL`, or `VERDICT: BLOCK`. ' +
          'The verdict must appear on its own line and summarize whether the tested item meets requirements overall. ' +
          'Brief justification after the verdict keyword is encouraged.'
        );
      default:
        return w.message;
    }
  });

  return (
    'Your previous response has quality issues that need to be fixed:\n\n' +
    instructions.map((i) => `- ${i}`).join('\n') +
    '\n\nRewrite your response to fully address these issues. ' +
    'Return ONLY the improved content — no preamble, no meta-commentary about what changed.'
  );
}
