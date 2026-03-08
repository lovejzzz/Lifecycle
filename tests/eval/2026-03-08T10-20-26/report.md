# Eval Report — 2026-03-08T10-20-26

Overall: **97%** (6/6 passed) | Pool: 46 tests, 6 selected

## founder-fundraising — 100% (105434ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We're raising our Series A. I need to manage the whole fundraising process — investor outreach, pitch deck prep, due diligence, term sheet negotiation. Build me a workflow for this."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 9 (min: 5)
  - ✓ Node count: 9 ≤ 10
  - ✓ Has "review" category
  - ✓ All 10 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 853c, no thin nodes
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 9 nodes)
- Nodes: Fundraising Kickoff (trigger), Pitch Deck & Narrative (artifact), Target Investor List (artifact), Investor Outreach & Meetings (action), Due Diligence Preparation (action), Term Sheet Drafting (artifact), Term Sheet Negotiation (action), Final Due Diligence & Sign-off (review), Funds Received & Investor Onboarding (output)
- Message preview: Aha! The case of the elusive Series A—a most delicate investigation. I shall assemble a workflow with the precision of a detective mapping the clues, mon ami. Voilà!

## eng-advice-scaling — 100% (26097ms)
- Agent: rowan | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "Our API is hitting 500ms response times at 1000 concurrent users. Database is PostgreSQL. What should I look at first?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (361 chars)
  - ✓ Message length: 361 ≥ 250
- Message preview: Zero in on PostgreSQL first: run `EXPLAIN ANALYZE` on queries hitting >100ms via pg_stat_statements, check index usage with pg_stat_all_indexes, and verify connection pool limits aren't maxing out—adj...

## hr-hiring — 90% (193023ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We need to hire 5 engineers in the next 2 months. Our current process is just posting on LinkedIn and hoping. Build me a proper hiring pipeline."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 9 (min: 5)
  - ✓ Node count: 9 ≤ 10
  - ✓ Has "review" category
  - ✓ All 16 edges valid
  - ✓ Starts with trigger
  - ✗ Last node is "policy", expected output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 1055c, no thin nodes
  - ✗ Flow: no path from first node to last node (unreachable)
  - ✓ Architecture: has feedback loops AND parallel branches (16 edges, 9 nodes)
- Nodes: Hiring Goal Trigger (trigger), Job Requirement Definition (action), Multi-Channel Candidate Sourcing (action), Resume Screening and Initial Contact (review), Technical Skills Assessment (test), Cultural Fit and Final Interview (review), Offer Management and Negotiation (action), Successful Engineer Hires (output), Hiring Compliance and Diversity Policy (policy)
- Message preview: Mission received. Deploying structured hiring pipeline to secure 5 engineers within 2 months.

## freelancer-advice — 100% (26734ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "I'm charging $50/hour for web development and I'm always booked but barely making rent. What am I doing wrong?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (343 chars)
  - ✓ Message length: 343 ≥ 250
- Message preview: Aha! Mon ami, the clue lies in your hourly rate—$50 is far too modest for a fully booked web developer. Investigate your true costs with tools like FreshBooks to track expenses and calculate your net ...

## execute-sow — 100% (52536ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (5975 chars)
  - ✓ Content length: 5975 ≥ 300
- Message preview: # Statement of Work (SOW): E-Commerce Web Application Redesign

**Project Title:** Horizon Redesign – Modernization of AcmeStore's E-Commerce Platform
**Client:** [Client Company Name, a mid-size e-co...

## personality-poirot-empty — 100% (9823ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (196 chars)
  - ✓ Personality markers present
- Message preview: Mon ami, the case file is currently empty—we have no visual workflow yet. But do not despair! With the little grey cells, we can build a brilliant investigation. What mystery shall we solve today?

