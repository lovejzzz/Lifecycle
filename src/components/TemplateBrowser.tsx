'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Layers, Users } from 'lucide-react';
import { useLifecycleStore } from '@/store/useStore';
import { getNodeColors, getCategoryIcon } from '@/lib/types';
import type { NodeCategory } from '@/lib/types';

// ── Template metadata (extracted from loadTemplate in useStore) ──────────────

interface TemplateMetadata {
  name: string;
  nodeCount: number;
  edgeCount: number;
  categories: NodeCategory[];
  description: string;
}

const BUILT_IN_TEMPLATES: TemplateMetadata[] = [
  {
    name: 'Software Development',
    nodeCount: 7, edgeCount: 6,
    categories: ['input', 'artifact', 'state', 'review', 'test', 'output'],
    description: 'Full SDLC from requirements through deployment and monitoring',
  },
  {
    name: 'Content Pipeline',
    nodeCount: 6, edgeCount: 5,
    categories: ['input', 'artifact', 'cid', 'review', 'policy', 'output'],
    description: 'Research to published article with editorial review and SEO',
  },
  {
    name: 'Incident Response',
    nodeCount: 6, edgeCount: 5,
    categories: ['input', 'state', 'cid', 'action', 'review', 'output'],
    description: 'Alert triage through investigation, resolution, and postmortem',
  },
  {
    name: 'Product Launch',
    nodeCount: 7, edgeCount: 7,
    categories: ['input', 'artifact', 'cid', 'review', 'output', 'state'],
    description: 'Market research to launch with beta testing and metrics tracking',
  },
  {
    name: 'Chatbot',
    nodeCount: 7, edgeCount: 6,
    categories: ['input', 'cid', 'state', 'policy', 'action', 'output'],
    description: 'User message to bot reply with intent detection and safety checks',
  },
  {
    name: 'Course Design',
    nodeCount: 8, edgeCount: 7,
    categories: ['input', 'state', 'artifact', 'output'],
    description: 'Syllabus to full course artifacts — lesson plans, rubrics, quiz bank, FAQ',
  },
  {
    name: 'Lesson Planning',
    nodeCount: 6, edgeCount: 5,
    categories: ['input', 'state', 'action', 'artifact', 'test', 'review'],
    description: 'Topic to reflection with learning goals, activities, and assessment',
  },
  {
    name: 'Assignment Design',
    nodeCount: 5, edgeCount: 4,
    categories: ['input', 'state', 'artifact', 'output'],
    description: 'Brief to student guide with rubric and sample solution',
  },
];

// ── Component ────────────────────────────────────────────────────────────────

interface TemplateBrowserProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TemplateBrowser({ isOpen, onClose }: TemplateBrowserProps) {
  const [filter, setFilter] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);
  const loadTemplate = useLifecycleStore((s) => s.loadTemplate);
  const loadCustomTemplate = useLifecycleStore((s) => s.loadCustomTemplate);
  const customTemplates = useLifecycleStore((s) => s.customTemplates);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setFilter('');
      setTimeout(() => filterRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const lowerFilter = filter.toLowerCase();

  const filteredBuiltIn = useMemo(
    () => BUILT_IN_TEMPLATES.filter(t => t.name.toLowerCase().includes(lowerFilter) || t.description.toLowerCase().includes(lowerFilter)),
    [lowerFilter],
  );

  const customEntries = useMemo(() => {
    const entries: { name: string; nodeCount: number; edgeCount: number; categories: NodeCategory[]; timestamp: number }[] = [];
    for (const [name, tmpl] of customTemplates) {
      const cats = [...new Set(tmpl.nodes.map(n => n.data?.category).filter(Boolean))];
      entries.push({ name, nodeCount: tmpl.nodes.length, edgeCount: tmpl.edges.length, categories: cats, timestamp: tmpl.timestamp });
    }
    return entries.filter(t => t.name.toLowerCase().includes(lowerFilter));
  }, [customTemplates, lowerFilter]);

  const handleLoad = (name: string, isCustom: boolean) => {
    if (isCustom) {
      loadCustomTemplate(name);
    } else {
      loadTemplate(name);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-2xl max-h-[80vh] mx-4 rounded-xl border border-white/[0.08] bg-[#0e0e18] shadow-2xl overflow-hidden flex flex-col"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center border border-emerald-500/20">
                  <Layers size={15} className="text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-white/90">Templates</h2>
                  <p className="text-[10px] text-white/30">{BUILT_IN_TEMPLATES.length} built-in{customEntries.length > 0 ? ` + ${customEntries.length} custom` : ''}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 pb-3">
              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2">
                <Search size={13} className="text-white/25 flex-shrink-0" />
                <input
                  ref={filterRef}
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter templates..."
                  className="flex-1 bg-transparent text-[12px] text-white/80 placeholder-white/35 outline-none"
                />
                {filter && (
                  <button onClick={() => setFilter('')} className="text-white/25 hover:text-white/50">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto px-5 pb-5 scrollbar-thin">
              {/* Built-in templates */}
              {filteredBuiltIn.length > 0 && (
                <>
                  <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Built-in</div>
                  <div className="grid grid-cols-2 gap-2.5 mb-4">
                    {filteredBuiltIn.map((tmpl) => (
                      <TemplateCard
                        key={tmpl.name}
                        name={tmpl.name}
                        nodeCount={tmpl.nodeCount}
                        edgeCount={tmpl.edgeCount}
                        categories={tmpl.categories}
                        description={tmpl.description}
                        onLoad={() => handleLoad(tmpl.name, false)}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Custom templates */}
              {customEntries.length > 0 && (
                <>
                  <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Users size={9} />
                    Custom
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {customEntries.map((tmpl) => (
                      <TemplateCard
                        key={tmpl.name}
                        name={tmpl.name}
                        nodeCount={tmpl.nodeCount}
                        edgeCount={tmpl.edgeCount}
                        categories={tmpl.categories}
                        description={`Saved ${new Date(tmpl.timestamp).toLocaleDateString()}`}
                        isCustom
                        onLoad={() => handleLoad(tmpl.name, true)}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* No results */}
              {filteredBuiltIn.length === 0 && customEntries.length === 0 && (
                <div className="text-center py-12 text-white/25 text-[12px]">
                  No templates matching &ldquo;{filter}&rdquo;
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-5 py-2.5 border-t border-white/[0.06] text-[10px] text-white/20 flex items-center justify-between">
              <span>Press <kbd className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] font-mono text-[9px]">Esc</kbd> to close</span>
              <span><kbd className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] font-mono text-[9px]">{typeof window !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '\u2318' : 'Ctrl+'}T</kbd> to toggle</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  name,
  nodeCount,
  edgeCount,
  categories,
  description,
  isCustom,
  onLoad,
}: {
  name: string;
  nodeCount: number;
  edgeCount: number;
  categories: NodeCategory[];
  description: string;
  isCustom?: boolean;
  onLoad: () => void;
}) {
  // Deduplicate categories for display
  const uniqueCats = [...new Set(categories)];

  return (
    <motion.div
      className="group relative rounded-xl border border-white/[0.10] bg-white/[0.04] p-3.5 hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-200 cursor-pointer"
      onClick={onLoad}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLoad(); } }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      {/* Name */}
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-[12px] font-semibold text-white/80 group-hover:text-white/95 transition-colors truncate pr-2">
          {name}
        </h3>
        {isCustom && (
          <span className="text-[8px] text-violet-400/50 border border-violet-400/20 rounded px-1 py-0.5 shrink-0">custom</span>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-white/45">{nodeCount} nodes</span>
        <span className="text-[10px] text-white/15">&middot;</span>
        <span className="text-[10px] text-white/45">{edgeCount} edges</span>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1 mb-2.5">
        {uniqueCats.slice(0, 6).map((cat) => {
          const colors = getNodeColors(cat);
          const Icon = getCategoryIcon(cat);
          return (
            <span
              key={cat}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border"
              style={{
                color: colors.primary,
                borderColor: `${colors.primary}30`,
                backgroundColor: `${colors.primary}08`,
              }}
            >
              <Icon size={8} />
              {cat}
            </span>
          );
        })}
        {uniqueCats.length > 6 && (
          <span className="text-[8px] text-white/20 px-1 py-0.5">+{uniqueCats.length - 6}</span>
        )}
      </div>

      {/* Description */}
      <p className="text-[10px] text-white/45 group-hover:text-white/60 transition-colors leading-relaxed line-clamp-2">
        {description}
      </p>

      {/* Load button (visible on hover) */}
      <div className="absolute top-3 right-3 opacity-60 group-hover:opacity-100 transition-opacity">
        <span className="text-[9px] font-medium text-emerald-400/70 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-1">
          Load
        </span>
      </div>
    </motion.div>
  );
}
