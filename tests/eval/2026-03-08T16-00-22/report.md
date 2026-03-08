# Eval Report — 2026-03-08T16-00-22

Overall: **96%** (7/7 passed) | Pool: 76 tests, 7 selected

## marketing-advice — 88% (4449ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "Our email open rates dropped from 35% to 12% over the last quarter. What could be wrong?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (232 chars)
  - ✗ Message too short: 232 < 250
- Message preview: Ah, a most curious case of the vanishing opens! The little grey cells suggest we must investigate the evidence—subject lines, deliverability, audience fatigue, and content relevance. Let us examine th...

## execute-job-description — 100% (42531ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a job description for a Senior Full-Stack Engineer at a Series B fintech startup. Tech stack is React, Node.js, PostgreSQL, AWS. Remote-first, competitive equity."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (5024 chars)
  - ✓ Content length: 5024 ≥ 200
- Message preview: # Senior Full-Stack Engineer

## About Us
We are a Series B fintech startup on a mission to democratize access to sophisticated financial tools. Backed by leading venture capital firms, we're building...

## personality-rowan-empty — 100% (3875ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (87 chars)
  - ✓ Personality markers present
- Message preview: Graph is empty. Ready for mission. Provide a build request or ask for strategic advice.

## legal-contract-review — 100% (79744ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "Build a contract review workflow for our legal team. Steps: receive contract, initial screening, clause analysis, risk assessment, negotiation points, legal approval, and final execution. We review 30+ vendor contracts per quarter."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "review" category
  - ✓ All 10 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 821c, no thin nodes
  - ✓ Architecture covers: contract, risk, approv
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 7 nodes)
- Nodes: Contract Intake Portal (input), Initial Screening & Triage (action), Clause Analysis Engine (action), Risk Assessment Matrix (policy), Negotiation Playbook Development (artifact), Legal Approval Gate (review), Execution & Archive (output)
- Message preview: Ah, mon ami! A contract review workflow — the perfect case for my little grey cells. Let us examine this with the precision of a detective examining evidence. Voilà, I have constructed a system worthy...

## cybersecurity-incident-response — 95% (89031ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "Build an incident response plan workflow for our SOC team. Cover: alert triage, severity classification (P1-P4), containment procedures, evidence collection, root cause analysis, remediation, stakeholder communication, and post-incident review. We handle 200 alerts/day and need to respond to P1s within 15 minutes."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✗ Missing "policy" category (found: trigger, action, review, output)
  - ✓ All 9 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 915c, no thin nodes
  - ✓ Architecture covers: triage, contain, evidence, remediat
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (9 edges, 7 nodes)
- Nodes: Alert Ingest & Triage (trigger), Severity Classification (P1-P4) (action), Containment & Evidence Collection (action), Root Cause Analysis (action), Remediation & Communication (action), Post-Incident Review (review), Incident Report & Knowledge Base (output)
- Message preview: Mission received. Building SOC incident response workflow with P1 15-minute SLA.

## legal-contract-review — 96% (79930ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "Build a contract lifecycle management workflow for our legal team. We handle 50 contracts/month: NDAs, vendor agreements, and enterprise SaaS licenses. Steps: intake request, drafting, internal legal review, counterparty negotiation, approval, e-signature, and obligation tracking post-signing. We need SLA of 5 business days for standard NDAs."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "review" category
  - ✗ Missing "policy" category (found: input, action, review, artifact, output)
  - ✓ All 11 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 774c, no thin nodes
  - ✓ Architecture covers: draft, review, negotiat, sign
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (11 edges, 7 nodes)
- Nodes: Contract Intake Portal (input), Automated Draft Generation (action), Legal Review & Risk Assessment (review), Counterparty Negotiation Hub (action), Approval Workflow & E-Signature (review), Obligation Tracking & Compliance Monitoring (artifact), Contract Repository & Analytics (output)
- Message preview: Ah, mon ami! A contract management case worthy of the little grey cells. Let us examine this evidence: 50 contracts monthly across three types, with SLA requirements. Voilà! I have constructed a workf...

## education-online-course-creation — 95% (57240ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "Build a workflow for creating and launching a 12-week online coding bootcamp. Steps: curriculum design, instructor recruitment, platform setup (LMS), content recording, beta testing with 20 students, marketing and enrollment, live cohort delivery, and student outcomes tracking. Budget is $50k and we need 100 students for the first cohort."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 6 (min: 5)
  - ✓ Node count: 6 ≤ 10
  - ✗ Missing "review" category (found: trigger, action, output)
  - ✓ All 7 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 752c, no thin nodes
  - ✓ Architecture covers: curriculum, instructor, platform, enroll
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (7 edges, 6 nodes)
- Nodes: Bootcamp Launch Trigger (trigger), Curriculum & Instructor Setup (action), Platform & Content Production (action), Beta Test & Marketing Launch (action), Live Delivery & Outcomes Tracking (action), Bootcamp Launch Report (output)
- Message preview: Mission received. Building a 12-week bootcamp launch workflow with budget and enrollment constraints.

