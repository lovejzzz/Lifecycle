'use client';

import React from 'react';

// ─── Shared Markdown Renderer ─────────────────────────────────────────────────
// Extracted from CIDPanel for reuse in ArtifactPanel and other components.

export function inlineFormat(
  text: string,
  nodeNames?: Map<string, string>,
  onNodeClick?: (id: string) => void,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^([\s\S]*?)`([^`]+)`([\s\S]*)/);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<React.Fragment key={key++}>{codeMatch[1]}</React.Fragment>);
      parts.push(<code key={key++} className="bg-white/[0.08] px-1 py-px rounded text-[10px] font-mono text-cyan-300/80">{codeMatch[2]}</code>);
      remaining = codeMatch[3];
      continue;
    }
    // Markdown link [text](url)
    const linkMatch = remaining.match(/^([\s\S]*?)\[([^\]]+)\]\((https?:\/\/[^)]+)\)([\s\S]*)/);
    if (linkMatch) {
      if (linkMatch[1]) parts.push(<React.Fragment key={key++}>{linkMatch[1]}</React.Fragment>);
      parts.push(<a key={key++} href={linkMatch[3]} target="_blank" rel="noopener noreferrer" className="text-cyan-400/80 hover:text-cyan-300 underline underline-offset-2 decoration-cyan-400/30">{linkMatch[2]}</a>);
      remaining = linkMatch[4];
      continue;
    }
    // Bold
    const boldMatch = remaining.match(/^([\s\S]*?)\*\*([^*]+)\*\*([\s\S]*)/);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<React.Fragment key={key++}>{boldMatch[1]}</React.Fragment>);
      parts.push(<strong key={key++} className="font-semibold text-white/85">{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }
    // Italic (single * or _)
    const italicMatch = remaining.match(/^([\s\S]*?)(?:\*([^*]+)\*|_([^_]+)_)([\s\S]*)/);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<React.Fragment key={key++}>{italicMatch[1]}</React.Fragment>);
      parts.push(<em key={key++} className="italic text-white/65">{italicMatch[2] || italicMatch[3]}</em>);
      remaining = italicMatch[4];
      continue;
    }
    // Strikethrough ~~text~~
    const strikeMatch = remaining.match(/^([\s\S]*?)~~([^~]+)~~([\s\S]*)/);
    if (strikeMatch) {
      if (strikeMatch[1]) parts.push(<React.Fragment key={key++}>{strikeMatch[1]}</React.Fragment>);
      parts.push(<del key={key++} className="line-through text-white/35">{strikeMatch[2]}</del>);
      remaining = strikeMatch[3];
      continue;
    }
    // Check for node name references
    if (nodeNames && onNodeClick) {
      let foundNode = false;
      for (const [name, id] of nodeNames) {
        const idx = remaining.toLowerCase().indexOf(name.toLowerCase());
        if (idx !== -1) {
          if (idx > 0) parts.push(<React.Fragment key={key++}>{remaining.slice(0, idx)}</React.Fragment>);
          parts.push(
            <button
              key={key++}
              onClick={() => onNodeClick(id)}
              className="text-cyan-400/80 hover:text-cyan-300 underline underline-offset-2 decoration-cyan-400/30 hover:decoration-cyan-400/60 transition-colors"
            >
              {remaining.slice(idx, idx + name.length)}
            </button>,
          );
          remaining = remaining.slice(idx + name.length);
          foundNode = true;
          break;
        }
      }
      if (foundNode) continue;
    }
    parts.push(<React.Fragment key={key++}>{remaining}</React.Fragment>);
    break;
  }
  return <>{parts}</>;
}

export function renderMarkdown(
  text: string,
  nodeNames?: Map<string, string>,
  onNodeClick?: (id: string) => void,
): React.ReactNode {
  if (!text) return null;
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="bg-black/30 rounded-lg px-3 py-2 my-1.5 text-[10px] font-mono text-emerald-300/70 overflow-x-auto whitespace-pre">
            {codeLines.join('\n')}
          </pre>,
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }
    if (inCodeBlock) { codeLines.push(line); return; }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<div key={i} className="text-[11px] font-bold text-white/80 mt-2 mb-0.5">{line.slice(4)}</div>);
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(<div key={i} className="text-[12px] font-bold text-white/85 mt-2 mb-0.5">{line.slice(3)}</div>);
      return;
    }
    if (line.startsWith('# ')) {
      elements.push(<div key={i} className="text-[13px] font-bold text-white/90 mt-3 mb-1">{line.slice(2)}</div>);
      return;
    }

    // Task list items: - [ ] or - [x]
    const taskMatch = line.match(/^[-*]\s\[([ xX])\]\s?(.*)/);
    if (taskMatch) {
      const checked = taskMatch[1].toLowerCase() === 'x';
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-1 group">
          <span className={`mt-0.5 w-3.5 h-3.5 flex-shrink-0 rounded border flex items-center justify-center text-[9px] ${
            checked
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              : 'bg-white/[0.04] border-white/[0.15] text-transparent'
          }`}>
            {checked && '✓'}
          </span>
          <span className={checked ? 'text-white/40 line-through' : ''}>
            {inlineFormat(taskMatch[2], nodeNames, onNodeClick)}
          </span>
        </div>,
      );
      return;
    }

    // List items
    if (/^[-*•]\s/.test(line)) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-1">
          <span className="text-white/30 mt-px">•</span>
          <span>{inlineFormat(line.replace(/^[-*•]\s/, ''), nodeNames, onNodeClick)}</span>
        </div>,
      );
      return;
    }
    if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1];
      elements.push(
        <div key={i} className="flex gap-1.5 ml-1">
          <span className="text-white/30 font-mono text-[10px] mt-px">{num}.</span>
          <span>{inlineFormat(line.replace(/^\d+\.\s/, ''), nodeNames, onNodeClick)}</span>
        </div>,
      );
      return;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      elements.push(<hr key={i} className="border-white/[0.08] my-2" />);
      return;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <div key={i} className="border-l-2 border-cyan-500/40 pl-2.5 ml-1 text-white/50 italic">
          {inlineFormat(line.slice(2), nodeNames, onNodeClick)}
        </div>,
      );
      return;
    }

    // Table row detection
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = [line];
      let j = i + 1;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim().startsWith('|')) {
        tableLines.push(lines[j]);
        j++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (r: string) => r.split('|').slice(1, -1).map(c => c.trim());
        const isSeparator = (r: string) => /^\|[\s\-:|]+\|$/.test(r.trim());
        const headerRow = parseRow(tableLines[0]);
        const dataRows = tableLines.slice(1).filter(r => !isSeparator(r)).map(parseRow);
        elements.push(
          <div key={i} className="overflow-x-auto my-1.5">
            <table className="text-[10px] border-collapse w-full">
              <thead>
                <tr>{headerRow.map((h, hi) => <th key={hi} className="border border-white/[0.08] px-2 py-1 text-left text-white/70 bg-white/[0.04] font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr key={ri}>{row.map((c, ci) => <td key={ci} className="border border-white/[0.06] px-2 py-1 text-white/50">{inlineFormat(c, nodeNames, onNodeClick)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        for (let k = i + 1; k < j; k++) lines[k] = '\x00TABLE_CONSUMED';
        return;
      }
    }
    if (line === '\x00TABLE_CONSUMED') return;

    // Empty line = spacing
    if (!line.trim()) { elements.push(<div key={i} className="h-1.5" />); return; }

    // Regular paragraph
    elements.push(<div key={i}>{inlineFormat(line, nodeNames, onNodeClick)}</div>);
  });

  return <>{elements}</>;
}
