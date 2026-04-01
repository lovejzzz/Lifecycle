---
name: audit-and-improve
description: Continuous improvement audit - find and fix the highest-impact issues
---

Perform a targeted improvement cycle on the Lifecycle Agent project:

## Step 1: Assess Current State
- Run `npm run test:coverage` to get current coverage numbers
- Run `npm run typecheck` to count TypeScript errors
- Run `npm run lint` to count lint warnings
- Check for silent catch blocks: `grep -rn "catch.*{" src/ | grep -v node_modules`
- Check for `any` usage: `grep -rn ": any" src/ --include="*.ts" --include="*.tsx" | wc -l`
- Check for console.log: `grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l`

## Step 2: Pick the Highest-Impact Fix
Choose ONE area to improve based on severity:
1. Security issues (exposed keys, missing auth) - CRITICAL
2. Silent error handling (empty catch blocks) - HIGH
3. Type safety improvements (replace `any`) - MEDIUM
4. Dead code removal - LOW
5. Test coverage gaps - MEDIUM
6. Magic number extraction - LOW

## Step 3: Implement the Fix
- Make the smallest, safest change that addresses the issue
- Run tests after the change to verify nothing breaks
- If tests fail, revert and pick a different improvement

## Step 4: Report
- What was improved
- Before/after metrics
- What should be improved next
