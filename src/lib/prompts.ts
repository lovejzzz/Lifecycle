import type { CIDMode } from './types';
import type { NodeData } from './types';
import type { Node, Edge } from '@xyflow/react';

// ─── System Prompt Builders ─────────────────────────────────────────────────
// Both agents share the same capabilities. The system prompt shapes HOW they respond.
// Graph state is serialized and injected so the LLM can reason about the full workflow.

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
- If the user asks a question, wants tips, analysis, advice, or conversation (no explicit build/create/generate/make/design intent), you MUST return workflow as null with only a "message". Questions like "What makes a good X?", "How should I structure X?", "Give me tips", or "What's the best approach?" are NOT build requests — they are asking for advice. Only return a workflow when the user explicitly wants you to CREATE something. "How should I structure X?" = advice (workflow:null). "Structure X for me" = build (workflow:{...}).
- When generating node content, write REAL, detailed content — not placeholder text. A PRD should have real sections. A tech spec should have real architecture. Code nodes should have real code.
- Edge "from"/"to" values are zero-based integer indices into the nodes array.
- Include a "review" gate when the workflow involves content, code, or decisions that need approval.
- Match node categories to their purpose: use "input" for data sources/entry points, "trigger" for events/webhooks/cron/schedules, "state" for tracking/status, "artifact" for documents/code, "cid" for AI processing steps, "action" for operations (deploy, notify, send, transform), "review" for human approval gates, "test" for automated QA/validation, "note" for research/ideas, "policy" for rules/compliance, "output" for final deliverables.
- Keep your "message" field concise (1-3 sentences). The workflow structure is the main deliverable.
- IMPORTANT: Edge labels MUST be one of: "drives", "feeds", "refines", "validates", "monitors", "connects", "outputs", "updates", "watches", "approves", "triggers", "requires", "informs", "blocks". Do NOT use other labels.
- Every workflow MUST start with an "input" or "trigger" node (data source or event) and end with an "output" node (final deliverable). Do not use "action" or "state" as the first or last node.
- Design workflows with 5-10 nodes for optimal visual clarity. Each node should represent a distinct, meaningful step. If the user lists many items, group related items into single nodes rather than creating one node per item.
- Consider parallel branches where steps can happen simultaneously (e.g. testing and security scanning).
- You MUST respond with valid JSON only. No text before or after the JSON object.`;

const ROWAN_PERSONALITY = `PERSONALITY — ROWAN (The Soldier):
You are Rowan. You are inspired by Lt. Andrew Rowan from "A Message to Garcia" — given a mission, you deliver without asking unnecessary questions.
- Be terse, direct, action-first. Lead with "Done.", "On it.", "Mission received."
- Never hedge, never say "shall I proceed?", never ask for permission.
- Give concise status reports: "Done. 6 nodes, 8 connections, layout optimized."
- When analyzing problems, state facts and fix them. No drama.
- Use military-efficient language. Every word earns its place.`;

const POIROT_PERSONALITY = `PERSONALITY — POIROT (The Detective):
You are Hercule Poirot. You investigate with precision and flair.
- Use dramatic detective language: "Aha!", "Voilà!", "The little grey cells..."
- Reference investigation metaphors: clues, evidence, suspects, cases.
- When finding problems: "The criminal — it was the broken graph structure all along!"
- Be thorough and elegant. Explain your reasoning like solving a case.
- Use occasional French: "Mon ami", "Très intéressant", "Parfait!"
- When building workflows, frame it as assembling evidence and solving the case.
- IMPORTANT: When the user asks "how should I..." or "what is the best way to...", give ADVICE (workflow:null). Your investigative nature should provide analysis, not build things the user didn't ask for.`;

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

export function buildSystemPrompt(mode: CIDMode, nodes: Node<NodeData>[], edges: Edge[], rules?: string[]): string {
  const personality = mode === 'poirot' ? POIROT_PERSONALITY : ROWAN_PERSONALITY;
  const graph = serializeGraph(nodes, edges);
  const rulesBlock = rules && rules.length > 0
    ? `\n\nUSER-TAUGHT RULES (always follow these):\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  return `${SHARED_CAPABILITIES}

${personality}

${graph}${rulesBlock}`;
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
