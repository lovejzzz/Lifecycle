# Eval Report — 2026-03-08T06-24-35

Overall: **94%** (2/6 passed) | Pool: 32 tests, 6 selected

## founder-fundraising — 0% (90037ms)
- Agent: poirot | Task: generate | Provider: undefined/undefined
- Prompt: "We're raising our Series A. I need to manage the whole fundraising process — investor outreach, pitch deck prep, due diligence, term sheet negotiation. Build me a workflow for this."
- **Error**: api_error: The operation was aborted due to timeout
- Checks:
  - ✗ API error: api_error
- Message preview: The operation was aborted due to timeout

## marketing-campaign — 0% (90017ms)
- Agent: rowan | Task: generate | Provider: undefined/undefined
- Prompt: "I need to launch a Black Friday campaign across email, social media, and Google Ads. Budget is $10k. Make me a workflow that covers everything from creative to post-campaign analysis."
- **Error**: api_error: The operation was aborted due to timeout
- Checks:
  - ✗ API error: api_error
- Message preview: The operation was aborted due to timeout

## eng-oncall — 0% (90015ms)
- Agent: poirot | Task: generate | Provider: undefined/undefined
- Prompt: "We just got paged at 3am for the third time this week. We need an incident response process. Currently it's just chaos — whoever sees Slack first tries to fix it."
- **Error**: api_error: The operation was aborted due to timeout
- Checks:
  - ✗ API error: api_error
- Message preview: The operation was aborted due to timeout

## pm-feature-ship — 0% (90018ms)
- Agent: rowan | Task: generate | Provider: undefined/undefined
- Prompt: "I need to ship a new payments feature. It touches billing, the API, the frontend, and we need legal to review the T&C changes. Give me a workflow that makes sure nothing falls through the cracks."
- **Error**: api_error: The operation was aborted due to timeout
- Checks:
  - ✗ API error: api_error
- Message preview: The operation was aborted due to timeout

## execute-job-description — 100% (33187ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-chat
- Prompt: "Write a job description for a Senior Full-Stack Engineer at a Series B fintech startup. Tech stack is React, Node.js, PostgreSQL, AWS. Remote-first, competitive equity."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (4881 chars)
  - ✓ Content length: 4881 ≥ 200
- Message preview: # Senior Full-Stack Engineer

## About Us
We are a Series B fintech startup on a mission to democratize access to sophisticated financial tools. Backed by leading venture capital firms, we're building...

## personality-poirot-empty — 100% (4408ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-chat
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (296 chars)
  - ✓ Personality markers present
- Message preview: Mon ami, the canvas is empty — a blank slate, a case without clues! But do not despair. The little grey cells are ready. Tell me, what mystery shall we solve? A workflow for a new feature? A deploymen...

## Issues to Fix

- **founder-fundraising**: ✗ API error: api_error
- **marketing-campaign**: ✗ API error: api_error
- **eng-oncall**: ✗ API error: api_error
- **pm-feature-ship**: ✗ API error: api_error
