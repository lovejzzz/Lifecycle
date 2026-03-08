# Eval Report — 2026-03-08T06-02-47

Overall: **94%** (6/6 passed) | Pool: 30 tests, 6 selected

## hr-hiring — 94% (36683ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We need to hire 5 engineers in the next 2 months. Our current process is just posting on LinkedIn and hoping. Build me a proper hiring pipeline."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ Has "review" category
  - ✓ All 10 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ⚡ Content depth: avg 223c, 0 thin node(s)
- Nodes: Hiring Mandate (input), Pipeline Kickoff (trigger), Role & Sourcing Plan (artifact), Candidate Screening (action), Interview Loop (state), Offer & Close (action), Pipeline Metrics (review), Hires Onboarded (output)
- Message preview: Mission received. Building structured hiring pipeline for 5 engineers in 60 days.

## freelancer-client — 88% (25003ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "I'm a freelance designer. I need a workflow for managing client projects — from initial inquiry to final delivery and getting paid. I keep forgetting to send invoices."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ All 8 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✗ Content too thin: avg 94c
- Nodes: Client Inquiry (trigger), Proposal & Contract (action), Project Kickoff (state), Design Phase (action), Final Approval (review), Invoice Generator (cid), Payment Tracking (state), Project Archive (output)
- Message preview: Mission received. Building client project management workflow with invoice automation.

## execute-incident-postmortem — 100% (52963ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a blameless post-mortem for a 2-hour production outage caused by a database migration that locked a critical table. 500 customers were affected. Include timeline, root cause, impact, and action items."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (7030 chars)
  - ✓ Content length: 7030 ≥ 300
- Message preview: # Blameless Post-Mortem Report: Production Outage Due to Database Table Lock

**Date of Incident:** October 26, 2023  
**Start Time:** 09:14 UTC  
**End Time:** 11:23 UTC  
**Duration:** 2 hours, 9 mi...

## edge-complex-multi-team — 94% (48303ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We're migrating from AWS to GCP. It involves the platform team, app developers, security, and finance. There are 40 microservices. I need a migration plan workflow."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 10 (min: 5)
  - ✓ Node count: 10 ≤ 10
  - ✓ All 9 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ⚡ Content depth: avg 227c, 0 thin node(s)
- Nodes: Migration Kickoff & Stakeholder Alignment (input), AWS Environment Discovery & Inventory (action), GCP Target Architecture Design (artifact), Migration Wave Planning & Prioritization (state), Security & Compliance Validation (review), Pilot Migration (Wave 1 Execution) (action), Performance & Cost Monitoring Dashboard (state), Full Migration Rollout (Waves 2-4) (action), Decommission AWS Resources (action), Migration Retrospective & Final Report (output)
- Message preview: Ah, a case of grand migration! The plot thickens with 40 microservices and a cast of characters—platform, developers, security, finance. My little grey cells are already assembling the clues. A proper...

## personality-rowan-empty — 100% (2864ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (88 chars)
  - ✓ Personality markers present
- Message preview: Mission received. Current graph is empty. No nodes or edges exist. Ready for deployment.

## personality-poirot-empty — 100% (3998ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (255 chars)
  - ✓ Personality markers present
- Message preview: Ah, mon ami! The canvas is pristine, untouched by the fingerprints of logic. We have no nodes, no edges—a perfect blank slate awaiting the first clue. The little grey cells are eager, but the investig...

