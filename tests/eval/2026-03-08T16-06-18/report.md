# Eval Report — 2026-03-08T16-06-18

Overall: **99%** (6/6 passed) | Pool: 76 tests, 6 selected

## marketing-advice — 88% (3981ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "Our email open rates dropped from 35% to 12% over the last quarter. What could be wrong?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (220 chars)
  - ✗ Message too short: 220 < 250
- Message preview: Ah, a most curious case of the vanishing opens! The little grey cells suggest we must investigate the evidence—subject lines, sender reputation, list hygiene, and timing. Let us examine the clues syst...

## eng-code-review — 100% (72195ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "PRs sit for days because nobody reviews them. I want an automated workflow: PR opened → assign reviewer → review deadline → merge or request changes → deploy."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 6 (min: 5)
  - ✓ Node count: 6 ≤ 10
  - ✓ Has "review" category
  - ✓ Has "action" category
  - ✓ All 8 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 807c, no thin nodes
  - ✓ Architecture covers: assign, deadline, merge, deploy
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (8 edges, 6 nodes)
- Nodes: PR Opened (trigger), Assign Reviewer (action), Review Deadline Monitor (policy), Review & Merge Gate (review), Deploy to Staging (action), PR Velocity Dashboard (output)
- Message preview: Mission received. Building a PR automation workflow with enforcement loops.

## freelancer-client — 100% (62563ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "I'm a freelance designer. I need a workflow for managing client projects — from initial inquiry to final delivery and getting paid. I keep forgetting to send invoices."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 6 (min: 5)
  - ✓ Node count: 6 ≤ 10
  - ✓ All 7 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 727c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (7 edges, 6 nodes)
- Nodes: Client Inquiry (trigger), Proposal & Contract (action), Design Execution (action), Final Delivery & Invoice (action), Payment Tracking (state), Project Closure (output)
- Message preview: Mission received. Building a client project management workflow with payment automation.

## execute-job-description — 100% (44132ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a job description for a Senior Full-Stack Engineer at a Series B fintech startup. Tech stack is React, Node.js, PostgreSQL, AWS. Remote-first, competitive equity."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (5240 chars)
  - ✓ Content length: 5240 ≥ 200
- Message preview: # Senior Full-Stack Engineer

**Location:** Remote-First (Global)
**Employment Type:** Full-Time
**Equity:** Competitive Package

## About Us

We are a Series B fintech startup on a mission to democra...

## personality-rowan-empty — 100% (2886ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (84 chars)
  - ✓ Personality markers present
- Message preview: Graph is empty. Ready for mission. Give me a build order or ask for tactical advice.

## government-procurement — 100% (104694ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "Build a government procurement workflow for a city agency buying a new fleet management system. Steps: needs assessment, RFP drafting, vendor solicitation, proposal evaluation, compliance review, contract award, and implementation oversight. Must follow public procurement regulations."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ Has "policy" category
  - ✓ Has "review" category
  - ✓ All 13 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 1030c, no thin nodes
  - ✓ Architecture covers: rfp, vendor, compliance, contract
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (13 edges, 8 nodes)
- Nodes: Procurement Trigger (trigger), Comprehensive Needs Assessment (input), RFP Development & Vendor Outreach (action), Proposal Evaluation Committee (review), Compliance & Regulatory Review (policy), Contract Negotiation & Award (action), Implementation Oversight & Acceptance (review), Procurement Case File & Audit Trail (output)
- Message preview: Ah, mon ami! A procurement case worthy of the little grey cells. Let us construct this workflow with the precision of a Swiss watch—every regulation observed, every step documented. Voilà, your govern...

