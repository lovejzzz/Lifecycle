/**
 * Document Parsing Utilities — extract text from PDF, DOCX, and TXT files.
 * Server-side only (used in /api/upload route).
 *
 * Supports:
 *   - PDF  → pdf-parse v2 (PDFParse class)
 *   - DOCX → mammoth (extractRawText)
 *   - TXT  → direct UTF-8 decode
 *
 * Also includes section detection and token-aware chunking for large documents.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface ParsedDocument {
  /** Full extracted text */
  text: string;
  /** Detected file type */
  type: 'pdf' | 'docx' | 'txt' | 'unknown';
  /** Number of pages (PDF only, 0 for others) */
  pageCount: number;
  /** Detected sections/headings with their content */
  sections: DocumentSection[];
  /** Approximate token count (chars / 4) */
  tokenEstimate: number;
}

export interface DocumentSection {
  /** Section heading or label */
  title: string;
  /** Section content (without heading) */
  content: string;
  /** 0-based index in the document */
  index: number;
  /** Approximate start character offset */
  offset: number;
}

export interface DocumentChunk {
  /** Chunk text */
  text: string;
  /** 0-based chunk index */
  index: number;
  /** Approximate token count */
  tokenEstimate: number;
}

// ── File type detection ─────────────────────────────────────────────────────

/**
 * Detect file type from filename extension.
 */
export function detectFileType(filename: string): 'pdf' | 'docx' | 'txt' | 'unknown' {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (['txt', 'md', 'csv', 'tsv', 'log'].includes(ext)) return 'txt';
  return 'unknown';
}

// ── Text extraction ─────────────────────────────────────────────────────────

/**
 * Extract text from a PDF buffer using pdf-parse v2.
 */
export async function extractPdfText(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  // Dynamic import to avoid bundling in client
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  return {
    text: result.text,
    pageCount: result.total,
  };
}

/**
 * Extract text from a DOCX buffer using mammoth.
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  // Dynamic import — mammoth has no types, hence the any cast
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = await import('mammoth') as any;
  const result = await mammoth.extractRawText({ buffer });
  return result.value as string;
}

/**
 * Extract text from a plain text buffer.
 */
export function extractTxtText(buffer: Buffer): string {
  return buffer.toString('utf-8');
}

// ── Section detection ───────────────────────────────────────────────────────

// Common heading patterns in academic/professional documents
const SECTION_PATTERNS = [
  // Numbered sections: "1. Introduction", "1.1 Background", "Chapter 1:"
  /^(?:chapter\s+)?\d+(?:\.\d+)*[.:\s]+\s*\S/im,
  // ALL CAPS headings: "INTRODUCTION", "COURSE OVERVIEW"
  /^[A-Z][A-Z\s]{2,}[A-Z]$/m,
  // Markdown headings: "# Title", "## Section"
  /^#{1,6}\s+\S/m,
  // Common document sections
  /^(?:abstract|introduction|background|overview|objectives|learning outcomes|schedule|syllabus|grading|assignments?|readings?|policies|resources|bibliography|references|appendix|conclusion|summary|requirements|prerequisites|materials|assessment|evaluation|description|course\s+(?:description|overview|objectives|schedule|policies))\s*[:.]?\s*$/im,
  // Week/Unit/Module patterns in syllabi
  /^(?:week|unit|module|lesson|session|class|lecture|topic)\s+\d+/im,
];

/**
 * Detect section boundaries in extracted text.
 * Returns sections with titles and content.
 */
export function detectSections(text: string): DocumentSection[] {
  const lines = text.split('\n');
  const sections: DocumentSection[] = [];
  let currentTitle = 'Document Start';
  let currentContent: string[] = [];
  let currentOffset = 0;
  let sectionStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const offset = currentOffset;
    currentOffset += lines[i].length + 1; // +1 for newline

    if (!line) {
      currentContent.push('');
      continue;
    }

    // Check if this line looks like a section heading
    const isHeading = line.length < 120 && SECTION_PATTERNS.some(p => p.test(line));

    if (isHeading && (currentContent.length > 0 || sections.length === 0)) {
      // Save previous section if it has content
      const content = currentContent.join('\n').trim();
      if (content || sections.length === 0) {
        sections.push({
          title: currentTitle,
          content,
          index: sections.length,
          offset: sectionStart,
        });
      }
      currentTitle = line.replace(/^#+\s*/, '').replace(/[:.]$/, '').trim();
      currentContent = [];
      sectionStart = offset;
    } else {
      currentContent.push(line);
    }
  }

  // Push final section
  const finalContent = currentContent.join('\n').trim();
  if (finalContent || sections.length === 0) {
    sections.push({
      title: currentTitle,
      content: finalContent,
      index: sections.length,
      offset: sectionStart,
    });
  }

  return sections;
}

// ── Token estimation and chunking ───────────────────────────────────────────

/**
 * Estimate token count from text (rough: 1 token ~ 4 characters).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks that fit within a token budget.
 * Tries to split on section boundaries first, then paragraphs, then sentences.
 *
 * @param text Full document text
 * @param maxTokensPerChunk Maximum tokens per chunk (default: 8000)
 * @returns Array of chunks with metadata
 */
export function chunkDocument(text: string, maxTokensPerChunk = 8000): DocumentChunk[] {
  const maxChars = maxTokensPerChunk * 4;

  if (text.length <= maxChars) {
    return [{
      text,
      index: 0,
      tokenEstimate: estimateTokens(text),
    }];
  }

  const chunks: DocumentChunk[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push({
        text: remaining,
        index: chunks.length,
        tokenEstimate: estimateTokens(remaining),
      });
      break;
    }

    // Find a good split point within the budget
    let splitAt = maxChars;

    // Try to split at a paragraph boundary (double newline)
    const paraBreak = remaining.lastIndexOf('\n\n', maxChars);
    if (paraBreak > maxChars * 0.5) {
      splitAt = paraBreak + 2;
    } else {
      // Try single newline
      const lineBreak = remaining.lastIndexOf('\n', maxChars);
      if (lineBreak > maxChars * 0.5) {
        splitAt = lineBreak + 1;
      } else {
        // Try sentence boundary
        const sentenceEnd = remaining.lastIndexOf('. ', maxChars);
        if (sentenceEnd > maxChars * 0.5) {
          splitAt = sentenceEnd + 2;
        }
      }
    }

    chunks.push({
      text: remaining.slice(0, splitAt),
      index: chunks.length,
      tokenEstimate: estimateTokens(remaining.slice(0, splitAt)),
    });
    remaining = remaining.slice(splitAt);
  }

  return chunks;
}

// ── Main parse function ─────────────────────────────────────────────────────

/**
 * Parse a document buffer into structured text with sections.
 * Detects file type from filename, extracts text, finds sections.
 *
 * @param buffer Raw file buffer
 * @param filename Original filename (used for type detection)
 * @returns ParsedDocument with text, sections, and metadata
 */
export async function parseDocument(buffer: Buffer, filename: string): Promise<ParsedDocument> {
  const type = detectFileType(filename);
  let text = '';
  let pageCount = 0;

  switch (type) {
    case 'pdf': {
      const result = await extractPdfText(buffer);
      text = result.text;
      pageCount = result.pageCount;
      break;
    }
    case 'docx':
      text = await extractDocxText(buffer);
      break;
    case 'txt':
      text = extractTxtText(buffer);
      break;
    default:
      // Try as plain text
      text = extractTxtText(buffer);
      break;
  }

  const sections = detectSections(text);
  const tokenEstimate = estimateTokens(text);

  return { text, type, pageCount, sections, tokenEstimate };
}
