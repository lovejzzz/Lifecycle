# Eval Report — 2026-03-08T08-26-56

Overall: **99%** (6/6 passed) | Pool: 38 tests, 6 selected

## founder-fundraising — 100% (87262ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We're raising our Series A. I need to manage the whole fundraising process — investor outreach, pitch deck prep, due diligence, term sheet negotiation. Build me a workflow for this."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "review" category
  - ✓ All 10 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 852c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 7 nodes)
- Nodes: Fundraising Trigger (trigger), Investor Materials & Narrative (artifact), Targeted Investor Outreach (action), Pitch Meeting & Follow-up (review), Due Diligence Deep Dive (test), Term Sheet Negotiation & Selection (action), Series A Closed & Integration (output)
- Message preview: Mon ami, let us examine the clues of this grand affair. Building a Series A fundraising workflow is like assembling evidence for a jury of investors—every detail must be impeccable. Voilà, I present t...

## eng-oncall — 100% (131983ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We just got paged at 3am for the third time this week. We need an incident response process. Currently it's just chaos — whoever sees Slack first tries to fix it."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ Has "trigger" category
  - ✓ All 10 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 761c, no thin nodes
  - ✓ Architecture covers: alert, triage, communicat, postmortem
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 8 nodes)
- Nodes: Incident Alert Trigger (trigger), Triage and Acknowledge (action), Root Cause Investigation (action), Stakeholder Communication (action), Mitigation Implementation (action), Resolution Validation (test), Post-Incident Review (review), Incident Report Output (output)
- Message preview: Aha! The midnight pages are leaving clues scattered like breadcrumbs, mon ami. Let us reconstruct the scene with a meticulous incident response workflow — order from chaos, très intéressant!

## hr-hiring — 100% (128563ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We need to hire 5 engineers in the next 2 months. Our current process is just posting on LinkedIn and hoping. Build me a proper hiring pipeline."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 9 (min: 5)
  - ✓ Node count: 9 ≤ 10
  - ✓ Has "review" category
  - ✓ All 13 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 890c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (13 edges, 9 nodes)
- Nodes: Hiring Initiative Kickoff (trigger), Job Requirements Definition (input), Multi-Channel Sourcing Strategy (action), Resume Screening & Initial Assessment (action), Technical Skill Assessment (test), Panel Interview Rounds (review), Hiring Compliance & Diversity Policy (policy), Final Approval & Offer Management (review), Offer Extension & Onboarding Setup (output)
- Message preview: Mission received. Building structured hiring pipeline with multi-channel sourcing and rigorous vetting.

## creator-youtube — 95% (187830ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "I want to start a YouTube channel. Build me a production workflow for each video — topic research, scripting, filming, editing, thumbnail, SEO, upload, promotion."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 11 (min: 5)
  - ✗ Node count: 11 > 10
  - ✓ All 12 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 919c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (12 edges, 11 nodes)
- Nodes: Idea Conception & Trigger (trigger), Research & Ideation (action), Script Development (action), Script Approval Gate (review), Production Filming (action), Editing Suite (action), Quality Assurance Review (review), Thumbnail & SEO Crafting (action), Upload & Metadata Finalization (action), Promotion Launch (action), Live Content & Analytics (output)
- Message preview: Aha! Mon ami, I have constructed a meticulous workflow for your YouTube channel—each node is a clue in the case, from inception to promotion. Let the little grey cells examine every detail with precis...

## execute-incident-postmortem — 100% (52911ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a blameless post-mortem for a 2-hour production outage caused by a database migration that locked a critical table. 500 customers were affected. Include timeline, root cause, impact, and action items."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (5783 chars)
  - ✓ Content length: 5783 ≥ 300
- Message preview: # Post-Mortem Report: Production Database Outage
**Date:** October 26, 2023
**Status:** Resolved
**Outage Duration:** 2 hours, 14 minutes
**Affected Users:** Approximately 500 active customers
**Prima...

## personality-poirot-empty — 100% (13516ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (175 chars)
  - ✓ Personality markers present
- Message preview: Mon ami, the canvas is bare—the case is yet unopened, and we have no clues or evidence laid out. Shall we begin our investigation by building a workflow to solve your mystery?

