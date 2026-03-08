# Eval Report — 2026-03-08T12-31-51

Overall: **100%** (6/6 passed) | Pool: 58 tests, 6 selected

## marketing-campaign — 100% (197110ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "I need to launch a Black Friday campaign across email, social media, and Google Ads. Budget is $10k. Make me a workflow that covers everything from creative to post-campaign analysis."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ All 8 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 1150c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (8 edges, 8 nodes)
- Nodes: Campaign Brief (input), Strategy Planning (action), Creative Development (artifact), Creative Approval (review), Multi-Channel Launch (action), Live Monitoring (state), Performance Optimization (test), Post-Campaign Analysis (output)
- Message preview: Mission received. Deploying Black Friday campaign workflow.

## marketing-blog — 100% (124825ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "Our blog is a mess. We publish whenever someone feels like it, no editorial calendar, no SEO, no promotion. Design a proper content pipeline for us."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 6 (min: 5)
  - ✓ Node count: 6 ≤ 10
  - ✓ Has "review" category
  - ✓ All 7 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 594c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (7 edges, 6 nodes)
- Nodes: Editorial Calendar & Planning (trigger), Content Drafting & Creation (action), SEO & Quality Optimization (test), Multimedia & Design Integration (action), Editorial Review & Approval (review), Publishing & Distribution (output)
- Message preview: Aha! The case of the chaotic blog is now before us, mon ami. Let us design a meticulous content pipeline to bring order and strategy, using the little grey cells to uncover clues for success. Voilà, t...

## execute-sow — 100% (63533ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (6737 chars)
  - ✓ Content length: 6737 ≥ 300
- Message preview: # Statement of Work: E-Commerce Web Application Redesign

**Project Title:** Modernization of E-Commerce Platform User Experience & Interface
**Client:** [Client Company Name], a mid-sized e-commerce ...

## personality-rowan-empty — 100% (7413ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (114 chars)
  - ✓ Personality markers present
- Message preview: We have an empty workspace. Ready for mission input. Tell me what you need built, and I’ll architect the workflow.

## personality-poirot-empty — 100% (7789ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (203 chars)
  - ✓ Personality markers present
- Message preview: Mon ami, we have a pristine canvas before us—a blank slate awaiting the first clues of our investigation. I see no nodes, no edges, no evidence of a workflow yet. Très intéressant! Shall we begin a ca...

## culture-advice-remote-team — 100% (15766ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "We went fully remote 6 months ago. Team velocity is down 30%, people skip standups, Slack is dead silent, and two senior engineers are about to quit. The CEO thinks forcing everyone back to the office will fix it. What should we actually do?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (411 chars)
  - ✓ Message length: 411 ≥ 250
- Message preview: Ah, mon ami, a troubling case indeed. The symptoms are clear—declining velocity, silent channels, fleeing talent—but the CEO's prescription is like blaming the weather for a sinking ship. Forcing a re...

