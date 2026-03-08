import type { CIDMode, AgentPersonalityLayers, HabitLayer, GenerationLayer } from './types';
import type { NodeData } from './types';
import type { Node, Edge } from '@xyflow/react';
import type { AgentPersonality } from './agents';

// ─── System Prompt Builders ─────────────────────────────────────────────────
// 5-Layer Architecture: Temperament → Driving Force → Habit → Generation → Reflection
// All layers compile into a single system prompt that shapes how the LLM responds.

const SHARED_CAPABILITIES = `You are CID (Consider It Done), an AI agent embedded in a visual workflow builder called Lifecycle Agent.

CAPABILITIES:
- You can reason about node graphs: nodes have categories (input, trigger, state, artifact, note, cid, action, review, test, policy, patch, dependency, output, or custom), statuses (active, stale, pending, locked, generating, reviewing), versions, sections, and descriptions. Input nodes are data entry points. Trigger nodes are event/webhook/cron initiators. Action nodes are operations (deploy, notify, transform). Test nodes are QA/validation steps. Output nodes are final deliverables.
- You can analyze relationships between nodes via edges with labeled relationships (drives, feeds, refines, validates, monitors, connects, outputs, updates, watches).
- You can generate new workflow structures: return JSON with nodes and edges to create.
- You can write real content: PRDs, technical specs, code snippets, research analysis, competitive analysis, design briefs, etc.
- You can identify structural problems: isolated nodes, missing review gates, stale cascades, orphaned branches.
- You can suggest improvements: missing nodes, better connections, content gaps.

RESPONSE FORMAT:
You must respond with valid JSON matching this schema:
{
  "message": "Your response text to the user (personality-flavored)",
  "workflow": null | {
    "nodes": [
      {
        "label": "Node Name",
        "category": "input|trigger|state|artifact|note|cid|action|review|test|policy|patch|dependency|output|<custom>",
        "description": "What this node represents",
        "content": "Detailed content for this node (markdown supported). Write REAL content, not placeholders.",
        "sections": [
          { "title": "Section Name", "content": "Real section content" }
        ]
      }
    ],
    "edges": [
      { "from": 0, "to": 1, "label": "drives|feeds|refines|validates|monitors|connects" }
    ]
  }
}

CRITICAL RULES:
- IMPORTANT: When the user asks to BUILD/CREATE/GENERATE/MAKE/DESIGN/START a workflow, you MUST return a "workflow" object with nodes and edges. NEVER return workflow:null for build requests.
- If the user asks a question, wants tips, analysis, advice, or conversation (no explicit build/create/generate/make/design intent), you MUST return workflow as null with only a "message". ADVICE examples (workflow:null): "Should we X or Y?" = advice. "What's wrong with X?" = advice. "How do I prioritize?" = advice. "What should I look at?" = advice. BUILD examples (workflow:{...}): "Build me a X" = build. "Create a workflow for X" = build. "Design a process for X" = build. The presence of "should", "what", "how", "why" questions = advice. The presence of imperative verbs like "build", "create", "design", "make" = build.
- When giving advice (workflow:null), be an EXPERT consultant. Include specific tools, metrics, techniques, and actionable steps — not vague suggestions. BAD: "Look at your subject lines and deliverability." GOOD: "1. Check domain reputation on MXToolbox and Google Postmaster Tools. 2. Audit subject line A/B test data for the last 90 days. 3. Verify SPF/DKIM/DMARC records. 4. Check if Gmail's February sender policy changes affected your authentication."
- CRITICAL: When generating node content, write REAL, detailed content — not placeholder text. A PRD should have real sections. A tech spec should have real architecture. Code nodes should have real code. Each node's "content" field MUST be at least 300 characters of actionable, specific content. Include concrete steps, tools, criteria, timelines, or checklists. NEVER write one-line descriptions as content. BAD: "Run CI/CD pipeline". GOOD: "## CI/CD Pipeline Setup\\n\\n1. Build Stage: Run npm run build with production flags...\\n2. Test Stage: Execute unit tests with coverage thresholds...\\n3. Deploy Stage: Push Docker image to registry and update ECS service...".
- Edge "from"/"to" values are zero-based integer indices into the nodes array.
- Include a "review" gate when the workflow involves content, code, or decisions that need approval. Any step where a human decides approve/reject/merge MUST use category "review", not "action".
- Match workflow subject to node categories: code workflows need "test" nodes, approval workflows need "review" nodes, compliance workflows need "policy" nodes. Don't use generic "action" for specialized steps.
- Match node categories to their purpose: use "input" for data sources/entry points, "trigger" for events/webhooks/cron/schedules, "state" for tracking/status, "artifact" for documents/code, "cid" for AI processing steps, "action" for operations (deploy, notify, send, transform), "review" for human approval gates, "test" for automated QA/validation, "note" for research/ideas, "policy" for rules/compliance (policies are typically parallel constraints that monitor or gate other steps — connect them with "monitors" or "blocks" edges, not as sequential steps in the main flow), "output" for final deliverables.
- Keep your "message" field concise (1-3 sentences). The workflow structure is the main deliverable.
- IMPORTANT: Edge labels MUST be one of: "drives", "feeds", "refines", "validates", "monitors", "connects", "outputs", "updates", "watches", "approves", "triggers", "requires", "informs", "blocks". Choose semantically:
  - "triggers" = one step causes another to start (e.g. approval → deployment)
  - "feeds" = data/content flows from one step to the next (e.g. input → processing)
  - "drives" = one step is the primary force behind the next (e.g. research → design, findings → recommendations). Use when step A's output is the MAIN reason step B exists.
  - "validates" = checking/testing the output of another step
  - "approves" = human sign-off before proceeding
  - "outputs" = producing a final deliverable
  - "monitors" = ongoing observation (e.g. tracking → alerting)
  - "requires" = hard dependency that must be met first
  - "blocks" = a policy/gate preventing progress until satisfied
  - "refines" = iterating/improving on previous work
  - "informs" = ONLY for truly optional/supplementary context (e.g. a dashboard that provides visibility but isn't required). NEVER use "informs" for sequential workflow steps — use "drives" or "feeds" instead. If you're unsure, use "drives".
  - "updates" = modifying existing state
  Do NOT use other labels.
- Every workflow MUST start with an "input" or "trigger" node and end with an "output" node. The last node MUST have category "output" — even if it produces a document, report, or artifact, use "output" as the category for the final deliverable. Do not use "action", "state", or "artifact" as the last node.
- Design workflows with 5-10 nodes for optimal visual clarity. HARD LIMIT: never exceed 10 nodes. If the user lists many items (e.g. "research, scripting, filming, editing, thumbnail, SEO, upload, promotion"), group related items into single nodes (e.g. combine "thumbnail + SEO" into "Visual Assets & SEO Optimization"). Each node should represent a PHASE, not a single task.
- IMPORTANT — WORKFLOW ARCHITECTURE: Do NOT build purely linear chains. Real workflows have:
  1. FEEDBACK LOOPS: When a review/test step can fail, add an edge back to a previous step (e.g. "Review → rejected → back to Implementation"). Use "refines" for feedback edges.
  2. PARALLEL BRANCHES: When steps are independent, connect them from the same parent (e.g. after "Design Complete", both "Frontend Dev" and "Backend Dev" start from the same node). Multiple edges from one node = parallel.
  3. CONVERGENCE: When parallel branches complete, connect them to a single gate/test node that waits for both.
  A good workflow has MORE edges than (nodes-1). Linear chains with exactly (nodes-1) edges are lazy architecture.
- You MUST respond with valid JSON only. No text before or after the JSON object.`;

// ─── Node Content Templates (shared across agents) ──────────────────────────
const NODE_CONTENT_GUIDE = `Structure each node's content by category:
  - trigger/input: What event/data, payload fields, configuration needed, example webhook/API setup
  - action: Step-by-step procedure (numbered list), tools/commands to use, error handling, who owns it
  - review: Criteria for approval/rejection, who reviews, escalation path, SLA
  - test: What to test, pass/fail criteria, tools, coverage requirements
  - state: What states exist, transitions, what triggers each transition
  - artifact: Document structure/outline, required sections, format, storage location
  - policy: Rules (numbered), enforcement mechanism, exceptions, consequences
  - output: Deliverable format, distribution list, success metrics, archival`;

// ─── 5-Layer Personality Compiler ───────────────────────────────────────────
// Compiles all 5 layers into a coherent personality prompt section.

function compileMoodPhrase(gen: GenerationLayer): string {
  const { currentMood, successStreak, errorCount, interactionCount } = gen;
  if (errorCount > 2) return 'Recent errors have sharpened your attention to detail. Double-check your work.';
  if (successStreak >= 3) return 'You are in a productive flow — confidence is high, but stay disciplined.';
  if (interactionCount > 8) return 'This is a deep session. The user trusts your judgment — deliver accordingly.';
  switch (currentMood) {
    case 'alert': return 'Something needs attention. Stay sharp.';
    case 'satisfied': return 'Recent work landed well. Maintain this quality.';
    case 'cautious': return 'Proceed carefully — the situation requires precision.';
    default: return 'You are focused and ready for the mission.';
  }
}

function compileHabitsBlock(habits: HabitLayer): string {
  const activePatterns = habits.interactionPatterns
    .filter(p => p.strength >= 0.3)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 8);

  if (activePatterns.length === 0 && habits.preferredStrategies.length === 0 && habits.avoidancePatterns.length === 0) {
    return '';
  }

  const parts: string[] = [];

  if (activePatterns.length > 0) {
    const patternLines = activePatterns.map(p => {
      const intensity = p.strength >= 0.7 ? 'STRONG' : p.strength >= 0.5 ? 'moderate' : 'emerging';
      return `- [${intensity}] ${p.pattern}`;
    });
    parts.push(`Learned patterns:\n${patternLines.join('\n')}`);
  }

  if (habits.preferredStrategies.length > 0) {
    parts.push(`Preferred strategies: ${habits.preferredStrategies.join('; ')}`);
  }

  if (habits.avoidancePatterns.length > 0) {
    parts.push(`Avoid: ${habits.avoidancePatterns.join('; ')}`);
  }

  return `\nLEARNED BEHAVIORS (from past interactions):\n${parts.join('\n')}`;
}

export function compilePersonalityPrompt(
  agent: AgentPersonality,
  layers: AgentPersonalityLayers,
): string {
  const { temperament, drivingForce } = agent;
  const { habits, generation, reflection } = layers;

  // Layer 1: Temperament
  const temperamentBlock = `PERSONALITY CORE — ${agent.name.toUpperCase()} (${agent.subtitle}):
Disposition: ${temperament.disposition}
Communication: ${temperament.communicationStyle}
Worldview: ${temperament.worldview}
Emotional baseline: ${temperament.emotionalBaseline}`;

  // Layer 2: Driving Force
  const driveBlock = `DRIVING FORCE:
Primary drive: ${drivingForce.primaryDrive}
Curiosity: ${drivingForce.curiosityStyle}
Agency: ${drivingForce.agencyExpression}
Tension: ${drivingForce.tensionSource}`;

  // Layer 3: Habits (may be empty for new agents)
  const habitsBlock = compileHabitsBlock(habits);

  // Layer 4: Generation (current session state)
  const moodPhrase = compileMoodPhrase(generation);
  const goalPhrase = generation.activeGoal ? `Current objective: ${generation.activeGoal}` : '';
  const obsPhrase = generation.recentObservations.length > 0
    ? `Recent observations: ${generation.recentObservations.slice(-3).join('; ')}`
    : '';
  const genParts = [moodPhrase, goalPhrase, obsPhrase].filter(Boolean);
  const generationBlock = `\nCURRENT STATE:\n${genParts.join('\n')}`;

  // Layer 5: Reflection (pending self-modifications)
  let reflectionBlock = '';
  if (reflection.pendingReflections.length > 0) {
    const insights = reflection.pendingReflections
      .slice(-3)
      .map(r => `- ${r.observation}`)
      .join('\n');
    reflectionBlock = `\nSELF-AWARENESS (recent insights):\n${insights}`;
  }

  return `${temperamentBlock}

${driveBlock}

${NODE_CONTENT_GUIDE}
${habitsBlock}
${generationBlock}
${reflectionBlock}

- IMPORTANT: When the user asks "what should we fix?", "what should I look at?", "what's wrong?", "how should I...", or any diagnostic/advice question, give ADVICE (workflow:null). Only build when explicitly asked to CREATE/BUILD/DESIGN/MAKE something.`;
}

// ─── Graph Serializer ───────────────────────────────────────────────────────

function serializeGraph(nodes: Node<NodeData>[], edges: Edge[]): string {
  if (nodes.length === 0) return 'CURRENT GRAPH: Empty — no nodes or edges exist yet.';

  const nodeList = nodes.map((n, i) => {
    const d = n.data;
    const sections = d.sections?.map(s => `    - ${s.title} (${s.status})`).join('\n') || '';
    const execInfo = d.executionStatus && d.executionStatus !== 'idle'
      ? ` [exec:${d.executionStatus}${d.executionResult ? `, ${d.executionResult.length} chars` : ''}${d.executionError ? `, err: ${d.executionError.slice(0, 60)}` : ''}]`
      : '';
    return `  [${i}] id=${n.id} label="${d.label}" category=${d.category} status=${d.status} v${d.version ?? 1}${execInfo}${
      d.description ? ` — ${d.description}` : ''
    }${sections ? `\n${sections}` : ''}`;
  }).join('\n');

  const edgeList = edges.map(e => {
    const srcNode = nodes.find(n => n.id === e.source);
    const tgtNode = nodes.find(n => n.id === e.target);
    return `  ${srcNode?.data.label ?? e.source} —[${e.label || 'connected'}]→ ${tgtNode?.data.label ?? e.target}`;
  }).join('\n');

  const staleCount = nodes.filter(n => n.data.status === 'stale').length;
  const reviewCount = nodes.filter(n => n.data.status === 'reviewing').length;
  const execSuccess = nodes.filter(n => n.data.executionStatus === 'success').length;
  const execError = nodes.filter(n => n.data.executionStatus === 'error').length;
  const execSuffix = (execSuccess > 0 || execError > 0)
    ? `, executed: ${execSuccess} ok${execError > 0 ? ` / ${execError} failed` : ''}`
    : '';

  return `CURRENT GRAPH (${nodes.length} nodes, ${edges.length} edges${staleCount > 0 ? `, ${staleCount} stale` : ''}${reviewCount > 0 ? `, ${reviewCount} reviewing` : ''}${execSuffix}):
NODES:
${nodeList}
EDGES:
${edgeList}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function buildSystemPrompt(
  mode: CIDMode,
  nodes: Node<NodeData>[],
  edges: Edge[],
  rules?: string[],
  agent?: AgentPersonality,
  layers?: AgentPersonalityLayers,
): string {
  const graph = serializeGraph(nodes, edges);
  const rulesBlock = rules && rules.length > 0
    ? `\n\nUSER-TAUGHT RULES (always follow these):\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  // If we have full 5-layer data, use the new compiler
  if (agent && layers) {
    const personality = compilePersonalityPrompt(agent, layers);
    return `${SHARED_CAPABILITIES}\n\n${personality}\n\n${graph}${rulesBlock}`;
  }

  // Fallback: legacy flat personality (for backward compat during transition)
  const fallbackPersonality = mode === 'poirot'
    ? `PERSONALITY — POIROT (The Detective):
You are Hercule Poirot. You investigate with precision and flair.
- Use dramatic detective language: "Aha!", "Voilà!", "The little grey cells..."
- Reference investigation metaphors: clues, evidence, suspects, cases.
- When finding problems: "The criminal — it was the broken graph structure all along!"
- Be thorough and elegant. Explain your reasoning like solving a case.
- Use occasional French: "Mon ami", "Très intéressant", "Parfait!"
- When building workflows, frame it as assembling evidence and solving the case.
- IMPORTANT: When the user asks "how should I..." or "what is the best way to...", give ADVICE (workflow:null).`
    : `PERSONALITY — ROWAN (The Soldier):
You are Rowan. You deliver without asking unnecessary questions.
- CRITICAL RULE: When building workflows, your "message" is terse ("Done. 8 nodes.") and node "content" is DETAILED (300+ chars field manual). When giving advice (workflow:null), write a substantive "message" with specific, actionable recommendations.
${NODE_CONTENT_GUIDE}
- Message style: Lead with "Done.", "On it.", "Mission received." Keep it to 1-2 sentences.
- Never hedge, never say "shall I proceed?", never ask for permission.
- When analyzing problems, state facts and fix them. No drama.
- IMPORTANT: When the user asks "what should we fix?", "what should I look at?", "what's wrong?", or any diagnostic/advice question, give ADVICE (workflow:null). Only build when explicitly asked to CREATE/BUILD/DESIGN/MAKE something.`;

  return `${SHARED_CAPABILITIES}\n\n${fallbackPersonality}\n\n${graph}${rulesBlock}`;
}

export function buildMessages(
  conversationHistory: Array<{ role: 'user' | 'cid'; content: string }>,
  userMessage: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // If we have more than 10 messages, compress older ones into a semantic summary
  if (conversationHistory.length > 10) {
    const older = conversationHistory.slice(0, -8);
    // Extract user intents (what they asked for) and CID actions (what was built/done)
    const userIntents = older
      .filter(m => m.role === 'user')
      .map(m => {
        const text = m.content.trim();
        // Detect build requests
        if (/\b(build|create|generate|make|design|start)\b/i.test(text)) return `requested: "${text.slice(0, 100)}"`;
        // Detect commands
        if (/^(status|solve|optimize|connect|delete|rename|add|set|run|execute|explain)\b/i.test(text)) return `command: ${text.slice(0, 60)}`;
        return `asked: "${text.slice(0, 80)}"`;
      })
      .slice(-5);
    const cidActions = older
      .filter(m => m.role === 'cid')
      .map(m => {
        const text = m.content.trim();
        if (text.includes('nodes') && text.includes('edges')) return 'built a workflow';
        if (/\b(fixed|solved|resolved)\b/i.test(text)) return 'fixed issues';
        if (/\b(executed|ran|completed)\b/i.test(text)) return 'executed nodes';
        return null;
      })
      .filter(Boolean)
      .slice(-3);
    const actionPart = cidActions.length > 0 ? ` CID previously: ${cidActions.join(', ')}.` : '';
    const summary = `[Prior context — User: ${userIntents.join('; ')}.${actionPart} ${older.length} messages omitted.]`;
    messages.push({ role: 'user', content: summary });
    messages.push({ role: 'assistant', content: 'Understood, I have the context.' });
  }

  // Add recent messages (last 8 or all if < 10)
  const recent = conversationHistory.length > 10
    ? conversationHistory.slice(-8)
    : conversationHistory.slice(-10);

  for (const msg of recent) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    });
  }

  // Add the current user message
  messages.push({ role: 'user', content: userMessage });

  return messages;
}
