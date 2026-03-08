# Eval Report — 2026-03-08T10-12-21

Overall: **99%** (6/6 passed) | Pool: 46 tests, 6 selected

## hr-hiring — 100% (176755ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We need to hire 5 engineers in the next 2 months. Our current process is just posting on LinkedIn and hoping. Build me a proper hiring pipeline."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ Has "review" category
  - ✓ All 9 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 972c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (9 edges, 8 nodes)
- Nodes: Hiring Request Approved (trigger), Job Description Development (action), Multi-Channel Sourcing (action), Resume Screening and Initial Assessment (test), Structured Interview Rounds (action), Final Approval and Decision (review), Offer Management and Onboarding (action), Engineers Hired (output)
- Message preview: Mission received. Building structured hiring pipeline to secure 5 engineers in 2 months.

## freelancer-advice — 100% (24507ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "I'm charging $50/hour for web development and I'm always booked but barely making rent. What am I doing wrong?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (406 chars)
  - ✓ Message length: 406 ≥ 250
- Message preview: Aha! My little grey cells are at work—your case is a classic one, mon ami. Très intéressant: charging $50/hour while always booked points to underpricing or poor expense tracking; investigate local ma...

## execute-job-description — 100% (39237ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a job description for a Senior Full-Stack Engineer at a Series B fintech startup. Tech stack is React, Node.js, PostgreSQL, AWS. Remote-first, competitive equity."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (5051 chars)
  - ✓ Content length: 5051 ≥ 200
- Message preview: ## Senior Full-Stack Engineer

**Location:** Remote (Global) | **Department:** Engineering | **Type:** Full-Time

### About Us

We are a Series B fintech startup on a mission to democratize access to ...

## edge-vague — 100% (28367ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "help me with my project"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (244 chars)
  - ✓ Message length: 244 ≥ 30
- Message preview: Start by defining clear objectives and key results using SMART goals. Implement a project management tool like Trello or Jira to break down tasks into phases: requirements gathering, development, test...

## personality-rowan-empty — 88% (8088ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (69 chars)
  - ✗ Missing personality markers
- Message preview: Graph is empty. No workflows or nodes present. Let's build something.

## healthcare-patient-intake — 100% (65538ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "Design a patient intake workflow for a telehealth clinic. Steps include appointment scheduling, insurance verification, medical history form, consent collection, provider assignment, and video call setup. Must be HIPAA compliant."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "policy" category
  - ✓ All 10 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 732c, no thin nodes
  - ✓ Architecture covers: insurance, consent, hipaa
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 7 nodes)
- Nodes: Appointment Request (trigger), Parallel Verification Hub (state), HIPAA Compliance Monitor (policy), Consent & Provider Assignment (action), Pre-Visit Technical Check (test), Intake Review & Final Prep (review), Telehealth Visit Ready (output)
- Message preview: Ah, mon ami, a most intriguing case of clinical orchestration. With my little grey cells, I have designed a workflow that weaves compliance like a fine detective's net—observing every step without bre...

