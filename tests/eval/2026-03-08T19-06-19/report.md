# Eval Report — 2026-03-08T19-06-19

Overall: **96%** (5/6 passed) | Pool: 90 tests, 6 selected

## execute-job-description — 100% (38950ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a job description for a Senior Full-Stack Engineer at a Series B fintech startup. Tech stack is React, Node.js, PostgreSQL, AWS. Remote-first, competitive equity."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (5684 chars)
  - ✓ Content length: 5684 ≥ 200
- Message preview: # Senior Full-Stack Engineer

**Location:** Remote-First (Global)
**Employment Type:** Full-Time
**Equity:** Competitive Package Offered

## About Us

We are a Series B fintech startup on a mission to...

## edge-complex-multi-team — 100% (104454ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We're migrating from AWS to GCP. It involves the platform team, app developers, security, and finance. There are 40 microservices. I need a migration plan workflow."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 10 (min: 5)
  - ✓ Node count: 10 ≤ 10
  - ✓ All 14 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 1030c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (14 edges, 10 nodes)
- Nodes: Migration Kickoff & Discovery (trigger), Architecture Design & Planning (state), Foundation & Environment Setup (action), Service Migration Execution (action), Testing & Validation (test), Security & Compliance Review (policy), Finance Cost Review (review), Production Cutover Approval (review), Post-Migration Optimization (action), Migration Completion Report (output)
- Message preview: Ah, a migration case worthy of the little grey cells! This multi-team, multi-service cloud transition requires careful orchestration. Let me construct a workflow that accounts for all stakeholders and...

## personality-poirot-empty — 100% (4160ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (234 chars)
  - ✓ Personality markers present
- Message preview: Mon ami, the case is fresh—the board is empty, awaiting our first clue. Let us begin by selecting a target. What mystery shall we unravel? A new feature, a process audit, perhaps a deployment pipeline...

## data-ml-pipeline — 100% (63716ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "Build me an ML model deployment pipeline. Steps: data collection, feature engineering, model training, evaluation, A/B testing, deployment to production, monitoring for drift. We use Python, scikit-learn, and AWS SageMaker."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "test" category
  - ✓ All 8 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 787c, no thin nodes
  - ✓ Architecture covers: feature, train, evaluat, deploy, drift
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (8 edges, 7 nodes)
- Nodes: Trigger: New Data Available (trigger), Data Processing & Feature Engineering (action), Model Training & Hyperparameter Tuning (action), Model Evaluation & Validation (test), A/B Testing & Canary Deployment (review), Production Deployment & Monitoring (action), Output: Deployed Model with Monitoring Dashboard (output)
- Message preview: Mission received. Building an ML deployment pipeline with AWS SageMaker integration.

## edge-conflicting-advice — 70% (52614ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "We need to ship a critical security patch ASAP but our QA team is on vacation for 2 weeks. The CEO wants it live today. What do we do?"
- Checks:
  - ✓ Valid JSON response
  - ✗ Workflow unexpectedly present
  - ✓ All 8 edges valid
  - ✓ Has message (286 chars)
  - ✓ Message length: 286 ≥ 250
- Nodes: Critical Security Patch Alert (trigger), Automated Security Test Suite (test), Canary Deployment Gate (review), Full Production Rollout (action), Post-Deployment Security Audit (policy), Patch Verification Report (output)
- Message preview: Deploy a hotfix with a zero-trust, automated security validation pipeline. Bypass manual QA by implementing automated security regression tests, canary deployments, and immediate rollback triggers. I'...

## execute-runbook — 100% (84710ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a production incident runbook for a microservices e-commerce platform. Cover severity classification (P1-P4), escalation paths, communication templates, rollback procedures, and post-incident review. Include specific commands for Kubernetes and AWS."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (9887 chars)
  - ✓ Content length: 9887 ≥ 1500
- Message preview: # Production Incident Runbook: E-Commerce Microservices Platform

## 1. Severity Classification Matrix

### P1 - Critical
**Impact:** Complete platform outage, major revenue loss, security breach, dat...

## Issues to Fix

- **edge-conflicting-advice**: ✗ Workflow unexpectedly present
