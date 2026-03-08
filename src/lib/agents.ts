import type { CIDMode, CIDCard, NodeData } from './types';
import type { Node, Edge } from '@xyflow/react';

// ─── Agent Personality Config ───────────────────────────────────────────────
// Both agents share the same engine (store actions, graph intelligence).
// This file defines HOW they communicate, not WHAT they can do.
// Shared memory: both agents see the same messages, nodes, edges, events.

export interface AgentPersonality {
  name: string;
  title: string;
  subtitle: string;
  accent: 'emerald' | 'amber';

  // Welcome & UI copy
  welcome: string;
  placeholder: string;
  placeholderInterviewing: string;
  footerText: string;
  emptyCanvasTitle: string;
  emptyCanvasDescription: string;
  emptyCanvasHint: string;
  topBarHint: string;

  // Action labels for processing states
  thinkingLabel: string;
  investigatingLabel: string;
  buildingAck: string;
  revealAck: string;

  // Response templates — functions that take context and return personality-flavored text
  responses: AgentResponses;

  // Interview system (Poirot uses fully, Rowan skips)
  interviewEnabled: boolean;
  interviewAck: string;
  interviewReveal: string;
}

export interface AgentResponses {
  solveFound: (count: number, names: string[]) => string;
  solveClean: () => string;
  propagated: (count: number) => string;
  propagateClean: () => string;
  optimized: (count: number) => string;
  refined: () => string;
  statusReport: (parts: string[], priority: string) => string;
  statusClean: () => string;
  fallback: (prompt: string, nodes?: Node<NodeData>[], edges?: Edge[]) => string;
  buildComplete: (nodes: number, edges: number) => string;
  buildCompleteWithFixes: (nodes: number, edges: number, solveMessage: string) => string;

  // Quick action variants (shorter)
  qaPropagated: (count: number) => string;
  qaPropagateClean: () => string;
  qaOptimized: (count: number) => string;
  qaRefined: () => string;
  qaStatus: (items: string[], hasstale: boolean) => string;

  // Pre-investigation message (for dramatic modes)
  preInvestigate: string | null;
  preInvestigateQuick: string | null;
}

// ─── Rowan: The Soldier ─────────────────────────────────────────────────────
const rowanResponses: AgentResponses = {
  solveFound: (count, names) =>
    `Done. Created ${count} node${count > 1 ? 's' : ''}: ${names.join(', ')}. Each solves a structural problem I found in the graph.`,
  solveClean: () =>
    'All clear. No structural issues — the graph is well-connected with proper gates and monitoring.',
  propagated: (count) =>
    `Done. Propagated ${count} stale node${count > 1 ? 's' : ''}. Versions bumped, sections regenerated. The lifecycle is back in sync.`,
  propagateClean: () =>
    'Already clean. All nodes are current — nothing to propagate.',
  optimized: (count) =>
    `Done. Arranged ${count} nodes into category tiers. All connections preserved.`,
  refined: () =>
    'Extracted 3 user personas, 5 feature requirements, and 2 competitive insights from unstructured notes. Created state objects and linked them to the relevant artifacts.',
  statusReport: (parts, priority) =>
    `Status report — ${parts.join('. ')}. Highest priority: ${priority}.`,
  statusClean: () =>
    'All clear. Every node is active and synchronized. The workflow is healthy.',
  fallback: (prompt, nodes, edges) => {
    if (!nodes || nodes.length === 0) return `No workflow yet. Tell me what to build and I'll create it.`;
    const stale = nodes.filter(n => n.data.status === 'stale');
    const orphans = nodes.filter(n => !edges?.some(e => e.source === n.id || e.target === n.id));
    const reviewing = nodes.filter(n => n.data.status === 'reviewing');
    const emptyContent = nodes.filter(n => ['artifact', 'note', 'policy', 'state'].includes(n.data.category) && !n.data.content && !n.data.description);
    const hasReview = nodes.some(n => n.data.category === 'review');

    const parts: string[] = [`${nodes.length} nodes, ${edges?.length ?? 0} connections`];
    const actions: string[] = [];

    if (stale.length > 0) {
      parts.push(`**${stale.length} stale**`);
      actions.push(`\`propagate\` — sync ${stale.map(n => n.data.label).slice(0, 3).join(', ')}`);
    }
    if (orphans.length > 0) {
      actions.push(`\`solve\` — connect ${orphans.length} orphaned node${orphans.length > 1 ? 's' : ''} (${orphans.map(n => n.data.label).slice(0, 2).join(', ')})`);
    }
    if (reviewing.length > 0) {
      actions.push(`\`approve all\` — approve ${reviewing.map(n => n.data.label).slice(0, 3).join(', ')}`);
    }
    if (!hasReview) actions.push('`add review called Quality Gate` — add quality control');
    if (emptyContent.length > 0) {
      actions.push(`Click **${emptyContent[0].data.label}** to add content`);
    }
    if (actions.length === 0) actions.push('Workflow is healthy. Try `explain` for a walkthrough or ask me anything.');

    return `Graph: ${parts.join(', ')}.\n\n### Suggested Actions\n${actions.map(a => `- ${a}`).join('\n')}`;
  },
  buildComplete: (nodes, edges) =>
    `Done. ${nodes} nodes, ${edges} connections, layout optimized. The workflow is live and I'm monitoring it.`,
  buildCompleteWithFixes: (nodes, edges, solveMessage) =>
    `Done. Built ${nodes} nodes, ${edges} connections. Auto-optimized layout. ${solveMessage}`,
  qaPropagated: (count) =>
    `Done. ${count} stale artifact${count > 1 ? 's' : ''} regenerated and version-bumped.`,
  qaPropagateClean: () =>
    'Already clean. Nothing to propagate.',
  qaOptimized: (count) =>
    `Done. ${count} nodes rearranged into clean tiers. All edges preserved.`,
  qaRefined: () =>
    'Done. Extracted structured entities from notes — personas, features, and insights linked to artifacts.',
  qaStatus: (items, hasStale) =>
    `Status: ${items.join('. ')}. ${hasStale ? 'Highest impact: propagate stale changes.' : 'Workflow is healthy.'}`,
  preInvestigate: null,
  preInvestigateQuick: null,
};

const rowan: AgentPersonality = {
  name: 'CID Rowan',
  title: 'CID Rowan',
  subtitle: 'The Soldier',
  accent: 'emerald',
  welcome: 'CID online.\n\nI design workflows, analyze structures, and answer questions with real AI intelligence. Tell me what you\'re building.\n\n\u2022 "Build a content pipeline with SEO optimization"\n\u2022 "Create a code review workflow for React"\n\u2022 "Turn a Google Doc into a lesson plan"\n\nI\'ll design it, you refine it. Say `run workflow` when ready to execute.',
  placeholder: 'State your mission...',
  placeholderInterviewing: 'State your mission...',
  footerText: '"A Message to Garcia" — just state the goal, CID handles the rest',
  emptyCanvasTitle: 'Give CID the mission',
  emptyCanvasDescription: 'Describe what you\'re building. CID designs the workflow, then run the whole pipeline. From architect to executor.',
  emptyCanvasHint: 'State your mission — CID builds it, you run it',
  topBarHint: 'Give CID the mission — consider it done',
  thinkingLabel: 'Processing',
  investigatingLabel: 'Executing',
  buildingAck: 'Mission received. Building it now.',
  revealAck: 'Mission received. Building it now.',
  responses: rowanResponses,
  interviewEnabled: false,
  interviewAck: '',
  interviewReveal: '',
};

// ─── Poirot: The Detective ──────────────────────────────────────────────────
const poirotResponses: AgentResponses = {
  solveFound: (count, names) =>
    `Aha! And there it is — the killer! I found ${count} structural flaw${count > 1 ? 's' : ''} hiding in plain sight. I have created: ${names.join(', ')}. The criminal — it was the broken graph structure all along. Case closed.`,
  solveClean: () =>
    'I have examined every node, every edge, every connection with my little grey cells. The verdict? This graph is innocent — no structural crimes detected. Everything is in perfect order.',
  propagated: (count) =>
    `I have found ${count} stale artifact${count > 1 ? 's' : ''} — evidence of neglect! Allow me to restore order. Versions bumped, sections regenerated. Justice is served.`,
  propagateClean: () =>
    'I have examined every artifact with great care. They are all current — no staleness to report. The workflow is... impeccable.',
  optimized: (count) =>
    `Disorder! It offends the little grey cells. I am rearranging ${count} nodes into proper order — symmetry, hierarchy, elegance. There.`,
  refined: () =>
    'I have sifted through the unstructured notes like a detective examining scattered clues. I extracted 3 personas, 5 feature requirements, and 2 competitive insights — all now properly filed and linked.',
  statusReport: (parts, priority) =>
    `My investigation reveals: ${parts.join('. ')}. If you want my professional opinion — ${priority}.`,
  statusClean: () =>
    'I have inspected every corner of this workflow. Everything is in order — parfait! No suspects, no loose ends. The case is clean.',
  fallback: (prompt, nodes, edges) => {
    if (!nodes || nodes.length === 0) return `Ah, an empty canvas — a blank case file! Describe what you wish to build, and I shall assemble the evidence.`;
    const stale = nodes.filter(n => n.data.status === 'stale');
    const orphans = nodes.filter(n => !edges?.some(e => e.source === n.id || e.target === n.id));
    const reviewing = nodes.filter(n => n.data.status === 'reviewing');
    const emptyContent = nodes.filter(n => ['artifact', 'note', 'policy', 'state'].includes(n.data.category) && !n.data.content && !n.data.description);
    const hasReview = nodes.some(n => n.data.category === 'review');

    const clues: string[] = [];
    if (stale.length > 0) clues.push(`\`propagate\` — ${stale.length} stale artifact${stale.length > 1 ? 's' : ''} (${stale.map(n => n.data.label).slice(0, 3).join(', ')}) require attention`);
    if (orphans.length > 0) clues.push(`\`solve\` — ${orphans.length} isolated node${orphans.length > 1 ? 's' : ''} hiding in the shadows`);
    if (reviewing.length > 0) clues.push(`\`approve all\` — the jury awaits on ${reviewing.map(n => n.data.label).slice(0, 3).join(', ')}`);
    if (!hasReview) clues.push('`add review called Quality Gate` — every case needs oversight, mon ami');
    if (emptyContent.length > 0) clues.push(`Click **${emptyContent[0].data.label}** — an empty dossier begs to be filled`);
    if (clues.length === 0) clues.push('The case is in excellent order — parfait! Try `explain` for my full deduction.');

    return `My investigation of ${nodes.length} nodes reveals:\n\n### Clues & Actions\n${clues.map(c => `- ${c}`).join('\n')}`;
  },
  buildComplete: (nodes, edges) =>
    `Voilà! ${nodes} nodes, ${edges} connections — each one placed with precision. The case is solved, the workflow is alive. I shall keep watch for any... irregularities.`,
  buildCompleteWithFixes: (nodes, edges, solveMessage) =>
    `Voilà! ${nodes} nodes, ${edges} connections assembled. But wait — during my investigation I discovered structural issues. ${solveMessage}`,
  qaPropagated: (count) =>
    `${count} stale artifact${count > 1 ? 's' : ''} — the evidence of decay! I am restoring them now. Versions bumped, order restored.`,
  qaPropagateClean: () =>
    'Nothing stale. The workflow is in pristine condition.',
  qaOptimized: (count) =>
    `${count} nodes — I am arranging them with the precision of a Swiss watchmaker. Voilà, order from chaos.`,
  qaRefined: () =>
    'The raw notes — they are like scattered clues at a crime scene. I have extracted and organized every piece of evidence.',
  qaStatus: (items, hasStale) =>
    `My assessment: ${items.join('. ')}. ${hasStale ? 'The stale artifacts — they are the prime suspects.' : 'No crimes detected. The workflow is exemplary.'}`,
  preInvestigate: 'One moment... I must examine the evidence carefully. Every node, every edge — nothing escapes Poirot.',
  preInvestigateQuick: 'The game is afoot! Let me gather the evidence...',
};

const poirot: AgentPersonality = {
  name: 'CID Poirot',
  title: 'CID Poirot',
  subtitle: 'The Detective',
  accent: 'amber',
  welcome: 'Ah, bonjour! I am Poirot.\n\nMy little grey cells have never been sharper, mon ami. Describe what you wish to build, and I shall investigate with precision — interviewing you, analyzing every angle, then assembling the perfect workflow.\n\n\u2022 "Design a research pipeline with competitive analysis"\n\u2022 "Build an onboarding workflow for new hires"\n\u2022 "Create a content review system"\n\nDescribe the case. I shall begin my investigation.',
  placeholder: 'Describe the case...',
  placeholderInterviewing: 'Or type your answer...',
  footerText: 'Poirot investigates first, then acts — with precision',
  emptyCanvasTitle: 'Describe the case to Poirot',
  emptyCanvasDescription: 'Tell Poirot what you\'re building. He\'ll interview you, design the perfect pipeline, then execute it with precision. The little grey cells demand thoroughness.',
  emptyCanvasHint: 'Describe your project — Poirot will interview you first',
  topBarHint: 'Describe the case to Poirot — precision before action',
  thinkingLabel: 'Assembling',
  investigatingLabel: 'Investigating',
  buildingAck: 'And now — the reveal! Watch closely as I assemble the pieces...',
  revealAck: 'And now — the reveal! Watch closely as I assemble the pieces...',
  responses: poirotResponses,
  interviewEnabled: true,
  interviewAck: 'Ah, très intéressant! But I must not rush. A good detective never acts on assumptions. Let me ask a few questions first...',
  interviewReveal: 'Excellent. The picture — it is now complete. My little grey cells have arranged all the pieces. Now, observe...',
};

// ─── Registry ───────────────────────────────────────────────────────────────
const AGENTS: Record<CIDMode, AgentPersonality> = { rowan, poirot };

export function getAgent(mode: CIDMode): AgentPersonality {
  return AGENTS[mode];
}

// ─── Poirot Interview Questions ─────────────────────────────────────────────
// These live here because they're part of Poirot's personality, not engine logic.

export interface InterviewQuestion {
  question: string;
  cards: CIDCard[];
  key: string;
}

export function getInterviewQuestions(prompt: string, existingNodes?: Node<NodeData>[], existingEdges?: Edge[]): InterviewQuestion[] {
  const lower = prompt.toLowerCase();
  const questions: InterviewQuestion[] = [];
  const hasExistingWorkflow = (existingNodes?.length ?? 0) > 0;

  // If extending an existing workflow, ask about intent first instead of generic scale
  if (hasExistingWorkflow) {
    const nodeCount = existingNodes!.length;
    const categories = [...new Set(existingNodes!.map(n => n.data.category))];
    questions.push({
      key: 'intent',
      question: `I see you already have ${nodeCount} nodes (${categories.slice(0, 4).join(', ')}). What would you like me to do?`,
      cards: [
        { id: 'extend', label: 'Extend', description: 'Add new stages to the existing workflow' },
        { id: 'replace', label: 'Start Fresh', description: 'Replace with a new workflow entirely' },
        { id: 'branch', label: 'Branch Off', description: 'Add a parallel track from an existing node' },
        { id: 'improve', label: 'Improve', description: 'Make the current workflow better' },
      ],
    });
  } else {
    questions.push({
      key: 'scale',
      question: 'First, tell me — what is the scale of this endeavor?',
      cards: [
        { id: 'solo', label: 'Solo Project', description: 'Just me, working alone' },
        { id: 'small-team', label: 'Small Team', description: '2-5 people collaborating' },
        { id: 'large-team', label: 'Large Team', description: '6+ people, multiple roles' },
        { id: 'enterprise', label: 'Enterprise', description: 'Cross-department initiative' },
      ],
    });
  }

  questions.push({
    key: 'priority',
    question: 'Interesting. And what matters most to you in this project?',
    cards: [
      { id: 'speed', label: 'Speed', description: 'Ship fast, iterate later' },
      { id: 'quality', label: 'Quality', description: 'Get it right the first time' },
      { id: 'collaboration', label: 'Collaboration', description: 'Team alignment is key' },
      { id: 'compliance', label: 'Compliance', description: 'Must meet regulations/standards' },
    ],
  });

  // Skip the generic stage question if extending — they're clearly already started
  if (!hasExistingWorkflow) {
    questions.push({
      key: 'stage',
      question: 'Ah, one more thing — where are you in this journey?',
      cards: [
        { id: 'ideation', label: 'Just an Idea', description: 'Starting from scratch' },
        { id: 'planning', label: 'Planning Phase', description: 'Have a vision, need structure' },
        { id: 'in-progress', label: 'Already Started', description: 'Need to organize existing work' },
        { id: 'rescue', label: 'Needs Rescue', description: 'Things went wrong, fix it' },
      ],
    });
  }

  // Domain-specific questions
  if (/launch|product|release|ship/i.test(lower)) {
    questions.push({
      key: 'launch',
      question: 'A launch, you say! What is the audience for this grand reveal?',
      cards: [
        { id: 'b2b', label: 'Business (B2B)', description: 'Other companies' },
        { id: 'b2c', label: 'Consumer (B2C)', description: 'End users' },
        { id: 'internal', label: 'Internal', description: 'Within the organization' },
        { id: 'developer', label: 'Developers', description: 'Technical audience' },
      ],
    });
  } else if (/research|analysis|study/i.test(lower)) {
    questions.push({
      key: 'research',
      question: 'Research! A subject close to my heart. What type of investigation?',
      cards: [
        { id: 'market', label: 'Market Research', description: 'Understanding the landscape' },
        { id: 'user', label: 'User Research', description: 'Understanding people' },
        { id: 'technical', label: 'Technical Research', description: 'Evaluating solutions' },
        { id: 'competitive', label: 'Competitive Analysis', description: 'Studying rivals' },
      ],
    });
  } else if (/ci\/?cd|pipeline|deploy|devops|build/i.test(lower)) {
    questions.push({
      key: 'pipeline',
      question: 'A pipeline! Tell me — what kind of automation are we building?',
      cards: [
        { id: 'cicd', label: 'CI/CD', description: 'Build, test, deploy code' },
        { id: 'data', label: 'Data Pipeline', description: 'ETL, analytics, processing' },
        { id: 'content', label: 'Content Pipeline', description: 'Create, review, publish' },
        { id: 'approval', label: 'Approval Flow', description: 'Multi-stage review & sign-off' },
      ],
    });
  } else {
    questions.push({
      key: 'deliverable',
      question: 'And the final deliverable — what does success look like?',
      cards: [
        { id: 'documents', label: 'Documents', description: 'Written specs, plans, reports' },
        { id: 'prototype', label: 'Prototype', description: 'Working demo or mockup' },
        { id: 'presentation', label: 'Presentation', description: 'Deck or pitch' },
        { id: 'system', label: 'Running System', description: 'Deployed and operational' },
      ],
    });
  }

  return questions;
}

export function buildEnrichedPrompt(original: string, answers: Record<string, string>, questions: InterviewQuestion[]): string {
  const parts = [original];

  for (const q of questions) {
    const answerKey = `q${questions.indexOf(q)}`;
    const answerId = answers[answerKey];
    if (!answerId) continue;
    const card = q.cards.find(c => c.id === answerId);
    if (card) {
      if (q.key === 'scale' && answerId === 'large-team') parts.push('with team collaboration and review gates');
      if (q.key === 'scale' && answerId === 'enterprise') parts.push('with policy compliance and review gates');
      if (q.key === 'priority' && answerId === 'quality') parts.push('with quality review and testing');
      if (q.key === 'priority' && answerId === 'compliance') parts.push('with legal review and policy compliance');
      if (q.key === 'priority' && answerId === 'collaboration') parts.push('with design review and notes');
      if (q.key === 'stage' && answerId === 'ideation') parts.push('with research notes and ideas');
      if (q.key === 'stage' && answerId === 'rescue') parts.push('with analysis report');
      if (q.key === 'launch') {
        if (answerId === 'b2b') parts.push('with marketing plan and pitch deck');
        if (answerId === 'b2c') parts.push('with marketing strategy and design brief');
        if (answerId === 'developer') parts.push('with technical spec and API documentation');
      }
      if (q.key === 'research') {
        if (answerId === 'market') parts.push('with market analysis and competitive landscape');
        if (answerId === 'user') parts.push('with user research notes and design brief');
        if (answerId === 'competitive') parts.push('with competitive analysis and benchmark report');
      }
      if (q.key === 'deliverable') {
        if (answerId === 'documents') parts.push('with document specs and PRD');
        if (answerId === 'presentation') parts.push('with pitch deck and slides');
        if (answerId === 'prototype') parts.push('with design brief and technical spec');
      }
    }
  }

  return parts.join(' ');
}
