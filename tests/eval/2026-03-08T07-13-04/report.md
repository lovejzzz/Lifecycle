# Eval Report — 2026-03-08T07-13-04

Overall: **100%** (6/6 passed) | Pool: 34 tests, 6 selected

## marketing-advice — 100% (4151ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "Our email open rates dropped from 35% to 12% over the last quarter. What could be wrong?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (217 chars)
  - ✓ Message length: 217 ≥ 80
- Message preview: Ah, a most curious case of vanishing opens! The little grey cells suggest we must investigate the evidence—subject lines, deliverability, audience fatigue, and timing. Let us examine the clues systema...

## pm-user-research — 100% (75980ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We're redesigning our onboarding flow. I want to do proper user research — recruit users, run interviews, analyze findings, create recommendations, test prototypes. Build this for me."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ All 10 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 996c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 7 nodes)
- Nodes: Research Recruitment Plan (input), User Interview Protocol (action), Interview Synthesis & Analysis (artifact), Design Recommendations Report (artifact), Prototype Testing Plan (test), Findings Review & Iteration (review), Implementation Handoff Package (output)
- Message preview: Ah, mon ami! A redesign case worthy of the little grey cells. Let us investigate this onboarding mystery with proper detective work — we shall gather evidence from users, analyze the clues, and build ...

## hr-hiring — 100% (73914ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We need to hire 5 engineers in the next 2 months. Our current process is just posting on LinkedIn and hoping. Build me a proper hiring pipeline."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 9 (min: 5)
  - ✓ Node count: 9 ≤ 10
  - ✓ Has "review" category
  - ✓ All 10 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 711c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 9 nodes)
- Nodes: Hiring Trigger (trigger), Sourcing & Outreach (action), Screening & Assessment (action), Onsite Interview Loop (action), Hiring Committee Review (review), Offer & Negotiation (action), Onboarding Prep (action), Pipeline Analytics & Optimization (state), Hiring Pipeline Report (output)
- Message preview: Mission received. Building a structured hiring pipeline to secure 5 engineers in 60 days.

## hr-onboarding — 100% (65764ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "New hires keep saying their first week was confusing and they didn't know what to do. Design an onboarding process that actually works — IT setup, team intros, training, 30-60-90 day goals."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ All 10 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 840c, no thin nodes
  - ✓ Architecture covers: it, training, 30
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 7 nodes)
- Nodes: Pre-Arrival Welcome Kit (input), Day 1 IT & Workspace Setup (action), Structured Team Introductions (action), Role-Specific Training Modules (action), 30-60-90 Day Goal Framework (artifact), Onboarding Feedback Loop (review), Graduation & Integration Ceremony (output)
- Message preview: Ah, a classic case of organizational disorientation! The clues are clear — new hires wandering like lost souls in their first week. Let us construct an elegant onboarding investigation that transforms...

## execute-sow — 100% (49148ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (6437 chars)
  - ✓ Content length: 6437 ≥ 300
- Message preview: # Statement of Work: E-Commerce Web Application Redesign

**Project Title:** E-Commerce Platform Redesign & User Experience Enhancement
**Client:** [Client Company Name], a mid-size e-commerce company...

## personality-poirot-empty — 100% (4275ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (230 chars)
  - ✓ Personality markers present
- Message preview: Ah, mon ami, the case is fresh and the board is empty—no clues, no leads, no suspects. But do not fret! The little grey cells are ready to piece together a workflow from the evidence you provide. What...

