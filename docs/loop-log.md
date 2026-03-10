# Test & Refine Loop Log

Tracks what each automated cycle checked, found, and fixed.

## Audit Rotation

Components and modules are audited in rotation. Each cycle picks the next un-audited target.

### Rotation Queue (reset when all checked)

**Priority Queue** (reordered by Meta-Refinement 1 — store-first, risk-weighted):

*Tier 1 — Store (highest bug yield):*
- [x] useStore.ts (persistence & projects) (cycle 3)
- [x] useStore.ts (node operations) (cycle 4)
- [x] useStore.ts (execution & CID) (cycle 5)
- [x] useStore.ts (undo/redo & history) (cycle 6)
- [x] useStore.ts (edge operations & graph) (cycle 7)
- [ ] useStore.ts (commands & dispatch)

*Tier 2 — Core lib (logic-heavy, low coverage):*
- [ ] intent.ts (30% coverage)
- [x] reflection.ts (covered cycle 6 — 31.21%→80.92%)
- [x] prompts.ts (covered cycle 7 — 51.63%→92.39%)
- [x] agents.ts (covered cycle 4 — 3.65%→64.02%)
- [x] intent.ts (covered cycle 5 — 29.95%→93.39%)
- [ ] storage.ts
- [ ] graph.ts
- [ ] health.ts
- [ ] optimizer.ts
- [ ] edits.ts

*Tier 3 — Components (batch small ones together):*
- [x] Canvas.tsx (cycle 1)
- [x] CIDPanel.tsx (cycle 2)
- [ ] NodeDetailPanel.tsx
- [ ] ArtifactPanel.tsx
- [ ] TopBar.tsx + LifecycleNode.tsx (batch)
- [ ] ActivityPanel.tsx + PreviewPanel.tsx (batch)
- [ ] DiffView.tsx + ImpactPreview.tsx + NodeContextMenu.tsx + ErrorBoundary.tsx (batch)

**Test Files (refine cycle):**
- [x] simulation.test.ts (cycle 3)
- [ ] simulation-e2e.test.ts
- [ ] simulation-chaos.test.ts
- [ ] graph.test.ts
- [ ] intent.test.ts
- [ ] edits.test.ts
- [ ] health.test.ts
- [ ] storage.test.ts
- [ ] undo.test.ts

---

## Meta-Refinements

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
