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
 * Minimum confidence score below which a low-confidence retry is triggered.
 * When the LLM reports confidence below this threshold, the execution slice
 * makes a single follow-up call asking it to re-examine the evidence.
 */
export const DECISION_LOW_CONFIDENCE_THRESHOLD = 0.5;

// ── Shared context formatting ─────────────────────────────────────────────────

/**
 * Format the workflow's shared context into a compact section for injection into
 * decision node system prompts.
 *
 * Separates prior decision outcomes (prefixed "decision:") from arbitrary stored
 * data so the LLM can quickly orient itself — decisions are the highest-signal
 * context for routing choices.
 *
 * @param sharedContext  The store's _sharedNodeContext map
 * @param maxEntries     Cap to prevent prompt bloat (default: 8)
 * @returns              Formatted string, or empty string when context is empty
 */
export function buildDecisionContextSection(
  sharedContext: Record<string, unknown>,
  maxEntries = 8,
): string {
  const entries = Object.entries(sharedContext);
  if (entries.length === 0) return '';

  const decisionLines: string[] = [];
  const dataLines: string[] = [];

  for (const [key, value] of entries.slice(0, maxEntries)) {
    const valStr = typeof value === 'string' ? value : JSON.stringify(value);
    if (key.startsWith('decision:')) {
      const nodeName = key.slice('decision:'.length);
      decisionLines.push(`  - ${nodeName}: ${valStr}`);
    } else {
      const truncated = valStr.length > 150 ? valStr.slice(0, 150) + '…' : valStr;
      dataLines.push(`  - ${key}: ${truncated}`);
    }
  }

  const parts: string[] = [];
  if (decisionLines.length > 0) {
    parts.push(`Prior decisions in this run:\n${decisionLines.join('\n')}`);
  }
  if (dataLines.length > 0) {
    parts.push(`Stored context:\n${dataLines.join('\n')}`);
  }

  if (parts.length === 0) return '';
  return `\n\n## Workflow Context\n${parts.join('\n\n')}\nUse this context to inform your routing decision.`;
}

/**
 * Agent-specific decision style hints.
 *
 * Rowan: decisive and direct — front-loads the verdict, minimal hedging.
 * Poirot: investigative — examines each option's evidence before choosing.
 */
const DECISION_AGENT_HINTS: Record<string, string> = {
  rowan:
    '\n\nROWAN DECISION STYLE: Be decisive. Commit to the strongest option immediately. ' +
    'Keep REASONING to one punchy sentence. Avoid hedging language ("might", "could", "perhaps"). ' +
    'High confidence is a feature — only go below 0.7 when the evidence genuinely conflicts.',
  poirot:
    '\n\nPOIROT DECISION STYLE: Before choosing, methodically examine what each upstream input ' +
    'tells you about each option. Note signals that support or contradict each branch. ' +
    'Build the case in your REASONING — the decision should feel inevitable from the evidence. ' +
    'Reserve high confidence (≥0.9) only when all signals converge unambiguously.',
};

/**
 * Build a structured system prompt for a decision node.
 * Supports N-way branching (2+ options).
 *
 * @param options          The available decision branches (labels or condition values)
 * @param nodeLabel        Optional node label — anchors the decision to its domain context
 * @param nodeDescription  Optional description from node data — narrows the decision criteria
 * @param agentName        Optional agent name ('rowan' | 'poirot') — adds personality style
 * @param sharedContext    Optional workflow context (prior decisions + stored data)
 * @returns                System prompt string ready for the LLM
 */
export function getDecisionSystemPrompt(
  options: string[],
  nodeLabel?: string,
  nodeDescription?: string,
  agentName?: string,
  sharedContext?: Record<string, unknown>,
): string {
  const optionsList = options.map((o, i) => `  ${i + 1}. ${o}`).join('\n');
  const optionNames = options.map((o) => `"${o}"`).join(', ');
  const multiWay = options.length > 2;

  const reasoningInstruction = multiWay
    ? '<one to three sentences: why this option fits best AND why the top alternatives were not chosen>'
    : '<one concise sentence explaining why>';

  const formatBlock = [
    'DECISION: <chosen option>',
    'CONFIDENCE: <0.0–1.0>',
    `REASONING: ${reasoningInstruction}`,
    multiWay ? 'ALTERNATIVES: <comma-separated list of other viable options, or "none">' : null,
  ]
    .filter(Boolean)
    .join('\n');

  const contextLine = nodeLabel
    ? `\n\nDecision context: "${nodeLabel}"${nodeDescription ? ` — ${nodeDescription}` : ''}.`
    : '';
  const agentHint = agentName ? (DECISION_AGENT_HINTS[agentName.toLowerCase()] ?? '') : '';
  const sharedContextSection =
    sharedContext && Object.keys(sharedContext).length > 0
      ? buildDecisionContextSection(sharedContext)
      : '';

  return `You are a decision-making agent. Analyze the input carefully and choose the BEST option from the available choices.${contextLine}${sharedContextSection}

Available options:
${optionsList}

You MUST respond using this exact format (no deviations, no preamble):

${formatBlock}

Rules:
- <chosen option> MUST exactly match one of: ${optionNames} (case-insensitive).
- CONFIDENCE must be a decimal between 0.0 (total uncertainty) and 1.0 (complete certainty).
- If CONFIDENCE is below 0.5, your REASONING must explain what information would resolve the uncertainty.
- Do NOT add any text before "DECISION:" on the first line.${
    multiWay
      ? `\n- Evaluate ALL ${options.length} options before choosing. For each option, silently weigh: (a) what evidence supports it, (b) what evidence contradicts it. Your REASONING must explain why the chosen option beats its closest competitor.\n- List any genuinely viable alternatives in ALTERNATIVES.`
      : ''
  }${agentHint}`;
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
 * - JSON-format responses: {"decision": "approve", "confidence": 0.9, "reasoning": "..."}
 * - Fallback: first non-empty line when no DECISION: prefix found
 */
export function parseDecisionOutput(output: string): DecisionParseResult {
  const text = output.trim();

  // ── JSON format fallback ──
  // Some LLMs respond with a JSON object instead of the structured text format.
  // Detect by looking for a top-level JSON object that contains a "decision" key.
  // Try both the full text and any ```json fenced block within it.
  const jsonCandidates: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) jsonCandidates.push(fenced[1].trim());
  const bare = text.match(/^\s*(\{[\s\S]*\})\s*$/);
  if (bare) jsonCandidates.push(bare[1]);

  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (parsed && typeof parsed.decision === 'string' && parsed.decision.trim()) {
        const rawConf = parsed.confidence;
        let confidence: number | undefined;
        if (typeof rawConf === 'number') {
          // In JSON, confidence is conventionally a 0–1 decimal.
          // Treat as percentage ONLY for bare integers > 2 (e.g. 87 → 0.87).
          // Non-integer values > 1 (e.g. 2.5) are over-scaled decimals — clamp them.
          const isIntegerPercent = Number.isInteger(rawConf) && rawConf > 2;
          const normalized = isIntegerPercent ? rawConf / 100 : rawConf;
          confidence = Math.max(0, Math.min(1, normalized));
        } else if (typeof rawConf === 'string') {
          const n = parseFloat(rawConf);
          if (!isNaN(n)) {
            const isPercent = rawConf.includes('%') || n > 2;
            confidence = Math.max(0, Math.min(1, isPercent ? n / 100 : n));
          }
        }
        const reasoning =
          typeof parsed.reasoning === 'string' ? parsed.reasoning.trim() || undefined : undefined;
        const rawAlts = parsed.alternatives ?? parsed.alternates;
        let alternatives: string[] | undefined;
        if (Array.isArray(rawAlts)) {
          alternatives = (rawAlts as unknown[])
            .map((a) => String(a).trim())
            .filter((a) => a.length > 0 && a.toLowerCase() !== 'none');
          if (alternatives.length === 0) alternatives = undefined;
        } else if (typeof rawAlts === 'string' && rawAlts.toLowerCase() !== 'none') {
          alternatives = rawAlts
            .split(/,\s*/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && s.toLowerCase() !== 'none');
          if (alternatives.length === 0) alternatives = undefined;
        }
        return {
          decision: parsed.decision.replace(/\s*\(confidence[^)]*\)/i, '').trim(),
          confidence,
          reasoning,
          alternatives,
        };
      }
    } catch {
      // Not valid JSON — fall through to structured text parsing
    }
  }

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

  // ── REASONING (multi-line) ──
  // Capture from the REASONING: label to the next structural field (UPPERCASE_WORD:)
  // or end of text. Handles LLMs that split reasoning across multiple lines.
  let reasoning: string | undefined;
  const reasoningStart = text.search(/^REASONING:/im);
  if (reasoningStart !== -1) {
    const afterReasoningLabel = text.slice(reasoningStart).replace(/^REASONING:\s*/i, '');
    const reasoningStop = afterReasoningLabel.match(/\n[A-Z_]{2,}:/);
    const reasoningContent = reasoningStop
      ? afterReasoningLabel.slice(0, reasoningStop.index)
      : afterReasoningLabel;
    // Collapse internal whitespace/newlines to a single space and trim
    reasoning = reasoningContent.replace(/\s+/g, ' ').trim() || undefined;
  }

  // ── ALTERNATIVES (multi-line-safe) ──
  // Same capture strategy: read until next structural field or end of text.
  let alternatives: string[] | undefined;
  const altStart = text.search(/^ALTERNATIVES:/im);
  if (altStart !== -1) {
    const afterAltLabel = text.slice(altStart).replace(/^ALTERNATIVES:\s*/i, '');
    const altStop = afterAltLabel.match(/\n[A-Z_]{2,}:/);
    const altContent = altStop ? afterAltLabel.slice(0, altStop.index) : afterAltLabel;
    const raw = altContent.replace(/\s+/g, ' ').trim();
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

// ── Display formatting ────────────────────────────────────────────────────────

/**
 * Format a decision result into a compact human-readable summary for UI display.
 *
 * Combines the decision label, confidence percentage, and optional one-sentence
 * reasoning into a consistent display string. Omits fields that are absent.
 *
 * @param decision    The chosen option label (e.g. "approve")
 * @param confidence  Optional 0.0–1.0 confidence score
 * @param reasoning   Optional explanation (truncated to 80 chars to stay compact)
 * @returns           E.g. "approve (92%)" | "reject — insufficient tests (78%)" | "escalate"
 *
 * @example
 * formatDecisionSummary('approve', 0.92, 'All checks pass.')
 * // → "approve — All checks pass. (92%)"
 *
 * formatDecisionSummary('reject', 0.78)
 * // → "reject (78%)"
 *
 * formatDecisionSummary('escalate')
 * // → "escalate"
 */
export function formatDecisionSummary(
  decision: string,
  confidence?: number,
  reasoning?: string,
): string {
  const confStr = confidence !== undefined ? `${Math.round(confidence * 100)}%` : null;
  // Truncate reasoning to keep the summary compact (≤80 chars, strip trailing punctuation)
  const reasonStr = reasoning
    ? reasoning.slice(0, 80).replace(/[.!?]\s*$/, '') + (reasoning.length > 80 ? '…' : '.')
    : null;

  if (confStr && reasonStr) {
    return `${decision} — ${reasonStr} (${confStr})`;
  }
  if (confStr) {
    return `${decision} (${confStr})`;
  }
  if (reasonStr) {
    return `${decision} — ${reasonStr}`;
  }
  return decision;
}
