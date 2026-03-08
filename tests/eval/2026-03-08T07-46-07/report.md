# Eval Report — 2026-03-08T07-46-07

Overall: **100%** (5/6 passed) | Pool: 36 tests, 6 selected

## founder-mvp-launch — 0% (180063ms)
- Agent: rowan | Task: generate | Provider: undefined/undefined
- Prompt: "I'm launching my SaaS app in 2 weeks. I have the code ready but no deployment process, no monitoring, nothing. Help me set up everything I need to go live safely."
- **Error**: api_error: The operation was aborted due to timeout
- Checks:
  - ✗ API error: api_error
- Message preview: The operation was aborted due to timeout

## founder-advice — 100% (26565ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "We're burning $50k/month and have 6 months of runway. What should I prioritize?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (473 chars)
  - ✓ Message length: 473 ≥ 300
- Message preview: With a $50k monthly burn and 6 months of runway, prioritize immediate revenue generation and cost-cutting: analyze expenses with tools like ProfitWell to slash non-essentials, focus on high-ROI custom...

## marketing-advice — 100% (14550ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "Our email open rates dropped from 35% to 12% over the last quarter. What could be wrong?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (322 chars)
  - ✓ Message length: 322 ≥ 300
- Message preview: Ah, a most troubling case, mon ami! A drop from 35% to 12% is no mere fluctuation—it is a clue shouting for attention. Let us engage the little grey cells and examine the evidence: first, inspect your...

## hr-onboarding — 100% (149805ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "New hires keep saying their first week was confusing and they didn't know what to do. Design an onboarding process that actually works — IT setup, team intros, training, 30-60-90 day goals."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ All 9 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 684c, no thin nodes
  - ✓ Architecture covers: it, training, 30
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (9 edges, 7 nodes)
- Nodes: New Hire Start Notification (trigger), IT Infrastructure Setup (action), Team Introduction Framework (action), Onboarding Training Program (action), 30-60-90 Day Goal Setting Workshop (action), 30-Day Progress Review (review), Onboarding Completion Artifact (output)
- Message preview: Aha! The mystery of the muddled first week is one I relish, mon ami. I've constructed an onboarding workflow that will transform confusion into clarity, with each step meticulously planned to ensure n...

## execute-sow — 100% (59613ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (6783 chars)
  - ✓ Content length: 6783 ≥ 300
- Message preview: # Statement of Work: E-Commerce Web Application Redesign

**Project Title:** E-Commerce Platform Modernization & Redesign
**Client:** [Client Company Name]
**Vendor:** [Your Agency/Consultancy Name]
*...

## personality-poirot-empty — 100% (15052ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (222 chars)
  - ✓ Personality markers present
- Message preview: Aha! Mon ami, we have a pristine slate before us – no clues gathered, no evidence mapped, and no case yet to unravel in our visual workflow. Let us engage the little grey cells and craft an elegant in...

## Issues to Fix

- **founder-mvp-launch**: ✗ API error: api_error
