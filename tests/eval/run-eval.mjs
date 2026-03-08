#!/usr/bin/env node
/**
 * Real-world evaluation harness for Lifecycle Agent.
 * Sends actual prompts to the running dev server's /api/cid,
 * scores the responses, and saves everything to timestamped output files.
 *
 * Usage: node tests/eval/run-eval.mjs
 * Requires: dev server running at http://localhost:3000
 */

const BASE = 'http://localhost:3000/api/cid';

// ─── Test Cases ─────────────────────────────────────────────────────────────

const TESTS = [
  // === Workflow Generation (Rowan) ===
  {
    id: 'rowan-build-cicd',
    agent: 'rowan',
    taskType: 'generate',
    prompt: 'Build a CI/CD pipeline for a Next.js app with GitHub Actions, testing, staging deploy, and production release',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 12, mustHaveCategories: ['input', 'test', 'action', 'output'] },
  },
  {
    id: 'rowan-build-content',
    agent: 'rowan',
    taskType: 'generate',
    prompt: 'Create a content publishing workflow: draft article, AI review, editor approval, SEO optimization, publish to CMS, social media distribution',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['input', 'review', 'output'] },
  },
  // === Workflow Generation (Poirot) ===
  {
    id: 'poirot-build-incident',
    agent: 'poirot',
    taskType: 'generate',
    prompt: 'Design an incident response workflow: alert detection, triage, investigation, mitigation, post-mortem, and preventive action',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['trigger', 'state'] },
  },
  // === Chat / Analysis (should NOT generate workflow) ===
  {
    id: 'rowan-chat-advice',
    agent: 'rowan',
    taskType: 'analyze',
    prompt: 'What makes a good deployment pipeline?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 50 },
  },
  {
    id: 'poirot-chat-advice',
    agent: 'poirot',
    taskType: 'analyze',
    prompt: 'How should I structure a code review process?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 50 },
  },
  // === Node Execution ===
  {
    id: 'execute-artifact',
    agent: 'rowan',
    taskType: 'execute',
    // Use the actual executeNode system prompt style
    systemPromptOverride: 'You are a content generator for a workflow node called "Auth System Spec" (category: artifact). Write detailed, professional content. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write a technical specification for a user authentication system with OAuth2, JWT tokens, and role-based access control',
    expect: { hasContent: true, minContentLen: 200 },
  },
  // === Edge Cases ===
  {
    id: 'rowan-ambiguous',
    agent: 'rowan',
    taskType: 'generate',
    prompt: 'I need to onboard new employees',
    expect: { hasWorkflow: true, minNodes: 3 },
  },
  {
    id: 'poirot-personality',
    agent: 'poirot',
    taskType: 'analyze',
    prompt: 'Tell me about the current state of this workflow',
    expect: { hasWorkflow: false, hasMessage: true, personalityMarkers: ['poirot'] },
  },
];

// ─── Agent System Prompts (simplified versions matching prompts.ts) ────────

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
- For questions/advice/analysis with no build intent, return workflow: null with a "message".
- Write REAL content, not placeholders.
- Edge "from"/"to" are zero-based indices into nodes array.
- Edge labels MUST be one of: drives, feeds, refines, validates, monitors, connects, outputs, updates, watches, approves, triggers, requires, informs, blocks.
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

CURRENT GRAPH: Empty — no nodes or edges exist yet.`;

// ─── Scoring ────────────────────────────────────────────────────────────────

function scoreResponse(test, data) {
  const checks = [];
  let score = 0;
  let maxScore = 0;
  const exp = test.expect;

  // Parse result
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
    if (nodes.length >= exp.minNodes) {
      score += 10;
      checks.push(`✓ Node count: ${nodes.length} (min: ${exp.minNodes})`);
    } else {
      checks.push(`✗ Node count: ${nodes.length} < ${exp.minNodes}`);
    }
  }
  if (exp.maxNodes !== undefined) {
    maxScore += 5;
    if (nodes.length <= exp.maxNodes) {
      score += 5;
      checks.push(`✓ Node count: ${nodes.length} ≤ ${exp.maxNodes}`);
    } else {
      checks.push(`✗ Node count: ${nodes.length} > ${exp.maxNodes}`);
    }
  }

  // 4. Required categories
  if (exp.mustHaveCategories) {
    const cats = new Set(nodes.map(n => n.category));
    for (const cat of exp.mustHaveCategories) {
      maxScore += 5;
      if (cats.has(cat)) {
        score += 5;
        checks.push(`✓ Has "${cat}" category`);
      } else {
        checks.push(`✗ Missing "${cat}" category (found: ${[...cats].join(', ')})`);
      }
    }
  }

  // 5. Edge validity (from/to within range, valid labels)
  if (nodes.length > 0 && edges.length > 0) {
    maxScore += 10;
    const validLabels = new Set(['drives', 'feeds', 'refines', 'validates', 'monitors', 'connects', 'outputs', 'updates', 'watches', 'approves', 'triggers', 'requires', 'informs', 'blocks']);
    const badEdges = edges.filter(e =>
      e.from < 0 || e.from >= nodes.length ||
      e.to < 0 || e.to >= nodes.length ||
      !validLabels.has(e.label)
    );
    if (badEdges.length === 0) {
      score += 10;
      checks.push(`✓ All ${edges.length} edges valid`);
    } else {
      score += Math.max(0, 10 - badEdges.length * 2);
      checks.push(`✗ ${badEdges.length}/${edges.length} edges invalid`);
    }
  }

  // 6. Message quality
  if (exp.hasMessage) {
    maxScore += 10;
    if (message.length > 0) {
      score += 10;
      checks.push(`✓ Has message (${message.length} chars)`);
    } else {
      checks.push('✗ Missing message');
    }
  }
  if (exp.minMessageLen) {
    maxScore += 5;
    if (message.length >= exp.minMessageLen) {
      score += 5;
      checks.push(`✓ Message length: ${message.length} ≥ ${exp.minMessageLen}`);
    } else {
      checks.push(`✗ Message too short: ${message.length} < ${exp.minMessageLen}`);
    }
  }

  // 7. Content quality (for execute tasks — may return raw text or JSON)
  if (exp.hasContent) {
    maxScore += 10;
    const content = result?.content || message || (typeof result === 'string' ? result : '') || '';
    if (content.length > 0) {
      score += 10;
      checks.push(`✓ Has content (${content.length} chars)`);
    } else {
      checks.push('✗ No content in response');
    }
  }
  if (exp.minContentLen) {
    maxScore += 5;
    const content = result?.content || message || (typeof result === 'string' ? result : '') || '';
    if (content.length >= exp.minContentLen) {
      score += 5;
      checks.push(`✓ Content length: ${content.length} ≥ ${exp.minContentLen}`);
    } else {
      checks.push(`✗ Content too short: ${content.length} < ${exp.minContentLen}`);
    }
  }

  // 8. Personality markers
  if (exp.personalityMarkers) {
    maxScore += 5;
    const lower = message.toLowerCase();
    const poirotWords = ['aha', 'voilà', 'voila', 'grey cells', 'mon ami', 'detective', 'investigation', 'très', 'parfait', 'hélas'];
    const hasPersonality = exp.personalityMarkers.includes('poirot')
      ? poirotWords.some(w => lower.includes(w))
      : /^(done|on it|mission|roger|deployed)/i.test(message);
    if (hasPersonality) {
      score += 5;
      checks.push('✓ Personality markers present');
    } else {
      checks.push('✗ Missing personality markers');
    }
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
        id: test.id,
        status: 'error',
        elapsed,
        error: `${data.error}: ${data.message}`,
        provider: data.provider,
        model: data.model,
        request: { prompt: test.prompt, agent: test.agent, taskType: test.taskType },
        response: data,
        scoring: { score: 0, maxScore: 1, pct: 0, checks: [`✗ API error: ${data.error}`] },
      };
    }

    const scoring = scoreResponse(test, data);
    return {
      id: test.id,
      status: 'ok',
      elapsed,
      provider: data.provider,
      model: data.model,
      request: { prompt: test.prompt, agent: test.agent, taskType: test.taskType },
      response: data.result,
      scoring,
    };
  } catch (err) {
    return {
      id: test.id,
      status: 'failed',
      elapsed: Date.now() - start,
      error: err.message,
      request: { prompt: test.prompt, agent: test.agent, taskType: test.taskType },
      response: null,
      scoring: { score: 0, maxScore: 1, pct: 0, checks: [`✗ Request failed: ${err.message}`] },
    };
  }
}

async function main() {
  console.log(`\n🔬 Lifecycle Agent Eval — ${new Date().toISOString()}`);
  console.log(`Running ${TESTS.length} tests against ${BASE}\n`);

  const results = [];
  for (const test of TESTS) {
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

  // Full results JSON
  writeFileSync(`${dir}/results.json`, JSON.stringify({ timestamp: ts, overall: overallPct, results }, null, 2));

  // Human-readable report
  let report = `# Eval Report — ${ts}\n\nOverall: **${overallPct}%** (${passed}/${results.length} passed)\n\n`;
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

  // Issues found
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
