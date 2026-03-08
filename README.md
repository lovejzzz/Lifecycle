# Lifecycle Agent

A node-based visual workflow builder with built-in AI orchestration (CID Agent — "Consider It Done"). Reimagines workflows as living systems that remain stateful, editable, and continuously aware of their entire lifecycle.

**Tech Stack:** Next.js 16 · React 19 · React Flow · Zustand · Framer Motion · Tailwind CSS

---

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Add your API keys to .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPSEEK_API_KEY` | One of these | DeepSeek API key (primary provider) |
| `ANTHROPIC_API_KEY` | required | Anthropic API key (Claude models) |
| `OPENROUTER_API_KEY` | | OpenRouter API key (fallback provider) |
| `OPENROUTER_MODEL` | No | Override default OpenRouter model |

Provider priority: DeepSeek > Anthropic > OpenRouter. The model picker in the UI selects which model family to use; the server routes to the appropriate provider.

## Architecture

```
src/
├── app/
│   ├── layout.tsx          # Root layout (next/font, metadata)
│   ├── page.tsx            # Main canvas page
│   ├── globals.css         # Tailwind + custom styles
│   └── api/cid/route.ts    # Server-side AI route (DeepSeek, Anthropic, OpenRouter)
├── components/
│   ├── LifecycleNode.tsx   # Custom React Flow node renderer
│   ├── NodeDetailPanel.tsx # Side panel for node editing
│   ├── CIDPanel.tsx        # AI chat panel (Rowan/Poirot)
│   ├── TopBar.tsx          # Navigation, add node, undo/redo, export/import
│   └── ActivityPanel.tsx   # Event timeline
├── store/
│   └── useStore.ts         # Zustand store (~4,400 lines) — graph state, chat, execution
└── lib/
    ├── types.ts            # TypeScript types, node categories, colors, icons
    ├── agents.ts           # Agent personalities (Rowan/Poirot), interview system
    ├── prompts.ts          # LLM system prompt & message builders
    ├── graph.ts            # Graph utilities (layout, topo sort, edge helpers)
    └── intent.ts           # NLP intent detection & node generation from prompts
```

### Key Design Decisions

- **Agent-First**: CID is the engine, the canvas is just the renderer. Everything is created through conversation.
- **Dual Agents**: Rowan (action-first, no questions) and Poirot (investigates first, interviews user).
- **Server-Side AI**: All LLM traffic routes through `/api/cid`. No browser-side API keys.
- **13 Node Categories**: input, trigger, state, artifact, note, cid, action, review, test, policy, patch, dependency, output.
- **localStorage Persistence**: Workflow state auto-saves with debounced writes. Ephemeral messages (welcome-back greetings) are excluded.

### Data Flow

```
User input → CIDPanel → chatWithCID() → /api/cid → LLM → Response parsing
                                                          → Node normalization
                                                          → Edge normalization
                                                          → Graph update
```

Workflow execution:
```
run workflow → topoSort() → parallel level execution → /api/cid per node → results
```

## Scripts

```bash
npm run dev        # Development server
npm run build      # Production build
npm run start      # Start production server
npm run typecheck  # TypeScript type checking
npm run lint       # ESLint
npm run check      # typecheck + build
```

## Security

- API keys are stored **server-side only** via environment variables
- No browser-side API key storage or direct provider calls
- Workflow export strips any legacy `apiKey` fields from node data
- Import validates structure before applying

## Node Categories

| Category | Icon | Color | Purpose |
|----------|------|-------|---------|
| input | Upload | Blue | Data entry points, file uploads, URL imports |
| trigger | Zap | Purple | Event/webhook/cron initiators |
| state | GitBranch | Indigo | Status tracking, project state |
| artifact | FileText | Cyan | Documents, code, generated content |
| note | StickyNote | Yellow | Research, ideas, comments |
| cid | Cpu | Emerald | AI processing steps |
| action | Play | Fuchsia | Operations (deploy, notify, transform) |
| review | ShieldCheck | Rose | Human approval gates |
| test | FlaskConical | Teal | QA/validation steps |
| policy | Scale | Slate | Rules, compliance, constraints |
| patch | Wrench | Orange | Fixes, hotfixes |
| dependency | Package | Lime | Prerequisites, requirements |
| output | Send | Violet | Final deliverables |

Custom categories are also supported — CID can create any category name with auto-generated colors.

## Commands

The CID chat panel supports 70+ commands organized by category:

- **Analysis**: `status`, `explain`, `summarize`, `validate`, `health detail`, `bottlenecks`, `critical path`, `orphans`, `count`, `progress`, `why <name>`, `what if remove <name>`, `deps <name>`, `suggest`
- **Node Operations**: `add`, `delete`, `rename`, `duplicate`, `merge`, `set`, `lock`, `describe`, `content`, `focus`, `list`, `auto-describe`
- **Edges & Layout**: `connect`, `disconnect`, `reverse`, `relabel`, `swap`, `optimize`, `group`, `isolate`
- **Execution**: `run workflow`, `execute <name>`, `preflight`, `plan`, `retry failed`, `clear results`, `diff last run`
- **Batch & Fix**: `solve`, `propagate`, `compress`, `approve all`, `unlock all`, `clear stale`, `batch`
- **Save & History**: `save`, `restore`, `snapshots`, `diff`, `clone`, `save template`, `load template`, `templates`, `undo`, `redo`, `search`
- **Agent**: `help`, `teach`, `rules`, `forget`, `/mode`, `/clear`, `/new`, `/export`, `/export-chat`, `/template`

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full development history.
