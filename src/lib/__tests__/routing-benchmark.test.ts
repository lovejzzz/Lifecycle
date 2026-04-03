/**
 * CID Routing Benchmark — scored test suite for command classification accuracy.
 *
 * Modeled on the autoresearch pattern: one metric (accuracy %), keep/discard discipline.
 * Each prompt represents something a real user (professor, PM, creator) would type.
 * The benchmark score = correct / total. Only commit routing changes that improve this score.
 *
 * To run: npx vitest run src/lib/__tests__/routing-benchmark.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  classifyRoute,
  classifyRouteWithConfidence,
  routePromptCompat,
  type CommandRoute,
  type ConfidenceLevel as _ConfidenceLevel,
} from '@/lib/routing';

interface BenchmarkCase {
  prompt: string;
  expected: CommandRoute;
  context?: string; // who would say this
  hasWorkflow?: boolean;
}

// ─── The Benchmark: 163 real user prompts ────────────────────────────────────

const BENCHMARK: BenchmarkCase[] = [
  // ── Workflow generation (professor) ──
  { prompt: 'build a course design workflow', expected: 'generate', context: 'professor' },
  { prompt: 'create a lesson plan pipeline', expected: 'generate', context: 'professor' },
  { prompt: 'make me a rubric for the midterm', expected: 'generate', context: 'professor' },
  { prompt: 'design an assignment review process', expected: 'generate', context: 'professor' },
  { prompt: 'generate a content pipeline with SEO', expected: 'generate', context: 'creator' },
  { prompt: 'start a new incident response workflow', expected: 'generate', context: 'PM' },
  { prompt: 'set up a code review pipeline', expected: 'generate', context: 'PM' },

  // ── Extend existing workflow ──
  {
    prompt: 'add a quiz bank after the lesson plan',
    expected: 'extend',
    context: 'professor',
    hasWorkflow: true,
  },
  {
    prompt: 'extend with a final exam node',
    expected: 'extend',
    context: 'professor',
    hasWorkflow: true,
  },
  {
    prompt: 'also include a grading rubric',
    expected: 'extend',
    context: 'professor',
    hasWorkflow: true,
  },
  {
    prompt: 'insert a review gate before output',
    expected: 'extend',
    context: 'PM',
    hasWorkflow: true,
  },

  // ── Propagate / refresh stale ──
  { prompt: 'propagate', expected: 'propagate' },
  { prompt: 'sync', expected: 'propagate' },
  { prompt: 'refresh stale', expected: 'propagate' },
  { prompt: 'update stale nodes', expected: 'propagate', context: 'professor' },
  { prompt: 'update all stale', expected: 'propagate', context: 'PM' },
  { prompt: 'run the stale nodes', expected: 'propagate', context: 'professor' },
  { prompt: 'regenerate stale', expected: 'propagate' },

  // ── Refresh / update specific node ──
  { prompt: 'refresh the quiz bank', expected: 'refresh-node', context: 'professor' },
  { prompt: 'update the rubric', expected: 'refresh-node', context: 'professor' },
  { prompt: 'regenerate study guide', expected: 'refresh-node', context: 'professor' },

  // ── Show stale ──
  { prompt: "show me what's stale", expected: 'show-stale', context: 'professor' },
  { prompt: 'show stale nodes', expected: 'show-stale' },
  { prompt: 'find stale', expected: 'show-stale' },
  { prompt: 'list stale', expected: 'show-stale' },

  // ── Status / health ──
  { prompt: 'status', expected: 'status' },
  { prompt: 'health', expected: 'status' },
  { prompt: 'report', expected: 'status' },
  { prompt: 'dashboard', expected: 'status' },

  // ── Solve / fix ──
  { prompt: 'solve', expected: 'solve' },
  { prompt: 'fix structural problems', expected: 'solve' },
  { prompt: 'diagnose the workflow', expected: 'solve' },

  // ── Connect / disconnect ──
  { prompt: 'connect Rubric to Review Gate', expected: 'connect' },
  { prompt: 'link study guide to final exam', expected: 'connect' },
  { prompt: 'disconnect Quiz Bank from Review', expected: 'disconnect' },

  // ── Node operations ──
  { prompt: 'delete the old rubric', expected: 'delete' },
  { prompt: 'remove Quiz Bank', expected: 'delete' },
  { prompt: 'rename Lesson Plan to Weekly Plan', expected: 'rename' },
  { prompt: 'add artifact called Midterm Rubric', expected: 'add-node' },
  { prompt: 'lock Syllabus', expected: 'set-status' },
  { prompt: 'unlock Rubric', expected: 'set-status' },
  { prompt: 'set Quiz Bank to stale', expected: 'set-status' },
  { prompt: 'focus on Lesson Plan', expected: 'focus' },
  { prompt: 'duplicate Rubric', expected: 'duplicate' },

  // ── Execution ──
  { prompt: 'run workflow', expected: 'run-workflow' },
  { prompt: 'execute all', expected: 'run-workflow' },
  { prompt: 'run Lesson Plan', expected: 'run-node' },
  { prompt: 'execute Quiz Bank', expected: 'run-node' },
  { prompt: 'retry failed', expected: 'retry-failed' },

  // ── Reports & analysis ──
  { prompt: 'explain', expected: 'explain' },
  { prompt: 'trace the workflow', expected: 'explain' },
  { prompt: 'summarize', expected: 'summarize' },
  { prompt: 'validate', expected: 'validate' },
  { prompt: 'critical path', expected: 'critical-path' },
  { prompt: 'bottlenecks', expected: 'bottlenecks' },
  { prompt: 'deps Rubric', expected: 'deps' },
  { prompt: 'why Rubric', expected: 'why' },
  { prompt: 'what if remove Lesson Plan', expected: 'what-if' },
  { prompt: 'preflight', expected: 'preflight' },
  { prompt: 'progress', expected: 'progress' },
  { prompt: 'count', expected: 'count' },
  { prompt: 'orphans', expected: 'orphans' },
  { prompt: 'health detail', expected: 'health-detail' },
  { prompt: 'suggest', expected: 'suggest' },

  // ── Misc commands ──
  { prompt: 'undo', expected: 'undo' },
  { prompt: 'redo', expected: 'redo' },
  { prompt: 'help', expected: 'help' },
  { prompt: 'list all', expected: 'list' },
  { prompt: 'list artifacts', expected: 'list' },
  { prompt: 'merge Rubric and Grading Guide', expected: 'merge' },
  { prompt: 'group by category', expected: 'group' },
  { prompt: 'compress', expected: 'compress' },
  { prompt: 'plan', expected: 'plan' },
  { prompt: 'clear results', expected: 'clear-results' },

  // ── Education lifecycle actions ──
  { prompt: 'regenerate Quiz Bank', expected: 'refresh-node', context: 'professor' },
  { prompt: 'what if I remove Assignments', expected: 'what-if', context: 'professor' },
  { prompt: 'connect Rubrics to Study Guide', expected: 'connect', context: 'professor' },
  { prompt: 'batch approve where category=artifact', expected: 'batch-where', context: 'PM' },
  {
    prompt: 'teach: always generate rubrics with 4 performance levels',
    expected: 'teach',
    context: 'professor',
  },
  { prompt: 'save template my-course-v2', expected: 'save-template', context: 'professor' },
  { prompt: 'deps Rubrics', expected: 'deps', context: 'professor' },
  { prompt: 'swap Assignments and Quiz Bank', expected: 'swap', context: 'professor' },
  {
    prompt: 'describe Syllabus as: The master course outline and schedule',
    expected: 'describe',
    context: 'professor',
  },
  { prompt: 'isolate Learning Objectives', expected: 'isolate', context: 'professor' },
  { prompt: 'set Rubrics to locked', expected: 'set-status', context: 'professor' },
  { prompt: 'clone workflow', expected: 'clone-workflow', context: 'PM' },
  {
    prompt: 'content Lesson Plans: Week 1 covers intro to algorithms',
    expected: 'content',
    context: 'professor',
  },
  { prompt: 'disconnect Rubrics from Quiz Bank', expected: 'disconnect', context: 'professor' },
  { prompt: 'search learning objectives', expected: 'search', context: 'professor' },
  { prompt: 'forget 2', expected: 'forget-rule', context: 'professor' },
  { prompt: 'find stale nodes', expected: 'show-stale', context: 'professor' },
  { prompt: 'reverse Rubrics', expected: 'reverse', context: 'professor' },
  { prompt: 'show stale', expected: 'show-stale', context: 'professor' },
  { prompt: 'add review called Peer Review', expected: 'add-node', context: 'professor' },
  { prompt: 'what should I do next', expected: 'suggest', context: 'professor' },
  { prompt: 'create a hiring pipeline', expected: 'generate', context: 'PM' },
  { prompt: 'link Assignments to Rubrics', expected: 'connect', context: 'professor' },
  { prompt: 'health breakdown', expected: 'health-detail', context: 'PM' },
  { prompt: 'optimize the workflow', expected: 'optimize', context: 'PM' },
  { prompt: 'rerun failed', expected: 'retry-failed', context: 'PM' },
  { prompt: 'arrange nodes', expected: 'layout', context: 'professor' },
  { prompt: 'compact the graph', expected: 'compress', context: 'PM' },
  { prompt: 'audit the workflow', expected: 'validate', context: 'PM' },
  { prompt: 'flip Quiz Bank', expected: 'reverse', context: 'professor' },
  { prompt: 'simplify the workflow', expected: 'compress', context: 'PM' },
  { prompt: 'check the workflow', expected: 'validate', context: 'PM' },
  { prompt: 'detach Rubrics from Quiz Bank', expected: 'disconnect', context: 'professor' },
  { prompt: 'wire Syllabus to Learning Objectives', expected: 'connect', context: 'professor' },
  { prompt: 'execute Rubrics', expected: 'run-node', context: 'professor' },
  { prompt: 'summarize the workflow', expected: 'summarize', context: 'PM' },
  { prompt: 'drop Quiz Bank', expected: 'delete', context: 'professor' },
  { prompt: 'attach Rubrics to Study Guide', expected: 'connect', context: 'professor' },
  { prompt: 'heal the workflow', expected: 'solve', context: 'PM' },
  { prompt: 'overview', expected: 'summarize', context: 'PM' },
  { prompt: 'destroy old rubric', expected: 'delete', context: 'professor' },
  { prompt: 'lay out the nodes nicely', expected: 'layout', context: 'professor' },
  { prompt: 'list dependencies', expected: 'list', context: 'PM' },
  {
    prompt: 'remove the connection between Rubrics and Quiz Bank',
    expected: 'disconnect',
    context: 'professor',
  },
  { prompt: 'show me the critical path', expected: 'critical-path', context: 'PM' },
  { prompt: 'what are the bottlenecks', expected: 'bottlenecks', context: 'PM' },
  { prompt: 'rename Lesson Plans to Weekly Plans', expected: 'rename', context: 'professor' },

  // ── Round 6: autoresearch-generated prompts ──
  {
    prompt: 'expand the workflow with a peer review step',
    expected: 'extend',
    context: 'professor',
    hasWorkflow: true,
  },
  { prompt: 'show me bottlenecks in the pipeline', expected: 'bottlenecks', context: 'PM' },
  { prompt: 'dry run the pipeline', expected: 'preflight', context: 'PM' },

  // ── Round 7: autoresearch-generated prompts ──
  {
    prompt: 'append a study guide to the end',
    expected: 'extend',
    context: 'professor',
    hasWorkflow: true,
  },
  { prompt: 'what can I do next', expected: 'suggest', context: 'professor' },
  { prompt: 'fill descriptions', expected: 'auto-describe', context: 'PM' },
  { prompt: 'show me orphan nodes', expected: 'orphans', context: 'professor' },
  { prompt: 'auto-describe all nodes', expected: 'auto-describe', context: 'PM' },

  // ── Round 8: autoresearch-generated prompts ──
  {
    prompt: 'include a discussion prompt after each lesson',
    expected: 'extend',
    context: 'professor',
    hasWorkflow: true,
  },
  { prompt: 'show me unconnected nodes', expected: 'orphans', context: 'professor' },
  { prompt: 'execution plan', expected: 'preflight', context: 'PM' },

  // ── Round 9: autoresearch-generated prompts ──
  {
    prompt: 'plus a homework submission node',
    expected: 'extend',
    context: 'professor',
    hasWorkflow: true,
  },
  { prompt: 'run stale', expected: 'propagate', context: 'professor' },
  { prompt: 'show the isolated nodes', expected: 'orphans', context: 'professor' },

  // ── Natural language that should fall to LLM ──
  { prompt: 'why is my rubric out of date', expected: 'llm-fallback', context: 'professor' },
  {
    prompt: 'why does the rubric depend on assignments',
    expected: 'llm-fallback',
    context: 'professor',
  },
  { prompt: 'what changed since yesterday', expected: 'llm-fallback', context: 'PM' },
  { prompt: 'how does the lifecycle loop work', expected: 'llm-fallback' },
  { prompt: 'can you make this workflow faster', expected: 'llm-fallback' },
  { prompt: 'should I run the quiz bank next', expected: 'llm-fallback', context: 'professor' },
  { prompt: 'tell me about the quiz bank node', expected: 'llm-fallback' },
  { prompt: 'what changed since last run', expected: 'llm-fallback', context: 'PM' },

  // Round 13: education + workflow management + dependency queries
  {
    prompt: 'which nodes need attention',
    expected: 'suggest',
    context: 'professor checking workflow',
  },
  {
    prompt: 'make the rubric more detailed',
    expected: 'llm-fallback',
    context: 'professor editing rubric',
    hasWorkflow: true,
  },
  {
    prompt: "what's blocking the FAQ from running",
    expected: 'deps',
    context: 'professor debugging execution',
  },

  // Round 14: dependency queries + stale node discovery
  {
    prompt: 'what depends on the Syllabus',
    expected: 'deps',
    context: 'professor checking downstream impact',
    hasWorkflow: true,
  },
  {
    prompt: "what's downstream of the Quiz Bank?",
    expected: 'deps',
    context: 'professor tracing dependencies',
    hasWorkflow: true,
  },
  {
    prompt: "which nodes haven't been updated recently?",
    expected: 'suggest',
    context: 'professor reviewing workflow freshness',
    hasWorkflow: true,
  },

  // Round 15: stale queries + natural propagation phrasing
  {
    prompt: "run everything that's stale",
    expected: 'propagate',
    context: 'professor wanting to refresh stale nodes',
    hasWorkflow: true,
  },
  {
    prompt: 'what nodes are stale right now?',
    expected: 'show-stale',
    context: 'professor checking stale status',
    hasWorkflow: true,
  },
  {
    prompt: 'how many nodes are stale?',
    expected: 'show-stale',
    context: 'professor quick stale check',
    hasWorkflow: true,
  },

  // Round 16: batch status, preflight readiness, execution order
  {
    prompt: 'which nodes are ready to run?',
    expected: 'preflight',
    context: 'professor checking before execution',
    hasWorkflow: true,
  },
  {
    prompt: 'what nodes are eligible to execute?',
    expected: 'preflight',
    context: 'PM checking readiness',
    hasWorkflow: true,
  },
  {
    prompt: 'mark all nodes as active',
    expected: 'activate-all',
    context: 'professor resetting workflow',
  },
  { prompt: 'set everything as active', expected: 'activate-all', context: 'PM bulk reset' },
  {
    prompt: "what's the execution order?",
    expected: 'plan',
    context: 'professor checking run sequence',
    hasWorkflow: true,
  },
  {
    prompt: 'tighten up the rubric criteria',
    expected: 'llm-fallback',
    context: 'professor editing rubric',
    hasWorkflow: true,
  },

  // ── Round 68: Agentic node/edge configuration routes ──
  {
    prompt: 'add tool to Rubric',
    expected: 'add-tool',
    context: 'PM configuring node tools',
  },
  {
    prompt: 'attach a web_search tool to the Research node',
    expected: 'add-tool',
    context: 'PM adding tool to node',
  },
  {
    prompt: 'assign a tool to Quiz Bank',
    expected: 'add-tool',
    context: 'professor setting up agentic node',
  },
  { prompt: 'show tools', expected: 'show-tools', context: 'PM listing available tools' },
  { prompt: 'list tools', expected: 'show-tools', context: 'PM listing tools' },
  { prompt: 'tools', expected: 'show-tools', context: 'PM quick tools check' },
  {
    prompt: 'set condition on edge from Rubric to Review',
    expected: 'set-condition',
    context: 'PM configuring edge guard',
  },
  {
    prompt: 'add condition for the Lesson Plan connection',
    expected: 'set-condition',
    context: 'professor adding guard',
  },
  {
    prompt: 'configure retry for Lesson Plan',
    expected: 'configure-retry',
    context: 'PM configuring resilience',
  },
  {
    prompt: 'set up retries on the Quiz Bank node',
    expected: 'configure-retry',
    context: 'professor configuring retry',
  },

  // ── Round 77: add-node with article + "node" suffix ──
  {
    prompt: 'add a review node called Peer Review',
    expected: 'add-node',
    context: 'professor adding typed node',
  },
  {
    prompt: 'create a decision node called Release Gate',
    expected: 'add-node',
    context: 'PM creating a decision node',
  },
  {
    prompt: 'add an action node called Deploy',
    expected: 'add-node',
    context: 'PM adding execution node',
  },
  {
    prompt: 'create a trigger node called Kickoff',
    expected: 'add-node',
    context: 'PM building pipeline start',
  },
  {
    prompt: 'add a test node called Unit Tests',
    expected: 'add-node',
    context: 'developer adding test node',
  },

  // ── Round 77: show-history ──
  { prompt: 'history', expected: 'show-history', context: 'PM checking past runs' },
  { prompt: 'run history', expected: 'show-history', context: 'professor reviewing runs' },
  { prompt: 'execution history', expected: 'show-history', context: 'PM reviewing runs' },
  { prompt: 'show history', expected: 'show-history', context: 'PM surfacing memory' },
  { prompt: 'show run history', expected: 'show-history', context: 'PM reviewing executions' },
  { prompt: 'past runs', expected: 'show-history', context: 'professor reviewing history' },
  { prompt: 'agent history', expected: 'show-history', context: 'PM inspecting agent memory' },

  // ── Round 77: clear-history ──
  { prompt: 'clear history', expected: 'clear-history', context: 'PM resetting memory' },
  { prompt: 'reset agent memory', expected: 'clear-history', context: 'PM clearing agent state' },
  { prompt: 'wipe history', expected: 'clear-history', context: 'PM starting fresh' },
  { prompt: 'forget memory', expected: 'clear-history', context: 'professor resetting agent' },
  { prompt: 'clear agent memory', expected: 'clear-history', context: 'PM clearing history' },

  // ── Round 78: remove-tool (must NOT misroute to delete) ──
  {
    prompt: 'remove the web_search tool from Research',
    expected: 'remove-tool',
    context: 'PM removing a tool from a node',
  },
  {
    prompt: 'delete the http_request tool from Quiz Bank',
    expected: 'remove-tool',
    context: 'professor removing unused tool',
  },
  {
    prompt: 'disable the extract_json tool on Rubric',
    expected: 'remove-tool',
    context: 'PM disabling a tool',
  },
  {
    prompt: 'detach the tool from the Research node',
    expected: 'remove-tool',
    context: 'PM detaching a tool',
  },

  // ── Round 78: show-condition ──
  {
    prompt: 'show condition on edge from Rubric to Review',
    expected: 'show-condition',
    context: 'PM inspecting edge guard',
  },
  {
    prompt: 'view the edge condition for the Lesson Plan connection',
    expected: 'show-condition',
    context: 'professor viewing guards',
  },
  {
    prompt: 'what condition is on the Rubric edge',
    expected: 'show-condition',
    context: 'PM checking condition',
  },
  {
    prompt: 'show edge conditions',
    expected: 'show-condition',
    context: 'PM listing all edge conditions',
  },

  // ── Round 78: show-tools natural language variants ──
  {
    prompt: 'what tools does the Research node have',
    expected: 'show-tools',
    context: 'PM checking node tool config',
  },
  {
    prompt: 'which tools does Quiz Bank use',
    expected: 'show-tools',
    context: 'professor inspecting tools',
  },
  {
    prompt: 'show tools on Rubric',
    expected: 'show-tools',
    context: 'PM viewing node tools',
  },
  {
    prompt: 'list tools for the Research node',
    expected: 'show-tools',
    context: 'PM listing node tools',
  },
  {
    prompt: 'tools on Research',
    expected: 'show-tools',
    context: 'PM quick tools check on node',
  },
];

// ─── Benchmark Runner ───────────────────────────────────────────────────────

describe('CID Routing Benchmark', () => {
  // Individual test for each prompt (so failures show exactly which prompt broke)
  for (const tc of BENCHMARK) {
    it(`"${tc.prompt}" → ${tc.expected}`, () => {
      const result = classifyRoute(tc.prompt, tc.hasWorkflow ?? false);
      expect(result).toBe(tc.expected);
    });
  }

  // Aggregate score
  it('BENCHMARK SCORE: accuracy percentage', () => {
    let correct = 0;
    const failures: string[] = [];

    for (const tc of BENCHMARK) {
      const result = classifyRoute(tc.prompt, tc.hasWorkflow ?? false);
      if (result === tc.expected) {
        correct++;
      } else {
        failures.push(`  "${tc.prompt}" → got "${result}", expected "${tc.expected}"`);
      }
    }

    const score = ((correct / BENCHMARK.length) * 100).toFixed(1);
    console.log(`\n  ══════════════════════════════════════════`);
    console.log(`  ROUTING BENCHMARK: ${correct}/${BENCHMARK.length} = ${score}%`);
    if (failures.length > 0) {
      console.log(`  Failures:`);
      failures.forEach((f) => console.log(f));
    }
    console.log(`  ══════════════════════════════════════════\n`);

    // The bar: 100% — all prompts must route correctly
    expect(correct).toBe(BENCHMARK.length);
  });
});

// ─── Confidence Level Tests ──────────────────────────────────────────────────

describe('Routing Confidence Levels', () => {
  // Patterns with explicit 'high' confidence -- exact commands, tight syntax
  // These must NEVER trigger the low-confidence clarification prompt in CIDPanel.
  const highConfidenceCases: Array<{
    prompt: string;
    route: CommandRoute;
    hasWorkflow?: boolean;
  }> = [
    // Slash commands
    { prompt: '/template course', route: 'template' },
    // Core generation
    { prompt: 'build a lesson plan pipeline', route: 'generate' },
    { prompt: 'add a quiz bank after the lesson plan', route: 'extend', hasWorkflow: true },
    { prompt: 'solve', route: 'solve' },
    { prompt: 'status', route: 'status' },
    { prompt: 'propagate', route: 'propagate' },
    // Exact single-word commands (these were previously 'low' by position -- now fixed)
    { prompt: 'undo', route: 'undo' },
    { prompt: 'redo', route: 'redo' },
    { prompt: 'count', route: 'count' },
    { prompt: 'explain', route: 'explain' },
    { prompt: 'help', route: 'help' },
    { prompt: 'compress', route: 'compress' },
    { prompt: 'bottlenecks', route: 'bottlenecks' },
    // Structured commands with clear syntax
    { prompt: 'merge Rubric and Grading Guide', route: 'merge' },
    { prompt: 'retry failed', route: 'retry-failed' },
    // New agentic routes
    { prompt: 'add tool to Rubric', route: 'add-tool' },
    { prompt: 'configure retry for Quiz Bank', route: 'configure-retry' },
    { prompt: 'set condition on edge from Rubric to Review', route: 'set-condition' },
    { prompt: 'show tools', route: 'show-tools' },
    { prompt: 'what tools does the Research node have', route: 'show-tools' },
    { prompt: 'remove the web_search tool from Research', route: 'remove-tool' },
    { prompt: 'disable the extract_json tool on Rubric', route: 'remove-tool' },
    { prompt: 'show condition on edge from Rubric to Review', route: 'show-condition' },
    { prompt: 'show edge conditions', route: 'show-condition' },
    // History / memory routes
    { prompt: 'history', route: 'show-history' },
    { prompt: 'run history', route: 'show-history' },
    { prompt: 'clear history', route: 'clear-history' },
    { prompt: 'reset agent memory', route: 'clear-history' },
    // add-node with article + node suffix
    { prompt: 'create a decision node called Release Gate', route: 'add-node' },
    { prompt: 'add a review node called Peer Review', route: 'add-node' },
  ];

  for (const tc of highConfidenceCases) {
    it(`"${tc.prompt}" → high confidence`, () => {
      const result = classifyRouteWithConfidence(tc.prompt, tc.hasWorkflow ?? false);
      expect(result.route).toBe(tc.route);
      expect(result.confidence).toBe('high');
    });
  }

  // Patterns with 'medium' confidence -- accept variable content, could need clarification
  const mediumConfidenceCases: Array<{
    prompt: string;
    route: CommandRoute;
    hasWorkflow?: boolean;
  }> = [
    { prompt: 'deps Rubric', route: 'deps' },
    { prompt: 'refresh the quiz bank', route: 'refresh-node' },
    { prompt: 'run Lesson Plan', route: 'run-node' },
    { prompt: 'search learning objectives', route: 'search' },
    { prompt: 'show stale nodes', route: 'show-stale' },
  ];

  for (const tc of mediumConfidenceCases) {
    it(`"${tc.prompt}" → medium confidence`, () => {
      const result = classifyRouteWithConfidence(tc.prompt, tc.hasWorkflow ?? false);
      expect(result.route).toBe(tc.route);
      expect(result.confidence).toBe('medium');
    });
  }

  // LLM fallback is always low confidence
  const lowConfidenceCases: Array<{
    prompt: string;
    route: CommandRoute;
    hasWorkflow?: boolean;
  }> = [
    { prompt: 'why is my rubric out of date', route: 'llm-fallback' },
    { prompt: 'how does the lifecycle loop work', route: 'llm-fallback' },
  ];

  for (const tc of lowConfidenceCases) {
    it(`"${tc.prompt}" → low confidence`, () => {
      const result = classifyRouteWithConfidence(tc.prompt, tc.hasWorkflow ?? false);
      expect(result.route).toBe(tc.route);
      expect(result.confidence).toBe('low');
    });
  }

  // routePromptCompat should return the same route as classifyRoute
  it('routePromptCompat returns same route as classifyRoute', () => {
    const prompts = ['build a pipeline', 'status', 'propagate', 'why is my rubric stale'];
    for (const p of prompts) {
      expect(routePromptCompat(p)).toBe(classifyRoute(p));
    }
  });

  // classifyRouteWithConfidence result.route should match classifyRoute
  it('classifyRouteWithConfidence route matches classifyRoute', () => {
    for (const tc of BENCHMARK) {
      const result = classifyRouteWithConfidence(tc.prompt, tc.hasWorkflow ?? false);
      const route = classifyRoute(tc.prompt, tc.hasWorkflow ?? false);
      expect(result.route).toBe(route);
    }
  });
});
