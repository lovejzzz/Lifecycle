# Eval Report — 2026-03-08T11-46-27

Overall: **100%** (6/6 passed) | Pool: 54 tests, 6 selected

## eng-code-review — 100% (124822ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "PRs sit for days because nobody reviews them. I want an automated workflow: PR opened → assign reviewer → review deadline → merge or request changes → deploy."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "review" category
  - ✓ Has "action" category
  - ✓ All 7 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 820c, no thin nodes
  - ✓ Architecture covers: assign, deadline, merge, deploy
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (7 edges, 7 nodes)
- Nodes: GitHub PR Created (trigger), Auto-Assign Reviewer (action), Set Review Deadline (action), PR Review State (state), Manual Code Review (review), Merge PR (action), Deploy to Production (output)
- Message preview: Mission received. Building automated PR review workflow to eliminate delays.

## support-escalation — 100% (171550ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "Customers keep complaining their tickets go into a black hole. Design an escalation workflow — ticket comes in, auto-classify priority, route to right team, SLA tracking, escalate if overdue."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ Has "trigger" category
  - ✓ All 9 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 994c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (9 edges, 8 nodes)
- Nodes: Ticket Submission Trigger (trigger), Auto-classify Priority (action), Route to Designated Team (action), SLA Compliance Rules (policy), Active Ticket Handling (state), SLA Monitoring and Tracking (action), Escalation Procedure (action), Resolution or Escalation Report (output)
- Message preview: Aha! The case of the vanishing tickets is a classic one, mon ami. I have designed an escalation workflow that will shine a light on every step, ensuring no ticket escapes scrutiny. Voilà, the blueprin...

## execute-sow — 100% (62720ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (6597 chars)
  - ✓ Content length: 6597 ≥ 300
- Message preview: # Statement of Work: E-Commerce Web Application Redesign

**Project Title:** E-Commerce Platform Redesign & Modernization
**Client:** [Client Name, e.g., "TrendSource Retail Inc."]
**Vendor/Service Pr...

## personality-rowan-empty — 100% (19814ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (151 chars)
  - ✓ Personality markers present
- Message preview: Current graph is empty. Provide a specific request to build a workflow, and I'll deploy the architecture. If you need guidance, specify your objective.

## education-course-launch — 100% (143241ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "I'm creating an online course on data analytics. I need a workflow: outline curriculum, record videos, build exercises, set up LMS, beta test with students, launch and market."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ All 9 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 909c, no thin nodes
  - ✓ Architecture covers: curriculum, record, exercise, lms
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (9 edges, 7 nodes)
- Nodes: Course Creation Trigger (trigger), Curriculum Outline Design (action), Video Content Production (action), Exercise and Assessment Building (action), LMS Setup and Integration (action), Beta Testing Phase (test), Course Launch and Marketing (output)
- Message preview: Aha! Mon ami, let us investigate this case of course creation. With my little grey cells, I have devised a meticulous workflow to ensure your data analytics course is a masterpiece—très intéressant!

## strategy-advice-pivot — 100% (23211ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "Our B2B SaaS has 200 customers paying $50/mo but enterprise prospects keep asking for features that would require 6 months of engineering. Should we go upmarket or double down on SMB? Our team is 8 people."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (427 chars)
  - ✓ Message length: 427 ≥ 250
- Message preview: Aha! This is a classic strategic case—your little grey cells must weigh the evidence. For upmarket, analyze enterprise feature ROI using financial models and customer lifetime value projections; for S...

