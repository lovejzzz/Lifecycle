/**
 * Project Slice — project CRUD, template loading.
 * Cross-slice dependencies: addToast, addMessage, pushHistory, optimizeLayout, requestFitView (via get()).
 * Module-level dependencies: flushSave, saveToStorage, uid, nodeCounter, clearAnimationTimers, trackTimeout (from useStore).
 */

import type { StateCreator } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { LifecycleStore } from '../types';
import type {
  NodeData,
  LifecycleEvent,
  CIDMessage,
  NodeCategory,
  CentralContext,
} from '@/lib/types';
import type { UndoOperation } from '../types';
import {
  listProjects as listStorageProjects,
  loadProject,
  deleteProject as deleteStorageProject,
  createProject as createStorageProject,
  renameProject as renameStorageProject,
} from '@/lib/storage';
import { NODE_W, createStyledEdge } from '@/lib/graph';
import { getAgent } from '@/lib/agents';
import { cidLog } from '../helpers';
import {
  flushSave,
  saveToStorage,
  uid,
  resetNodeCounter,
  initNodeCounter,
  clearAnimationTimers,
  trackTimeout,
} from '../useStore';

export interface ProjectSlice {
  currentProjectId: string | null;
  currentProjectName: string;
  newProject: () => void;
  switchProject: (id: string) => void;
  renameCurrentProject: (name: string) => void;
  deleteCurrentProject: () => void;
  listProjects: () => ProjectMeta[];
  loadTemplate: (templateName: string) => void;
}

export const createProjectSlice: StateCreator<LifecycleStore, [], [], ProjectSlice> = (
  set,
  get,
) => ({
  currentProjectId: null,
  currentProjectName: 'Untitled',

  newProject: () => {
    const store = get();
    const agent = getAgent(store.cidMode);

    // Save current project before creating new one
    if (store.currentProjectId) {
      flushSave();
    }

    // Reset nodeCounter for fresh project to avoid ID collisions
    resetNodeCounter(100);

    // Create new project in storage
    const projectName = `Project ${listStorageProjects().length + 1}`;
    const newId = createStorageProject(projectName);

    const fresh = {
      nodes: [] as Node<NodeData>[],
      edges: [] as Edge[],
      events: [] as LifecycleEvent[],
      messages: [
        {
          id: `msg-${Date.now()}`,
          role: 'cid' as const,
          content: agent.welcome,
          timestamp: Date.now(),
        },
      ],
      selectedNodeId: null,
      isProcessing: false,
      history: [] as UndoOperation[],
      future: [] as UndoOperation[],
      poirotContext: {
        phase: 'idle' as const,
        originalPrompt: '',
        answers: {},
        questionIndex: 0,
      },
      currentProjectId: newId,
      currentProjectName: projectName,
      centralContext: null as CentralContext | null,
    };
    set(fresh);
    saveToStorage({
      nodes: fresh.nodes,
      edges: fresh.edges,
      events: fresh.events,
      messages: fresh.messages,
    });
  },

  switchProject: (id: string) => {
    const store = get();
    // Save current project first
    if (store.currentProjectId) {
      flushSave();
    }

    // Load target project
    const data = loadProject(id);
    if (!data) {
      store.addToast('Project not found', 'error');
      return;
    }

    const projects = listStorageProjects();
    const meta = projects.find((p) => p.id === id);

    // Restore nodeCounter from loaded nodes+messages (always reset to match this project)
    const loadedNodes = (data.nodes || []) as Node<NodeData>[];
    initNodeCounter([
      loadedNodes,
      (data.messages || []) as { id: string }[],
      (data.events || []) as { id: string }[],
    ]);

    set({
      nodes: loadedNodes,
      edges: (data.edges || []) as Edge[],
      events: (data.events || []) as LifecycleEvent[],
      messages: (data.messages || []) as CIDMessage[],
      selectedNodeId: null,
      activeArtifactNodeId: null,
      contextMenu: null,
      history: [] as UndoOperation[],
      future: [] as UndoOperation[],
      isProcessing: false,
      currentProjectId: id,
      currentProjectName: meta?.name || 'Untitled',
    });

    // Update legacy key too
    if (typeof window !== 'undefined') {
      localStorage.setItem('lifecycle-store', JSON.stringify(data));
    }
    cidLog('switchProject', `Loaded project "${meta?.name}" (${loadedNodes.length} nodes)`);
  },

  renameCurrentProject: (name: string) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    flushSave();
    renameStorageProject(currentProjectId, name);
    set({ currentProjectName: name });
  },

  deleteCurrentProject: () => {
    const store = get();
    if (!store.currentProjectId) return;

    const projects = listStorageProjects();
    if (projects.length <= 1) {
      store.addToast('Cannot delete the only project', 'warning');
      return;
    }

    deleteStorageProject(store.currentProjectId);

    // Switch to another project
    const remaining = listStorageProjects();
    if (remaining.length > 0) {
      store.switchProject(remaining[0].id);
    }
  },

  listProjects: () => listStorageProjects(),

  loadTemplate: (templateName) => {
    const store = get();
    const templates: Record<
      string,
      {
        nodes: Array<{
          label: string;
          category: NodeCategory;
          description: string;
          inputType?: 'text' | 'url' | 'file';
          acceptedFileTypes?: string[];
        }>;
        edges: Array<{ from: number; to: number; label: string }>;
      }
    > = {
      'Software Development': {
        nodes: [
          {
            label: 'Requirements',
            category: 'input',
            description: 'User stories, feature specs, and acceptance criteria from stakeholders',
            inputType: 'file',
            acceptedFileTypes: ['.pdf', '.docx', '.txt', '.md'],
          },
          {
            label: 'Design',
            category: 'deliverable',
            description:
              'Create architecture diagrams, API contracts, and UI wireframes based on the requirements. Output a concise design document.',
          },
          {
            label: 'Development',
            category: 'process',
            description:
              'Implement the code based on the design document. List the key modules built and their status.',
          },
          {
            label: 'Code Review',
            category: 'review',
            description:
              'Review the implementation for correctness, style, security issues, and adherence to the design. Approve or request changes.',
          },
          {
            label: 'Testing',
            category: 'review',
            description:
              'Run unit tests, integration tests, and manual QA against the acceptance criteria. Report pass/fail results.',
          },
          {
            label: 'Deployment',
            category: 'deliverable',
            description: 'Deploy to production and confirm the release is live.',
          },
          {
            label: 'Monitoring',
            category: 'process',
            description:
              'Track error rates, latency, and user metrics post-deployment. Report any anomalies.',
          },
        ],
        edges: [
          { from: 0, to: 1, label: 'drives' },
          { from: 1, to: 2, label: 'feeds' },
          { from: 2, to: 3, label: 'triggers' },
          { from: 3, to: 4, label: 'validates' },
          { from: 4, to: 5, label: 'approves' },
          { from: 5, to: 6, label: 'triggers' },
        ],
      },
      'Content Pipeline': {
        nodes: [
          {
            label: 'Research',
            category: 'input',
            description: 'Topic research, audience analysis, and competitive landscape',
            inputType: 'file',
            acceptedFileTypes: ['.pdf', '.docx', '.txt', '.md', '.csv'],
          },
          {
            label: 'Brief',
            category: 'deliverable',
            description:
              'Write a content brief with target audience, key messages, SEO keywords, and outline structure.',
          },
          {
            label: 'Writing',
            category: 'process',
            description:
              'Draft the full article or content piece based on the brief. Write in a clear, engaging style with proper markdown formatting.',
          },
          {
            label: 'Editorial Review',
            category: 'review',
            description:
              'Review the draft for clarity, accuracy, tone, grammar, and alignment with the brief. Note specific improvements needed.',
          },
          {
            label: 'SEO & Format',
            category: 'review',
            description:
              'Check SEO: title tag, meta description, heading hierarchy, keyword density, internal links. Verify formatting meets publishing standards.',
          },
          {
            label: 'Published Article',
            category: 'deliverable',
            description: 'Final published content ready for distribution.',
          },
        ],
        edges: [
          { from: 0, to: 1, label: 'drives' },
          { from: 1, to: 2, label: 'feeds' },
          { from: 2, to: 3, label: 'triggers' },
          { from: 3, to: 4, label: 'validates' },
          { from: 4, to: 5, label: 'outputs' },
        ],
      },
      'Incident Response': {
        nodes: [
          {
            label: 'Incident Alert',
            category: 'input',
            description:
              'Incoming incident report: what happened, when, affected systems, severity',
          },
          {
            label: 'Triage',
            category: 'process',
            description:
              'Assess severity (P1-P4), identify affected services, assign incident commander, and set up communication channel.',
          },
          {
            label: 'Investigation',
            category: 'process',
            description:
              'Analyze logs, metrics, and traces to identify root cause. Document the timeline of events and contributing factors.',
          },
          {
            label: 'Resolution',
            category: 'process',
            description:
              'Apply the fix: rollback, hotfix, config change, or scaling action. Verify the fix resolves the issue.',
          },
          {
            label: 'Incident Review',
            category: 'review',
            description:
              'Review the response: Was triage fast enough? Was communication clear? Were the right people involved? Note what went well and what to improve.',
          },
          {
            label: 'Postmortem',
            category: 'deliverable',
            description:
              'Write a blameless postmortem with timeline, root cause, impact, action items, and lessons learned.',
          },
        ],
        edges: [
          { from: 0, to: 1, label: 'triggers' },
          { from: 1, to: 2, label: 'drives' },
          { from: 2, to: 3, label: 'feeds' },
          { from: 3, to: 4, label: 'triggers' },
          { from: 4, to: 5, label: 'approves' },
        ],
      },
      'Product Launch': {
        nodes: [
          {
            label: 'Market Research',
            category: 'input',
            description:
              'Competitive analysis, user interviews, market sizing, and user needs assessment',
            inputType: 'file',
            acceptedFileTypes: ['.pdf', '.docx', '.txt', '.csv', '.xlsx'],
          },
          {
            label: 'PRD',
            category: 'deliverable',
            description:
              'Write a product requirements document: problem statement, target users, key features, success metrics, and constraints.',
          },
          {
            label: 'Design & Build',
            category: 'process',
            description:
              'Design the solution architecture and implement the core features. List key decisions, tradeoffs, and technical approach.',
          },
          {
            label: 'Beta Testing',
            category: 'review',
            description:
              'Run beta with target users. Collect feedback on usability, bugs, and feature gaps. Summarize findings and recommend go/no-go.',
          },
          {
            label: 'Marketing Plan',
            category: 'deliverable',
            description:
              'Create go-to-market strategy: positioning, channels, launch timeline, budget, and success KPIs.',
          },
          {
            label: 'Launch',
            category: 'deliverable',
            description:
              'Execute the launch: deploy to production, publish marketing materials, and announce to users.',
          },
          {
            label: 'Post-Launch Metrics',
            category: 'process',
            description:
              'Track adoption, activation, retention, and revenue KPIs for the first 30 days. Flag any metrics below target.',
          },
        ],
        edges: [
          { from: 0, to: 1, label: 'drives' },
          { from: 1, to: 2, label: 'feeds' },
          { from: 0, to: 4, label: 'drives' },
          { from: 2, to: 3, label: 'triggers' },
          { from: 3, to: 5, label: 'approves' },
          { from: 4, to: 5, label: 'feeds' },
          { from: 5, to: 6, label: 'triggers' },
        ],
      },
      Chatbot: {
        nodes: [
          {
            label: 'User Message',
            category: 'input',
            description: 'Incoming user query or command',
          },
          {
            label: 'Intent Detection',
            category: 'process',
            description:
              'Classify the user message into one of: greeting, question, command, feedback, escalation. Return ONLY the classified intent and a one-line summary.',
          },
          {
            label: 'Context & Knowledge',
            category: 'process',
            description:
              'Organize the conversation context. Summarize what the user wants based on the detected intent and any prior context. List key topics mentioned.',
          },
          {
            label: 'Response Generation',
            category: 'process',
            description:
              'Generate a helpful, friendly chatbot response to the user based on the intent classification and context summary. Be conversational and concise. Respond directly to what the user said.',
          },
          {
            label: 'Safety Check',
            category: 'review',
            description:
              'Review the generated response. Check for: harmful content, PII exposure, hallucinated facts, off-topic drift. If the response is safe, pass it through unchanged. If not, flag the issue.',
          },
          {
            label: 'Fallback Handler',
            category: 'process',
            description:
              'If the safety check flagged issues or the intent was unclear, generate a safe fallback response asking for clarification. Otherwise pass through the approved response unchanged.',
          },
          {
            label: 'Bot Reply',
            category: 'deliverable',
            description:
              'Format and deliver the final chatbot response to the user. Pass through the response content from upstream as the final output.',
          },
        ],
        edges: [
          { from: 0, to: 1, label: 'triggers' },
          { from: 1, to: 2, label: 'drives' },
          { from: 2, to: 3, label: 'feeds' },
          { from: 3, to: 4, label: 'validates' },
          { from: 4, to: 5, label: 'feeds' },
          { from: 5, to: 6, label: 'outputs' },
        ],
      },
      'Course Design': {
        nodes: [
          {
            label: 'Syllabus',
            category: 'input',
            description:
              'The uploaded or authored course syllabus: title, description, schedule, policies, and high-level topic sequence.',
            inputType: 'file',
            acceptedFileTypes: ['.pdf', '.docx', '.txt', '.md'],
          },
          {
            label: 'Learning Objectives',
            category: 'process',
            description:
              "Extract and organize the course-level learning objectives from the syllabus. Use Bloom's taxonomy verbs. Map each objective to the weeks/modules it spans.",
          },
          {
            label: 'Lesson Plans',
            category: 'deliverable',
            description:
              'Generate a lesson plan for each module/week. Include topics, activities, timing, and which learning objectives each lesson addresses.',
          },
          {
            label: 'Assignments',
            category: 'deliverable',
            description:
              'Design assignments aligned to the lesson plans. Each assignment should reference specific learning objectives and lesson topics. Include format, length, and submission guidelines.',
          },
          {
            label: 'Rubrics',
            category: 'deliverable',
            description:
              'Create grading rubrics for each assignment. Define criteria, performance levels, and point allocations that map directly to the assignment requirements.',
          },
          {
            label: 'Quiz Bank',
            category: 'deliverable',
            description:
              'Generate a bank of quiz and exam questions organized by lesson/module. Include multiple question types (MCQ, short answer, essay prompts) covering key concepts from the lesson plans.',
          },
          {
            label: 'Study Guide',
            category: 'deliverable',
            description:
              'Compile a student-facing study guide summarizing key concepts, vocabulary, and review questions for each module. Cross-reference lesson plans and quiz bank topics.',
          },
          {
            label: 'Course FAQ',
            category: 'deliverable',
            description:
              'Generate a comprehensive course FAQ answering common student questions about assignments, grading policies, schedule, and study strategies based on all upstream artifacts.',
          },
        ],
        edges: [
          // Core chain: Syllabus -> Objectives -> Lesson Plans
          { from: 0, to: 1, label: 'derives' },
          { from: 1, to: 2, label: 'structures' },
          // Lesson Plans produce downstream deliverables
          { from: 2, to: 3, label: 'produces' },
          { from: 2, to: 5, label: 'tests' },
          { from: 2, to: 6, label: 'guides' },
          // Assignments connect to everything they affect
          { from: 3, to: 4, label: 'validates' },
          { from: 3, to: 5, label: 'feeds' },
          { from: 3, to: 6, label: 'feeds' },
          // Quiz Bank and Rubrics feed into Study Guide
          { from: 5, to: 6, label: 'feeds' },
          { from: 4, to: 7, label: 'feeds' },
          // Study Guide + Assignments feed FAQ
          { from: 6, to: 7, label: 'answers' },
          { from: 3, to: 7, label: 'feeds' },
        ],
      },
      'Lesson Planning': {
        nodes: [
          {
            label: 'Topic',
            category: 'input',
            description:
              'The lesson topic or theme, including any prerequisites, target audience, and time constraints.',
          },
          {
            label: 'Learning Goals',
            category: 'process',
            description:
              "Define specific, measurable learning goals for this lesson using Bloom's taxonomy. State what students should know or be able to do by the end.",
          },
          {
            label: 'Activities',
            category: 'process',
            description:
              'Design a sequence of learning activities (lecture segments, discussions, group work, practice problems) with timing. Each activity should map to at least one learning goal.',
          },
          {
            label: 'Materials',
            category: 'deliverable',
            description:
              'List and create supporting materials: slide outlines, handouts, readings, media links, and any scaffolding resources needed for the activities.',
          },
          {
            label: 'Assessment',
            category: 'deliverable',
            description:
              'Create formative and/or summative assessments to measure whether learning goals were met. Include exit tickets, quiz questions, or short assignments with answer keys.',
          },
          {
            label: 'Reflection',
            category: 'review',
            description:
              "Post-lesson reflection template: What worked? What didn't? Were learning goals met? Student engagement observations and adjustments for next time.",
          },
        ],
        edges: [
          { from: 0, to: 1, label: 'defines' },
          { from: 1, to: 2, label: 'guides' },
          { from: 2, to: 3, label: 'supports' },
          { from: 2, to: 4, label: 'evaluates' },
          { from: 4, to: 5, label: 'refines' },
        ],
      },
      'Assignment Design': {
        nodes: [
          {
            label: 'Brief',
            category: 'input',
            description:
              'The assignment brief: what students should produce, the learning objectives it assesses, target skill level, and any constraints (length, format, tools allowed).',
            inputType: 'file',
            acceptedFileTypes: ['.pdf', '.docx', '.txt', '.md'],
          },
          {
            label: 'Requirements',
            category: 'process',
            description:
              'Break the brief into detailed, actionable requirements. List deliverables, evaluation criteria, academic integrity expectations, and submission format.',
          },
          {
            label: 'Rubric',
            category: 'deliverable',
            description:
              'Build a detailed grading rubric with criteria derived from the requirements. Define performance levels (excellent, proficient, developing, beginning) with point allocations and descriptors.',
          },
          {
            label: 'Sample Solution',
            category: 'deliverable',
            description:
              'Produce an exemplary sample solution or annotated example that meets all rubric criteria at the highest level. Include inline notes explaining why each element earns full marks.',
          },
          {
            label: 'Student Guide',
            category: 'deliverable',
            description:
              'Write a student-facing guide that explains the assignment expectations, tips for success, common pitfalls to avoid, and how the rubric will be applied. Reference the requirements without revealing the sample solution.',
          },
        ],
        edges: [
          { from: 0, to: 1, label: 'specifies' },
          { from: 1, to: 2, label: 'validates' },
          { from: 2, to: 3, label: 'demonstrates' },
          { from: 2, to: 4, label: 'guides' },
        ],
      },
    };

    const template = templates[templateName];
    if (!template) {
      store.addToast(`Template "${templateName}" not found`, 'warning');
      return;
    }

    store.pushHistory();
    clearAnimationTimers();

    const newNodes: Node<NodeData>[] = template.nodes.map((n, i) => ({
      id: uid(),
      type: 'lifecycleNode',
      position: { x: i * (NODE_W + 80), y: 80 + (i % 2) * 30 },
      data: {
        label: n.label,
        category: n.category,
        status: 'generating' as const,
        description: n.description,
        version: 1,
        lastUpdated: Date.now(),
        ...(n.inputType && { inputType: n.inputType }),
        ...(n.acceptedFileTypes && { acceptedFileTypes: n.acceptedFileTypes }),
      },
    }));

    const newEdges: Edge[] = template.edges.map((e) =>
      createStyledEdge(newNodes[e.from].id, newNodes[e.to].id, e.label),
    );

    set({ nodes: [], edges: [] });
    newNodes.forEach((node, i) => {
      trackTimeout(
        () => {
          set((s) => ({ nodes: [...s.nodes, node] }));
          get().requestFitView();
        },
        100 + i * 200,
      );
    });
    const eStart = 100 + newNodes.length * 200 + 150;
    newEdges.forEach((edge, i) => {
      trackTimeout(
        () => {
          set((s) => ({ edges: [...s.edges, edge] }));
          if (i === newEdges.length - 1) get().requestFitView();
        },
        eStart + i * 80,
      );
    });
    trackTimeout(
      () => {
        set((s) => {
          const nodes = s.nodes.map((n) => ({
            ...n,
            data: {
              ...n.data,
              status: n.data.status === 'generating' ? ('active' as const) : n.data.status,
            },
          }));
          saveToStorage({ nodes, edges: s.edges, events: s.events, messages: s.messages });
          return { nodes };
        });
        trackTimeout(() => {
          if (get().nodes.length > 2) get().optimizeLayout();
        }, 300);
      },
      eStart + newEdges.length * 80 + 200,
    );

    const agent = getAgent(get().cidMode);
    store.addMessage({
      id: uid(),
      role: 'cid',
      content: `Loaded **${templateName}** template — ${newNodes.length} nodes, ${newEdges.length} connections. ${agent.name === 'Rowan' ? 'Ready to customize.' : 'Voil\u00e0! A foundation for your investigation.'}`,
      timestamp: Date.now(),
    });
    store.addToast(`Template "${templateName}" loaded`, 'success');
  },
});
