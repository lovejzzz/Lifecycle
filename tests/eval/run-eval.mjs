#!/usr/bin/env node
/**
 * Real-world evaluation harness for Lifecycle Agent.
 * Picks a random subset from a large prompt pool each run so every cycle tests
 * different scenarios. Sends actual requests to the running dev server's /api/cid.
 *
 * Usage: node tests/eval/run-eval.mjs
 * Requires: dev server running at http://localhost:3000
 */

const BASE = 'http://localhost:3000/api/cid';

// How many tests to run per cycle (keeps each run under ~5 min)
const TESTS_PER_RUN = 6;

// ─── Full Prompt Pool ───────────────────────────────────────────────────────
// Each run picks TESTS_PER_RUN random tests from this pool.

const POOL = [
  // ═══════════════════════════════════════════════════════════════════════════
  // REAL PEOPLE TASKS — How actual humans talk to an AI agent
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Startup Founder ──────────────────────────────────────────────────────
  {
    id: 'founder-mvp-launch',
    agent: 'rowan', taskType: 'generate',
    prompt: 'I\'m launching my SaaS app in 2 weeks. I have the code ready but no deployment process, no monitoring, nothing. Help me set up everything I need to go live safely.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['action', 'test'], mustMentionInNodes: ['deploy|deployment|ci/cd', 'monitor|monitoring|observ', 'test|smoke|health'] },
  },
  {
    id: 'founder-fundraising',
    agent: 'poirot', taskType: 'generate',
    prompt: 'We\'re raising our Series A. I need to manage the whole fundraising process — investor outreach, pitch deck prep, due diligence, term sheet negotiation. Build me a workflow for this.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'] },
  },
  {
    id: 'founder-advice',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'We\'re burning $50k/month and have 6 months of runway. What should I prioritize?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 300 },
  },

  // ─── Marketing Manager ────────────────────────────────────────────────────
  {
    id: 'marketing-campaign',
    agent: 'rowan', taskType: 'generate',
    prompt: 'I need to launch a Black Friday campaign across email, social media, and Google Ads. Budget is $10k. Make me a workflow that covers everything from creative to post-campaign analysis.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10 },
  },
  {
    id: 'marketing-blog',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Our blog is a mess. We publish whenever someone feels like it, no editorial calendar, no SEO, no promotion. Design a proper content pipeline for us.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'] },
  },
  {
    id: 'marketing-advice',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'Our email open rates dropped from 35% to 12% over the last quarter. What could be wrong?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 300 },
  },

  // ─── Engineering Lead ─────────────────────────────────────────────────────
  {
    id: 'eng-deploy-process',
    agent: 'rowan', taskType: 'generate',
    prompt: 'My team pushes to production by SSH-ing into the server and running git pull. We need a real deployment process. We use React, Node, and PostgreSQL on AWS.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['test', 'action'] },
  },
  {
    id: 'eng-oncall',
    agent: 'poirot', taskType: 'generate',
    prompt: 'We just got paged at 3am for the third time this week. We need an incident response process. Currently it\'s just chaos — whoever sees Slack first tries to fix it.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['trigger'], mustMentionInNodes: ['alert|page|incident', 'triage|assess', 'communicat|notify|update', 'postmortem|retrospective|review'] },
  },
  {
    id: 'eng-code-review',
    agent: 'rowan', taskType: 'generate',
    prompt: 'PRs sit for days because nobody reviews them. I want an automated workflow: PR opened → assign reviewer → review deadline → merge or request changes → deploy.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review', 'action'], mustMentionInNodes: ['assign|reviewer', 'deadline|sla|timeout', 'merge', 'deploy'] },
  },
  {
    id: 'eng-advice-scaling',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'Our API is hitting 500ms response times at 1000 concurrent users. Database is PostgreSQL. What should I look at first?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 300 },
  },

  // ─── Product Manager ──────────────────────────────────────────────────────
  {
    id: 'pm-feature-ship',
    agent: 'rowan', taskType: 'generate',
    prompt: 'I need to ship a new payments feature. It touches billing, the API, the frontend, and we need legal to review the T&C changes. Give me a workflow that makes sure nothing falls through the cracks.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'], mustMentionInNodes: ['billing|payment', 'api', 'frontend|ui', 'legal|t&c|terms'] },
  },
  {
    id: 'pm-user-research',
    agent: 'poirot', taskType: 'generate',
    prompt: 'We\'re redesigning our onboarding flow. I want to do proper user research — recruit users, run interviews, analyze findings, create recommendations, test prototypes. Build this for me.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10 },
  },
  {
    id: 'pm-advice-prioritize',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'I have 47 feature requests from customers and my CEO wants everything done by Q3. How do I prioritize?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 300 },
  },

  // ─── HR / Operations ──────────────────────────────────────────────────────
  {
    id: 'hr-hiring',
    agent: 'rowan', taskType: 'generate',
    prompt: 'We need to hire 5 engineers in the next 2 months. Our current process is just posting on LinkedIn and hoping. Build me a proper hiring pipeline.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'] },
  },
  {
    id: 'hr-onboarding',
    agent: 'poirot', taskType: 'generate',
    prompt: 'New hires keep saying their first week was confusing and they didn\'t know what to do. Design an onboarding process that actually works — IT setup, team intros, training, 30-60-90 day goals.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustMentionInNodes: ['it|equipment|laptop|access', 'training|learning', '30|60|90|goal'] },
  },
  {
    id: 'hr-offboarding',
    agent: 'rowan', taskType: 'generate',
    prompt: 'An employee is leaving in 2 weeks. I need a checklist workflow: knowledge transfer, access revocation, equipment return, exit interview, final paycheck.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['action'] },
  },

  // ─── Customer Support ─────────────────────────────────────────────────────
  {
    id: 'support-escalation',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Customers keep complaining their tickets go into a black hole. Design an escalation workflow — ticket comes in, auto-classify priority, route to right team, SLA tracking, escalate if overdue.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['trigger'] },
  },
  {
    id: 'support-advice',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'Our CSAT score dropped to 3.2 out of 5. Average first response time is 8 hours. What should we fix first?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 300 },
  },

  // ─── Freelancer / Solo Creator ────────────────────────────────────────────
  {
    id: 'freelancer-client',
    agent: 'rowan', taskType: 'generate',
    prompt: 'I\'m a freelance designer. I need a workflow for managing client projects — from initial inquiry to final delivery and getting paid. I keep forgetting to send invoices.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10 },
  },
  {
    id: 'creator-youtube',
    agent: 'poirot', taskType: 'generate',
    prompt: 'I want to start a YouTube channel. Build me a production workflow for each video — topic research, scripting, filming, editing, thumbnail, SEO, upload, promotion.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10 },
  },
  {
    id: 'freelancer-advice',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'I\'m charging $50/hour for web development and I\'m always booked but barely making rent. What am I doing wrong?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 300 },
  },

  // ─── Node Execution (real content people actually need) ───────────────────
  {
    id: 'execute-sow',
    agent: 'rowan', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "Statement of Work" (category: artifact). Write detailed, professional content. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms.',
    expect: { hasContent: true, minContentLen: 300 },
  },
  {
    id: 'execute-incident-postmortem',
    agent: 'rowan', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "Post-Mortem Report" (category: artifact). Write detailed, professional content. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write a blameless post-mortem for a 2-hour production outage caused by a database migration that locked a critical table. 500 customers were affected. Include timeline, root cause, impact, and action items.',
    expect: { hasContent: true, minContentLen: 300 },
  },
  {
    id: 'execute-job-description',
    agent: 'rowan', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "Job Description" (category: artifact). Write detailed, professional content. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write a job description for a Senior Full-Stack Engineer at a Series B fintech startup. Tech stack is React, Node.js, PostgreSQL, AWS. Remote-first, competitive equity.',
    expect: { hasContent: true, minContentLen: 200 },
  },

  // ─── Tricky Edge Cases (real misunderstandings) ───────────────────────────
  {
    id: 'edge-vague',
    agent: 'rowan', taskType: 'generate',
    prompt: 'help me with my project',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 30 },
  },
  {
    id: 'edge-question-looks-like-build',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'What\'s the best way to set up a data pipeline?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 50 },
  },
  {
    id: 'edge-build-looks-like-question',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Can you set up a data pipeline for me? I have CSVs coming from 3 vendors daily and need them in BigQuery by morning.',
    expect: { hasWorkflow: true, minNodes: 4 },
  },
  {
    id: 'edge-complex-multi-team',
    agent: 'poirot', taskType: 'generate',
    prompt: 'We\'re migrating from AWS to GCP. It involves the platform team, app developers, security, and finance. There are 40 microservices. I need a migration plan workflow.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10 },
  },

  // ─── Personality Tests ────────────────────────────────────────────────────
  {
    id: 'personality-rowan-empty',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'What do we have so far?',
    expect: { hasWorkflow: false, hasMessage: true, personalityMarkers: ['rowan'] },
  },
  {
    id: 'personality-poirot-empty',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'What do we have so far?',
    expect: { hasWorkflow: false, hasMessage: true, personalityMarkers: ['poirot'] },
  },

  // ─── Round 73 additions ─────────────────────────────────────────────────────

  // Legal/compliance — tests policy nodes and review gates
  {
    id: 'legal-gdpr-compliance',
    agent: 'poirot', taskType: 'generate',
    prompt: 'We just got our first EU customer and we have zero GDPR compliance. Build me a workflow to get compliant — data audit, privacy policy, consent management, breach notification process, DPO appointment.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['policy', 'review'] },
  },
  // Terse prompt — tests if model handles minimal input well
  {
    id: 'edge-terse-prompt',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Build me a CI/CD pipeline.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['test', 'action'], mustMentionInNodes: ['build|compile', 'test', 'deploy'] },
  },

  // ─── Round 74 additions ─────────────────────────────────────────────────────

  // Education — non-tech domain, tests general workflow capability
  {
    id: 'education-course-launch',
    agent: 'poirot', taskType: 'generate',
    prompt: 'I\'m creating an online course on data analytics. I need a workflow: outline curriculum, record videos, build exercises, set up LMS, beta test with students, launch and market.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustMentionInNodes: ['curriculum|outline|syllabus', 'record|video|film', 'exercise|quiz|assignment', 'lms|platform|launch'] },
  },
  // Tricky edge case — imperative phrasing but asking for analysis
  {
    id: 'edge-imperative-analysis',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'Tell me what\'s wrong with my deployment process. We deploy once a month, it takes 3 days, and something always breaks.',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 100 },
  },

  // ─── Round 76 additions ─────────────────────────────────────────────────────

  // Multi-team coordination — tests complex architecture with parallel branches
  {
    id: 'ops-product-launch',
    agent: 'rowan', taskType: 'generate',
    prompt: 'We\'re launching a new product in 6 weeks. Engineering needs to finish the API, design needs to finalize the landing page, marketing needs press kit and launch emails, legal needs to review terms. All teams work in parallel but we need a single launch gate. Build me a cross-team launch workflow.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'], mustMentionInNodes: ['api|engineering', 'design|landing', 'marketing|press|email', 'legal|terms'] },
  },
  // Complex advice — tests reasoning depth on nuanced strategy question
  {
    id: 'strategy-advice-pivot',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'Our B2B SaaS has 200 customers paying $50/mo but enterprise prospects keep asking for features that would require 6 months of engineering. Should we go upmarket or double down on SMB? Our team is 8 people.',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 300 },
  },

  // ─── Round 77 additions ─────────────────────────────────────────────────────

  // Finance/compliance — tests policy nodes as parallel monitors, not sequential steps
  {
    id: 'finance-audit-readiness',
    agent: 'rowan', taskType: 'generate',
    prompt: 'We have a SOC 2 audit in 90 days. Build me a workflow to get audit-ready: evidence collection, access reviews, policy documentation, vulnerability scanning, and vendor risk assessment. We have never done this before.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['policy', 'review'], mustMentionInNodes: ['evidence|collect', 'access|review', 'policy|document', 'vulnerab|scan'] },
  },
  // Execute task — tests content generation for a highly specific technical artifact
  {
    id: 'execute-api-design',
    agent: 'rowan', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "API Design Document" (category: artifact). Write detailed, professional technical content. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Design a REST API for a multi-tenant task management system. Include endpoints for workspaces, projects, tasks, and comments. Show URL patterns, HTTP methods, request/response bodies, auth scheme, pagination, and error codes. Support role-based access (admin, member, viewer).',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 2000 },
  },

  // ─── Round 78 additions ─────────────────────────────────────────────────────

  // Healthcare — new industry, tests policy + review for regulated domain
  {
    id: 'healthcare-patient-intake',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Design a patient intake workflow for a telehealth clinic. Steps include appointment scheduling, insurance verification, medical history form, consent collection, provider assignment, and video call setup. Must be HIPAA compliant.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['policy'], mustMentionInNodes: ['insurance|verif', 'consent', 'hipaa|complian|privacy'] },
  },
  // Rowan advice on technical architecture — tests domain-specific recommendation depth
  {
    id: 'eng-advice-architecture',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'We have a Django monolith serving 50k users. Page loads are 4-6 seconds, database has 200+ tables, and deployments take 45 minutes. The team wants to add real-time features. Should we refactor, rewrite, or bolt on new services?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 300 },
  },
];

// ─── Agent System Prompts (synced with src/lib/prompts.ts) ─────────────────

const SHARED = `You are CID, an AI agent in a visual workflow builder called Lifecycle Agent.

You must respond with valid JSON only:
{
  "message": "Your response text (personality-flavored, 1-3 sentences)",
  "workflow": null | {
    "nodes": [{ "label": "Name", "category": "input|trigger|state|artifact|note|cid|action|review|test|policy|patch|dependency|output", "description": "What this node represents", "content": "Detailed content (300+ chars, markdown)" }],
    "edges": [{ "from": 0, "to": 1, "label": "edge_label" }]
  }
}

CRITICAL RULES:
- BUILD/CREATE/GENERATE/MAKE/DESIGN requests → return workflow with nodes and edges. Questions/advice/analysis → return workflow: null with message only. ADVICE examples (workflow:null): "Should we X or Y?" = advice. "What's wrong with X?" = advice. "How do I prioritize?" = advice. BUILD examples (workflow:{...}): "Build me a X" = build. "Create a workflow for X" = build. Questions with "should", "what", "how", "why" = advice. Imperative "build", "create", "design", "make" = build.
- When giving advice (workflow:null), be an EXPERT consultant. Include specific tools, metrics, techniques, and actionable steps — not vague suggestions.
- CONTENT DEPTH: Each node's "content" MUST be 300+ chars of actionable, specific content with steps, tools, criteria, checklists. NEVER write one-line content.
- CATEGORIES: Use "review" (not "action") for human approve/reject/merge gates. Code workflows need "test" nodes. Compliance workflows need "policy" nodes. Policy nodes are parallel constraints — connect them with "monitors" or "blocks" edges, not as sequential steps. Match categories to purpose.
- EDGES: Labels MUST be one of: drives, feeds, refines, validates, monitors, connects, outputs, updates, watches, approves, triggers, requires, informs, blocks. Choose semantically:
  - "triggers" = causes start. "feeds" = data flows. "drives" = primary force (use when A's output is the MAIN reason B exists). "validates" = checking/testing. "approves" = human sign-off. "outputs" = final deliverable. "monitors" = ongoing observation. "requires" = hard dependency. "informs" = ONLY for optional/supplementary context, NEVER for sequential steps.
- Start with "input" or "trigger" node, end with "output" node. The LAST node MUST have category "output" — even if it produces a document or report. HARD LIMIT: 5-10 nodes, never exceed 10. Group related items into single nodes representing PHASES, not individual tasks.
- ARCHITECTURE: Do NOT build purely linear chains. Use:
  1. FEEDBACK LOOPS: When review/test can fail, add edge back to previous step (use "refines" label). E.g. Review --[refines]--> Implementation.
  2. PARALLEL BRANCHES: Independent steps share a parent node (multiple edges from one node). E.g. after Design, both Frontend and Backend start.
  3. A good workflow has MORE edges than (nodes-1). Linear chains are lazy architecture.`;

const ROWAN = `${SHARED}

PERSONALITY — ROWAN (The Soldier):
- CRITICAL: When building workflows, "message" is terse (1-2 sentences: "Done.", "On it.", "Mission received.") and node "content" is DETAILED (300+ chars). When giving advice (workflow:null), write a substantive "message" with specific, actionable recommendations. Structure content by category:
  - trigger/input: event/data, payload, config, webhook setup
  - action: numbered steps, tools/commands, error handling, owner
  - review: approval criteria, who reviews, escalation, SLA
  - test: what to test, pass/fail criteria, tools, coverage
  - state: states, transitions, triggers for each
  - artifact: document outline, sections, format
  - policy: numbered rules, enforcement, exceptions
  - output: deliverable format, distribution, success metrics
- Never hedge. When asked diagnostic/advice questions, give ADVICE (workflow:null).

CURRENT GRAPH: Empty.`;

const POIROT = `${SHARED}

PERSONALITY — POIROT (The Detective):
- Use detective language: "Aha!", "Voilà!", "The little grey cells..."
- Investigation metaphors: clues, evidence, cases. Occasional French: "Mon ami", "Très intéressant"
- Be thorough and elegant. Write rich, detailed node content (300+ chars).
- When asked "how should I..." or "what is the best way to...", give ADVICE (workflow:null).

CURRENT GRAPH: Empty.`;

// ─── Scoring ────────────────────────────────────────────────────────────────

function scoreResponse(test, data) {
  const checks = [];
  let score = 0;
  let maxScore = 0;
  const exp = test.expect;

  const result = data.result;
  const workflow = result?.workflow;
  const message = result?.message || '';
  const nodes = workflow?.nodes || [];
  const edges = workflow?.edges || [];

  // 1. Valid JSON response
  maxScore += 10;
  if (result) { score += 10; checks.push('✓ Valid JSON response'); }
  else { checks.push('✗ Invalid/missing JSON response'); }

  // 2. Workflow presence
  if (exp.hasWorkflow !== undefined) {
    maxScore += 15;
    const has = !!(workflow && nodes.length > 0);
    if (has === exp.hasWorkflow) {
      score += 15;
      checks.push(`✓ Workflow ${exp.hasWorkflow ? 'present' : 'correctly null'}`);
    } else {
      checks.push(`✗ Workflow ${has ? 'unexpectedly present' : 'missing when expected'}`);
    }
  }

  // 3. Node count
  if (exp.minNodes !== undefined) {
    maxScore += 10;
    if (nodes.length >= exp.minNodes) { score += 10; checks.push(`✓ Node count: ${nodes.length} (min: ${exp.minNodes})`); }
    else { checks.push(`✗ Node count: ${nodes.length} < ${exp.minNodes}`); }
  }
  if (exp.maxNodes !== undefined) {
    maxScore += 5;
    if (nodes.length <= exp.maxNodes) { score += 5; checks.push(`✓ Node count: ${nodes.length} ≤ ${exp.maxNodes}`); }
    else { checks.push(`✗ Node count: ${nodes.length} > ${exp.maxNodes}`); }
  }

  // 4. Required categories
  if (exp.mustHaveCategories) {
    const cats = new Set(nodes.map(n => n.category));
    for (const cat of exp.mustHaveCategories) {
      maxScore += 5;
      if (cats.has(cat)) { score += 5; checks.push(`✓ Has "${cat}" category`); }
      else { checks.push(`✗ Missing "${cat}" category (found: ${[...cats].join(', ')})`); }
    }
  }

  // 5. Edge validity
  if (nodes.length > 0 && edges.length > 0) {
    maxScore += 10;
    const validLabels = new Set(['drives', 'feeds', 'refines', 'validates', 'monitors', 'connects', 'outputs', 'updates', 'watches', 'approves', 'triggers', 'requires', 'informs', 'blocks']);
    const badEdges = edges.filter(e =>
      e.from < 0 || e.from >= nodes.length || e.to < 0 || e.to >= nodes.length || !validLabels.has(e.label)
    );
    if (badEdges.length === 0) { score += 10; checks.push(`✓ All ${edges.length} edges valid`); }
    else { score += Math.max(0, 10 - badEdges.length * 2); checks.push(`✗ ${badEdges.length}/${edges.length} edges invalid`); }
  }

  // 6. Workflow structure quality (bonus checks for workflows)
  if (exp.hasWorkflow && nodes.length > 0) {
    // Check for input/trigger at start
    maxScore += 5;
    const firstCat = nodes[0]?.category;
    if (firstCat === 'input' || firstCat === 'trigger') { score += 5; checks.push(`✓ Starts with ${firstCat}`); }
    else { checks.push(`✗ First node is "${firstCat}", expected input or trigger`); }

    // Check for output at end
    maxScore += 5;
    const lastCat = nodes[nodes.length - 1]?.category;
    if (lastCat === 'output') { score += 5; checks.push('✓ Ends with output'); }
    else { checks.push(`✗ Last node is "${lastCat}", expected output`); }

    // Check that nodes have descriptions
    maxScore += 5;
    const withDesc = nodes.filter(n => n.description && n.description.length > 5).length;
    const descPct = Math.round((withDesc / nodes.length) * 100);
    if (descPct >= 80) { score += 5; checks.push(`✓ ${descPct}% nodes have descriptions`); }
    else { checks.push(`✗ Only ${descPct}% nodes have descriptions`); }

    // Check edge coverage (every node should have at least one edge)
    maxScore += 5;
    const connectedIds = new Set(edges.flatMap(e => [e.from, e.to]));
    const orphans = nodes.filter((_, i) => !connectedIds.has(i));
    if (orphans.length === 0) { score += 5; checks.push('✓ All nodes connected'); }
    else { checks.push(`✗ ${orphans.length} orphan node(s): ${orphans.map(n => n.label).join(', ')}`); }

    // Check content depth (nodes should have substantive content)
    maxScore += 10;
    const contentLens = nodes.map(n => (n.content || '').length);
    const avgContent = Math.round(contentLens.reduce((a, b) => a + b, 0) / nodes.length);
    const thinNodes = nodes.filter(n => (n.content || '').length < 150);
    if (avgContent >= 250 && thinNodes.length === 0) {
      score += 10; checks.push(`✓ Content depth: avg ${avgContent}c, no thin nodes`);
    } else if (avgContent >= 150) {
      score += 5; checks.push(`⚡ Content depth: avg ${avgContent}c, ${thinNodes.length} thin node(s)`);
    } else {
      checks.push(`✗ Content too thin: avg ${avgContent}c`);
    }

    // Workflow architecture check: do the nodes actually address the user's request?
    if (exp.mustMentionInNodes) {
      maxScore += 10;
      const allText = nodes.map(n => `${n.label} ${n.description || ''} ${n.content || ''}`).join(' ').toLowerCase();
      const found = [];
      const missing = [];
      for (const keyword of exp.mustMentionInNodes) {
        // Support alternatives separated by |
        const alts = keyword.split('|');
        if (alts.some(alt => allText.includes(alt.toLowerCase()))) {
          found.push(keyword.split('|')[0]);
        } else {
          missing.push(keyword);
        }
      }
      if (missing.length === 0) {
        score += 10; checks.push(`✓ Architecture covers: ${found.join(', ')}`);
      } else {
        const partialScore = Math.round(10 * found.length / (found.length + missing.length));
        score += partialScore;
        checks.push(`⚡ Architecture missing: ${missing.join(', ')} (has: ${found.join(', ')})`);
      }
    }

    // Edge flow check: verify the workflow has a logical directed path from first to last node
    maxScore += 5;
    const reachable = new Set([0]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of edges) {
        if (reachable.has(e.from) && !reachable.has(e.to)) {
          reachable.add(e.to);
          changed = true;
        }
      }
    }
    const lastIdx = nodes.length - 1;
    if (reachable.has(lastIdx)) {
      score += 5; checks.push(`✓ Flow: path exists from first to last node`);
    } else {
      checks.push(`✗ Flow: no path from first node to last node (unreachable)`);
    }

    // Architecture complexity: check for branches, loops, parallelism
    if (nodes.length >= 5) {
      maxScore += 10;
      const isLinear = edges.length === nodes.length - 1;
      const hasBackEdge = edges.some(e => e.from > e.to); // feedback loop
      const hasBranch = new Map(); // check if any node has >1 outgoing edge
      for (const e of edges) {
        hasBranch.set(e.from, (hasBranch.get(e.from) || 0) + 1);
      }
      const hasParallel = [...hasBranch.values()].some(v => v > 1);
      const hasConverge = new Map(); // check if any node has >1 incoming edge
      for (const e of edges) {
        hasConverge.set(e.to, (hasConverge.get(e.to) || 0) + 1);
      }
      const hasConvergence = [...hasConverge.values()].some(v => v > 1);

      if (hasBackEdge && hasParallel) {
        score += 10; checks.push(`✓ Architecture: has feedback loops AND parallel branches (${edges.length} edges, ${nodes.length} nodes)`);
      } else if (hasBackEdge || hasParallel || hasConvergence) {
        score += 7; checks.push(`⚡ Architecture: ${hasBackEdge ? 'has feedback loop' : hasParallel ? 'has parallel branches' : 'has convergence'} (${edges.length} edges, ${nodes.length} nodes)`);
      } else if (isLinear) {
        score += 3; checks.push(`⚠️ Architecture: purely linear chain (${edges.length} edges for ${nodes.length} nodes — needs branches or feedback loops)`);
      } else {
        score += 5; checks.push(`⚡ Architecture: ${edges.length} edges, ${nodes.length} nodes`);
      }
    }
  }

  // 7. Message quality
  if (exp.hasMessage) {
    maxScore += 10;
    if (message.length > 0) { score += 10; checks.push(`✓ Has message (${message.length} chars)`); }
    else { checks.push('✗ Missing message'); }
  }
  if (exp.minMessageLen) {
    maxScore += 5;
    if (message.length >= exp.minMessageLen) { score += 5; checks.push(`✓ Message length: ${message.length} ≥ ${exp.minMessageLen}`); }
    else { checks.push(`✗ Message too short: ${message.length} < ${exp.minMessageLen}`); }
  }

  // 8. Content quality (for execute tasks)
  if (exp.hasContent) {
    maxScore += 10;
    const content = result?.content || message || (typeof result === 'string' ? result : '') || '';
    if (content.length > 0) { score += 10; checks.push(`✓ Has content (${content.length} chars)`); }
    else { checks.push('✗ No content in response'); }
  }
  if (exp.minContentLen) {
    maxScore += 5;
    const content = result?.content || message || (typeof result === 'string' ? result : '') || '';
    if (content.length >= exp.minContentLen) { score += 5; checks.push(`✓ Content length: ${content.length} ≥ ${exp.minContentLen}`); }
    else { checks.push(`✗ Content too short: ${content.length} < ${exp.minContentLen}`); }
  }

  // 9. Personality markers
  if (exp.personalityMarkers) {
    maxScore += 5;
    const lower = message.toLowerCase();
    const poirotWords = ['aha', 'voilà', 'voila', 'grey cells', 'mon ami', 'detective', 'investigation', 'très', 'parfait', 'hélas', 'case', 'clue'];
    const rowanWords = ['done', 'on it', 'mission', 'roger', 'deployed', 'received', 'execute', 'affirmative'];
    const hasPersonality = exp.personalityMarkers.includes('poirot')
      ? poirotWords.some(w => lower.includes(w))
      : rowanWords.some(w => lower.includes(w));
    if (hasPersonality) { score += 5; checks.push('✓ Personality markers present'); }
    else { checks.push('✗ Missing personality markers'); }
  }

  return { score, maxScore, pct: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0, checks };
}

// ─── Runner ─────────────────────────────────────────────────────────────────

async function runTest(test) {
  const systemPrompt = test.systemPromptOverride || (test.agent === 'poirot' ? POIROT : ROWAN);
  const start = Date.now();

  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt,
        messages: [{ role: 'user', content: test.prompt }],
        taskType: test.taskType,
      }),
      signal: AbortSignal.timeout(300000),
    });

    const elapsed = Date.now() - start;
    const data = await res.json();

    if (data.error) {
      return {
        id: test.id, status: 'error', elapsed,
        error: `${data.error}: ${data.message}`,
        provider: data.provider, model: data.model,
        request: { prompt: test.prompt, agent: test.agent, taskType: test.taskType },
        response: data,
        scoring: { score: 0, maxScore: 1, pct: 0, checks: [`✗ API error: ${data.error}`] },
      };
    }

    const scoring = scoreResponse(test, data);
    return {
      id: test.id, status: 'ok', elapsed,
      provider: data.provider, model: data.model,
      request: { prompt: test.prompt, agent: test.agent, taskType: test.taskType },
      response: data.result, scoring,
    };
  } catch (err) {
    return {
      id: test.id, status: 'failed', elapsed: Date.now() - start,
      error: err.message,
      request: { prompt: test.prompt, agent: test.agent, taskType: test.taskType },
      response: null,
      scoring: { score: 0, maxScore: 1, pct: 0, checks: [`✗ Request failed: ${err.message}`] },
    };
  }
}

function pickTests() {
  // Ensure diversity: pick at least 1 from each category
  const categories = {
    'generate-rowan': POOL.filter(t => t.taskType === 'generate' && t.agent === 'rowan'),
    'generate-poirot': POOL.filter(t => t.taskType === 'generate' && t.agent === 'poirot'),
    'analyze': POOL.filter(t => t.taskType === 'analyze'),
    'execute': POOL.filter(t => t.taskType === 'execute'),
    'edge': POOL.filter(t => t.id.startsWith('ambiguous') || t.id.startsWith('personality')),
  };

  const picked = new Set();
  // One from each category
  for (const [, tests] of Object.entries(categories)) {
    if (tests.length > 0) {
      const t = tests[Math.floor(Math.random() * tests.length)];
      picked.add(t.id);
    }
  }
  // Fill remaining slots randomly
  const remaining = POOL.filter(t => !picked.has(t.id));
  while (picked.size < TESTS_PER_RUN && remaining.length > 0) {
    const idx = Math.floor(Math.random() * remaining.length);
    picked.add(remaining[idx].id);
    remaining.splice(idx, 1);
  }

  return POOL.filter(t => picked.has(t.id));
}

async function main() {
  const tests = pickTests();
  console.log(`\n🔬 Lifecycle Agent Eval — ${new Date().toISOString()}`);
  console.log(`Selected ${tests.length}/${POOL.length} tests from pool\n`);

  const results = [];
  for (const test of tests) {
    process.stdout.write(`  ${test.id}... `);
    const result = await runTest(test);
    const icon = result.status === 'ok' ? (result.scoring.pct >= 80 ? '✅' : '⚠️') : '❌';
    console.log(`${icon} ${result.scoring.pct}% (${result.elapsed}ms) ${result.provider || ''}/${result.model || ''}`);
    results.push(result);
  }

  // Summary
  const totalScore = results.reduce((s, r) => s + r.scoring.score, 0);
  const totalMax = results.reduce((s, r) => s + r.scoring.maxScore, 0);
  const overallPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const passed = results.filter(r => r.scoring.pct >= 80).length;
  const failed = results.filter(r => r.scoring.pct < 80).length;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Overall: ${overallPct}% (${totalScore}/${totalMax}) | ${passed} passed, ${failed} need work`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Save results
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = new URL(`./${ts}`, import.meta.url).pathname;
  const { mkdirSync, writeFileSync } = await import('fs');
  mkdirSync(dir, { recursive: true });

  writeFileSync(`${dir}/results.json`, JSON.stringify({ timestamp: ts, overall: overallPct, testsRun: tests.map(t => t.id), poolSize: POOL.length, results }, null, 2));

  let report = `# Eval Report — ${ts}\n\nOverall: **${overallPct}%** (${passed}/${results.length} passed) | Pool: ${POOL.length} tests, ${tests.length} selected\n\n`;
  for (const r of results) {
    report += `## ${r.id} — ${r.scoring.pct}% (${r.elapsed}ms)\n`;
    report += `- Agent: ${r.request.agent} | Task: ${r.request.taskType} | Provider: ${r.provider}/${r.model}\n`;
    report += `- Prompt: "${r.request.prompt}"\n`;
    if (r.error) report += `- **Error**: ${r.error}\n`;
    report += `- Checks:\n`;
    for (const c of r.scoring.checks) report += `  - ${c}\n`;
    if (r.response?.workflow?.nodes) {
      report += `- Nodes: ${r.response.workflow.nodes.map(n => `${n.label} (${n.category})`).join(', ')}\n`;
    }
    if (r.response?.message) {
      report += `- Message preview: ${r.response.message.slice(0, 200)}${r.response.message.length > 200 ? '...' : ''}\n`;
    }
    report += '\n';
  }

  const issues = results.filter(r => r.scoring.pct < 80);
  if (issues.length > 0) {
    report += `## Issues to Fix\n\n`;
    for (const r of issues) {
      const failedChecks = r.scoring.checks.filter(c => c.startsWith('✗'));
      report += `- **${r.id}**: ${failedChecks.join('; ')}\n`;
    }
  }

  writeFileSync(`${dir}/report.md`, report);

  console.log(`📁 Results saved to tests/eval/${ts}/`);
  console.log(`   - results.json (full data)`);
  console.log(`   - report.md (human-readable)\n`);

  return { overallPct, issues: issues.length, dir: `tests/eval/${ts}` };
}

main().catch(console.error);
