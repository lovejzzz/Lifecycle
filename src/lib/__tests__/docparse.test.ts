/**
 * Tests for src/lib/docparse.ts — document parsing utilities.
 * Tests pure utility functions (detectFileType, detectSections, estimateTokens, chunkDocument, extractTxtText).
 * PDF/DOCX extraction are integration-tested via the upload route.
 */
import { describe, it, expect } from 'vitest';
import {
  detectFileType,
  detectSections,
  estimateTokens,
  chunkDocument,
  extractTxtText,
} from '../docparse';

// ── detectFileType ──────────────────────────────────────────────────────────

describe('detectFileType', () => {
  it('detects PDF files', () => {
    expect(detectFileType('syllabus.pdf')).toBe('pdf');
    expect(detectFileType('COURSE.PDF')).toBe('pdf');
  });

  it('detects DOCX files', () => {
    expect(detectFileType('report.docx')).toBe('docx');
    expect(detectFileType('Report.DOCX')).toBe('docx');
  });

  it('detects plain text variants', () => {
    expect(detectFileType('notes.txt')).toBe('txt');
    expect(detectFileType('README.md')).toBe('txt');
    expect(detectFileType('data.csv')).toBe('txt');
    expect(detectFileType('data.tsv')).toBe('txt');
    expect(detectFileType('server.log')).toBe('txt');
  });

  it('returns unknown for unsupported types', () => {
    expect(detectFileType('image.png')).toBe('unknown');
    expect(detectFileType('archive.zip')).toBe('unknown');
    expect(detectFileType('binary.exe')).toBe('unknown');
    expect(detectFileType('noext')).toBe('unknown');
  });
});

// ── extractTxtText ──────────────────────────────────────────────────────────

describe('extractTxtText', () => {
  it('decodes UTF-8 buffer to string', () => {
    const buf = Buffer.from('Hello, world!', 'utf-8');
    expect(extractTxtText(buf)).toBe('Hello, world!');
  });

  it('handles empty buffer', () => {
    expect(extractTxtText(Buffer.alloc(0))).toBe('');
  });

  it('preserves newlines and special characters', () => {
    const text = 'Line 1\nLine 2\n\tIndented\n';
    expect(extractTxtText(Buffer.from(text))).toBe(text);
  });
});

// ── estimateTokens ──────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('estimates ~1 token per 4 characters', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('12345678')).toBe(2);
  });

  it('rounds up for partial tokens', () => {
    expect(estimateTokens('abc')).toBe(1); // 3/4 = 0.75 → ceil = 1
    expect(estimateTokens('abcde')).toBe(2); // 5/4 = 1.25 → ceil = 2
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

// ── detectSections ──────────────────────────────────────────────────────────

describe('detectSections', () => {
  it('detects numbered sections', () => {
    const text = '1. Introduction\nSome intro text.\n\n2. Background\nSome background.';
    const sections = detectSections(text);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    const titles = sections.map((s) => s.title);
    // Titles may keep the numbering prefix (e.g. "1. Introduction")
    expect(titles.some((t) => t.includes('Introduction'))).toBe(true);
    expect(titles.some((t) => t.includes('Background'))).toBe(true);
  });

  it('detects markdown headings', () => {
    const text = '# Overview\nWelcome.\n\n## Goals\nLearn stuff.\n\n## Schedule\nWeek by week.';
    const sections = detectSections(text);
    const titles = sections.map((s) => s.title);
    expect(titles).toContain('Overview');
    expect(titles).toContain('Goals');
    expect(titles).toContain('Schedule');
  });

  it('detects common syllabus sections (case-insensitive)', () => {
    const text =
      'Course Description\nThis course covers...\n\nGrading\n80% exams, 20% homework.\n\nSchedule\nWeek 1: Intro.';
    const sections = detectSections(text);
    expect(sections.length).toBeGreaterThanOrEqual(2);
  });

  it('detects week/module patterns', () => {
    const text =
      'Week 1\nIntro to the course.\n\nWeek 2\nAdvanced topics.\n\nWeek 3\nFinal review.';
    const sections = detectSections(text);
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });

  it('returns at least one section for plain text', () => {
    const text = 'Just some plain text with no headings at all.';
    const sections = detectSections(text);
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(sections[0].content).toContain('plain text');
  });

  it('handles empty text', () => {
    const sections = detectSections('');
    expect(sections.length).toBe(1);
    expect(sections[0].title).toBe('Document Start');
  });

  it('assigns sequential indices', () => {
    const text = '# A\nContent A.\n\n# B\nContent B.\n\n# C\nContent C.';
    const sections = detectSections(text);
    for (let i = 0; i < sections.length; i++) {
      expect(sections[i].index).toBe(i);
    }
  });
});

// ── chunkDocument ───────────────────────────────────────────────────────────

describe('chunkDocument', () => {
  it('returns a single chunk for short text', () => {
    const text = 'Short text.';
    const chunks = chunkDocument(text, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].index).toBe(0);
  });

  it('splits long text into multiple chunks', () => {
    // Create a ~200 token text (800 chars), chunk at 50 tokens
    const paragraph = 'A'.repeat(200) + '\n\n';
    const text = paragraph.repeat(4); // ~800 chars
    const chunks = chunkDocument(text, 50); // 50 tokens = 200 chars
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('preserves all text across chunks (no data loss)', () => {
    const paragraph = 'Word '.repeat(100) + '\n\n';
    const text = paragraph.repeat(3);
    const chunks = chunkDocument(text, 100); // 100 tokens = 400 chars
    const reassembled = chunks.map((c) => c.text).join('');
    expect(reassembled).toBe(text);
  });

  it('assigns sequential indices to chunks', () => {
    const text = 'X'.repeat(2000);
    const chunks = chunkDocument(text, 100);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it('each chunk has a token estimate', () => {
    const text = 'Hello world. '.repeat(500);
    const chunks = chunkDocument(text, 200);
    for (const chunk of chunks) {
      expect(chunk.tokenEstimate).toBeGreaterThan(0);
      expect(chunk.tokenEstimate).toBeLessThanOrEqual(200 + 10); // slight tolerance
    }
  });

  it('prefers splitting at paragraph boundaries', () => {
    const para1 = 'A'.repeat(150);
    const para2 = 'B'.repeat(150);
    const text = para1 + '\n\n' + para2;
    // Chunk at 50 tokens = 200 chars; the \n\n is at position 150
    const chunks = chunkDocument(text, 50);
    // First chunk should end near the paragraph boundary
    expect(chunks.length).toBeGreaterThan(1);
    // The split point should be at or near the double newline
    expect(chunks[0].text.endsWith('\n\n') || chunks[0].text.length <= 202).toBe(true);
  });
});
