# Test & Refine Loop Log

Tracks what each automated cycle checked, found, and fixed.

## Audit Rotation

Components and modules are audited in rotation. Each cycle picks the next un-audited target.

### Rotation Queue (reset when all checked)

**Components (UI):**
- [x] Canvas.tsx
- [x] CIDPanel.tsx
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
- [ ] useStore.ts (persistence & projects)
- [ ] useStore.ts (node operations)
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
- [ ] simulation.test.ts
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
