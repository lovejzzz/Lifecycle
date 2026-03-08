# Eval Report — 2026-03-08T10-04-47

Overall: **96%** (5/6 passed) | Pool: 44 tests, 6 selected

## founder-advice — 100% (28730ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "We're burning $50k/month and have 6 months of runway. What should I prioritize?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (343 chars)
  - ✓ Message length: 343 ≥ 250
- Message preview: Prioritize immediate cost reduction and revenue acceleration. Conduct a 48-hour expense audit using Xero to identify and cut non-essential spend, aiming to lower monthly burn by 40% to $30k. Simultane...

## eng-deploy-process — 97% (172539ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "My team pushes to production by SSH-ing into the server and running git pull. We need a real deployment process. We use React, Node, and PostgreSQL on AWS."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "test" category
  - ✓ Has "action" category
  - ✓ All 8 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 894c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ⚡ Architecture: has parallel branches (8 edges, 7 nodes)
- Nodes: Code Push to Main Branch (trigger), Automated Testing Suite (test), Application Build and Package (action), Security and Compliance Check (policy), Production Release Approval (review), AWS Deployment Execution (action), Deployment Verification and Metrics (output)
- Message preview: Mission received. Building automated CI/CD pipeline for your stack.

## pm-user-research — 100% (106743ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We're redesigning our onboarding flow. I want to do proper user research — recruit users, run interviews, analyze findings, create recommendations, test prototypes. Build this for me."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ All 9 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 738c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (9 edges, 8 nodes)
- Nodes: Project Initiation & Goals (trigger), User Recruitment Strategy (action), Conduct User Interviews (action), Analyze Interview Findings (action), Design Recommendations & Prototypes (action), Prototype Usability Testing (test), Stakeholder Review & Approval (review), Final Onboarding Redesign Deliverable (output)
- Message preview: Aha! The case of the clunky onboarding flow—let us investigate with the little grey cells. Voilà, I have crafted a workflow to uncover user clues and design an elegant solution, mon ami.

## creator-youtube — 100% (144496ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "I want to start a YouTube channel. Build me a production workflow for each video — topic research, scripting, filming, editing, thumbnail, SEO, upload, promotion."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 9 (min: 5)
  - ✓ Node count: 9 ≤ 10
  - ✓ All 10 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 725c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 9 nodes)
- Nodes: Video Concept Trigger (trigger), Research and Script Development (action), Filming Production (action), Editing Post-Production (action), Quality Review Gate (review), Thumbnail Design (action), SEO and Metadata Optimization (action), YouTube Upload and Setup (action), Promotion and Performance Analytics (output)
- Message preview: Aha! Mon ami, the mystery of video production shall be solved with this elegant workflow. Voilà—a meticulous blueprint to craft and promote each YouTube episode, engaging the little grey cells at ever...

## personality-poirot-empty — 100% (10514ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (166 chars)
  - ✓ Personality markers present
- Message preview: Ah, mon ami, the case is fresh! The evidence board is empty, awaiting the first clue. Shall we describe the scene of the crime, or shall we begin a new investigation?

## execute-api-design — 63% (64082ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Design a REST API for a multi-tenant task management system. Include endpoints for workspaces, projects, tasks, and comments. Show URL patterns, HTTP methods, request/response bodies, auth scheme, pagination, and error codes. Support role-based access (admin, member, viewer)."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✗ Missing message
  - ✗ Message too short: 0 < 2000

## Issues to Fix

- **execute-api-design**: ✗ Missing message; ✗ Message too short: 0 < 2000
