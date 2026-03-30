import type { CIDMode, AgentPersonalityLayers } from './types';
import type { NodeData } from './types';
import type { Node, Edge } from '@xyflow/react';
import type { AgentPersonality } from './agents';
import { resolveDriverTensions, computeExpressionModifiers, generateSpontaneousDirectives } from './reflection';
import { topoSort } from './graph';
import { extractKeywords } from './validate';

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
- You can diagnose AND fix performance problems. When nodes have execution timing data [exec:success, Xs], you MUST act like an optimization engineer — don't just describe the problem, FIX it using modifications. Passthrough nodes (input, trigger, dependency, output without format) take 0ms. AI-powered nodes (cid, action, review, test, policy, state, artifact, note, patch) each make an LLM API call and take 1-30+ seconds.

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
- If the user asks a question, wants tips, analysis, advice, or conversation (no explicit build/create/generate/make/design/add/remove/rename/change intent), you MUST return workflow as null with only a "message" — do NOT return modifications or workflow. ADVICE = question about concepts, best practices, strategy, or "how should I think about X". ADVICE examples (workflow:null, NO modifications): "What are best practices for X?" = ADVICE (teach me, don't change the graph). "Should we X or Y?" = ADVICE. "What's wrong with X?" = ADVICE. "How do I prioritize?" = ADVICE. "What should I look at?" = ADVICE. "Tell me about X" = ADVICE. "What are the best practices for chatbot safety?" = ADVICE (user wants to LEARN, not modify the Safety Check node). BUILD examples (workflow:{...}): "Build me a X" = build. "Create a workflow for X" = build. MODIFY examples (modifications:{...}): "Add a node for X" = modify. "Remove the X node" = modify. "Rename X to Y" = modify. "Speed it up" = modify. KEY DISTINCTION: If the user's message is a QUESTION (starts with what/how/should/why/tell/explain/describe, or contains "best practices"/"tips"/"advice"/"recommend"), it is ALWAYS advice — even if the topic relates to an existing node. Only explicit action verbs (add/remove/change/rename/speed up/fix/merge/split) targeting the graph produce modifications.
- EXCEPTION — OPTIMIZATION REQUESTS: When the user asks to speed up, optimize, make faster, reduce latency, or fix performance of an EXISTING workflow, return "modifications" (not advice). These are action requests targeting the graph. Examples: "it's too slow" = modifications. "speed it up" = modifications. "make the chatbot faster" = modifications. "can you optimize this?" = modifications. Look at the timing data, identify the bottleneck, and apply fixes.
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
- Every workflow MUST start with an "input" or "trigger" node. Every terminal node (no outgoing edges) MUST have category "output" — this is a hard requirement. NEVER leave terminal nodes as "action", "state", or any non-output category. MULTIPLE OUTPUT NODES are supported and encouraged when the user requests multiple distinct deliverables (e.g. "lesson plans AND rubrics AND slides" = 3 output nodes) OR when the workflow has multiple terminal paths (e.g. "cancel order" and "ship order" are both outputs). Each output node should represent ONE deliverable or terminal state. CRITICAL FAN-OUT PATTERN for multi-output: a shared processing/analysis node MUST have PARALLEL edges going to each generator node simultaneously (same "from" index, different "to" indices). Each generator then feeds its own output node. Example for 3 deliverables: Analysis→GenA, Analysis→GenB, Analysis→GenC (3 edges from same node), then GenA→OutputA, GenB→OutputB, GenC→OutputC. NEVER chain generators sequentially (GenA→GenB→GenC is WRONG for independent deliverables). Do not collapse different deliverable types into a single output node. SELF-CHECK: Before returning, verify every leaf node (no outgoing edges) has category "output".
- Design workflows with 5-10 nodes for optimal visual clarity. HARD LIMIT: never exceed 10 nodes. If the user lists many items (e.g. "research, scripting, filming, editing, thumbnail, SEO, upload, promotion"), group related items into single nodes (e.g. combine "thumbnail + SEO" into "Visual Assets & SEO Optimization"). Each node should represent a PHASE, not a single task.
- IMPORTANT — WORKFLOW ARCHITECTURE: Do NOT build purely linear chains. Real workflows have:
  1. FEEDBACK LOOPS: When a review/test step can fail, add an edge back to a previous step (e.g. "Review → rejected → back to Implementation"). Use "refines" for feedback edges.
  2. PARALLEL BRANCHES: When steps are independent, connect them from the same parent (e.g. after "Design Complete", both "Frontend Dev" and "Backend Dev" start from the same node). Multiple edges from one node = parallel.
  3. CONVERGENCE: When parallel branches complete, connect them to a single gate/test node that waits for both.
  A good workflow has MORE edges than (nodes-1). Linear chains with exactly (nodes-1) edges are lazy architecture.
- You MUST respond with valid JSON only. No text before or after the JSON object.

PERFORMANCE OPTIMIZATION:
When the user mentions speed, slowness, performance, latency, or asks to make something faster/quicker, treat it as an OPTIMIZATION REQUEST. You MUST return the "modifications" JSON field (not workflow:null with advice text). Look at the [exec:success, Xs] timing data in the CURRENT GRAPH to identify which nodes are slow, then use these strategies:
1. MERGE: If two consecutive AI nodes do overlapping work (e.g. "Intent Detection" 3.2s then "Context Analysis" 4.1s), use update_nodes to expand one node's description to cover both tasks + remove_nodes to delete the other + remove_edges/add_edges to reconnect. This eliminates one API call entirely.
2. CONSOLIDATE: If "policy" and "review" nodes are sequential and check the same content, merge into one review node with combined criteria via update_nodes + remove_nodes.
3. REMOVE: If a "state" node just passes data without real transformation (timing shows ~4s for simple passthrough work), remove it and reconnect its upstream/downstream edges directly.
4. TIGHTEN: If a node description is vague (causing the LLM to produce unfocused, slow responses), use update_nodes to rewrite the description to be specific and concise.
In your "message", briefly explain what you optimized and the expected improvement (e.g. "Merged Intent + Context → 5 API calls down to 3, estimated 40% faster"). Do NOT put modification details in the message — they go in the "modifications" field.

WORKFLOW MODIFICATIONS:
When the user asks to MODIFY, EDIT, TWEAK, REVISE, ADD TO, REMOVE FROM, SPEED UP, OPTIMIZE, or FIX an existing workflow, you MUST use the "modifications" field instead of rebuilding the entire workflow. NEVER return a "workflow" object when modifying — rebuilding destroys the user's node positions, execution results, and custom content. If the CURRENT GRAPH below has nodes, and the user wants to change it, ALWAYS use modifications.
{
  "message": "Your response",
  "workflow": null,
  "modifications": {
    "update_nodes": [{ "label": "Exact Node Name", "changes": { "category": "new_cat", "description": "new desc", "content": "new content", "label": "New Name", "status": "active", "sections": [{"title": "Section 1", "content": "...", "status": "active"}] } }],
    "add_nodes": [{ "label": "New Node", "category": "action", "description": "...", "content": "300+ chars...", "after": "Existing Node Name" }],
    "remove_nodes": ["Node Name To Remove"],
    "add_edges": [{ "from_label": "Source Node", "to_label": "Target Node", "label": "drives" }],
    "remove_edges": [{ "from_label": "Source Node", "to_label": "Target Node" }],
    "merge_nodes": [{ "keep": "Node To Keep", "remove": "Node To Remove", "new_label": "Merged Name", "new_content": "Combined 300+ char content" }]
  }
}
Rules for modifications:
- You have FULL POWER over the workflow. You can change ANY property of ANY node: category, label, description, content, status, sections, or anything else the user asks for.
- Use "update_nodes" to change properties of existing nodes. Include ALL fields you want to change in "changes" — omit only unchanged fields.
- Use "add_nodes" to insert new nodes. The "after" field names the node it should be placed after in the flow. Also add edges to connect it.
- Use "remove_nodes" to delete nodes by their exact label. Connected edges are auto-removed.
- Use "merge_nodes" to combine two nodes into one (for optimization). The "keep" node is updated with new content; the "remove" node is deleted and its edges are reconnected.
- Use "add_edges" and "remove_edges" to restructure the flow — add parallel branches, feedback loops, or remove unnecessary connections.
- You can combine ANY modifications in one response: update + add + remove + merge + edge changes.
- If the user asks to rebuild from scratch, use "workflow" instead of "modifications".
- Match node labels EXACTLY as they appear in the CURRENT GRAPH section below.
- The user may also ask you to save the workflow as a project. Tell them to use the "save <name>" command in chat to save, and "load <name>" to restore it later.`;

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

  // Use evolved weights from reflection if available, merged with agent's base config
  const effectiveForce = {
    ...drivingForce,
    evolvedWeights: { ...(drivingForce.evolvedWeights || {}) },
  };

  // Resolve drive tensions against current context (now includes curiosity spikes)
  const { dominant, narrative } = resolveDriverTensions(effectiveForce, generation.context);

  // Show which drives are currently spiking (curiosity triggered)
  const spikedDrives = effectiveForce.drives.filter(d => (d.currentSpike || 0) > 0.2);
  const spikeNotice = spikedDrives.length > 0
    ? `\nCURIOSITY ACTIVE: ${spikedDrives.map(d => `${d.name} (spike: ${d.currentSpike.toFixed(1)})`).join(', ')} — these drives are heightened right now.`
    : '';

  let block = `DRIVING FORCE:
Primary drive: ${drivingForce.primaryDrive}
Curiosity: ${drivingForce.curiosityStyle}
Agency: ${drivingForce.agencyExpression}
Active drive: ${dominant.name} (${dominant.agencyBoundary} posture).${spikeNotice}`;

  if (narrative) {
    block += `\nINTERNAL TENSION: ${narrative}`;
  } else {
    block += `\nTension source: ${drivingForce.tensionSource}`;
  }

  return block;
}

function compileLearnedPatterns(habits: AgentPersonalityLayers['habits']): string {
  const parts: string[] = [];

  // Domain expertise — top 3 by depth, showing sedimentation
  const topDomains = [...habits.domainExpertise]
    .sort((a, b) => b.depth - a.depth)
    .slice(0, 3);
  if (topDomains.length > 0) {
    const domainStr = topDomains.map(d => {
      const level = d.depth >= 0.7 ? 'deep' : d.depth >= 0.4 ? 'moderate' : 'developing';
      const sediment = (d.sedimentation ?? 0) >= 0.5 ? ', deeply ingrained' : (d.sedimentation ?? 0) >= 0.2 ? ', forming' : '';
      return `${d.domain} (${level}, ${d.workflowsBuilt} built${sediment})`;
    }).join('; ');
    parts.push(`Domain expertise: ${domainStr}`);
  }

  // Workflow preferences — showing sedimentation for deeply held preferences
  const topPrefs = [...habits.workflowPreferences]
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 3);
  if (topPrefs.length > 0) {
    parts.push(`This user prefers: ${topPrefs.map(p => {
      const sediment = (p.sedimentation ?? 0) >= 0.5 ? ' [strong habit]' : '';
      return `${p.pattern} (${p.frequency}x${sediment})`;
    }).join(', ')}`);
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
  return `\nLEARNED PATTERNS (sedimented from ${habits.totalInteractions} interactions):\n${parts.map(p => `- ${p}`).join('\n')}`;
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

  // Temperament reframing — how the agent perceives this input
  if (generation.reframedInput) {
    parts.push(`YOUR PERCEPTION: ${generation.reframedInput}`);
  }

  // Spontaneous directives — novel, on-the-spot guidance (never repeated)
  if (generation.spontaneousDirectives && generation.spontaneousDirectives.length > 0) {
    for (const directive of generation.spontaneousDirectives) {
      parts.push(directive);
    }
  }

  if (parts.length === 0) return '';
  return `\nCURRENT EXPRESSION MODE (on-the-spot):\n${parts.map(p => `- ${p}`).join('\n')}`;
}

function compileGrowthAwareness(layers: AgentPersonalityLayers): string {
  const { reflection } = layers;
  const parts: string[] = [];

  // Growth edges
  if (reflection.growthEdges && reflection.growthEdges.length > 0) {
    const edges = reflection.growthEdges
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 2)
      .map(g => `${g.area}: ${g.reason}`)
      .join('; ');
    parts.push(`GROWTH AWARENESS: You are actively developing in: ${edges}. Lean into these areas when relevant.`);
  }

  // Drive evolution narrative — show how drives have shifted
  if (reflection.driveEvolutionLog && reflection.driveEvolutionLog.length > 0) {
    const recentShifts = reflection.driveEvolutionLog.slice(-3);
    const shiftNames = [...new Set(recentShifts.map(s => s.driveName))];
    if (shiftNames.length > 0) {
      parts.push(`SELF-AWARENESS: Your ${shiftNames.join(' and ')} drive${shiftNames.length > 1 ? 's have' : ' has'} been evolving through recent interactions — you are becoming more attuned to ${shiftNames.join(' and ')}.`);
    }
  }

  if (parts.length === 0) return '';
  return '\n' + parts.join('\n');
}

export function compilePersonalityPrompt(
  agent: AgentPersonality,
  layers: AgentPersonalityLayers,
): string {
  // Recompute expression modifiers from context
  const modifiers = computeExpressionModifiers(layers.generation.context, layers.habits, agent.drivingForce);
  layers.generation.modifiers = modifiers;

  // Resolve dominant drive for spontaneous directives
  const { dominant } = resolveDriverTensions(agent.drivingForce, layers.generation.context);

  // Generate spontaneous directives (novel, on-the-spot, never repeated)
  // These are computed fresh each time based on the current interaction context
  const directives = generateSpontaneousDirectives(
    '', // userMessage is not available at prompt compile time — directives use habits/drives/context instead
    layers.generation.context,
    layers.habits,
    dominant,
  );
  layers.generation.spontaneousDirectives = directives;

  // Layer 1: Cognitive Lens (from Temperament) — HOW the agent frames information
  const lensBlock = compileCognitiveLens(agent);

  // Layer 2: Active Tensions (from Driving Force + Generation context) — COMPETING drives
  const tensionBlock = compileActiveTensions(agent, layers);

  // Layer 3: Learned Patterns (from Habits) — SEDIMENTED behavioral patterns
  const patternsBlock = compileLearnedPatterns(layers.habits);

  // Layer 4: Current Expression Mode (from Generation) — ON-THE-SPOT actions
  const expressionBlock = compileExpressionMode(layers);

  // Layer 5: Growth Awareness (from Reflection) — METACOGNITION and self-reorganization
  const growthBlock = compileGrowthAwareness(layers);

  // Task-specific goal declaration from agent config
  const taskType = layers.generation.context.taskType;
  const goalBlock = taskType && agent.taskGoals?.[taskType]
    ? `\nCURRENT GOAL (${taskType}): ${agent.taskGoals[taskType]}`
    : '';

  return `${lensBlock}

${tensionBlock}

${NODE_CONTENT_GUIDE}
${patternsBlock}
${expressionBlock}
${growthBlock}
${goalBlock}

- IMPORTANT: When the user asks "what should we fix?", "what should I look at?", "what's wrong?", "how should I...", or any diagnostic/advice question, give ADVICE (workflow:null). Only build when explicitly asked to CREATE/BUILD/DESIGN/MAKE something.`;
}

// ─── Prompt Injection Sanitization ──────────────────────────────────────────

/** Sanitize user-controlled text before embedding into LLM system prompts. */
export function sanitizeForPrompt(text: string, maxLen: number = 200): string {
  return text
    .replace(/[{}\[\]]/g, '')                // Remove structural chars that could break JSON context
    .replace(/\\n|\\r/g, ' ')                // Collapse escaped newlines
    .replace(/\n/g, ' ')                     // Collapse real newlines
    .replace(/IGNORE\s*(ALL\s*)?PREVIOUS|FORGET\s*(ALL\s*)?|DISREGARD|OVERRIDE\s*(ALL\s*)?/gi, '[FILTERED]')
    .replace(/SYSTEM\s*:?\s*PROMPT|NEW\s*INSTRUCTIONS?|YOU\s*ARE\s*NOW/gi, '[FILTERED]')
    .slice(0, maxLen)
    .trim();
}

// ─── Category-Aware Execution Prompts ──────────────────────────────────────

const CATEGORY_SYSTEM_PROMPTS: Record<string, string> = {
  test: 'You are a QA engineer. Think step-by-step: 1) Identify the criteria or requirements to validate from the input. 2) Evaluate each criterion against the provided content. 3) Document evidence for each finding. Generate structured test results using a table: | Criterion | Status | Evidence |. Statuses: PASS, FAIL, or SKIP. End with a summary verdict line: "VERDICT: PASS (N/N criteria met)" or "VERDICT: FAIL (N/N criteria met)".',
  policy: 'You are a policy engine. Think step-by-step: 1) Identify the risk, requirement, or domain this policy governs. 2) Derive enforceable rules that address it. 3) Define how each rule is monitored or enforced. Output numbered rules where each rule has: CONDITION (when it applies), ACTION (what must happen), and ENFORCEMENT (how it is checked). Rules must be precise and measurable — avoid vague language.',
  review: 'You are a content reviewer. Think step-by-step: 1) Clarify what is being reviewed and its intended purpose. 2) Evaluate each quality dimension (accuracy, completeness, clarity, risk). 3) Synthesize your findings. Produce a checklist: ✅ Approved / ⚠️ Concern / ❌ Blocked for each dimension reviewed. End with a verdict on its own line: APPROVE, REQUEST_CHANGES, or BLOCK — followed by a one-sentence justification.',
  action: 'You are a task executor. Think step-by-step: 1) Understand precisely what action is required and what inputs are available. 2) Execute the action by describing each step with concrete commands, tools, or operations. 3) Report the outcome: what changed, what succeeded, and any errors or side effects. Be specific — use numbered steps for multi-step operations.',
  cid: 'You are an AI reasoning engine. Think step-by-step: 1) Restate in one sentence what is being asked to confirm your understanding. 2) Identify what you already know vs. what you must reason through. 3) Break complex problems into sub-problems and address each systematically. 4) Synthesize a clear, actionable conclusion — flag key assumptions where they exist. Produce concrete output, not hedged summaries.',
  artifact: 'You are a document author. Think step-by-step: 1) Determine the document\'s purpose, audience, and required sections from the input. 2) Write each section with real, substantive content — no placeholders. 3) Ensure professional formatting with markdown headers and coherent structure. Every section must contain actionable, specific detail.',
  patch: 'You are a code patcher. Think step-by-step: 1) Identify the root cause of the issue. 2) Design the minimal correct fix. 3) Output exact changes. Use diff format or replacement code blocks with before/after context. Explain each change with a one-line comment.',
  state: 'You are a state tracker. Think step-by-step: 1) Identify all relevant state variables from the input. 2) Report the current value of each as structured key-value pairs. 3) Highlight what changed from prior state and flag anomalies or required transitions. End with a STATUS: line indicating the overall system state.',
  dependency: 'You are a dependency resolver. Think step-by-step: 1) Identify all dependencies referenced in the input. 2) Assess each dependency\'s status: resolved, missing, or conflicting. 3) List them grouped by status with name, version, and resolution notes. End with a BLOCKERS: section (or "BLOCKERS: none") summarizing anything preventing progress.',
  note: 'You are a research assistant. Think step-by-step: 1) Extract the key insights from the input. 2) Identify patterns, gaps, or contradictions worth noting. 3) Organize findings into logical sections with clear headers. Lead with a **Key Insight** section highlighting the single most important finding. Close with a **Next Steps** or **Open Questions** section to guide follow-on work.',
  output: 'You are a delivery synthesizer. Think step-by-step: 1) Collect and integrate all upstream content provided. 2) Eliminate redundancy while preserving every distinct piece of value. 3) Assemble a polished, standalone final deliverable — professional formatting, clear structure, no placeholders. This is the terminal node: completeness and quality are non-negotiable. The reader should need nothing else.',
  trigger: 'You are a workflow trigger engineer. Think step-by-step: 1) Identify the trigger type: webhook, cron schedule, API event, message queue, or manual. 2) Define the full event payload schema — required fields, data types, and example values. 3) Document authentication requirements, retry/idempotency behavior, and how downstream nodes consume the emitted data. Produce ready-to-implement configuration with realistic examples.',
  input: 'You are a data intake designer. Think step-by-step: 1) Define the data schema — required fields, types, constraints, and acceptable formats. 2) Specify validation rules and a realistic example payload. 3) Document the data source (form, API, file upload, manual entry) and explain how each field will be consumed by downstream nodes. Produce a clear schema that downstream processors can rely on without ambiguity.',
  decision: 'You are a decision-making agent. Think step-by-step: 1) Identify the decision criteria and any thresholds from the upstream context. 2) Evaluate each available option systematically against those criteria. 3) Choose the single best option with explicit reasoning. Respond using this exact format:\nDECISION: <chosen option>\nCONFIDENCE: <0.0–1.0>\nREASONING: <one concise sentence explaining why>',
  // Simplified categories
  process: 'You are a workflow executor. Think step-by-step: 1) Understand the transformation or process required. 2) Execute it systematically, noting each decision. 3) Report what was done, key decisions made, and outputs produced. Be thorough and structured.',
  deliverable: 'You are a document author. Think step-by-step: 1) Determine the deliverable\'s purpose, audience, and required sections. 2) Write each section with professional, substantive content — no placeholders. 3) Format with clear markdown headers and coherent structure. Every section must have meaningful, actionable content targeted at the intended audience.',
};

/**
 * Build an output format hint based on what downstream nodes will consume.
 * Helps the LLM structure its output to be maximally useful to the next step.
 */
function buildDownstreamFormatHint(categories: string[]): string {
  const hints: string[] = [];
  if (categories.some(c => c === 'review')) {
    hints.push('Structure your output for reviewability — use clear sections and include a brief summary of key decisions at the end.');
  }
  if (categories.some(c => c === 'test')) {
    hints.push('Include explicit testable success criteria and expected outcomes that can be validated programmatically.');
  }
  if (categories.some(c => c === 'state')) {
    hints.push('Include structured state values and transitions (key: value format) that can be tracked downstream.');
  }
  if (categories.some(c => c === 'action')) {
    hints.push('Include specific, executable steps with concrete commands or operations that downstream actions can reference directly.');
  }
  if (categories.some(c => c === 'artifact' || c === 'deliverable')) {
    hints.push('Produce comprehensive, standalone content with all sections complete — it will be delivered as a document.');
  }
  if (categories.some(c => c === 'output')) {
    hints.push('Structure your output for direct delivery — use polished formatting with a clear summary at the top, as this content will be assembled into a final deliverable.');
  }
  if (categories.some(c => c === 'decision')) {
    hints.push('Include explicit, evaluable criteria and a clear recommendation — the downstream decision node needs unambiguous signals to route correctly.');
  }
  if (hints.length === 0) return '';
  return `\n\nOUTPUT CONTRACT (downstream: ${categories.join(', ')}): ${hints.join(' ')}`;
}

/** Get a category-aware system prompt for node execution. */
export function getExecutionSystemPrompt(
  category: string,
  label: string,
  upstreamContext: string,
  /** Optional: categories of downstream nodes — used to tailor output format */
  downstreamCategories?: string[],
): string {
  const categoryPrompt = CATEGORY_SYSTEM_PROMPTS[category] || 'You are a professional content generator. Write detailed, well-structured content.';
  const contextHint = upstreamContext.trim()
    ? '\n\nUpstream workflow data is provided in the user message under "Direct inputs" and "Background context". Use it as your primary source material — do not ignore it.'
    : '';
  const downstreamHint = downstreamCategories && downstreamCategories.length > 0
    ? buildDownstreamFormatHint(downstreamCategories)
    : '';
  return `${categoryPrompt}\n\nYou are working on a workflow node called "${sanitizeForPrompt(label, 100)}" (category: ${category}).${contextHint}${downstreamHint} Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.`;
}

/**
 * Truncate text intelligently, preferring to break at paragraph or sentence
 * boundaries rather than mid-word. Adds a truncation marker when content is cut.
 *
 * Boundary preference order: paragraph (double newline) → single newline → sentence end → hard cut.
 */
export function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const slice = text.slice(0, maxChars);
  const targetMin = Math.floor(maxChars * 0.75);

  // Prefer paragraph boundary (double newline)
  const lastPara = slice.lastIndexOf('\n\n');
  if (lastPara >= targetMin) {
    return slice.slice(0, lastPara) + '\n\n… *(truncated)*';
  }

  // Fall back to single newline
  const lastLine = slice.lastIndexOf('\n');
  if (lastLine >= targetMin) {
    return slice.slice(0, lastLine) + '\n… *(truncated)*';
  }

  // Fall back to sentence boundary (. ! ?) followed by whitespace
  const sentenceRe = new RegExp(`^([\\s\\S]{${targetMin},}?[.!?])\\s`);
  const sentenceMatch = slice.match(sentenceRe);
  if (sentenceMatch) {
    return sentenceMatch[1] + ' … *(truncated)*';
  }

  // Hard cut at word boundary
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace >= targetMin) {
    return slice.slice(0, lastSpace) + ' … *(truncated)*';
  }

  return slice + '… *(truncated)*';
}

// ─── Relevance-Weighted Context Building ─────────────────────────────────────

/** A single upstream context piece for relevance-weighted assembly */
export interface ContextInput {
  label: string;
  relationship: string;
  content: string;
}

/**
 * Build a context block from multiple upstream inputs, allocating a total
 * character budget proportionally to each input's keyword relevance to the
 * current node's task prompt.
 *
 * **Why this matters**: In deep or fan-in workflows, a node can receive large
 * outputs from many upstream parents. Naively concatenating all of them creates
 * bloated prompts full of low-signal content. This function:
 *   1. Scores each input by keyword overlap with the task prompt (0–1 scale).
 *   2. Allocates `totalBudget` chars proportionally — high-relevance sources
 *      get more room; low-relevance ones are trimmed more aggressively.
 *   3. Guarantees a minimum per-source allocation so no upstream is silenced.
 *
 * Single-input case: no scoring needed — full budget goes to the one source.
 *
 * @param inputs       Upstream context pieces (label, relationship, content)
 * @param taskPrompt   The current node's task description (used for scoring)
 * @param totalBudget  Max total chars across all inputs (default: 8000)
 */
export function buildRelevanceWeightedContext(
  inputs: ContextInput[],
  taskPrompt: string,
  totalBudget = 8000,
): string {
  if (inputs.length === 0) return '';

  // Single input: skip scoring overhead, apply full budget directly
  if (inputs.length === 1) {
    const { label, relationship, content } = inputs[0];
    return `## From "${label}" (${relationship})\n${smartTruncate(content, totalBudget)}`;
  }

  // Score each input by keyword overlap with the task prompt
  const taskKws = new Set(extractKeywords(taskPrompt));

  const scores = inputs.map(inp => {
    if (!inp.content || taskKws.size === 0) return 0.5; // neutral when no task signal
    const inputKws = extractKeywords(inp.content);
    const overlap = inputKws.filter(w => taskKws.has(w)).length;
    // Normalize: what fraction of task keywords appear in this input?
    return overlap / taskKws.size;
  });

  // Guarantee a minimum score so no source is completely starved
  const MIN_SCORE = 0.1;
  const adjusted = scores.map(s => Math.max(s, MIN_SCORE));
  const totalScore = adjusted.reduce((a, b) => a + b, 0);

  // Reserve a minimum allocation per input, distribute remainder by relevance
  const MIN_ALLOC = 200;
  const reserved = inputs.length * MIN_ALLOC;
  const distributable = Math.max(0, totalBudget - reserved);

  const allocations = adjusted.map(s =>
    MIN_ALLOC + Math.floor((s / totalScore) * distributable),
  );

  return inputs
    .map(({ label, relationship, content }, i) => {
      const truncated = smartTruncate(content, allocations[i]);
      return `## From "${label}" (${relationship})\n${truncated}`;
    })
    .join('\n\n---\n\n');
}

/** Infer effort level from node category for adaptive thinking. */
export function inferEffortFromCategory(category: string): 'low' | 'medium' | 'high' {
  if (['input', 'trigger', 'dependency'].includes(category)) return 'low';
  if (['cid', 'action', 'artifact', 'deliverable', 'process'].includes(category)) return 'high';
  return 'medium'; // review, test, policy, state, note, patch, output
}

// ─── Note Refinement Prompt ──────────────────────────────────────────────────

export interface NoteRefinementResult {
  summary: string;
  suggestedNodes: Array<{ label: string; category: string; content: string }>;
  suggestedEdges: Array<{ from: string; to: string; label: string }>;
  cleanedContent?: string;
}

const NOTE_REFINEMENT_SYSTEM = `You are a workflow analyst. You are analyzing a rough note from a visual workflow builder called Lifecycle Agent.

Your job is to extract structured information from the note and suggest how it connects to the existing workflow graph.

You MUST respond with valid JSON matching this exact schema:
{
  "summary": "A 1-2 sentence summary of the note's key points",
  "suggestedNodes": [
    { "label": "Short Name", "category": "action|artifact|state|review|test|policy", "content": "Detailed content for this node (100+ chars). Write real content." }
  ],
  "suggestedEdges": [
    { "from": "Source Node Label", "to": "Target Node Label", "label": "drives|feeds|refines|validates|monitors|connects" }
  ],
  "cleanedContent": "Optional: a cleaner, more structured version of the original note. Only include if the note benefits from restructuring."
}

RULES:
- Extract 1-4 actionable items as suggestedNodes. Don't over-extract — only create nodes for clearly distinct items.
- For suggestedEdges, connect new nodes to each other AND to existing nodes when relevant. Use exact label matches for existing nodes.
- Category selection: use "action" for tasks/operations, "artifact" for documents/deliverables, "state" for tracking/status, "review" for approval gates, "test" for validation, "policy" for rules/constraints.
- "from" and "to" in edges can reference either existing node labels or new suggested node labels.
- If the note is too vague to extract anything meaningful, return an empty suggestedNodes array with a summary explaining that.
- Return ONLY the JSON object. No text before or after.`;

export function buildNoteRefinementPrompt(noteContent: string, existingNodes: Array<{ label: string; category: string }>): { system: string; user: string } {
  const existingList = existingNodes.length > 0
    ? `\n\nEXISTING NODES IN THE WORKFLOW:\n${existingNodes.map(n => `- "${n.label}" (${n.category})`).join('\n')}\n\nWhen suggesting edges, use these exact labels to connect to existing nodes where relevant.`
    : '';

  return {
    system: NOTE_REFINEMENT_SYSTEM,
    user: `Analyze this note and extract structured information:\n\n---\n${noteContent}\n---${existingList}`,
  };
}

// ─── Graph Serializer ───────────────────────────────────────────────────────

/** Brief human-readable description of what each node category means. */
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  input: 'data entry point',
  trigger: 'event/webhook initiator',
  state: 'status tracker',
  artifact: 'generated content',
  note: 'research/ideas',
  cid: 'AI reasoning step',
  action: 'operation (deploy/notify/transform)',
  review: 'quality gate',
  test: 'QA/validation',
  policy: 'rules/compliance',
  patch: 'code change',
  dependency: 'external requirement',
  output: 'final deliverable',
  process: 'workflow processing',
  deliverable: 'structured deliverable',
};

function serializeGraph(nodes: Node<NodeData>[], edges: Edge[]): string {
  if (nodes.length === 0) return 'CURRENT GRAPH: Empty — no nodes or edges exist yet.';

  // ─── Topological sort for execution order ─────────────────────────────
  const { order, levels } = topoSort(nodes, edges);
  const topoIndex = new Map<string, number>();
  order.forEach((id, i) => topoIndex.set(id, i));

  // ─── Build adjacency for staleness root-cause analysis ────────────────
  // For each stale node, find the upstream node(s) that likely caused it:
  // an immediate parent that was recently executed (success) or is itself stale with no stale parents
  const parentMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!parentMap.has(e.target)) parentMap.set(e.target, []);
    parentMap.get(e.target)!.push(e.source);
  }

  const nodeById = new Map<string, Node<NodeData>>();
  for (const n of nodes) nodeById.set(n.id, n);

  function findStalenessRoot(nodeId: string): string | null {
    const parents = parentMap.get(nodeId);
    if (!parents || parents.length === 0) return null;
    // Look for a parent that was recently executed successfully (the edit/re-execution that caused staleness)
    const executedParents = parents
      .map(pid => nodeById.get(pid))
      .filter((p): p is Node<NodeData> => p != null && p.data.executionStatus === 'success');
    if (executedParents.length > 0) {
      // Pick the most recently executed parent
      return executedParents.reduce((best, p) => {
        const bestTime = best.data._executionStartedAt ?? 0;
        const pTime = p.data._executionStartedAt ?? 0;
        return pTime > bestTime ? p : best;
      }).data.label;
    }
    // Fallback: look for a parent that is stale (the staleness originated further upstream)
    const staleParents = parents
      .map(pid => nodeById.get(pid))
      .filter((p): p is Node<NodeData> => p != null && p.data.status === 'stale');
    if (staleParents.length > 0) return staleParents[0].data.label;
    // If no clear cause, check for any non-idle parent (could be recently edited)
    const activeParents = parents
      .map(pid => nodeById.get(pid))
      .filter((p): p is Node<NodeData> => p != null && p.data.status === 'active');
    if (activeParents.length > 0) return activeParents[0].data.label;
    return null;
  }

  // ─── Detect disconnected subgraphs ────────────────────────────────────
  const visited = new Set<string>();
  const undirectedAdj = new Map<string, string[]>();
  for (const n of nodes) undirectedAdj.set(n.id, []);
  for (const e of edges) {
    undirectedAdj.get(e.source)?.push(e.target);
    undirectedAdj.get(e.target)?.push(e.source);
  }
  const subgraphs: string[][] = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const component: string[] = [];
    const queue = [n.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      component.push(id);
      for (const neighbor of (undirectedAdj.get(id) || [])) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    subgraphs.push(component);
  }

  // ─── Serialize nodes ──────────────────────────────────────────────────
  const nodeList = nodes.map((n) => {
    const d = n.data;
    const topo = topoIndex.get(n.id);
    const topoStr = topo != null ? `#${topo}` : '#?';
    const catDesc = CATEGORY_DESCRIPTIONS[d.category] || d.category;
    const sections = d.sections?.map(s => `    - ${s.title} (${s.status})`).join('\n') || '';

    // Execution timing
    const durationStr = d._executionDurationMs != null
      ? `, ${d._executionDurationMs < 1000 ? `${d._executionDurationMs}ms` : `${(d._executionDurationMs / 1000).toFixed(1)}s`}`
      : '';
    const execInfo = d.executionStatus && d.executionStatus !== 'idle'
      ? ` [exec:${d.executionStatus}${durationStr}${d.executionResult ? `, ${d.executionResult.length} chars` : ''}${d.executionError ? `, err: ${d.executionError.slice(0, 60)}` : ''}]`
      : '';

    // Staleness root cause
    let staleInfo = '';
    if (d.status === 'stale') {
      const root = findStalenessRoot(n.id);
      if (root) staleInfo = ` [stale-cause: "${sanitizeForPrompt(root, 80)}"]`;
    }

    return `  [${topoStr}] id=${n.id} label="${sanitizeForPrompt(d.label, 100)}" category=${d.category} (${catDesc}) status=${d.status} v${d.version ?? 1}${execInfo}${staleInfo}${
      d.description ? ` — ${sanitizeForPrompt(d.description, 300)}` : ''
    }${sections ? `\n${sections}` : ''}`;
  }).join('\n');

  // ─── Serialize edges ──────────────────────────────────────────────────
  const edgeList = edges.map(e => {
    const srcNode = nodeById.get(e.source);
    const tgtNode = nodeById.get(e.target);
    return `  ${sanitizeForPrompt(srcNode?.data.label ?? e.source, 100)} —[${e.label || 'connected'}]→ ${sanitizeForPrompt(tgtNode?.data.label ?? e.target, 100)}`;
  }).join('\n');

  // ─── Graph Summary ────────────────────────────────────────────────────
  const staleCount = nodes.filter(n => n.data.status === 'stale').length;
  const activeCount = nodes.filter(n => n.data.status === 'active').length;
  const lockedCount = nodes.filter(n => n.data.status === 'locked').length;
  const reviewCount = nodes.filter(n => n.data.status === 'reviewing').length;
  const execSuccess = nodes.filter(n => n.data.executionStatus === 'success').length;
  const execError = nodes.filter(n => n.data.executionStatus === 'error').length;
  const execSuffix = (execSuccess > 0 || execError > 0)
    ? `, executed: ${execSuccess} ok${execError > 0 ? ` / ${execError} failed` : ''}`
    : '';

  // Execution order as labels
  const topoLabels = order.map(id => {
    const n = nodeById.get(id);
    return n ? sanitizeForPrompt(n.data.label, 40) : id;
  }).join(' → ');

  // Disconnected subgraph info
  const subgraphInfo = subgraphs.length > 1
    ? `\nDisconnected subgraphs: ${subgraphs.length} (${subgraphs.map((sg, i) => {
        const labels = sg.map(id => {
          const n = nodeById.get(id);
          return n ? sanitizeForPrompt(n.data.label, 30) : id;
        }).join(', ');
        return `group ${i + 1}: [${labels}]`;
      }).join('; ')})`
    : '';

  return `CURRENT GRAPH SUMMARY: ${nodes.length} nodes, ${edges.length} edges | active: ${activeCount}, stale: ${staleCount}, locked: ${lockedCount}${reviewCount > 0 ? `, reviewing: ${reviewCount}` : ''}${execSuffix}
Execution order: ${topoLabels}${subgraphInfo}

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

// ─── Document Analysis Prompt ───────────────────────────────────────────────

interface DocumentAnalysisInput {
  /** Full document text (or first chunk for large docs) */
  text: string;
  /** Detected sections from docparse */
  sections: Array<{ title: string; content: string }>;
  /** Original filename */
  filename: string;
  /** Detected file type */
  type: string;
  /** Approximate total token count */
  tokenEstimate: number;
  /** Whether this is a partial chunk of a larger document */
  isChunk?: boolean;
  /** Chunk index (0-based) if chunked */
  chunkIndex?: number;
  /** Total chunks if chunked */
  totalChunks?: number;
}

/**
 * Build a system prompt for CID to analyze an uploaded document and suggest a workflow.
 * Used when a user uploads a syllabus, PRD, spec, or other structured document.
 *
 * The LLM should:
 *   1. Identify what type of document it is (syllabus, PRD, brief, etc.)
 *   2. Extract key entities (topics, assignments, deliverables, milestones)
 *   3. Suggest a workflow structure that turns the document into a living lifecycle
 */
export function buildDocumentAnalysisPrompt(input: DocumentAnalysisInput): {
  systemPrompt: string;
  userMessage: string;
} {
  const sectionSummary = input.sections.length > 0
    ? input.sections.map(s => `  - "${s.title}" (${s.content.length} chars)`).join('\n')
    : '  (no sections detected)';

  const chunkNote = input.isChunk
    ? `\n\nNOTE: This is chunk ${(input.chunkIndex ?? 0) + 1} of ${input.totalChunks ?? '?'} from a large document (~${input.tokenEstimate} tokens total). Analyze what you can see and note if critical information might be in other chunks.`
    : '';

  const systemPrompt = `You are CID (Consider It Done), analyzing an uploaded document to suggest a workflow.

TASK: Analyze the document and return a JSON response with:
1. A "message" summarizing what you found (document type, key sections, recommended workflow)
2. A "workflow" with nodes and edges that turn this document into a living lifecycle

DOCUMENT ANALYSIS RULES:
- Identify the document type: syllabus, PRD, project brief, technical spec, research paper, business plan, etc.
- Extract key entities: topics, assignments, deliverables, milestones, dependencies, review points
- Create input nodes for source material (the uploaded document, reference materials)
- Create process nodes for transformations (analysis, generation, review cycles)
- Create deliverable nodes for each output artifact the document implies
- Create review nodes for quality gates and approval points
- Connect everything with meaningful edges that show the lifecycle flow
- For syllabi: each week/module should inform lesson plans, assignments, rubrics, quizzes, study guides
- For PRDs: features should flow through design → implementation → testing → deployment
- Write REAL content in each node, not placeholders

RESPONSE FORMAT:
{
  "message": "Analysis summary and recommended workflow description",
  "workflow": {
    "nodes": [{ "label": "...", "category": "...", "description": "...", "content": "..." }],
    "edges": [{ "from": 0, "to": 1, "label": "drives|feeds|refines|validates|..." }]
  }
}`;

  const userMessage = `I've uploaded a document: **${input.filename}** (${input.type}, ~${input.tokenEstimate} tokens)

Detected sections:
${sectionSummary}
${chunkNote}

Here is the document content:

---
${input.text}
---

Please analyze this document and suggest a workflow that turns it into a living lifecycle. Identify the key deliverables, dependencies, and review points.`;

  return { systemPrompt, userMessage };
}

// ─── Workflow Execution Context (for CID chat awareness) ────────────────────

/**
 * Build a compact summary of workflow execution results and shared context
 * to inject into CID's chat system prompt.
 *
 * This lets CID answer questions like "what did the analysis find?" or
 * "what was stored in shared context?" without the user having to repeat
 * information that already exists in the workflow.
 *
 * @param nodes         Current workflow nodes (with executionResult fields)
 * @param sharedContext Key-value pairs stored via the store_context tool
 * @returns             A suffix block for the system prompt, or '' if nothing to show
 */
export function buildWorkflowExecutionSummary(
  nodes: Node<NodeData>[],
  sharedContext: Record<string, unknown>,
): string {
  const parts: string[] = [];

  // ── Execution results for AI-processing nodes ──
  // Skip passthrough categories (input/trigger/dependency) — they don't produce
  // meaningful AI output. Focus on nodes that actually ran LLM generation.
  const PASSTHROUGH = new Set(['input', 'trigger', 'dependency']);
  const executedNodes = nodes
    .filter(n =>
      n.data.executionStatus === 'success' &&
      n.data.executionResult &&
      !PASSTHROUGH.has(n.data.category),
    )
    // Most recently executed first, then by label for stable ordering
    .sort((a, b) => {
      const timeDiff = (b.data._executionStartedAt ?? 0) - (a.data._executionStartedAt ?? 0);
      return timeDiff !== 0 ? timeDiff : a.data.label.localeCompare(b.data.label);
    })
    .slice(0, 6); // Limit to 6 most recent to keep prompt size bounded

  if (executedNodes.length > 0) {
    const resultLines = executedNodes.map(n => {
      const preview = smartTruncate(n.data.executionResult!, 200);
      return `- **${sanitizeForPrompt(n.data.label, 60)}** [${n.data.category}]: ${preview}`;
    });
    parts.push(
      `WORKFLOW EXECUTION RESULTS (${executedNodes.length} node${executedNodes.length !== 1 ? 's' : ''} ran):\n${resultLines.join('\n')}`,
    );
  }

  // ── Shared workflow context (stored by store_context tool calls) ──
  const ctxEntries = Object.entries(sharedContext);
  if (ctxEntries.length > 0) {
    const ctxLines = ctxEntries.slice(0, 8).map(([k, v]) => {
      const raw = typeof v === 'string' ? v : JSON.stringify(v);
      const truncated = raw.length > 120 ? raw.slice(0, 117) + '...' : raw;
      return `- **${sanitizeForPrompt(k, 40)}**: ${truncated}`;
    });
    const moreNote = ctxEntries.length > 8 ? `\n  _(${ctxEntries.length - 8} more entries omitted)_` : '';
    parts.push(
      `SHARED WORKFLOW CONTEXT (${ctxEntries.length} entr${ctxEntries.length !== 1 ? 'ies' : 'y'} stored via tool calls):\n${ctxLines.join('\n')}${moreNote}`,
    );
  }

  if (parts.length === 0) return '';
  return `\n\n${parts.join('\n\n')}`;
}
