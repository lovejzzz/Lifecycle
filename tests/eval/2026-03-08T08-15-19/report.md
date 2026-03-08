# Eval Report — 2026-03-08T08-15-19

Overall: **99%** (6/6 passed) | Pool: 38 tests, 6 selected

## founder-advice — 100% (28304ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "We're burning $50k/month and have 6 months of runway. What should I prioritize?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (347 chars)
  - ✓ Message length: 347 ≥ 300
- Message preview: Mission critical: prioritize immediate cost reduction and revenue acceleration. Conduct a zero-based budget audit to slash non-essential spending by at least 30%, and deploy all resources to high-impa...

## marketing-blog — 100% (93430ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "Our blog is a mess. We publish whenever someone feels like it, no editorial calendar, no SEO, no promotion. Design a proper content pipeline for us."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 9 (min: 5)
  - ✓ Node count: 9 ≤ 10
  - ✓ Has "review" category
  - ✓ All 12 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 755c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (12 edges, 9 nodes)
- Nodes: Content Ideation & Briefing (trigger), Content Creation (Writing & Drafting) (action), Editorial Review & Refinement (review), SEO & Technical Optimization (action), Final Approval & Scheduling Gate (review), Multi-Channel Promotion Launch (action), Performance Monitoring & Analysis (artifact), Content Refresh & Repurposing Policy (policy), Optimized Content Performance Dashboard (output)
- Message preview: Ah, a most intriguing case of content chaos, mon ami! Let us apply the little grey cells and design a systematic pipeline that transforms your blog from a disorganized crime scene into a well-oiled, e...

## pm-feature-ship — 100% (192170ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "I need to ship a new payments feature. It touches billing, the API, the frontend, and we need legal to review the T&C changes. Give me a workflow that makes sure nothing falls through the cracks."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 10 (min: 5)
  - ✓ Node count: 10 ≤ 10
  - ✓ Has "review" category
  - ✓ All 16 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 776c, no thin nodes
  - ✓ Architecture covers: billing, api, frontend, legal
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (16 edges, 10 nodes)
- Nodes: Payment Feature Kickoff (trigger), Legal T&C Review (review), Billing Implementation (action), API Implementation (action), Frontend Implementation (action), Integration Testing (test), Final Cross-Functional Review (review), Production Deployment (action), Post-Launch Monitoring (state), Feature Shipped Successfully (output)
- Message preview: Mission received. Building workflow for payments feature deployment.

## execute-sow — 100% (58368ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (6232 chars)
  - ✓ Content length: 6232 ≥ 300
- Message preview: **STATEMENT OF WORK (SOW)**

**Project Title:** E-Commerce Web Application Redesign
**Client:** [Client Company Name]
**Vendor:** [Your Company/Agency Name]
**Effective Date:** [Date]
**Project Durati...

## personality-poirot-empty — 100% (26787ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (303 chars)
  - ✓ Personality markers present
- Message preview: Ah, we are at the very start of our investigation, mon ami—the workflow canvas is completely empty, a blank slate awaiting the first clues. Très intéressant! Shall we begin by building a new case, suc...

## strategy-advice-pivot — 88% (24863ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "Our B2B SaaS has 200 customers paying $50/mo but enterprise prospects keep asking for features that would require 6 months of engineering. Should we go upmarket or double down on SMB? Our team is 8 people."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (329 chars)
  - ✗ Message too short: 329 < 400
- Message preview: Aha! The case of the strategic pivot—mon ami, gather the evidence: conduct a weighted scoring matrix evaluating factors like potential enterprise contract values versus SMB retention rates, and don't ...

