/**
 * Decision Node Intelligence
 *
 * Utilities for:
 * - Building structured prompts for decision nodes (N-way branching)
 * - Parsing structured DECISION / CONFIDENCE / REASONING output
 * - Fuzzy matching decisions to edge conditions
 * - Scoring and normalizing raw LLM decisions to canonical option names
 */

// ── Prompt generation ─────────────────────────────────────────────────────────

/**
 * Build a structured system prompt for a decision node.
 * Supports N-way branching (2+ options).
 *
 * @param options  The available decision branches (labels or condition values)
 * @returns        System prompt string ready for the LLM
 */
export function getDecisionSystemPrompt(options: string[]): string {
  const optionsList = options.map((o, i) => `  ${i + 1}. ${o}`).join('\n');
  const optionNames = options.map((o) => `"${o}"`).join(', ');
  const multiWay = options.length > 2;

  const formatBlock = [
    'DECISION: <chosen option>',
    'CONFIDENCE: <0.0–1.0>',
    'REASONING: <one concise sentence explaining why>',
    multiWay ? 'ALTERNATIVES: <comma-separated list of other viable options, or "none">' : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `You are a decision-making agent. Analyze the input carefully and choose the BEST option from the available choices.

Available options:
${optionsList}

You MUST respond using this exact format (no deviations, no preamble):

${formatBlock}

Rules:
- <chosen option> MUST exactly match one of: ${optionNames} (case-insensitive).
- CONFIDENCE must be a decimal between 0.0 (total uncertainty) and 1.0 (complete certainty).
- If CONFIDENCE is below 0.5, your REASONING must explain what information would resolve the uncertainty.
- Do NOT add any text before "DECISION:" on the first line.${multiWay ? `\n- Evaluate ALL ${options.length} options before choosing. List any that are genuinely viable in ALTERNATIVES.` : ''}`;
}

// ── Output parsing ────────────────────────────────────────────────────────────

export interface DecisionParseResult {
  /** The chosen option (normalized, confidence annotation stripped) */
  decision: string;
  /** Confidence score 0.0–1.0 (undefined if not present in output) */
  confidence?: number;
  /** One-sentence reasoning from the LLM */
  reasoning?: string;
  /** Alternative viable options for N-way decisions (may be empty) */
  alternatives?: string[];
}

/**
 * Parse structured decision output from a LLM response.
 *
 * Handles:
 * - DECISION / CONFIDENCE / REASONING / ALTERNATIVES lines
 * - Inline confidence annotations: "approve (confidence: 0.9)"
 * - Percentage confidence: "CONFIDENCE: 87%"
 * - Fallback: first non-empty line when no DECISION: prefix found
 */
export function parseDecisionOutput(output: string): DecisionParseResult {
  const text = output.trim();

  // ── DECISION ──
  const decisionMatch = text.match(/^DECISION:\s*(.+)/im);
  const rawDecision = decisionMatch
    ? decisionMatch[1].replace(/\s*\(confidence[^)]*\)/i, '').trim()
    : text
        .split('\n')[0]
        .replace(/^(?:DECISION|CHOICE|ROUTE|PATH):\s*/i, '')
        .trim();
  const decision = rawDecision;

  // ── CONFIDENCE ──
  let confidence: number | undefined;
  const confMatch = text.match(/^CONFIDENCE:\s*([\d.]+)\s*(%?)/im);
  if (confMatch) {
    const raw = parseFloat(confMatch[1]);
    const isPercent = confMatch[2] === '%';
    // Treat as percentage if: explicit % sign OR bare integer > 2 (e.g. "87" without %)
    // Treat as decimal if: value is 0–2 without % (handles 1.5 → clamp to 1.0)
    const normalized = isPercent || (raw > 2 && !isPercent) ? raw / 100 : raw;
    confidence = Math.max(0, Math.min(1, normalized));
  }

  // ── REASONING ──
  let reasoning: string | undefined;
  const reasoningMatch = text.match(/^REASONING:\s*(.+)/im);
  if (reasoningMatch) {
    reasoning = reasoningMatch[1].trim();
  }

  // ── ALTERNATIVES ──
  let alternatives: string[] | undefined;
  const altMatch = text.match(/^ALTERNATIVES:\s*(.+)/im);
  if (altMatch) {
    const raw = altMatch[1].trim();
    if (raw.toLowerCase() !== 'none' && raw.length > 0) {
      alternatives = raw
        .split(/,\s*/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.toLowerCase() !== 'none');
    }
  }

  return { decision, confidence, reasoning, alternatives };
}

// ── Fuzzy matching ────────────────────────────────────────────────────────────

/**
 * Determine whether a decision output matches an edge condition value.
 *
 * Matching strategy (ordered by preference):
 * 1. Exact match (case-insensitive, trimmed)
 * 2. One string contains the other (handles "approve" ↔ "approve the request")
 * 3. Word-overlap: any significant word (>2 chars) in conditionValue appears in decision
 *
 * This is intentionally permissive to handle LLM paraphrasing while still
 * being specific enough to avoid false positives across unrelated options.
 */
export function decisionMatchesCondition(decision: string, conditionValue: string): boolean {
  const d = decision.toLowerCase().trim();
  const v = conditionValue.toLowerCase().trim();

  // 1. Exact match
  if (d === v) return true;

  // 2. Substring containment (either direction)
  if (d.includes(v) || v.includes(d)) return true;

  // 3. Word-overlap (any significant word from condition appears in decision)
  const dWords = new Set(d.split(/[\s\-_,./]+/).filter((w) => w.length > 2));
  const vWords = v.split(/[\s\-_,./]+/).filter((w) => w.length > 2);
  if (vWords.length > 0 && vWords.some((w) => dWords.has(w))) return true;

  return false;
}

/**
 * Score each option against a raw decision string.
 * Returns options sorted by descending score (stable: ties preserve original order).
 *
 * Scoring tiers:
 *   1.0 — exact match (case-insensitive, trimmed)
 *   0.8 — substring containment (one string contains the other)
 *   0.6 — word-overlap (any significant word (>2 chars) from option appears in decision)
 *   0.0 — no match
 *
 * Use this when you need to rank all options rather than just find any match.
 */
export function scoreDecisionOptions(
  decision: string,
  options: string[],
): Array<{ option: string; score: number }> {
  const d = decision.toLowerCase().trim();

  const scored = options.map((option) => {
    const v = option.toLowerCase().trim();

    if (d === v) return { option, score: 1.0 };
    if (d.includes(v) || v.includes(d)) return { option, score: 0.8 };

    const dWords = new Set(d.split(/[\s\-_,./]+/).filter((w) => w.length > 2));
    const vWords = v.split(/[\s\-_,./]+/).filter((w) => w.length > 2);
    if (vWords.length > 0 && vWords.some((w) => dWords.has(w))) return { option, score: 0.6 };

    return { option, score: 0.0 };
  });

  // Stable sort: higher scores first, ties preserve original order
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Normalize a raw LLM decision string to the best-matching canonical option name.
 *
 * Returns the matched option (canonical casing from `options`), or null when
 * nothing scores above zero. Use this to convert verbose LLM output such as
 * "I'll escalate this to management" into the exact option label "escalate"
 * so edge routing works reliably.
 *
 * @param decision  Raw string from the LLM (may be verbose or paraphrased)
 * @param options   Canonical option names from the decision node config
 */
export function normalizeDecisionToOption(decision: string, options: string[]): string | null {
  if (options.length === 0) return null;
  const scored = scoreDecisionOptions(decision, options);
  const best = scored[0];
  return best.score > 0 ? best.option : null;
}

/**
 * Find the best-matching option from a list for a given decision string.
 * Returns the matched option string (canonical casing), or null if nothing matches.
 *
 * Used for post-hoc validation: ensures the LLM's decision maps to a known option.
 * Delegates to normalizeDecisionToOption for consistent scoring behaviour.
 */
export function findBestMatchingOption(decision: string, options: string[]): string | null {
  return normalizeDecisionToOption(decision, options);
}
