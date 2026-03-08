# Eval Report — 2026-03-08T07-37-48

Overall: **78%** (4/6 passed) | Pool: 36 tests, 6 selected

## hr-hiring — 33% (149757ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We need to hire 5 engineers in the next 2 months. Our current process is just posting on LinkedIn and hoping. Build me a proper hiring pipeline."
- Checks:
  - ✓ Valid JSON response
  - ✗ Workflow missing when expected
  - ✗ Node count: 0 < 5
  - ✓ Node count: 0 ≤ 10
  - ✗ Missing "review" category (found: )
- Message preview: {
  "message": "Mission received. Building engineered hiring pipeline.",
  "workflow": {
    "nodes": [
      {
        "label": "Hiring Demand Triggered",
        "category": "trigger",
        "desc...

## freelancer-client — 100% (135982ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "I'm a freelance designer. I need a workflow for managing client projects — from initial inquiry to final delivery and getting paid. I keep forgetting to send invoices."
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
  - ✓ Content depth: avg 759c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 9 nodes)
- Nodes: Client Inquiry Received (trigger), Qualify & Schedule Discovery (action), Draft Project Proposal & Contract (artifact), Client Review & Contract Sign-off (review), Execute Design Work (action), Design Review & Feedback Cycle (review), Finalize & Deliver Assets (artifact), Generate & Send Invoice with Reminders (action), Payment Received & Project Closure (output)
- Message preview: Mission received. Building your client project management workflow with invoice automation to prevent missed payments.

## execute-sow — 100% (74582ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (7584 chars)
  - ✓ Content length: 7584 ≥ 300
- Message preview: # Statement of Work: E-Commerce Web Application Redesign

**Project Title:** E-Commerce Platform Redesign & User Experience Enhancement
**Client:** [Client Company Name]
**Vendor:** [Your Agency Name]...

## edge-question-looks-like-build — 100% (24269ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What's the best way to set up a data pipeline?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (602 chars)
  - ✓ Message length: 602 ≥ 50
- Message preview: Voilà! For setting up a data pipeline, mon ami, begin by thoroughly investigating your data sources and business requirements—tools like Apache Airflow or Prefect for orchestration, coupled with data ...

## personality-poirot-empty — 100% (8444ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (169 chars)
  - ✓ Personality markers present
- Message preview: Mon ami, we have a blank canvas—the case file is empty, awaiting our first clue. My little grey cells are ready to build a masterpiece of logic and flow. Shall we begin?

## legal-gdpr-compliance — 30% (143557ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We just got our first EU customer and we have zero GDPR compliance. Build me a workflow to get compliant — data audit, privacy policy, consent management, breach notification process, DPO appointment."
- Checks:
  - ✓ Valid JSON response
  - ✗ Workflow missing when expected
  - ✗ Node count: 0 < 5
  - ✓ Node count: 0 ≤ 10
  - ✗ Missing "policy" category (found: )
  - ✗ Missing "review" category (found: )
- Message preview: {
  "message": "Aha! The case of GDPR compliance is upon us, mon ami. Let me craft a meticulous workflow to uncover the clues and establish order in your data practices, ensuring every step is scrutin...

## Issues to Fix

- **hr-hiring**: ✗ Workflow missing when expected; ✗ Node count: 0 < 5; ✗ Missing "review" category (found: )
- **legal-gdpr-compliance**: ✗ Workflow missing when expected; ✗ Node count: 0 < 5; ✗ Missing "policy" category (found: ); ✗ Missing "review" category (found: )
