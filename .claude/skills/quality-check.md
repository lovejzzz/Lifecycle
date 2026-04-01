---
name: quality-check
description: Run full quality gate (typecheck, lint, format, test, build)
---

Run the full quality pipeline and report results:

1. Run `npm run typecheck` and capture any TypeScript errors
2. Run `npm run lint` and capture any ESLint warnings/errors
3. Run `npx prettier --check "src/**/*.{ts,tsx}"` and capture formatting issues
4. Run `npm run test` and capture test results
5. Run `npm run build` and verify it succeeds

Report a summary:
- Total issues found per category
- Files with the most issues
- Whether the build passes
- Recommendations for the highest-impact fixes
