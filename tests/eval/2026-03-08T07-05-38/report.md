# Eval Report — 2026-03-08T07-05-38

Overall: **100%** (6/6 passed) | Pool: 34 tests, 6 selected

## founder-mvp-launch — 100% (85710ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "I'm launching my SaaS app in 2 weeks. I have the code ready but no deployment process, no monitoring, nothing. Help me set up everything I need to go live safely."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 9 (min: 5)
  - ✓ Node count: 9 ≤ 10
  - ✓ Has "action" category
  - ✓ Has "test" category
  - ✓ All 13 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 826c, no thin nodes
  - ✓ Architecture covers: deploy, monitor, test
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (13 edges, 9 nodes)
- Nodes: Code Repository Push (trigger), CI/CD Pipeline Execution (action), Staging Deployment (action), Staging Review & Approval (review), Production Deployment (action), Production Monitoring Setup (action), Post-Launch Validation (test), Incident Response Plan (policy), Launch Report & Metrics (output)
- Message preview: Mission received. Building a deployment and monitoring workflow for your SaaS launch.

## founder-fundraising — 100% (71373ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We're raising our Series A. I need to manage the whole fundraising process — investor outreach, pitch deck prep, due diligence, term sheet negotiation. Build me a workflow for this."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "review" category
  - ✓ All 12 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 910c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (12 edges, 7 nodes)
- Nodes: Fundraising Strategy & Target List (input), Pitch Materials Development (artifact), Investor Outreach Execution (action), Due Diligence Preparation (state), Term Sheet Analysis & Negotiation (review), Fundraising Metrics Dashboard (artifact), Series A Closing & Integration (output)
- Message preview: Ah, mon ami! A Series A fundraising is a most delicate investigation — we must gather evidence, present our case with precision, and negotiate with the cunning of a master detective. Let us build a wo...

## execute-incident-postmortem — 100% (53142ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a blameless post-mortem for a 2-hour production outage caused by a database migration that locked a critical table. 500 customers were affected. Include timeline, root cause, impact, and action items."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (7051 chars)
  - ✓ Content length: 7051 ≥ 300
- Message preview: # Post-Mortem Report: Production Outage Due to Database Table Lock

**Date of Incident:** October 26, 2023  
**Start Time:** 09:14 UTC  
**End Time:** 11:23 UTC  
**Duration:** 2 hours, 9 minutes  
**...

## execute-job-description — 100% (33077ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a job description for a Senior Full-Stack Engineer at a Series B fintech startup. Tech stack is React, Node.js, PostgreSQL, AWS. Remote-first, competitive equity."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (4949 chars)
  - ✓ Content length: 4949 ≥ 200
- Message preview: # Senior Full-Stack Engineer

## About Us

We are a Series B fintech startup on a mission to revolutionize the financial landscape. Backed by leading investors, we are building a next-generation platf...

## edge-question-looks-like-build — 100% (6344ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What's the best way to set up a data pipeline?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (551 chars)
  - ✓ Message length: 551 ≥ 50
- Message preview: Ah, mon ami, the best way to set up a data pipeline is a case worthy of the little grey cells! First, define your objectives clearly—what data, from where, and for what purpose? Use tools like Apache ...

## personality-poirot-empty — 100% (4180ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (239 chars)
  - ✓ Personality markers present
- Message preview: Ah, mon ami, the canvas is pristine—no clues, no evidence, no case yet. But the little grey cells are ready to weave a tapestry of logic and action. Present your scenario, and we shall construct a wor...

