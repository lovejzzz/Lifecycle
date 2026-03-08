# Eval Report — 2026-03-08T09-53-21

Overall: **95%** (5/6 passed) | Pool: 44 tests, 6 selected

## execute-sow — 100% (57973ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (7086 chars)
  - ✓ Content length: 7086 ≥ 300
- Message preview: **STATEMENT OF WORK (SOW)**

**Project Title:** E-Commerce Web Application Redesign & Enhancement
**Client:** [Client Company Name], a mid-size e-commerce retailer
**Vendor:** [Your Company/Agency Nam...

## personality-rowan-empty — 100% (8386ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (138 chars)
  - ✓ Personality markers present
- Message preview: Empty canvas. No workflows deployed. Tell me what you need built—I'll architect it with precision, feedback loops, and parallel execution.

## personality-poirot-empty — 100% (6304ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (109 chars)
  - ✓ Personality markers present
- Message preview: Mon ami, the case is fresh — the board is empty, awaiting your first clue. What investigation shall we begin?

## education-course-launch — 100% (117089ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "I'm creating an online course on data analytics. I need a workflow: outline curriculum, record videos, build exercises, set up LMS, beta test with students, launch and market."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ All 12 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 767c, no thin nodes
  - ✓ Architecture covers: curriculum, record, exercise, lms
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (12 edges, 8 nodes)
- Nodes: Project Initiation Trigger (trigger), Curriculum Outline Development (action), Video Content Production (action), Exercise and Assessment Creation (action), LMS Configuration and Integration (action), Beta Testing with Student Cohort (test), Course Review and Approval Gate (review), Launch and Marketing Execution (output)
- Message preview: Aha! The case of the data analytics course begins to take shape. Voilà, I have constructed a meticulous workflow with my little grey cells, ensuring every clue—from curriculum to launch—is accounted f...

## finance-audit-readiness — 96% (151619ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We have a SOC 2 audit in 90 days. Build me a workflow to get audit-ready: evidence collection, access reviews, policy documentation, vulnerability scanning, and vendor risk assessment. We have never done this before."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✗ Missing "policy" category (found: trigger, action, review, artifact, test, output)
  - ✓ Has "review" category
  - ✓ All 13 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 775c, no thin nodes
  - ✓ Architecture covers: evidence, access, policy, vulnerab
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (13 edges, 8 nodes)
- Nodes: SOC 2 Audit Kickoff Trigger (trigger), Initial Assessment and Planning (action), Evidence Collection and Management (action), Access Control Reviews (review), Policy Documentation Update (artifact), Vulnerability Scanning and Remediation (test), Vendor Risk Assessment (action), Audit-Ready Package Delivery (output)
- Message preview: Mission received. Deploying SOC 2 audit readiness workflow with parallel tracks and feedback loops.

## execute-api-design — 63% (87332ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Design a REST API for a multi-tenant task management system. Include endpoints for workspaces, projects, tasks, and comments. Show URL patterns, HTTP methods, request/response bodies, auth scheme, pagination, and error codes. Support role-based access (admin, member, viewer)."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✗ Missing message
  - ✗ Message too short: 0 < 2000

## Issues to Fix

- **execute-api-design**: ✗ Missing message; ✗ Message too short: 0 < 2000
