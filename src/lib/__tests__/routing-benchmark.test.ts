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
import { classifyRoute, type CommandRoute } from '@/lib/routing';

interface BenchmarkCase {
  prompt: string;
  expected: CommandRoute;
  context?: string; // who would say this
  hasWorkflow?: boolean;
}

// ─── The Benchmark: 82 real user prompts ────────────────────────────────────

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
  { prompt: 'add a quiz bank after the lesson plan', expected: 'extend', context: 'professor', hasWorkflow: true },
  { prompt: 'extend with a final exam node', expected: 'extend', context: 'professor', hasWorkflow: true },
  { prompt: 'also include a grading rubric', expected: 'extend', context: 'professor', hasWorkflow: true },
  { prompt: 'insert a review gate before output', expected: 'extend', context: 'PM', hasWorkflow: true },

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
  { prompt: 'show me what\'s stale', expected: 'show-stale', context: 'professor' },
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
  { prompt: 'show me what\'s stale', expected: 'show-stale', context: 'professor' },
  { prompt: 'batch approve where category=artifact', expected: 'batch-where', context: 'PM' },
  { prompt: 'teach: always generate rubrics with 4 performance levels', expected: 'teach', context: 'professor' },
  { prompt: 'save template my-course-v2', expected: 'save-template', context: 'professor' },
  { prompt: 'deps Rubrics', expected: 'deps', context: 'professor' },
  { prompt: 'swap Assignments and Quiz Bank', expected: 'swap', context: 'professor' },
  { prompt: 'describe Syllabus as: The master course outline and schedule', expected: 'describe', context: 'professor' },
  { prompt: 'isolate Learning Objectives', expected: 'isolate', context: 'professor' },
  { prompt: 'set Rubrics to locked', expected: 'set-status', context: 'professor' },
  { prompt: 'clone workflow', expected: 'clone-workflow', context: 'PM' },
  { prompt: 'content Lesson Plans: Week 1 covers intro to algorithms', expected: 'content', context: 'professor' },
  { prompt: 'disconnect Rubrics from Quiz Bank', expected: 'disconnect', context: 'professor' },
  { prompt: 'lock Syllabus', expected: 'set-status', context: 'professor' },
  { prompt: 'search learning objectives', expected: 'search', context: 'professor' },
  { prompt: 'forget 2', expected: 'forget-rule', context: 'professor' },
  { prompt: 'find stale nodes', expected: 'show-stale', context: 'professor' },
  { prompt: 'explain', expected: 'explain', context: 'professor' },
  { prompt: 'reverse Rubrics', expected: 'reverse', context: 'professor' },
  { prompt: 'show stale', expected: 'show-stale', context: 'professor' },
  { prompt: 'add review called Peer Review', expected: 'add-node', context: 'professor' },
  { prompt: 'run workflow', expected: 'run-workflow', context: 'professor' },
  { prompt: 'what should I do next', expected: 'suggest', context: 'professor' },

  // ── Natural language that should fall to LLM ──
  { prompt: 'why is my rubric out of date', expected: 'llm-fallback', context: 'professor' },
  { prompt: 'why does the rubric depend on assignments', expected: 'llm-fallback', context: 'professor' },
  { prompt: 'what changed since yesterday', expected: 'llm-fallback', context: 'PM' },
  { prompt: 'how does the lifecycle loop work', expected: 'llm-fallback' },
  { prompt: 'can you make this workflow faster', expected: 'llm-fallback' },
  { prompt: 'should I run the quiz bank next', expected: 'llm-fallback', context: 'professor' },
  { prompt: 'tell me about the quiz bank node', expected: 'llm-fallback' },
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
      failures.forEach(f => console.log(f));
    }
    console.log(`  ══════════════════════════════════════════\n`);

    // The bar: 100% — all prompts must route correctly
    expect(correct).toBe(BENCHMARK.length);
  });
});
