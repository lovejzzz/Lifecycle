/**
 * Rich Output Export — format converters and download helpers.
 * Pure functions, no store dependency.
 */

import { markdownToHTML } from '@/lib/graph';

export type ExportFormat = 'md' | 'html' | 'txt';

/**
 * Strip markdown formatting to produce plain text.
 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')         // headers
    .replace(/\*\*(.+?)\*\*/g, '$1')     // bold
    .replace(/\*(.+?)\*/g, '$1')         // italic
    .replace(/`([^`]+)`/g, '$1')         // inline code
    .replace(/```[\s\S]*?```/g, (m) =>   // code blocks — keep content
      m.replace(/```\w*\n?/g, '').replace(/```/g, ''))
    .replace(/^[-*]\s+/gm, '• ')         // bullets
    .replace(/^\d+\.\s+/gm, (m) => m)    // numbered lists (keep as-is)
    .replace(/^>\s+/gm, '')              // blockquotes
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^---$/gm, '')              // horizontal rules
    .replace(/\n{3,}/g, '\n\n')          // collapse extra newlines
    .trim();
}

const HTML_STYLES = `body{font-family:'Georgia','Times New Roman',serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.8;color:#1a1a1a}
h1{font-size:28px;border-bottom:2px solid #333;padding-bottom:8px}h2{font-size:22px;margin-top:30px;color:#333}h3{font-size:18px;color:#555}
p{margin:10px 0}ul,ol{margin:10px 0 10px 20px}li{margin:4px 0}
code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:14px}
pre{background:#f4f4f4;padding:16px;border-radius:6px;overflow-x:auto}
blockquote{border-left:4px solid #ddd;margin:16px 0;padding:8px 16px;color:#666}
hr{border:none;border-top:1px solid #ddd;margin:24px 0}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f4f4f4}`;

/**
 * Convert markdown to a Blob in the specified format.
 */
export function exportContent(content: string, format: ExportFormat, title?: string): Blob {
  switch (format) {
    case 'html': {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title || 'Export'}</title><style>${HTML_STYLES}</style></head><body>${markdownToHTML(content)}</body></html>`;
      return new Blob([html], { type: 'text/html' });
    }
    case 'txt':
      return new Blob([stripMarkdown(content)], { type: 'text/plain' });
    case 'md':
    default:
      return new Blob([content], { type: 'text/markdown' });
  }
}

/**
 * Trigger a browser file download.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Slugify a label for use in filenames.
 */
export function slugify(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

/**
 * Export content and trigger download in one call.
 */
export function exportAndDownload(
  content: string,
  format: ExportFormat,
  label: string,
): void {
  const blob = exportContent(content, format, label);
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `${slugify(label)}-${date}.${format}`);
}

export interface CompiledSection {
  label: string;
  category: string;
  content: string;
}

/**
 * Compile multiple node results into a single document.
 * Sections are ordered as provided (typically topological order).
 */
export function compileDocument(sections: CompiledSection[], title?: string): string {
  const heading = title || 'Compiled Workflow Output';
  const date = new Date().toISOString().slice(0, 10);

  const lines = [`# ${heading}`, `*Compiled: ${date}*`, ''];

  for (const section of sections) {
    lines.push(`## ${section.label}`);
    lines.push(`*${section.category}*`);
    lines.push('');
    lines.push(section.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n').replace(/\n---\n\n$/, '\n'); // trim trailing separator
}
