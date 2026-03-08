# Next Version Roadmap (v1.1.0+)

Items from competitor research (LangGraph, CrewAI, Dify, Rivet, ComfyUI).
Each item includes specific files, implementation steps, acceptance criteria, and estimated complexity.

**Process:** Every 6 hours, pick the next unchecked item, implement it, run `npm run check`, run eval, log to CHANGELOG.md, bump version +0.1 in package.json.

---

## Backlog

### 1. Self-Correcting Retry Loop
**Status:** [ ] Not started
**Version target:** 1.1.0
**Inspiration:** LangGraph's Generate → Check → Reflect → Regenerate pattern
**Complexity:** Medium (2-3 hours)

**Problem:** When CID generates a workflow with structural issues (linear chains, thin content <300c, missing review/test gates), the server patches it silently. The LLM never learns from the mistake.

**Implementation:**

1. **File: `src/app/api/cid/route.ts`** — After the pre-flight validation block (line ~367+):
   - Add a `validateWorkflowQuality()` function that scores the workflow:
     - `isLinear`: edge count === nodes - 1 (no branches/loops) → score -20
     - `thinContent`: any node content < 300 chars → score -10 per node
     - `missingBookends`: no trigger/input at start or no output at end → score -30
     - `orphanNodes`: nodes with 0 edges → score -15 per node
     - `noFeedbackLoop`: zero edges pointing backward (higher `from` → lower `to`) → score -10
   - If total score < -20, trigger a retry:
     ```
     const reflectionPrompt = `Your workflow had these issues:\n${issues.join('\n')}\nFix them and return the corrected JSON.`;
     ```
   - Append reflection as a new user message, re-call the same LLM endpoint
   - Bounded to exactly 1 retry (no infinite loops)
   - Log: `[CID API] Reflection retry triggered: ${issues.length} issues`

2. **File: `src/app/api/cid/route.ts`** — Add retry counter to prevent recursion:
   - Accept optional `_retryCount` in request body
   - If `_retryCount >= 1`, skip validation and return as-is
   - The reflection call sets `_retryCount: 1`

3. **File: `src/store/useStore.ts`** — No changes needed (retry is server-side only)

**Acceptance criteria:**
- [ ] Linear-chain workflows trigger reflection and come back with branches
- [ ] Thin-content nodes get expanded on retry
- [ ] Max 1 retry per request (no cost explosion)
- [ ] Eval scores remain >= 98% (no regression)
- [ ] Console logs show reflection trigger rate

---

### 2. Structured Agent Goal Declarations
**Status:** [ ] Not started
**Version target:** 1.2.0
**Inspiration:** CrewAI's role + goal + backstory + tools character sheet
**Complexity:** Medium (1-2 hours)

**Problem:** Rowan consistently uses `action`/`artifact`/`state` categories and builds lean architectures (7 edges), while Poirot uses the full 13-category spread (13 edges). Rowan misses `policy` and `review` categories in 2 of 7 eval tests. The agents have rich personality but no explicit **goal per task type**.

**Implementation:**

1. **File: `src/lib/agents.ts`** — Add `taskGoals` to `AgentPersonality` type:
   ```typescript
   taskGoals: {
     generate: string;  // Goal when building workflows
     analyze: string;   // Goal when giving advice
     execute: string;   // Goal when writing documents
   };
   ```

2. **Rowan's goals:**
   ```
   generate: "Build the most operationally useful workflow. Use the FULL category spread — 'policy' for compliance gates, 'review' for human approvals, 'test' for validation. Don't default everything to 'action'. Include at least one feedback loop."
   analyze: "Give the most actionable advice possible. Be specific with tools, metrics, and steps. Aim for 300+ characters — concise but substantive."
   execute: "Write production-ready content. Include specific commands, configurations, and decision criteria."
   ```

3. **Poirot's goals:**
   ```
   generate: "Build the most thorough, well-connected workflow. Create dense edge networks with feedback loops and parallel branches. Every node must earn its place with 300+ chars of substantive content."
   analyze: "Investigate the situation like a case. Present findings with evidence, recommend specific actions, and explain your reasoning."
   execute: "Write comprehensive content worthy of a master detective's report. Leave no stone unturned."
   ```

4. **File: `src/lib/prompts.ts`** — In `compilePersonalityPrompt()`, inject the relevant goal:
   ```typescript
   const goalBlock = agent.taskGoals?.[layers.generation.context.taskType]
     ? `\nCURRENT GOAL: ${agent.taskGoals[layers.generation.context.taskType]}`
     : '';
   ```
   Add `goalBlock` to the compiled prompt string.

5. **File: `src/lib/types.ts`** — Add `taskType` to `GenerationContext` if not already present.

**Acceptance criteria:**
- [ ] Rowan uses `policy` category in compliance-related workflows (finance-audit-readiness, government-procurement)
- [ ] Rowan uses `review` category in workflows with approval gates (healthcare-patient-intake)
- [ ] Eval scores for Rowan category tests improve from 93-96% to 100%
- [ ] No regression in Poirot scores
- [ ] Goals visible in console log of compiled system prompt

---

### 3. Node Hover Tooltip with Content Preview
**Status:** [ ] Not started
**Version target:** 1.3.0
**Inspiration:** Rivet's live data inspection, ComfyUI's preview-at-every-node
**Complexity:** Small-Medium (1-2 hours)

**Problem:** LifecycleNode is visually dense (status, execution, sections, content preview in 210-270px). Users must click into the detail panel to see full descriptions and content. On a canvas with 7-10 nodes, this requires 7-10 clicks just to understand the workflow.

**Implementation:**

1. **File: `src/components/LifecycleNode.tsx`** — Add hover tooltip:
   - On `mouseEnter` with 500ms delay, show a tooltip div positioned above/below the node
   - Tooltip contains:
     - Full description (not truncated)
     - Content preview (first 200 chars with "..." if longer)
     - Category badge + status badge
     - Edge connections: "3 incoming, 2 outgoing"
     - If execution result exists: first 100 chars of result
   - On `mouseLeave`, hide tooltip
   - Use `position: fixed` with pointer-events-none to avoid interfering with drag
   - Use Framer Motion for fade-in (opacity 0→1, y: 4→0, duration 0.15s)

2. **File: `src/components/LifecycleNode.tsx`** — Tooltip positioning:
   ```typescript
   const [tooltipPos, setTooltipPos] = useState<{x: number, y: number} | null>(null);
   const hoverTimeout = useRef<NodeJS.Timeout>();

   const onMouseEnter = (e: React.MouseEvent) => {
     hoverTimeout.current = setTimeout(() => {
       setTooltipPos({ x: e.clientX, y: e.clientY - 10 });
     }, 500);
   };
   const onMouseLeave = () => {
     clearTimeout(hoverTimeout.current);
     setTooltipPos(null);
   };
   ```

3. **Styling:**
   - `max-w-sm bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-lg p-3 shadow-xl`
   - Text: `text-[11px] text-white/80`
   - Category badge uses existing `getNodeColors()` system
   - Z-index: 50 (above canvas, below modals)

**Acceptance criteria:**
- [ ] Hovering a node for 500ms shows tooltip with description + content preview
- [ ] Tooltip disappears immediately on mouseLeave
- [ ] Tooltip doesn't interfere with node dragging or selection
- [ ] Tooltip positions correctly even at canvas edges (no overflow)
- [ ] Works with all 13 node categories
- [ ] No performance impact with 10+ nodes on canvas

---

### 4. Conversation History Virtual Scrolling
**Status:** [ ] Not started
**Version target:** 1.4.0
**Inspiration:** All chat-based tools (Dify, n8n) use virtualized lists for performance
**Complexity:** Medium (2 hours)

**Problem:** CIDPanel.tsx renders all messages in a flat list with no virtualization. After 50+ messages, scroll performance degrades. The component is already 1,423 lines.

**Implementation:**

1. **File: `src/components/CIDPanel.tsx`** — Replace flat message list with `react-window` or `@tanstack/virtual`:
   - Install: `npm install @tanstack/react-virtual`
   - Wrap message container with `useVirtualizer`:
     ```typescript
     const virtualizer = useVirtualizer({
       count: messages.length,
       getScrollElement: () => scrollRef.current,
       estimateSize: () => 80, // average message height
       overscan: 5,
     });
     ```
   - Render only visible messages + 5 overscan items
   - Maintain scroll-to-bottom behavior for new messages

2. **Keep auto-scroll:**
   - `virtualizer.scrollToIndex(messages.length - 1)` on new message

**Acceptance criteria:**
- [ ] 100+ messages scroll smoothly (60fps)
- [ ] New messages auto-scroll to bottom
- [ ] Pinned messages still accessible
- [ ] Copy/delete actions work on virtualized items
- [ ] No visual difference from current behavior for <50 messages

---

### 5. Workflow Export as Shareable JSON/YAML
**Status:** [ ] Not started
**Version target:** 1.5.0
**Inspiration:** Rivet's YAML graphs (git-diffable), ComfyUI's JSON workflow sharing
**Complexity:** Small (1 hour)

**Problem:** Workflows are stored in Zustand/localStorage as internal state. There's no way to share a workflow with someone else, version it in git, or import one from a template.

**Implementation:**

1. **File: `src/store/useStore.ts`** — Add `exportWorkflow()` and `importWorkflow()` actions:
   ```typescript
   exportWorkflow: () => {
     const { nodes, edges, projectName } = get();
     const workflow = {
       version: '1.0',
       name: projectName,
       exportedAt: new Date().toISOString(),
       nodes: nodes.map(n => ({
         id: n.id, label: n.data.label, category: n.data.category,
         description: n.data.description, content: n.data.content,
         sections: n.data.sections, position: n.position,
       })),
       edges: edges.map(e => ({
         source: e.source, target: e.target, label: e.label,
       })),
     };
     return JSON.stringify(workflow, null, 2);
   },
   importWorkflow: (json: string) => { /* parse and hydrate */ },
   ```

2. **File: `src/components/TopBar.tsx`** — Add Export button next to existing import/export:
   - Download as `.lifecycle.json` file
   - Copy to clipboard option

3. **Optional YAML support:**
   - Install `yaml` package
   - Offer `.lifecycle.yaml` as alternative export format
   - YAML diffs much better in git PRs

**Acceptance criteria:**
- [ ] Export produces valid JSON with all node content
- [ ] Import reconstructs the full workflow on canvas
- [ ] Round-trip: export → import produces identical workflow
- [ ] File size reasonable (<100KB for 10-node workflow)
- [ ] No secrets/API keys in exported file

---

### 6. Partial Branch Execution
**Status:** [ ] Not started
**Version target:** 1.6.0
**Inspiration:** ComfyUI's "click play on any output node to execute only that branch"
**Complexity:** Medium (2-3 hours)

**Problem:** `executeWorkflow()` in `useStore.ts` runs ALL nodes in topological order. For a 9-node disaster-recovery workflow, testing just the "failover" branch requires executing all preceding nodes (threat assessment, backup verification, etc.). ComfyUI lets users click play on any single node and only its upstream dependencies execute.

**Implementation:**

1. **File: `src/store/useStore.ts`** — Add `executeBranch(nodeId: string)` action:
   - Walk backward from `nodeId` via edges to collect all upstream dependencies
   - Use `topoSort()` from `src/lib/graph.ts` on just that subgraph
   - Execute only those nodes in order, skipping already-executed ones (status: `success`)
   - Reuse existing `executeNode()` for each step

2. **File: `src/lib/graph.ts`** — Add `getUpstreamSubgraph(nodeId, nodes, edges)`:
   ```typescript
   export function getUpstreamSubgraph(targetId: string, nodes: Node[], edges: Edge[]): { nodes: Node[], edges: Edge[] } {
     const visited = new Set<string>();
     const queue = [targetId];
     while (queue.length > 0) {
       const id = queue.shift()!;
       if (visited.has(id)) continue;
       visited.add(id);
       edges.filter(e => e.target === id).forEach(e => queue.push(e.source));
     }
     return {
       nodes: nodes.filter(n => visited.has(n.id)),
       edges: edges.filter(e => visited.has(e.source) && visited.has(e.target)),
     };
   }
   ```

3. **File: `src/components/LifecycleNode.tsx`** — Add "Run Branch" button (Play icon) in node footer, visible when node has upstream dependencies. Shows only on hover.

**Acceptance criteria:**
- [ ] Clicking "Run Branch" on a mid-workflow node only executes its upstream chain
- [ ] Already-executed upstream nodes are skipped (cache hit)
- [ ] Execution status indicators update correctly for partial runs
- [ ] Full `executeWorkflow()` still works as before (no regression)
- [ ] Works with parallel branches (both parents must execute before convergence node)

---

### 7. Context-Aware Edge Label Validation
**Status:** [ ] Not started
**Version target:** 1.7.0
**Inspiration:** LangGraph's compile-then-validate, Dify's structured variable passing
**Complexity:** Small-Medium (1-2 hours)

**Problem:** `inferEdgeLabel()` in `src/lib/graph.ts` uses a static 24-pair category→label lookup. But the LLM-generated edges often use wrong labels — e.g. "informs" for sequential critical-path steps (the prompt warns against this but it still happens). In Round 108, Rowan used generic "connects" labels where "validates" or "monitors" was semantically correct. The static lookup can't reason about node content.

**Implementation:**

1. **File: `src/app/api/cid/route.ts`** — After workflow JSON is parsed (line ~300+), add a `validateEdgeLabels()` pass:
   ```typescript
   function validateEdgeLabels(nodes: ParsedNode[], edges: ParsedEdge[]): ParsedEdge[] {
     return edges.map(e => {
       const src = nodes[e.from];
       const tgt = nodes[e.to];
       // Rule 1: "informs" between sequential steps → upgrade to "drives" or "feeds"
       if (e.label === 'informs' && !isOptionalConnection(src, tgt)) {
         e.label = inferStrongerLabel(src.category, tgt.category);
       }
       // Rule 2: review → anything should use "approves", not "drives"
       if (src.category === 'review' && e.label === 'drives') e.label = 'approves';
       // Rule 3: test → previous step should use "validates", not "connects"
       if (src.category === 'test' && e.label === 'connects') e.label = 'validates';
       // Rule 4: policy → anything should use "monitors" or "blocks"
       if (src.category === 'policy' && !['monitors', 'blocks'].includes(e.label)) e.label = 'monitors';
       // Rule 5: backward edges (feedback loops) should use "refines"
       if (e.from > e.to && e.label !== 'refines') e.label = 'refines';
       return e;
     });
   }
   ```

2. **File: `src/lib/graph.ts`** — Expand `EDGE_INFERENCE` map from 24 to ~35 pairs, covering missing combos like `test→action` ("validates"), `policy→review` ("monitors"), `dependency→action` ("requires").

**Acceptance criteria:**
- [ ] No "informs" labels on critical-path sequential edges after validation
- [ ] review→X always uses "approves" (not "drives" or "connects")
- [ ] test→X always uses "validates"
- [ ] policy→X always uses "monitors" or "blocks"
- [ ] Feedback loop edges use "refines"
- [ ] Eval scores maintain >= 98%

---

### 8. Interview Answers Feed Into Habit Layer
**Status:** [ ] Not started
**Version target:** 1.8.0
**Inspiration:** CrewAI's agent memory + context accumulation, AutoGen's conversation memory
**Complexity:** Medium (2 hours)

**Problem:** `buildEnrichedPrompt()` in `src/lib/agents.ts` does crude string concatenation — appending "with marketing plan and pitch deck" to the user's prompt. The interview answers are used once and discarded. They never feed back into the Habit Layer (Layer 3), so the agent can't remember that this user always picks "quality" over "speed" or always works on "enterprise" scale projects. CrewAI and AutoGen both accumulate agent memory from interactions.

**Implementation:**

1. **File: `src/lib/agents.ts`** — Add `extractHabitSignals(answers, questions)` function:
   ```typescript
   export function extractHabitSignals(answers: Record<string, string>, questions: InterviewQuestion[]): ReflectionAction[] {
     const actions: ReflectionAction[] = [];
     for (const q of questions) {
       const answerKey = `q${questions.indexOf(q)}`;
       const answerId = answers[answerKey];
       if (!answerId) continue;
       // Scale preference → workflow complexity preference
       if (q.key === 'scale' && answerId === 'enterprise') {
         actions.push({ type: 'add-preference', description: 'User works at enterprise scale', confidence: 0.9, data: { pattern: 'review-gates', frequencyIncrease: 2, isNew: false } });
       }
       // Priority preference → communication style
       if (q.key === 'priority' && answerId === 'speed') {
         actions.push({ type: 'update-comm-style', description: 'User prioritizes speed', confidence: 0.8, data: { verbosity: -0.1 } });
       }
       // Domain signals from launch/research/pipeline answers
       if (q.key === 'launch' || q.key === 'research' || q.key === 'pipeline') {
         actions.push({ type: 'add-domain', description: `Domain signal from interview: ${answerId}`, confidence: 0.7, data: { domain: answerId, initialDepth: 0.15 } });
       }
     }
     return actions;
   }
   ```

2. **File: `src/store/useStore.ts`** — In `sendMessage()` after interview completion, call `extractHabitSignals()` and feed results into `applyReflectionActions()`:
   ```typescript
   // After buildEnrichedPrompt:
   const habitSignals = extractHabitSignals(interviewAnswers, interviewQuestions);
   if (habitSignals.length > 0) {
     const { habits, drives } = applyReflectionActions(habitSignals, currentHabits, currentDrives);
     // update store layers
   }
   ```

3. **File: `src/lib/prompts.ts`** — No changes needed — `compileLearnedPatterns()` already renders habit data into the system prompt. The interview signals will automatically appear in future prompts.

**Acceptance criteria:**
- [ ] After 3 interviews where user picks "enterprise" + "compliance", Rowan's prompt includes "User prefers: review-gates (3x)"
- [ ] Priority = "speed" across sessions reduces verbosity in compiled prompt
- [ ] Domain signals from interview (e.g. "B2B") appear in habit layer
- [ ] Habits persist across sessions via localStorage
- [ ] No regression in non-interview workflow generation

---

### 9. Edge Hover Data Inspection Tooltip
**Status:** [ ] Not started
**Version target:** 1.9.0
**Inspiration:** Rivet's wire-hover payload inspection — the gold standard for visual debugging
**Complexity:** Medium (2 hours)

**Problem:** Edges in the canvas are thin lines with small labels. Users can't see what data flows between nodes without clicking into both source and target detail panels. Rivet shows a rich tooltip when hovering any wire: the exact data payload, timing, and status. For Lifecycle, this means showing the edge relationship context, source node output, and target node input expectations.

**Implementation:**

1. **File: `src/components/Canvas.tsx`** — Add edge hover handler using React Flow's `onEdgeMouseEnter`/`onEdgeMouseLeave`:
   ```typescript
   const [hoveredEdge, setHoveredEdge] = useState<{ edge: Edge; position: { x: number; y: number } } | null>(null);
   const edgeHoverTimeout = useRef<NodeJS.Timeout>();

   const onEdgeMouseEnter = useCallback((event: React.MouseEvent, edge: Edge) => {
     edgeHoverTimeout.current = setTimeout(() => {
       setHoveredEdge({ edge, position: { x: event.clientX, y: event.clientY } });
     }, 400);
   }, []);
   const onEdgeMouseLeave = useCallback(() => {
     clearTimeout(edgeHoverTimeout.current);
     setHoveredEdge(null);
   }, []);
   ```

2. **File: `src/components/EdgeTooltip.tsx`** (NEW, ~80 lines) — Render a floating tooltip:
   - Edge label with colored badge (using `EDGE_LABEL_COLORS`)
   - Source node: label, category, status, first 100 chars of content/result
   - Target node: label, category, status, description
   - If source has execution result: "Output: {first 150 chars}" with green indicator
   - If source is stale: yellow warning "Source data may be outdated"
   - Framer Motion fade-in (opacity 0→1, scale 0.95→1, 150ms)

3. **Styling:** `max-w-md bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-lg p-3 shadow-2xl z-50`

**Acceptance criteria:**
- [ ] Hovering an edge for 400ms shows tooltip with source/target context
- [ ] Tooltip disappears immediately on mouseLeave
- [ ] Tooltip shows execution result preview when available
- [ ] Stale source nodes show warning in tooltip
- [ ] Tooltip doesn't interfere with edge selection or node dragging
- [ ] Works correctly when zoomed in/out on canvas

---

### 10. Execution Progress Timeline Panel
**Status:** [ ] Not started
**Version target:** 1.10.0
**Inspiration:** Rivet's Gantt-style Trace Timeline + cost estimator, ComfyUI's queue progress
**Complexity:** Medium-Large (3-4 hours)

**Problem:** During `executeWorkflow()`, the only feedback is per-node status changes (generating → success/error) and a final CID message. For a 9-node workflow taking 2+ minutes, the user has no sense of progress, estimated time remaining, or which nodes ran in parallel vs. sequentially. Rivet's trace timeline shows a Gantt chart of every node's execution with timing.

**Implementation:**

1. **File: `src/store/useStore.ts`** — Add execution timeline tracking:
   ```typescript
   // New state:
   executionTimeline: Array<{
     nodeId: string;
     label: string;
     category: string;
     startedAt: number;
     completedAt: number | null;
     status: 'pending' | 'running' | 'success' | 'error';
     durationMs: number | null;
   }>;
   isExecutingWorkflow: boolean;
   executionStartedAt: number | null;
   ```
   - In `executeNode()`: push entry with `startedAt`, update `completedAt` and `durationMs` on completion
   - In `executeWorkflow()`: set `isExecutingWorkflow: true`, initialize timeline, clear on completion

2. **File: `src/components/ExecutionTimeline.tsx`** (NEW, ~200 lines):
   - Slide-up panel from bottom (200px height) that appears during workflow execution
   - Gantt-style horizontal bars: each node gets a row, bar width = duration, color = category color
   - Running nodes: animated pulse bar (Framer Motion)
   - Completed nodes: solid bar with duration label ("2.3s")
   - Failed nodes: red bar with error icon
   - Header: "Executing... 4/9 nodes | Elapsed: 45s | Est. remaining: ~60s"
   - Estimate based on average node duration × remaining nodes
   - After completion: panel stays visible for 10s showing final summary, then auto-hides

3. **File: `src/components/Canvas.tsx`** — Render `ExecutionTimeline` with AnimatePresence when `isExecutingWorkflow` is true.

**Acceptance criteria:**
- [ ] Timeline panel appears when `executeWorkflow()` starts
- [ ] Each node shows as a horizontal bar with real-time progress
- [ ] Running nodes have animated pulse indicator
- [ ] Duration labels update in real-time
- [ ] Estimated remaining time shown in header
- [ ] Panel auto-hides 10s after completion
- [ ] Panel doesn't overlap with CIDPanel or ArtifactPanel
- [ ] Works for partial branch execution (item 6) too

---

## Completed

_(Move items here after implementation)_
