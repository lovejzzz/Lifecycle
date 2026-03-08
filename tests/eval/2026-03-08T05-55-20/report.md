# Eval Report — 2026-03-08T05-55-20

Overall: **100%** (6/6 passed) | Pool: 30 tests, 6 selected

## founder-advice — 100% (6103ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "We're burning $50k/month and have 6 months of runway. What should I prioritize?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (508 chars)
  - ✓ Message length: 508 ≥ 80
- Message preview: Mission received. Prioritize immediate revenue generation and runway extension. Here's the tactical breakdown:

1. **Revenue First**: Identify and deploy high-impact monetization levers within 30 days...

## marketing-campaign — 100% (41622ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "I need to launch a Black Friday campaign across email, social media, and Google Ads. Budget is $10k. Make me a workflow that covers everything from creative to post-campaign analysis."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ All 7 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
- Nodes: Campaign Brief & Budget (input), Creative & Asset Development (action), Channel Setup & Segmentation (action), Pre-Launch QA & Compliance (test), Campaign Launch Trigger (trigger), Live Monitoring Dashboard (state), Post-Campaign Analysis Report (artifact), Campaign Retrospective & Handoff (output)
- Message preview: Mission received. Building Black Friday campaign launch workflow with full lifecycle coverage.

## hr-hiring — 100% (29573ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We need to hire 5 engineers in the next 2 months. Our current process is just posting on LinkedIn and hoping. Build me a proper hiring pipeline."
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
- Nodes: Hiring Mandate (input), Talent Sourcing Trigger (trigger), Candidate Pipeline State (state), Structured Interview Process (artifact), Offer & Close Action (action), Pipeline Review (review), Hires Secured Output (output)
- Message preview: Mission received. Building a structured hiring pipeline to secure 5 engineers in 2 months.

## support-escalation — 100% (46887ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "Customers keep complaining their tickets go into a black hole. Design an escalation workflow — ticket comes in, auto-classify priority, route to right team, SLA tracking, escalate if overdue."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 9 (min: 5)
  - ✓ Node count: 9 ≤ 10
  - ✓ Has "trigger" category
  - ✓ All 12 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
- Nodes: New Ticket Submission (trigger), Auto-Priority Classifier (action), Team Routing Engine (action), SLA Tracking Clock (state), Primary Support Triage (action), Escalation Policy (policy), Escalation Executor (action), Escalation Audit Log (artifact), Resolved Ticket & Report (output)
- Message preview: Ah, the classic 'black hole' complaint! A most vexing problem, mon ami. The tickets vanish, the customers fume, and the support teams are left in the dark. But fear not, for Hercule Poirot is on the c...

## execute-sow — 100% (51719ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (7006 chars)
  - ✓ Content length: 7006 ≥ 300
- Message preview: # Statement of Work: E-Commerce Web Application Redesign

**Project Title:** E-Commerce Platform Redesign & Modernization
**Client:** [Client Name], a mid-size e-commerce company
**Vendor/Service Prov...

## personality-rowan-empty — 100% (2788ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (88 chars)
  - ✓ Personality markers present
- Message preview: Mission received. Current graph is empty. No nodes or edges exist. Ready for deployment.

