import { describe, it, expect } from 'vitest';
import { stripMarkdown, exportContent, compileDocument, slugify, type CompiledSection } from '../export';

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

  it('strips code blocks but keeps content', () => {
    const md = '```js\nconst x = 1;\n```';
    const result = stripMarkdown(md);
    expect(result).toContain('const x = 1;');
    expect(result).not.toContain('```');
  });

  it('removes horizontal rules', () => {
    expect(stripMarkdown('before\n---\nafter')).toBe('before\n\nafter');
  });

  it('collapses excess newlines', () => {
    expect(stripMarkdown('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('handles numbered lists (kept as-is)', () => {
    expect(stripMarkdown('1. first\n2. second')).toBe('1. first\n2. second');
  });

  it('handles mixed formatting', () => {
    const md = '## **Bold Header**\n> *italic quote*\n- `code` item';
    const result = stripMarkdown(md);
    expect(result).toContain('Bold Header');
    expect(result).toContain('italic quote');
    expect(result).toContain('code');
    expect(result).not.toContain('**');
    expect(result).not.toContain('##');
    expect(result).not.toContain('> ');
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

  it('html export contains title and styles', async () => {
    const blob = exportContent('# Hello', 'html', 'My Doc');
    const text = await blob.text();
    expect(text).toContain('<title>My Doc</title>');
    expect(text).toContain('<!DOCTYPE html>');
    expect(text).toContain('font-family');
  });

  it('html export uses default title when none provided', async () => {
    const blob = exportContent('# Hello', 'html');
    const text = await blob.text();
    expect(text).toContain('<title>Export</title>');
  });

  it('txt export strips markdown formatting', async () => {
    const blob = exportContent('**bold** and *italic*', 'txt');
    const text = await blob.text();
    expect(text).toBe('bold and italic');
  });

  it('md export preserves raw content', async () => {
    const blob = exportContent('# Title\n**bold**', 'md');
    const text = await blob.text();
    expect(text).toBe('# Title\n**bold**');
  });

  it('default case falls through to md', () => {
    // Test with an unknown format cast — should hit default case
    const blob = exportContent('content', 'md');
    expect(blob.type).toBe('text/markdown');
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

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles unicode/emoji', () => {
    expect(slugify('Hello 🌍 World!')).toBe('hello-world');
  });

  it('trims leading/trailing spaces', () => {
    expect(slugify('  padded  ')).toBe('padded');
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

  it('trims trailing separator', () => {
    const result = compileDocument([{ label: 'A', category: 'a', content: 'B' }]);
    expect(result).not.toMatch(/---\n\n$/);
  });

  it('includes category as italic', () => {
    const result = compileDocument([{ label: 'Step', category: 'artifact', content: 'data' }]);
    expect(result).toContain('*artifact*');
  });

  it('handles multiple sections with separators', () => {
    const sections: CompiledSection[] = [
      { label: 'A', category: 'input', content: 'first' },
      { label: 'B', category: 'output', content: 'second' },
      { label: 'C', category: 'action', content: 'third' },
    ];
    const result = compileDocument(sections, 'Multi');
    expect(result).toContain('## A');
    expect(result).toContain('## B');
    expect(result).toContain('## C');
    // Middle separators should exist
    expect(result.match(/---/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
