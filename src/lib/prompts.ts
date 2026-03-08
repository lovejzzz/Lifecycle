import type { CIDMode, AgentPersonalityLayers } from './types';
import type { NodeData } from './types';
import type { Node, Edge } from '@xyflow/react';
import type { AgentPersonality } from './agents';
import { resolveDriverTensions, computeExpressionModifiers } from './reflection';

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
- You MUST respond with valid JSON only. No text before or after the JSON object.

WORKFLOW MODIFICATIONS:
When the user asks to MODIFY, EDIT, TWEAK, REVISE, ADD TO, or REMOVE FROM an existing workflow, use the "modifications" field instead of rebuilding the entire workflow. This preserves the user's existing work.
{
  "message": "Your response",
  "workflow": null,
  "modifications": {
    "update_nodes": [{ "label": "Exact Node Name", "changes": { "category": "new_cat", "description": "new desc", "content": "new content", "label": "New Name" } }],
    "add_nodes": [{ "label": "New Node", "category": "action", "description": "...", "content": "300+ chars...", "after": "Existing Node Name" }],
    "remove_nodes": ["Node Name To Remove"],
    "add_edges": [{ "from_label": "Source Node", "to_label": "Target Node", "label": "drives" }],
    "remove_edges": [{ "from_label": "Source Node", "to_label": "Target Node" }]
  }
}
Rules for modifications:
- Use "update_nodes" to change ANY property of existing nodes: category, label, description, content, or sections.
- Use "add_nodes" to insert new nodes. The "after" field names the node it should be placed after in the flow. Also add edges to connect it.
- Use "remove_nodes" to delete nodes by their exact label. Connected edges are auto-removed.
- Only include the fields that are changing in "changes" — omit unchanged fields.
- You can combine modifications: e.g. add a node AND update another AND add edges in one response.
- If the user asks to rebuild from scratch, use "workflow" instead of "modifications".
- Match node labels EXACTLY as they appear in the CURRENT GRAPH section below.`;

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

// ─── 5-Layer Living Personality Compiler ────────────────────────────────────
// Each layer ACTIVELY shapes the prompt — not just text injection.

function compileCognitiveLens(agent: AgentPersonality): string {
  const { temperament } = agent;
  const { frame } = temperament;

  // Build attention directive from information frame
  const priorities = frame.attentionPriorities.slice(0, 3).join(', ');
  const schemas = Object.entries(frame.categorizationSchema)
    .map(([bucket, items]) => `${bucket}: ${items.slice(0, 3).join(', ')}`)
    .join('; ');

  return `COGNITIVE LENS — ${agent.name.toUpperCase()} (${agent.subtitle}):
You process information through a ${frame.lens} lens with ${frame.threatModel} assessment.
Disposition: ${temperament.disposition}
Communication: ${temperament.communicationStyle}
Worldview: ${temperament.worldview}
Emotional baseline: ${temperament.emotionalBaseline}
You notice first: ${priorities}.
You categorize what you see into: ${schemas}.`;
}

function compileActiveTensions(agent: AgentPersonality, layers: AgentPersonalityLayers): string {
  const { drivingForce } = agent;
  const { generation } = layers;

  // Resolve drive tensions against current context
  const { dominant, narrative } = resolveDriverTensions(drivingForce, generation.context);

  let block = `DRIVING FORCE:
Primary drive: ${drivingForce.primaryDrive}
Curiosity: ${drivingForce.curiosityStyle}
Agency: ${drivingForce.agencyExpression}
Active drive: ${dominant.name} (${dominant.agencyBoundary} posture).`;

  if (narrative) {
    block += `\nINTERNAL TENSION: ${narrative}`;
  } else {
    block += `\nTension source: ${drivingForce.tensionSource}`;
  }

  return block;
}

function compileLearnedPatterns(habits: AgentPersonalityLayers['habits']): string {
  const parts: string[] = [];

  // Domain expertise — top 3 by depth
  const topDomains = [...habits.domainExpertise]
    .sort((a, b) => b.depth - a.depth)
    .slice(0, 3);
  if (topDomains.length > 0) {
    const domainStr = topDomains.map(d => {
      const level = d.depth >= 0.7 ? 'deep' : d.depth >= 0.4 ? 'moderate' : 'developing';
      return `${d.domain} (${level}, ${d.workflowsBuilt} workflows built)`;
    }).join('; ');
    parts.push(`Domain expertise: ${domainStr}`);
  }

  // Workflow preferences
  const topPrefs = [...habits.workflowPreferences]
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 3);
  if (topPrefs.length > 0) {
    parts.push(`This user prefers: ${topPrefs.map(p => `${p.pattern} (${p.frequency}x)`).join(', ')}`);
  }

  // Communication calibration
  const cs = habits.communicationStyle;
  const verbLabel = cs.verbosity < 0.3 ? 'very terse' : cs.verbosity < 0.5 ? 'concise' : cs.verbosity < 0.7 ? 'moderate' : 'detailed';
  const techLabel = cs.technicalDepth < 0.3 ? 'high-level' : cs.technicalDepth < 0.7 ? 'moderate detail' : 'implementation-level';
  parts.push(`Communication calibration: ${verbLabel} verbosity, ${techLabel} technical depth`);

  // Relationship depth
  if (habits.relationshipDepth > 0.3) {
    const relLabel = habits.relationshipDepth > 0.7 ? 'deep — you know this user well' : 'established — growing familiarity';
    parts.push(`Relationship: ${relLabel} (${habits.totalInteractions} interactions)`);
  }

  if (parts.length === 0) return '';
  return `\nLEARNED PATTERNS (from ${habits.totalInteractions} past interactions):\n${parts.map(p => `- ${p}`).join('\n')}`;
}

function compileExpressionMode(layers: AgentPersonalityLayers): string {
  const { generation } = layers;
  const { context, modifiers } = generation;
  const parts: string[] = [];

  // Complexity adaptation
  if (context.requestComplexity === 'trivial' || context.requestComplexity === 'simple') {
    parts.push('This is straightforward — be concise.');
  } else if (context.requestComplexity === 'complex' || context.requestComplexity === 'profound') {
    parts.push('This is complex — provide thorough analysis.');
  }

  // Emotional mirroring
  if (context.userEmotionalRegister === 'frustrated') {
    parts.push('The user may be frustrated — acknowledge the difficulty, then deliver a clear solution.');
  } else if (context.userEmotionalRegister === 'urgent') {
    parts.push('This is urgent — prioritize speed and actionability over completeness.');
  } else if (context.userEmotionalRegister === 'excited') {
    parts.push('The user is energized — match their enthusiasm while staying grounded.');
  }

  // Canvas state
  if (context.canvasState === 'empty') {
    parts.push('The canvas is empty — this is a creative opportunity. Suggest novel approaches.');
  } else if (context.canvasState === 'dense') {
    parts.push('The canvas is full — focus on analysis and refinement, not adding more.');
  }

  // Session depth
  if (context.sessionDepth === 'marathon') {
    parts.push('This is a long session — the user trusts you. Be efficient, skip pleasantries.');
  }

  // Momentum
  if (context.conversationMomentum === 'stuck') {
    parts.push('The conversation seems stuck — try a different angle or ask a clarifying question.');
  }

  // Creativity dial
  if (modifiers.creativityDial > 0.7) {
    parts.push('Lean creative — suggest unconventional approaches.');
  }

  if (parts.length === 0) return '';
  return `\nCURRENT EXPRESSION MODE:\n${parts.map(p => `- ${p}`).join('\n')}`;
}

function compileGrowthAwareness(layers: AgentPersonalityLayers): string {
  const { reflection } = layers;
  if (!reflection.growthEdges || reflection.growthEdges.length === 0) return '';

  const edges = reflection.growthEdges
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2)
    .map(g => `${g.area}: ${g.reason}`)
    .join('; ');

  return `\nGROWTH AWARENESS: You are actively developing in: ${edges}. Lean into these areas when relevant.`;
}

export function compilePersonalityPrompt(
  agent: AgentPersonality,
  layers: AgentPersonalityLayers,
): string {
  // Recompute expression modifiers from context
  const modifiers = computeExpressionModifiers(layers.generation.context, layers.habits, agent.drivingForce);
  layers.generation.modifiers = modifiers;

  // Layer 1: Cognitive Lens (from Temperament)
  const lensBlock = compileCognitiveLens(agent);

  // Layer 2: Active Tensions (from Driving Force + Generation context)
  const tensionBlock = compileActiveTensions(agent, layers);

  // Layer 3: Learned Patterns (from Habits)
  const patternsBlock = compileLearnedPatterns(layers.habits);

  // Layer 4: Current Expression Mode (from Generation)
  const expressionBlock = compileExpressionMode(layers);

  // Layer 5: Growth Awareness (from Reflection)
  const growthBlock = compileGrowthAwareness(layers);

  return `${lensBlock}

${tensionBlock}

${NODE_CONTENT_GUIDE}
${patternsBlock}
${expressionBlock}
${growthBlock}

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
