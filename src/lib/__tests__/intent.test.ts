import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeIntent, buildNodesFromPrompt, detectMultipleTransformations } from '../intent';

describe('analyzeIntent', () => {
  it('detects Slack input service', () => {
    const result = analyzeIntent('Build a Slack bot that monitors channels');
    expect(result.inputService?.name).toBe('Slack');
  });

  it('detects Google Docs input', () => {
    const result = analyzeIntent('Take my Google Docs and create a summary');
    expect(result.inputService?.name).toBe('Google Docs');
  });

  it('detects email transformation', () => {
    const result = analyzeIntent('Draft an email to the team about the update');
    expect(result.transformation).toBe('Email Draft');
  });

  it('detects file upload intent', () => {
    const result = analyzeIntent('Upload a PDF and convert it to a lesson plan');
    expect(result.fileInput).not.toBeNull();
    expect(result.transformation).toBe('Lesson Plan');
  });

  it('detects summary transformation', () => {
    const result = analyzeIntent('Summarize this document');
    expect(result.transformation).toBe('Summary');
  });

  it('detects output format', () => {
    const result = analyzeIntent('Create a report and export to pdf');
    expect(result.outputFormat?.format).toBe('pdf');
  });

  it('detects source type for video', () => {
    const result = analyzeIntent('Take this video and create a transcript');
    expect(result.sourceType).toBe('video');
    expect(result.transformation).toBe('Transcript');
  });

  it('handles generic prompts gracefully', () => {
    const result = analyzeIntent('Build a content pipeline');
    expect(result.inputService).toBeNull();
    expect(result.outputService).toBeNull();
  });

  it('detects multiple signals in complex prompt', () => {
    const result = analyzeIntent('Import from Notion and create a course syllabus');
    expect(result.inputService?.name).toBe('Notion');
    expect(result.transformation).toBe('Course Syllabus');
  });

  it('returns null services for ambiguous prompts', () => {
    const result = analyzeIntent('Help me organize my thoughts');
    expect(result.inputService).toBeNull();
    expect(result.fileInput).toBeNull();
  });

  // Uncovered branch: shared link fallback → URL service (line 89)
  it('detects shared link as URL input', () => {
    const result = analyzeIntent('Use the shared link to import data');
    expect(result.inputService?.name).toBe('URL');
  });

  // Uncovered branch: generic upload fallback (line 116)
  it('detects generic upload without specific file type', () => {
    const result = analyzeIntent('Upload a file and process it');
    expect(result.fileInput).not.toBeNull();
    expect(result.fileInput!.label).toBe('File Upload');
  });

  it('detects output service from export-to pattern', () => {
    const result = analyzeIntent('Create a summary and export to Google Sheets');
    expect(result.outputService?.name).toBe('Google Sheets');
  });

  it('infers document source type from Google Docs', () => {
    const result = analyzeIntent('Pull from Google Docs');
    expect(result.sourceType).toBe('document');
  });

  it('infers spreadsheet source type from Airtable', () => {
    const result = analyzeIntent('Import from Airtable and analyze');
    expect(result.sourceType).toBe('spreadsheet');
  });

  it('infers design source type from Figma', () => {
    const result = analyzeIntent('Grab from Figma and create a spec');
    expect(result.sourceType).toBe('design');
  });

  it('infers video source type from YouTube', () => {
    const result = analyzeIntent('Pull from YouTube and transcribe');
    expect(result.sourceType).toBe('video');
  });

  it('creates document fileInput when sourceType is document but no service', () => {
    const result = analyzeIntent('Take this document and summarize it');
    expect(result.sourceType).toBe('document');
    expect(result.fileInput).not.toBeNull();
    expect(result.fileInput!.label).toBe('Document Upload');
  });

  it('detects output format from convert-to pattern', () => {
    const result = analyzeIntent('Convert to json and download');
    expect(result.outputFormat?.format).toBe('json');
  });

  it('detects image file type', () => {
    const result = analyzeIntent('Upload an image and analyze it');
    expect(result.fileInput).not.toBeNull();
    expect(result.fileInput!.types).toContain('.png');
  });

  it('detects audio file type', () => {
    const result = analyzeIntent('Process this audio recording');
    expect(result.fileInput).not.toBeNull();
    expect(result.fileInput!.types).toContain('.mp3');
  });

  it('detects code file type', () => {
    const result = analyzeIntent('Upload source code for review');
    expect(result.fileInput).not.toBeNull();
    expect(result.fileInput!.types).toContain('.ts');
  });

  it('detects various transformation targets', () => {
    expect(analyzeIntent('Create a blog post').transformation).toBe('Blog Post');
    expect(analyzeIntent('Build a roadmap').transformation).toBe('Roadmap');
    expect(analyzeIntent('Write documentation').transformation).toBe('Documentation');
    expect(analyzeIntent('Create a proposal').transformation).toBe('Proposal');
    expect(analyzeIntent('Generate a quiz').transformation).toBe('Assessment');
    expect(analyzeIntent('Make flashcard sets').transformation).toBe('Flashcards');
    expect(analyzeIntent('Write a pitch deck').transformation).toBe('Pitch Deck');
    expect(analyzeIntent('Plan the budget').transformation).toBe('Budget Plan');
    expect(analyzeIntent('Create a design brief').transformation).toBe('Design Brief');
    expect(analyzeIntent('Write a PRD').transformation).toBe('PRD');
  });
});

// ─── buildNodesFromPrompt ────────────────────────────────────────────────────

describe('buildNodesFromPrompt', () => {
  let counter: number;
  const uidFn = () => `node-${++counter}`;
  const logFn = () => {};

  beforeEach(() => {
    counter = 0;
  });

  it('builds basic workflow with input, state, artifacts, review, monitor, output', () => {
    const { nodes, edges, events } = buildNodesFromPrompt('Build a content pipeline', uidFn, logFn);
    expect(nodes.length).toBeGreaterThanOrEqual(5);
    expect(edges.length).toBeGreaterThanOrEqual(4);
    expect(events.length).toBeGreaterThanOrEqual(5);

    const categories = nodes.map((n) => n.data.category);
    expect(categories).toContain('input');
    expect(categories).toContain('state');
    expect(categories).toContain('artifact');
    expect(categories).toContain('review');
    expect(categories).toContain('cid');
    expect(categories).toContain('output');
  });

  it('creates extraction node for service inputs', () => {
    const { nodes } = buildNodesFromPrompt('Import from Notion and make a summary', uidFn, logFn);
    const inputNode = nodes.find((n) => n.data.category === 'input');
    expect(inputNode!.data.label).toContain('Notion');
    expect(inputNode!.data.inputType).toBe('url');

    const extractNode = nodes.find(
      (n) => n.data.category === 'cid' && n.data.label.includes('Fetch'),
    );
    expect(extractNode).toBeDefined();
    expect(extractNode!.data.label).toContain('Notion');
  });

  it('creates extraction node for file inputs', () => {
    const { nodes } = buildNodesFromPrompt('Upload a PDF and create a lesson plan', uidFn, logFn);
    const inputNode = nodes.find((n) => n.data.category === 'input');
    expect(inputNode!.data.inputType).toBe('file');

    const extractNode = nodes.find((n) => n.data.label.includes('Parse'));
    expect(extractNode).toBeDefined();
  });

  it('creates document upload input for transform/parse prompts without service', () => {
    const { nodes } = buildNodesFromPrompt('Convert my files into a report', uidFn, logFn);
    const inputNode = nodes.find((n) => n.data.category === 'input');
    expect(inputNode!.data.inputType).toBe('file');
    expect(inputNode!.data.label).toBe('Document Upload');
  });

  it('creates research notes node for note-related prompts', () => {
    const { nodes } = buildNodesFromPrompt('Research ideas about AI', uidFn, logFn);
    const noteNode = nodes.find((n) => n.data.category === 'note');
    expect(noteNode).toBeDefined();
    expect(noteNode!.data.label).toBe('Research Notes');
  });

  it('generates lesson plan sections for education prompts', () => {
    const { nodes } = buildNodesFromPrompt('Create a lesson plan for biology', uidFn, logFn);
    const artifacts = nodes.filter((n) => n.data.category === 'artifact');
    const lessonPlan = artifacts.find((n) => n.data.label === 'Lesson Plan');
    expect(lessonPlan).toBeDefined();
    expect(lessonPlan!.data.sections!.length).toBe(5);
    expect(lessonPlan!.data.sections![0].title).toBe('Learning Objectives');
  });

  it('generates course syllabus sections', () => {
    const { nodes } = buildNodesFromPrompt('Build a course syllabus', uidFn, logFn);
    const syllabus = nodes.find((n) => n.data.label === 'Course Syllabus');
    expect(syllabus).toBeDefined();
    expect(syllabus!.data.sections!.length).toBe(4);
    expect(syllabus!.data.sections![1].title).toBe('Weekly Schedule');
  });

  it('generates learning objectives artifact for lesson prompts', () => {
    const { nodes } = buildNodesFromPrompt('Create a lesson plan with objectives', uidFn, logFn);
    const lo = nodes.find((n) => n.data.label === 'Learning Objectives');
    expect(lo).toBeDefined();
    expect(lo!.data.sections![0].title).toBe('Knowledge Goals');
  });

  it('generates fallback artifact names from meaningful words', () => {
    const { nodes } = buildNodesFromPrompt('Build a widget tracker system', uidFn, logFn);
    const artifacts = nodes.filter((n) => n.data.category === 'artifact');
    expect(artifacts.length).toBeGreaterThan(0);
    // Should derive names from meaningful words
    expect(artifacts.some((n) => n.data.label.includes('Document'))).toBe(true);
  });

  it('generates default artifact names for very generic prompts', () => {
    const { nodes } = buildNodesFromPrompt('Build this', uidFn, logFn);
    const artifacts = nodes.filter((n) => n.data.category === 'artifact');
    expect(artifacts.length).toBeGreaterThanOrEqual(2);
    expect(artifacts.some((n) => n.data.label === 'Core Document')).toBe(true);
  });

  it('sets output format when detected', () => {
    const { nodes } = buildNodesFromPrompt('Create a report and export to pdf', uidFn, logFn);
    const output = nodes.find((n) => n.data.category === 'output');
    expect(output!.data.outputFormat).toBe('pdf');
    expect(output!.data.label).toContain('PDF');
  });

  it('sets output service when detected', () => {
    const { nodes } = buildNodesFromPrompt(
      'Create a summary and send to Google Sheets',
      uidFn,
      logFn,
    );
    const output = nodes.find((n) => n.data.category === 'output');
    expect(output!.data.serviceName).toBe('Google Sheets');
    expect(output!.data.label).toContain('Google Sheets');
  });

  it('sets transformation-based output label', () => {
    const { nodes } = buildNodesFromPrompt('Create a blog post about React', uidFn, logFn);
    const output = nodes.find((n) => n.data.category === 'output');
    expect(output!.data.label).toContain('Blog Post');
  });

  it('connects all artifact nodes to review gate', () => {
    const { nodes, edges } = buildNodesFromPrompt(
      'Create a PRD and tech architecture',
      uidFn,
      logFn,
    );
    const artifacts = nodes.filter((n) => n.data.category === 'artifact');
    const review = nodes.find((n) => n.data.category === 'review');
    for (const a of artifacts) {
      expect(edges.some((e) => e.source === a.id && e.target === review!.id)).toBe(true);
    }
  });

  it('creates proper edge chain from input to output', () => {
    const { nodes, edges } = buildNodesFromPrompt('Build a workflow', uidFn, logFn);
    // Every non-input node should be a target of at least one edge
    const inputNode = nodes.find((n) => n.data.category === 'input');
    for (const n of nodes) {
      if (n.id === inputNode!.id) continue;
      expect(edges.some((e) => e.target === n.id)).toBe(true);
    }
  });

  it('detects PRD artifact via transformation', () => {
    const { nodes } = buildNodesFromPrompt('I need a PRD for this project', uidFn, logFn);
    const labels = nodes.filter((n) => n.data.category === 'artifact').map((n) => n.data.label);
    expect(labels).toContain('PRD');
  });

  it('detects specification artifact via transformation', () => {
    const { nodes } = buildNodesFromPrompt('Write a technical architecture spec', uidFn, logFn);
    const labels = nodes.filter((n) => n.data.category === 'artifact').map((n) => n.data.label);
    expect(labels).toContain('Specification');
  });

  it('detects marketing plan artifact via transformation', () => {
    const { nodes } = buildNodesFromPrompt('Create a marketing plan for launch', uidFn, logFn);
    const labels = nodes.filter((n) => n.data.category === 'artifact').map((n) => n.data.label);
    expect(labels).toContain('Marketing Plan');
  });

  it('detects budget artifact via transformation', () => {
    const { nodes } = buildNodesFromPrompt('Plan the budget for next quarter', uidFn, logFn);
    const labels = nodes.filter((n) => n.data.category === 'artifact').map((n) => n.data.label);
    expect(labels).toContain('Budget Plan');
  });

  it('generates multiple artifacts for comma-and-separated prompts', () => {
    const { nodes, edges } = buildNodesFromPrompt(
      'Create lesson plans, rubrics, and quizzes',
      uidFn,
      logFn,
    );
    const artifacts = nodes.filter((n) => n.data.category === 'artifact');
    const labels = artifacts.map((n) => n.data.label);
    expect(labels).toContain('Lesson Plan');
    expect(labels).toContain('Rubric');
    expect(labels).toContain('Assessment'); // "quizzes" maps to Assessment

    // All artifacts should connect to the state node upstream
    const stateNode = nodes.find((n) => n.data.category === 'state');
    for (const a of artifacts) {
      expect(edges.some((e) => e.source === stateNode!.id && e.target === a.id)).toBe(true);
    }

    // All artifacts should connect to the review gate downstream
    const review = nodes.find((n) => n.data.category === 'review');
    for (const a of artifacts) {
      expect(edges.some((e) => e.source === a.id && e.target === review!.id)).toBe(true);
    }
  });

  it('generates two artifacts for "and"-separated prompt', () => {
    const { nodes } = buildNodesFromPrompt('Build a blog post and email newsletter', uidFn, logFn);
    const artifacts = nodes.filter((n) => n.data.category === 'artifact');
    const labels = artifacts.map((n) => n.data.label);
    expect(labels).toContain('Blog Post');
    expect(labels).toContain('Email Draft');
  });

  it('still generates single artifact for simple prompt', () => {
    const { nodes } = buildNodesFromPrompt('Make a rubric', uidFn, logFn);
    const artifacts = nodes.filter((n) => n.data.category === 'artifact');
    const labels = artifacts.map((n) => n.data.label);
    expect(labels).toContain('Rubric');
    // Should also get Learning Objectives as education supplement
    expect(labels).toContain('Learning Objectives');
  });
});

// ─── detectMultipleTransformations ──────────────────────────────────────────

describe('detectMultipleTransformations', () => {
  it('detects three comma-and-separated artifacts', () => {
    const result = detectMultipleTransformations('create lesson plans, rubrics, and quizzes');
    expect(result).toContain('Lesson Plan');
    expect(result).toContain('Rubric');
    expect(result).toContain('Assessment');
    expect(result.length).toBe(3);
  });

  it('detects two "and"-separated artifacts', () => {
    const result = detectMultipleTransformations('build a blog post and Twitter thread');
    // "blog" matches Blog Post; "twitter thread" doesn't match any target
    expect(result).toContain('Blog Post');
  });

  it('returns single artifact for simple prompt', () => {
    const result = detectMultipleTransformations('make a rubric');
    expect(result).toEqual(['Rubric']);
  });

  it('returns empty array for unrecognized prompt', () => {
    const result = detectMultipleTransformations('do something random');
    expect(result).toEqual([]);
  });

  it('deduplicates when same target appears multiple times', () => {
    const result = detectMultipleTransformations('create a quiz and an exam and a test');
    // quiz, exam, test all map to Assessment
    expect(result).toEqual(['Assessment']);
  });

  it('detects mixed education and general artifacts', () => {
    const result = detectMultipleTransformations('generate a syllabus, a summary, and a rubric');
    expect(result).toContain('Course Syllabus');
    expect(result).toContain('Summary');
    expect(result).toContain('Rubric');
    expect(result.length).toBe(3);
  });

  it('handles prompt with email and presentation', () => {
    const result = detectMultipleTransformations('draft an email and a presentation');
    expect(result).toContain('Email Draft');
    expect(result).toContain('Presentation');
    expect(result.length).toBe(2);
  });
});

// ─── analyzeIntent transformations field ────────────────────────────────────

describe('analyzeIntent transformations field', () => {
  it('populates transformations array for multi-artifact prompt', () => {
    const result = analyzeIntent('create lesson plans, rubrics, and quizzes');
    expect(result.transformations).toContain('Lesson Plan');
    expect(result.transformations).toContain('Rubric');
    expect(result.transformations).toContain('Assessment');
    // transformation (singular) still returns the first match
    expect(result.transformation).toBe('Lesson Plan');
  });

  it('populates transformations array for single-artifact prompt', () => {
    const result = analyzeIntent('make a rubric');
    expect(result.transformations).toEqual(['Rubric']);
    expect(result.transformation).toBe('Rubric');
  });

  it('returns empty transformations for unrecognized prompt', () => {
    const result = analyzeIntent('help me organize my thoughts');
    expect(result.transformations).toEqual([]);
    expect(result.transformation).toBeNull();
  });
});
