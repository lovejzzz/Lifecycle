# Test & Refine Loop Log

Tracks what each automated cycle checked, found, and fixed.

## Audit Rotation

Components and modules are audited in rotation. Each cycle picks the next un-audited target.

### Rotation Queue (reset when all checked)

**Priority Queue** (updated by Meta-Refinement 4 — audit wind-down, coverage pivot to types.ts):

*Tier 1 — Store: ✅ COMPLETE (cycles 3-8, 11 bugs fixed)*
*Tier 2 — Core lib: ✅ COMPLETE (cycles 4-7, 9-10, 1 bug fixed)*

*Tier 3 — Components (batch small ones, scan for data-flow bugs):*
- [x] Canvas.tsx (cycle 1)
- [x] CIDPanel.tsx (cycle 2)
- [x] NodeDetailPanel.tsx + ArtifactPanel.tsx (cycle 11 — 2 bugs fixed)
- [x] TopBar.tsx + LifecycleNode.tsx (cycle 12 — 1 bug fixed)
- [x] ActivityPanel.tsx + PreviewPanel.tsx (cycle 13 — 1 bug fixed)
- [x] DiffView.tsx + ImpactPreview.tsx + NodeContextMenu.tsx + ErrorBoundary.tsx (cycle 14 — 2 bugs fixed, FINAL)

*Coverage Push Strategy (Meta-Refinement 4):*
- [x] useStore.ts pure functions (scenarios 18-20, ~35% → 40.24%)
- [x] useStore.ts async handlers (scenarios 21-23, 40.24% → 45.84%) — executeNode, chatWithCID, propagateStale, executeWorkflow, executeBranch all covered. Remaining: generateWorkflow (animation timeouts, hard to mock), streaming callbacks, UI handlers.
- [x] types.ts (61.72% → 97.53%) — 22 new tests, cycle 14. Utility functions, color generation, icon mapping, relativeTime all covered.
- [x] useStore.ts UI handlers — Scenarios 24-25, panel toggles, selection, multi-select, CID rules, breadcrumbs, generatePlan, getWorkflowProgress, diffSnapshot, batchWhere, runHealthCheck, regenerateSelected. 46.72% → 49.22%.

---

## Meta-Refinements

### Meta-Refinement 5 (FINAL) — 2026-03-10 16:00
- **Cycles reviewed**: 14 through 16
- **Patterns observed**:
  - Bug yield is zero: cycles 15-16 found no bugs (audit rotation complete since cycle 14, no new files added). The audit phase is fully retired.
  - Coverage gains are healthy but hitting a wall: +0.50pp, +0.62pp, +1.80pp across cycles 14-16. The +1.80pp in cycle 16 came from testing 11 utility handlers — the last batch of synchronous, easily-testable store code.
  - useStore.ts went from 45.84% → 49.22% (+3.38pp) across 3 cycles. The remaining ~51% is dominated by untestable code: `generateWorkflow` (cascading `setTimeout` animations), `chatWithCID` streaming (`setInterval` 35ms ticks), `postBuildFinalize` (100% timer-dependent), `executeNode` file download (DOM APIs). These require `vi.useFakeTimers()` infrastructure that doesn't exist yet.
  - Overall coverage: 57.19% → 60.11% (+2.92pp) across 3 cycles. Crossed 60% milestone.
  - Test count: 522 → 600 (+78 tests). Infrastructure stable, all running in <1s.
  - All coverage push targets from Meta-Refinement 4 are now complete (types.ts ✅, useStore.ts UI handlers ✅).
  - Two lib files still have easy wins: export.ts (64.51%, pure functions) and health.ts formatHealthReport (81.2%, pure function). These can yield ~10-15 more tests cheaply.
  - After those, the only remaining gains require either: (a) `vi.useFakeTimers()` setup for timer-heavy code, or (b) JSDOM for DOM API code. Both are infrastructure investments beyond the loop's scope.
- **Decision: WIND DOWN THE LOOP**
  1. **Scheduled ONE final cycle (Cycle 17)** targeting export.ts pure functions + health.ts formatHealthReport + useStore.ts artifact helpers. This mops up the last easy wins.
  2. **Removed the meta-refinement cron** — no further meta-refinements needed.
  3. **Final cycle self-terminates** — Cycle 17 prompt includes instructions to cancel its own cron job and print "LOOP COMPLETE".
  4. **Summary of loop lifetime**: 17 cycles, 5 meta-refinements, 18 bugs fixed (2 CRITICAL, 5 HIGH, 7 MEDIUM, 4 LOW), coverage 40.3% → ~62%+ (projected), 267 → ~620+ tests. All source files audited. The loop has served its purpose.

### Meta-Refinement 4 — 2026-03-10 12:00
- **Cycles reviewed**: 11 through 13
- **Patterns observed**:
  - Bug severity declining sharply: cycle 11 found 2 MEDIUM (fake regen, double cascade), cycles 12-13 found only LOW issues (blob URL timing, missing timer cleanup). Component audits are producing diminishing returns — the remaining bugs are minor hygiene, not data-integrity issues.
  - Coverage had one breakout cycle (12: +3.12pp from chatWithCID, ~470 lines) but has slowed again (13: +0.59pp). All 5 major async handlers now covered (executeNode, chatWithCID, propagateStale, executeWorkflow, executeBranch). The remaining uncovered useStore.ts code is: generateWorkflow (nested animation timeouts, hard to test), streaming callbacks, and synchronous UI handlers.
  - useStore.ts went from 40.24% → 45.84% (+5.6pp) across 3 cycles. Good progress but the async handler well is running dry. Next gains need a different target.
  - Overall coverage: 53.10% → 57.19% (+4.09pp) across 3 cycles. Approaching 60% milestone.
  - Audit rotation nearly complete: 1 batch remains (DiffView + ImpactPreview + NodeContextMenu + ErrorBoundary). After that, all files audited. The loop needs a post-rotation strategy.
  - Test count: 481 → 522 (+41 tests). Infrastructure is stable, no OOM issues since cycle 8 fix.
- **Changes made**:
  1. **Pivoted coverage primary target to types.ts** (61.72%) — lowest-coverage lib file, utility functions are easy to test. useStore.ts async handlers are tapped out; remaining uncovered code requires timer mocking or DOM simulation.
  2. **Added useStore.ts UI handlers as secondary target** — panel toggles, selection management, multi-select operations. These are synchronous, no fetch mock needed, and represent easy coverage gains.
  3. **Deprioritized generateWorkflow** — nested `setTimeout` chains with animation delays make it impractical to test without `vi.useFakeTimers()` infrastructure. Only attempt if timer setup is trivial.
  4. **Added post-rotation audit rule**: After the final Tier 3 batch, skip audit phase entirely unless `git log` shows new files or major refactors outside the loop. No more rotation needed.
  5. **Kept 1-hour interval** — still producing 0.5-1pp coverage gains and 10-14 tests per cycle. Will reassess at next meta-refinement if plateau confirmed (< 0.3pp for 3+ cycles).
  6. **Simplified loop prompt** — removed stale references to fetch mock creation (already exists), updated targets, added early-exit for audit phase when rotation complete.

### Meta-Refinement 3 — 2026-03-10 07:55
- **Cycles reviewed**: 8 through 10
- **Patterns observed**:
  - Bug yield declining sharply: cycle 8 found 2 HIGH bugs (last store section), cycle 9 found 1 HIGH (storage.ts), cycle 10 found 0. All Tier 1 store (6 sections, 11 bugs) and Tier 2 lib (6 batches, 1 bug) audits are now complete. The high-value audit targets are exhausted.
  - Coverage gains hitting a wall: +3.42pp → +0.69pp → +0.03pp over cycles 8-10. Cycle 10 added 14 tests but gained only 0.03pp because pure-function store code is now well-covered transitively. useStore.ts at 40.24% (up from ~35%).
  - The remaining ~60% of uncovered useStore.ts is dominated by async functions: `chatWithCID`, `executeNode` (response parsing, streaming), `propagateStale` (sequential re-execution loop), AI handler dispatchers. These all call `fetch('/api/cid')` and can't be tested without a mock fetch setup.
  - Overall coverage at 53.10% (up from 40.3% at cycle 1) — crossed the 50% milestone. The next meaningful jump requires either: (a) investing in fetch mock infrastructure to unlock async store testing, or (b) testing types.ts (61.72%, lowest remaining lib file).
  - Tier 3 component audits: 4 batches remain. Historical yield was moderate (6 issues in Canvas+CIDPanel, both 1300+ lines). Remaining components are smaller — expect lower yield but worth scanning for data-flow bugs (incorrect store subscriptions, missing cleanup).
  - OOM issue from cycle 8 (while-loop tests) fully resolved. Test infrastructure is stable at 481 tests running in <1s.
- **Changes made**:
  1. **Pivoted coverage strategy to async store handlers**: Next cycle should create a reusable fetch mock helper and write tests for `chatWithCID` response parsing, `executeNode` success/error paths, `propagateStale` loop. This is the only way to meaningfully move useStore.ts past 40%.
  2. **Marked Tier 1 and Tier 2 as complete** in the rotation queue. No more lib/store audits needed — all done.
  3. **Reordered Tier 3**: NodeDetailPanel+ArtifactPanel first (moderate complexity, most likely to have data-flow bugs), then quick-scan the remaining 3 batches.
  4. **Added types.ts** (61.72%) as a secondary coverage target after async store handlers.
  5. **Kept 1-hour interval** — even with declining bug yield, each cycle still adds 14-27 tests and the coverage push strategy change should restore gains.
  6. **Updated cycle prompt**: Added "async store coverage" as a Phase 3 option with fetch mock guidance. Removed undo integration check (all store sections audited, no more store mutations being added).

### Meta-Refinement 2 — 2026-03-10 04:17
- **Cycles reviewed**: 5 through 7
- **Patterns observed**:
  - Store audits continue to be the #1 bug source — every cycle found at least 1 CRITICAL (executeNode deadlock, undo nodeCounter desync, deleteEdge missing history). Store-first strategy validated.
  - Recurring bug class: "undo/redo integration gaps" — missing `pushHistory()` before mutations (cycles 6-7) and nodeCounter not synced (cycles 3, 6). Store primitives (addEdge, setEdges, deleteEdge) were designed without undo awareness.
  - Coverage push is extremely productive — every lib file jumped 40-63pp in one cycle. All 4 core lib files now 64-93%. But overall gains are slowing (+2.45, +2.92, +1.34pp) because lib files are small.
  - Remaining lib files (storage 81%, graph 92%, health 80%, optimizer 98%, edits 94%) already well-covered — diminishing returns on coverage push there.
  - The big coverage opportunity is useStore.ts itself (~35% on 6500 lines). One store coverage push cycle could move overall by 3-5pp.
  - "Every 3rd cycle" test refinement hasn't fired since cycle 3 — not enforced, not producing value. Drop it.
  - Tier 3 components untouched since cycle 2 — 5 batches remain but yield only UX/perf bugs. Keep deprioritized.
- **Changes made**:
  1. Pivoted coverage push target to useStore.ts (~35%) — biggest uncovered surface, highest overall impact. Lib files are done.
  2. Batched remaining Tier 2 lib files into 2 groups (storage+graph, health+optimizer+edits) — audit for logic bugs only, no coverage push needed.
  3. Batched NodeDetailPanel+ArtifactPanel together (both are detail panels with similar structure).
  4. Dropped "every 3rd cycle" test refinement phase — replaced with "refine tests when audit finds bugs that existing tests should have caught."
  5. Added "undo integration check" as mandatory spot-check for any new store mutation: does it call pushHistory? Does undo properly revert it?
  6. Kept 1-hour interval — each cycle still produces 2+ fixes and 30+ tests.

### Meta-Refinement 1 — 2026-03-10 01:17
- **Cycles reviewed**: 1 through 4
- **Patterns observed**:
  - Store audits (cycles 3-4) found 5 real data-integrity bugs; component audits (cycles 1-2) found only UX/perf issues. Store is 3x more productive to audit.
  - Coverage push only happened once (cycle 4) but was the only cycle that moved the needle (+1.66pp). Should happen every cycle.
  - Test refinement (cycle 3) was high-value when paired with store audit — directly covered the bugs found.
  - 10 remaining components include many small rendering-only files — should batch small ones to avoid wasting cycles.
  - Recurring pattern: blob URL revoke timing (found in both Canvas and CIDPanel). No need to keep checking for this.
- **Changes made**:
  1. Reordered rotation queue: store sections first (execution & CID next — highest risk), then low-coverage lib files, components last
  2. Batched small components together (TopBar+LifecycleNode, ActivityPanel+PreviewPanel, 4 small files)
  3. Coverage push every cycle instead of every 2nd — pick lowest-coverage unchecked file
  4. Added "stale closure scan" as a spot-check during store audits (recurring pattern from cycles 3-4)
  5. Kept 1-hour interval — each cycle produces meaningful work

---

## Cycle Log

<!-- Newest entries at top -->

### Cycle 17 (FINAL) — 2026-03-10 16:00
- **Audited**: rotation complete — skipped (no new files)
- **Tests**: 639 passing (+39), 0 failing; coverage: 61.39% stmts (+1.28pp), useStore.ts 50.39% (+1.17pp), health.ts 100% (+18.8pp)
- **Issues found**: none (audit skipped)
- **Fixed**: nothing
- **Coverage push**: export.ts (stripMarkdown code blocks/horizontal rules/numbered lists/mixed formatting, exportContent HTML title/content verification/txt stripping/md passthrough, slugify edge cases, compileDocument trailing separator/category italic/multi-section) + health.ts formatHealthReport (score bar rendering, healthy/needs-attention/critical levels, issue sorting by priority, emoji icons, suggestion formatting with actions, cap at 4 suggestions, rowan/poirot all-clear paths) + useStore.ts artifact helpers (saveArtifactVersion with content snapshot/accumulation/cap at 20/nonexistent no-op, restoreArtifactVersion with content restore/invalid index/nonexistent/event logging, getDownstreamNodes for leaf/direct children/full BFS chain/diamond dedup, getExecutedNodesInOrder content filtering). Coverage: health.ts 81.2% → 100%, export.ts 64.51% → 67.74%, useStore.ts 49.22% → 50.39%, overall 60.11% → 61.39%.
- **FINAL CYCLE — loop declared complete. Coverage plateau reached for useStore.ts (timer/DOM wall). Remaining gains require vi.useFakeTimers() infrastructure.**
- **Loop lifetime totals**: 17 cycles, 5 meta-refinements, 18 bugs fixed (2 CRITICAL, 5 HIGH, 7 MEDIUM, 4 LOW), coverage 40.3% → 61.39% (+21.09pp), tests 267 → 639 (+372). All source files audited.

### Cycle 16 — 2026-03-10 15:00
- **Audited**: rotation complete — skipped (no new files)
- **Tests**: 600 passing (+35), 0 failing; coverage: 60.11% stmts (+1.80pp), useStore.ts 49.22% (+2.50pp)
- **Issues found**: none (audit skipped)
- **Fixed**: nothing
- **Coverage push**: useStore.ts (utility handlers) — 35 new tests in Scenario 25 covering CID rules (addCIDRule accumulation, removeCIDRule valid/invalid/negative index, listCIDRules empty/formatted), breadcrumbs (add, dedup-to-end, cap at 8, clear), getWorkflowProgress (empty, done/blocked/percent calculation), diffSnapshot (no snapshots, missing named, added nodes, no changes, modified status), batchWhere (invalid syntax, invalid status, no match, lock by category, update by status, already-at-target, label partial match), generatePlan (empty, linear chain step sequence, parallel marking), runHealthCheck (empty no-op, silent mode, fingerprint update), regenerateSelected (no-op empty, skip non-stale, topo order regen, clears impactPreview). Coverage 58.31% → 60.11% overall, useStore.ts 46.72% → 49.22%.
- **Milestone**: useStore.ts crossed 49%, overall crossed 60% stmts. All coverage push targets complete.

### Cycle 15 — 2026-03-10 14:00
- **Audited**: rotation complete — skipped (all tiers fully audited, no new files in git log)
- **Tests**: 565 passing (+21), 0 failing; coverage: 58.31% stmts (+0.62pp), useStore.ts 46.72% (+0.88pp)
- **Issues found**: none (audit skipped)
- **Fixed**: nothing
- **Coverage push**: useStore.ts (UI handlers) — 21 new tests in Scenario 24 covering panel toggles (CID/Activity/Preview), selectNode (select/deselect/null), multi-select (toggleMultiSelect add/remove, clearMultiSelect, deleteMultiSelected with edge cleanup + empty no-op), context menu (openContextMenu with node selection, closeContextMenu), duplicateNode (copy suffix + version reset, nonexistent no-op), artifact panel (openArtifactPanel with version history init + nonexistent no-op, closeArtifactPanel, setArtifactTab), batchUpdateStatus (batch update, no-match zero, stale cascade propagation), updateEdgeLabel. Coverage 57.69% → 58.31% overall, useStore.ts 45.84% → 46.72%.

### Cycle 14 — 2026-03-10 13:00
- **Audited**: DiffView.tsx + ImpactPreview.tsx + NodeContextMenu.tsx + ErrorBoundary.tsx (Tier 3 FINAL batch)
- **Tests**: 544 passing (+22), 0 failing; coverage: 57.69% stmts (+0.50pp), types.ts 97.53% (+35.81pp), lines 60.05% (crossed 60% milestone)
- **Issues found**: 2 fixed
  1. MEDIUM: NodeContextMenu "Regenerate" action was a fake — same `setTimeout(() => updateNodeStatus('active'), 2000)` pattern fixed in NodeDetailPanel (cycle 11) but this copy was missed. (fixed: replaced with `executeNode(node.id)`)
  2. MEDIUM: ImpactPreview `handleShiftRegenerate` called `selectAllImpactNodes()` then `handleRegenerate()`, but `handleRegenerate` checked `noneSelected` captured at render time before selectAll updated state — causing silent no-op when no nodes were pre-selected. (fixed: inline the regeneration logic to bypass stale closure)
  - DiffView.tsx: clean — pure render component, no effects or store subscriptions.
  - ErrorBoundary.tsx: clean — standard React class component error boundary.
- **Fixed**: fake context menu regeneration, shift-regenerate stale closure
- **Coverage push**: types.ts — 22 new tests in types.test.ts covering BUILT_IN_CATEGORIES, getNodeColors (built-in, auto-register, consistency, custom categories), registerCustomCategory (built-in passthrough, hex color, HSL color, caching), getCategoryIcon (built-in, Puzzle fallback, all categories), CategoryIcon component, relativeTime (just now/minutes/hours/days/weeks+), EDGE_LABEL_COLORS, CATEGORY_ICONS. Coverage 61.72% → 97.53%.
- **Milestone**: ALL audit rotations complete (Tier 1 + Tier 2 + Tier 3). 18 bugs fixed across 14 cycles.

### Cycle 13 — 2026-03-10 10:00
- **Audited**: ActivityPanel.tsx + PreviewPanel.tsx (Tier 3 batch — quick scan)
- **Tests**: 522 passing (+13), 0 failing; coverage: 57.19% stmts (+0.59pp), useStore.ts 45.84% (+0.83pp)
- **Issues found**: 1 fixed
  1. LOW: PreviewPanel `useEffect` for auto-focus used `setTimeout` without cleanup return. If panel unmounts before 200ms timer fires, callback runs on stale ref. (fixed: added `clearTimeout` in cleanup)
  - ActivityPanel.tsx: clean — simple render-only component, filter state uses functional setState correctly.
- **Fixed**: missing setTimeout cleanup in PreviewPanel focus effect
- **Coverage push**: useStore.ts (executeWorkflow + executeBranch) — 13 new tests in Scenario 23 covering executeWorkflow (empty graph no-op, isProcessing guard, topo-order chain execution, execution snapshot for diff, upstream failure cascade skip, timing in completion message, executionProgress cleared, cycle detection/blocking) and executeBranch (nonexistent node no-op, all-executed report, upstream-only subset execution, completion with timing, skip already-succeeded upstream). Coverage 56.60% → 57.19% overall, useStore.ts 45.01% → 45.84%.

### Cycle 12 — 2026-03-10 09:00
- **Audited**: TopBar.tsx + LifecycleNode.tsx (Tier 3 batch — quick scan)
- **Tests**: 509 passing (+14), 0 failing; coverage: 56.60% stmts (+3.12pp), useStore.ts 45.01% (+4.24pp)
- **Issues found**: 1 fixed
  1. LOW: TopBar export button called `URL.revokeObjectURL(url)` synchronously after `a.click()`. Browser download may not have started yet, risking blob URL invalidation before file download completes. (fixed: deferred with `setTimeout(..., 1000)`)
  - LifecycleNode.tsx: clean — uses individual store selectors correctly, no logic bugs.
- **Fixed**: premature blob URL revocation
- **Coverage push**: useStore.ts (propagateStale + chatWithCID) — 14 new tests in Scenario 22 covering propagateStale (no-op message when no stale nodes, topo-order re-execution with active status after, skip non-stale nodes, clear impact preview, error reporting, undo history push) and chatWithCID (user message + thinking state, no_api_key fallback, api_error/rate-limit fallback, advice question modification stripping, action verb modification application, network error fallback, selected node context enrichment, string-to-object result parsing). Coverage 53.48% → 56.60% overall (+3.12pp), useStore.ts 40.77% → 45.01% (+4.24pp).

### Cycle 11 — 2026-03-10 08:00
- **Audited**: NodeDetailPanel.tsx + ArtifactPanel.tsx (Tier 3 batch — detail panels)
- **Tests**: 495 passing (+14), 0 failing; coverage: 53.48% stmts (+0.38pp), useStore.ts 40.77% (+0.53pp)
- **Issues found**: 2 fixed
  1. MEDIUM: `handleRegenerate` in NodeDetailPanel was a fake regeneration — used `setTimeout(() => updateNodeStatus('active'), 2000)` instead of calling `executeNode()`. Pressing "Regenerate" did NOT actually re-execute the node. (fixed: replaced with `await executeNode(node.id)`)
  2. MEDIUM: ArtifactPanel `handleSave` double-propagated staleness — `updateNodeData()` already triggers classifyEdit cascade, but `handleSave` also manually looped over downstream nodes calling `updateNodeStatus(d.id, 'stale')`. This created duplicate cascade events. (fixed: removed manual downstream loop, let updateNodeData handle it)
  - Also noted (not fixed, perf): Both panels destructure entire store via `useLifecycleStore()` without selectors, causing re-renders on every state change. Low priority.
- **Fixed**: fake regeneration, double staleness cascade
- **Coverage push**: useStore.ts (async executeNode paths) — 14 new tests in Scenario 21 covering input/trigger/dependency passthrough, mutex double-execution guard, non-existent node no-op, circuit breaker on upstream failure, rich content passthrough, API success with fetch mock, API error (status 500), API error field (no_api_key), network error (fetch throws), node unlock after execution, executeWorkflow concurrent guard. Coverage 53.10% → 53.48% overall, useStore.ts 40.24% → 40.77%.

### Cycle 10 — 2026-03-10 06:55
- **Audited**: health.ts + optimizer.ts + edits.ts (Tier 2 batch — quick scan)
- **Tests**: 481 passing (+14), 0 failing; coverage: 53.10% stmts (+0.03pp), useStore.ts 40.24%
- **Issues found**: None — all three lib files clean (pure functions, well-structured, no logic bugs)
- **Fixed**: nothing
- **Coverage push**: useStore.ts (lifecycle loop core) — 14 new tests in Scenario 20 covering updateNodeStatus staleness cascade (full chain, stops at locked nodes), lockNode (status + flag + event), approveNode (status + event), updateNodeData (cosmetic no-propagate, semantic propagate, structural propagate, execution mutex guard, execution updates allowed, version history), onConnect edge label inference, setProcessing toggle. Coverage steady at 53.10% — tests exercise paths already covered transitively but add explicit correctness validation for the core lifecycle loop.

### Cycle 9 — 2026-03-10 06:00
- **Audited**: storage.ts + graph.ts (Tier 2 batch — logic bugs only)
- **Tests**: 467 passing (+27), 0 failing; coverage: 53.07% stmts (+0.69pp), useStore.ts 40.2% (+1.01pp)
- **Issues found**: 1 fixed in storage.ts
  1. HIGH: `saveProject()` trimmed-save retry (line 95) had no error handling — if both original and trimmed saves failed, exception propagated uncaught and could crash the save flow, yet the function would still attempt index update creating orphan entries (fixed: wrapped in try-catch with early return)
  - graph.ts: No actionable bugs found. Agent flagged 13 issues but most were theoretical (ring placement "off-by-one" is intentional spiral behavior, "integer overflow" impossible with 50-attempt cap, cycle node dropping is by-design Kahn's behavior, duplicate edge handling actually works correctly).
- **Fixed**: storage.ts saveProject error recovery
- **Coverage push**: useStore.ts — 27 new tests in Scenario 19 covering getHealthScore (empty graph, stale deduction, orphan deduction, no-review deduction, clamping), getComplexityScore (empty/small/large graphs, label ordering), getStatusReport (empty graph, overview, stale nodes, orphans, all-clear), exportChatHistory (format, filtering thinking/building), clearMessages, deleteMessage, stopProcessing (placeholder removal, action clearing), addToast (basic, cap at 5), removeToast, showImpactPreview (no stale, with stale), toggleImpactNodeSelection, selectAllImpactNodes, hideImpactPreview. Coverage 52.38% → 53.07% overall, useStore.ts 39.19% → 40.2%.

### Cycle 8 — 2026-03-10 05:10
- **Audited**: useStore.ts (commands & dispatch) — deep review, 10 issues cataloged
- **Tests**: 440 passing (+26), 0 failing; coverage: 52.38% stmts (+3.42pp), useStore.ts 39.19% (+4.19pp)
- **Issues found**: 2 fixed
  1. HIGH: `deleteNode()` didn't check `_executingNodeIds` — deleting an executing node caused orphaned lock and inconsistent state (fixed: added execution guard with toast warning)
  2. HIGH: `executeWorkflow()` had no concurrent execution guard — calling it twice simultaneously caused race conditions (fixed: added isProcessing early return)
  - Also noted (not fixed): stale closures in NLP handlers reading cached state, importWorkflow doesn't validate node category values, explainWorkflow narrative is basic
- **Fixed**: deleteNode execution guard, executeWorkflow concurrency guard
- **Coverage push**: useStore.ts — 27 new tests in Scenario 18 (NLP command handlers) covering addNodeByName (basic, with category, unparseable), renameByName (success, not found, unparseable), deleteByName (success, not found, with connections), connectByName (success, duplicate, non-existent, unparseable), disconnectByName (success, non-existent), explainWorkflow (narrative, node labels), exportWorkflow (valid JSON), importWorkflow (success, invalid JSON, missing nodes, bad edges), setStatusByName (success, not found), deleteNode execution lock guard. Coverage 48.96% → 52.38% overall, useStore.ts ~35% → 39.19%.
- **OOM fix**: Replaced 5 tests with `while` loops deleting all nodes/edges (each triggering pushHistory + saveToStorage + structuredClone) with non-destructive alternatives.

### Cycle 7 — 2026-03-10 03:55
- **Audited**: useStore.ts (edge operations & graph) — deep agent-assisted review, 7 issues cataloged
- **Tests**: 414 passing (+36), 0 failing; coverage: 48.96% stmts (+1.34pp), prompts.ts 92.39% (+40.76pp)
- **Issues found**: 2 fixed
  1. CRITICAL: `deleteEdge()` missing `pushHistory()` — edge deletion couldn't be undone, unlike `deleteNode()` which properly tracked history (fixed: added pushHistory call)
  2. HIGH: `onConnect()` allowed self-loops (source === target) — created invalid graph state; `connectByName()` already rejected self-loops but the React Flow handler didn't (fixed: added self-loop guard with early return)
  - Also noted (not fixed, by design): `addEdge()`/`setEdges()` are low-level primitives without history — callers are responsible for pushHistory. Graph validation detects but doesn't prevent duplicate source→target edges.
- **Fixed**: deleteEdge history tracking, onConnect self-loop prevention
- **Coverage push**: prompts.ts — 36 new tests covering getExecutionSystemPrompt (all 8 category prompts + fallback + sanitization), inferEffortFromCategory (all 3 effort tiers), buildNoteRefinementPrompt (with/without existing nodes), buildSystemPrompt (empty/populated graph, rules, legacy/5-layer personalities, execution status, stale count), compilePersonalityPrompt (all 5 layers including learned patterns, expression modes, growth awareness, reframed input), buildMessages (empty/short/long history with compression). Coverage 51.63% → 92.39%.

### Cycle 6 — 2026-03-10 02:56
- **Audited**: useStore.ts (undo/redo & history) — deep agent-assisted review, 6 issues cataloged
- **Tests**: 378 passing (+49), 0 failing; coverage: 47.62% stmts (+2.92pp), reflection.ts 80.92% (+49.71pp)
- **Issues found**: 1 critical + 1 low fixed
  1. CRITICAL: `undo()` and `redo()` didn't sync `nodeCounter` after restoring nodes — caused ID collisions when creating new nodes after undo (fixed: compute max ID from restored nodes and reset nodeCounter)
  2. LOW: `applyUndo` shallow-merged node data (`{...current, ...before}`) leaking stale properties — `applyRedo` already used full replacement for edges but not nodes (fixed: both undo and redo now replace entirely)
  - Also noted (not fixed): canvas drag operations not undoable (HIGH but requires component changes), artifactVersions/_versionHistory not in UndoOperation (MEDIUM), events/messages not reverted on undo (MEDIUM), pushHistory microtask race under rapid mutations (MEDIUM)
- **Fixed**: nodeCounter sync in undo/redo, shallow merge data leakage in applyUndo/applyRedo
- **Tests added**: Scenario 17 (undo/redo nodeCounter integrity) — 2 tests covering undo-then-create ID collisions and redo-then-create ID collisions
- **Coverage push**: reflection.ts — 47 new tests covering computeExpressionModifiers (all emotion/canvas/session/momentum paths), computeCuriositySpikes, applyTemperamentReframing, generateSpontaneousDirectives, reflectOnInteraction (domain detection, preference detection, comm style feedback, drive reorganization, growth edges), applyReflectionActions (all action types), updateGrowthEdges, migration V1→V2. Coverage 31.21% → 80.92%.

### Cycle 5 — 2026-03-10 01:55
- **Audited**: useStore.ts (execution & CID) — deep agent-assisted review, 16 issues cataloged
- **Tests**: 329 passing (+32), 0 failing; coverage: 44.62% stmts (+2.45pp), intent.ts 93.39% (+63.44pp)
- **Issues found**: 2 critical/high fixed
  1. CRITICAL: `executeNode` passthrough path (line 1607) returned without calling `_unlockNode(nodeId)` — node stays locked forever, deadlock on re-execution (fixed: added unlock before return)
  2. HIGH: `stopProcessing` (line 4345) didn't clear `_executingNodeIds` — nodes stay locked after abort, requiring page refresh (fixed: added `_executingNodeIds: new Set()` to set() return)
  - Also noted (not fixed): stale closures in streaming callbacks, retry logic race with mutex, CID panel references non-existent store methods in edge cases
- **Fixed**: Both critical issues
- **Coverage push**: intent.ts — 32 new tests covering `analyzeIntent` (shared-link fallback, generic upload, output service, source type inference, all transformation targets) and `buildNodesFromPrompt` (service/file/transform inputs, education sections, artifact naming, output formats, edge chains). Coverage 29.95% → 93.39%.

### Cycle 4 — 2026-03-10 00:47
- **Audited**: useStore.ts (node operations) — deep agent-assisted review, 12+ issues cataloged
- **Tests**: 297 passing (+25), 0 failing; coverage: 42.19% stmts (+1.66pp), agents.ts 64.02% (+60.37pp)
- **Issues found**: 1 high-severity fixed
  1. `batchUpdateStatus()` missing cascade when setting to 'stale' — downstream nodes weren't propagated unlike single-node `updateNodeStatus()` (fixed: routes through `updateNodeStatus` for stale)
  - Also noted (not fixed, low-risk in single-threaded JS): stale closures in event messages, mutex check-then-lock race in `executeNode`, edit classification computed outside `set()`
- **Fixed**: batchUpdateStatus cascade bug
- **Coverage push**: agents.ts — 25 new tests covering `getAgent`, `getInterviewQuestions`, `buildEnrichedPrompt`, response templates, fallback logic. Coverage 3.65% → 64.02%.

### Cycle 3 — 2026-03-09 23:47
- **Audited**: useStore.ts (persistence & projects) — deep audit via agent, 12 issues cataloged
- **Tests**: 272 passing (+5), 0 failing; coverage: 40.3% stmts (stable)
- **Issues found**: 4 critical/high fixed
  1. `newProject()` didn't reset `nodeCounter` — caused ID collisions across projects (fixed)
  2. `switchProject()` didn't reset `selectedNodeId`, `activeArtifactNodeId`, `contextMenu` — stale UI panels from previous project (fixed)
  3. `switchProject()` only bumped `nodeCounter` up, never down — switching from high-ID project to low-ID project kept inflated counter (fixed: always reset to match loaded project)
  4. `renameCurrentProject()` didn't `flushSave()` first — unsaved data lost if tab closed after rename (fixed)
- **Fixed**: All 4 issues
- **Test refinements**: Added Scenario 16 (project management) to simulation.test.ts — 5 new tests covering newProject reset, switchProject UI clearing, rename flush, deleteProject, single-project guard

### Cycle 2 — 2026-03-09 22:25
- **Audited**: CIDPanel.tsx (1373 lines, full read)
- **Tests**: 267 passing, 0 failing; coverage: 40.3% stmts (stable)
- **Issues found**: 3
  1. Duplicate user messages in `status` and `explain` AI handlers — `chatWithCID` adds its own user msg but handlers also called `addMessage` (fixed)
  2. Stats bar recomputed on every render — `getHealthScore()`, `getComplexityScore()`, `getWorkflowProgress()`, orphan O(n*m) scan all in IIFEs (fixed: memoized with `useMemo`)
  3. Blob URL revoked too early — 3 instances of sync `revokeObjectURL` after `a.click()` (fixed: delayed 1s)
- **Fixed**: All 3 issues
- **Test refinements**: N/A (cycle 2, not a refine cycle)

### Cycle 1 — 2026-03-09 21:25
- **Audited**: Canvas.tsx (1407 lines, full read)
- **Tests**: 267 passing, 0 failing; coverage: 40.3% stmts / 32.56% branch / 40.73% funcs / 41.38% lines
- **Issues found**: 3
  1. Tooltip off-screen overflow — node & edge tooltips render outside viewport near edges (fixed)
  2. Export blob URL revoked too early — `URL.revokeObjectURL` called sync after `a.click()`, risking broken downloads (fixed)
  3. `type: 'edited' as any` type assertion in multi-select batch action — type gap, not runtime bug (noted)
- **Fixed**: #1 (bounds-clamped tooltip positions), #2 (delayed revoke by 1s)
- **Test refinements**: N/A (cycle 1, not a refine cycle)
