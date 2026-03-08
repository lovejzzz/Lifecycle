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

### 11. Plan-then-Execute: Preview Before Generation
**Status:** [ ] Not started
**Version target:** 1.11.0
**Inspiration:** v0.dev's agentic plan-then-execute pattern, Lovable's multi-step reasoning
**Complexity:** Medium (2-3 hours)

**Problem:** When a user says "Build a content pipeline with SEO optimization", CID immediately generates 7-10 nodes and presents the full workflow. If the user wanted something different (e.g. "I meant video content, not blog"), they have to modify or rebuild entirely. v0.dev solves this by showing a plan first ("I'll create 4 components: Schema, API, UI, Wiring") and letting the user approve/tweak before executing. This also reduces wasted LLM calls.

**Implementation:**

1. **File: `src/app/api/cid/route.ts`** — Add a `planMode` option. When `taskType === 'generate'` and plan mode is enabled:
   - First LLM call returns a lightweight plan (not full nodes):
     ```json
     { "message": "Here's my plan...", "plan": {
       "summary": "Content pipeline with 6 stages",
       "nodes": ["Content Intake (trigger)", "SEO Analysis (action)", "Editorial Review (review)", ...],
       "architecture": "Linear with feedback loop from Review → SEO Analysis",
       "estimated_edges": 8
     }}
     ```
   - Second call (after user approves) generates the full workflow with `planContext` injected

2. **File: `src/store/useStore.ts`** — Add plan state:
   ```typescript
   pendingPlan: { summary: string; nodes: string[]; architecture: string } | null;
   approvePlan: () => Promise<void>;  // sends "approved" and generates full workflow
   rejectPlan: (feedback: string) => Promise<void>;  // re-plans with user feedback
   ```

3. **File: `src/components/CIDPanel.tsx`** — Render plan as a styled card with "Approve" / "Modify" / "Reject" buttons. Show node list as chips with category colors.

4. **File: `src/lib/prompts.ts`** — Add `PLAN_SYSTEM_PROMPT` variant that asks for plan JSON instead of full workflow JSON. Keep it short (~50 tokens) to minimize latency.

**Acceptance criteria:**
- [ ] Build requests show a plan card in chat before generating
- [ ] User can approve (generates full workflow) or modify (re-plans with feedback)
- [ ] Plan → Generate round-trip adds <3s latency vs. direct generation
- [ ] Analyze/execute requests bypass planning (direct response)
- [ ] Plan cards display node names with category-colored badges

---

### 12. Ambient Context Tracking — Auto-Inject Recent Activity
**Status:** [ ] Not started
**Version target:** 1.12.0
**Inspiration:** Windsurf's "Flows" ambient context tracking, Cursor's real-time edit awareness
**Complexity:** Medium (2 hours)

**Problem:** When CID generates a workflow and the user then manually edits 3 nodes, CID doesn't know what changed. The user has to explain "I changed the review node to require 2 approvers." Windsurf tracks edits, terminal output, and navigation in real-time, so the AI already knows what happened. Currently, `serializeGraph()` in `src/lib/prompts.ts` sends graph state but not *what changed recently*.

**Implementation:**

1. **File: `src/store/useStore.ts`** — Add an activity ring buffer (last 20 actions):
   ```typescript
   recentActivity: Array<{
     type: 'node-edited' | 'node-added' | 'node-deleted' | 'edge-added' | 'edge-deleted' | 'execution-success' | 'execution-error' | 'mode-switched';
     label: string;
     detail?: string;  // e.g. "Changed category from action to review"
     timestamp: number;
   }>;
   ```
   - Push entries from `updateNodeData()`, `addNode()`, `deleteNode()`, `executeNode()` etc.
   - Cap at 20 entries, FIFO

2. **File: `src/lib/prompts.ts`** — In `serializeGraph()`, append a `RECENT ACTIVITY` block after the graph:
   ```typescript
   const activityBlock = recentActivity.length > 0
     ? `\nRECENT ACTIVITY (last ${recentActivity.length} actions):\n${recentActivity.slice(-10).map(a => `- ${relativeTime(a.timestamp)}: ${a.type} "${a.label}"${a.detail ? ` — ${a.detail}` : ''}`).join('\n')}`
     : '';
   ```

3. **File: `src/lib/prompts.ts`** — Pass `recentActivity` into `buildSystemPrompt()` as a new parameter.

**Acceptance criteria:**
- [ ] After editing a node, CID's next response references the edit without the user mentioning it
- [ ] After a failed execution, CID's next response acknowledges the failure and suggests fixes
- [ ] Activity ring buffer caps at 20 entries (no memory leak)
- [ ] Activity timestamps shown as relative ("2m ago", "just now")
- [ ] No performance impact — activity tracking is synchronous state updates only

---

### 13. Per-Node Model Override for Cost Optimization
**Status:** [ ] Not started
**Version target:** 1.13.0
**Inspiration:** Google ADK's per-agent model selection, Dify's pluggable agent strategies
**Complexity:** Small-Medium (1-2 hours)

**Problem:** `executeWorkflow()` sends every node to the same model (currently deepseek-reasoner via `cidAIModel`). A 9-node disaster-recovery workflow costs the same whether the node is a simple trigger passthrough or a complex policy analysis. Google ADK lets each sub-agent use a different model. For Lifecycle, simple nodes (trigger, input, dependency) should use fast/cheap models, while complex nodes (cid, policy, review) should use the best available.

**Implementation:**

1. **File: `src/lib/types.ts`** — Add `aiModel?: string` to `NodeData` (already exists as field but unused by execution):
   - The field exists but `executeNode()` always uses the global `cidAIModel`

2. **File: `src/store/useStore.ts`** — In `executeNode()` (line ~1207), use per-node model if set:
   ```typescript
   const model = d.aiModel || store.cidAIModel;
   // Pass model to /api/cid
   ```

3. **File: `src/components/NodeDetailPanel.tsx`** — Add a model selector dropdown in the node detail view:
   - Only show for AI-callable categories (action, cid, review, test, policy, artifact)
   - Dropdown: "Default (project model)" | "deepseek/deepseek-reasoner" | "anthropic/claude-sonnet-4-20250514" | "openrouter/auto"
   - Store selection in `nodeData.aiModel`

4. **File: `src/app/api/cid/route.ts`** — Already accepts `model` parameter, no changes needed.

**Acceptance criteria:**
- [ ] Node detail panel shows model selector for AI-callable categories
- [ ] Setting a per-node model overrides the global model for that node's execution
- [ ] Nodes without per-node model use the global `cidAIModel` (backward compat)
- [ ] Model selector shows current selection clearly
- [ ] Cost savings visible in execution (simple nodes use fast model)

---

### 14. Token Usage and Cost Display
**Status:** [ ] Not started
**Version target:** 1.14.0
**Inspiration:** CrewAI's LLM call observability events, Rivet's live cost estimator
**Complexity:** Small-Medium (1-2 hours)

**Problem:** Users have no visibility into how many tokens CID consumes or what each request costs. After a 9-node workflow execution, there's no indication that it used 50K tokens at $0.12. CrewAI emits structured events with token counts and latency per call. Rivet shows a running cost estimate. For a tool targeting real teams, cost transparency is essential.

**Implementation:**

1. **File: `src/app/api/cid/route.ts`** — Extract token usage from LLM response and include in API response:
   ```typescript
   // DeepSeek and Anthropic both return usage in response
   const usage = {
     promptTokens: response.usage?.prompt_tokens || 0,
     completionTokens: response.usage?.completion_tokens || 0,
     totalTokens: response.usage?.total_tokens || 0,
     model: resolvedModel,
     durationMs: Date.now() - startTime,
   };
   return NextResponse.json({ ...parsed, _usage: usage });
   ```

2. **File: `src/store/useStore.ts`** — Track cumulative session usage:
   ```typescript
   sessionTokenUsage: {
     totalPromptTokens: number;
     totalCompletionTokens: number;
     totalCalls: number;
     totalDurationMs: number;
   };
   ```
   - Update after each `/api/cid` response
   - Per-node usage stored in `nodeData` for execution results

3. **File: `src/components/CIDPanel.tsx`** — Add a subtle token counter in the footer bar:
   - Format: "42K tokens · 12 calls · ~$0.08" (estimate based on model pricing)
   - Click to expand: breakdown by node, per-call latency
   - Style: `text-[10px] text-white/30` — unobtrusive, information-on-demand

**Acceptance criteria:**
- [ ] Token count visible in CIDPanel footer after first LLM call
- [ ] Cumulative count updates with each request
- [ ] Per-node token usage visible in node detail panel after execution
- [ ] Cost estimate uses approximate model pricing (configurable)
- [ ] Counter resets on session clear

---

### 15. Keyboard-Driven Canvas with Command Palette
**Status:** [ ] Not started
**Version target:** 1.15.0
**Inspiration:** Cursor's Cmd+K command palette, VS Code's keyboard-first design, Figma's keyboard shortcuts
**Complexity:** Medium (2-3 hours)

**Problem:** The canvas requires mouse interaction for everything — selecting nodes, opening panels, executing workflows, switching agents. Power users (and accessibility users) need keyboard shortcuts. Cursor proved that Cmd+K as a universal entry point dramatically speeds up workflows. Figma's keyboard shortcuts (R for rectangle, T for text) show how spatial tools can be keyboard-driven.

**Implementation:**

1. **File: `src/components/Canvas.tsx`** — Add a `useEffect` for global keyboard shortcuts:
   ```typescript
   useEffect(() => {
     const handler = (e: KeyboardEvent) => {
       // Cmd+K: Focus CID chat input
       if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); focusCIDInput(); }
       // Cmd+Enter: Execute workflow
       if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); executeWorkflow(); }
       // Cmd+E: Toggle CID panel
       if ((e.metaKey || e.ctrlKey) && e.key === 'e') { e.preventDefault(); toggleCIDPanel(); }
       // Delete/Backspace: Delete selected node
       if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && !isEditing) { deleteNode(selectedNodeId); }
       // Tab: Cycle through nodes
       if (e.key === 'Tab' && !isEditing) { e.preventDefault(); cycleNodeSelection(e.shiftKey ? -1 : 1); }
       // 1-9: Switch agent (1=Rowan, 2=Poirot)
       if (e.key === '1' && e.altKey) setCIDMode('rowan');
       if (e.key === '2' && e.altKey) setCIDMode('poirot');
       // Escape: Deselect / close panels
       if (e.key === 'Escape') { deselectAll(); closePanels(); }
     };
     window.addEventListener('keydown', handler);
     return () => window.removeEventListener('keydown', handler);
   }, [selectedNodeId, isEditing]);
   ```

2. **File: `src/components/CommandPalette.tsx`** (NEW, ~150 lines):
   - Triggered by Cmd+P or typing `/` in CID chat
   - Searchable list of all actions: "Execute Workflow", "Add Review Node", "Switch to Poirot", "Export Workflow", "Run Branch", etc.
   - Filter as user types, Enter to execute
   - Style: centered overlay, `bg-zinc-900/95 backdrop-blur-lg`, max-h-80, overflow-y-auto
   - Framer Motion scale-in animation (0.95→1, 100ms)

3. **File: `src/components/Canvas.tsx`** — Add keyboard shortcut hints in bottom-right corner:
   - Small hint bar: "⌘K Chat · ⌘↵ Run · Tab Cycle · ⌘P Commands"
   - `text-[9px] text-white/20` — barely visible, disappears after 10s on first visit

**Acceptance criteria:**
- [ ] Cmd+K focuses CID chat input from anywhere
- [ ] Cmd+Enter executes the workflow
- [ ] Tab cycles through nodes, Shift+Tab reverses
- [ ] Delete/Backspace removes selected node
- [ ] Cmd+P opens command palette with searchable actions
- [ ] All shortcuts work without conflicting with text editing in CIDPanel
- [ ] Shortcuts hint visible on first visit, then fades

---

### 16. Semantic Edge Weighting with Data-Flow Type Annotations
**Status:** [ ] Not started
**Version target:** 1.16.0
**Inspiration:** Dify's structured variable passing between nodes with typed data (Variable Inspect panel shows exact payloads flowing through each wire), LangGraph's typed state channels where each edge carries a specific schema
**Complexity:** Medium (2-3 hours)

**Problem:** Edges in Lifecycle carry only a semantic label ("drives", "feeds", "validates") but no information about *what data* flows between nodes. When `executeWorkflow()` runs nodes in topological order (in `src/store/useStore.ts`), each node receives only the previous node's `executionResult` as a flat string. There is no typed data contract between connected nodes. This means a `test` node validating an `artifact` node receives raw text output rather than structured test criteria. In contrast, Dify's Variable Inspect panel shows exactly what variables flow through each wire, and LangGraph enforces typed state schemas on each edge. The result: Lifecycle's node execution produces generic content because nodes lack context about what their upstream dependencies actually produced.

**Implementation:**

1. **File: `src/lib/types.ts`** — Add `EdgeDataType` and extend edge metadata:
   ```typescript
   export type EdgeDataType = 'document' | 'structured-data' | 'approval-decision' | 'test-results' | 'configuration' | 'raw-text';

   // Add to NodeData:
   outputSchema?: { type: EdgeDataType; fields?: string[] };  // What this node produces
   inputExpectation?: { type: EdgeDataType; required?: string[] };  // What this node expects
   ```

2. **File: `src/store/useStore.ts`** — In `executeNode()` (~line 1207), build a typed upstream context instead of flat string concatenation:
   ```typescript
   // Collect upstream data with type annotations
   const upstreamData = incomingEdges.map(edge => {
     const sourceNode = nodes.find(n => n.id === edge.source);
     return {
       from: sourceNode?.data.label,
       relationship: edge.label,
       dataType: sourceNode?.data.outputSchema?.type || 'raw-text',
       content: sourceNode?.data.executionResult?.slice(0, 2000),
     };
   });
   ```
   Inject this as structured context into the node's execution prompt instead of the current flat `executionResult` string.

3. **File: `src/lib/prompts.ts`** — In `SHARED_CAPABILITIES` (line 14), add data-type awareness to the RESPONSE FORMAT. When the LLM generates workflow nodes, it should annotate each node with `outputSchema`:
   ```
   "outputSchema": { "type": "document", "fields": ["title", "sections", "metadata"] }
   ```

4. **File: `src/app/api/cid/route.ts`** — In the post-parse validation, auto-infer `outputSchema` from category when the LLM doesn't provide one:
   - `artifact` → `{ type: 'document' }`
   - `test` → `{ type: 'test-results' }`
   - `review` → `{ type: 'approval-decision' }`
   - `input`/`trigger` → `{ type: 'raw-text' }`
   - `policy` → `{ type: 'configuration' }`

**Acceptance criteria:**
- [ ] Nodes generated by CID include `outputSchema` type annotations
- [ ] `executeNode()` passes typed upstream context instead of flat strings
- [ ] Test nodes receive structured test criteria (not raw text) from upstream artifacts
- [ ] Review nodes receive structured approval context (what to review, criteria)
- [ ] Auto-inference fills missing schemas based on category (no LLM regression)
- [ ] Existing workflows without schemas continue to work (backward compatible)

---

### 17. Multi-Turn Refinement with Diff-Based Modification Feedback
**Status:** [ ] Not started
**Version target:** 1.17.0
**Inspiration:** n8n AI Workflow Builder's multi-turn conversation refinement (describe changes in plain English, see diff-style updates), CrewAI's iterative task refinement where agents re-examine and revise their own outputs
**Complexity:** Medium (2-3 hours)

**Problem:** When a user asks CID to modify a workflow ("make the review node require 2 approvers"), the `modifications` system in `src/lib/prompts.ts` (lines 77-96) works correctly, but the user gets no visual diff of what changed. They see the updated canvas but must mentally compare before/after states. n8n's AI Workflow Builder highlights what changed after each refinement turn. Additionally, the current `modifications` prompt in `SHARED_CAPABILITIES` doesn't give the LLM examples of *incremental* changes — it only shows the schema. The LLM often over-modifies (rebuilding 5 nodes when only 1 needed updating) because it lacks few-shot examples of minimal modifications.

**Implementation:**

1. **File: `src/lib/prompts.ts`** — Add few-shot modification examples to `SHARED_CAPABILITIES` after the modifications schema (line 96):
   ```
   MODIFICATION EXAMPLES (be surgical — change ONLY what the user asked for):
   User: "Make the review require 2 approvers"
   → update_nodes: [{ "label": "Review Gate", "changes": { "content": "...(updated to require 2 approvers)..." } }]
   (Do NOT touch other nodes. Do NOT rebuild edges. One targeted change.)

   User: "Add a slack notification after deployment"
   → add_nodes: [{ "label": "Slack Notification", "category": "action", ... }]
   → add_edges: [{ "from_label": "Deployment", "to_label": "Slack Notification", "label": "triggers" }]
   (Add the new node and ONE edge. Do NOT modify existing nodes.)
   ```

2. **File: `src/store/useStore.ts`** — After applying modifications, compute and store a diff summary:
   ```typescript
   modificationDiff: {
     nodesUpdated: string[];   // Labels of changed nodes
     nodesAdded: string[];     // Labels of new nodes
     nodesRemoved: string[];   // Labels of deleted nodes
     edgesAdded: number;
     edgesRemoved: number;
   } | null;
   ```
   Populate this in the `applyModifications()` logic (currently ~line 850+).

3. **File: `src/components/CIDPanel.tsx`** — When `modificationDiff` is set, render a compact diff summary card below CID's response message:
   - Green chips for added nodes: "+ Slack Notification"
   - Blue chips for updated nodes: "~ Review Gate"
   - Red chips for removed nodes: "- Old Step"
   - Edge count: "+2 edges, -1 edge"
   - Style: inline chips using category colors, `text-[10px]`, auto-dismiss after 15s
   - Use Framer Motion slideDown animation

4. **File: `src/components/Canvas.tsx`** — Briefly highlight modified nodes on canvas:
   - Nodes in `modificationDiff.nodesUpdated` get a 2-second pulse ring (blue glow)
   - Nodes in `modificationDiff.nodesAdded` get a 2-second pulse ring (green glow)
   - Use existing selection ring pattern but with temporary animation

**Acceptance criteria:**
- [ ] Modification requests change only the targeted nodes (fewer over-modifications)
- [ ] Diff summary card appears in CIDPanel after every modification
- [ ] Added nodes show green chip, updated nodes show blue chip, removed show red
- [ ] Modified/added nodes pulse briefly on the canvas
- [ ] Few-shot examples reduce modification scope (measure: average nodes changed per modification request)
- [ ] No regression in full workflow generation quality

---

### 18. Contextual Node Suggestion Sidebar
**Status:** [ ] Not started
**Version target:** 1.18.0
**Inspiration:** LangGraph's compile-time graph validation that detects missing node types, CrewAI's role-gap analysis that identifies when a required specialist agent is missing, Dify's node recommendation system that suggests next steps based on current graph state
**Complexity:** Medium (2-3 hours)

**Problem:** After CID generates a workflow, users often don't know what's missing. The `solve` command in `src/store/useStore.ts` detects orphan nodes and missing review gates, but it only runs on-demand and returns text advice. It doesn't proactively suggest "Your CI/CD workflow has no rollback step" or "This approval flow lacks a timeout/escalation policy." Competitors like LangGraph validate the full graph at compile time and surface missing patterns. The current `fallback` response in `src/lib/agents.ts` (Rowan: line 95, Poirot: line 222) gives status but not *structural improvement suggestions* based on domain knowledge.

**Implementation:**

1. **File: `src/lib/graph.ts`** — Add `suggestMissingNodes(nodes, edges)` function that returns domain-aware suggestions:
   ```typescript
   export interface NodeSuggestion {
     label: string;
     category: NodeCategory;
     reason: string;
     connectAfter: string;  // Label of node to connect after
     priority: 'high' | 'medium' | 'low';
   }

   export function suggestMissingNodes(nodes: Node<NodeData>[], edges: Edge[]): NodeSuggestion[] {
     const suggestions: NodeSuggestion[] = [];
     const categories = new Set(nodes.map(n => n.data.category));
     const labels = nodes.map(n => n.data.label.toLowerCase());

     // Pattern: Has deploy/release but no rollback
     if (labels.some(l => /deploy|release|ship|launch/.test(l)) && !labels.some(l => /rollback|revert|undo/.test(l))) {
       suggestions.push({ label: 'Rollback Plan', category: 'policy', reason: 'Deployment workflows need a rollback strategy', connectAfter: nodes.find(n => /deploy|release/i.test(n.data.label))?.data.label || '', priority: 'high' });
     }
     // Pattern: Has review but no escalation
     if (categories.has('review') && !labels.some(l => /escalat|timeout|sla/.test(l))) {
       suggestions.push({ label: 'Escalation Policy', category: 'policy', reason: 'Review gates should have timeout/escalation paths', connectAfter: nodes.find(n => n.data.category === 'review')?.data.label || '', priority: 'medium' });
     }
     // Pattern: Has test but no notification on failure
     if (categories.has('test') && !labels.some(l => /notify|alert|slack|email/.test(l))) {
       suggestions.push({ label: 'Failure Notification', category: 'action', reason: 'Test failures should trigger alerts', connectAfter: nodes.find(n => n.data.category === 'test')?.data.label || '', priority: 'medium' });
     }
     // Pattern: No monitoring/observability for action-heavy workflows
     if (nodes.filter(n => n.data.category === 'action').length >= 3 && !categories.has('cid') && !labels.some(l => /monitor|observe|track|log/.test(l))) {
       suggestions.push({ label: 'Monitoring & Logging', category: 'cid', reason: 'Action-heavy workflows need observability', connectAfter: nodes[nodes.length - 2]?.data.label || '', priority: 'low' });
     }
     return suggestions;
   }
   ```

2. **File: `src/components/Canvas.tsx`** — Add a collapsible suggestion pill strip along the bottom of the canvas (above the controls):
   - Compute suggestions via `suggestMissingNodes()` whenever `nodes` or `edges` change (debounced 1s)
   - Render as small pills: "[+] Rollback Plan (policy)" with priority-colored left border
   - Click a pill → CID auto-sends "add a [label] node after [connectAfter]" via `sendMessage()`
   - Dismiss individual suggestions with X button
   - Collapse all with a toggle: "3 suggestions" / expanded list
   - Style: `bg-zinc-900/90 backdrop-blur-sm border border-white/[0.06] rounded-lg` strip, pills with `text-[10px]`
   - Use Framer Motion for slide-up appearance, staggered pill entry

3. **File: `src/store/useStore.ts`** — Add `dismissedSuggestions: Set<string>` to prevent re-showing dismissed suggestions within a session.

**Acceptance criteria:**
- [ ] After generating a deploy workflow, "Rollback Plan" suggestion appears
- [ ] After generating a review workflow, "Escalation Policy" suggestion appears
- [ ] Clicking a suggestion pill triggers CID to add the suggested node
- [ ] Dismissed suggestions don't reappear in the same session
- [ ] Suggestions update when nodes/edges change (debounced, no flicker)
- [ ] Suggestions strip doesn't overlap with existing UI elements (CIDPanel, controls)

---

### 19. Streaming Chat Responses with Typewriter Effect
**Status:** [ ] Not started
**Version target:** 1.19.0
**Inspiration:** Dify's real-time streaming chat (tokens appear as generated, matching ChatGPT's UX), n8n's streaming AI responses in their chat interface
**Complexity:** Medium-Large (3-4 hours)

**Problem:** CID's responses appear all at once after the full LLM call completes. For complex advice responses or large workflow generations, users stare at "Processing..." for 5-15 seconds with no feedback. Dify and ChatGPT stream tokens in real-time, creating a sense of responsiveness even when the total response time is the same. The current flow in `src/store/useStore.ts` `sendMessage()` does `const res = await fetch('/api/cid', ...)` and waits for the complete JSON response. The API route in `src/app/api/cid/route.ts` also returns the full response as a single JSON payload.

**Implementation:**

1. **File: `src/app/api/cid/route.ts`** — Add a streaming endpoint variant. When the request includes `stream: true`:
   - Use the LLM provider's streaming API (DeepSeek and Anthropic both support streaming)
   - Buffer the JSON response and parse it progressively
   - For the `message` field: stream tokens as Server-Sent Events (SSE) using `ReadableStream`
   - For the `workflow`/`modifications` fields: send as a single final SSE event once the full JSON is parsed
   ```typescript
   if (body.stream) {
     const stream = new ReadableStream({
       async start(controller) {
         const encoder = new TextEncoder();
         // Stream message tokens
         for await (const chunk of llmStream) {
           controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
         }
         // Send final structured data
         controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', workflow, modifications })}\n\n`));
         controller.close();
       }
     });
     return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
   }
   ```

2. **File: `src/store/useStore.ts`** — In `sendMessage()`, use `EventSource` or `fetch` with `ReadableStream` reader:
   ```typescript
   // Instead of: const res = await fetch(...)
   const res = await fetch('/api/cid', { method: 'POST', body: JSON.stringify({ ...payload, stream: true }) });
   const reader = res.body!.getReader();
   const decoder = new TextDecoder();
   let messageBuffer = '';
   while (true) {
     const { done, value } = await reader.read();
     if (done) break;
     const text = decoder.decode(value);
     // Parse SSE events, accumulate message tokens
     messageBuffer += extractTokenContent(text);
     // Update the in-progress message in store
     set({ streamingMessage: messageBuffer });
   }
   ```

3. **File: `src/components/CIDPanel.tsx`** — Render `streamingMessage` as the current CID message while streaming is in progress:
   - Show tokens as they arrive with a blinking cursor at the end
   - Cursor: `inline-block w-[2px] h-[14px] bg-current animate-pulse ml-0.5`
   - Once streaming completes, replace with the final message and process workflow/modifications
   - The "Processing..." / "Assembling..." label changes to "Responding..." during streaming

4. **File: `src/store/useStore.ts`** — Add streaming state:
   ```typescript
   streamingMessage: string | null;  // Currently streaming text (null = not streaming)
   isStreaming: boolean;
   ```

**Acceptance criteria:**
- [ ] CID responses appear token-by-token in the chat panel
- [ ] Blinking cursor visible at the end of streaming text
- [ ] Workflow/modification data processes correctly after stream completes
- [ ] Streaming works with all three providers (DeepSeek, Anthropic, OpenRouter)
- [ ] Non-streaming fallback works if `stream: true` fails
- [ ] No visual flicker or layout shift during streaming
- [ ] Perceived response time improves (first token visible in <1s for most models)

---

### 20. Canvas Minimap with Live Execution Heat Overlay
**Status:** [ ] Not started
**Version target:** 1.20.0
**Inspiration:** ComfyUI's queue progress visualization on the canvas (nodes glow when executing), Rivet's trace timeline combined with spatial awareness, Figma's minimap with selection indicators
**Complexity:** Medium (2-3 hours)

**Problem:** The React Flow `<MiniMap>` in `src/components/Canvas.tsx` renders all nodes as identical gray rectangles. During workflow execution, users must pan around the full canvas to see which nodes are running, completed, or failed. ComfyUI colors executing nodes on both the main canvas AND the minimap, giving instant spatial awareness. With 7-10 nodes spread across a canvas, the minimap should communicate node status, category, and execution state at a glance. Additionally, Lifecycle's current minimap styles in `src/app/globals.css` (lines 83-87) use the default React Flow appearance with no category differentiation.

**Implementation:**

1. **File: `src/components/Canvas.tsx`** — Replace the default `<MiniMap>` `nodeColor` prop with a dynamic color function:
   ```typescript
   const minimapNodeColor = useCallback((node: Node<NodeData>) => {
     const d = node.data;
     // Execution state takes priority
     if (d.executionStatus === 'running') return '#fbbf24';  // amber pulse
     if (d.executionStatus === 'success') return '#22c55e';  // green
     if (d.executionStatus === 'error') return '#ef4444';    // red
     // Status-based coloring
     if (d.status === 'stale') return '#f59e0b';
     if (d.status === 'reviewing') return '#f43f5e';
     // Category-based coloring (use getNodeColors)
     const colors = getNodeColors(d.category);
     return colors.primary;
   }, []);
   ```
   Pass this to `<MiniMap nodeColor={minimapNodeColor} />`.

2. **File: `src/components/Canvas.tsx`** — Add a `nodeStrokeColor` callback for execution heat:
   ```typescript
   const minimapNodeStroke = useCallback((node: Node<NodeData>) => {
     if (node.data.executionStatus === 'running') return '#fbbf24';
     if (node.data.executionStatus === 'error') return '#ef4444';
     return 'transparent';
   }, []);
   ```
   This gives running nodes a visible stroke/border in the minimap.

3. **File: `src/app/globals.css`** — Add minimap enhancement styles:
   ```css
   /* Minimap execution heat animation */
   .react-flow__minimap-node[data-executing="true"] {
     animation: minimap-pulse 1.5s ease-in-out infinite;
   }

   @keyframes minimap-pulse {
     0%, 100% { opacity: 0.8; }
     50% { opacity: 1; filter: drop-shadow(0 0 3px currentColor); }
   }

   /* Minimap category differentiation */
   .react-flow__minimap {
     border: 1px solid rgba(255, 255, 255, 0.08) !important;
     background: rgba(8, 8, 13, 0.95) !important;
   }
   ```

4. **File: `src/components/Canvas.tsx`** — Add a minimap legend overlay (small, bottom-right of minimap):
   - 4 dots showing: green = complete, amber = running, red = error, gray = pending
   - Only visible during workflow execution (`isExecutingWorkflow`)
   - Style: `absolute bottom-1 right-1 flex gap-1 items-center text-[8px] text-white/30`
   - Framer Motion fade-in/out tied to execution state

**Acceptance criteria:**
- [ ] Minimap nodes are colored by category (not all gray)
- [ ] During execution, running nodes show amber, completed show green, failed show red
- [ ] Node colors update in real-time as execution progresses
- [ ] Minimap legend appears during workflow execution showing color meanings
- [ ] Stale nodes show amber tint in minimap even outside execution
- [ ] No performance impact — minimap color callbacks are memoized
- [ ] Works correctly with 10+ nodes without visual clutter

---

### 21. Self-Editing Persistent Memory with Core/Archival Tiers
**Status:** [ ] Not started
**Version target:** 1.21.0
**Inspiration:** Letta/MemGPT's two-tier memory architecture — core memory (always in-context, like RAM) vs. archival memory (stored externally, like disk). Agents actively self-edit their own memory blocks using tool calls, deciding what to promote/demote. See [Letta docs](https://docs.letta.com/concepts/memgpt/) and [Letta memory management](https://docs.letta.com/advanced/memory-management/). Also inspired by CrewAI's short-term/long-term/entity memory split ([CrewAI 2025 review](https://latenode.com/blog/ai-frameworks-technical-infrastructure/crewai-framework/crewai-framework-2025-complete-review-of-the-open-source-multi-agent-ai-platform)).
**Complexity:** Medium-Large (3-4 hours)

**Problem:** Lifecycle's Habit Layer (`src/lib/reflection.ts`, lines 334-498) evolves through passive observation — `reflectOnInteraction()` detects domain signals, preferences, and communication feedback. But the agent never *actively decides* what to remember. It cannot say "This user's deployment always targets AWS ECS — I should remember that" and store it as a persistent fact. Letta's core innovation is that agents self-edit their memory using explicit tool calls (`core_memory_append`, `core_memory_replace`, `archival_memory_insert`, `archival_memory_search`). CrewAI similarly separates short-term (in-conversation) from long-term (cross-session) memory with entity extraction. Lifecycle has no equivalent: the `HabitLayer` in `src/lib/types.ts` stores domain expertise and workflow preferences, but these are coarse statistical signals, not specific factual memories like "user's company uses Kubernetes on GCP" or "user prefers Tailwind over styled-components."

**Implementation:**

1. **File: `src/lib/types.ts`** — Add a `MemoryStore` type alongside the existing `HabitLayer`:
   ```typescript
   export interface MemoryEntry {
     id: string;
     tier: 'core' | 'archival';
     content: string;          // The fact/preference/context
     category: 'user-pref' | 'project-fact' | 'domain-knowledge' | 'workflow-pattern';
     createdAt: number;
     lastAccessedAt: number;
     accessCount: number;
     source: 'agent-extracted' | 'user-stated' | 'reflection-inferred';
   }

   export interface MemoryStore {
     coreMemory: MemoryEntry[];     // Always injected into system prompt (max 10)
     archivalMemory: MemoryEntry[]; // Searchable, retrieved on demand (max 100)
   }
   ```

2. **File: `src/lib/prompts.ts`** — In `buildSystemPrompt()` (line 382), inject core memory entries after the personality block and before the graph serialization:
   ```typescript
   const coreMemoryBlock = memoryStore?.coreMemory.length
     ? `\nCORE MEMORY (always available — facts you've learned about this user):\n${memoryStore.coreMemory.map(m => `- [${m.category}] ${m.content}`).join('\n')}`
     : '';
   ```
   Also add a `MEMORY TOOLS` section to `SHARED_CAPABILITIES` (after line 96) that tells the LLM it can return memory operations:
   ```
   MEMORY OPERATIONS (optional — include when you learn something worth remembering):
   "memory_ops": [
     { "action": "save", "tier": "core", "content": "User deploys to AWS ECS", "category": "project-fact" },
     { "action": "search", "query": "deployment preferences" },
     { "action": "promote", "id": "mem-123" },  // archival → core
     { "action": "forget", "id": "mem-456" }
   ]
   ```

3. **File: `src/store/useStore.ts`** — Add `memoryStore` to Zustand state and process `memory_ops` from CID responses:
   - After parsing the LLM response JSON, check for `memory_ops` array
   - `save`: Create a new `MemoryEntry`, insert into the appropriate tier
   - `search`: Fuzzy-match against archival memory entries, inject matches into next prompt
   - `promote`: Move entry from archival to core (if core < 10 entries; otherwise demote least-accessed core entry to archival)
   - `forget`: Remove entry entirely
   - Persist `memoryStore` to localStorage alongside existing habit/reflection data

4. **File: `src/lib/reflection.ts`** — In `reflectOnInteraction()` (line 334), add a new reflection action type `'extract-memory'` that fires when the user explicitly states a preference or fact:
   ```typescript
   // Detect explicit user statements worth memorizing
   if (/\b(we use|we always|our team|my company|I prefer|we deploy to|our stack)\b/i.test(lower)) {
     actions.push({
       type: 'extract-memory',
       description: `User stated a fact worth remembering`,
       confidence: 0.85,
       data: { content: userMessage.slice(0, 200), category: 'user-pref', tier: 'core' },
     });
   }
   ```

5. **File: `src/app/api/cid/route.ts`** — After parsing the LLM response, extract `memory_ops` from the JSON and return them alongside the existing `message`/`workflow`/`modifications` fields. No separate endpoint needed.

**Acceptance criteria:**
- [ ] CID proactively saves user facts (e.g., "we use Kubernetes") to core memory after the user states them
- [ ] Core memory entries appear in the system prompt on subsequent interactions
- [ ] Core memory capped at 10 entries; overflow demotes least-accessed to archival
- [ ] Archival memory searchable via `memory_ops.search`
- [ ] Memory persists across sessions via localStorage
- [ ] Memory entries have categories for filtering (user-pref, project-fact, domain-knowledge, workflow-pattern)
- [ ] No regression in prompt size — core memory adds max ~500 tokens

---

### 22. LangGraph-Style Execution Checkpointing with Resume and Time-Travel
**Status:** [ ] Not started
**Version target:** 1.22.0
**Inspiration:** LangGraph's checkpointing architecture — every graph execution saves a checkpoint at each node boundary, enabling resume-from-failure, time-travel debugging, and human-in-the-loop interrupts. See [LangGraph checkpointing](https://deepwiki.com/langchain-ai/langgraph/4.1-checkpointing-architecture) and [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts). Also inspired by Dify v1.5.0's "Last Run" feature where every node caches its last execution ([Dify 1.5.0 blog](https://dify.ai/blog/dify-1-5-0-real-time-workflow-debugging-that-actually-works)).
**Complexity:** Medium-Large (3-4 hours)

**Problem:** When `executeWorkflow()` in `src/store/useStore.ts` runs a 9-node workflow and node 6 fails (e.g., API timeout), all progress from nodes 1-5 is lost in terms of resumability. The user must re-execute the entire workflow, re-paying for LLM calls on nodes that already succeeded. LangGraph solves this with checkpoints at every node boundary — if node 6 fails, you resume from the checkpoint after node 5. Additionally, Dify v1.5.0 caches every node's last execution (inputs, outputs, timing), letting users modify upstream data and re-run a single downstream node without re-executing expensive predecessors. Lifecycle stores `executionResult` on each node's data (in `NodeData.executionResult`, `src/lib/types.ts`), but there is no formal checkpoint system, no resume capability, and no way to roll back to a previous execution state.

**Implementation:**

1. **File: `src/lib/types.ts`** — Add checkpoint types:
   ```typescript
   export interface ExecutionCheckpoint {
     id: string;
     workflowRunId: string;
     nodeId: string;
     nodeLabel: string;
     timestamp: number;
     status: 'success' | 'error' | 'skipped';
     inputContext: string;    // What was sent to the node
     outputResult: string;    // What the node produced
     durationMs: number;
     tokenUsage?: { prompt: number; completion: number };
   }

   export interface WorkflowRun {
     id: string;
     startedAt: number;
     completedAt: number | null;
     status: 'running' | 'completed' | 'failed' | 'paused';
     checkpoints: ExecutionCheckpoint[];
     failedAtNodeId?: string;
   }
   ```

2. **File: `src/store/useStore.ts`** — Modify `executeWorkflow()` (the topological execution loop) to save a checkpoint after each node completes:
   ```typescript
   // Inside the node execution loop:
   const checkpoint: ExecutionCheckpoint = {
     id: uid(), workflowRunId: currentRun.id, nodeId, nodeLabel: node.data.label,
     timestamp: Date.now(), status: 'success',
     inputContext: upstreamContext.slice(0, 2000),
     outputResult: (node.data.executionResult || '').slice(0, 5000),
     durationMs: Date.now() - nodeStartTime,
   };
   currentRun.checkpoints.push(checkpoint);
   ```
   On failure: save checkpoint with `status: 'error'`, set `currentRun.failedAtNodeId`, set `currentRun.status = 'paused'`.

3. **File: `src/store/useStore.ts`** — Add `resumeWorkflow()` action:
   ```typescript
   resumeWorkflow: async () => {
     const run = get().currentWorkflowRun;
     if (!run || run.status !== 'paused') return;
     const successIds = new Set(run.checkpoints.filter(c => c.status === 'success').map(c => c.nodeId));
     // Re-run executeWorkflow but skip nodes in successIds
     // Resume from failedAtNodeId
   }
   ```

4. **File: `src/store/useStore.ts`** — Add `replayFromCheckpoint(checkpointId: string)` for time-travel:
   - Find the checkpoint, restore all node `executionResult` values from checkpoints up to that point
   - Clear execution results for nodes after the checkpoint
   - Set `currentWorkflowRun.status = 'paused'` at that point so user can resume from there

5. **File: `src/components/PreviewPanel.tsx`** — When `currentWorkflowRun.status === 'paused'`, show a "Resume" button with context:
   ```
   Workflow paused at "Policy Analysis" (node 6/9)
   5 nodes completed successfully | 1 failed | 3 remaining
   [Resume from failure] [Retry failed node] [Restart workflow]
   ```
   Style: amber border card with action buttons, consistent with existing panel styling.

6. **File: `src/components/CIDPanel.tsx`** — After a failed workflow execution, CID's message should reference the checkpoint state:
   - "Node 'Policy Analysis' failed after 4.2s. 5 upstream nodes succeeded. You can resume from the failure point or retry just that node."

**Acceptance criteria:**
- [ ] Each node execution saves a checkpoint with input/output/timing
- [ ] Failed workflow shows "Resume" button; clicking it skips already-succeeded nodes
- [ ] "Retry failed node" re-executes only the failed node using cached upstream data
- [ ] Time-travel: user can click any checkpoint to restore state at that point
- [ ] Checkpoints stored in memory during session (not localStorage — too large)
- [ ] Resume saves LLM cost by not re-calling succeeded nodes
- [ ] Full `executeWorkflow()` still works as before when no previous run exists

---

### 23. Dify-Style Iteration/Loop Nodes for Batch Processing
**Status:** [ ] Not started
**Version target:** 1.23.0
**Inspiration:** Dify's Iteration node that processes array elements sequentially and the Loop node that repeats until exit conditions are met ([Dify iteration docs](https://legacy-docs.dify.ai/guides/workflow/node/iteration), [Dify Loop Node tweet](https://x.com/dify_ai/status/1903011106022625554)). Also inspired by LangGraph's cyclic graph support where nodes can loop back with state updates, and n8n's SplitInBatches node for chunked processing ([n8n AI Agent 2026 guide](https://strapi.io/blog/build-ai-agents-n8n)).
**Complexity:** Medium (2-3 hours)

**Problem:** Lifecycle's `executeWorkflow()` in `src/store/useStore.ts` runs each node exactly once in topological order. There is no way to express "process each item in this list" or "keep refining until quality threshold is met." If a user builds a "Content Pipeline" that needs to process 10 blog post ideas, they must create 10 parallel branches manually or run the workflow 10 times. Dify solves this with dedicated Iteration nodes (process array items) and Loop nodes (repeat until condition). LangGraph supports cyclic graphs where a node can loop back with updated state. Currently, `buildNodesFromPrompt()` in `src/lib/intent.ts` (line 206) creates only linear/branching graphs — never loops. The `topoSort()` in `src/lib/graph.ts` explicitly handles DAGs and would break on cycles.

**Implementation:**

1. **File: `src/lib/types.ts`** — Add iteration configuration to `NodeData`:
   ```typescript
   // Add to NodeData interface:
   iterationConfig?: {
     mode: 'foreach' | 'while';
     // foreach: split upstream result by delimiter, run once per item
     splitDelimiter?: string;       // default: '\n' (one item per line)
     maxIterations?: number;        // safety cap, default 20
     // while: repeat until condition met
     exitCondition?: string;        // natural language condition evaluated by LLM
     currentIteration?: number;     // runtime state
     iterationResults?: string[];   // collected results from each iteration
   };
   ```

2. **File: `src/store/useStore.ts`** — Modify `executeNode()` to handle iteration nodes. When `nodeData.iterationConfig` is set:
   ```typescript
   if (d.iterationConfig?.mode === 'foreach') {
     const upstreamResult = getUpstreamResult(nodeId);
     const items = upstreamResult.split(d.iterationConfig.splitDelimiter || '\n').filter(Boolean);
     const results: string[] = [];
     const maxIter = Math.min(items.length, d.iterationConfig.maxIterations || 20);
     for (let i = 0; i < maxIter; i++) {
       updateNodeData(nodeId, { iterationConfig: { ...d.iterationConfig, currentIteration: i + 1 } });
       // Execute with item-specific context: "Processing item {i+1}/{total}: {item}"
       const result = await callCIDAPI(nodeId, `Process item ${i + 1}/${maxIter}: ${items[i]}`);
       results.push(result);
     }
     updateNodeData(nodeId, { executionResult: results.join('\n---\n'), iterationConfig: { ...d.iterationConfig, iterationResults: results } });
   } else if (d.iterationConfig?.mode === 'while') {
     let iteration = 0;
     let lastResult = getUpstreamResult(nodeId);
     const maxIter = d.iterationConfig.maxIterations || 10;
     while (iteration < maxIter) {
       iteration++;
       updateNodeData(nodeId, { iterationConfig: { ...d.iterationConfig, currentIteration: iteration } });
       const result = await callCIDAPI(nodeId, `Iteration ${iteration}. Previous result:\n${lastResult}\n\nExit condition: "${d.iterationConfig.exitCondition}". If the condition is met, respond with exactly "EXIT:" followed by the final result. Otherwise, continue refining.`);
       if (result.startsWith('EXIT:')) { lastResult = result.slice(5).trim(); break; }
       lastResult = result;
     }
     updateNodeData(nodeId, { executionResult: lastResult });
   }
   ```

3. **File: `src/lib/prompts.ts`** — In `SHARED_CAPABILITIES` (after line 68), add iteration node documentation so the LLM can generate them:
   ```
   ITERATION NODES:
   Nodes with category "action" or "cid" can include an "iterationConfig" to process items in a loop:
   - "foreach": splits upstream output by delimiter, processes each item. Use for batch processing.
   - "while": repeats until an exit condition is met. Use for refinement loops.
   Include iterationConfig in the node JSON when the user asks for batch/bulk/each/every/loop/repeat/iterate operations.
   ```

4. **File: `src/components/LifecycleNode.tsx`** — When `iterationConfig` exists, show iteration progress in the node card:
   ```typescript
   {nodeData.iterationConfig && (
     <div className="mb-1.5 flex items-center gap-1.5">
       <span className="text-[8px] text-cyan-400/50 uppercase tracking-wider">
         {nodeData.iterationConfig.mode === 'foreach' ? 'Batch' : 'Loop'}
       </span>
       {nodeData.iterationConfig.currentIteration && (
         <span className="text-[8px] text-white/30 font-mono">
           {nodeData.iterationConfig.currentIteration}/{nodeData.iterationConfig.maxIterations || '?'}
         </span>
       )}
     </div>
   )}
   ```

5. **File: `src/components/NodeDetailPanel.tsx`** — Add an "Iteration" section when editing action/cid nodes:
   - Toggle: "Enable iteration" checkbox
   - Mode selector: "For Each Item" / "Repeat Until"
   - For foreach: delimiter input, max iterations slider
   - For while: exit condition text input, max iterations slider

**Acceptance criteria:**
- [ ] "foreach" iteration node splits upstream text and processes each item
- [ ] "while" iteration node repeats until LLM responds with "EXIT:" prefix
- [ ] Iteration progress visible on the node card (e.g., "Batch 3/10")
- [ ] Max iteration cap prevents runaway loops (default 20 for foreach, 10 for while)
- [ ] CID can generate iteration nodes when user says "process each", "for every", "batch", "iterate"
- [ ] Iteration results concatenated with delimiter in `executionResult`
- [ ] Node detail panel has UI for configuring iteration mode and parameters
- [ ] Non-iteration nodes execute identically to current behavior (no regression)

---

### 24. Collapsible Node Groups with Subgraph Composition
**Status:** [ ] Not started
**Version target:** 1.24.0
**Inspiration:** ComfyUI's Subgraphs feature (November 2025) — select multiple nodes and collapse them into a single "super-node" that hides internal complexity while preserving all connections. See [ComfyUI Subgraphs blog](https://blog.comfy.org/p/subgraphs-are-coming-to-comfyui). Also inspired by Dify's iteration blocks that visually contain a sub-workflow, and LangGraph's subgraph composition where a node can itself be a full graph ([LangGraph GitHub](https://github.com/langchain-ai/langgraph)).
**Complexity:** Medium-Large (3-4 hours)

**Problem:** Lifecycle workflows with 7-10 nodes already fill the canvas densely. Users building complex pipelines (e.g., a CI/CD workflow with build + test + deploy phases) cannot visually group related nodes. The `LifecycleNode` component (`src/components/LifecycleNode.tsx`) renders every node at the same hierarchy level — there is no concept of nesting or grouping. Multi-select exists (`multiSelectedIds` in the Zustand store, used in `Canvas.tsx` for rubber-band selection around line 180+), but it only supports delete and drag — not collapse. ComfyUI's subgraphs reduced workflow clutter by 50% in community benchmarks. For Lifecycle, a "Build Phase" group containing 3 nodes (Lint, Unit Test, Build) could collapse to a single card showing "Build Phase (3 nodes)" with only external edges visible.

**Implementation:**

1. **File: `src/lib/types.ts`** — Add `NodeGroup` type:
   ```typescript
   export interface NodeGroup {
     id: string;
     label: string;
     nodeIds: string[];          // IDs of nodes in this group
     collapsed: boolean;
     color: string;              // Group border color
     position: { x: number; y: number };  // Position when collapsed
     size: { width: number; height: number };  // Bounding box when expanded
   }
   ```
   Add to `NodeData`:
   ```typescript
   groupId?: string;  // Which group this node belongs to (if any)
   ```

2. **File: `src/store/useStore.ts`** — Add group management actions:
   ```typescript
   nodeGroups: NodeGroup[];

   createGroup: (label: string) => {
     const selectedIds = get().multiSelectedIds;
     if (selectedIds.size < 2) return;
     const groupId = uid();
     const memberNodes = get().nodes.filter(n => selectedIds.has(n.id));
     // Compute bounding box of selected nodes
     const minX = Math.min(...memberNodes.map(n => n.position.x));
     const minY = Math.min(...memberNodes.map(n => n.position.y));
     const maxX = Math.max(...memberNodes.map(n => n.position.x + 270));
     const maxY = Math.max(...memberNodes.map(n => n.position.y + 160));
     // Tag each node with groupId
     for (const node of memberNodes) {
       updateNodeData(node.id, { groupId });
     }
     set(s => ({ nodeGroups: [...s.nodeGroups, {
       id: groupId, label, nodeIds: [...selectedIds], collapsed: false,
       color: getNodeColors(memberNodes[0].data.category).primary,
       position: { x: minX, y: minY },
       size: { width: maxX - minX + 40, height: maxY - minY + 40 },
     }]}));
   },

   toggleGroupCollapse: (groupId: string) => {
     set(s => ({
       nodeGroups: s.nodeGroups.map(g =>
         g.id === groupId ? { ...g, collapsed: !g.collapsed } : g
       ),
     }));
   },

   ungroupNodes: (groupId: string) => {
     const group = get().nodeGroups.find(g => g.id === groupId);
     if (!group) return;
     for (const nodeId of group.nodeIds) {
       updateNodeData(nodeId, { groupId: undefined });
     }
     set(s => ({ nodeGroups: s.nodeGroups.filter(g => g.id !== groupId) }));
   },
   ```

3. **File: `src/components/Canvas.tsx`** — When a group is collapsed, hide member nodes and render a single group placeholder node instead:
   ```typescript
   const visibleNodes = useMemo(() => {
     const collapsedGroupIds = new Set(nodeGroups.filter(g => g.collapsed).map(g => g.id));
     const hiddenNodeIds = new Set<string>();
     for (const g of nodeGroups) {
       if (g.collapsed) g.nodeIds.forEach(id => hiddenNodeIds.add(id));
     }
     const filtered = nodes.filter(n => !hiddenNodeIds.has(n.id));
     // Add placeholder nodes for collapsed groups
     for (const g of nodeGroups) {
       if (g.collapsed) {
         filtered.push({
           id: `group-${g.id}`, type: 'lifecycleNode',
           position: g.position,
           data: {
             label: g.label, category: 'note' as NodeCategory,
             status: 'active', description: `${g.nodeIds.length} nodes (click to expand)`,
             version: 1, lastUpdated: Date.now(), _isGroupPlaceholder: true, _groupId: g.id,
           },
         });
       }
     }
     return filtered;
   }, [nodes, nodeGroups]);
   ```
   For edges: remap edges that connect to hidden nodes so they connect to the group placeholder instead.

4. **File: `src/components/Canvas.tsx`** — When expanded, render a colored bounding rectangle behind group member nodes:
   ```typescript
   // Render group background rectangles
   {nodeGroups.filter(g => !g.collapsed).map(g => (
     <div key={g.id} className="absolute rounded-xl border-2 border-dashed pointer-events-none"
       style={{
         left: g.position.x - 20, top: g.position.y - 30,
         width: g.size.width, height: g.size.height,
         borderColor: `${g.color}40`, backgroundColor: `${g.color}08`,
       }}>
       <span className="absolute -top-5 left-2 text-[10px] font-medium" style={{ color: `${g.color}80` }}>
         {g.label}
       </span>
     </div>
   ))}
   ```

5. **File: `src/components/NodeContextMenu.tsx`** — Add "Group Selected Nodes" option when multiple nodes are selected, and "Ungroup" when right-clicking a group member.

**Acceptance criteria:**
- [ ] Multi-selecting 2+ nodes and choosing "Group" creates a named group with colored bounding box
- [ ] Collapsing a group hides member nodes and shows a single placeholder card
- [ ] External edges to/from grouped nodes are remapped to the placeholder when collapsed
- [ ] Expanding restores all member nodes and edges to their original positions
- [ ] Groups persist across sessions (stored in Zustand, serialized to localStorage)
- [ ] Context menu shows "Group Selected" (multi-select) and "Ungroup" (group member)
- [ ] Group placeholder shows member count and category summary
- [ ] Workflow execution still works correctly with grouped nodes (groups are visual-only)

---

### 25. Dify-Style Variable Inspector Panel for Real-Time Execution Debugging
**Status:** [ ] Not started
**Version target:** 1.25.0
**Inspiration:** Dify v1.5.0's Variable Inspect panel — a bottom-of-canvas panel that shows all node variables in real-time, lets you edit values mid-execution, and caches "Last Run" data per node for re-running downstream nodes without re-executing upstream. See [Dify 1.5.0 announcement](https://dify.ai/blog/dify-1-5-0-real-time-workflow-debugging-that-actually-works) and [Dify debug docs](https://docs.dify.ai/en/guides/workflow/debug-and-preview/step-run). Also inspired by Rivet's per-node input/output inspection ([Rivet GitHub](https://github.com/Ironclad/rivet)) and AutoGen Studio's real-time agent action streams ([AutoGen v0.4 blog](https://www.microsoft.com/en-us/research/blog/autogen-v0-4-reimagining-the-foundation-of-agentic-ai-for-scale-extensibility-and-robustness/)).
**Complexity:** Medium-Large (3-4 hours)

**Problem:** During and after `executeWorkflow()`, Lifecycle shows execution status (running/success/error) and a truncated result preview on each node card (`src/components/LifecycleNode.tsx`, lines 283-343). But there is no centralized view of what data flowed between nodes. The `ArtifactPanel` (`src/components/ArtifactPanel.tsx`) shows one node's content at a time. To debug a failed workflow, users must click into each node individually to see its execution result — there is no way to see "Node A output X, Node B received Y, Node B produced Z" in one view. Dify's Variable Inspect panel shows ALL node variables simultaneously in a single bottom panel, with the ability to edit a value and re-run just the downstream node. Rivet shows real-time input/output per node during execution. Lifecycle's `PreviewPanel.tsx` shows a `nodeTrace` (line 276) but only as labels, not actual data payloads.

**Implementation:**

1. **File: `src/components/VariableInspector.tsx`** (NEW, ~250 lines) — A slide-up bottom panel (height 220px, resizable):
   ```typescript
   export default function VariableInspector() {
     const { nodes, edges, isExecutingWorkflow } = useLifecycleStore();

     // Build a table of all nodes with their execution data
     const nodeData = useMemo(() => nodes.map(n => ({
       id: n.id,
       label: n.data.label,
       category: n.data.category,
       status: n.data.executionStatus || 'idle',
       inputPreview: getNodeInput(n.id, nodes, edges),   // What flowed IN
       outputPreview: n.data.executionResult?.slice(0, 300) || null,  // What flowed OUT
       duration: n.data._executionDurationMs || null,
       error: n.data.executionError || null,
     })), [nodes, edges]);

     return (
       <motion.div className="fixed bottom-0 left-0 right-0 h-[220px] bg-[#0a0a12]/95 backdrop-blur-xl border-t border-white/[0.06] z-35">
         {/* Header */}
         <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04]">
           <span className="text-[11px] font-medium text-white/70">Variable Inspector</span>
           <span className="text-[9px] text-white/30">{nodes.length} nodes</span>
         </div>
         {/* Table */}
         <div className="overflow-x-auto overflow-y-auto h-[180px] scrollbar-thin">
           <table className="w-full text-[10px]">
             <thead>
               <tr className="text-white/30 border-b border-white/[0.04]">
                 <th className="px-3 py-1.5 text-left w-[140px]">Node</th>
                 <th className="px-3 py-1.5 text-left">Input</th>
                 <th className="px-3 py-1.5 text-left">Output</th>
                 <th className="px-3 py-1.5 text-right w-[60px]">Time</th>
                 <th className="px-3 py-1.5 text-center w-[60px]">Status</th>
               </tr>
             </thead>
             <tbody>
               {nodeData.map(n => (
                 <tr key={n.id} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                   <td className="px-3 py-1.5 text-white/60 font-medium truncate">{n.label}</td>
                   <td className="px-3 py-1.5 text-white/30 truncate max-w-[200px]">{n.inputPreview || '-'}</td>
                   <td className="px-3 py-1.5 text-white/30 truncate max-w-[200px]">{n.outputPreview || '-'}</td>
                   <td className="px-3 py-1.5 text-white/20 text-right font-mono">{n.duration ? `${(n.duration/1000).toFixed(1)}s` : '-'}</td>
                   <td className="px-3 py-1.5 text-center">
                     <span className={`inline-block w-2 h-2 rounded-full ${statusColor(n.status)}`} />
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
       </motion.div>
     );
   }
   ```

2. **File: `src/store/useStore.ts`** — Add `showVariableInspector: boolean` toggle and `toggleVariableInspector()` action. Track `_executionDurationMs` on `NodeData` by recording `Date.now()` before and after each `executeNode()` call.

3. **File: `src/components/TopBar.tsx`** — Add a "Debug" toggle button next to the existing "Preview" and "Activity" buttons:
   ```typescript
   <button onClick={toggleVariableInspector}
     className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium ${
       showVariableInspector ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : '...'
     }`}>
     <Code size={12} />
     <span className="hidden sm:inline">Debug</span>
   </button>
   ```

4. **File: `src/components/VariableInspector.tsx`** — Add click-to-expand on any cell: clicking an input/output cell opens a full-text popover showing the complete value (not truncated), with a "Copy" button. Style: `max-w-lg max-h-60 overflow-auto bg-zinc-800/95 border border-white/10 rounded-lg p-3 text-[10px] text-white/70 font-mono whitespace-pre-wrap`.

5. **File: `src/components/VariableInspector.tsx`** — Add a "Re-run" button per row: clicking it calls `executeNode(nodeId)` to re-execute just that node using cached upstream data. This mimics Dify's ability to edit a value and re-run downstream without re-executing everything.

**Acceptance criteria:**
- [ ] "Debug" toggle in TopBar shows/hides the Variable Inspector bottom panel
- [ ] Panel shows all nodes in a table with input preview, output preview, duration, and status
- [ ] Clicking a cell expands to show full value with copy button
- [ ] "Re-run" button per node re-executes just that node
- [ ] Panel updates in real-time during workflow execution (running nodes show spinner)
- [ ] Duration tracked per node (stored in `_executionDurationMs` on NodeData)
- [ ] Panel doesn't overlap with CIDPanel (respects panel layout)
- [ ] Panel handles 10+ nodes without performance issues (no full re-render on status changes)
- [ ] Auto-opens during workflow execution, stays open after completion

---

### 26. Parallel Branch Execution in Preview and Workflow Runner
**Status:** [ ] Not started
**Version target:** 1.26.0
**Inspiration:** Dify's parallel branch execution (up to 10 simultaneous branches, total time = longest branch not sum of all) and LangGraph's fan-out/fan-in pattern where independent nodes run concurrently. n8n's multi-agent parallel execution also applies this pattern.
**Complexity:** Medium (2-3 hours)

**Problem:** Both `executeWorkflow()` in `src/store/useStore.ts` (line ~1260+) and `PreviewPanel.tsx` (line 105) execute nodes sequentially with a `for...of` loop over the topological order. When a workflow has parallel branches (e.g., after a "Design Complete" node, both "Frontend Dev" and "Backend Dev" start), they still execute one at a time. For the Chatbot template with 5 LLM calls, this means 10-25 seconds of serial waiting. If Intent Detection and Context & Knowledge were independent, they could run in parallel (~50% speedup). Dify explicitly advertises parallel execution as a headline feature. Our prompts encourage parallel branches (line 71 of `src/lib/prompts.ts`) but our execution engine doesn't honor them.

**Implementation:**

1. **File: `src/lib/graph.ts`** — Add a `getParallelGroups(order: string[], edges: Edge[]): string[][]` function:
   - Takes the topological order and edge list
   - Groups nodes into "levels" — nodes at the same level have all their dependencies satisfied by previous levels
   - Level 0: nodes with in-degree 0 (inputs/triggers)
   - Level N: nodes whose ALL incoming edges come from nodes in levels < N
   - Return array of arrays: `[['input'], ['nodeA', 'nodeB'], ['mergeNode'], ['output']]`

2. **File: `src/store/useStore.ts`** — Modify `executeWorkflow()` to use parallel groups:
   ```typescript
   const levels = getParallelGroups(order, store.edges);
   for (const level of levels) {
     // Execute all nodes in this level concurrently
     await Promise.all(level.map(nodeId => store.executeNode(nodeId)));
   }
   ```
   - Keep the existing sequential fallback if `getParallelGroups` returns single-node levels

3. **File: `src/components/PreviewPanel.tsx`** — Same pattern in the `handleSend` execution loop (line 105):
   ```typescript
   const levels = getParallelGroups(order, edges);
   for (const level of levels) {
     const levelNodes = level.filter(id => {
       const n = useLifecycleStore.getState().nodes.find(x => x.id === id);
       return n && n.data.category !== 'note' && n.data.category !== 'input';
     });
     setActiveNodeId(levelNodes[0] || null); // Show first running node
     await Promise.all(levelNodes.map(id => executeNode(id)));
   }
   ```

4. **File: `src/components/PreviewPanel.tsx`** — Update the active node indicator (line 232-247) to show multiple running nodes:
   - Change `activeNodeId: string | null` to `activeNodeIds: string[]`
   - Show "Running 2 nodes: Intent Detection, Context & Knowledge"

**Acceptance criteria:**
- [ ] Nodes with no dependency on each other execute concurrently via `Promise.all`
- [ ] Nodes that depend on prior results still wait (level ordering)
- [ ] Chatbot template Preview speed improves measurably (3-5 LLM calls → 2-3 parallel rounds)
- [ ] `executeWorkflow()` in store and `PreviewPanel` both use parallel execution
- [ ] Active node indicator shows all concurrently running nodes
- [ ] No race conditions — upstream `executionResult` is set before downstream reads it
- [ ] Eval scores remain >= 98%

---

### 27. Upstream-Aware Execution Prompts with Typed Data Flow
**Status:** [ ] Not started
**Version target:** 1.27.0
**Inspiration:** LangGraph's typed state with reducer functions (each node receives/returns typed state, not raw strings). Rivet's typed port connections where each edge carries a specific data type (text, JSON, number, boolean). CrewAI's task delegation where each agent receives structured context about what the previous agent produced and why.
**Complexity:** Medium (2-3 hours)

**Problem:** When `executeNode()` runs a CID/action/review/etc. node, the auto-prompt is generic: `"Process and transform the input content for 'Intent Detection'"` (line 1182 of `src/store/useStore.ts`). The upstream context is injected as a raw string dump: `"Input from upstream nodes:\n\n${upstreamResults.join('\n\n---\n\n')}"` (line 1204-1206). The LLM has no idea which upstream node produced which content, what the edge relationship means, or what data type to expect. For a workflow like Chatbot where Safety Check receives output from Response Generation via a "validates" edge, the prompt should say "Review and validate the following response (from 'Response Generation')" — not the generic "Define and document the policy rules for 'Safety Check'".

**Implementation:**

1. **File: `src/store/useStore.ts`** — Refactor the `inputContext` builder (lines 1204-1206) to include source metadata:
   ```typescript
   const inputContext = incomingEdges.map(e => {
     const src = store.nodes.find(n => n.id === e.source);
     const edgeLabel = e.label || e.data?.label || 'connects';
     const srcResult = src?.data.executionResult || src?.data.content || '';
     return `## From "${src?.data.label}" (${edgeLabel})\n${srcResult}`;
   }).join('\n\n---\n\n') || d.content || 'No input provided.';
   ```

2. **File: `src/store/useStore.ts`** — Refactor auto-prompt generation (lines 1178-1194) to incorporate edge semantics:
   ```typescript
   // Build edge-aware prompt suffix
   const edgeContext = incomingEdges.map(e => {
     const src = store.nodes.find(n => n.id === e.source);
     const label = e.label || e.data?.label || 'connects';
     return { from: src?.data.label, relationship: label };
   });
   const relationshipHint = edgeContext.length > 0
     ? ` You receive input via: ${edgeContext.map(e => `"${e.relationship}" from "${e.from}"`).join(', ')}.`
     : '';
   ```
   - Append `relationshipHint` to each category's auto-prompt string
   - For `review` nodes with "validates" edges: override to "Review and validate the content received from upstream"
   - For `policy` nodes with "monitors" edges: override to "Check the content against policy rules"
   - For `action` nodes with "triggers" edges: override to "Execute this action triggered by upstream"

3. **File: `src/store/useStore.ts`** — Add downstream awareness to the system prompt (line 1217):
   ```typescript
   const outgoingEdges = store.edges.filter(e => e.source === nodeId);
   const downstreamHint = outgoingEdges.length > 0
     ? ` Your output will be used by: ${outgoingEdges.map(e => {
         const tgt = store.nodes.find(n => n.id === e.target);
         return `"${tgt?.data.label}" (${e.label || 'next step'})`;
       }).join(', ')}. Tailor your output format accordingly.`
     : '';
   const systemPrompt = `You are a content generator for a workflow node called "${d.label}" (category: ${d.category}).${downstreamHint} Write detailed, professional content. Return ONLY the content as markdown text.`;
   ```

**Acceptance criteria:**
- [ ] Each node's execution prompt includes which upstream nodes fed it and via which edge label
- [ ] Review nodes receiving "validates" edges get validation-specific prompts
- [ ] Policy nodes receiving "monitors" edges get compliance-specific prompts
- [ ] System prompt tells the node what downstream consumers expect
- [ ] Chatbot template produces more focused per-node output (Safety Check actually validates, not just restates)
- [ ] Eval scores improve or stay stable (upstream context helps LLM focus)
- [ ] No regression on existing templates

---

### 28. CrewAI-Style Planning Agent for Auto-Workflow Generation
**Status:** [ ] Not started
**Version target:** 1.28.0
**Inspiration:** CrewAI's dedicated planning agent that auto-generates task sequences from high-level goals before any work begins. Also inspired by AutoGen's `SelectorGroupChat` where an LLM dynamically decides the next agent/step, and OpenAI Agents SDK's AgentKit Agent Builder that lets users describe a goal and auto-scaffolds the agent graph.
**Complexity:** Large (4-5 hours)

**Problem:** Currently, workflow generation relies on the LLM interpreting the CRITICAL RULES block in `src/lib/prompts.ts` (lines 43-74) to produce good graph structure. The rules are static and verbose (~2000 chars of constraints). Despite this, the LLM still frequently produces linear chains, misuses categories, or generates thin content — which is why item #1 (Self-Correcting Retry Loop) exists. The root cause is that we ask one LLM call to simultaneously: (1) understand user intent, (2) decompose into phases, (3) pick categories, (4) write 300+ char content per node, (5) design edge architecture, and (6) format as valid JSON. CrewAI's insight is to separate planning from execution: a lightweight planning call determines the graph skeleton, then a heavier content-generation pass fills in the nodes.

**Implementation:**

1. **File: `src/lib/prompts.ts`** — Add a `buildPlanningPrompt(userMessage: string, canvasState: string): string` function:
   ```typescript
   export function buildPlanningPrompt(userMessage: string, canvasState: string): string {
     return `You are a workflow architect. Given the user's goal, produce a workflow SKELETON (no content, just structure).

   Return JSON:
   {
     "phases": [
       { "label": "Phase Name", "category": "input|cid|action|review|test|policy|output|...", "purpose": "one-line why this phase exists" }
     ],
     "edges": [
       { "from": 0, "to": 1, "label": "feeds|drives|validates|..." }
     ],
     "architecture": "linear|branching|feedback-loop|parallel-merge"
   }

   Rules:
   - 5-10 phases. Start with input/trigger, end with output.
   - Include review/test gates for quality workflows.
   - Use parallel branches when phases are independent.
   - Add feedback loops (refines edges) when review can reject.

   Canvas: ${canvasState}
   User goal: ${userMessage}`;
   }
   ```

2. **File: `src/store/useStore.ts`** — In `chatWithCID()` (or a new `planAndGenerate()` method), add a two-phase generation:
   - **Phase 1 (Planning)**: Call `/api/cid` with `buildPlanningPrompt()`, `taskType: 'analyze'` (temperature 0.4)
   - Parse the skeleton response to get phases + edges + architecture type
   - **Phase 2 (Content Generation)**: For each phase, call `/api/cid` with a focused prompt:
     ```
     Generate detailed content (300+ chars, markdown) for the workflow node "${phase.label}" (category: ${phase.category}).
     Purpose: ${phase.purpose}
     Architecture: ${skeleton.architecture}
     Upstream: ${upstreamPhaseLabels}
     Downstream: ${downstreamPhaseLabels}
     ```
   - Phase 2 calls can run in parallel (using `Promise.all` for independent nodes) for speed

3. **File: `src/store/useStore.ts`** — Gate this behind a complexity threshold:
   - Simple requests (< 15 words, single domain): use existing single-call generation
   - Complex requests (15+ words, multiple domains, or user explicitly says "detailed"): use two-phase planning
   - Add `cidPlanningEnabled: boolean` to store settings with toggle in UI

4. **File: `src/app/api/cid/route.ts`** — No changes needed; the planning call uses existing infrastructure with `taskType: 'analyze'`

**Acceptance criteria:**
- [ ] Complex workflow requests produce better-structured graphs (more edges than nodes-1, proper gates)
- [ ] Two-phase generation produces richer node content (each node gets a focused prompt)
- [ ] Simple requests (< 15 words) still use single-call for speed
- [ ] Planning phase is fast (analyze temperature 0.4, small payload)
- [ ] Content generation phases can run in parallel for independent nodes
- [ ] Total latency for two-phase is within 1.5x of single-call (parallelism compensates)
- [ ] Eval scores for workflow quality improve by 5%+
- [ ] Feature can be disabled via settings toggle

---

### 29. Glassmorphic Node Cards with Contextual Micro-Animations
**Status:** [ ] Not started
**Version target:** 1.29.0
**Inspiration:** ComfyUI's mature node-based canvas with rich visual feedback during execution. Rivet's real-time execution visualization with spinners on running nodes and data flowing through connections. Dify's polished visual canvas with clean node cards and visual debugging. Also inspired by modern design systems like Linear's glassmorphic UI and Vercel's dashboard micro-interactions.
**Complexity:** Medium (2-3 hours)

**Problem:** Currently, `LifecycleNode` in `src/components/LifecycleNode.tsx` renders nodes as flat cards with category-colored left borders and small status badges. During execution, running nodes show a spinner and success nodes show a checkmark — but there is no visual "energy" or data-flow animation. The edges are static `smoothstep` paths (`src/components/Canvas.tsx`, line 38-40) with no indication of data movement. Competitor tools like Rivet show animated particles flowing along edges during execution, and ComfyUI shows real-time progress within each node. Our current nodes look identical whether idle or actively processing data, making it hard to visually understand workflow execution at a glance. The node cards also lack depth — they're opaque rectangles without the glassmorphic layering that modern dark-theme UIs use.

**Implementation:**

1. **File: `src/components/LifecycleNode.tsx`** — Upgrade node card styling with glassmorphism:
   ```typescript
   // Replace flat bg with glass effect
   className={`
     backdrop-blur-md bg-white/[0.03] border border-white/[0.08]
     rounded-xl shadow-lg shadow-black/20
     ${isRunning ? 'ring-1 ring-cyan-500/30 shadow-cyan-500/10' : ''}
     ${isSuccess ? 'ring-1 ring-emerald-500/20' : ''}
     ${isError ? 'ring-1 ring-rose-500/30' : ''}
     transition-all duration-300
   `}
   ```
   - Add a subtle category-colored glow on hover: `hover:shadow-${categoryColor}/10`
   - Replace the flat left border with a top gradient accent bar (4px tall, category gradient)

2. **File: `src/components/LifecycleNode.tsx`** — Add execution micro-animations:
   - **Running state**: Pulsing glow ring around the node using Framer Motion:
     ```typescript
     {isRunning && (
       <motion.div
         className="absolute inset-0 rounded-xl border border-cyan-500/20"
         animate={{ opacity: [0.3, 0.7, 0.3] }}
         transition={{ duration: 2, repeat: Infinity }}
       />
     )}
     ```
   - **Success state**: Brief green flash on completion (300ms), then settle to subtle green ring
   - **Error state**: Red pulse on failure, then settle to red ring with error icon

3. **File: `src/components/Canvas.tsx`** — Add animated edge particles during execution:
   - When `executionProgress.running === true`, find edges where source is `success` and target is `running`
   - Apply an animated SVG marker (small circle) that travels along the edge path using CSS `offset-path`:
     ```css
     .edge-particle {
       offset-path: path('...');
       animation: flowParticle 1.5s linear infinite;
     }
     @keyframes flowParticle {
       from { offset-distance: 0%; opacity: 0; }
       10% { opacity: 1; }
       90% { opacity: 1; }
       to { offset-distance: 100%; opacity: 0; }
     }
     ```
   - Use React Flow's custom edge component to render this alongside the existing `smoothstep` edge

4. **File: `src/components/LifecycleNode.tsx`** — Add a progress bar inside the node during execution:
   - A thin bar at the bottom of the node card that fills from 0-100% while the node is executing
   - Since we don't know actual progress, use an indeterminate animation (shimmer effect)
   - On completion, snap to 100% with category color, then fade out after 1s

**Acceptance criteria:**
- [ ] Node cards use glassmorphic styling (backdrop-blur, semi-transparent background)
- [ ] Running nodes have animated glow rings (not just a spinner icon)
- [ ] Completed nodes flash green briefly on success
- [ ] Failed nodes flash red on error
- [ ] Edges show animated particles during workflow execution (source→target direction)
- [ ] Particles only appear on active edges (source=success, target=running)
- [ ] Animations are smooth (60fps) and don't cause layout shifts
- [ ] Animations respect `prefers-reduced-motion` media query
- [ ] Visual hierarchy is clear: running nodes are most prominent, idle nodes recede
- [ ] No performance regression with 10+ nodes executing

---

### 30. Conversation Threading with Collapsible Workflow Context
**Status:** [ ] Not started
**Version target:** 1.30.0
**Inspiration:** AutoGen Studio's real-time message flow visualization that maps agent communication paths visually. Slack's threaded conversations that group related messages. ChatGPT's artifact panel that separates generated content from conversation flow. Also inspired by Cursor's inline diff view where code changes appear contextually within the conversation.
**Complexity:** Medium-Large (3-4 hours)

**Problem:** The CIDPanel (`src/components/CIDPanel.tsx`) renders all messages in a flat chronological list. When CID generates a workflow, the response contains a terse message ("Done. 8 nodes.") and the workflow appears on the canvas — but the chat shows no visual record of WHAT was generated. When CID modifies a workflow, the chat shows the text response but no diff of what changed. Over a long session (20+ messages), it becomes hard to find which message triggered which workflow change. The streaming word-by-word display (35ms/word at line ~860) is charming but makes long responses feel slow. Competitor tools like AutoGen Studio show structured agent action logs (not just text), and ChatGPT's artifact panel separates generated content from conversation, keeping the chat focused.

**Implementation:**

1. **File: `src/components/CIDPanel.tsx`** — Add collapsible workflow summary cards inline in chat:
   - When a CID response includes `workflow` data, render an inline card below the text message:
     ```typescript
     {msg.workflowGenerated && (
       <button onClick={() => toggleExpanded(msg.id)}
         className="mt-2 w-full text-left px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors">
         <div className="flex items-center justify-between">
           <span className="text-[10px] text-white/40">
             <Sparkles size={10} className="inline mr-1" />
             Generated {msg.workflowGenerated.nodeCount} nodes, {msg.workflowGenerated.edgeCount} edges
           </span>
           <ChevronRight size={10} className={`text-white/20 transition-transform ${expanded[msg.id] ? 'rotate-90' : ''}`} />
         </div>
         {expanded[msg.id] && (
           <div className="mt-2 text-[9px] text-white/30 space-y-1">
             {msg.workflowGenerated.nodeLabels.map((label, i) => (
               <div key={i} className="flex items-center gap-1">
                 <span className={`w-1.5 h-1.5 rounded-full bg-${msg.workflowGenerated.nodeCategories[i]}-400/40`} />
                 {label}
               </div>
             ))}
           </div>
         )}
       </button>
     )}
     ```

2. **File: `src/components/CIDPanel.tsx`** — Add modification diff cards:
   - When a CID response includes `modifications`, render an inline diff:
     ```typescript
     {msg.modifications && (
       <div className="mt-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[9px]">
         {msg.modifications.added?.map(n => (
           <div key={n} className="text-emerald-400/60">+ {n}</div>
         ))}
         {msg.modifications.removed?.map(n => (
           <div key={n} className="text-rose-400/60">- {n}</div>
         ))}
         {msg.modifications.updated?.map(n => (
           <div key={n} className="text-amber-400/60">~ {n}</div>
         ))}
       </div>
     )}
     ```

3. **File: `src/store/useStore.ts`** — In `chatWithCID()` (line ~2370+), when adding the CID response message, attach workflow metadata:
   ```typescript
   // After applying workflow or modifications, attach summary to message
   const cidMsg = {
     ...baseMessage,
     workflowGenerated: result.workflow ? {
       nodeCount: result.workflow.nodes.length,
       edgeCount: result.workflow.edges.length,
       nodeLabels: result.workflow.nodes.map(n => n.label),
       nodeCategories: result.workflow.nodes.map(n => n.category),
     } : undefined,
     modifications: result.modifications ? {
       added: result.modifications.add_nodes?.map(n => n.label) || [],
       removed: result.modifications.remove_nodes || [],
       updated: result.modifications.update_nodes?.map(n => n.label) || [],
     } : undefined,
   };
   ```

4. **File: `src/lib/types.ts`** — Extend `CIDMessage` type to include optional `workflowGenerated` and `modifications` summary fields.

5. **File: `src/components/CIDPanel.tsx`** — Add adaptive streaming speed:
   - Current: fixed 35ms/word for all messages
   - New: Scale based on response length:
     - < 50 words: 35ms/word (current, feels snappy)
     - 50-150 words: 20ms/word (moderate responses stay brisk)
     - 150+ words: 10ms/word (long responses don't drag)
   - Add a "skip animation" button (double-click or press Enter) to instantly reveal full message

**Acceptance criteria:**
- [ ] Workflow generation messages show collapsible node summary cards
- [ ] Modification messages show inline diff (added/removed/updated nodes)
- [ ] Clicking a node name in the summary card focuses that node on the canvas
- [ ] Streaming speed adapts to response length (longer = faster per word)
- [ ] Users can skip streaming animation by pressing Enter or double-clicking
- [ ] Workflow metadata persists in message history (survives page reload)
- [ ] Chat remains performant with 50+ messages including summary cards
- [ ] Cards don't break the existing message pinning feature

---

## Completed

_(Move items here after implementation)_
