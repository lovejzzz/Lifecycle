# Eval Report — 2026-03-08T19-43-46

Overall: **98%** (7/7 passed) | Pool: 92 tests, 7 selected

## creator-youtube — 100% (57630ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "I want to start a YouTube channel. Build me a production workflow for each video — topic research, scripting, filming, editing, thumbnail, SEO, upload, promotion."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ All 9 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 810c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (9 edges, 7 nodes)
- Nodes: Topic & Research (input), Script & Storyboard (artifact), Production & Filming (action), Editing & Thumbnail (action), SEO & Upload Prep (action), Quality Review (review), Publication & Promotion (output)
- Message preview: Ah, mon ami! A YouTube channel case! Let us examine the evidence and build a proper production workflow. The little grey cells tell me we need structure with feedback loops — for quality is everything...

## freelancer-advice — 100% (4174ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "I'm charging $50/hour for web development and I'm always booked but barely making rent. What am I doing wrong?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (286 chars)
  - ✓ Message length: 286 ≥ 250
- Message preview: Mon ami, the case is clear: you are a master craftsman, but a poor accountant. Your rate is a clue—$50/hour is the apprentice's fee, not the maestro's. The evidence points to underpricing, scope creep...

## personality-poirot-empty — 100% (3298ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (188 chars)
  - ✓ Personality markers present
- Message preview: Ah, mon ami, the canvas is empty—a blank slate awaiting the first clue. But do not fret; every great investigation begins with a single piece of evidence. What case shall we unravel today?

## finance-audit-readiness — 96% (68194ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We have a SOC 2 audit in 90 days. Build me a workflow to get audit-ready: evidence collection, access reviews, policy documentation, vulnerability scanning, and vendor risk assessment. We have never done this before."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✗ Missing "policy" category (found: trigger, artifact, action, review, test, output)
  - ✓ Has "review" category
  - ✓ All 10 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 1033c, no thin nodes
  - ✓ Architecture covers: evidence, access, policy, vulnerab
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 7 nodes)
- Nodes: SOC 2 Audit Kickoff (trigger), Policy Framework Development (artifact), Technical Control Implementation (action), Evidence Collection & Gap Assessment (action), Vendor Risk Assessment (review), Readiness Review & Dry Run (test), SOC 2 Audit Execution (output)
- Message preview: Mission received. Building SOC 2 readiness workflow with parallel tracks and feedback loops.

## healthcare-patient-intake — 100% (60209ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "Design a patient intake workflow for a telehealth clinic. Steps include appointment scheduling, insurance verification, medical history form, consent collection, provider assignment, and video call setup. Must be HIPAA compliant."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "policy" category
  - ✓ All 13 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 908c, no thin nodes
  - ✓ Architecture covers: insurance, consent, hipaa
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (13 edges, 7 nodes)
- Nodes: Patient Scheduling Request (trigger), Parallel Verification & Consent (state), Medical History Intake (artifact), HIPAA Security Review (policy), Provider Assignment & Prep (action), Pre-Visit Quality Check (review), Telehealth Visit Launch (output)
- Message preview: Ah, mon ami! A telehealth intake case worthy of the little grey cells. I have constructed a workflow that not only captures the essential steps but weaves in the critical HIPAA safeguards throughout -...

## execute-security-incident — 100% (56180ms)
- Agent: poirot | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a security incident report for a data breach where an attacker exploited an unpatched Log4j vulnerability to access our customer database. 15,000 user records were exposed including emails and hashed passwords. The breach was detected 72 hours after initial access via anomalous CloudWatch logs."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (7934 chars)
  - ✓ Content length: 7934 ≥ 1500
- Message preview: # Security Incident Report: Unauthorized Data Access via Log4Shell Exploitation

**Report Classification:** CONFIDENTIAL - INTERNAL USE ONLY  
**Incident ID:** SEC-2023-0472  
**Date of Report:** Octo...

## healthcare-patient-intake — 93% (49803ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "Build a patient intake workflow for our new urgent care clinic. Steps: online pre-registration, insurance verification, HIPAA consent forms, triage assessment, provider assignment, and visit documentation. We see 80 patients/day and need average intake under 15 minutes."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 6 (min: 5)
  - ✓ Node count: 6 ≤ 10
  - ✗ Missing "review" category (found: trigger, action, state, artifact, output)
  - ✓ All 7 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 798c, no thin nodes
  - ✓ Architecture covers: registr, insurance, triage, document
  - ✓ Flow: path exists from first to last node
  - ⚡ Architecture: has parallel branches (7 edges, 6 nodes)
- Nodes: Patient Pre-Registration Trigger (trigger), Insurance Verification & HIPAA Consent (action), Triage Assessment (action), Provider Assignment & Rooming (state), Visit Documentation (artifact), Intake Output & Metrics (output)
- Message preview: Mission received. Building a high-throughput patient intake workflow optimized for 15-minute average intake.

