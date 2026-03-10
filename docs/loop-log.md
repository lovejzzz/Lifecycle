# Test & Refine Loop Log

Tracks what each automated cycle checked, found, and fixed.

## Audit Rotation

Components and modules are audited in rotation. Each cycle picks the next un-audited target.

### Rotation Queue (reset when all checked)

**Components (UI):**
- [x] Canvas.tsx
- [x] CIDPanel.tsx (cycle 2)
- [ ] NodeDetailPanel.tsx
- [ ] ArtifactPanel.tsx
- [ ] TopBar.tsx
- [ ] LifecycleNode.tsx
- [ ] ActivityPanel.tsx
- [ ] PreviewPanel.tsx
- [ ] DiffView.tsx
- [ ] ImpactPreview.tsx
- [ ] NodeContextMenu.tsx
- [ ] ErrorBoundary.tsx

**Store & Core Logic:**
- [x] useStore.ts (persistence & projects) (cycle 3)
- [x] useStore.ts (node operations) (cycle 4)
- [ ] useStore.ts (edge operations & graph)
- [ ] useStore.ts (execution & CID)
- [ ] useStore.ts (undo/redo & history)
- [ ] useStore.ts (commands & dispatch)
- [ ] graph.ts
- [ ] intent.ts
- [ ] agents.ts
- [ ] prompts.ts
- [ ] edits.ts
- [ ] health.ts
- [ ] optimizer.ts
- [ ] reflection.ts
- [ ] storage.ts

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

## Cycle Log

<!-- Newest entries at top -->

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
