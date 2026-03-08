# Eval Report — 2026-03-08T18-31-08

Overall: **100%** (6/6 passed) | Pool: 86 tests, 6 selected

## marketing-advice — 100% (13129ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "Our email open rates dropped from 35% to 12% over the last quarter. What could be wrong?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (364 chars)
  - ✓ Message length: 364 ≥ 250
- Message preview: Ah, mon ami, a dramatic drop from 35% to 12%—this is a case for the little grey cells! We must investigate three primary culprits: deliverability (are your emails even reaching the inbox?), content re...

## execute-job-description — 100% (43263ms)
- Agent: rowan | Task: execute | Provider: deepseek/deepseek-reasoner
- Prompt: "Write a job description for a Senior Full-Stack Engineer at a Series B fintech startup. Tech stack is React, Node.js, PostgreSQL, AWS. Remote-first, competitive equity."
- Checks:
  - ✓ Valid JSON response
  - ✓ Has content (5365 chars)
  - ✓ Content length: 5365 ≥ 200
- Message preview: **Job Description: Senior Full-Stack Engineer**

**Location:** Remote-First (Global)
**Company:** [Startup Name], a Series B Fintech Innovator
**Compensation:** Competitive Salary + Meaningful Equity ...

## personality-poirot-empty — 100% (15703ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "What do we have so far?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (187 chars)
  - ✓ Personality markers present
- Message preview: Ah, mon ami! The case file is empty—no nodes or edges to examine yet. We must start with the first clue; perhaps you'd like to build a workflow or share your objectives for investigation?

## startup-advice-growth — 100% (19724ms)
- Agent: poirot | Task: analyze | Provider: deepseek/deepseek-reasoner
- Prompt: "We are a pre-seed startup with $150k in the bank, 2 founders, and a working MVP with 50 beta users. Our MRR is $800. We have interest from an angel who wants to invest $500k at a $5M valuation but wants us to pivot from B2C to B2B. Our users love the product. Should we take the money and pivot, or try to grow organically?"
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow correctly null
  - ✓ Has message (509 chars)
  - ✓ Message length: 509 ≥ 250
- Message preview: Ah, a delicate case of investor temptation versus user devotion! Before deciding, mon ami, conduct a rapid B2B validation sprint: use tools like LinkedIn Sales Navigator to target 20 potential enterpr...

## education-online-course-creation — 100% (154627ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "Build a workflow for creating and launching a 12-week online coding bootcamp. Steps: curriculum design, instructor recruitment, platform setup (LMS), content recording, beta testing with 20 students, marketing and enrollment, live cohort delivery, and student outcomes tracking. Budget is $50k and we need 100 students for the first cohort."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 9 (min: 5)
  - ✓ Node count: 9 ≤ 10
  - ✓ Has "review" category
  - ✓ All 11 edges valid
  - ✓ Starts with trigger
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 938c, no thin nodes
  - ✓ Architecture covers: curriculum, instructor, platform, enroll
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (11 edges, 9 nodes)
- Nodes: Project Kickoff (trigger), Curriculum Development (action), Platform and Team Setup (action), Beta Testing (test), Launch Approval Review (review), Marketing and Enrollment (action), Live Cohort Delivery (action), Outcomes Tracking (action), Bootcamp Launch Report (output)
- Message preview: Mission received. Bootcamp workflow deployed.

## media-content-multiformat — 100% (126646ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-reasoner
- Prompt: "We record a weekly 1-hour podcast episode (MP3). Build a workflow that repurposes each episode into: a full written transcript (DOCX), a 2000-word blog post (Markdown), 5 short video clips for social media (MP4 with captions), an email newsletter summary (HTML), and a YouTube video with chapter markers. Each format has different requirements and review gates."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 7 (min: 5)
  - ✓ Node count: 7 ≤ 10
  - ✓ Has "review" category
  - ✓ All 9 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 741c, no thin nodes
  - ✓ Architecture covers: transcript, blog, video, email
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (9 edges, 7 nodes)
- Nodes: Podcast Episode MP3 (input), Transcribe Audio to Text (action), Develop Written Content (action), Produce Video Content (action), Approve Written Content (review), Approve Video Content (review), Publish and Distribute All Formats (output)
- Message preview: Aha! Mon ami, I have constructed a meticulous workflow to repurpose your podcast episode—each clue from the audio will blossom into multiple formats. With my little grey cells, I've designed parallel ...

