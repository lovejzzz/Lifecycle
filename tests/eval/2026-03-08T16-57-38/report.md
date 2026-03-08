# Eval Report — 2026-03-08T16-57-38

Overall: **98%** (6/6 passed) | Pool: 78 tests, 6 selected

## support-advice — 88% (4212ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "Our CSAT score dropped to 3.2 out of 5. Average first response time is 8 hours. What should we fix first?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (224 chars)
  - ✗ Message too short: 224 < 250
- Message preview: First, fix the 8-hour first response time—that's your critical failure point. Implement an SLA-driven triage system with automated ticket routing and escalation triggers, then measure impact before ta...

## execute-job-description — 100% (48512ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a job description for a Senior Full-Stack Engineer at a Series B fintech startup. Tech stack is React, Node.js, PostgreSQL, AWS. Remote-first, competitive equity."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (4876 chars)
  - ✓ Content length: 4876 ≥ 200
- Message preview: # Senior Full-Stack Engineer

## About Us
We are a Series B fintech startup on a mission to democratize access to sophisticated financial tools. Backed by leading venture capital firms, we're building...

## personality-poirot-empty — 100% (4820ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (209 chars)
  - ✓ Personality markers present
- Message preview: Ah, mon ami, the canvas is empty—a fresh case with no clues yet. But do not fret; every great investigation begins with a blank slate. Let us gather the evidence and construct a masterpiece of logic a...

## finance-audit-readiness — 96% (99832ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We have a SOC 2 audit in 90 days. Build me a workflow to get audit-ready: evidence collection, access reviews, policy documentation, vulnerability scanning, and vendor risk assessment. We have never done this before."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✗ Missing "policy" category (found: trigger, action, test, review, output)
  - ✓ Has "review" category
  - ✓ All 10 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 978c, no thin nodes
  - ✓ Architecture covers: evidence, access, policy, vulnerab
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 7 nodes)
- Nodes: SOC 2 Audit Kickoff (trigger), Policy Documentation Sprint (action), Technical Control Implementation (action), Vendor Risk Assessment (action), Evidence Collection & Validation (test), Readiness Review Gate (review), SOC 2 Audit Package (output)
- Message preview: Mission received. Building SOC 2 readiness workflow with parallel tracks and feedback loops.

## nonprofit-fundraising-gala — 100% (76963ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We're a small nonprofit with 3 staff members planning our annual fundraising gala for 200 guests. Budget is only $15k. Build a workflow covering venue selection, donor outreach, sponsorship asks, event program, silent auction, volunteer coordination, and post-event thank-yous."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 6 (min: 5)
  - ✓ Node count: 6 ≤ 10
  - ✓ All 10 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 831c, no thin nodes
  - ✓ Architecture covers: venue, donor, auction, volunteer
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 6 nodes)
- Nodes: Gala Planning Kickoff (trigger), Venue & Program Design (action), Donor & Sponsorship Outreach (action), Silent Auction & Volunteer Coordination (action), Pre-Event Review & Logistics (review), Post-Event Thank-Yous & Impact Report (output)
- Message preview: Ah, a case of maximizing impact with minimal resources—très intéressant! My little grey cells are already piecing together the clues for your gala. Let us construct a workflow that ensures every dolla...

## edge-minimal-prompt — 100% (80220ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "Build me a CI/CD pipeline."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "test" category
  - ✓ All 10 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 768c, no thin nodes
  - ✓ Architecture covers: build, test, deploy
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 7 nodes)
- Nodes: Code Commit (trigger), Build & Unit Tests (action), Security & Compliance Scan (policy), Integration & E2E Tests (test), Manual Approval Gate (review), Production Deployment (action), Post-Deployment Monitoring (output)
- Message preview: Mission received. Building CI/CD pipeline with parallel testing, security gates, and deployment stages.

