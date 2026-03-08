# Eval Report — 2026-03-08T17-12-24

Overall: **100%** (6/6 passed) | Pool: 80 tests, 6 selected

## founder-fundraising — 100% (75626ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We're raising our Series A. I need to manage the whole fundraising process — investor outreach, pitch deck prep, due diligence, term sheet negotiation. Build me a workflow for this."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 6 (min: 5)
  - ✓ Node count: 6 ≤ 10
  - ✓ Has "review" category
  - ✓ All 8 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 822c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (8 edges, 6 nodes)
- Nodes: Fundraising Kickoff & Strategy (trigger), Pitch Materials & Narrative Crafting (artifact), Investor Outreach & Meeting Orchestration (action), Due Diligence & Data Room Management (state), Term Sheet Negotiation & Legal (review), Series A Close & Announcement (output)
- Message preview: Ah, the Series A — a most delicate investigation, mon ami! The clues must be gathered, the evidence presented impeccably. Let us construct a workflow to track every lead, polish every slide, and negot...

## execute-sow — 100% (77108ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (7748 chars)
  - ✓ Content length: 7748 ≥ 300
- Message preview: # Statement of Work: E-Commerce Web Application Redesign

**Project Title:** E-Commerce Platform Redesign & Modernization
**Client:** [Client Name], a mid-size e-commerce company
**Vendor:** [Your Age...

## personality-rowan-empty — 100% (3164ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (84 chars)
  - ✓ Personality markers present
- Message preview: Graph is empty. Ready for mission. Give me a build order or ask for tactical advice.

## personality-poirot-empty — 100% (4251ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (194 chars)
  - ✓ Personality markers present
- Message preview: Ah, mon ami, the canvas is empty—a fresh case awaits! But do not fret; every great investigation begins with a blank slate. Let us gather the clues and construct a masterpiece of logic and flow.

## edge-minimal-prompt — 100% (85055ms)
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
  - ✓ Content depth: avg 766c, no thin nodes
  - ✓ Architecture covers: build, test, deploy
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 7 nodes)
- Nodes: Code Commit (trigger), Build & Static Analysis (action), Automated Testing (test), Security & Compliance Review (policy), Staging Deployment (action), Manual Approval Gate (review), Production Deployment (output)
- Message preview: Mission received. Building secure, automated CI/CD pipeline with quality gates.

## execute-competitive-analysis — 100% (88810ms)
- Agent: poirot | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a competitive analysis for a B2B project management SaaS entering a market dominated by Jira, Asana, Monday.com, and Linear. Our differentiator is AI-powered sprint planning and automatic risk detection. We are pre-revenue with 200 beta users. Include market positioning, SWOT analysis, competitive matrix, and go-to-market recommendations."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (9381 chars)
  - ✓ Content length: 9381 ≥ 1500
- Message preview: # Competitive Analysis Report: ProjectSync AI

## Executive Summary
ProjectSync AI is entering the hyper-competitive B2B project management SaaS market with a specialized AI-driven approach to sprint ...

