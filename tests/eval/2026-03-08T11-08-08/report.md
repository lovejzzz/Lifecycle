# Eval Report — 2026-03-08T11-08-08

Overall: **100%** (6/6 passed) | Pool: 52 tests, 6 selected

## founder-fundraising — 100% (79260ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We're raising our Series A. I need to manage the whole fundraising process — investor outreach, pitch deck prep, due diligence, term sheet negotiation. Build me a workflow for this."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "review" category
  - ✓ All 9 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 795c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (9 edges, 7 nodes)
- Nodes: Board Mandate & Internal Alignment (trigger), Investor Materials & Narrative Crafting (action), Targeted Investor Outreach & Sequencing (action), Pitch Meetings & Feedback Loop (review), Due Diligence Deep Dive (test), Term Sheet Negotiation & Syndication (action), Final Close & Documentation (output)
- Message preview: Aha! The grand Series A, a case that requires all our little grey cells. Let us construct an elegant investigation into the art of fundraising, mon ami—a workflow that leaves no clue unchecked, from t...

## pm-feature-ship — 100% (151286ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "I need to ship a new payments feature. It touches billing, the API, the frontend, and we need legal to review the T&C changes. Give me a workflow that makes sure nothing falls through the cracks."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 9 (min: 5)
  - ✓ Node count: 9 ≤ 10
  - ✓ Has "review" category
  - ✓ All 14 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 817c, no thin nodes
  - ✓ Architecture covers: billing, api, frontend, legal
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (14 edges, 9 nodes)
- Nodes: Feature Kickoff (trigger), Design and Planning (action), Billing Implementation (action), API Implementation (action), Frontend Implementation (action), Legal T&C Review (review), Integration Testing (test), Final Approval (review), Feature Deployment (output)
- Message preview: Mission received. Building workflow for payments feature deployment.

## hr-onboarding — 100% (122529ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "New hires keep saying their first week was confusing and they didn't know what to do. Design an onboarding process that actually works — IT setup, team intros, training, 30-60-90 day goals."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ All 8 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 914c, no thin nodes
  - ✓ Architecture covers: it, training, 30
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (8 edges, 7 nodes)
- Nodes: New Hire Data Intake (input), IT and Account Provisioning (action), Team Integration Kickoff (action), Role-Specific Training Phase (action), 30-60-90 Goal Tracker (state), Bi-Weekly Feedback Sessions (review), Onboarding Completion Report (output)
- Message preview: Aha! The case of the confusing onboarding is cracked wide open. Voilà, an elegant workflow that structures the first days with detective-like precision, ensuring no clue is missed from IT setup to 90-...

## execute-sow — 100% (59393ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (7046 chars)
  - ✓ Content length: 7046 ≥ 300
- Message preview: # Statement of Work: E-Commerce Web Application Redesign

**Project Title:** E-Commerce Platform Redesign & Modernization
**Client:** [Client Name], a Mid-Size E-Commerce Company
**Vendor:** [Your Age...

## personality-poirot-empty — 100% (12591ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (242 chars)
  - ✓ Personality markers present
- Message preview: Ah, mon ami, we have nothing so far—the board is empty, and the case is yet to be cracked! We must gather our clues and evidence to design a workflow worthy of the little grey cells. Très intéressant,...

## eng-advice-architecture — 100% (31436ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "We have a Django monolith serving 50k users. Page loads are 4-6 seconds, database has 200+ tables, and deployments take 45 minutes. The team wants to add real-time features. Should we refactor, rewrite, or bolt on new services?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (457 chars)
  - ✓ Message length: 457 ≥ 250
- Message preview: Mission: Execute a phased strategy. Profile with Django Debug Toolbar and New Relic to isolate bottlenecks—likely N+1 queries or unindexed joins in that 200-table schema. Refactor critical modules int...

