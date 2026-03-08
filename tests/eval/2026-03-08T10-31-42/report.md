# Eval Report — 2026-03-08T10-31-42

Overall: **99%** (6/6 passed) | Pool: 48 tests, 6 selected

## personality-rowan-empty — 100% (8701ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (145 chars)
  - ✓ Personality markers present
- Message preview: Graph is empty, soldier. No active workflows. If you're scouting for a mission, give me coordinates—build something or ask for tactical analysis.

## personality-poirot-empty — 100% (9478ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (211 chars)
  - ✓ Personality markers present
- Message preview: Ah, mon ami! The case is fresh — the canvas is empty, the clues yet to be discovered. But my little grey cells are ready! Present me with your mystery: what system shall we design, what process shall ...

## education-course-launch — 100% (167735ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "I'm creating an online course on data analytics. I need a workflow: outline curriculum, record videos, build exercises, set up LMS, beta test with students, launch and market."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ All 10 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 940c, no thin nodes
  - ✓ Architecture covers: curriculum, record, exercise, lms
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 8 nodes)
- Nodes: Course Creation Trigger (trigger), Curriculum Design (artifact), Video Production (action), Exercise Development (action), LMS Configuration (action), Beta Testing Phase (test), Launch Approval (review), Course Launch (output)
- Message preview: Aha! Mon ami, the case of the data analytics course is cracked! I have constructed a workflow with meticulous nodes and edges, ensuring every step is investigated and refined. Voilà!

## finance-audit-readiness — 96% (181783ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We have a SOC 2 audit in 90 days. Build me a workflow to get audit-ready: evidence collection, access reviews, policy documentation, vulnerability scanning, and vendor risk assessment. We have never done this before."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✗ Missing "policy" category (found: trigger, action, review, test, output)
  - ✓ Has "review" category
  - ✓ All 13 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 892c, no thin nodes
  - ✓ Architecture covers: evidence, access, policy, vulnerab
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (13 edges, 8 nodes)
- Nodes: Audit Announcement (trigger), Plan and Scope Definition (action), Policy Documentation (action), Security Assessments (action), Vendor Risk Management (action), Internal Audit Review (review), Compliance Validation (test), SOC 2 Readiness Package (output)
- Message preview: Mission received. Building SOC 2 audit readiness workflow with parallel tracks and feedback loops.

## edge-ultra-terse — 100% (115052ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "Bug triage workflow."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 6 (min: 4)
  - ✓ Node count: 6 ≤ 10
  - ✓ All 7 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 702c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (7 edges, 6 nodes)
- Nodes: Bug Report Submission (trigger), Initial Bug Analysis (action), Reproduction Verification (test), Severity and Priority Assessment (review), Assignment and Action Plan (action), Triage Documentation (output)
- Message preview: Aha! The case of the pesky bug, mon ami. Let us construct a meticulous workflow to triage these digital miscreants, using the little grey cells to ensure no clue is overlooked.

## execute-runbook — 100% (88261ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a production incident runbook for a microservices e-commerce platform. Cover severity classification (P1-P4), escalation paths, communication templates, rollback procedures, and post-incident review. Include specific commands for Kubernetes and AWS."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (8788 chars)
  - ✓ Content length: 8788 ≥ 1500
- Message preview: # Production Incident Runbook: Microservices E-Commerce Platform

## 1.0 Overview & Purpose
This runbook provides standardized procedures for detecting, responding to, and resolving incidents affectin...

