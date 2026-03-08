# Eval Report — 2026-03-08T16-13-18

Overall: **98%** (2/2 passed) | Pool: 78 tests, 2 selected

## education-syllabus-multi-output — 96% (60550ms)
- Agent: rowan | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "I have a 16-week Intro to Computer Science syllabus document. Build a workflow that transforms it into three separate deliverables: weekly lesson plans (with learning objectives, activities, and homework), grading rubrics for each assignment, and slide decks for each module. Each deliverable needs its own quality review before final delivery."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 6 (min: 5)
  - ✓ Node count: 6 ≤ 10
  - ✓ Has "review" category
  - ✗ Missing "artifact" category (found: input, action, review, output)
  - ✓ All 10 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 888c, no thin nodes
  - ✓ Architecture covers: lesson, rubric, slide
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (10 edges, 6 nodes)
- Nodes: Syllabus Input (input), Lesson Plan Generator (action), Rubric Designer (action), Slide Deck Builder (action), Quality Review Gates (review), Final Deliverables Output (output)
- Message preview: Mission received. Building a syllabus transformation pipeline with parallel quality gates.

## media-content-multiformat — 100% (70147ms)
- Agent: poirot | Task: generate | Provider: deepseek/deepseek-chat
- Prompt: "We record a weekly 1-hour podcast episode (MP3). Build a workflow that repurposes each episode into: a full written transcript (DOCX), a 2000-word blog post (Markdown), 5 short video clips for social media (MP4 with captions), an email newsletter summary (HTML), and a YouTube video with chapter markers. Each format has different requirements and review gates."
- Checks:
  - ✓ Valid JSON response
  - ✓ Workflow present
  - ✓ Node count: 8 (min: 5)
  - ✓ Node count: 8 ≤ 10
  - ✓ Has "review" category
  - ✓ All 11 edges valid
  - ✓ Starts with input
  - ✓ Ends with output
  - ✓ 100% nodes have descriptions
  - ✓ All nodes connected
  - ✓ Content depth: avg 632c, no thin nodes
  - ✓ Architecture covers: transcript, blog, video, email
  - ✓ Flow: path exists from first to last node
  - ✓ Architecture: has feedback loops AND parallel branches (11 edges, 8 nodes)
- Nodes: Podcast Recording (input), Transcription & Timestamping (action), Content Strategy Session (review), Parallel Content Creation (action), Quality Assurance Gates (test), YouTube Assembly (action), Final Editorial Review (review), Distribution Package (output)
- Message preview: Ah, mon ami! A podcast repurposing case worthy of my little grey cells. I shall construct a workflow that transforms your single audio clue into a complete multimedia evidence trail. The architecture ...

