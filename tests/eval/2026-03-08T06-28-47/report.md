# Eval Report — 2026-03-08T06-28-47

Overall: **99%** (6/6 passed) | Pool: 32 tests, 6 selected

## founder-advice — 88% (2186ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "We're burning $50k/month and have 6 months of runway. What should I prioritize?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (63 chars)
  - ✗ Message too short: 63 < 80
- Message preview: Mission received. Prioritize runway extension and cost control.

## eng-code-review — 100% (54162ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "PRs sit for days because nobody reviews them. I want an automated workflow: PR opened → assign reviewer → review deadline → merge or request changes → deploy."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "review" category
  - ✓ Has "action" category
  - ✓ All 6 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 631c, no thin nodes
- Nodes: PR Opened (trigger), Assign Reviewer (action), Review Deadline Monitor (state), Review Approval Gate (review), Merge PR (action), Deploy to Staging (action), Deployment Success Output (output)
- Message preview: Mission received. Building automated PR review workflow.

## pm-feature-ship — 100% (49848ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "I need to ship a new payments feature. It touches billing, the API, the frontend, and we need legal to review the T&C changes. Give me a workflow that makes sure nothing falls through the cracks."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "review" category
  - ✓ All 7 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 561c, no thin nodes
- Nodes: Feature Kickoff & Requirements (input), Technical Design & Implementation (action), Legal T&C Review (review), Integration Testing (test), Security & Compliance Audit (policy), Stakeholder Sign-off (review), Production Deployment & Monitoring (output)
- Message preview: Mission received. Building deployment workflow with checkpoints.

## pm-user-research — 100% (89373ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We're redesigning our onboarding flow. I want to do proper user research — recruit users, run interviews, analyze findings, create recommendations, test prototypes. Build this for me."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ All 7 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 1213c, no thin nodes
- Nodes: Research Kickoff & Recruitment (trigger), Interview Protocol Design (action), User Interview Sessions (action), Thematic Analysis & Synthesis (artifact), Recommendations & Hypothesis Formulation (action), Prototype Development (artifact), Usability Testing & Validation (test), Research Synthesis & Handoff (output)
- Message preview: Ah, mon ami! A redesign case worthy of the little grey cells. Let us investigate this onboarding flow with proper detective work — gathering evidence from users, analyzing the clues, and building a wa...

## execute-incident-postmortem — 100% (44791ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a blameless post-mortem for a 2-hour production outage caused by a database migration that locked a critical table. 500 customers were affected. Include timeline, root cause, impact, and action items."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (6400 chars)
  - ✓ Content length: 6400 ≥ 300
- Message preview: # Blameless Post-Mortem Report: Production Outage Due to Database Table Lock

**Date of Incident:** October 26, 2023  
**Start Time:** 14:30 UTC  
**End Time:** 16:30 UTC  
**Duration:** 2 hours  
**S...

## personality-poirot-empty — 100% (3825ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (169 chars)
  - ✓ Personality markers present
- Message preview: Ah, mon ami, the case is fresh—the canvas is blank, awaiting the first clue. Let us gather the evidence and construct a meticulous workflow to solve the mystery at hand.

