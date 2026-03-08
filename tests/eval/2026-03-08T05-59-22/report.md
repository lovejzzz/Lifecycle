# Eval Report — 2026-03-08T05-59-22

Overall: **92%** (5/6 passed) | Pool: 30 tests, 6 selected

## marketing-blog — 100% (42791ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "Our blog is a mess. We publish whenever someone feels like it, no editorial calendar, no SEO, no promotion. Design a proper content pipeline for us."
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
  - ✓ Content depth: avg 369c, no thin nodes
- Nodes: Content Strategy & Brief (input), Editorial Calendar Trigger (trigger), Draft & Research Hub (artifact), Editorial Review & SEO Check (review), Publish & Distribute Action (action), Performance Monitor (state), Optimized Content Archive (output)
- Message preview: Ah, mon ami, a classic case of creative chaos! The clues are all there: sporadic publishing, no strategy, no amplification. A proper content pipeline is not a luxury—it is the very scaffold of influen...

## eng-deploy-process — 89% (27555ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "My team pushes to production by SSH-ing into the server and running git pull. We need a real deployment process. We use React, Node, and PostgreSQL on AWS."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ Has "test" category
  - ✓ Has "action" category
  - ✓ All 7 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✗ Content too thin: avg 143c
- Nodes: Code Push (trigger), CI Pipeline (action), Test Environment (state), Deployment Approval (review), Production Deployment (action), Production Environment (state), Health Check & Rollback (test), Deployment Complete (output)
- Message preview: Mission received. Building a CI/CD deployment workflow for React, Node, PostgreSQL on AWS.

## support-advice — 70% (27541ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "Our CSAT score dropped to 3.2 out of 5. Average first response time is 8 hours. What should we fix first?"
- Checks:
  - ✓ Valid JSON response
  - ✗ Workflow unexpectedly present
  - ✓ All 6 edges valid
  - ✓ Has message (215 chars)
  - ✓ Message length: 215 ≥ 80
- Nodes: CSAT Drop Alert (trigger), Triage & Tag Incoming Tickets (action), Agent Capacity Dashboard (state), Auto-Escalation Rules (policy), Response Time SLA Monitor (state), Optimized Support Workflow (output)
- Message preview: Mission received. Analyzing CSAT drop and response time. Primary bottleneck identified: first response time. Fix sequence: 1) Immediate triage automation, 2) Escalation routing, 3) Agent capacity. Bui...

## freelancer-client — 94% (28162ms)
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
  - ⚡ Content depth: avg 157c, 4 thin node(s)
- Nodes: Client Inquiry (trigger), Proposal & Contract (action), Project Kickoff (state), Design & Review Cycles (action), Final Delivery & Approval (review), Invoice Generation (action), Payment Tracking (state), Project Archive (output)
- Message preview: Mission received. Building client project management workflow with invoice enforcement.

## execute-sow — 100% (55058ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (7255 chars)
  - ✓ Content length: 7255 ≥ 300
- Message preview: # Statement of Work: E-Commerce Web Application Redesign

**Project Title:** E-Commerce Platform Redesign & User Experience Enhancement
**Client:** [Client Name], a Mid-Size E-Commerce Company
**Vendo...

## personality-poirot-empty — 100% (4024ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (268 chars)
  - ✓ Personality markers present
- Message preview: Ah, mon ami! The canvas is pristine, untouched by the fingerprints of logic. We have no nodes, no edges—a blank slate awaiting the first clue. The little grey cells are eager, but the investigation ha...

## Issues to Fix

- **support-advice**: ✗ Workflow unexpectedly present
