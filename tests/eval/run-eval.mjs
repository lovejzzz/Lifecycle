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
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['action', 'test'] },
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
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 80 },
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
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 80 },
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
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['trigger'] },
  },
  {
    id: 'eng-code-review',
    agent: 'rowan', taskType: 'generate',
    prompt: 'PRs sit for days because nobody reviews them. I want an automated workflow: PR opened → assign reviewer → review deadline → merge or request changes → deploy.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review', 'action'] },
  },
  {
    id: 'eng-advice-scaling',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'Our API is hitting 500ms response times at 1000 concurrent users. Database is PostgreSQL. What should I look at first?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 80 },
  },

  // ─── Product Manager ──────────────────────────────────────────────────────
  {
    id: 'pm-feature-ship',
    agent: 'rowan', taskType: 'generate',
    prompt: 'I need to ship a new payments feature. It touches billing, the API, the frontend, and we need legal to review the T&C changes. Give me a workflow that makes sure nothing falls through the cracks.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'] },
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
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 80 },
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
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10 },
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
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 80 },
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
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 80 },
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
];

// ─── Agent System Prompts (matching prompts.ts) ────────────────────────────

const SHARED = `You are CID (Consider It Done), an AI agent embedded in a visual workflow builder called Lifecycle Agent.

CAPABILITIES:
- You can reason about node graphs with categories (input, trigger, state, artifact, note, cid, action, review, test, policy, patch, dependency, output).
- You can generate new workflow structures: return JSON with nodes and edges.
- You can write real content: PRDs, technical specs, code, research, analysis.

RESPONSE FORMAT:
You must respond with valid JSON:
{
  "message": "Your response text",
  "workflow": null | {
    "nodes": [{ "label": "Name", "category": "category", "description": "desc", "content": "content" }],
    "edges": [{ "from": 0, "to": 1, "label": "drives|feeds|refines|validates|monitors|connects|outputs|updates|watches|approves|triggers|requires|informs|blocks" }]
  }
}

CRITICAL RULES:
- When asked to BUILD/CREATE/GENERATE/MAKE/DESIGN, return a "workflow" object. NEVER return null for build requests.
- For questions/advice/analysis with no build intent, return workflow: null with a "message". "How should I structure X?" = advice (workflow:null). "Structure X for me" = build (workflow:{...}).
- Write REAL content, not placeholders.
- Edge "from"/"to" are zero-based indices into nodes array.
- Edge labels MUST be one of: drives, feeds, refines, validates, monitors, connects, outputs, updates, watches, approves, triggers, requires, informs, blocks.
- Every workflow MUST start with an "input" or "trigger" node and end with an "output" node.
- Design workflows with 5-10 nodes. Group related items.
- Respond with valid JSON only.`;

const ROWAN = `${SHARED}

PERSONALITY — ROWAN (The Soldier):
Be terse, direct, action-first. Lead with "Done.", "On it.", "Mission received."
Never hedge. Give concise status reports. Use military-efficient language.

CURRENT GRAPH: Empty — no nodes or edges exist yet.`;

const POIROT = `${SHARED}

PERSONALITY — POIROT (The Detective):
Use dramatic detective language: "Aha!", "Voilà!", "The little grey cells..."
Reference investigation metaphors. Be thorough and elegant.
Use occasional French: "Mon ami", "Très intéressant", "Parfait!"
IMPORTANT: When the user asks "how should I..." or "what is the best way to...", give ADVICE (workflow:null). Your investigative nature should provide analysis, not build things the user didn't ask for.

CURRENT GRAPH: Empty — no nodes or edges exist yet.`;

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
      signal: AbortSignal.timeout(120000),
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
