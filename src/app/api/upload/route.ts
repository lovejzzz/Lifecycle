import { NextRequest, NextResponse } from 'next/server';
import { parseDocument, chunkDocument, detectFileType } from '@/lib/docparse';

/**
 * POST /api/upload — multipart file upload with document parsing.
 *
 * Accepts a single file (form field "file") and returns:
 *   - text: full extracted text
 *   - type: detected file type
 *   - pageCount: number of pages (PDF only)
 *   - sections: detected sections with titles and content
 *   - tokenEstimate: approximate token count
 *   - chunks: token-aware chunks if document exceeds 8000 tokens
 *
 * Max file size: 10MB. Supported formats: PDF, DOCX, TXT/MD/CSV.
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const CHUNK_THRESHOLD = 8000; // tokens

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        {
          error: 'missing_file',
          message: 'No file uploaded. Include a "file" field in multipart form data.',
        },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: 'file_too_large',
          message: `File exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
        },
        { status: 400 },
      );
    }

    // Validate file type
    const fileType = detectFileType(file.name);
    if (fileType === 'unknown') {
      return NextResponse.json(
        {
          error: 'unsupported_type',
          message: `Unsupported file type: ${file.name}. Supported: PDF, DOCX, TXT, MD, CSV`,
        },
        { status: 400 },
      );
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse document
    const parsed = await parseDocument(buffer, file.name);

    // Chunk if large
    const chunks = parsed.tokenEstimate > CHUNK_THRESHOLD ? chunkDocument(parsed.text) : undefined;

    console.log(
      `[Upload] ${file.name} (${fileType}) — ${parsed.text.length} chars, ~${parsed.tokenEstimate} tokens, ` +
        `${parsed.sections.length} sections${chunks ? `, ${chunks.length} chunks` : ''}`,
    );

    return NextResponse.json({
      filename: file.name,
      type: parsed.type,
      pageCount: parsed.pageCount,
      text: parsed.text,
      sections: parsed.sections,
      tokenEstimate: parsed.tokenEstimate,
      ...(chunks ? { chunks } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Upload] Parse error:', message);
    return NextResponse.json(
      { error: 'parse_error', message: `Failed to parse document: ${message}` },
      { status: 500 },
    );
  }
}
