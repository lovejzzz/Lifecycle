# Lifecycle Agent - Project Guidelines

## Overview

Lifecycle Agent is a node-based visual workflow builder with AI orchestration powered by CID Agent ("Consider It Done"). It uses React Flow for graph visualization and Zustand for state management, with LLM providers (DeepSeek, Anthropic, OpenRouter) for AI capabilities.

## Tech Stack

- **Framework**: Next.js 16, React 19, TypeScript 5.9 (strict mode)
- **State**: Zustand 5 with slice architecture (decomposition in progress)
- **UI**: React Flow 12, Tailwind CSS 4, Framer Motion 12, Lucide icons
- **Backend**: Next.js API routes, Supabase (auth/storage), SSE streaming
- **Testing**: Vitest (unit/integration), Playwright (E2E)

## Common Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run check        # Full quality gate: typecheck + lint + build
npm run test         # Run unit/integration tests (Vitest)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
npm run e2e          # Playwright E2E tests (headless)
npm run e2e:headed   # E2E with browser visible
npm run typecheck    # TypeScript strict check
npm run lint         # ESLint
npm run format       # Prettier format
npm run format:check # Prettier check (CI)
```

## Architecture

```
src/
  app/           # Next.js pages + API routes
    api/cid/     # LLM orchestration (provider fallback, streaming, auth)
    api/upload/  # Document parsing (PDF, DOCX)
  components/    # React components (Canvas, CIDPanel, NodeDetailPanel, etc.)
  store/         # Zustand state management
    useStore.ts  # Main store (7K+ LOC, decomposing into slices)
    slices/      # Extracted slices (uiSlice, artifactSlice)
    types.ts     # Store type definitions
    helpers.ts   # Shared utilities (undo, cidLog)
  lib/           # Pure business logic
    agents.ts    # 5-layer agent personalities (Rowan/Poirot)
    prompts.ts   # LLM prompt builders
    routing.ts   # 70+ command router
    intent.ts    # NLP intent detection
    graph.ts     # Graph algorithms (topo sort, layout)
    health.ts    # Workflow health analysis
    reflection.ts # Agent personality evolution
    storage.ts   # Project persistence (localStorage + Supabase)
    cache.ts     # LLM response caching (SHA-256)
    __tests__/   # 22 test files, 13K+ LOC
```

## Key Design Decisions

- **Store slices**: `useStore.ts` is being decomposed. New state should go into `store/slices/`. Never add to the monolithic store.
- **Edge labels**: Always use `inferEdgeLabel()` from `graph.ts`. Don't hardcode relationship strings.
- **Error handling**: Use `console.warn('[Module]', err)` with module prefix. Never silently swallow errors with empty catch blocks.
- **Types**: Avoid `any`. Use proper React Flow types: `Node<NodeData>`, `Edge`, `NodeChange[]`. If you must use `any`, add a `// TODO: type this` comment.
- **Constants**: No magic numbers. Define constants at file top with descriptive names.
- **Components**: Keep under 500 LOC. Extract sub-components for complex UI.
- **Tests**: Every new lib function needs a test in `__tests__/`. Maintain 75%+ coverage.

## AI Provider Fallback Chain

DeepSeek (primary) -> Anthropic (secondary) -> OpenRouter (tertiary)

Server-side only via `/api/cid`. Never expose API keys client-side.

## Node Categories

input, trigger, state, artifact, note, cid, action, review, test, policy, patch, dependency, output + custom

## Testing Patterns

- **Unit tests**: Pure functions in `lib/` - use Vitest with globals
- **Integration tests**: `simulation*.test.ts` - exercise real Zustand store with mock AI
- **E2E tests**: `e2e/lifecycle-loop.spec.ts` - Playwright against dev server
- **Routing benchmark**: `routing-benchmark.test.ts` - 158 prompts, must maintain 100% accuracy

## Known Issues & Gotchas

- `useStore.ts` is 7K+ lines. Slice extraction is ongoing - check `slices/` before adding state.
- React Flow callbacks use `any` - these need incremental typing.
- localStorage persistence has silent catches that should be replaced with warn logging.
- The `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call()` pattern in Canvas is fragile - use refs instead when refactoring.
- Branch test coverage (64.6%) is lower than statement coverage (75.5%) - prioritize error path tests.

## Code Style

- 2-space indentation, single quotes, trailing commas
- Tailwind for styling (no CSS modules)
- Functional components with hooks (no class components)
- Named exports preferred over default exports
- Import order: React/Next -> external libs -> @/ internal -> relative
