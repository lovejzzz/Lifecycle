import { describe, it, expect } from 'vitest';
import { analyzeIntent } from '../intent';

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
});
