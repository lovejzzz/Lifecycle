import { describe, it, expect } from 'vitest';
import { stripMarkdown, exportContent, compileDocument, slugify } from '../export';

describe('stripMarkdown', () => {
  it('removes headers', () => {
    expect(stripMarkdown('# Hello\n## World')).toBe('Hello\nWorld');
  });

  it('removes bold and italic', () => {
    expect(stripMarkdown('**bold** and *italic*')).toBe('bold and italic');
  });

  it('removes inline code', () => {
    expect(stripMarkdown('use `npm install`')).toBe('use npm install');
  });

  it('converts bullets', () => {
    expect(stripMarkdown('- item one\n- item two')).toBe('• item one\n• item two');
  });

  it('removes links but keeps text', () => {
    expect(stripMarkdown('[click here](http://example.com)')).toBe('click here');
  });

  it('removes blockquote markers', () => {
    expect(stripMarkdown('> a quote')).toBe('a quote');
  });

  it('handles empty string', () => {
    expect(stripMarkdown('')).toBe('');
  });
});

describe('exportContent', () => {
  it('exports markdown as blob', () => {
    const blob = exportContent('# Title', 'md');
    expect(blob.type).toBe('text/markdown');
  });

  it('exports HTML as blob', () => {
    const blob = exportContent('# Title', 'html');
    expect(blob.type).toBe('text/html');
  });

  it('exports plain text as blob', () => {
    const blob = exportContent('# Title', 'txt');
    expect(blob.type).toBe('text/plain');
  });
});

describe('slugify', () => {
  it('converts to lowercase kebab', () => {
    expect(slugify('My Output Node')).toBe('my-output-node');
  });

  it('strips special characters', () => {
    expect(slugify('Test! @#Node')).toBe('test-node');
  });

  it('collapses multiple spaces', () => {
    expect(slugify('a   b   c')).toBe('a-b-c');
  });
});

describe('compileDocument', () => {
  it('compiles sections into markdown', () => {
    const sections = [
      { label: 'Input', category: 'input', content: 'User request' },
      { label: 'Analysis', category: 'action', content: 'Analyzed the request' },
    ];
    const result = compileDocument(sections, 'Test Output');
    expect(result).toContain('# Test Output');
    expect(result).toContain('## Input');
    expect(result).toContain('User request');
    expect(result).toContain('## Analysis');
    expect(result).toContain('Analyzed the request');
  });

  it('uses default title if none provided', () => {
    const result = compileDocument([{ label: 'A', category: 'a', content: 'B' }]);
    expect(result).toContain('# Compiled Workflow Output');
  });

  it('returns minimal output for empty sections', () => {
    const result = compileDocument([]);
    expect(result).toContain('# Compiled Workflow Output');
  });

  it('includes date', () => {
    const result = compileDocument([{ label: 'A', category: 'a', content: 'B' }]);
    const today = new Date().toISOString().slice(0, 10);
    expect(result).toContain(today);
  });
});
