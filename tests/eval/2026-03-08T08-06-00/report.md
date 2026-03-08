# Eval Report — 2026-03-08T08-06-00

Overall: **100%** (6/6 passed) | Pool: 36 tests, 6 selected

## eng-code-review — 100% (149487ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "PRs sit for days because nobody reviews them. I want an automated workflow: PR opened → assign reviewer → review deadline → merge or request changes → deploy."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "review" category
  - ✓ Has "action" category
  - ✓ All 8 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 855c, no thin nodes
  - ✓ Architecture covers: assign, deadline, merge, deploy
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (8 edges, 7 nodes)
- Nodes: GitHub PR Opened Webhook (trigger), Auto-Assign Reviewer Engine (action), Review SLA Enforcement Policy (policy), Peer Code Review Gate (review), PR Merge Automation (action), Change Request Handler (action), Production Deployment Pipeline (output)
- Message preview: Mission received. Building automated PR review workflow.

## creator-youtube — 100% (139935ms)
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
  - ✓ Content depth: avg 936c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 9 nodes)
- Nodes: Video Idea Trigger (trigger), Topic Research & Validation (action), Script Writing (action), Filming Setup & Execution (action), Video Editing (action), Thumbnail Design (action), SEO & Metadata Optimization (action), Quality Assurance Review (review), Upload & Promotion Launch (output)
- Message preview: Aha! Mon ami, I have deduced the perfect production workflow for your YouTube channel. Voilà, a detailed map to ensure each video is a masterpiece, from clue-gathering in research to the grand reveal ...

## execute-incident-postmortem — 100% (60973ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a blameless post-mortem for a 2-hour production outage caused by a database migration that locked a critical table. 500 customers were affected. Include timeline, root cause, impact, and action items."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (6957 chars)
  - ✓ Content length: 6957 ≥ 300
- Message preview: # Post-Mortem Report: Production Outage - Critical Table Lock During Database Migration

**Date of Incident:** [Date]
**Report Date:** [Date]
**Status:** RESOLVED
**Severity:** SEV-1 (Critical)
**Affe...

## edge-question-looks-like-build — 100% (10898ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What's the best way to set up a data pipeline?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (428 chars)
  - ✓ Message length: 428 ≥ 50
- Message preview: Ah, a classic case of data logistics, mon ami! The best way is to treat it not as a mere pipe but as a living investigation: automate relentlessly, monitor like a hawk, and always leave a clear eviden...

## edge-build-looks-like-question — 100% (165075ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "Can you set up a data pipeline for me? I have CSVs coming from 3 vendors daily and need them in BigQuery by morning."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 4)
  - ✓ All 10 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 668c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 8 nodes)
- Nodes: Daily Schedule Trigger (trigger), Ingest Vendor A CSVs (action), Ingest Vendor B CSVs (action), Ingest Vendor C CSVs (action), Transform and Clean Data (action), Data Quality Validation (test), Load to BigQuery (action), BigQuery Data Available (output)
- Message preview: On it. Building a robust data pipeline for daily CSV ingestion from three vendors to BigQuery.

## personality-poirot-empty — 100% (10028ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (151 chars)
  - ✓ Personality markers present
- Message preview: Mon ami, the canvas is bare! A blank slate awaiting your grand design. My little grey cells are ready to assist – what case shall we investigate first?

