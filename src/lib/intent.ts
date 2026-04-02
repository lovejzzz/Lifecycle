/**
 * Intent detection & node generation from natural language prompts.
 * Extracted from useStore.ts for testability and modularity.
 */

import type { Node, Edge } from '@xyflow/react';
import type { NodeData, LifecycleEvent } from '@/lib/types';
import { NODE_W, NODE_H, createStyledEdge } from '@/lib/graph';

// ─── Service & File Type Knowledge Bases ────────────────────────────────────

export interface ServiceInfo {
  name: string;
  icon: string;
  keywords: string[];
  inputType: 'url' | 'file' | 'text';
  placeholder?: string;
}

export const KNOWN_SERVICES: ServiceInfo[] = [
  {
    name: 'Google Docs',
    icon: '📄',
    keywords: ['google doc', 'gdoc', 'google document'],
    inputType: 'url',
    placeholder: 'Paste Google Docs link...',
  },
  {
    name: 'Google Sheets',
    icon: '📊',
    keywords: ['google sheet', 'gsheet'],
    inputType: 'url',
    placeholder: 'Paste Google Sheets link...',
  },
  {
    name: 'Google Slides',
    icon: '📽️',
    keywords: ['google slide', 'gslide'],
    inputType: 'url',
    placeholder: 'Paste Google Slides link...',
  },
  {
    name: 'Google Drive',
    icon: '☁️',
    keywords: ['google drive', 'gdrive'],
    inputType: 'url',
    placeholder: 'Paste Google Drive link...',
  },
  {
    name: 'Notion',
    icon: '📝',
    keywords: ['notion'],
    inputType: 'url',
    placeholder: 'Paste Notion page link...',
  },
  {
    name: 'GitHub',
    icon: '🐙',
    keywords: ['github', 'git repo', 'repository'],
    inputType: 'url',
    placeholder: 'Paste GitHub URL...',
  },
  {
    name: 'Figma',
    icon: '🎨',
    keywords: ['figma'],
    inputType: 'url',
    placeholder: 'Paste Figma link...',
  },
  {
    name: 'Airtable',
    icon: '📋',
    keywords: ['airtable'],
    inputType: 'url',
    placeholder: 'Paste Airtable link...',
  },
  {
    name: 'Slack',
    icon: '💬',
    keywords: ['slack'],
    inputType: 'url',
    placeholder: 'Paste Slack message link...',
  },
  {
    name: 'Dropbox',
    icon: '📦',
    keywords: ['dropbox'],
    inputType: 'url',
    placeholder: 'Paste Dropbox link...',
  },
  {
    name: 'YouTube',
    icon: '▶️',
    keywords: ['youtube', 'video link'],
    inputType: 'url',
    placeholder: 'Paste YouTube URL...',
  },
  {
    name: 'URL',
    icon: '🔗',
    keywords: ['url', 'link', 'webpage', 'website'],
    inputType: 'url',
    placeholder: 'Paste URL...',
  },
];

export interface FileTypeInfo {
  keywords: string[];
  types: string[];
  label: string;
  desc: string;
}

export const FILE_TYPE_MAP: FileTypeInfo[] = [
  { keywords: ['pdf'], types: ['.pdf'], label: 'PDF Upload', desc: 'Upload PDF files' },
  {
    keywords: ['image', 'photo', 'picture', 'img', 'screenshot'],
    types: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
    label: 'Image Upload',
    desc: 'Upload images (.png, .jpg, .gif, .webp, .svg)',
  },
  {
    keywords: ['video', 'movie', 'clip'],
    types: ['.mp4', '.mov', '.avi', '.webm'],
    label: 'Video Upload',
    desc: 'Upload video files (.mp4, .mov, .webm)',
  },
  {
    keywords: ['audio', 'sound', 'music', 'podcast', 'recording'],
    types: ['.mp3', '.wav', '.m4a', '.ogg'],
    label: 'Audio Upload',
    desc: 'Upload audio files (.mp3, .wav, .m4a)',
  },
  {
    keywords: ['spreadsheet', 'excel', 'csv', 'dataset'],
    types: ['.csv', '.xlsx', '.xls', '.tsv'],
    label: 'Data Upload',
    desc: 'Upload data files (.csv, .xlsx, .xls)',
  },
  {
    keywords: ['code', 'source', 'script', 'program'],
    types: ['.js', '.ts', '.py', '.java', '.cpp', '.go', '.rs'],
    label: 'Code Upload',
    desc: 'Upload source code files',
  },
  {
    keywords: ['presentation', 'slide', 'ppt', 'powerpoint'],
    types: ['.pptx', '.ppt', '.key'],
    label: 'Presentation Upload',
    desc: 'Upload presentation files (.pptx, .ppt)',
  },
];

export interface OutputFormat {
  format: string;
  label: string;
  mimeType: string;
  icon: string;
}

export const OUTPUT_FORMATS: OutputFormat[] = [
  { format: 'pdf', label: 'PDF', mimeType: 'application/pdf', icon: '📄' },
  {
    format: 'docx',
    label: 'Word Document',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    icon: '📝',
  },
  { format: 'csv', label: 'CSV', mimeType: 'text/csv', icon: '📊' },
  { format: 'txt', label: 'Text File', mimeType: 'text/plain', icon: '📃' },
  { format: 'md', label: 'Markdown', mimeType: 'text/markdown', icon: '📋' },
  { format: 'json', label: 'JSON', mimeType: 'application/json', icon: '🔧' },
  { format: 'html', label: 'HTML', mimeType: 'text/html', icon: '🌐' },
];

// ─── Intent Analysis ────────────────────────────────────────────────────────

export interface TransformTarget {
  keywords: string[];
  name: string;
}

export const TRANSFORMATION_TARGETS: TransformTarget[] = [
  // Education-specific (checked first — more specific than generic matches)
  { keywords: ['lesson plan', 'lesson syllabus'], name: 'Lesson Plan' },
  { keywords: ['syllabus', 'curriculum'], name: 'Course Syllabus' },
  { keywords: ['study guide'], name: 'Study Guide' },
  { keywords: ['rubric', 'grading criteria', 'marking scheme'], name: 'Rubric' },
  { keywords: ['discussion prompt', 'discussion question'], name: 'Discussion Prompts' },
  { keywords: ['lecture note', 'lecture'], name: 'Lecture Notes' },
  { keywords: ['homework', 'assignment brief'], name: 'Assignment' },
  { keywords: ['course faq', 'course question'], name: 'Course FAQ' },
  { keywords: ['course'], name: 'Course Material' },
  // General
  { keywords: ['summary', 'summarize'], name: 'Summary' },
  { keywords: ['outline'], name: 'Outline' },
  { keywords: ['transcript', 'transcription'], name: 'Transcript' },
  { keywords: ['translation', 'translate'], name: 'Translation' },
  { keywords: ['report'], name: 'Report' },
  { keywords: ['analysis', 'analyze'], name: 'Analysis' },
  { keywords: ['blog', 'article', 'post'], name: 'Blog Post' },
  { keywords: ['email', 'newsletter'], name: 'Email Draft' },
  { keywords: ['presentation'], name: 'Presentation' },
  { keywords: ['proposal'], name: 'Proposal' },
  { keywords: ['resume', 'cv'], name: 'Resume' },
  { keywords: ['quiz', 'test', 'exam', 'assessment'], name: 'Assessment' },
  { keywords: ['flashcard'], name: 'Flashcards' },
  { keywords: ['tutorial', 'how-to'], name: 'Tutorial' },
  { keywords: ['guide'], name: 'Guide' },
  { keywords: ['documentation', 'docs'], name: 'Documentation' },
  { keywords: ['spec', 'specification'], name: 'Specification' },
  { keywords: ['prd'], name: 'PRD' },
  { keywords: ['pitch deck', 'pitch'], name: 'Pitch Deck' },
  { keywords: ['marketing plan'], name: 'Marketing Plan' },
  { keywords: ['budget'], name: 'Budget Plan' },
  { keywords: ['roadmap', 'timeline'], name: 'Roadmap' },
  { keywords: ['design brief', 'design'], name: 'Design Brief' },
];

/**
 * Detect multiple artifact types from a comma/"and"-separated list in the prompt.
 * Returns an array of unique transformation target names found.
 * Example: "create lesson plans, rubrics, and quizzes" → ['Lesson Plan', 'Rubric', 'Assessment']
 */
export function detectMultipleTransformations(prompt: string): string[] {
  const lower = prompt.toLowerCase();

  // Split on commas and " and " to get individual segments
  // e.g., "lesson plans, rubrics, and quizzes" → ["lesson plans", "rubrics", "quizzes"]
  const segments = lower
    .split(/,|\band\b/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const found: string[] = [];
  const seen = new Set<string>();

  // For each segment, check if it matches any transformation target
  for (const segment of segments) {
    for (const t of TRANSFORMATION_TARGETS) {
      if (seen.has(t.name)) continue;
      if (t.keywords.some((kw) => segment.includes(kw))) {
        found.push(t.name);
        seen.add(t.name);
        break; // one match per segment
      }
    }
  }

  // Also do a full-prompt scan: if the full prompt matches targets not yet found,
  // include them (handles cases where targets aren't neatly in separate segments)
  for (const t of TRANSFORMATION_TARGETS) {
    if (seen.has(t.name)) continue;
    if (t.keywords.some((kw) => lower.includes(kw))) {
      found.push(t.name);
      seen.add(t.name);
    }
  }

  return found;
}

export interface IntentAnalysis {
  inputService: ServiceInfo | null;
  outputService: ServiceInfo | null;
  outputFormat: OutputFormat | null;
  fileInput: FileTypeInfo | null;
  transformation: string | null;
  /** All detected transformation targets (for multi-artifact prompts) */
  transformations: string[];
  sourceType: string | null;
}

export function analyzeIntent(prompt: string): IntentAnalysis {
  const lower = prompt.toLowerCase();

  // 1. Detect input service
  let inputService: ServiceInfo | null = null;
  for (const svc of KNOWN_SERVICES) {
    if (svc.keywords.some((kw) => lower.includes(kw))) {
      inputService = svc;
      break;
    }
  }
  if (!inputService && /\b(?:shared|share)\b.*\b(?:link|url)\b/.test(lower)) {
    inputService = KNOWN_SERVICES.find((s) => s.name === 'URL')!;
  }

  // 2. Detect output service
  let outputService: ServiceInfo | null = null;
  const outputPatterns = [
    /\b(?:export|output|save|send|publish|push|write)\s+(?:to|into)\s+(?:an?\s+|another\s+)?(.+?)$/i,
    /\bto\s+(?:an?\s+|another\s+)(.+?)$/i,
  ];
  for (const pat of outputPatterns) {
    const m = prompt.match(pat);
    if (m) {
      const dest = m[1].toLowerCase().trim();
      for (const svc of KNOWN_SERVICES) {
        if (svc.keywords.some((kw) => dest.includes(kw))) {
          outputService = svc;
          break;
        }
      }
      if (outputService) break;
    }
  }

  // 3. Detect file-based input
  let fileInput: FileTypeInfo | null = null;
  if (!inputService) {
    for (const ft of FILE_TYPE_MAP) {
      if (ft.keywords.some((kw) => lower.includes(kw))) {
        fileInput = ft;
        break;
      }
    }
    if (!fileInput && /\b(?:upload|file|import)\b/.test(lower)) {
      fileInput = {
        keywords: [],
        types: ['.pdf', '.docx', '.txt', '.csv', '.json', '.xlsx'],
        label: 'File Upload',
        desc: 'Upload files to process',
      };
    }
  }

  // 4. Detect transformation target
  let transformation: string | null = null;
  for (const t of TRANSFORMATION_TARGETS) {
    if (t.keywords.some((kw) => lower.includes(kw))) {
      transformation = t.name;
      break;
    }
  }

  // 5. Detect source type
  let sourceType: string | null = null;
  const sourceTypeMap = [
    { keywords: ['document', 'doc'], name: 'document' },
    { keywords: ['spreadsheet', 'sheet'], name: 'spreadsheet' },
    { keywords: ['video'], name: 'video' },
    { keywords: ['audio', 'recording'], name: 'audio' },
    { keywords: ['image', 'photo'], name: 'image' },
    { keywords: ['data', 'dataset'], name: 'data' },
    { keywords: ['code', 'source code'], name: 'code' },
  ];
  for (const st of sourceTypeMap) {
    if (st.keywords.some((kw) => lower.includes(kw))) {
      sourceType = st.name;
      break;
    }
  }
  if (!sourceType && inputService) {
    if (['Google Docs', 'Notion'].includes(inputService.name)) sourceType = 'document';
    if (['Google Sheets', 'Airtable'].includes(inputService.name)) sourceType = 'spreadsheet';
    if (['Figma'].includes(inputService.name)) sourceType = 'design';
    if (['YouTube'].includes(inputService.name)) sourceType = 'video';
  }
  if (!fileInput && !inputService && sourceType === 'document') {
    fileInput = {
      keywords: [],
      types: ['.pdf', '.docx', '.doc', '.txt', '.rtf'],
      label: 'Document Upload',
      desc: 'Upload documents (.pdf, .docx, .doc, .txt, .rtf)',
    };
  }

  // 6. Detect output format
  let outputFormat: OutputFormat | null = null;
  const formatPatterns = [
    /\b(?:export|output|save|convert|download)\s+(?:to|as|into)\s+(?:a\s+)?(\w+)\b/i,
    /\bto\s+(?:a\s+)?(\w+)\s*$/i,
    /\bas\s+(?:a\s+)?(\w+)\s*$/i,
  ];
  for (const pat of formatPatterns) {
    const m = prompt.match(pat);
    if (m) {
      const fmt = m[1].toLowerCase().replace(/^\./, '');
      const found = OUTPUT_FORMATS.find((f) => f.format === fmt || f.label.toLowerCase() === fmt);
      if (found) {
        outputFormat = found;
        break;
      }
    }
  }
  if (!outputFormat) {
    for (const fmt of OUTPUT_FORMATS) {
      if (lower.includes(fmt.format) && /\b(?:export|output|download|save|convert)\b/.test(lower)) {
        outputFormat = fmt;
        break;
      }
    }
  }

  // 7. Detect all transformations for multi-artifact support
  const transformations = detectMultipleTransformations(prompt);

  return {
    inputService,
    outputService,
    outputFormat,
    fileInput,
    transformation,
    transformations,
    sourceType,
  };
}

// ─── Node Builder ───────────────────────────────────────────────────────────

/** Build a complete workflow graph from a natural language prompt (fallback when API doesn't return nodes) */
export function buildNodesFromPrompt(
  prompt: string,
  uidFn: () => string,
  logFn: (action: string, detail?: string | Record<string, unknown>) => void,
): { nodes: Node<NodeData>[]; edges: Edge[]; events: LifecycleEvent[] } {
  const lower = prompt.toLowerCase();
  const newNodes: Node<NodeData>[] = [];
  const newEdges: Edge[] = [];
  const newEvents: LifecycleEvent[] = [];
  const intent = analyzeIntent(prompt);
  logFn('analyzeIntent', {
    inputService: intent.inputService?.name || null,
    outputService: intent.outputService?.name || null,
    fileInput: intent.fileInput?.label || null,
    transformation: intent.transformation,
    sourceType: intent.sourceType,
  });

  const COL_GAP = NODE_W + 80;
  const ROW_GAP = NODE_H + 40;
  let col = 0;

  // ── Column 0: Input node ──
  const inputId = uidFn();
  const inputData: NodeData = {
    label: 'User Input',
    category: 'input',
    status: 'active',
    description: 'Requirements, data, or prompts from the user',
    version: 1,
    lastUpdated: Date.now(),
  };

  if (intent.inputService) {
    inputData.label = `${intent.inputService.name} Source`;
    inputData.description = `Paste a ${intent.inputService.name} link to import content`;
    inputData.inputType = 'url';
    inputData.serviceName = intent.inputService.name;
    inputData.serviceIcon = intent.inputService.icon;
    inputData.placeholder = intent.inputService.placeholder;
  } else if (intent.fileInput) {
    inputData.label = intent.fileInput.label;
    inputData.description = intent.fileInput.desc;
    inputData.inputType = 'file';
    inputData.acceptedFileTypes = intent.fileInput.types;
  } else if (
    /\b(?:upload|file|import|convert|transform|parse)\b/.test(lower) ||
    (intent.sourceType && !intent.inputService)
  ) {
    inputData.label = 'Document Upload';
    inputData.description = 'Upload source documents (.pdf, .docx, .doc, .txt, .rtf)';
    inputData.inputType = 'file';
    inputData.acceptedFileTypes = ['.pdf', '.docx', '.doc', '.txt', '.rtf'];
  }

  newNodes.push({
    id: inputId,
    type: 'lifecycleNode',
    position: { x: col * COL_GAP, y: 80 },
    data: inputData,
  });
  newEvents.push({
    id: uidFn(),
    type: 'created',
    message: `${inputData.label} node created`,
    timestamp: Date.now(),
    nodeId: inputId,
    agent: true,
  });
  col++;

  // ── Content Extraction ──
  let extractId: string | null = null;
  if (intent.inputService || intent.fileInput) {
    extractId = uidFn();
    const extractLabel = intent.inputService
      ? `Fetch from ${intent.inputService.name}`
      : `Parse ${intent.sourceType || 'Content'}`;
    const extractDesc = intent.inputService
      ? `Retrieve and extract content from ${intent.inputService.name}`
      : `Parse and extract structured content from uploaded ${intent.sourceType || 'files'}`;
    newNodes.push({
      id: extractId,
      type: 'lifecycleNode',
      position: { x: col * COL_GAP, y: 80 },
      data: {
        label: extractLabel,
        category: 'cid',
        status: 'generating',
        description: extractDesc,
        version: 1,
        lastUpdated: Date.now(),
        ...(intent.transformation && {
          aiPrompt: `Extract and structure the content from the input. Prepare it for generating a ${intent.transformation}. Output clean, organized text.`,
        }),
      },
    });
    newEdges.push(createStyledEdge(inputId, extractId, 'feeds', { animated: true }));
    newEvents.push({
      id: uidFn(),
      type: 'created',
      message: `${extractLabel} node created`,
      timestamp: Date.now(),
      nodeId: extractId,
      agent: true,
    });
    col++;
  }

  // ── Research Notes ──
  let noteId: string | null = null;
  if (/\b(?:note|research|idea)\b/.test(lower) && !intent.transformation) {
    noteId = uidFn();
    newNodes.push({
      id: noteId,
      type: 'lifecycleNode',
      position: { x: col * COL_GAP, y: 80 },
      data: {
        label: 'Research Notes',
        category: 'note',
        status: 'generating',
        description: 'Raw notes and ideas',
        version: 1,
        lastUpdated: Date.now(),
      },
    });
    const prevId = extractId || inputId;
    newEdges.push(createStyledEdge(prevId, noteId, 'feeds'));
    newEvents.push({
      id: uidFn(),
      type: 'created',
      message: 'Notes node created for research capture',
      timestamp: Date.now(),
      nodeId: noteId,
      agent: true,
    });
    col++;
  }

  // ── Project State ──
  const stateId = uidFn();
  const stateLabel = intent.sourceType
    ? `${intent.sourceType.charAt(0).toUpperCase() + intent.sourceType.slice(1)} Content`
    : 'Project State';
  newNodes.push({
    id: stateId,
    type: 'lifecycleNode',
    position: { x: col * COL_GAP, y: 80 },
    data: {
      label: stateLabel,
      category: 'state',
      status: 'generating',
      description: intent.transformation
        ? `Structured content ready for ${intent.transformation} generation`
        : `Core state extracted from: "${prompt.slice(0, 60)}..."`,
      version: 1,
      lastUpdated: Date.now(),
      aiPrompt: intent.transformation
        ? `Analyze and structure the input content. Extract key information needed to generate a ${intent.transformation}. Organize into clear sections with headings.`
        : `Analyze and organize the input content. Extract key points and structure them clearly for downstream processing.`,
    },
  });
  newEvents.push({
    id: uidFn(),
    type: 'created',
    message: `${stateLabel} node created`,
    timestamp: Date.now(),
    nodeId: stateId,
    agent: true,
  });
  const prevToState = noteId || extractId || inputId;
  const prevToStateLabel = noteId ? 'refines' : extractId ? 'feeds' : 'feeds';
  newEdges.push(
    createStyledEdge(prevToState, stateId, prevToStateLabel, { animated: !!extractId }),
  );
  col++;

  // ── Artifacts ──
  const artifactNames: string[] = [];
  const educationTypes = [
    'Lesson Plan',
    'Course Syllabus',
    'Course Material',
    'Assessment',
    'Flashcards',
    'Tutorial',
    'Rubric',
    'Study Guide',
    'Discussion Prompts',
    'Lecture Notes',
    'Assignment',
    'Course FAQ',
  ];

  if (intent.transformations.length > 0) {
    // Use multi-artifact detection: add all detected targets
    for (const t of intent.transformations) {
      if (!artifactNames.includes(t)) artifactNames.push(t);
    }
    // For education artifacts, add supplementary nodes if not already present
    const hasEducation = artifactNames.some((n) => educationTypes.includes(n));
    if (hasEducation) {
      if (!artifactNames.includes('Lesson Plan') && /\blesson\b/.test(lower))
        artifactNames.push('Lesson Plan');
      if (!artifactNames.includes('Learning Objectives')) artifactNames.push('Learning Objectives');
    }
  } else if (intent.transformation) {
    // Fallback: single transformation (backward compat — shouldn't normally reach here
    // since transformations[] would have it, but guards against edge cases)
    artifactNames.push(intent.transformation);
    if (educationTypes.includes(intent.transformation)) {
      if (intent.transformation !== 'Lesson Plan' && /\blesson\b/.test(lower))
        artifactNames.push('Lesson Plan');
      if (!artifactNames.includes('Learning Objectives')) artifactNames.push('Learning Objectives');
    }
  } else {
    if (/\bprd\b/.test(lower)) artifactNames.push('PRD Document');
    if (/\btech\b|\barchitecture\b|\bapi\b/.test(lower)) artifactNames.push('Technical Spec');
    if (/\bpitch\b|\bdeck\b/.test(lower)) artifactNames.push('Pitch Deck');
    if (/\bmarketing\s+plan\b|\bstrategy\b/.test(lower)) artifactNames.push('Marketing Plan');
    if (/\bdesign\s+(?:brief|spec|system)\b|\bui\b|\bux\b/.test(lower))
      artifactNames.push('Design Brief');
    if (/\blegal\b|\bcompliance\b/.test(lower)) artifactNames.push('Legal Review');
    if (/\breport\b|\banalysis\b/.test(lower)) artifactNames.push('Analysis Report');
    if (/\bbudget\b|\bcost\b|\bfinanc/.test(lower)) artifactNames.push('Budget Analysis');
    if (/\btimeline\b|\broadmap\b|\bmilestone\b/.test(lower)) artifactNames.push('Project Roadmap');
    if (/\btest\s+plan\b|\bqa\b/.test(lower)) artifactNames.push('Test Plan');
    if (/\bonboard\b|\bguide\b/.test(lower)) artifactNames.push('Onboarding Guide');
    if (/\bcompetit\b|\bbenchmark\b/.test(lower)) artifactNames.push('Competitive Analysis');

    if (artifactNames.length === 0) {
      const words = prompt.split(/[\s,]+/).filter((w) => w.length > 3);
      const stopWords = new Set([
        'build',
        'create',
        'make',
        'generate',
        'start',
        'with',
        'that',
        'this',
        'from',
        'have',
        'will',
        'want',
        'need',
        'like',
        'about',
        'some',
        'just',
        'help',
        'workflow',
        'turn',
        'shared',
        'link',
        'another',
        'export',
      ]);
      const meaningful = words.filter((w) => !stopWords.has(w.toLowerCase())).slice(0, 3);
      if (meaningful.length > 0) {
        meaningful.forEach((w) =>
          artifactNames.push(w.charAt(0).toUpperCase() + w.slice(1) + ' Document'),
        );
      } else {
        artifactNames.push('Core Document', 'Supporting Document');
      }
    }
  }

  const artifactCol = col;
  const totalArtifactHeight = artifactNames.length * ROW_GAP;
  const artifactStartY = 80 - totalArtifactHeight / 2 + ROW_GAP / 2;

  artifactNames.forEach((name, i) => {
    const aId = uidFn();
    let sections = [
      { id: 's1', title: 'Overview', status: 'current' as const },
      { id: 's2', title: 'Details', status: 'current' as const },
      { id: 's3', title: 'Summary', status: 'current' as const },
    ];
    if (name === 'Lesson Plan') {
      sections = [
        { id: 's1', title: 'Learning Objectives', status: 'current' as const },
        { id: 's2', title: 'Topics & Modules', status: 'current' as const },
        { id: 's3', title: 'Activities & Exercises', status: 'current' as const },
        { id: 's4', title: 'Assessment Criteria', status: 'current' as const },
        { id: 's5', title: 'Resources & Materials', status: 'current' as const },
      ];
    } else if (name === 'Course Syllabus') {
      sections = [
        { id: 's1', title: 'Course Overview', status: 'current' as const },
        { id: 's2', title: 'Weekly Schedule', status: 'current' as const },
        { id: 's3', title: 'Assignments & Grading', status: 'current' as const },
        { id: 's4', title: 'Required Materials', status: 'current' as const },
      ];
    } else if (name === 'Learning Objectives') {
      sections = [
        { id: 's1', title: 'Knowledge Goals', status: 'current' as const },
        { id: 's2', title: 'Skill Outcomes', status: 'current' as const },
        { id: 's3', title: 'Assessment Alignment', status: 'current' as const },
      ];
    } else if (name === 'Rubric') {
      sections = [
        { id: 's1', title: 'Criteria & Dimensions', status: 'current' as const },
        { id: 's2', title: 'Performance Levels', status: 'current' as const },
        { id: 's3', title: 'Scoring Guide', status: 'current' as const },
        { id: 's4', title: 'Feedback Templates', status: 'current' as const },
      ];
    } else if (name === 'Study Guide') {
      sections = [
        { id: 's1', title: 'Key Concepts', status: 'current' as const },
        { id: 's2', title: 'Important Terms', status: 'current' as const },
        { id: 's3', title: 'Review Questions', status: 'current' as const },
        { id: 's4', title: 'Practice Problems', status: 'current' as const },
      ];
    } else if (name === 'Discussion Prompts') {
      sections = [
        { id: 's1', title: 'Opening Questions', status: 'current' as const },
        { id: 's2', title: 'Critical Thinking Prompts', status: 'current' as const },
        { id: 's3', title: 'Application Scenarios', status: 'current' as const },
      ];
    } else if (name === 'Lecture Notes') {
      sections = [
        { id: 's1', title: 'Outline & Key Points', status: 'current' as const },
        { id: 's2', title: 'Detailed Content', status: 'current' as const },
        { id: 's3', title: 'Examples & Illustrations', status: 'current' as const },
        { id: 's4', title: 'Discussion Notes', status: 'current' as const },
      ];
    } else if (name === 'Assignment') {
      sections = [
        { id: 's1', title: 'Task Description', status: 'current' as const },
        { id: 's2', title: 'Requirements & Deliverables', status: 'current' as const },
        { id: 's3', title: 'Grading Criteria', status: 'current' as const },
        { id: 's4', title: 'Due Date & Submission', status: 'current' as const },
      ];
    } else if (name === 'Course FAQ') {
      sections = [
        { id: 's1', title: 'Course Logistics', status: 'current' as const },
        { id: 's2', title: 'Assignment Questions', status: 'current' as const },
        { id: 's3', title: 'Grading & Policies', status: 'current' as const },
      ];
    }
    newNodes.push({
      id: aId,
      type: 'lifecycleNode',
      position: { x: artifactCol * COL_GAP, y: artifactStartY + i * ROW_GAP },
      data: {
        label: name,
        category: 'artifact',
        status: 'generating',
        description: `Generated artifact: ${name}`,
        version: 1,
        lastUpdated: Date.now(),
        sections,
        ...(intent.transformation && {
          aiPrompt: `Generate a complete ${name} based on the structured content provided. Include all sections: ${sections.map((s) => s.title).join(', ')}. Be thorough and professional.`,
        }),
      },
    });
    newEdges.push(createStyledEdge(stateId, aId, 'drives'));
    newEvents.push({
      id: uidFn(),
      type: 'created',
      message: `${name} artifact generated`,
      timestamp: Date.now(),
      nodeId: aId,
      agent: true,
    });
  });
  col++;

  // ── Review Gate ──
  const revId = uidFn();
  newNodes.push({
    id: revId,
    type: 'lifecycleNode',
    position: { x: col * COL_GAP, y: 80 },
    data: {
      label: 'Review Gate',
      category: 'review',
      status: 'reviewing',
      description: 'Pending review before finalization',
      version: 1,
      lastUpdated: Date.now(),
      aiPrompt:
        'Review all upstream content for completeness, accuracy, and quality. List any issues found and provide an overall assessment. Rate the content as: Ready, Needs Revision, or Major Issues.',
    },
  });
  const artifactNodes = newNodes.filter((n) => n.data.category === 'artifact');
  artifactNodes.forEach((a) => {
    newEdges.push(createStyledEdge(a.id, revId, 'validates', { animated: true }));
  });
  newEvents.push({
    id: uidFn(),
    type: 'created',
    message: 'Review gate added for quality control',
    timestamp: Date.now(),
    nodeId: revId,
    agent: true,
  });
  col++;

  // ── CID Monitor ──
  const propId = uidFn();
  newNodes.push({
    id: propId,
    type: 'lifecycleNode',
    position: { x: col * COL_GAP, y: 80 },
    data: {
      label: 'CID: Monitor',
      category: 'cid',
      status: 'active',
      description: 'Monitors for changes and triggers propagation',
      version: 1,
      lastUpdated: Date.now(),
    },
  });
  newEdges.push(createStyledEdge(revId, propId, 'monitors', { dashed: true }));
  newEvents.push({
    id: uidFn(),
    type: 'created',
    message: 'CID monitoring node activated',
    timestamp: Date.now(),
    nodeId: propId,
    agent: true,
  });
  col++;

  // ── Output node ──
  const outputId = uidFn();
  const outputData: NodeData = {
    label: 'Final Output',
    category: 'output',
    status: 'pending',
    description: 'Deliverables, reports, or deployable results',
    version: 1,
    lastUpdated: Date.now(),
  };

  if (intent.outputFormat) {
    outputData.label = `Export as ${intent.outputFormat.label}`;
    outputData.description = `Download final deliverable as ${intent.outputFormat.label} file`;
    outputData.serviceIcon = intent.outputFormat.icon;
    outputData.outputFormat = intent.outputFormat.format;
    outputData.outputMimeType = intent.outputFormat.mimeType;
    outputData.outputFormatLabel = intent.outputFormat.label;
  } else if (intent.outputService) {
    outputData.label = `Export to ${intent.outputService.name}`;
    outputData.description = `Export final deliverable to ${intent.outputService.name}`;
    outputData.serviceName = intent.outputService.name;
    outputData.serviceIcon = intent.outputService.icon;
  } else if (intent.transformation) {
    outputData.label = `${intent.transformation} Output`;
    outputData.description = `Final ${intent.transformation.toLowerCase()} ready for delivery`;
  }

  newNodes.push({
    id: outputId,
    type: 'lifecycleNode',
    position: { x: col * COL_GAP, y: 80 },
    data: outputData,
  });
  newEdges.push(createStyledEdge(propId, outputId, 'outputs'));
  newEvents.push({
    id: uidFn(),
    type: 'created',
    message: `${outputData.label} node created`,
    timestamp: Date.now(),
    nodeId: outputId,
    agent: true,
  });

  return { nodes: newNodes, edges: newEdges, events: newEvents };
}
