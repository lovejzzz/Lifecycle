# Eval Report — 2026-03-08T06-06-31

Overall: **98%** (6/6 passed) | Pool: 30 tests, 6 selected

## eng-advice-scaling — 100% (4042ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "Our API is hitting 500ms response times at 1000 concurrent users. Database is PostgreSQL. What should I look at first?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (224 chars)
  - ✓ Message length: 224 ≥ 80
- Message preview: On it. First, check database query performance and connection pool saturation. Run `EXPLAIN ANALYZE` on slow endpoints' queries, monitor active connections vs max_connections, and review index usage o...

## hr-hiring — 94% (34601ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We need to hire 5 engineers in the next 2 months. Our current process is just posting on LinkedIn and hoping. Build me a proper hiring pipeline."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ Has "review" category
  - ✓ All 9 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ⚡ Content depth: avg 194c, 2 thin node(s)
- Nodes: Hiring Mandate (input), Recruitment Trigger (trigger), Sourcing Strategy (action), Screening & Assessment (state), Interview Loop (artifact), Offer & Close (action), Pipeline Dashboard (review), 5 Engineers Hired (output)
- Message preview: Mission received. Building a structured hiring pipeline for 5 engineers in 2 months.

## creator-youtube — 100% (62617ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "I want to start a YouTube channel. Build me a production workflow for each video — topic research, scripting, filming, editing, thumbnail, SEO, upload, promotion."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 10 (min: 5)
  - ✓ Node count: 10 ≤ 10
  - ✓ All 10 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 409c, no thin nodes
- Nodes: Topic & Audience Research (input), Script & Storyboard Creation (artifact), Filming Setup & Recording (action), Video Editing Suite (action), Thumbnail & Title Design (artifact), SEO & Metadata Optimization (action), Upload & Scheduling (action), Cross-Platform Promotion (action), Analytics & Iteration Review (review), Published Video Portfolio (output)
- Message preview: Ah, mon ami! A YouTube channel — the modern stage for ideas! The little grey cells are already working. I have investigated your request and constructed a production workflow worthy of a master detect...

## execute-sow — 100% (56831ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (7392 chars)
  - ✓ Content length: 7392 ≥ 300
- Message preview: # Statement of Work: E-Commerce Web Application Redesign

**Project Title:** E-Commerce Platform Redesign & Modernization
**Client:** [Client Name], a mid-size e-commerce company
**Vendor/Service Prov...

## edge-question-looks-like-build — 100% (14573ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What's the best way to set up a data pipeline?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (1596 chars)
  - ✓ Message length: 1596 ≥ 50
- Message preview: Ah, mon ami, a fascinating question indeed! Setting up a data pipeline is like orchestrating a grand investigation—every piece of evidence must flow seamlessly from source to insight. Let me put my li...

## personality-rowan-empty — 100% (2628ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (88 chars)
  - ✓ Personality markers present
- Message preview: Mission received. Current graph is empty. No nodes or edges exist. Ready for deployment.

