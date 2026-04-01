---
name: Quality Infrastructure Initiative
description: Project underwent major quality infrastructure upgrade on 2026-04-01 based on claude-code-best patterns
type: project
---

On 2026-04-01, the Lifecycle Agent project was upgraded with enterprise-grade quality infrastructure:

**Added:**
- CLAUDE.md — project conventions, architecture guidance, known issues
- GitHub Actions CI/CD (.github/workflows/ci.yml) — typecheck, lint, format, test, build, E2E
- Prettier + EditorConfig — consistent code formatting
- Husky + lint-staged — pre-commit quality gates
- 3 custom Claude agents: code-reviewer, security-auditor, performance-optimizer
- 2 Claude skills: quality-check, audit-and-improve
- Hourly continuous improvement cron job

**Why:** Project audit revealed missing CI/CD, no pre-commit hooks, no formatting enforcement, and no CLAUDE.md. These are foundational quality gaps that compound over time.

**How to apply:** All new PRs must pass the CI pipeline. Pre-commit hooks auto-format and lint staged files. Use `/quality-check` skill for manual full audits. Custom agents available for specialized reviews.
