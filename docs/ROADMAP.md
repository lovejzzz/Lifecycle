# Lifecycle Agent — Focused Roadmap

## Why this roadmap exists

The original roadmap grew to 93 items by collecting features from competitors (LangGraph, CrewAI, Dify, n8n, ComfyUI). Most of those features optimize execution — parallel branches, hover previews, variable inspectors, conditional nodes, agent personality layers. They make a better workflow *runner*.

But Lifecycle Agent is not a workflow runner. The spec (`stateful_workflow_system_spec.md`) defines a fundamentally different product:

> A workflow should not be modeled only as a sequence of executions. It should be modeled as a visible lifecycle of state, artifacts, notes, dependencies, edits, and agent-guided change. (Section 6)

The differentiator is one core loop that no other tool does well:

```
User edits something
  → System understands the edit
    → Affected nodes are marked stale
      → User sees the impact
        → Only stale nodes regenerate
          → The lifecycle continues
```

Without this loop, we are just another visual workflow builder with a chat sidebar. With it, we are the first tool where **workflows stay alive after generation**.

This roadmap contains 6 items. They are ordered by dependency — each one builds on the previous. Nothing else should be built until these 6 are solid.

---

## What's already built (foundation)

These capabilities exist and are stable:

- **Intent → workflow graph**: Natural language generates a visible lifecycle graph with nodes, edges, categories
- **Node execution**: Category-aware AI prompts, parallel execution by topological level, circuit breaker for failures
- **Upstream data flow**: Nodes receive structured context from parents with edge labels and downstream awareness
- **Partial branch execution**: Run only one branch's upstream chain without executing the full workflow
- **Locking**: Users can lock nodes to prevent overwrites
- **Events**: Lifecycle events are tracked (created, edited, regenerated, approved, locked, etc.)
- **Storage**: Persistent localStorage with quota management and emergency save

This foundation is enough. The execution engine works. Now we need the lifecycle engine.

---

## The 6 items

### 1. Staleness Propagation

**Why**: This is the foundation of the entire lifecycle loop. The spec says: "The system should identify what is affected by any change" (11.7). Right now, when a user edits a node or re-executes it, nothing happens to downstream nodes. They still show old results as if nothing changed. The graph is dead after execution. This single feature makes it alive.

**What it does**: When a node's content or execution result changes, all downstream nodes (reachable via edges) are automatically marked `stale`. Stale nodes get a visual indicator. Stale edges light up to show the propagation path.

**How to implement**:

1. **`src/store/useStore.ts`** — Add a `propagateStaleness(nodeId: string)` function:
   - Walk forward from `nodeId` through all outgoing edges (BFS/DFS)
   - For each reachable downstream node, set `status: 'stale'`
   - Skip locked nodes (they are protected, per spec Section 18)
   - Record a lifecycle event: `{ type: 'stale', nodeId, message: 'Marked stale: upstream changed' }`

2. **`src/store/useStore.ts`** — Call `propagateStaleness()` in two places:
   - In `updateNodeData()` — when `content` or `description` changes (user edit)
   - In `executeNode()` — after execution result is written (re-execution)
   - Only propagate if the new value is meaningfully different from the old value (not whitespace-only changes)

3. **`src/components/LifecycleNode.tsx`** — Visual indicator for stale nodes:
   - Stale nodes get a subtle amber border pulse or a small "stale" badge
   - Already exists in STATUS_INDICATOR as `stale: { icon: AlertTriangle, color: '#f59e0b', pulse: true }`
   - Stale edges could dim or show a dashed pattern

4. **`src/lib/graph.ts`** — Add `getDownstreamNodes(nodeId, nodes, edges): string[]`:
   - BFS forward traversal (opposite of `getUpstreamSubgraph`)
   - Returns all reachable node IDs excluding the source

**Acceptance criteria**:
- Edit a node's content → all downstream nodes turn stale
- Re-execute a node → all downstream nodes turn stale
- Locked nodes are skipped (not marked stale)
- Staleness is visually obvious on the canvas
- Events log records each staleness propagation

---

### 2. Selective Regeneration

**Why**: The spec says: "Only update what needs updating" (8.6) and "selectively regenerate affected outputs" (Vision). Right now, users have two options: re-run the entire workflow, or manually re-execute individual nodes one by one. Neither is good. Full rerun wastes API calls on nodes that haven't changed. Manual one-by-one is tedious and error-prone (you might miss a node or run them out of order).

**What it does**: A single "Refresh stale" action that re-executes only nodes with `status: 'stale'`, in correct topological order, skipping everything that's still fresh.

**How to implement**:

1. **`src/store/useStore.ts`** — Add `regenerateStale()` action:
   - Collect all nodes where `status === 'stale'`
   - Run `topoSort()` on just those nodes (plus their edges)
   - Execute them in topological order using `executeNode()`
   - After each successful execution, mark the node as `active` (no longer stale)
   - Report results like `executeWorkflow()` does (timing, success/fail counts)

2. **`src/store/useStore.ts`** — Add `staleCount` derived value:
   - Simple counter: `nodes.filter(n => n.data.status === 'stale').length`
   - Used by UI to show "3 stale nodes" indicator

3. **`src/components/TopBar.tsx`** or **CID chat** — Trigger for regeneration:
   - A "Refresh stale (N)" button that appears when staleCount > 0
   - Or users can type "refresh stale" / "update stale nodes" in CID chat
   - CID responds with what it's about to regenerate, then does it

4. **Integration with CID chat** — Add intent recognition:
   - "refresh", "update stale", "regenerate" → triggers `regenerateStale()`
   - CID reports: "Refreshing 3 stale nodes: [names]..."

**Acceptance criteria**:
- After staleness propagation, "Refresh stale" button appears with count
- Clicking it re-executes only stale nodes in correct order
- Fresh nodes are untouched (no wasted API calls)
- After regeneration, all refreshed nodes return to `active` status
- CID chat supports "refresh stale" as a command

---

### 3. Edit Interpretation

**Why**: The spec dedicates all of Section 15 to this. Not every edit should trigger propagation. A typo fix shouldn't mark 5 downstream nodes stale. A fundamental content rewrite should. Without classification, staleness propagation is either too aggressive (everything goes stale on every keystroke) or too conservative (nothing ever propagates). CID Agent should be the one deciding.

**What it does**: When a user edits a node's content, the system classifies the edit into one of the spec's categories (cosmetic, local, semantic, structural) and decides whether to propagate staleness.

**How to implement**:

1. **`src/lib/edits.ts`** (new file) — Edit classification:
   ```
   EditType = 'cosmetic' | 'local' | 'semantic' | 'structural'
   ```
   - **Cosmetic**: Only whitespace, punctuation, or formatting changed. Detect via: strip markdown formatting + normalize whitespace, then compare. If identical → cosmetic.
   - **Local**: Content changed but key terms / structure preserved. Detect via: extract headings + key nouns, compare sets. If >80% overlap → local.
   - **Semantic**: Meaningful content changed. This is the default when it's not cosmetic or local.
   - **Structural**: Node category, label, or connections changed (not just content). Detect via: check if category/label/edges changed.

2. **`src/lib/edits.ts`** — `classifyEdit(oldContent, newContent, oldLabel, newLabel, oldCategory, newCategory): EditType`:
   - Fast heuristic classification (no LLM call needed for most cases)
   - Cosmetic: normalized text is identical
   - Local: >80% of key terms preserved, length change <20%
   - Structural: label or category changed
   - Semantic: everything else (default)

3. **`src/store/useStore.ts`** — Update `updateNodeData()`:
   - Before saving, classify the edit
   - Cosmetic → save, no propagation
   - Local → save, no propagation (optional: CID mentions "minor edit noted")
   - Semantic → save + `propagateStaleness(nodeId)`
   - Structural → save + `propagateStaleness(nodeId)` + record structural event

4. **Lifecycle events** — Record the classification:
   - `{ type: 'edited', nodeId, message: 'Semantic edit: content rewritten', editType: 'semantic' }`
   - This creates a visible trail of what happened and why

**Acceptance criteria**:
- Fixing a typo does NOT mark downstream nodes stale
- Rewriting a paragraph DOES mark downstream stale
- Changing a node's label or category DOES propagate
- Edit type is recorded in lifecycle events
- No LLM calls for classification (fast heuristic only)

---

### 4. Impact Preview

**Why**: The spec says: "Before major propagation, users should see what will change" (17.3) and "Show impact before major propagation" (Trust principle 2). Without preview, selective regeneration is a trust problem — users won't click "Refresh stale" if they can't see what's about to happen.

**What it does**: Before regeneration runs, show the user exactly which nodes will be re-executed and which edges carry the change. A confirmation step between "staleness detected" and "regeneration executed".

**How to implement**:

1. **`src/store/useStore.ts`** — Add `previewImpact(): ImpactPreview`:
   - Collects all stale nodes
   - Builds the execution plan (topological order)
   - Returns: `{ staleNodes: [{id, label, category}], executionOrder: string[], estimatedCalls: number }`
   - Does NOT execute anything — just computes what would happen

2. **`src/components/ImpactPreview.tsx`** (new component) — Modal or panel:
   - Shows list of stale nodes that will regenerate
   - Shows the propagation path (which node caused which to go stale)
   - Shows estimated API calls / time
   - "Regenerate all" button to proceed
   - "Select nodes" option to pick which stale nodes to refresh (partial regeneration)
   - "Cancel" to dismiss

3. **Canvas highlighting** — When impact preview is open:
   - Stale nodes glow amber
   - Edges on the propagation path highlight
   - Fresh nodes dim slightly
   - This gives the "transparent factory" feel from Section 3

4. **Integration** — Wire into the flow:
   - "Refresh stale" button → opens ImpactPreview instead of immediately regenerating
   - ImpactPreview "Regenerate" → calls `regenerateStale()`
   - Quick-refresh option for power users: hold Shift + click to skip preview

**Acceptance criteria**:
- Users see exactly what will regenerate before it happens
- Propagation path is visually traced on the canvas
- Users can select/deselect individual nodes from regeneration
- Estimated cost (API calls) is shown
- No surprises — what the preview shows is what executes

---

### 5. Note Refinement

**Why**: The spec describes notes as "raw user thoughts, quick captures, observations, and rough inputs that may later become structured state" (9.3). CID Agent should be able to "turn rough notes into structured memory, convert ideas into objects, and connect those ideas to relevant artifacts or state nodes" (4.6). Right now, note nodes are just text. They don't evolve. This feature makes notes a first-class input that CID can work with.

**What it does**: CID can take a note node's content and transform it — extracting action items into action nodes, structuring observations into state nodes, or connecting ideas to existing nodes via new edges.

**How to implement**:

1. **`src/store/useStore.ts`** — Add `refineNote(nodeId: string)` action:
   - Takes a note node's raw content
   - Sends to `/api/cid` with a refinement-specific prompt
   - The LLM returns structured output: extracted entities, suggested nodes, suggested connections
   - CID presents the suggestions to the user in chat (not auto-applied)

2. **`src/lib/prompts.ts`** — Add `buildNoteRefinementPrompt(noteContent, existingNodes)`:
   - System prompt: "You are analyzing a rough note. Extract structured information."
   - Returns JSON: `{ summary, actionItems[], keyEntities[], suggestedNodes[{label, category, content}], suggestedEdges[{from, to, label}] }`
   - Includes existing node labels so the LLM can suggest connections to existing graph

3. **`src/components/NodeDetailPanel.tsx`** — Add "Refine with CID" button on note nodes:
   - Sends note content to the refinement flow
   - CID responds in chat with suggestions
   - User can accept/reject each suggestion (cards UI already exists)

4. **CID chat integration** — "refine this note" or clicking a note node and asking CID:
   - CID reads the note, proposes structure
   - Presents as clickable cards: "Create action node: [name]", "Connect to [existing node]"
   - Accepting a card executes the action (adds node, adds edge)

**Acceptance criteria**:
- User writes rough text in a note node
- "Refine" action produces structured suggestions
- Suggestions appear as interactive cards in CID chat
- User accepts/rejects each suggestion individually
- Accepted suggestions create real nodes and edges on the canvas
- Note node content can optionally be updated with a cleaner version

---

### 6. Node Versioning

**Why**: The spec requires "versioning across the lifecycle" (11.3) and the ability to "roll back at major lifecycle steps" (Trust principle 5). When selective regeneration changes a node's content, users need to see what changed and undo if the new version is worse. Without versioning, regeneration is a one-way door, which destroys trust.

**What it does**: Each node stores a history of its content snapshots. Users can diff any two versions, and roll back to a previous version.

**How to implement**:

1. **`src/lib/types.ts`** — Add version history to NodeData:
   ```
   _versionHistory?: Array<{
     version: number;
     content: string;
     timestamp: number;
     trigger: 'user-edit' | 'execution' | 'refinement' | 'rollback';
   }>;
   ```
   - Cap at 10 versions per node (older ones pruned)
   - Only store when content meaningfully changes (not cosmetic edits, using item 3's classification)

2. **`src/store/useStore.ts`** — Snapshot on meaningful changes:
   - In `updateNodeData()`: if content changed semantically, push current content to `_versionHistory` before overwriting
   - In `executeNode()`: push pre-execution content before writing `executionResult`
   - Version counter increments

3. **`src/components/NodeDetailPanel.tsx`** — Version history UI:
   - "History (N versions)" expandable section
   - List of versions with timestamp and trigger type
   - Click to view previous content
   - "Restore" button to roll back (creates a new version entry with trigger: 'rollback')
   - Simple text diff: highlight additions (green) and deletions (red)

4. **`src/store/useStore.ts`** — `rollbackNode(nodeId, version)` action:
   - Restores content from the specified version
   - Triggers staleness propagation (downstream is now stale again)
   - Records lifecycle event: `{ type: 'edited', message: 'Rolled back to v3' }`

**Acceptance criteria**:
- Every meaningful content change creates a version snapshot
- Users can view previous versions in NodeDetailPanel
- Users can roll back to any previous version
- Rollback triggers staleness propagation
- Version history is capped (no unbounded storage growth)
- Cosmetic edits don't create new versions

---

## What we are NOT building (and why)

These were in the 93-item roadmap. They are cut because they don't serve the core lifecycle loop:

- **Agent personality layers** (5-layer architecture, drive tensions, sedimentation) — Over-engineered. Users notice tone, not internal drive weight calculations. Rowan and Poirot work fine with simple prompt differences.
- **Hover-to-render node previews** — UI polish. Doesn't make the workflow more alive.
- **Variable inspector / debug panel** — Developer tool, not user tool. Console logs are enough for now.
- **Conditional execution expressions** — Premature. Users aren't building workflows complex enough to need `if inputLength > 200` guards.
- **YAML export** — Nice-to-have. JSON export works.
- **Planning agent (two-phase generation)** — Optimization for generation quality. Generation already works. The lifecycle after generation is the gap.
- **Scored intent disambiguation** — Edge case handling. Most prompts are clear enough.
- **Keyboard shortcut customization** — UI polish.
- **Template marketplace** — Distribution feature. Need the product to be good first.

These can be revisited later if real usage demands them. Right now, they are distractions from the core loop.

---

## Implementation order and dependencies

```
[1. Staleness Propagation]
         ↓
[2. Selective Regeneration]
         ↓
[3. Edit Interpretation]
         ↓
[4. Impact Preview]
         ↓
[5. Note Refinement]      (independent, but benefits from 1-4 being solid)
         ↓
[6. Node Versioning]      (independent, but rollback triggers staleness from item 1)
```

Items 1-4 form the core lifecycle loop. They must be built in order.
Items 5-6 are independent features that plug into the loop.

After all 6 are done, Lifecycle Agent will do what the spec promises: workflows that stay alive after generation.

---
---

# Phase 2 — CID as Proactive Intelligence

Phase 1 makes the lifecycle loop work. But the loop is still user-initiated: the user edits, the user clicks "refresh stale", the user decides what to do next. The spec says CID should be more than that:

> CID Agent watches the living system over time, marking stale outputs, tracking drift, and helping the project stay coherent. (Section 4.7)

> The agent should actively create, refine, and optimize the workflow. (8.5)

Phase 2 makes CID a proactive partner, not a reactive tool.

---

### 7. Workflow Health Monitor

**Why**: The spec says CID should "track stale outputs" and "help users navigate complex systems" (4.7, 4.2). Right now there's a basic `getHealthScore()` that counts issues, but it's a static number. A real health monitor watches the workflow over time and surfaces problems before the user notices.

**What it does**: After any execution or edit, CID silently evaluates the workflow and surfaces actionable observations. Not a dashboard — a living awareness.

**How to implement**:

1. **`src/lib/health.ts`** (new file) — `assessWorkflowHealth(nodes, edges)`:
   - Returns structured report: `{ score, issues[], suggestions[] }`
   - Issues: disconnected nodes, long chains without review gates, stale nodes sitting for >5min, nodes with no content, circular dependency risk
   - Suggestions: "Add a review node after X", "Node Y has been stale since execution — refresh?", "Z has no downstream — is it an output?"

2. **`src/store/useStore.ts`** — Call `assessWorkflowHealth()` after `executeWorkflow()` and `propagateStale()` complete:
   - If there are high-priority issues, CID posts an ephemeral message with the top 1-2
   - Not every time — debounce to avoid spam. Only surface new issues (track `_lastHealthIssues`)

3. **CID chat** — "health" / "status" commands already exist, but enhance them:
   - Include the structured assessment, not just a score number
   - "3 nodes have been stale for 10+ minutes. 1 node has no downstream connections."

**Acceptance criteria**:
- After workflow execution, CID mentions if something looks wrong (but only if it's new)
- "health" command gives a structured assessment, not just a number
- Suggestions are actionable ("add review gate after X", not "workflow could be better")
- No spam — CID doesn't repeat the same issue

---

### 8. Proactive CID Suggestions ✅

**Why**: The spec says CID should "suggest missing nodes or dependencies" (4.2) and "propose next steps" (4.7). Right now, suggestions appear as clickable chips below CID messages, but they're generic ("solve", "propagate"). CID should look at the actual graph and suggest specific next actions.

**What it does**: After workflow generation or execution, CID analyzes the graph structure and proactively suggests what's missing or what the user should do next. These appear as interactive cards the user can accept or dismiss.

**How to implement**:

1. **`src/lib/suggestions.ts`** (new file) — `generateProactiveSuggestions(nodes, edges)`:
   - Pattern detection: "You have an input node but no output node — add one?"
   - Gap detection: "Node X produces content but nothing consumes it"
   - Quality detection: "3 artifact nodes have no content yet — want me to generate?"
   - Flow detection: "This workflow is linear — add a review gate between phases?"
   - Returns `Suggestion[]` with `{ type, message, action, priority }`

2. **`src/store/useStore.ts`** — After `generateWorkflow()` completes:
   - Run `generateProactiveSuggestions()` on the resulting graph
   - Present top 2-3 as CID message with clickable cards
   - Each card has an action: "Add output node", "Generate content for X", "Connect X to Y"

3. **Card actions** — When user clicks a suggestion card:
   - "Add node" → creates the node and connects it
   - "Generate content" → runs `executeNode()` on the target
   - "Connect" → creates the edge
   - "Dismiss" → removes the suggestion

**Acceptance criteria**:
- After generating a workflow, CID suggests 1-3 specific improvements
- Suggestions are based on actual graph analysis, not generic
- Clicking a suggestion executes the action immediately
- Dismissed suggestions don't reappear

---

### 9. Semantic Diff View

**Why**: The spec requires "diff-first review" (17.4) — "users should approve important updates through clear before-and-after views." After selective regeneration, users need to see what actually changed, not just that a node was re-executed. This builds on item 6 (versioning) by making the version history visual.

**What it does**: A side-by-side or inline diff view showing what changed in a node's content after regeneration. Users can accept or reject the changes.

**How to implement**:

1. **`src/lib/diff.ts`** (new file) — Simple line-level diff:
   - `computeDiff(oldText, newText): DiffLine[]`
   - Each line marked as `added`, `removed`, or `unchanged`
   - No external dependency — implement a basic LCS (Longest Common Subsequence) diff

2. **`src/components/DiffView.tsx`** (new component):
   - Takes old and new content strings
   - Renders inline diff: removed lines in red, added lines in green, unchanged in gray
   - "Accept" button (keeps new version) and "Revert" button (rolls back via item 6)
   - Compact mode for NodeDetailPanel, expanded mode for full-screen review

3. **`src/components/NodeDetailPanel.tsx`** — After execution/regeneration:
   - If version history exists and content changed, show "View changes" link
   - Opens DiffView comparing previous version to current

4. **Integration with Impact Preview (item 4)**:
   - After selective regeneration completes, each refreshed node shows a diff badge
   - User can review each change before the workflow continues

**Acceptance criteria**:
- After regeneration, users can see exactly what changed in each node
- Diff is readable (color-coded additions/deletions)
- Users can revert individual node changes without affecting others
- Works with the versioning system from item 6

---

### 10. Workflow Optimization

**Why**: Spec Section 4.5 — "CID Agent can suggest better paths, reduce redundant nodes, merge overlapping steps, and reorganize the graph for clarity and efficiency." After the lifecycle loop is working and CID is proactive, the next level is CID actively improving the graph structure.

**What it does**: CID analyzes the workflow graph and proposes structural improvements. Not just layout rearrangement (that exists) — actual graph surgery: merging duplicate nodes, splitting overloaded nodes, adding missing connections.

**How to implement**:

1. **`src/lib/optimizer.ts`** (new file) — `analyzeGraphForOptimization(nodes, edges)`:
   - Detect duplicate nodes: same category + similar labels (Levenshtein distance < 3)
   - Detect overloaded nodes: single node with 5+ downstream connections (fan-out bottleneck)
   - Detect orphan chains: subgraph with no connection to the main workflow
   - Detect missing feedback loops: output nodes with no path back to review/policy nodes
   - Returns `Optimization[]` with `{ type, description, affectedNodes[], proposedAction }`

2. **`src/store/useStore.ts`** — `optimizeWorkflow()` action:
   - Runs analysis, presents findings as CID message with cards
   - Each card is a proposed optimization the user can accept or reject
   - "Merge X and Y into single node", "Split Z into two nodes", "Add review gate"

3. **CID chat** — "optimize" command (already exists but only does layout):
   - Enhanced to include structural optimization suggestions
   - Layout optimization remains as a secondary action

**Acceptance criteria**:
- CID can identify duplicate, overloaded, and disconnected nodes
- Optimizations are proposed, not auto-applied (user control, spec Section 18)
- Accepting an optimization modifies the graph correctly
- No data loss — merged nodes combine content, not discard it

---

## Phase 2 implementation order

```
[7. Health Monitor]     — CID notices problems
        ↓
[8. Proactive Suggestions] — CID proposes solutions
        ↓
[9. Semantic Diff View]    — Users review changes (builds on item 6)
        ↓
[10. Workflow Optimization] — CID improves graph structure
```

---
---

# Phase 3 — Product Completeness

Phase 1 makes workflows alive. Phase 2 makes CID intelligent. Phase 3 makes the product usable for real work. These address the question: "How does work actually leave the system?"

---

### 11. Rich Output Export

**Why**: Execution results live inside nodes. But real users need deliverables: a PDF report, an HTML page, a markdown document, a structured dataset. Right now, the only export is a raw JSON workflow dump. The spec says the system manages "artifacts" (9.2) — generated or maintained outputs such as docs, slides, sheets, prompts, files.

**What it does**: Output nodes can export their execution results as real files in useful formats.

**How to implement**:

1. **`src/lib/export.ts`** (new file) — Format converters:
   - `exportAsMarkdown(content)` — clean markdown with proper headings
   - `exportAsHTML(content)` — styled HTML document from markdown content
   - `exportAsText(content)` — plain text, stripped of markdown formatting
   - Each returns a `Blob` ready for download

2. **`src/components/NodeDetailPanel.tsx`** — Export button on output nodes:
   - Dropdown: "Download as Markdown / HTML / Text"
   - Uses the execution result (or content) as source
   - Triggers browser download

3. **`src/store/useStore.ts`** — "Compile" action for multi-node export:
   - `compileWorkflow()` — aggregates all execution results in topological order into a single document
   - Sections are named after node labels
   - Downloadable as a combined markdown/HTML file

4. **CID chat** — "export" / "compile" / "download" commands:
   - "export" → workflow JSON (already exists)
   - "compile" → combined output document
   - "download [node name]" → single node export

**Acceptance criteria**:
- Output nodes have a "Download" button with format options
- Combined workflow output compiles into a single document
- Downloaded files are properly formatted and usable
- CID chat supports export commands

---

### 12. Artifact Preview Panel

**Why**: The spec's "transparent factory" metaphor (Section 3) — users should see what's being built, not just node cards on a canvas. When a workflow has 10+ nodes with execution results, users need a way to browse the actual content without clicking each node individually.

**What it does**: A panel that shows rendered content of the selected node or all executed nodes in reading order. Like a document preview that updates as the workflow runs.

**How to implement**:

1. **`src/components/ArtifactPanel.tsx`** — enhance the existing artifact panel:
   - Currently shows raw markdown text for one node
   - Upgrade to render markdown as formatted HTML (headings, lists, code blocks, tables)
   - Add navigation: prev/next node buttons to walk through execution results in order
   - "Reading mode": full-width panel showing all node outputs as a continuous document

2. **Markdown rendering**:
   - `markdownToHTML()` already exists in `src/lib/graph.ts`
   - Apply CSS styling: proper typography, code highlighting, table borders
   - Scrollable container with section anchors per node

3. **Live updates during execution**:
   - When a node is executing, show a skeleton/placeholder
   - When execution completes, fade in the result
   - This is the "watch the system build" experience from spec Section 14

**Acceptance criteria**:
- Users can browse execution results as formatted content, not raw text
- Navigation between nodes is smooth (prev/next or scroll)
- Content renders properly (headings, lists, code, tables)
- Panel updates live during workflow execution

---

### 13. Project Persistence & Multi-Project

**Why**: Everything is in localStorage right now. One project, one browser, no sharing. For real use, users need to save multiple projects and switch between them. The spec requires "persistent memory of work" (11.1) and "project metadata" (Section 16).

**What it does**: Multiple projects stored locally with a project switcher. Each project has its own graph, messages, events, and execution state.

**How to implement**:

1. **`src/lib/storage.ts`** (new file) — Project storage manager:
   - `listProjects()` — returns `{id, name, nodeCount, lastModified}[]` from localStorage
   - `loadProject(id)` — loads a specific project's state
   - `saveProject(id, state)` — saves current state under a project ID
   - `deleteProject(id)` — removes a project
   - `createProject(name)` — new blank project
   - Each project stored under `lifecycle-project-{id}` key

2. **`src/store/useStore.ts`** — Multi-project state:
   - `currentProjectId: string`
   - `switchProject(id)` — saves current, loads target
   - `projectName` already exists — wire it to project metadata

3. **`src/components/TopBar.tsx`** — Project switcher:
   - Dropdown showing saved projects
   - "New project" button
   - Current project name displayed and editable
   - Last modified timestamp per project

**Acceptance criteria**:
- Users can create multiple projects
- Switching projects saves current state and loads the other
- Projects persist across browser sessions
- Deleting a project requires confirmation
- At least 10 projects can coexist without hitting localStorage limits

---

### 14. Undo/Redo That Actually Works

**Why**: There's undo/redo infrastructure in the store (`history`, `future`, `pushHistory`), but it captures raw state snapshots — which can be huge (the full node + edge + message array). With versioning (item 6) and the lifecycle loop creating frequent state changes, undo needs to be reliable and efficient.

**What it does**: Reliable undo/redo for node edits, edge changes, and CID actions. Not for chat messages (those are append-only).

**How to implement**:

1. **`src/store/useStore.ts`** — Replace snapshot-based undo with operation-based undo:
   - Instead of storing full state snapshots, store operations: `{ type: 'updateNode', nodeId, before, after }`
   - Each operation is invertible: undo replays the `before`, redo replays the `after`
   - Cap at 50 operations

2. **Operations to track**:
   - Node data changes (content, label, category)
   - Node creation/deletion
   - Edge creation/deletion
   - Status changes
   - NOT: execution results (those are computed, not user actions)
   - NOT: chat messages (append-only log)

3. **Keyboard shortcuts** — Already exist (Cmd+Z / Cmd+Shift+Z), just need reliable operations behind them

**Acceptance criteria**:
- Cmd+Z undoes the last node/edge change
- Cmd+Shift+Z redoes it
- Undo doesn't affect chat history or execution state
- Works correctly with staleness propagation (undoing an edit should un-stale downstream)
- Memory-efficient (operations, not full snapshots)

---

## Phase 3 implementation order

```
[11. Rich Output Export]      — Work leaves the system
        ↓
[12. Artifact Preview Panel]  — See content, not just nodes
        ↓
[13. Multi-Project]           — Real persistent usage
        ↓
[14. Undo/Redo]               — Trust and safety net
```

---
---

# Full timeline estimate

```
Phase 1 — Lifecycle Loop (items 1-6)     ~5-6 hours
Phase 2 — CID Intelligence (items 7-10)  ~4-5 hours
Phase 3 — Product Completeness (11-14)   ~4-5 hours
                                         ─────────
                                         ~13-16 hours
```

After item 14, Lifecycle Agent has:
- A working lifecycle loop (edit → stale → regenerate)
- An intelligent CID that watches, suggests, and optimizes
- Real output (exports, previews, formatted content)
- Multiple projects with reliable undo

That's a product someone can actually use, not a feature collection.
