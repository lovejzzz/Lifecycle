#!/usr/bin/env node
/**
 * Real-world evaluation harness for Lifecycle Agent.
 * Picks a random subset from a large prompt pool each run so every cycle tests
 * different scenarios. Sends actual requests to the running dev server's /api/cid.
 *
 * Usage: node tests/eval/run-eval.mjs
 * Requires: dev server running at http://localhost:3000
 */

const BASE = 'http://localhost:3000/api/cid';

// Override model via CLI arg or env: MODEL=deepseek-chat node tests/eval/run-eval.mjs
const MODEL_OVERRIDE = process.argv[2] || process.env.MODEL || null;

// Force specific test IDs: FORCE_IDS=test1,test2 node tests/eval/run-eval.mjs
const FORCE_IDS = process.env.FORCE_IDS ? process.env.FORCE_IDS.split(',').map(s => s.trim()) : null;

// How many tests to run per cycle (keeps each run under ~5 min)
const TESTS_PER_RUN = 6;

// ─── Full Prompt Pool ───────────────────────────────────────────────────────
// Each run picks TESTS_PER_RUN random tests from this pool.

const POOL = [
  // ═══════════════════════════════════════════════════════════════════════════
  // REAL PEOPLE TASKS — How actual humans talk to an AI agent
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Startup Founder ──────────────────────────────────────────────────────
  {
    id: 'founder-mvp-launch',
    agent: 'rowan', taskType: 'generate',
    prompt: 'I\'m launching my SaaS app in 2 weeks. I have the code ready but no deployment process, no monitoring, nothing. Help me set up everything I need to go live safely.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['action', 'test'], mustMentionInNodes: ['deploy|deployment|ci/cd', 'monitor|monitoring|observ', 'test|smoke|health'] },
  },
  {
    id: 'founder-fundraising',
    agent: 'poirot', taskType: 'generate',
    prompt: 'We\'re raising our Series A. I need to manage the whole fundraising process — investor outreach, pitch deck prep, due diligence, term sheet negotiation. Build me a workflow for this.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'] },
  },
  {
    id: 'founder-advice',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'We\'re burning $50k/month and have 6 months of runway. What should I prioritize?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Marketing Manager ────────────────────────────────────────────────────
  {
    id: 'marketing-campaign',
    agent: 'rowan', taskType: 'generate',
    prompt: 'I need to launch a Black Friday campaign across email, social media, and Google Ads. Budget is $10k. Make me a workflow that covers everything from creative to post-campaign analysis.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10 },
  },
  {
    id: 'marketing-blog',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Our blog is a mess. We publish whenever someone feels like it, no editorial calendar, no SEO, no promotion. Design a proper content pipeline for us.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'] },
  },
  {
    id: 'marketing-advice',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'Our email open rates dropped from 35% to 12% over the last quarter. What could be wrong?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Engineering Lead ─────────────────────────────────────────────────────
  {
    id: 'eng-deploy-process',
    agent: 'rowan', taskType: 'generate',
    prompt: 'My team pushes to production by SSH-ing into the server and running git pull. We need a real deployment process. We use React, Node, and PostgreSQL on AWS.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['test', 'action'] },
  },
  {
    id: 'eng-oncall',
    agent: 'poirot', taskType: 'generate',
    prompt: 'We just got paged at 3am for the third time this week. We need an incident response process. Currently it\'s just chaos — whoever sees Slack first tries to fix it.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['trigger'], mustMentionInNodes: ['alert|page|incident', 'triage|assess', 'communicat|notify|update', 'postmortem|retrospective|review'] },
  },
  {
    id: 'eng-code-review',
    agent: 'rowan', taskType: 'generate',
    prompt: 'PRs sit for days because nobody reviews them. I want an automated workflow: PR opened → assign reviewer → review deadline → merge or request changes → deploy.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review', 'action'], mustMentionInNodes: ['assign|reviewer', 'deadline|sla|timeout', 'merge', 'deploy'] },
  },
  {
    id: 'eng-advice-scaling',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'Our API is hitting 500ms response times at 1000 concurrent users. Database is PostgreSQL. What should I look at first?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Product Manager ──────────────────────────────────────────────────────
  {
    id: 'pm-feature-ship',
    agent: 'rowan', taskType: 'generate',
    prompt: 'I need to ship a new payments feature. It touches billing, the API, the frontend, and we need legal to review the T&C changes. Give me a workflow that makes sure nothing falls through the cracks.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'], mustMentionInNodes: ['billing|payment', 'api', 'frontend|ui', 'legal|t&c|terms'] },
  },
  {
    id: 'pm-user-research',
    agent: 'poirot', taskType: 'generate',
    prompt: 'We\'re redesigning our onboarding flow. I want to do proper user research — recruit users, run interviews, analyze findings, create recommendations, test prototypes. Build this for me.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10 },
  },
  {
    id: 'pm-advice-prioritize',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'I have 47 feature requests from customers and my CEO wants everything done by Q3. How do I prioritize?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── HR / Operations ──────────────────────────────────────────────────────
  {
    id: 'hr-hiring',
    agent: 'rowan', taskType: 'generate',
    prompt: 'We need to hire 5 engineers in the next 2 months. Our current process is just posting on LinkedIn and hoping. Build me a proper hiring pipeline.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'] },
  },
  {
    id: 'hr-onboarding',
    agent: 'poirot', taskType: 'generate',
    prompt: 'New hires keep saying their first week was confusing and they didn\'t know what to do. Design an onboarding process that actually works — IT setup, team intros, training, 30-60-90 day goals.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustMentionInNodes: ['it|equipment|laptop|access', 'training|learning', '30|60|90|goal'] },
  },
  {
    id: 'hr-offboarding',
    agent: 'rowan', taskType: 'generate',
    prompt: 'An employee is leaving in 2 weeks. I need a checklist workflow: knowledge transfer, access revocation, equipment return, exit interview, final paycheck.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['action'] },
  },

  // ─── Customer Support ─────────────────────────────────────────────────────
  {
    id: 'support-escalation',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Customers keep complaining their tickets go into a black hole. Design an escalation workflow — ticket comes in, auto-classify priority, route to right team, SLA tracking, escalate if overdue.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['trigger'] },
  },
  {
    id: 'support-advice',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'Our CSAT score dropped to 3.2 out of 5. Average first response time is 8 hours. What should we fix first?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Freelancer / Solo Creator ────────────────────────────────────────────
  {
    id: 'freelancer-client',
    agent: 'rowan', taskType: 'generate',
    prompt: 'I\'m a freelance designer. I need a workflow for managing client projects — from initial inquiry to final delivery and getting paid. I keep forgetting to send invoices.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10 },
  },
  {
    id: 'creator-youtube',
    agent: 'poirot', taskType: 'generate',
    prompt: 'I want to start a YouTube channel. Build me a production workflow for each video — topic research, scripting, filming, editing, thumbnail, SEO, upload, promotion.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10 },
  },
  {
    id: 'freelancer-advice',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'I\'m charging $50/hour for web development and I\'m always booked but barely making rent. What am I doing wrong?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Node Execution (real content people actually need) ───────────────────
  {
    id: 'execute-sow',
    agent: 'rowan', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "Statement of Work" (category: artifact). Write detailed, professional content. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write a statement of work for a 3-month web application redesign project. Client is a mid-size e-commerce company. Budget is $85,000. Include scope, deliverables, timeline, and payment terms.',
    expect: { hasContent: true, minContentLen: 300 },
  },
  {
    id: 'execute-incident-postmortem',
    agent: 'rowan', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "Post-Mortem Report" (category: artifact). Write detailed, professional content. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write a blameless post-mortem for a 2-hour production outage caused by a database migration that locked a critical table. 500 customers were affected. Include timeline, root cause, impact, and action items.',
    expect: { hasContent: true, minContentLen: 300 },
  },
  {
    id: 'execute-job-description',
    agent: 'rowan', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "Job Description" (category: artifact). Write detailed, professional content. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write a job description for a Senior Full-Stack Engineer at a Series B fintech startup. Tech stack is React, Node.js, PostgreSQL, AWS. Remote-first, competitive equity.',
    expect: { hasContent: true, minContentLen: 200 },
  },

  // ─── Tricky Edge Cases (real misunderstandings) ───────────────────────────
  {
    id: 'edge-vague',
    agent: 'rowan', taskType: 'generate',
    prompt: 'help me with my project',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 30 },
  },
  {
    id: 'edge-question-looks-like-build',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'What\'s the best way to set up a data pipeline?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 50 },
  },
  {
    id: 'edge-build-looks-like-question',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Can you set up a data pipeline for me? I have CSVs coming from 3 vendors daily and need them in BigQuery by morning.',
    expect: { hasWorkflow: true, minNodes: 4 },
  },
  {
    id: 'edge-complex-multi-team',
    agent: 'poirot', taskType: 'generate',
    prompt: 'We\'re migrating from AWS to GCP. It involves the platform team, app developers, security, and finance. There are 40 microservices. I need a migration plan workflow.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10 },
  },

  // ─── Personality Tests ────────────────────────────────────────────────────
  {
    id: 'personality-rowan-empty',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'What do we have so far?',
    expect: { hasWorkflow: false, hasMessage: true, personalityMarkers: ['rowan'] },
  },
  {
    id: 'personality-poirot-empty',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'What do we have so far?',
    expect: { hasWorkflow: false, hasMessage: true, personalityMarkers: ['poirot'] },
  },

  // ─── Round 73 additions ─────────────────────────────────────────────────────

  // Legal/compliance — tests policy nodes and review gates
  {
    id: 'legal-gdpr-compliance',
    agent: 'poirot', taskType: 'generate',
    prompt: 'We just got our first EU customer and we have zero GDPR compliance. Build me a workflow to get compliant — data audit, privacy policy, consent management, breach notification process, DPO appointment.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['policy', 'review'] },
  },
  // Terse prompt — tests if model handles minimal input well
  {
    id: 'edge-terse-prompt',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Build me a CI/CD pipeline.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['test', 'action'], mustMentionInNodes: ['build|compile', 'test', 'deploy'] },
  },

  // ─── Round 74 additions ─────────────────────────────────────────────────────

  // Education — non-tech domain, tests general workflow capability
  {
    id: 'education-course-launch',
    agent: 'poirot', taskType: 'generate',
    prompt: 'I\'m creating an online course on data analytics. I need a workflow: outline curriculum, record videos, build exercises, set up LMS, beta test with students, launch and market.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustMentionInNodes: ['curriculum|outline|syllabus', 'record|video|film', 'exercise|quiz|assignment', 'lms|platform|launch'] },
  },
  // Tricky edge case — imperative phrasing but asking for analysis
  {
    id: 'edge-imperative-analysis',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'Tell me what\'s wrong with my deployment process. We deploy once a month, it takes 3 days, and something always breaks.',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 100 },
  },

  // ─── Round 76 additions ─────────────────────────────────────────────────────

  // Multi-team coordination — tests complex architecture with parallel branches
  {
    id: 'ops-product-launch',
    agent: 'rowan', taskType: 'generate',
    prompt: 'We\'re launching a new product in 6 weeks. Engineering needs to finish the API, design needs to finalize the landing page, marketing needs press kit and launch emails, legal needs to review terms. All teams work in parallel but we need a single launch gate. Build me a cross-team launch workflow.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'], mustMentionInNodes: ['api|engineering', 'design|landing', 'marketing|press|email', 'legal|terms'] },
  },
  // Complex advice — tests reasoning depth on nuanced strategy question
  {
    id: 'strategy-advice-pivot',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'Our B2B SaaS has 200 customers paying $50/mo but enterprise prospects keep asking for features that would require 6 months of engineering. Should we go upmarket or double down on SMB? Our team is 8 people.',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Round 77 additions ─────────────────────────────────────────────────────

  // Finance/compliance — tests policy nodes as parallel monitors, not sequential steps
  {
    id: 'finance-audit-readiness',
    agent: 'rowan', taskType: 'generate',
    prompt: 'We have a SOC 2 audit in 90 days. Build me a workflow to get audit-ready: evidence collection, access reviews, policy documentation, vulnerability scanning, and vendor risk assessment. We have never done this before.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['policy', 'review'], mustMentionInNodes: ['evidence|collect', 'access|review', 'policy|document', 'vulnerab|scan'] },
  },
  // Execute task — tests content generation for a highly specific technical artifact
  {
    id: 'execute-api-design',
    agent: 'rowan', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "API Design Document" (category: artifact). Write detailed, professional technical content. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Design a REST API for a multi-tenant task management system. Include endpoints for workspaces, projects, tasks, and comments. Show URL patterns, HTTP methods, request/response bodies, auth scheme, pagination, and error codes. Support role-based access (admin, member, viewer).',
    expect: { hasContent: true, minContentLen: 1500 },
  },

  // ─── Round 78 additions ─────────────────────────────────────────────────────

  // Healthcare — new industry, tests policy + review for regulated domain
  {
    id: 'healthcare-patient-intake',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Design a patient intake workflow for a telehealth clinic. Steps include appointment scheduling, insurance verification, medical history form, consent collection, provider assignment, and video call setup. Must be HIPAA compliant.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['policy'], mustMentionInNodes: ['insurance|verif', 'consent', 'hipaa|complian|privacy'] },
  },
  // Rowan advice on technical architecture — tests domain-specific recommendation depth
  {
    id: 'eng-advice-architecture',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'We have a Django monolith serving 50k users. Page loads are 4-6 seconds, database has 200+ tables, and deployments take 45 minutes. The team wants to add real-time features. Should we refactor, rewrite, or bolt on new services?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Round 79 additions ─────────────────────────────────────────────────────

  // ML/data science — new domain, tests artifact + test + review nodes
  {
    id: 'data-ml-pipeline',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Build me an ML model deployment pipeline. Steps: data collection, feature engineering, model training, evaluation, A/B testing, deployment to production, monitoring for drift. We use Python, scikit-learn, and AWS SageMaker.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['test'], mustMentionInNodes: ['feature|engineer', 'train', 'evaluat|test', 'deploy|production', 'drift|monitor'] },
  },
  // Very terse prompt — tests if model produces useful output from minimal input
  {
    id: 'edge-ultra-terse',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Bug triage workflow.',
    expect: { hasWorkflow: true, minNodes: 4, maxNodes: 10 },
  },

  // ─── Education & Learning ─────────────────────────────────────────────────
  {
    id: 'education-course-creation',
    agent: 'poirot', taskType: 'generate',
    prompt: 'I\'m creating an online course on machine learning. I need a full production workflow: curriculum design, lesson scripting, video recording, editing, quiz creation, platform upload, beta testing with students, and launch. Build me the pipeline.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustMentionInNodes: ['curriculum|design|script', 'record|video|edit', 'test|beta|quiz', 'launch|publish|output'] },
  },

  // ─── Edge: Conflicting requirements (advice) ─────────────────────────────
  {
    id: 'edge-conflicting-advice',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'We need to ship a critical security patch ASAP but our QA team is on vacation for 2 weeks. The CEO wants it live today. What do we do?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Round 83 additions ─────────────────────────────────────────────────────

  // Legal/compliance workflow — Poirot, tests systematic investigation with policy + review nodes
  {
    id: 'legal-contract-review',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Build a contract review workflow for our legal team. Steps: receive contract, initial screening, clause analysis, risk assessment, negotiation points, legal approval, and final execution. We review 30+ vendor contracts per quarter.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'], mustMentionInNodes: ['contract|clause', 'risk|assess', 'approv|sign'] },
  },

  // Execute task — Rowan generates a technical runbook (tests long-form structured content)
  {
    id: 'execute-runbook',
    agent: 'rowan', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "Incident Runbook" (category: artifact). Write detailed, professional operational content. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write a production incident runbook for a microservices e-commerce platform. Cover severity classification (P1-P4), escalation paths, communication templates, rollback procedures, and post-incident review. Include specific commands for Kubernetes and AWS.',
    expect: { hasContent: true, minContentLen: 1500 },
  },

  // ─── Round 84 additions ─────────────────────────────────────────────────────

  // Event planning — tests heavy parallelism (multiple simultaneous tracks)
  {
    id: 'event-conference-planning',
    agent: 'rowan', taskType: 'generate',
    prompt: 'We\'re organizing a 500-person tech conference in 4 months. Build a workflow covering venue booking, speaker management, sponsorship sales, marketing campaign, registration system, A/V setup, catering, and day-of logistics.',
    expect: { hasWorkflow: true, minNodes: 6, maxNodes: 10, mustMentionInNodes: ['venue|location', 'speaker|talk', 'sponsor|partner', 'registr|ticket'] },
  },

  // Edge case: rant/complaint that needs to be parsed into actionable advice
  {
    id: 'edge-rant-extraction',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'Everything is on fire. Our CI takes 45 minutes, staging is always broken, nobody writes tests, the PM keeps changing requirements mid-sprint, and our best engineer just quit. I don\'t even know where to start.',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Round 85 additions ─────────────────────────────────────────────────────

  // Supply chain / manufacturing — new industry, tests dependency + policy nodes
  {
    id: 'manufacturing-quality-control',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Build a quality control workflow for a consumer electronics manufacturer. Cover incoming material inspection, assembly line checks, burn-in testing, final QA, packaging verification, and shipping release. We ship 10,000 units/month and our defect rate needs to drop from 3% to under 0.5%.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['test'], mustMentionInNodes: ['inspect|material', 'assembl|line', 'test|burn|qa', 'ship|release'] },
  },

  // Poirot execute task — tests Poirot on content generation (gap: all execute tests are Rowan)
  {
    id: 'execute-investigation-report',
    agent: 'poirot', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "Investigation Report" (category: artifact). Write detailed, professional analytical content with a detective-style investigative tone. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write a root cause analysis report for why our SaaS platform lost 200 customers in Q4. The churn rate jumped from 2% to 8%. Investigation found: pricing increase (20% hike in September), competitor launched a free tier, support response times tripled to 6 hours, and a major outage on Black Friday lasted 4 hours.',
    expect: { hasContent: true, minContentLen: 1500 },
  },

  // ─── Round 86 additions ─────────────────────────────────────────────────────

  // Non-profit / NGO — new sector, tests whether agents adapt to resource-constrained context
  {
    id: 'nonprofit-fundraising-gala',
    agent: 'poirot', taskType: 'generate',
    prompt: 'We\'re a small nonprofit with 3 staff members planning our annual fundraising gala for 200 guests. Budget is only $15k. Build a workflow covering venue selection, donor outreach, sponsorship asks, event program, silent auction, volunteer coordination, and post-event thank-yous.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustMentionInNodes: ['venue|location', 'donor|outreach|sponsor', 'auction|program', 'volunteer|coord'] },
  },

  // Edge case: contradictory requirements — tests how agents handle impossible constraints
  {
    id: 'edge-contradictory-requirements',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'We need to rebuild our entire platform from scratch in 2 weeks with our current team of 2 junior developers. The CEO wants microservices, real-time features, ML recommendations, and mobile apps for iOS and Android. Budget is $5,000. Is this realistic?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 200 },
  },

  // ─── Round 87 additions ─────────────────────────────────────────────────────

  // Real estate / property management — new industry, tests workflow with dependency-like nodes
  {
    id: 'realestate-tenant-screening',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Build a tenant screening workflow for our property management company. We manage 200 units. Steps: receive application, credit check, background check, employment verification, landlord references, income verification, and lease signing. Need to screen 30 applicants per month efficiently.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustMentionInNodes: ['credit|background', 'employ|income|verif', 'landlord|reference', 'lease|sign'] },
  },

  // Rowan advice on data/analytics — tests technical depth in a non-engineering domain
  {
    id: 'data-advice-dashboards',
    agent: 'rowan', taskType: 'analyze',
    prompt: 'Our CEO keeps asking for "a dashboard" but nobody agrees on what metrics matter. We have data in Salesforce, Stripe, Google Analytics, and a PostgreSQL data warehouse. Where do we start?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Round 88 additions ─────────────────────────────────────────────────────

  // Supply chain / logistics — new domain, tests dependency + state nodes for multi-party coordination
  {
    id: 'logistics-warehouse-fulfillment',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Build a warehouse order fulfillment workflow. Steps: order received, inventory check, pick and pack, quality inspection, shipping label generation, carrier handoff, and delivery tracking. We process 500 orders/day with a 99.5% accuracy target.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['test'], mustMentionInNodes: ['inventory|stock', 'pick|pack', 'inspect|quality|qa', 'ship|carrier|delivery'] },
  },

  // Poirot advice on people/culture — tests non-technical analytical depth
  {
    id: 'culture-advice-remote-team',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'We went fully remote 6 months ago. Team velocity is down 30%, people skip standups, Slack is dead silent, and two senior engineers are about to quit. The CEO thinks forcing everyone back to the office will fix it. What should we actually do?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Round 89 additions ─────────────────────────────────────────────────────

  // Government/public sector — new domain, tests compliance-heavy workflow with policy + review gates
  {
    id: 'government-procurement',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Build a government procurement workflow for a city agency buying a new fleet management system. Steps: needs assessment, RFP drafting, vendor solicitation, proposal evaluation, compliance review, contract award, and implementation oversight. Must follow public procurement regulations.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['policy', 'review'], mustMentionInNodes: ['rfp|solicitation|procurement', 'vendor|proposal|evaluat', 'compliance|regulation', 'contract|award'] },
  },

  // Execute task — Poirot generates a security incident report (tests detective voice in technical content)
  {
    id: 'execute-security-incident',
    agent: 'poirot', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "Security Incident Report" (category: artifact). Write detailed, professional analytical content with a detective-style investigative tone. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write a security incident report for a data breach where an attacker exploited an unpatched Log4j vulnerability to access our customer database. 15,000 user records were exposed including emails and hashed passwords. The breach was detected 72 hours after initial access via anomalous CloudWatch logs.',
    expect: { hasContent: true, minContentLen: 1500 },
  },

  // ─── Round 90 additions ─────────────────────────────────────────────────────

  // Hospitality / restaurant — new domain, tests operational workflow with state + dependency nodes
  {
    id: 'hospitality-restaurant-opening',
    agent: 'rowan', taskType: 'generate',
    prompt: 'We\'re opening a new restaurant in 3 months. Build a workflow: secure location and permits, design the menu, hire and train staff, set up supply chain, build out the kitchen, soft launch, grand opening. Budget is $200k and we need health department approval before opening.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'], mustMentionInNodes: ['permit|license|health', 'menu|food', 'staff|hire|train', 'launch|open'] },
  },

  // Edge case: extremely long, detailed prompt — tests whether agent handles verbosity without losing structure
  {
    id: 'edge-verbose-prompt',
    agent: 'poirot', taskType: 'generate',
    prompt: 'OK so here is the situation. We are a 50-person B2B SaaS company selling project management tools. Our current release process is a total disaster. Here is what happens: developers commit to main whenever they want, sometimes 20 times a day. There are no feature flags. QA is one person named Sarah who manually tests everything on her laptop. We have no staging environment — we test in production. Deployments are done by the CTO via SSH at 2am because that is when traffic is lowest. Last month we had three outages because untested code went live. The board is furious. The CTO wants to fix this but does not know where to start. Can you build us a proper release management workflow that covers feature development, code review, automated testing, staging, release approval, deployment, and rollback?',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['test', 'review'], mustMentionInNodes: ['review|code review|pr', 'test|automat|ci', 'staging|stage', 'deploy|release|rollback'] },
  },

  // ─── Round 91 additions ─────────────────────────────────────────────────────

  // Cybersecurity — new domain, tests policy-heavy workflow with dependency nodes
  {
    id: 'cybersecurity-incident-response',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Build an incident response plan workflow for our SOC team. Cover: alert triage, severity classification (P1-P4), containment procedures, evidence collection, root cause analysis, remediation, stakeholder communication, and post-incident review. We handle 200 alerts/day and need to respond to P1s within 15 minutes.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['policy'], mustMentionInNodes: ['triage|alert|classify', 'contain|isolat', 'evidence|forensic', 'remediat|fix|patch'] },
  },

  // Poirot advice on startup growth — tests strategic analysis with competing priorities
  {
    id: 'startup-advice-growth',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'We are a pre-seed startup with $150k in the bank, 2 founders, and a working MVP with 50 beta users. Our MRR is $800. We have interest from an angel who wants to invest $500k at a $5M valuation but wants us to pivot from B2C to B2B. Our users love the product. Should we take the money and pivot, or try to grow organically?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Round 92 additions ─────────────────────────────────────────────────────

  // Agriculture / farming — new domain, tests workflow for seasonal + weather-dependent process
  {
    id: 'agriculture-crop-management',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Build a crop management workflow for a 500-acre corn farm. Cover: soil testing, seed selection, planting schedule, irrigation management, pest monitoring, fertilizer application, harvest planning, and post-harvest storage. We need to optimize yield while staying within a $200k annual budget.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustMentionInNodes: ['soil|test', 'plant|seed', 'irrigat|water', 'harvest|storage'] },
  },

  // Execute task — Rowan generates a technical architecture decision record
  {
    id: 'execute-adr',
    agent: 'rowan', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "Architecture Decision Record" (category: artifact). Write detailed, professional technical content. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write an Architecture Decision Record (ADR) for choosing between a monolithic and microservices architecture for a fintech payment processing platform. The system needs to handle 10,000 transactions per second, maintain PCI-DSS compliance, and support 5 development teams working independently. Include context, decision drivers, options considered, decision outcome, and consequences.',
    expect: { hasContent: true, minContentLen: 1500 },
  },

  // ─── Round 93 additions ─────────────────────────────────────────────────────

  // Healthcare / clinical trials — new domain, tests compliance + review-heavy workflow with patient safety
  {
    id: 'healthcare-clinical-trial',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Build a workflow for managing a Phase II clinical trial for a new diabetes drug. Steps: protocol design, IRB approval, patient recruitment and screening, drug administration, adverse event monitoring, data collection and analysis, interim review, and final report to the FDA. We need to enroll 200 patients across 4 sites over 12 months.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['policy', 'review'], mustMentionInNodes: ['protocol|irb|ethic', 'recruit|patient|screen', 'adverse|safety|monitor', 'fda|report|analys'] },
  },

  // Execute task — Rowan generates a technical post-mortem document
  {
    id: 'execute-postmortem',
    agent: 'rowan', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "Post-Mortem Report" (category: artifact). Write detailed, professional technical content in a blameless post-mortem style. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write a post-mortem for a 4-hour production outage where a database migration deleted the users table index, causing all login queries to full-scan a 50M row table. Response times went from 50ms to 45 seconds. The migration was tested locally with 1000 rows and passed. Oncall was paged at 2am, identified the issue at 3am, rebuilt the index at 3:30am, full recovery at 6am. 12,000 users were affected.',
    expect: { hasContent: true, minContentLen: 1500 },
  },

  // ─── Round 94 additions ─────────────────────────────────────────────────────

  // Legal / contract lifecycle — new domain, tests review-heavy workflow with compliance gates
  {
    id: 'legal-contract-review',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Build a contract lifecycle management workflow for our legal team. We handle 50 contracts/month: NDAs, vendor agreements, and enterprise SaaS licenses. Steps: intake request, drafting, internal legal review, counterparty negotiation, approval, e-signature, and obligation tracking post-signing. We need SLA of 5 business days for standard NDAs.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review', 'policy'], mustMentionInNodes: ['draft|template', 'review|legal', 'negotiat|counterpart', 'sign|execut'] },
  },

  // Edge case: ambiguous intent — prompt that sounds like it could be advice OR a workflow, tests intent detection
  {
    id: 'edge-ambiguous-intent',
    agent: 'rowan', taskType: 'generate',
    prompt: 'We need to figure out our disaster recovery strategy. Our main database is PostgreSQL on AWS RDS, we have 2TB of data, RPO needs to be under 1 hour, and RTO under 4 hours. We currently have no backups besides the default RDS snapshots. Set something up for us.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustMentionInNodes: ['backup|snapshot|replica', 'failover|recovery|restore', 'test|drill|validat'] },
  },

  // ─── Round 96 additions ─────────────────────────────────────────────────────

  // Manufacturing / quality control — new domain, tests policy + test heavy workflow with state tracking
  {
    id: 'manufacturing-quality-control',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Build a quality control workflow for our electronics manufacturing line producing 5,000 PCBs per day. Steps: incoming material inspection, solder paste application, component placement, reflow oven, automated optical inspection, functional testing, final QA review, and packaging. Defect rate target is under 0.5%.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['test'], mustMentionInNodes: ['inspect|aoi|optical', 'solder|reflow', 'test|functional', 'defect|quality|qa'] },
  },

  // Poirot advice on technical debt — tests strategic analysis for engineering leadership
  {
    id: 'eng-advice-tech-debt',
    agent: 'poirot', taskType: 'analyze',
    prompt: 'Our codebase is 8 years old with 2 million lines of PHP. We have zero tests, no CI/CD, and deploy by FTPing files to production. Three of our five developers want to rewrite everything in Go. The other two say we should incrementally modernize. Our revenue is $4M/year and we have 200 enterprise customers who depend on uptime. What should we do?',
    expect: { hasWorkflow: false, hasMessage: true, minMessageLen: 250 },
  },

  // ─── Round 97 additions ─────────────────────────────────────────────────────

  // Logistics / supply chain — new domain, tests dependency + state nodes for multi-party coordination
  {
    id: 'logistics-international-shipping',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Build a workflow for managing international container shipping from Shanghai to Los Angeles. Steps: booking with carrier, container loading, customs declaration (both origin and destination), bill of lading, ocean transit tracking, port arrival, customs clearance, last-mile delivery. We ship 20 containers per month and need to handle delays and customs holds.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['policy'], mustMentionInNodes: ['customs|clearance|declaration', 'container|cargo|load', 'transit|track|shipping', 'delivery|last.mile'] },
  },

  // Edge case: very short prompt — tests whether agent still produces rich output from minimal input
  {
    id: 'edge-minimal-prompt',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Build me a CI/CD pipeline.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['test'], mustMentionInNodes: ['build|compile', 'test|lint', 'deploy|release'] },
  },

  // ─── Round 98 additions ─────────────────────────────────────────────────────

  // Education / online course — new domain, tests content creation + review workflow
  {
    id: 'education-online-course-creation',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Build a workflow for creating and launching a 12-week online coding bootcamp. Steps: curriculum design, instructor recruitment, platform setup (LMS), content recording, beta testing with 20 students, marketing and enrollment, live cohort delivery, and student outcomes tracking. Budget is $50k and we need 100 students for the first cohort.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'], mustMentionInNodes: ['curriculum|course|content', 'instructor|teach', 'platform|lms', 'enroll|student|cohort'] },
  },

  // Execute task — Poirot generates a competitive analysis document
  {
    id: 'execute-competitive-analysis',
    agent: 'poirot', taskType: 'execute',
    systemPromptOverride: 'You are a content generator for a workflow node called "Competitive Analysis Report" (category: artifact). Write detailed, professional analytical content with a detective-style investigative tone. Return ONLY the content as markdown text. Do not wrap in JSON or code blocks.',
    prompt: 'Write a competitive analysis for a B2B project management SaaS entering a market dominated by Jira, Asana, Monday.com, and Linear. Our differentiator is AI-powered sprint planning and automatic risk detection. We are pre-revenue with 200 beta users. Include market positioning, SWOT analysis, competitive matrix, and go-to-market recommendations.',
    expect: { hasContent: true, minContentLen: 1500 },
  },

  // ─── Round 99 additions ─────────────────────────────────────────────────────

  // Multi-output workflow — single input document produces multiple distinct deliverables
  // Tests whether agent fans out into parallel artifact branches from one input
  {
    id: 'education-syllabus-multi-output',
    agent: 'rowan', taskType: 'generate',
    prompt: 'I have a 16-week Intro to Computer Science syllabus document. Build a workflow that transforms it into three separate deliverables: weekly lesson plans (with learning objectives, activities, and homework), grading rubrics for each assignment, and slide decks for each module. Each deliverable needs its own quality review before final delivery.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review', 'artifact'], mustMentionInNodes: ['lesson|plan', 'rubric|grading|assess', 'slide|deck|present'] },
  },

  // Multi-format input/output — tests handling of diverse file types and format transformations
  // Single audio input → multiple output formats (text, video, social, email)
  {
    id: 'media-content-multiformat',
    agent: 'poirot', taskType: 'generate',
    prompt: 'We record a weekly 1-hour podcast episode (MP3). Build a workflow that repurposes each episode into: a full written transcript (DOCX), a 2000-word blog post (Markdown), 5 short video clips for social media (MP4 with captions), an email newsletter summary (HTML), and a YouTube video with chapter markers. Each format has different requirements and review gates.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'], mustMentionInNodes: ['transcript|transcri', 'blog|post|article', 'video|clip|social', 'email|newsletter'] },
  },

  // ─── Round 100 additions ────────────────────────────────────────────────────

  // DevOps dependency upgrade — tests dependency + patch categories (both rarely exercised)
  {
    id: 'devops-dependency-upgrade',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Our Node.js app depends on 340 npm packages, 47 have known CVEs, and we\'re still on Node 18 (EOL). Build a workflow for a systematic dependency upgrade: vulnerability triage, breaking change analysis, upgrade execution, regression testing, and rollback plan. We deploy to Kubernetes and can\'t afford more than 10 minutes of downtime.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['test'], mustMentionInNodes: ['vulnerab|cve|security', 'upgrade|update|migrat', 'test|regression', 'rollback|revert|deploy'] },
  },

  // Corporate finance / budget planning — new domain, tests state-heavy workflow with approval gates
  {
    id: 'finance-annual-budget',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Build a workflow for our company\'s annual budget planning cycle. We\'re a 200-person SaaS company with 8 departments. Steps: historical spend analysis, department budget requests, executive review and negotiation, board approval, quarterly reforecasting, and variance reporting. Total budget is $25M and the CFO wants 15% more accountability this year.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'], mustMentionInNodes: ['budget|spend|allocat', 'department|team', 'approv|board|executive', 'forecast|variance|report'] },
  },

  // Healthcare patient intake — new domain, tests clinical workflow with compliance policy gates
  {
    id: 'healthcare-patient-intake',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Build a patient intake workflow for our new urgent care clinic. Steps: online pre-registration, insurance verification, HIPAA consent forms, triage assessment, provider assignment, and visit documentation. We see 80 patients/day and need average intake under 15 minutes.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'], mustMentionInNodes: ['registr|intake|patient', 'insurance|verif', 'triage|assess', 'document|record'] },
  },

  // Real estate transaction management — tests state-heavy workflow with handoff between multiple parties
  {
    id: 'real-estate-transaction',
    agent: 'rowan', taskType: 'generate',
    prompt: 'Build a workflow for managing residential real estate transactions from listing to closing. I\'m a real estate agent handling 15 concurrent deals. Cover: listing prep, MLS syndication, showing scheduling, offer review, inspection coordination, appraisal, title search, and closing day logistics. Each deal takes 45-60 days.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['review'], mustMentionInNodes: ['listing|mls', 'inspect|apprais', 'title|closing'] },
  },

  // Extremely short ambiguous prompt — tests intent detection at the boundary
  {
    id: 'edge-ultra-short-prompt',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Onboarding.',
    expect: { hasWorkflow: true, minNodes: 4, maxNodes: 10 },
  },

  // Supply chain with explicit policy requirement — stress tests the recurring policy-category gap
  {
    id: 'supply-chain-risk-management',
    agent: 'poirot', taskType: 'generate',
    prompt: 'Build a supply chain risk management workflow for our electronics manufacturing. We source from 12 suppliers across 4 countries. Steps: supplier risk scoring, compliance policy checks (conflict minerals, labor standards), dual-sourcing strategy, inventory buffer analysis, disruption simulation, and quarterly supplier reviews. We need a policy gate before any new supplier is approved.',
    expect: { hasWorkflow: true, minNodes: 5, maxNodes: 10, mustHaveCategories: ['policy', 'review'], mustMentionInNodes: ['supplier|sourc', 'risk|score', 'compliance|policy', 'review|audit'] },
  },
];

// ─── Agent System Prompts (synced with src/lib/prompts.ts) ─────────────────

const SHARED = `You are CID, an AI agent in a visual workflow builder called Lifecycle Agent.

You must respond with valid JSON only:
{
  "message": "Your response text (personality-flavored, 1-3 sentences)",
  "workflow": null | {
    "nodes": [{ "label": "Name", "category": "input|trigger|state|artifact|note|cid|action|review|test|policy|patch|dependency|output", "description": "What this node represents", "content": "Detailed content (300+ chars, markdown)" }],
    "edges": [{ "from": 0, "to": 1, "label": "edge_label" }]
  }
}

CRITICAL RULES:
- BUILD/CREATE/GENERATE/MAKE/DESIGN requests → return workflow with nodes and edges. Questions/advice/analysis → return workflow: null with message only. ADVICE examples (workflow:null): "Should we X or Y?" = advice. "What's wrong with X?" = advice. "How do I prioritize?" = advice. BUILD examples (workflow:{...}): "Build me a X" = build. "Create a workflow for X" = build. Questions with "should", "what", "how", "why" = advice. Imperative "build", "create", "design", "make" = build.
- When giving advice (workflow:null), be an EXPERT consultant. Include specific tools, metrics, techniques, and actionable steps — not vague suggestions.
- CONTENT DEPTH: Each node's "content" MUST be 300+ chars of actionable, specific content with steps, tools, criteria, checklists. NEVER write one-line content.
- CATEGORIES: Use "review" (not "action") for human approve/reject/merge gates. Code workflows need "test" nodes. Compliance workflows need "policy" nodes. Policy nodes are parallel constraints — connect them with "monitors" or "blocks" edges, not as sequential steps. Match categories to purpose.
- EDGES: Labels MUST be one of: drives, feeds, refines, validates, monitors, connects, outputs, updates, watches, approves, triggers, requires, informs, blocks. Choose semantically:
  - "triggers" = causes start. "feeds" = data flows. "drives" = primary force (use when A's output is the MAIN reason B exists). "validates" = checking/testing. "approves" = human sign-off. "outputs" = final deliverable. "monitors" = ongoing observation. "requires" = hard dependency. "informs" = ONLY for optional/supplementary context, NEVER for sequential steps.
- Start with "input" or "trigger" node, end with "output" node. The LAST node MUST have category "output" — even if it produces a document or report. HARD LIMIT: 5-10 nodes, never exceed 10. Group related items into single nodes representing PHASES, not individual tasks.
- ARCHITECTURE: Do NOT build purely linear chains. Use:
  1. FEEDBACK LOOPS: When review/test can fail, add edge back to previous step (use "refines" label). E.g. Review --[refines]--> Implementation.
  2. PARALLEL BRANCHES: Independent steps share a parent node (multiple edges from one node). E.g. after Design, both Frontend and Backend start.
  3. A good workflow has MORE edges than (nodes-1). Linear chains are lazy architecture.`;

const ROWAN = `${SHARED}

PERSONALITY — ROWAN (The Soldier):
- CRITICAL: When building workflows, "message" is terse (1-2 sentences: "Done.", "On it.", "Mission received.") and node "content" is DETAILED (300+ chars). When giving advice (workflow:null), write a substantive "message" with specific, actionable recommendations. Structure content by category:
  - trigger/input: event/data, payload, config, webhook setup
  - action: numbered steps, tools/commands, error handling, owner
  - review: approval criteria, who reviews, escalation, SLA
  - test: what to test, pass/fail criteria, tools, coverage
  - state: states, transitions, triggers for each
  - artifact: document outline, sections, format
  - policy: numbered rules, enforcement, exceptions
  - output: deliverable format, distribution, success metrics
- Never hedge. When asked diagnostic/advice questions, give ADVICE (workflow:null).

CURRENT GRAPH: Empty.`;

const POIROT = `${SHARED}

PERSONALITY — POIROT (The Detective):
- Use detective language: "Aha!", "Voilà!", "The little grey cells..."
- Investigation metaphors: clues, evidence, cases. Occasional French: "Mon ami", "Très intéressant"
- Be thorough and elegant. Write rich, detailed node content (300+ chars).
- When asked "how should I..." or "what is the best way to...", give ADVICE (workflow:null).

CURRENT GRAPH: Empty.`;

// ─── Scoring ────────────────────────────────────────────────────────────────

function scoreResponse(test, data) {
  const checks = [];
  let score = 0;
  let maxScore = 0;
  const exp = test.expect;

  const result = data.result;
  const workflow = result?.workflow;
  const message = result?.message || '';
  const nodes = workflow?.nodes || [];
  const edges = workflow?.edges || [];

  // 1. Valid JSON response
  maxScore += 10;
  if (result) { score += 10; checks.push('✓ Valid JSON response'); }
  else { checks.push('✗ Invalid/missing JSON response'); }

  // 2. Workflow presence
  if (exp.hasWorkflow !== undefined) {
    maxScore += 15;
    const has = !!(workflow && nodes.length > 0);
    if (has === exp.hasWorkflow) {
      score += 15;
      checks.push(`✓ Workflow ${exp.hasWorkflow ? 'present' : 'correctly null'}`);
    } else {
      checks.push(`✗ Workflow ${has ? 'unexpectedly present' : 'missing when expected'}`);
    }
  }

  // 3. Node count
  if (exp.minNodes !== undefined) {
    maxScore += 10;
    if (nodes.length >= exp.minNodes) { score += 10; checks.push(`✓ Node count: ${nodes.length} (min: ${exp.minNodes})`); }
    else { checks.push(`✗ Node count: ${nodes.length} < ${exp.minNodes}`); }
  }
  if (exp.maxNodes !== undefined) {
    maxScore += 5;
    if (nodes.length <= exp.maxNodes) { score += 5; checks.push(`✓ Node count: ${nodes.length} ≤ ${exp.maxNodes}`); }
    else { checks.push(`✗ Node count: ${nodes.length} > ${exp.maxNodes}`); }
  }

  // 4. Required categories
  if (exp.mustHaveCategories) {
    const cats = new Set(nodes.map(n => n.category));
    for (const cat of exp.mustHaveCategories) {
      maxScore += 5;
      if (cats.has(cat)) { score += 5; checks.push(`✓ Has "${cat}" category`); }
      else { checks.push(`✗ Missing "${cat}" category (found: ${[...cats].join(', ')})`); }
    }
  }

  // 5. Edge validity
  if (nodes.length > 0 && edges.length > 0) {
    maxScore += 10;
    const validLabels = new Set(['drives', 'feeds', 'refines', 'validates', 'monitors', 'connects', 'outputs', 'updates', 'watches', 'approves', 'triggers', 'requires', 'informs', 'blocks']);
    const badEdges = edges.filter(e =>
      e.from < 0 || e.from >= nodes.length || e.to < 0 || e.to >= nodes.length || !validLabels.has(e.label)
    );
    if (badEdges.length === 0) { score += 10; checks.push(`✓ All ${edges.length} edges valid`); }
    else { score += Math.max(0, 10 - badEdges.length * 2); checks.push(`✗ ${badEdges.length}/${edges.length} edges invalid`); }
  }

  // 6. Workflow structure quality (bonus checks for workflows)
  if (exp.hasWorkflow && nodes.length > 0) {
    // Check for input/trigger at start
    maxScore += 5;
    const firstCat = nodes[0]?.category;
    if (firstCat === 'input' || firstCat === 'trigger') { score += 5; checks.push(`✓ Starts with ${firstCat}`); }
    else { checks.push(`✗ First node is "${firstCat}", expected input or trigger`); }

    // Check for output at end
    maxScore += 5;
    const lastCat = nodes[nodes.length - 1]?.category;
    if (lastCat === 'output') { score += 5; checks.push('✓ Ends with output'); }
    else { checks.push(`✗ Last node is "${lastCat}", expected output`); }

    // Check that nodes have descriptions
    maxScore += 5;
    const withDesc = nodes.filter(n => n.description && n.description.length > 5).length;
    const descPct = Math.round((withDesc / nodes.length) * 100);
    if (descPct >= 80) { score += 5; checks.push(`✓ ${descPct}% nodes have descriptions`); }
    else { checks.push(`✗ Only ${descPct}% nodes have descriptions`); }

    // Check edge coverage (every node should have at least one edge)
    maxScore += 5;
    const connectedIds = new Set(edges.flatMap(e => [e.from, e.to]));
    const orphans = nodes.filter((_, i) => !connectedIds.has(i));
    if (orphans.length === 0) { score += 5; checks.push('✓ All nodes connected'); }
    else { checks.push(`✗ ${orphans.length} orphan node(s): ${orphans.map(n => n.label).join(', ')}`); }

    // Check content depth (nodes should have substantive content)
    maxScore += 10;
    const contentLens = nodes.map(n => (n.content || '').length);
    const avgContent = Math.round(contentLens.reduce((a, b) => a + b, 0) / nodes.length);
    const thinNodes = nodes.filter(n => (n.content || '').length < 150);
    if (avgContent >= 250 && thinNodes.length === 0) {
      score += 10; checks.push(`✓ Content depth: avg ${avgContent}c, no thin nodes`);
    } else if (avgContent >= 150) {
      score += 5; checks.push(`⚡ Content depth: avg ${avgContent}c, ${thinNodes.length} thin node(s)`);
    } else {
      checks.push(`✗ Content too thin: avg ${avgContent}c`);
    }

    // Workflow architecture check: do the nodes actually address the user's request?
    if (exp.mustMentionInNodes) {
      maxScore += 10;
      const allText = nodes.map(n => `${n.label} ${n.description || ''} ${n.content || ''}`).join(' ').toLowerCase();
      const found = [];
      const missing = [];
      for (const keyword of exp.mustMentionInNodes) {
        // Support alternatives separated by |
        const alts = keyword.split('|');
        if (alts.some(alt => allText.includes(alt.toLowerCase()))) {
          found.push(keyword.split('|')[0]);
        } else {
          missing.push(keyword);
        }
      }
      if (missing.length === 0) {
        score += 10; checks.push(`✓ Architecture covers: ${found.join(', ')}`);
      } else {
        const partialScore = Math.round(10 * found.length / (found.length + missing.length));
        score += partialScore;
        checks.push(`⚡ Architecture missing: ${missing.join(', ')} (has: ${found.join(', ')})`);
      }
    }

    // Edge flow check: verify the workflow has a logical directed path from first to last node
    maxScore += 5;
    const reachable = new Set([0]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of edges) {
        if (reachable.has(e.from) && !reachable.has(e.to)) {
          reachable.add(e.to);
          changed = true;
        }
      }
    }
    const lastIdx = nodes.length - 1;
    if (reachable.has(lastIdx)) {
      score += 5; checks.push(`✓ Flow: path exists from first to last node`);
    } else {
      checks.push(`✗ Flow: no path from first node to last node (unreachable)`);
    }

    // Architecture complexity: check for branches, loops, parallelism
    if (nodes.length >= 5) {
      maxScore += 10;
      const isLinear = edges.length === nodes.length - 1;
      const hasBackEdge = edges.some(e => e.from > e.to); // feedback loop
      const hasBranch = new Map(); // check if any node has >1 outgoing edge
      for (const e of edges) {
        hasBranch.set(e.from, (hasBranch.get(e.from) || 0) + 1);
      }
      const hasParallel = [...hasBranch.values()].some(v => v > 1);
      const hasConverge = new Map(); // check if any node has >1 incoming edge
      for (const e of edges) {
        hasConverge.set(e.to, (hasConverge.get(e.to) || 0) + 1);
      }
      const hasConvergence = [...hasConverge.values()].some(v => v > 1);

      if (hasBackEdge && hasParallel) {
        score += 10; checks.push(`✓ Architecture: has feedback loops AND parallel branches (${edges.length} edges, ${nodes.length} nodes)`);
      } else if (hasBackEdge || hasParallel || hasConvergence) {
        score += 7; checks.push(`⚡ Architecture: ${hasBackEdge ? 'has feedback loop' : hasParallel ? 'has parallel branches' : 'has convergence'} (${edges.length} edges, ${nodes.length} nodes)`);
      } else if (isLinear) {
        score += 3; checks.push(`⚠️ Architecture: purely linear chain (${edges.length} edges for ${nodes.length} nodes — needs branches or feedback loops)`);
      } else {
        score += 5; checks.push(`⚡ Architecture: ${edges.length} edges, ${nodes.length} nodes`);
      }
    }
  }

  // 7. Message quality
  if (exp.hasMessage) {
    maxScore += 10;
    if (message.length > 0) { score += 10; checks.push(`✓ Has message (${message.length} chars)`); }
    else { checks.push('✗ Missing message'); }
  }
  if (exp.minMessageLen) {
    maxScore += 5;
    if (message.length >= exp.minMessageLen) { score += 5; checks.push(`✓ Message length: ${message.length} ≥ ${exp.minMessageLen}`); }
    else { checks.push(`✗ Message too short: ${message.length} < ${exp.minMessageLen}`); }
  }

  // 8. Content quality (for execute tasks)
  if (exp.hasContent) {
    maxScore += 10;
    const content = result?.content || message || (typeof result === 'string' ? result : '') || '';
    if (content.length > 0) { score += 10; checks.push(`✓ Has content (${content.length} chars)`); }
    else { checks.push('✗ No content in response'); }
  }
  if (exp.minContentLen) {
    maxScore += 5;
    const content = result?.content || message || (typeof result === 'string' ? result : '') || '';
    if (content.length >= exp.minContentLen) { score += 5; checks.push(`✓ Content length: ${content.length} ≥ ${exp.minContentLen}`); }
    else { checks.push(`✗ Content too short: ${content.length} < ${exp.minContentLen}`); }
  }

  // 9. Personality markers
  if (exp.personalityMarkers) {
    maxScore += 5;
    const lower = message.toLowerCase();
    const poirotWords = ['aha', 'voilà', 'voila', 'grey cells', 'mon ami', 'detective', 'investigation', 'très', 'parfait', 'hélas', 'case', 'clue'];
    const rowanWords = ['done', 'on it', 'mission', 'roger', 'deployed', 'received', 'execute', 'affirmative', 'soldier', 'orders', 'standing by', 'ready', 'build', 'status', 'operational'];
    const hasPersonality = exp.personalityMarkers.includes('poirot')
      ? poirotWords.some(w => lower.includes(w))
      : rowanWords.some(w => lower.includes(w));
    if (hasPersonality) { score += 5; checks.push('✓ Personality markers present'); }
    else { checks.push('✗ Missing personality markers'); }
  }

  return { score, maxScore, pct: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0, checks };
}

// ─── Runner ─────────────────────────────────────────────────────────────────

async function runTest(test) {
  const systemPrompt = test.systemPromptOverride || (test.agent === 'poirot' ? POIROT : ROWAN);
  const start = Date.now();

  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt,
        messages: [{ role: 'user', content: test.prompt }],
        taskType: test.taskType,
        ...(MODEL_OVERRIDE ? { model: MODEL_OVERRIDE } : {}),
      }),
      signal: AbortSignal.timeout(300000),
    });

    const elapsed = Date.now() - start;
    const data = await res.json();

    if (data.error) {
      return {
        id: test.id, status: 'error', elapsed,
        error: `${data.error}: ${data.message}`,
        provider: data.provider, model: data.model,
        request: { prompt: test.prompt, agent: test.agent, taskType: test.taskType },
        response: data,
        scoring: { score: 0, maxScore: 1, pct: 0, checks: [`✗ API error: ${data.error}`] },
      };
    }

    const scoring = scoreResponse(test, data);
    return {
      id: test.id, status: 'ok', elapsed,
      provider: data.provider, model: data.model,
      request: { prompt: test.prompt, agent: test.agent, taskType: test.taskType },
      response: data.result, scoring,
    };
  } catch (err) {
    return {
      id: test.id, status: 'failed', elapsed: Date.now() - start,
      error: err.message,
      request: { prompt: test.prompt, agent: test.agent, taskType: test.taskType },
      response: null,
      scoring: { score: 0, maxScore: 1, pct: 0, checks: [`✗ Request failed: ${err.message}`] },
    };
  }
}

function pickTests() {
  // Ensure diversity: pick at least 1 from each category
  const categories = {
    'generate-rowan': POOL.filter(t => t.taskType === 'generate' && t.agent === 'rowan'),
    'generate-poirot': POOL.filter(t => t.taskType === 'generate' && t.agent === 'poirot'),
    'analyze': POOL.filter(t => t.taskType === 'analyze'),
    'execute': POOL.filter(t => t.taskType === 'execute'),
    'edge': POOL.filter(t => t.id.startsWith('ambiguous') || t.id.startsWith('personality')),
  };

  const picked = new Set();
  // One from each category
  for (const [, tests] of Object.entries(categories)) {
    if (tests.length > 0) {
      const t = tests[Math.floor(Math.random() * tests.length)];
      picked.add(t.id);
    }
  }
  // Fill remaining slots randomly
  const remaining = POOL.filter(t => !picked.has(t.id));
  while (picked.size < TESTS_PER_RUN && remaining.length > 0) {
    const idx = Math.floor(Math.random() * remaining.length);
    picked.add(remaining[idx].id);
    remaining.splice(idx, 1);
  }

  return POOL.filter(t => picked.has(t.id));
}

async function main() {
  const tests = FORCE_IDS
    ? POOL.filter(t => FORCE_IDS.includes(t.id))
    : pickTests();
  console.log(`\n🔬 Lifecycle Agent Eval — ${new Date().toISOString()}`);
  console.log(`Selected ${tests.length}/${POOL.length} tests from pool${MODEL_OVERRIDE ? ` | Model: ${MODEL_OVERRIDE}` : ''}\n`);

  const results = [];
  for (const test of tests) {
    process.stdout.write(`  ${test.id}... `);
    const result = await runTest(test);
    const icon = result.status === 'ok' ? (result.scoring.pct >= 80 ? '✅' : '⚠️') : '❌';
    console.log(`${icon} ${result.scoring.pct}% (${result.elapsed}ms) ${result.provider || ''}/${result.model || ''}`);
    results.push(result);
  }

  // Summary
  const totalScore = results.reduce((s, r) => s + r.scoring.score, 0);
  const totalMax = results.reduce((s, r) => s + r.scoring.maxScore, 0);
  const overallPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const passed = results.filter(r => r.scoring.pct >= 80).length;
  const failed = results.filter(r => r.scoring.pct < 80).length;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Overall: ${overallPct}% (${totalScore}/${totalMax}) | ${passed} passed, ${failed} need work`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Save results
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = new URL(`./${ts}`, import.meta.url).pathname;
  const { mkdirSync, writeFileSync } = await import('fs');
  mkdirSync(dir, { recursive: true });

  writeFileSync(`${dir}/results.json`, JSON.stringify({ timestamp: ts, overall: overallPct, testsRun: tests.map(t => t.id), poolSize: POOL.length, results }, null, 2));

  let report = `# Eval Report — ${ts}\n\nOverall: **${overallPct}%** (${passed}/${results.length} passed) | Pool: ${POOL.length} tests, ${tests.length} selected\n\n`;
  for (const r of results) {
    report += `## ${r.id} — ${r.scoring.pct}% (${r.elapsed}ms)\n`;
    report += `- Agent: ${r.request.agent} | Task: ${r.request.taskType} | Provider: ${r.provider}/${r.model}\n`;
    report += `- Prompt: "${r.request.prompt}"\n`;
    if (r.error) report += `- **Error**: ${r.error}\n`;
    report += `- Checks:\n`;
    for (const c of r.scoring.checks) report += `  - ${c}\n`;
    if (r.response?.workflow?.nodes) {
      report += `- Nodes: ${r.response.workflow.nodes.map(n => `${n.label} (${n.category})`).join(', ')}\n`;
    }
    if (r.response?.message) {
      report += `- Message preview: ${r.response.message.slice(0, 200)}${r.response.message.length > 200 ? '...' : ''}\n`;
    }
    report += '\n';
  }

  const issues = results.filter(r => r.scoring.pct < 80);
  if (issues.length > 0) {
    report += `## Issues to Fix\n\n`;
    for (const r of issues) {
      const failedChecks = r.scoring.checks.filter(c => c.startsWith('✗'));
      report += `- **${r.id}**: ${failedChecks.join('; ')}\n`;
    }
  }

  writeFileSync(`${dir}/report.md`, report);

  console.log(`📁 Results saved to tests/eval/${ts}/`);
  console.log(`   - results.json (full data)`);
  console.log(`   - report.md (human-readable)\n`);

  return { overallPct, issues: issues.length, dir: `tests/eval/${ts}` };
}

main().catch(console.error);
