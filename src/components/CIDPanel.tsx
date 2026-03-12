'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Bot, Send, Sparkles, X, Loader2, Zap, RefreshCw, Lightbulb, Wrench,
  Search, ChevronRight, ChevronDown, Wifi, WifiOff, Trash2, Download,
  ArrowLeftRight, Square, Pencil, Pin, Check, Paperclip, FileText, XCircle, Brain,
} from 'lucide-react';
import { useLifecycleStore, findNodeByName, getNextHint, getSmartSuggestions } from '@/store/useStore';
import type { ProactiveSuggestion } from '@/lib/suggestions';
import { getAgent } from '@/lib/agents';
import type { CIDCard } from '@/lib/types';
import { relativeTime } from '@/lib/types';
import { renderMarkdown } from '@/lib/markdown';
import { exportAndDownload } from '@/lib/export';
import { resetOnboardingTour } from '@/components/OnboardingTour';
import { classifyRouteWithConfidence, type CommandRoute } from '@/lib/routing';

const COMMAND_HINTS_BY_SECTION: { section: string; hints: { trigger: string; label: string }[] }[] = [
  { section: '📊 Analysis', hints: [
    { trigger: 'status', label: 'status — Graph health report' },
    { trigger: 'explain', label: 'explain — Workflow narrative' },
    { trigger: 'summarize', label: 'summarize — Executive summary' },
    { trigger: 'validate', label: 'validate — Check workflow integrity' },
    { trigger: 'health detail', label: 'health detail — Detailed health breakdown' },
    { trigger: 'bottlenecks', label: 'bottlenecks — Find choke points & hubs' },
    { trigger: 'critical', label: 'critical path — Longest dependency chain' },
    { trigger: 'orphans', label: 'orphans — Find unconnected nodes' },
    { trigger: 'count', label: 'count — Quick node statistics' },
    { trigger: 'progress', label: 'progress — Workflow completion tracker' },
    { trigger: 'why', label: 'why <name> — Explain why a node exists' },
    { trigger: 'what if', label: 'what if remove <name> — Impact analysis' },
    { trigger: 'deps', label: 'deps <name> — Show dependency chain' },
    { trigger: 'suggest', label: 'suggest — Context-aware recommendations' },
  ]},
  { section: '🔧 Node Operations', hints: [
    { trigger: 'add', label: 'add <category> called <name>' },
    { trigger: 'delete', label: 'delete <name> — Remove node' },
    { trigger: 'rename', label: 'rename X to Y — Rename node' },
    { trigger: 'duplicate', label: 'duplicate <name> — Clone a node' },
    { trigger: 'merge', label: 'merge A and B — Combine two nodes' },
    { trigger: 'set', label: 'set <name> to <status> — Change status' },
    { trigger: 'lock', label: 'lock <name> — Lock a node' },
    { trigger: 'describe', label: 'describe <name> as <text> — Set description' },
    { trigger: 'content', label: 'content <name>: <text> — Set node content' },
    { trigger: 'focus', label: 'focus <name> — Select & pan to node' },
    { trigger: 'list', label: 'list <category|status|all> — Node inventory' },
    { trigger: 'auto-describe', label: 'auto-describe — AI-generate descriptions' },
  ]},
  { section: '🔗 Edges & Layout', hints: [
    { trigger: 'connect', label: 'connect X to Y — Create edge' },
    { trigger: 'disconnect', label: 'disconnect X from Y — Remove edge' },
    { trigger: 'reverse', label: 'reverse <name> — Flip edge directions' },
    { trigger: 'relabel', label: 'relabel all — Re-infer edge labels' },
    { trigger: 'swap', label: 'swap <A> and <B> — Swap positions' },
    { trigger: 'optimize', label: 'optimize — Structural analysis + layout' },
    { trigger: 'group', label: 'group — Arrange nodes by category' },
    { trigger: 'isolate', label: 'isolate <name> — Show connected subgraph' },
  ]},
  { section: '▶️ Execution', hints: [
    { trigger: 'run workflow', label: 'run workflow — Execute entire pipeline' },
    { trigger: 'run', label: 'run workflow — Execute the pipeline' },
    { trigger: 'execute', label: 'execute <name> — Run a single node' },
    { trigger: 'preflight', label: 'preflight — Pre-execution summary & plan' },
    { trigger: 'plan', label: 'plan — Topological execution plan' },
    { trigger: 'retry failed', label: 'retry failed — Re-run failed nodes' },
    { trigger: 'clear results', label: 'clear results — Reset execution state' },
    { trigger: 'diff last run', label: 'diff last run — Compare vs previous run' },
    { trigger: 'refine', label: 'refine — Extract structured nodes from a note' },
    { trigger: 'compile', label: 'compile [html|txt] — Download combined output document' },
    { trigger: 'download', label: 'download <name> [as html|txt] — Export a node' },
  ]},
  { section: '🛠 Batch & Fix', hints: [
    { trigger: 'solve', label: 'solve — Fix structural problems' },
    { trigger: 'propagate', label: 'propagate / refresh stale — Re-execute stale nodes' },
    { trigger: 'compress', label: 'compress — Remove duplicates & boilerplate' },
    { trigger: 'approve all', label: 'approve all — Batch approve' },
    { trigger: 'unlock all', label: 'unlock all — Batch unlock' },
    { trigger: 'clear stale', label: 'clear stale — Remove all stale nodes' },
    { trigger: 'batch', label: 'batch <status> where <field>=<value>' },
  ]},
  { section: '💾 Save & History', hints: [
    { trigger: 'save', label: 'save <name> — Save a named snapshot' },
    { trigger: 'restore', label: 'restore <name> — Restore a snapshot' },
    { trigger: 'snapshots', label: 'snapshots — List saved snapshots' },
    { trigger: 'diff', label: 'diff <snapshot> — Compare current vs saved' },
    { trigger: 'clone', label: 'clone workflow — Duplicate entire workflow' },
    { trigger: 'save template', label: 'save template <name> — Save as template' },
    { trigger: 'load template', label: 'load template <name> — Load a template' },
    { trigger: 'templates', label: 'templates — List saved templates' },
    { trigger: 'undo', label: 'undo — Revert last change' },
    { trigger: 'redo', label: 'redo — Reapply undone change' },
    { trigger: 'search', label: 'search <term> — Search chat history' },
  ]},
  { section: '🧠 Central Brain', hints: [
    { trigger: 'ingest', label: 'ingest: <content> — Feed source material to CID' },
    { trigger: 'understanding', label: 'understanding — Show CID\'s understanding' },
    { trigger: 'create', label: 'create <type> — Generate artifact from context' },
    { trigger: 'sync', label: 'sync — Sync all stale artifacts surgically' },
    { trigger: 'diff', label: 'diff — Preview what sync would change' },
    { trigger: 'overrides', label: 'overrides — List user overrides' },
    { trigger: 'interpret override', label: 'interpret override <id> — AI-interpret an override' },
    { trigger: 'propagate override', label: 'propagate override <id> <scope> — Apply override (this-node|all-similar|global)' },
    { trigger: 'update source', label: 'update source: <text> — Update source material' },
    { trigger: 'context', label: 'context — Show current source context' },
  ]},
  { section: '🤖 Agent', hints: [
    { trigger: 'help', label: 'help — List all commands' },
    { trigger: 'teach', label: 'teach: <rule> — Teach CID a new rule' },
    { trigger: 'rules', label: 'rules — List all taught rules' },
    { trigger: 'forget', label: 'forget <N> — Remove a taught rule' },
    { trigger: '/mode', label: '/mode — Switch agent (Rowan/Poirot)' },
    { trigger: '/clear', label: '/clear — Clear chat history' },
    { trigger: '/new', label: '/new — Start a new project' },
    { trigger: '/export', label: '/export — Export workflow as JSON' },
    { trigger: '/export-chat', label: '/export-chat — Export conversation as Markdown' },
    { trigger: '/template', label: '/template <name> — Load a workflow template' },
    { trigger: '/tour', label: '/tour — Replay the onboarding tour' },
  ]},
];

// Flat list for autocomplete matching
const _COMMAND_HINTS = COMMAND_HINTS_BY_SECTION.flatMap(s => s.hints);

const QUICK_ACTIONS = [
  { label: 'Solve problems', icon: Wrench, prompt: 'Analyze the workflow and solve any problems you find' },
  { label: 'Propagate changes', icon: RefreshCw, prompt: 'Propagate all pending state changes to stale artifacts' },
  { label: 'Optimize workflow', icon: Zap, prompt: 'Analyze and optimize the current workflow graph' },
  { label: 'Suggest next', icon: Lightbulb, prompt: 'What should I work on next?' },
];

const AI_MODELS = [
  { id: 'deepseek-chat', label: 'DeepSeek V3', desc: 'Fast & capable' },
  { id: 'deepseek-reasoner', label: 'DeepSeek R1', desc: 'Deep reasoning' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', desc: 'Balanced' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', desc: 'Most intelligent' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', desc: 'Fastest' },
];

export default function CIDPanel() {
  const {
    messages, showCIDPanel, toggleCIDPanel, generateWorkflow,
    addMessage, updateStreamingMessage, isProcessing, nodes,
    propagateStale, optimizeLayout, cidSolve, showImpactPreview,
    cidMode, setCIDMode, handleCardSelect, poirotContext,
    chatWithCID, aiEnabled, selectNode, batchUpdateStatus, setProcessing,
    clearMessages, exportChatHistory, stopProcessing, deleteMessage,
    connectByName, getStatusReport, edges,
    deleteByName, renameByName, explainWorkflow, addNodeByName, disconnectByName,
    setStatusByName, listNodes, describeByName, swapByName, contentByName,
    undo, redo, history, future,
    groupByCategory, clearStale, findOrphans, countNodes,
    mergeByName, depsByName, reverseByName,
    saveSnapshot, restoreSnapshot, listSnapshots, criticalPath,
    isolateByName, summarize, validate,
    pinnedMessageIds, togglePinMessage,
    cloneWorkflow, whatIf, executeWorkflow, executeNode,
    cidAIModel, setCIDAIModel, getHealthScore, getComplexityScore,
    newProject, loadTemplate, addToast, exportWorkflow,
    whyNode, relabelAllEdges,
    addCIDRule, removeCIDRule, listCIDRules, getWorkflowProgress,
    diffSnapshot, batchWhere, generatePlan, searchMessages,
    saveAsTemplate, loadCustomTemplate, listCustomTemplates,
    exportChatMarkdown, autoDescribe,
    compressWorkflow, findBottlenecks,
    suggestNextSteps, healthBreakdown,
    retryFailed, clearExecutionResults, getPreFlightSummary, diffLastRun,
    refineNote, applyRefinementSuggestion, selectedNodeId,
    applySuggestion, dismissSuggestion,
    analyzeOptimizations, applyOptimization,
    compileWorkflow,
  } = useLifecycleStore();
  const [input, setInput] = useState('');
  const [_editingMsgId, _setEditingMsgId] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [panelWidth, setPanelWidth] = useState(380);
  const isResizingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const pendingSuggestionRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; type: string; sections: number; tokens: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (file: File) => {
    if (isUploading || isProcessing) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        addToast(data.message || 'Upload failed', 'error');
        setIsUploading(false);
        return;
      }

      setUploadedFile({
        name: data.filename,
        type: data.type,
        sections: data.sections?.length ?? 0,
        tokens: data.tokenEstimate ?? 0,
      });

      // Compose a prompt for CID to analyze the document
      const sectionList = (data.sections || [])
        .slice(0, 10)
        .map((s: { title: string }) => s.title)
        .join(', ');
      const preview = data.text?.slice(0, 500) || '';
      const prompt = `I uploaded a ${data.type} file: "${data.filename}" (~${data.tokenEstimate} tokens, ${data.sections?.length ?? 0} sections: ${sectionList}). Here's a preview:\n\n${preview}${data.text?.length > 500 ? '\n...(truncated)' : ''}\n\nAnalyze this document and build a workflow that turns it into a living lifecycle.`;
      setInput(prompt);
      addToast(`${file.name} parsed: ${data.sections?.length ?? 0} sections, ~${data.tokenEstimate} tokens`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleResizeStart = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;
    const onMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = startX - ev.clientX;
      setPanelWidth(Math.max(300, Math.min(600, startWidth + delta)));
    };
    const onUp = () => {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidth]);

  const matchingHintsGrouped = React.useMemo(() => {
    if (input.length < 2 || isProcessing) return [];
    const query = input.toLowerCase().trim();
    // Group matching hints by section for better discoverability
    const results: { section?: string; trigger: string; label: string }[] = [];
    let lastSection = '';
    for (const sec of COMMAND_HINTS_BY_SECTION) {
      const matches = sec.hints.filter(h => h.trigger.startsWith(query));
      for (const h of matches) {
        if (sec.section !== lastSection && results.length < 6) {
          results.push({ section: sec.section, ...h });
          lastSection = sec.section;
        } else if (results.length < 6) {
          results.push(h);
        }
      }
    }
    return results.slice(0, 6);
  }, [input, isProcessing]);
  const matchingHints = matchingHintsGrouped;

  // Build node name map for clickable references (sorted longest-first to match longest names first)
  const nodeNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    [...nodes].sort((a, b) => b.data.label.length - a.data.label.length).forEach(n => {
      if (n.data.label.length >= 3) map.set(n.data.label, n.id);
    });
    return map;
  }, [nodes]);

  const agent = getAgent(cidMode);
  const isAmber = agent.accent === 'amber';

  // Memoize stats bar computations to avoid recalculating on every render
  const statsData = React.useMemo(() => {
    if (nodes.length === 0) return null;
    const health = getHealthScore();
    const complexity = getComplexityScore();
    const progress = getWorkflowProgress();
    const edgeNodeIds = new Set<string>();
    for (const e of edges) { edgeNodeIds.add(e.source); edgeNodeIds.add(e.target); }
    const stale = nodes.filter(n => n.data.status === 'stale').length;
    const orphans = nodes.filter(n => !edgeNodeIds.has(n.id)).length;
    return { health, complexity, progress, stale, orphans };
  }, [nodes, edges, getHealthScore, getComplexityScore, getWorkflowProgress]);

  // Auto-scroll: always scroll on new message count or when last message updates (streaming)
  const msgCount = messages.length;
  const lastMsgContent = msgCount > 0 ? messages[msgCount - 1].content : '';
  const lastMsgRole = msgCount > 0 ? messages[msgCount - 1].role : '';
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const container = messagesContainerRef.current;
    const isNewMessage = msgCount > prevMsgCountRef.current;
    prevMsgCountRef.current = msgCount;

    // Force scroll when: new message arrives, user just sent a message, or CID just responded
    const forceScroll = isNewMessage || lastMsgRole === 'user' || lastMsgRole === 'cid';
    if (!container) { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); return; }
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (forceScroll || isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowScrollDown(false);
    } else {
      setShowScrollDown(true);
    }
  }, [msgCount, lastMsgContent, lastMsgRole]);

  // Close model picker on click outside
  useEffect(() => {
    if (!showModelPicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-model-picker]')) setShowModelPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModelPicker]);

  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  // Auto-send when a suggestion chip is clicked
  useEffect(() => {
    if (pendingSuggestionRef.current && input === pendingSuggestionRef.current) {
      pendingSuggestionRef.current = null;
      handleSend();
    }
  });

  const sendStreamingResponse = (response: string, afterStream?: () => void) => {
    // Clean up any previous streaming interval
    cleanupRef.current?.();
    const msgId = `msg-${Date.now()}-r`;
    addMessage({ id: msgId, role: 'cid', content: '', timestamp: Date.now() });
    // For large responses (>100 words), stream line-by-line to avoid 15+ second waits.
    // For short responses, stream word-by-word for a natural typing effect.
    const words = response.split(' ');
    const isLargeResponse = words.length > 100;
    const chunks = isLargeResponse ? response.split('\n') : words;
    const separator = isLargeResponse ? '\n' : ' ';
    const interval_ms = isLargeResponse ? 25 : 35;
    let current = '';
    let i = 0;
    const interval = setInterval(() => {
      if (i >= chunks.length) {
        clearInterval(interval);
        // Attach follow-up suggestions after streaming completes
        const s = useLifecycleStore.getState();
        const suggestions = getSmartSuggestions(s.nodes, s.edges);
        if (suggestions.length > 0) {
          const msgs = s.messages.map(m => m.id === msgId ? { ...m, suggestions } : m);
          useLifecycleStore.setState({ messages: msgs });
        }
        s.setProcessing(false);
        afterStream?.();
        return;
      }
      current += (i === 0 ? '' : separator) + chunks[i];
      updateStreamingMessage(msgId, current);
      i++;
    }, interval_ms);
    cleanupRef.current = () => clearInterval(interval);
  };

  // Helper: add user message, set processing, run action after delay, stream result
  const dispatchCommand = (prompt: string, action: () => string, delay = 400, afterStream?: () => void, withHint = false, proactiveCheck = false) => {
    addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
    setProcessing(true);
    setTimeout(() => {
      let result = action();
      if (withHint) {
        const s = useLifecycleStore.getState();
        const hint = getNextHint(s.nodes, s.edges);
        if (hint) result += hint;
      }
      const postCheck = proactiveCheck ? () => {
        const alert = useLifecycleStore.getState().checkPostMutation();
        if (alert) {
          const agent = getAgent(useLifecycleStore.getState().cidMode);
          const warn = agent.accent === 'amber'
            ? `\n\n🔍 *Hmm, interesting...* Post-operation check: ${alert}. Perhaps \`solve\` would help, mon ami.`
            : `\n\n⚠ Post-op: ${alert}. Run \`solve\` to fix.`;
          addMessage({ id: `msg-${Date.now()}-alert`, role: 'cid', content: warn, timestamp: Date.now() });
        }
        afterStream?.();
      } : afterStream;
      sendStreamingResponse(result, postCheck);
    }, delay);
  };

  const handleSend = () => {
    if (!input.trim() || isProcessing) return;
    const prompt = input.trim();
    setInputHistory(prev => {
      const filtered = prev.filter(h => h !== prompt);
      return [prompt, ...filtered].slice(0, 50);
    });
    setHistoryIndex(-1);
    setInput('');

    // If interviewing, treat input as free-form answer
    if (agent.interviewEnabled && poirotContext.phase === 'interviewing') {
      handleCardSelect('freeform', prompt);
      return;
    }

    // Slash commands
    if (prompt === '/clear' || prompt === '/reset') {
      clearMessages();
      addToast('Chat cleared', 'info');
      return;
    }
    if (prompt === '/new') {
      newProject();
      addToast('New project started', 'info');
      return;
    }
    if (prompt === '/export') {
      const json = exportWorkflow();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lifecycle-workflow-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      addToast('Workflow exported', 'success');
      return;
    }
    if (prompt === '/export-chat' || prompt === '/chat-export') {
      const md = exportChatMarkdown();
      if (!md) { addToast('No messages to export', 'info'); return; }
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cid-conversation-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      addToast('Chat exported as Markdown', 'success');
      return;
    }
    if (/^(?:compile|\/compile)\b/i.test(prompt)) {
      const formatMatch = prompt.match(/\b(html|txt|text|md|markdown)\b/i);
      const format = formatMatch ? (formatMatch[1].replace('text', 'txt').replace('markdown', 'md') as 'md' | 'html' | 'txt') : 'md';
      compileWorkflow(format);
      return;
    }
    if (prompt === '/mode' || prompt === '/switch') {
      setCIDMode(cidMode === 'rowan' ? 'poirot' : 'rowan');
      return;
    }
    if (prompt === '/tour') {
      resetOnboardingTour();
      addToast('Onboarding tour restarted', 'info');
      return;
    }
    if (prompt.startsWith('/template')) {
      const name = prompt.replace('/template', '').trim();
      if (!name) {
        addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
        setProcessing(true);
        setTimeout(() => sendStreamingResponse('Available templates: **Software Development**, **Content Pipeline**, **Incident Response**, **Product Launch**, **Chatbot**, **Course Design**, **Lesson Planning**, **Assignment Design**\n\nUse: `/template Software Development`'), 200);
        return;
      }
      loadTemplate(name);
      return;
    }

    // ── Confidence-driven routing fallback ──
    // When the router is unsure (low confidence), ask for clarification instead of guessing
    const hasWorkflow = nodes.length > 0;
    const { route: classifiedRoute, confidence } = classifyRouteWithConfidence(prompt, hasWorkflow);

    if (confidence === 'low' && classifiedRoute !== 'llm-fallback') {
      const routeDescriptions: Partial<Record<CommandRoute, string>> = {
        extend: 'add new nodes to the existing workflow',
        generate: 'generate a new workflow from scratch',
        solve: 'diagnose and fix structural problems',
        status: 'show a health/status report',
        propagate: 'propagate changes to stale nodes',
        layout: 'auto-arrange the node layout',
        optimize: 'optimize the workflow structure',
        'approve-all': 'approve all nodes in review',
        'unlock-all': 'unlock all locked nodes',
        'activate-all': 'activate all stale nodes',
        connect: 'connect two nodes with an edge',
        disconnect: 'disconnect two nodes',
        delete: 'delete a node',
        rename: 'rename a node',
        'show-stale': 'show which nodes are stale',
        focus: 'focus on a specific node',
        duplicate: 'duplicate a node',
        'add-node': 'add a new node',
        'set-status': 'change a node\'s status',
        list: 'list nodes by category or status',
        describe: 'set a node\'s description',
        swap: 'swap two nodes\' positions',
        content: 'set a node\'s content',
        download: 'download/export a node',
        undo: 'undo the last action',
        redo: 'redo the last undone action',
        group: 'group nodes by category',
        'clear-stale': 'remove all stale nodes',
        orphans: 'find unconnected nodes',
        count: 'show node count/statistics',
        merge: 'merge two nodes together',
        deps: 'show a node\'s dependencies',
        reverse: 'reverse edge directions on a node',
        'save-template': 'save workflow as a template',
        'load-template': 'load a saved template',
        'list-templates': 'list saved templates',
        'save-snapshot': 'save a snapshot of the current state',
        'restore-snapshot': 'restore a saved snapshot',
        'list-snapshots': 'list saved snapshots',
        'critical-path': 'show the critical path',
        isolate: 'show a node\'s subgraph neighborhood',
        summarize: 'summarize the workflow',
        validate: 'validate workflow integrity',
        'clone-workflow': 'clone the entire workflow',
        'what-if': 'run a what-if impact analysis',
        preflight: 'show a pre-execution summary',
        'retry-failed': 'retry failed nodes',
        'clear-results': 'clear all execution results',
        'diff-last-run': 'diff against the last execution run',
        'refresh-node': 'refresh/regenerate a specific node',
        'run-workflow': 'execute the entire workflow',
        'run-node': 'execute a specific node',
        explain: 'explain the workflow step by step',
        help: 'show available commands',
        why: 'explain why a node exists',
        relabel: 'relabel all edges',
        teach: 'teach CID a new rule',
        'forget-rule': 'forget a taught rule',
        'list-rules': 'list taught rules',
        progress: 'show workflow completion progress',
        'diff-snapshot': 'diff against a saved snapshot',
        'batch-where': 'batch update nodes matching a condition',
        plan: 'show the execution plan',
        search: 'search through chat history',
        compress: 'compress/compact the workflow',
        bottlenecks: 'find bottlenecks and choke points',
        suggest: 'get next-step suggestions',
        'health-detail': 'show detailed health breakdown',
        'auto-describe': 'auto-generate node descriptions',
        refine: 'refine a note node',
        ingest: 'ingest source material',
        understand: 'show CID\'s understanding of the source',
        'create-artifact': 'create an artifact from context',
        'sync-artifacts': 'sync stale artifacts',
        'diff-artifacts': 'preview what sync would change',
        'show-overrides': 'list user overrides',
        'forget-override': 'remove a user override',
        'update-source': 'update the source material',
      };

      const description = routeDescriptions[classifiedRoute] || classifiedRoute.replace(/-/g, ' ');
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      setProcessing(true);
      setTimeout(() => {
        sendStreamingResponse(
          `I'm not sure what you mean — did you want me to **${description}**? Or something else?\n\nTry rephrasing, or type \`help\` to see available commands.`
        );
      }, 200);
      return;
    }

    // Detect "extend" intent — user wants to add to existing workflow
    const isExtendRequest = nodes.length > 0 && /^(?:add|extend|expand|include|append|insert|also|plus|and also)\b/i.test(prompt);
    const isMakeGenerate = /^make\s+(?:a|an|me|new|my)\b/i.test(prompt);
    const isGenerateRequest = /^(?:build|create|generate|set up|design|start)\b/i.test(prompt) || isMakeGenerate;

    // Central Brain: when context is ingested, route artifact creation through createArtifact (not generateWorkflow)
    const hasContext = useLifecycleStore.getState().hasContext();
    const isArtifactCreate = hasContext && /^(?:create|generate|build|make|write)\s+(?:a\s+)?(?:new\s+)?(?:blog[\s-]?post|email|social[\s-]?(?:thread|post|media)|twitter[\s-]?thread|x[\s-]?thread|ad[\s-]?copy|press[\s-]?release|landing[\s-]?page|newsletter|product[\s-]?description|linkedin[\s-]?post|ph[\s-]?(?:tagline|copy)|pitch|summary|brief|article|copy)/i.test(prompt);

    if (isArtifactCreate) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      const typeMatch = prompt.match(/(?:create|generate|build|make|write)\s+(?:a\s+)?(?:new\s+)?([\w\s-]+)/i);
      const artifactType = typeMatch?.[1]?.trim().replace(/\s+/g, '-').toLowerCase() || 'content';
      useLifecycleStore.getState().createArtifact(artifactType, prompt);
    } else if (isExtendRequest) {
      // Route through chatWithCID which already has graph context and handles workflow responses
      // chatWithCID adds its own user message, so we don't add one here
      chatWithCID(`Extend the current workflow: ${prompt}. Add new nodes and connect them to existing nodes where appropriate. Return a workflow with ONLY the NEW nodes and edges to add. Use the existing node labels in edge references.`);
    } else if (isGenerateRequest) {
      generateWorkflow(prompt);
    } else if (/^(?:solve|fix|diagnose?|heal|repair)\b/i.test(prompt)) {
      // Run local solve first, then enrich with AI analysis if available
      setProcessing(true);
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      if (agent.responses.preInvestigate) {
        addMessage({
          id: `msg-${Date.now()}-inv`, role: 'cid',
          content: agent.responses.preInvestigate,
          timestamp: Date.now(), action: 'investigating',
        });
      }
      setTimeout(() => {
        const result = cidSolve();
        if (aiEnabled && nodes.length > 0) {
          // Send to AI for deeper analysis on top of local fixes
          chatWithCID(`I just ran a structural fix on the workflow and found: ${result.message}. Analyze this workflow further — are there any gaps, missing connections, or improvements I should make? Be specific about which nodes. Do NOT return a workflow, just analysis.`);
        } else {
          sendStreamingResponse(result.message);
        }
      }, agent.responses.preInvestigate ? 1500 : 600);
    } else if (/^(?:health\s+detail|health\s+breakdown|detailed?\s+health|health\s+report)\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => healthBreakdown(), 400);
    } else if (/^(?:status|report|health|dashboard)\b/i.test(prompt)) {
      // AI-powered status report when available
      if (aiEnabled && nodes.length > 0) {
        // chatWithCID adds its own user message, so we don't add one here
        chatWithCID(`Give me a status report on this workflow. Analyze the health, identify any bottlenecks or gaps, and suggest the most impactful next step. Be concise and specific. Do NOT return a workflow, just your analysis.`);
      } else {
        dispatchCommand(prompt, () => getStatusReport());
      }
    } else if (/^(?:propagate?|sync|refresh\s*stale|regenerate\s*stale|update\s+(?:all\s+)?stale|run\s+(?:the\s+)?stale)\b/i.test(prompt) || /^run\s+(?:everything|all|anything)\s+(?:that(?:'s| is)|which\s+is)\s+stale/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      // Central Brain: use surgical sync when context exists
      if (hasContext && /^(?:sync|sync all|sync stale|sync everything|resync|re-sync)\s*$/i.test(prompt)) {
        setProcessing(true);
        useLifecycleStore.getState().syncAllStale().finally(() => setProcessing(false));
        return;
      }
      const currentNodes = useLifecycleStore.getState().nodes;
      const sc = currentNodes.filter((n) => n.data.status === 'stale').length;
      if (sc > 0) {
        // Show impact preview instead of immediately regenerating
        showImpactPreview();
        const agent = getAgent(cidMode);
        sendStreamingResponse(`${sc} stale node${sc > 1 ? 's' : ''} found. Review the impact preview below and select which to regenerate.`);
      } else {
        setTimeout(() => {
          sendStreamingResponse(agent.responses.propagateClean());
        }, 300);
      }
    } else if (/^(?:layout|arrange|lay\s+out)\b/i.test(prompt)) {
      dispatchCommand(prompt, () => agent.responses.optimized(nodes.length), 600, optimizeLayout);
    } else if (/^optimi/i.test(prompt)) {
      // Structural optimization analysis + layout
      analyzeOptimizations();
      optimizeLayout();
    } else if (/^batch\s+\w+\s+where\s+/i.test(prompt)) {
      // Batch where (MUST come before batch approve/unlock/activate)
      dispatchCommand(prompt, () => batchWhere(prompt).message);
    } else if (/^(?:approve\s+all|batch\s+approve)\b/i.test(prompt)) {
      dispatchCommand(prompt, () => {
        const count = batchUpdateStatus('reviewing', 'active');
        return count > 0 ? `Done. Approved ${count} node${count > 1 ? 's' : ''} that were in review.` : 'No nodes currently in review status.';
      });
    } else if (/^(?:unlock\s+all|batch\s+unlock)\b/i.test(prompt)) {
      dispatchCommand(prompt, () => {
        const count = batchUpdateStatus('locked', 'active');
        return count > 0 ? `Done. Unlocked ${count} node${count > 1 ? 's' : ''}.` : 'No locked nodes found.';
      });
    } else if (/^(?:activate\s+all|batch\s+activate)\b/i.test(prompt) || /^(?:mark|set)\s+(?:all|every\w*)\s+(?:\w+\s+)?(?:as|to)\s+active\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => {
        const count = batchUpdateStatus('stale', 'active');
        return count > 0 ? `Done. Activated ${count} stale node${count > 1 ? 's' : ''}.` : 'No stale nodes found.';
      });
    } else if (/^(?:connect|link|wire|attach)\s+.+\s+(?:to|with|→|->)\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => connectByName(prompt).message, 400, undefined, true);
    } else if (/^(?:disconnect|unlink|unwire|detach)\s+.+\s+(?:from|and|→|->)\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => disconnectByName(prompt).message, 400, undefined, true);
    } else if (/^(?:remove|break|cut)\s+(?:the\s+)?(?:connection|link|edge)\s+(?:between|from)\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => disconnectByName(prompt).message, 400, undefined, true);
    } else if (/^(?:delete|remove|drop|destroy)\s+.+/i.test(prompt)) {
      // Preview what will be deleted
      const delPreview = prompt.match(/(?:delete|remove|drop|destroy)\s+["']?(.+?)["']?\s*$/i);
      if (delPreview) {
        const target = findNodeByName(delPreview[1], nodes);
        if (target) {
          const connCount = edges.filter(e => e.source === target.id || e.target === target.id).length;
          if (connCount > 0 && !window.confirm(`Delete "${target.data.label}"? This will remove ${connCount} connection${connCount > 1 ? 's' : ''}.`)) {
            addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
            setProcessing(true);
            setTimeout(() => sendStreamingResponse('Cancelled.'), 200);
            return;
          }
        }
      }
      dispatchCommand(prompt, () => deleteByName(prompt).message, 400, undefined, true, true);
    } else if (/^(?:rename|change name|relabel)\s+.+\s+(?:to|as|→|->)\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => renameByName(prompt).message);
    } else if (/^(?:show|find|list)\s+(?:me\s+)?(?:what(?:'s| is)\s+)?stale/i.test(prompt) || /^(?:show|find|list)\s+stale/i.test(prompt) || /^(?:what|which)\s+nodes?\s+(?:are|is)\s+stale/i.test(prompt) || /^how\s+many\s+(?:nodes?\s+)?(?:are\s+)?stale/i.test(prompt)) {
      // "show me what's stale", "show stale nodes", "find stale" → list stale nodes
      dispatchCommand(prompt, () => {
        const staleNodes = nodes.filter(n => n.data.status === 'stale');
        if (staleNodes.length === 0) return 'No stale nodes. Everything is up to date.';
        return `**${staleNodes.length} stale node${staleNodes.length > 1 ? 's' : ''}:**\n${staleNodes.map(n => `- **${n.data.label}** (${n.data.category})`).join('\n')}\n\nRun \`propagate\` to refresh them.`;
      });
    } else if (/^(?:show|find|what(?:'s| is| are))\s+(?:me\s+)?(?:the\s+)?(?:critical\s*path|longest\s*chain)/i.test(prompt)) {
      dispatchCommand(prompt, () => criticalPath());
    } else if (/^(?:show|find|what(?:'s| is| are))\s+(?:me\s+)?(?:the\s+)?(?:bottleneck|chokepoint|hub|spof)/i.test(prompt)) {
      dispatchCommand(prompt, () => findBottlenecks(), 400);
    } else if (/^(?:focus|select|show|go to|find|zoom)\s+(?:on\s+)?["']?.+["']?\s*$/i.test(prompt) && !/^show\s+(?:me\s+)?(?:your\s+)?(?:understanding|context|source|overrides?)\s*$/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      const nameMatch = prompt.match(/(?:focus|select|show|go to|find|zoom)\s+(?:on\s+)?["']?(.+?)["']?\s*$/i);
      if (nameMatch) {
        const found = findNodeByName(nameMatch[1], nodes);
        if (found) {
          selectNode(found.id);
          setProcessing(true);
          setTimeout(() => sendStreamingResponse(`Focused on **${found.data.label}** (${found.data.category}, ${found.data.status}).`), 200);
        } else {
          setProcessing(true);
          setTimeout(() => sendStreamingResponse(`No node matching "${nameMatch[1]}". Available: ${nodes.map(n => n.data.label).join(', ')}.`), 200);
        }
      }
    } else if (/^(?:clone|duplicate)\s+(?:workflow|graph|project|all)\s*$/i.test(prompt)) {
      // Clone workflow (MUST come before duplicate to avoid "clone workflow" matching duplicate)
      dispatchCommand(prompt, () => cloneWorkflow());
    } else if (/^(?:duplicate|clone|copy)\s+["']?.+["']?\s*$/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      const dupMatch = prompt.match(/(?:duplicate|clone|copy)\s+["']?(.+?)["']?\s*$/i);
      if (dupMatch) {
        const found = findNodeByName(dupMatch[1], nodes);
        if (found) {
          const { duplicateNode } = useLifecycleStore.getState();
          duplicateNode(found.id);
          setProcessing(true);
          setTimeout(() => sendStreamingResponse(`Duplicated **${found.data.label}**. The copy has been placed nearby.`), 300);
        } else {
          setProcessing(true);
          setTimeout(() => sendStreamingResponse(`No node matching "${dupMatch[1]}". Available: ${nodes.map(n => n.data.label).join(', ')}.`), 200);
        }
      }
    } else if (/^(?:add|new)\s+\w+\s+(?:called|named|:)\s+/i.test(prompt) || /^(?:add|new)\s+\w+\s+["'].+["']/i.test(prompt)) {
      dispatchCommand(prompt, () => addNodeByName(prompt).message, 400, undefined, true);
    } else if (/^(?:set|mark|change)\s+.+\s+(?:to|as|→)\s+\w+\s*$/i.test(prompt) || /^lock\s+["']?.+["']?\s*$/i.test(prompt) || /^unlock\s+["']?.+["']?\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => setStatusByName(prompt).message);
    } else if (/^(?:list|show|inventory)\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => listNodes(prompt), 300);
    } else if (/^(?:describe|annotate|document)\s+.+\s+(?:as:?|:)\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => describeByName(prompt).message);
    } else if (/^(?:swap|switch|exchange)\s+.+\s+(?:and|with|↔)\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => swapByName(prompt).message);
    } else if (/^(?:content|write|fill)\s+.+(?::|=)\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => contentByName(prompt).message);
    } else if (/^(?:download|export\s+node)\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => {
        const nameMatch = prompt.match(/(?:download|export\s+node)\s+["']?(.+?)["']?\s*(?:as\s+(\w+))?\s*$/i);
        if (!nameMatch) return 'Usage: download <node name> [as md|html|txt]';
        const nodeName = nameMatch[1];
        const format = (nameMatch[2]?.toLowerCase().replace('text', 'txt').replace('markdown', 'md') || 'md') as 'md' | 'html' | 'txt';
        const found = nodes.find(n => n.data.label.toLowerCase() === nodeName.toLowerCase());
        if (!found) return `No node named "${nodeName}".`;
        const content = found.data.executionResult || found.data.content;
        if (!content) return `"${found.data.label}" has no content to export.`;
        exportAndDownload(content, format, found.data.label);
        return `Downloaded "${found.data.label}" as ${format.toUpperCase()}.`;
      });
    } else if (/^undo\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => {
        if (history.length > 0) { undo(); return 'Done. Reverted to previous state.'; }
        return 'Nothing to undo.';
      }, 200);
    } else if (/^redo\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => {
        if (future.length > 0) { redo(); return 'Done. Reapplied the last undone change.'; }
        return 'Nothing to redo.';
      }, 200);
    } else if (/^(?:group|cluster|organize)\s*(?:by\s*)?(?:category|type)?\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => groupByCategory().message);
    } else if (/^(?:clear|purge|remove)\s+stale\s*$/i.test(prompt)) {
      const staleNodes = nodes.filter(n => n.data.status === 'stale');
      if (staleNodes.length > 0 && !window.confirm(`Remove ${staleNodes.length} stale node${staleNodes.length > 1 ? 's' : ''}: ${staleNodes.map(n => n.data.label).join(', ')}?`)) {
        addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
        setProcessing(true);
        setTimeout(() => sendStreamingResponse('Cancelled.'), 200);
        return;
      }
      dispatchCommand(prompt, () => clearStale().message, 400, undefined, false, true);
    } else if (/^(?:orphan|isolat|unconnected)\w*\s*$/i.test(prompt) || /^(?:show|find|list)\s+(?:me\s+)?(?:the\s+)?(?:orphan|unconnected|isolat)\w*/i.test(prompt)) {
      dispatchCommand(prompt, () => findOrphans());
    } else if (/^(?:count|stats|statistics|tally)\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => countNodes());
    } else if (/^(?:merge|combine|fuse)\s+.+\s+(?:and|with|into|&)\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => mergeByName(prompt).message, 400, undefined, true, true);
    } else if (/^(?:deps|dependencies|depend|upstream|downstream|chain)\s+/i.test(prompt) || /^what(?:'s| is)\s+(?:blocking|preventing|stopping)\s+.+\s+(?:from|to)\s+/i.test(prompt) || /^what(?:'s|\s+(?:is|are))?\s+(?:depend(?:s|ent|ing)?|downstream|upstream)\s+(?:on|of|from)\s+/i.test(prompt) || /^what\s+depends\s+on\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => depsByName(prompt));
    } else if (/^(?:reverse|flip|invert)\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => reverseByName(prompt).message);
    } else if (/^save\s+template\s+["']?(.+?)["']?\s*$/i.test(prompt)) {
      const tMatch = prompt.match(/save\s+template\s+["']?(.+?)["']?\s*$/i);
      if (tMatch) dispatchCommand(prompt, () => saveAsTemplate(tMatch[1].trim()));
    } else if (/^(?:load|use)\s+template\s+["']?(.+?)["']?\s*$/i.test(prompt)) {
      const tMatch = prompt.match(/(?:load|use)\s+template\s+["']?(.+?)["']?\s*$/i);
      if (tMatch) dispatchCommand(prompt, () => loadCustomTemplate(tMatch[1].trim()));
    } else if (/^(?:templates?|my\s+templates?)\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => listCustomTemplates());
    } else if (/^(?:save|snapshot)\s+["']?(.+?)["']?\s*$/i.test(prompt)) {
      const nameMatch = prompt.match(/(?:save|snapshot)\s+["']?(.+?)["']?\s*$/i);
      dispatchCommand(prompt, () => saveSnapshot(nameMatch?.[1] ?? 'default'));
    } else if (/^(?:restore|load)\s+["']?(.+?)["']?\s*$/i.test(prompt)) {
      const nameMatch = prompt.match(/(?:restore|load)\s+["']?(.+?)["']?\s*$/i);
      dispatchCommand(prompt, () => restoreSnapshot(nameMatch?.[1] ?? '').message);
    } else if (/^(?:snapshots?|saved|bookmarks?)\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => listSnapshots());
    } else if (/^(?:critical\s*path|longest\s*chain|bottleneck)\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => criticalPath());
    } else if (/^(?:isolate|subgraph|neighborhood|neighbours?)\s+/i.test(prompt)) {
      dispatchCommand(prompt, () => isolateByName(prompt));
    } else if (/^(?:summarize|summary|executive|brief|overview)(?:\s+(?:the\s+)?(?:workflow|graph|project|all))?\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => summarize());
    } else if (/^(?:validate|integrity|check|audit)(?:\s+(?:the\s+)?(?:workflow|graph|project|all))?\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => validate());
    } else if (/^(?:what\s*if|impact|without)\b/i.test(prompt)) {
      dispatchCommand(prompt, () => whatIf(prompt));
    } else if (/^(?:pre\s*flight|flight\s*check|dry\s*run|plan\s+run|execution\s+plan)\s*$/i.test(prompt) || /^(?:which|what)\s+nodes?\s+(?:are|is)\s+(?:ready|able|eligible)\s+(?:to\s+)?(?:run|execute)/i.test(prompt)) {
      dispatchCommand(prompt, () => getPreFlightSummary());
    } else if (/^(?:retry|rerun|re-run)\s+(?:failed|errors?|skipped)\s*$/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      setProcessing(true);
      setTimeout(async () => {
        await retryFailed();
        setProcessing(false);
      }, 300);
    } else if (/^(?:clear|reset)\s+(?:results?|execution|output)\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => clearExecutionResults(), 200, undefined, true, true);
    } else if (/^(?:diff\s+(?:last|prev(?:ious)?)|compare\s+(?:run|execution)s?)\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => diffLastRun());
    } else if (/^(?:refresh|update|regenerate)\s+(?:the\s+)?["']?(.+?)["']?\s*$/i.test(prompt) && !/^(?:update|change|edit|modify)\s+(?:the\s+)?(?:source|input|original|context)\b/i.test(prompt)) {
      // "refresh the quiz bank", "update the rubric", "regenerate study guide" → execute specific node
      const refreshMatch = prompt.match(/^(?:refresh|update|regenerate)\s+(?:the\s+)?["']?(.+?)["']?\s*$/i);
      if (refreshMatch) {
        const target = findNodeByName(refreshMatch[1], nodes);
        if (target) {
          addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
          setProcessing(true);
          setTimeout(async () => {
            await executeNode(target.id);
            const updated = useLifecycleStore.getState().nodes.find(n => n.id === target.id);
            const status = updated?.data.executionStatus;
            const msg = status === 'success'
              ? `Refreshed **${target.data.label}** successfully.`
              : status === 'error'
                ? `Failed to refresh **${target.data.label}**: ${updated?.data.executionError || 'Unknown error'}`
                : `Processed **${target.data.label}**.`;
            sendStreamingResponse(msg);
          }, 300);
        } else {
          addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
          setProcessing(true);
          setTimeout(() => sendStreamingResponse(`No node matching "${refreshMatch[1]}". Available: ${nodes.map(n => n.data.label).join(', ')}.`), 200);
        }
      }
    } else if (/^(?:run|execute|start)\s+(?:workflow|all|pipeline|everything)\s*$/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      setProcessing(true);
      setTimeout(async () => {
        await executeWorkflow();
        setProcessing(false);
      }, 300);
    } else if (/^(?:run|execute)\s+["']?(.+?)["']?\s*$/i.test(prompt)) {
      const runMatch = prompt.match(/(?:run|execute)\s+["']?(.+?)["']?\s*$/i);
      if (runMatch) {
        const target = findNodeByName(runMatch[1], nodes);
        if (target) {
          addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
          setProcessing(true);
          setTimeout(async () => {
            await executeNode(target.id);
            const updated = useLifecycleStore.getState().nodes.find(n => n.id === target.id);
            const status = updated?.data.executionStatus;
            const msg = status === 'success'
              ? `Executed **${target.data.label}** successfully.${updated?.data.executionResult ? `\n\n\`\`\`\n${updated.data.executionResult.slice(0, 500)}${(updated.data.executionResult.length || 0) > 500 ? '...' : ''}\n\`\`\`` : ''}`
              : status === 'error'
                ? `Failed to execute **${target.data.label}**: ${updated?.data.executionError || 'Unknown error'}`
                : `Processed **${target.data.label}**.`;
            sendStreamingResponse(msg);
          }, 300);
        } else {
          addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
          setProcessing(true);
          setTimeout(() => sendStreamingResponse(`No node matching "${runMatch[1]}". Available: ${nodes.map(n => n.data.label).join(', ')}.`), 200);
        }
      }
    } else if (/^(?:explain|walk\s*through|narrate|trace)\b/i.test(prompt)) {
      if (aiEnabled && nodes.length > 0) {
        // chatWithCID adds its own user message, so we don't add one here
        chatWithCID(`Explain this workflow step by step as a narrative. Walk through each node and how they connect. Be clear and engaging. Do NOT return a workflow, just the explanation.`);
      } else {
        dispatchCommand(prompt, () => explainWorkflow());
      }
    } else if (/^(?:help|commands|\?|what can you do)\s*$/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      setProcessing(true);
      const helpText = [
        '### Available Commands',
        '',
        '**Build & Create**',
        '- `build/create/make/generate ...` — Generate a workflow from a description',
        '',
        '**Graph Actions**',
        '- `solve/fix/diagnose` — Analyze and fix structural problems',
        '- `propagate/sync` — Update stale nodes downstream',
        '- `optimize/arrange/layout` — Auto-arrange nodes in tiers',
        '- `connect X to Y [with label]` — Create an edge between nodes',
        '- `disconnect X from Y` — Remove an edge between nodes',
        '- `delete/remove <node name>` — Delete a node by name',
        '- `rename <old> to <new>` — Rename a node',
        '- `set <name> to <status>` — Change node status',
        '- `lock/unlock <name>` — Lock or unlock a node',
        '- `describe <name> as <text>` — Set node description',
        '- `content <name>: <text>` — Set node content',
        '- `swap <A> and <B>` — Swap node positions',
        '- `group` — Arrange nodes by category columns',
        '- `merge A and B` — Combine two nodes into one',
        '- `reverse <name>` — Flip edge directions on a node',
        '- `undo` / `redo` — Revert or reapply changes',
        '',
        '**Reports**',
        '- `status/report/health` — Graph health report',
        '- `explain/trace` — Workflow narrative',
        '- `list <category|status|all>` — Node inventory',
        '- `count/stats` — Quick node statistics',
        '- `orphans` — Find unconnected nodes',
        '- `deps <name>` — Show upstream/downstream chain',
        '- `critical path` — Show longest dependency chain',
        '- `isolate <name>` — Show connected subgraph around a node',
        '- `summarize` — Executive summary of the workflow',
        '- `validate` — Check for cycles, duplicates, and integrity issues',
        '- `why <name>` — Explain why a node exists (trace upstream chain)',
        '- `what if remove <name>` — Simulate removing a node and see impact',
        '- `plan` — Generate topological execution plan with dependency order',
        '- `search <term>` — Search through chat history',
        '- `auto-describe` — AI-generate descriptions for all empty nodes',
        '- `compress` — Remove duplicates, pass-through nodes & orphan warnings',
        '- `bottlenecks` — Find choke points, hubs & single points of failure',
        '- `suggest` — Context-aware next-step recommendations',
        '- `health detail` — Detailed health breakdown by category, connectivity & content',
        '',
        '**Batch**',
        '- `relabel all` — Re-infer all edge labels from category pairs',
        '- `approve all` — Approve all reviewing nodes',
        '- `unlock all` — Unlock all locked nodes',
        '- `activate all` — Activate all stale nodes',
        '- `clear stale` — Remove all stale nodes',
        '- `batch <status> where <field>=<value>` — Conditional bulk update',
        '',
        '**Snapshots**',
        '- `save <name>` — Save current workflow as a named snapshot',
        '- `restore <name>` — Restore a saved snapshot',
        '- `snapshots` — List all saved snapshots',
        '- `clone workflow` — Duplicate the entire workflow',
        '- `diff <snapshot>` — Compare current workflow vs a saved snapshot',
        '- `save template <name>` — Save workflow as a reusable template',
        '- `load template <name>` — Load a saved custom template',
        '- `templates` — List all saved custom templates',
        '',
        '**Execution**',
        '- `run workflow` — Execute pipeline (parallel where possible)',
        '- `run/execute <name>` — Execute a single node',
        '- `preflight` — Pre-execution summary with stage plan',
        '- `retry failed` — Re-run only failed/skipped nodes',
        '- `clear results` — Reset all execution state for fresh run',
        '- `diff last run` — Compare current vs previous execution results',
        '',
        '**Slash Commands**',
        '- `/clear` — Clear chat history',
        '- `/new` — Start a new project',
        '- `/export` — Export workflow as JSON',
        '- `/mode` — Switch agent (Rowan ↔ Poirot)',
        '- `/template <name>` — Load a template (Software Development, Content Pipeline, Incident Response, Product Launch, Chatbot, Course Design, Lesson Planning, Assignment Design)',
        '- `/export-chat` — Export conversation as Markdown file',
        '',
        '**Central Brain (Source → Artifacts)**',
        '- `ingest: <content>` — Feed source material to CID for analysis',
        '- `understanding` — Show CID\'s understanding of the source',
        '- `create <type>` — Generate artifact (blog-post, email, social-thread, etc.)',
        '- `sync` — Surgically sync all stale artifacts with source',
        '- `sync <name>` — Sync a specific artifact',
        '- `diff` — Preview what sync would change',
        '- `overrides` — List user overrides on CID-managed artifacts',
        '- `interpret override <id>` — AI-interpret what an override means',
        '- `propagate override <id> <scope>` — Apply override (this-node|all-similar|global)',
        '- `update source: <content>` — Update the source material',
        '',
        '**Learning**',
        '- `teach: <rule>` — Teach CID a rule to always follow',
        '- `rules` — List all taught rules',
        '- `forget <number>` — Remove a taught rule',
        '- `progress` — Workflow completion percentage',
        '',
        '**Other**',
        '- `Cmd+K` — Open command palette for quick access',
        '- Any other text is sent to AI (if enabled) or gets a graph-aware response',
        '- Right-click a node → "Ask CID" or "Generate Content" for AI-powered node actions',
      ].join('\n');
      setTimeout(() => sendStreamingResponse(helpText), 200);
    } else if (/^(?:why|reason|purpose)\s+/i.test(prompt) && !/^why\s+(?:is|does|do|are|was|were|can|should|would|has|have|did)\b/i.test(prompt)) {
      dispatchCommand(prompt, () => whyNode(prompt));
    } else if (/^(?:relabel|re-label|fix\s+labels?|infer\s+labels?)\s*(?:all|edges?)?\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => relabelAllEdges().message);
    } else if (/^(?:teach|learn|remember)\s*:\s*(.+)$/i.test(prompt)) {
      const ruleMatch = prompt.match(/^(?:teach|learn|remember)\s*:\s*(.+)$/i);
      if (ruleMatch) dispatchCommand(prompt, () => addCIDRule(ruleMatch[1].trim()));
    } else if (/^(?:forget|unlearn|remove rule)\s+(\d+)\s*$/i.test(prompt)) {
      const fMatch = prompt.match(/^(?:forget|unlearn|remove rule)\s+(\d+)\s*$/i);
      if (fMatch) dispatchCommand(prompt, () => removeCIDRule(parseInt(fMatch[1], 10) - 1));
    } else if (/^(?:rules?|taught|learned)\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => listCIDRules());
    } else if (/^(?:progress|completion)\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => {
        const p = getWorkflowProgress();
        if (p.total === 0) return 'No workflow yet — nothing to track.';
        const bar = '█'.repeat(Math.floor(p.percent / 5)) + '░'.repeat(20 - Math.floor(p.percent / 5));
        return `### Workflow Progress\n\n\`${bar}\` **${p.percent}%**\n\n- **${p.done}** / ${p.total} nodes complete (active/locked)\n${p.blocked > 0 ? `- **${p.blocked}** blocked (stale)\n` : ''}- ${p.total - p.done - p.blocked} in progress`;
      });
    } else if (/^(?:diff|compare)\s+["']?(.+?)["']?\s*$/i.test(prompt)) {
      const diffMatch = prompt.match(/(?:diff|compare)\s+["']?(.+?)["']?\s*$/i);
      if (diffMatch) dispatchCommand(prompt, () => diffSnapshot(diffMatch[1].trim()));
    } else if (/^(?:plan|execution\s*plan|steps|order)\s*$/i.test(prompt) || /^what(?:'s|\s+is)\s+the\s+(?:execution\s+)?order/i.test(prompt)) {
      dispatchCommand(prompt, () => generatePlan());
    } else if (/^(?:search|find|grep)\s+(.+)$/i.test(prompt)) {
      const searchMatch = prompt.match(/(?:search|find|grep)\s+(.+)$/i);
      if (searchMatch) dispatchCommand(prompt, () => searchMessages(searchMatch[1].trim()), 200);
    } else if (/^(?:compress|compact|simplify|dedupe|dedup)(?:\s+(?:the\s+)?(?:workflow|graph|project|all|nodes))?\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => compressWorkflow(), 500);
    } else if (/^(?:bottleneck|bottlenecks|choke|chokepoint|hub|hubs|spof)\s*$/i.test(prompt)) {
      dispatchCommand(prompt, () => findBottlenecks(), 400);
    } else if (/^(?:suggest|next|what\s*(?:should|can)\s*I\s*do(?:\s+next|\s+now)?|recommendations?)\s*$/i.test(prompt) || /^(?:which|what)\s+nodes?\s+(?:need|require|want)\s+(?:attention|work|updating|fixing|help)/i.test(prompt) || /^(?:which|what)\s+nodes?\s+(?:haven't|have\s+not|aren't|are\s+not)\s+been\s+(?:updated|changed|run|executed)/i.test(prompt)) {
      dispatchCommand(prompt, () => suggestNextSteps(), 400);
    } else if (/^(?:auto[- ]?describe|describe\s+all|fill\s+descriptions?)(?:\s+(?:all\s+)?(?:nodes?|empty)?)?\s*$/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      setProcessing(true);
      autoDescribe().finally(() => setProcessing(false));
    } else if (/^(?:refine|extract|structure)(?:\s+(?:this\s+)?note)?\s*$/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      // Find a note node — prefer the selected one, or find the first note
      const targetId = selectedNodeId;
      const targetNode = targetId ? nodes.find(n => n.id === targetId) : null;
      if (targetNode && targetNode.data.category === 'note') {
        setProcessing(true);
        refineNote(targetNode.id).finally(() => setProcessing(false));
      } else {
        const firstNote = nodes.find(n => n.data.category === 'note' && n.data.content);
        if (firstNote) {
          setProcessing(true);
          refineNote(firstNote.id).finally(() => setProcessing(false));
        } else {
          sendStreamingResponse('No note node found. Select a note node or create one first.');
        }
      }
    // ── Central Brain Commands ──
    } else if (/^(?:ingest|feed|analyze|here(?:'s| is) (?:my|the|some)|take this|source(?:\s*material)?:)/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      // Extract the source content — everything after the command keyword
      const contentMatch = prompt.match(/^(?:ingest|feed|analyze|here(?:'s| is) (?:my|the|some)|take this|source(?:\s*material)?:?)\s*([\s\S]*)/i);
      const content = contentMatch?.[1]?.trim() || prompt;
      useLifecycleStore.getState().ingestSource(content, 'text');
    } else if (/^(?:understand(?:ing)?|what do you (?:know|understand)|show (?:me )?(?:your )?(?:understanding|context|source)|context)\s*$/i.test(prompt)) {
      const understanding = useLifecycleStore.getState().getUnderstanding();
      if (understanding) {
        dispatchCommand(prompt, () =>
          `### CID's Understanding\n\n` +
          `**Summary:** ${understanding.summary}\n` +
          `**Tone:** ${understanding.tone} · **Audience:** ${understanding.audience}\n` +
          `**Intent:** ${understanding.intent}\n` +
          `**Key entities:** ${understanding.keyEntities.join(', ') || 'none'}\n` +
          `**Constraints:** ${understanding.constraints.join(', ') || 'none'}\n\n` +
          `**Available artifact types:** ${understanding.suggestedArtifacts.map(a => a.replace(/-/g, ' ')).join(', ')}`
        );
      } else {
        dispatchCommand(prompt, () => 'No source material ingested yet. Paste your content or say "ingest: <your content>" to get started.');
      }
    } else if (/^(?:create|generate|build|make|write)\s+(?:a\s+)?(?:new\s+)?(?:blog[\s-]?post|email|social[\s-]?(?:thread|post|media)|twitter[\s-]?thread|x[\s-]?thread|ad[\s-]?copy|press[\s-]?release|landing[\s-]?page|newsletter|product[\s-]?description|linkedin[\s-]?post|ph[\s-]?(?:tagline|copy)|pitch|summary|brief|article|copy)/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      // Extract artifact type from prompt
      const typeMatch = prompt.match(/(?:create|generate|build|make|write)\s+(?:a\s+)?(?:new\s+)?([\w\s-]+)/i);
      const artifactType = typeMatch?.[1]?.trim().replace(/\s+/g, '-').toLowerCase() || 'content';
      useLifecycleStore.getState().createArtifact(artifactType, prompt);
    } else if (/^(?:sync|sync all|sync stale|sync everything|resync|re-sync)\s*$/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      setProcessing(true);
      useLifecycleStore.getState().syncAllStale().finally(() => setProcessing(false));
    } else if (/^sync\s+["']?(.+?)["']?\s*$/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      const syncMatch = prompt.match(/^sync\s+["']?(.+?)["']?\s*$/i);
      if (syncMatch) {
        const target = findNodeByName(syncMatch[1], nodes);
        if (target) {
          setProcessing(true);
          useLifecycleStore.getState().syncArtifact(target.id).then(diff => {
            if (diff) {
              sendStreamingResponse(`Synced **${target.data.label}**: ${diff.changes.length} change${diff.changes.length !== 1 ? 's' : ''} applied.`);
            } else {
              sendStreamingResponse(`**${target.data.label}** is already current or has no artifact contract.`);
            }
          });
        } else {
          setProcessing(true);
          setTimeout(() => sendStreamingResponse(`No node matching "${syncMatch[1]}".`), 200);
        }
      }
    } else if (/^(?:diff|preview sync|what(?:'s| would) (?:change|sync)|stale artifacts)\s*$/i.test(prompt)) {
      const stale = useLifecycleStore.getState().previewSync();
      dispatchCommand(prompt, () => {
        if (stale.length === 0) return 'All artifacts are current. Nothing would change.';
        return `**${stale.length} artifact${stale.length > 1 ? 's' : ''} would be synced:**\n${stale.map(s => {
          const node = nodes.find(n => n.id === s.nodeId);
          return `- **${node?.data.label || s.nodeId}** — ${s.reason}`;
        }).join('\n')}\n\nRun \`sync\` to apply changes.`;
      });
    } else if (/^(?:overrides?|show overrides?|list overrides?|my (?:edits|changes|overrides))\s*$/i.test(prompt)) {
      const ctx = useLifecycleStore.getState().centralContext;
      dispatchCommand(prompt, () => {
        if (!ctx || ctx.overrides.length === 0) return 'No overrides recorded. Overrides are tracked when you manually edit CID-managed artifacts.';
        return `**${ctx.overrides.length} override${ctx.overrides.length > 1 ? 's' : ''}:**\n${ctx.overrides.map(o => {
          const node = nodes.find(n => n.id === o.nodeId);
          return `- **${node?.data.label || o.nodeId}** · ${o.field}: "${o.userValue.slice(0, 60)}${o.userValue.length > 60 ? '...' : ''}"${o.cidInterpretation ? ` — *${o.cidInterpretation}*` : ''} (scope: ${o.scope})`;
        }).join('\n')}`;
      });
    } else if (/^interpret\s+override\s+(\S+)\s*$/i.test(prompt)) {
      const match = prompt.match(/^interpret\s+override\s+(\S+)\s*$/i);
      if (match) {
        const overrideId = match[1];
        addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
        setProcessing(true);
        setTimeout(async () => {
          const interpretation = await useLifecycleStore.getState().interpretOverride(overrideId);
          if (interpretation) {
            sendStreamingResponse(`**Override interpreted:**\n\n${interpretation}`);
          } else {
            sendStreamingResponse(`Could not interpret override \`${overrideId}\`. It may not exist or has no context.`);
          }
        }, 300);
      }
    } else if (/^propagate\s+override\s+(\S+)\s+(this-node|all-similar|global)\s*$/i.test(prompt)) {
      const match = prompt.match(/^propagate\s+override\s+(\S+)\s+(this-node|all-similar|global)\s*$/i);
      if (match) {
        const overrideId = match[1];
        const scope = match[2].toLowerCase() as 'this-node' | 'all-similar' | 'global';
        addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
        setProcessing(true);
        setTimeout(async () => {
          await useLifecycleStore.getState().propagateOverride(overrideId, scope);
          sendStreamingResponse(`Override \`${overrideId}\` propagated with scope **${scope}**.`);
        }, 300);
      }
    } else if (/^(?:update|change|edit|modify)\s+(?:the\s+)?(?:source|input|original|context)\b/i.test(prompt)) {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      const newContent = prompt.replace(/^(?:update|change|edit|modify)\s+(?:the\s+)?(?:source|input|original|context)\s*/i, '').trim();
      if (newContent) {
        useLifecycleStore.getState().updateSource(newContent);
      } else {
        setProcessing(true);
        setTimeout(() => sendStreamingResponse('Provide the updated source content after the command. Example: `update source: <new content>`'), 200);
      }
    } else {
      chatWithCID(prompt);
    }
  };

  const handleQuickAction = (prompt: string) => {
    if (isProcessing) return;
    setInput('');

    if (/solve|fix|diagnos|heal|repair/i.test(prompt)) {
      setProcessing(true);
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() });
      if (agent.responses.preInvestigateQuick) {
        addMessage({
          id: `msg-${Date.now()}-inv`, role: 'cid',
          content: agent.responses.preInvestigateQuick,
          timestamp: Date.now(), action: 'investigating',
        });
        setTimeout(() => sendStreamingResponse(cidSolve().message), 1500);
      } else {
        setTimeout(() => sendStreamingResponse(cidSolve().message), 500);
      }
    } else if (/propagat/i.test(prompt)) {
      dispatchCommand(prompt, () => {
        const currentNodes = useLifecycleStore.getState().nodes;
        const sc = currentNodes.filter(n => n.data.status === 'stale').length;
        if (sc > 0) showImpactPreview();
        return sc > 0 ? agent.responses.qaPropagated(sc) : agent.responses.qaPropagateClean();
      }, 500);
    } else if (/optimi/i.test(prompt)) {
      analyzeOptimizations();
      optimizeLayout();
    } else {
      chatWithCID(prompt);
    }
  };

  const handleRefinementClick = (suggestionId: string) => {
    const refinement = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>).__lifecycleRefinement as { parsed: { suggestedNodes?: Array<{ label: string; category: string; content: string }>; suggestedEdges?: Array<{ from: string; to: string; label: string }>; cleanedContent?: string }; noteNodeId: string } | undefined : undefined;
    if (!refinement) return;

    const { parsed, noteNodeId } = refinement;
    const [prefix] = suggestionId.split('|');

    if (prefix === 'refine-clean' && parsed.cleanedContent) {
      applyRefinementSuggestion({ type: 'clean', content: parsed.cleanedContent, nodeId: noteNodeId });
    } else if (prefix.startsWith('refine-node-')) {
      const idx = parseInt(prefix.replace('refine-node-', ''), 10);
      const sn = parsed.suggestedNodes?.[idx];
      if (sn) {
        // Check if there's an edge connecting this new node to an existing one
        const edgeToExisting = parsed.suggestedEdges?.find(
          se => se.from === sn.label && nodes.some(n => n.data.label === se.to)
        );
        applyRefinementSuggestion({
          type: 'node',
          label: sn.label,
          category: sn.category,
          content: sn.content,
          connectTo: edgeToExisting?.to,
          edgeLabel: edgeToExisting?.label,
        });
      }
    } else if (prefix.startsWith('refine-edge-')) {
      const edgesBetweenExisting = parsed.suggestedEdges?.filter(
        se => nodes.some(n => n.data.label === se.from) && nodes.some(n => n.data.label === se.to)
      ) || [];
      const idx = parseInt(prefix.replace('refine-edge-', ''), 10);
      const se = edgesBetweenExisting[idx];
      if (se) {
        applyRefinementSuggestion({ type: 'edge', from: se.from, to: se.to, label: se.label });
      }
    }
  };

  const onCardClick = (card: CIDCard) => {
    if (isProcessing) return;
    handleCardSelect(card.id, card.label);
  };

  if (!showCIDPanel) return null;

  // Find the last message with cards to render active card selection
  const lastCardMessage = [...messages].reverse().find(m => m.cards && m.cards.length > 0);
  const showCards = agent.interviewEnabled && poirotContext.phase === 'interviewing' && lastCardMessage?.cards;

  return (
    <div
      className="h-full flex flex-col border-l border-white/[0.06] bg-[#0c0c14]/95 backdrop-blur-xl relative max-md:!w-full max-md:absolute max-md:inset-0 max-md:z-40 max-md:border-l-0"
      role="complementary"
      aria-label="CID Agent Panel"
      style={{ width: panelWidth }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 group hover:bg-emerald-500/20 active:bg-emerald-500/30 transition-colors"
        title="Drag to resize"
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-white/0 group-hover:bg-white/20 transition-colors" />
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="relative" data-model-picker>
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:ring-2 transition-all ${
                isAmber ? 'bg-amber-500/10 hover:ring-amber-500/30' : 'bg-emerald-500/10 hover:ring-emerald-500/30'
              }`}
              title="Change AI model"
            >
              {isAmber
                ? <Search size={16} className="text-amber-400" />
                : <Bot size={16} className="text-emerald-400" />
              }
            </button>
            {showModelPicker && (
              <div className="absolute top-10 left-0 z-50 w-56 rounded-xl border border-white/[0.1] bg-[#0e0e18]/98 backdrop-blur-xl shadow-2xl py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-1.5 text-[10px] text-white/40 uppercase tracking-wider font-medium">AI Model</div>
                {AI_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setCIDAIModel(m.id); setShowModelPicker(false); }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] transition-colors ${
                      cidAIModel === m.id ? 'bg-white/[0.04]' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-white/80 font-medium">{m.label}</div>
                      <div className="text-[10px] text-white/40">{m.desc}</div>
                    </div>
                    {cidAIModel === m.id && (
                      <Check size={12} className={isAmber ? 'text-amber-400' : 'text-emerald-400'} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
              {agent.name}
              {isAmber
                ? <Search size={12} className="text-amber-400" />
                : <Sparkles size={12} className="text-emerald-400" />
              }
            </div>
            <div className="text-[10px] text-white/45 uppercase tracking-wider flex items-center gap-1.5">
              {agent.subtitle}
              <span className={`inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-medium ${
                aiEnabled
                  ? 'bg-emerald-500/15 text-emerald-400/80'
                  : 'bg-white/[0.06] text-white/25'
              }`}>
                {aiEnabled ? <Wifi size={6} /> : <WifiOff size={6} />}
                {AI_MODELS.find(m => m.id === cidAIModel)?.label.split(' ').slice(-2).join(' ') || 'Sonnet 4'}
              </span>
              {useLifecycleStore.getState().hasContext() && (
                <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-medium bg-cyan-500/15 text-cyan-400/80" title="Source material ingested">
                  🧠 Context
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Switch Agent */}
          <button
            onClick={() => setCIDMode(isAmber ? 'rowan' : 'poirot')}
            title={`Switch to ${isAmber ? 'Rowan' : 'Poirot'}`}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
          >
            <ArrowLeftRight size={13} />
          </button>
          {/* Export */}
          <button
            onClick={() => {
              const text = exportChatHistory();
              const blob = new Blob([text], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `cid-chat-${new Date().toISOString().slice(0, 10)}.txt`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
            title="Export chat"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
          >
            <Download size={12} />
          </button>
          {/* Clear */}
          <button
            onClick={clearMessages}
            title="Clear chat"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-rose-400/60 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 size={12} />
          </button>
          {/* Close */}
          <button
            onClick={toggleCIDPanel}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Stats Bar — only show when workflow has nodes */}
      {statsData && (
        <div className="flex items-center gap-3 px-5 py-1.5 border-b border-white/[0.04] text-[10px] text-white/40">
          <span>{nodes.length} nodes</span>
          <span className="text-white/30">·</span>
          <span>{edges.length} edges</span>
          <span className="text-white/30">·</span>
          <span className={statsData.health >= 80 ? 'text-emerald-400/60' : statsData.health >= 50 ? 'text-amber-400/60' : 'text-rose-400/60'}>{statsData.health}% health</span>
          <span className="text-white/30">·</span>
          <span className="text-white/40">{statsData.complexity.label}</span>
          {statsData.progress.total > 0 && <><span className="text-white/30">·</span><span className="text-cyan-400/50">{statsData.progress.percent}%</span></>}
          {statsData.stale > 0 && <><span className="text-white/30">·</span><span className="text-amber-400/50">{statsData.stale} stale</span></>}
          {statsData.orphans > 0 && <><span className="text-white/30">·</span><span className="text-rose-400/50">{statsData.orphans} orphan{statsData.orphans > 1 ? 's' : ''}</span></>}
        </div>
      )}

      {/* Central Context Summary — collapsible */}
      {useLifecycleStore.getState().hasContext() && (() => {
        const understanding = useLifecycleStore.getState().getUnderstanding();
        const ctx = useLifecycleStore.getState().centralContext;
        if (!understanding || !ctx) return null;
        const artifactCount = Object.keys(ctx.artifacts).length;
        const overrideCount = ctx.overrides.length;
        return (
          <details className="border-b border-white/[0.04]">
            <summary className="flex items-center gap-2 px-5 py-2 cursor-pointer hover:bg-white/[0.02] transition-colors text-[10px] text-cyan-400/60 select-none">
              <Brain size={11} className="flex-shrink-0" />
              <span className="font-medium uppercase tracking-wider">Context</span>
              <span className="text-white/30 ml-auto">{artifactCount} artifact{artifactCount !== 1 ? 's' : ''}{overrideCount > 0 ? ` · ${overrideCount} override${overrideCount !== 1 ? 's' : ''}` : ''}</span>
            </summary>
            <div className="px-5 pb-2.5 space-y-1.5 text-[9.5px]">
              {ctx.source.title && <p className="text-white/60 font-medium">{ctx.source.title}</p>}
              <p className="text-white/35 leading-relaxed">{understanding.summary}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {understanding.keyEntities.slice(0, 6).map((e, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-white/[0.04] text-white/30 text-[8px]">{e}</span>
                ))}
              </div>
              <div className="flex items-center gap-3 text-[8px] text-white/20 mt-1">
                <span>Tone: {understanding.tone}</span>
                <span>Audience: {understanding.audience}</span>
              </div>
            </div>
          </details>
        );
      })()}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin relative"
        onScroll={() => {
          const c = messagesContainerRef.current;
          if (c) setShowScrollDown(c.scrollHeight - c.scrollTop - c.clientHeight > 80);
        }}
      >
        {/* Pinned messages */}
        {pinnedMessageIds.size > 0 && (
          <div className={`mb-3 rounded-lg border px-3 py-2 space-y-1.5 ${
            isAmber ? 'border-amber-500/15 bg-amber-500/[0.03]' : 'border-emerald-500/15 bg-emerald-500/[0.03]'
          }`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Pin size={9} className={isAmber ? 'text-amber-400/50' : 'text-emerald-400/50'} />
              <span className={`text-[9px] font-medium uppercase tracking-wider ${isAmber ? 'text-amber-400/40' : 'text-emerald-400/40'}`}>Pinned</span>
            </div>
            {messages.filter(m => pinnedMessageIds.has(m.id)).map(msg => (
              <div key={`pin-${msg.id}`} className="flex items-start gap-1.5 group/pin">
                <div className="text-[10px] text-white/50 leading-snug flex-1 line-clamp-2">
                  {msg.content.slice(0, 120)}{msg.content.length > 120 ? '...' : ''}
                </div>
                <button
                  onClick={() => togglePinMessage(msg.id)}
                  className="opacity-0 group-hover/pin:opacity-100 text-white/20 hover:text-white/50 transition-all flex-shrink-0 mt-0.5"
                >
                  <X size={8} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Quick-start templates when empty */}
        {messages.length <= 1 && nodes.length === 0 && (
          <div className="space-y-2 mb-4">
            <p className={`text-[11px] ${isAmber ? 'text-amber-400/50' : 'text-emerald-400/50'} font-medium`}>Quick Start</p>
            {[
              'Product launch with PRD, tech spec, and pitch deck',
              'Research workflow with notes and competitive analysis',
              'Design system with components and review gates',
              'Sprint planning with backlog, tasks, and deployment',
            ].map(template => (
              <button
                key={template}
                onClick={() => { setInput(template); inputRef.current?.focus(); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-[11px] transition-all border ${
                  isAmber
                    ? 'border-amber-500/10 text-white/40 hover:text-amber-300/80 hover:bg-amber-500/[0.06] hover:border-amber-500/20'
                    : 'border-emerald-500/10 text-white/40 hover:text-emerald-300/80 hover:bg-emerald-500/[0.06] hover:border-emerald-500/20'
                }`}
              >
                {template}
              </button>
            ))}
          </div>
        )}
        {messages.map((msg, msgIdx) => {
          // Group consecutive CID messages within 2s — show compact spacing
          const prevMsg = msgIdx > 0 ? messages[msgIdx - 1] : null;
          const isGrouped = msg.role === 'cid' && prevMsg?.role === 'cid' && (msg.timestamp - prevMsg.timestamp) < 2000;
          return (
          <div
            key={`${msg.id}-${msgIdx}`}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group/msg${isGrouped ? ' -mt-2.5' : ''}`}
          >
            <div className="max-w-[90%] relative">
              <div
                className={`rounded-xl px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-white/[0.08] text-white/80 rounded-br-sm'
                    : isAmber
                      ? `bg-amber-500/[0.07] border border-amber-500/[0.12] text-white/70 ${isGrouped ? 'rounded-tl-sm rounded-bl-sm border-t-0' : 'rounded-bl-sm'}`
                      : `bg-emerald-500/[0.07] border border-emerald-500/[0.12] text-white/70 ${isGrouped ? 'rounded-tl-sm rounded-bl-sm border-t-0' : 'rounded-bl-sm'}`
                }`}
              >
                {msg.role === 'cid' && msg.action === 'thinking' && (
                  <div className={`flex items-center gap-2 mb-1 ${isAmber ? 'text-amber-400/70' : 'text-emerald-400/70'}`}>
                    <Loader2 size={11} className="animate-spin" />
                    <span className="text-[10px] uppercase tracking-wider font-medium">
                      {agent.thinkingLabel}
                    </span>
                  </div>
                )}
                {msg.role === 'cid' && msg.action === 'building' && (
                  <div className={`flex items-center gap-2 ${isAmber ? 'text-amber-400/70' : 'text-emerald-400/70'}`}>
                    <Loader2 size={11} className="animate-spin" />
                    <span className="text-[10px] font-medium tracking-wide">
                      {msg.content || 'Building...'}
                    </span>
                  </div>
                )}
                {msg.role === 'cid' && msg.action === 'investigating' && (
                  <div className="flex items-center gap-2 text-amber-400/70 mb-1">
                    <Search size={11} className="animate-pulse" />
                    <span className="text-[10px] uppercase tracking-wider font-medium">{agent.investigatingLabel}</span>
                  </div>
                )}
                {msg.role === 'cid' && msg.action !== 'building' ? renderMarkdown(msg.content, nodeNameMap, (id) => selectNode(id)) : msg.action !== 'building' ? msg.content : null}
                {msg.role === 'cid' && msg.content === '' && !msg.action && (
                  <span className={`inline-block w-1.5 h-3.5 animate-pulse rounded-sm ${
                    isAmber ? 'bg-amber-400/50' : 'bg-emerald-400/50'
                  }`} />
                )}
              </div>
              {/* Timestamp — visible on hover */}
              <div className={`mt-0.5 text-[9px] text-white/0 group-hover/msg:text-white/20 transition-colors ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                {relativeTime(msg.timestamp)}
              </div>
              {/* Suggestion chips */}
              {msg.suggestions && msg.suggestions.length > 0 && !isProcessing && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.suggestions.map(s => {
                    // Refinement suggestion: "refine-node-0|Create: Label" or "refine-edge-0|Connect: X → Y" or "refine-clean|Update note content"
                    const isRefinement = s.startsWith('refine-');
                    // Proactive action suggestion: "action:id|Chip Label"
                    const isAction = s.startsWith('action:');
                    const displayLabel = isRefinement || isAction ? s.split('|')[1] || s : s;
                    return (
                      <button
                        key={s}
                        onClick={() => {
                          if (isAction) {
                            const actionId = s.split('|')[0].replace('action:', '');
                            if (actionId.startsWith('opt-')) {
                              applyOptimization(actionId);
                            } else {
                              applySuggestion(actionId);
                            }
                          } else if (isRefinement) {
                            handleRefinementClick(s);
                          } else {
                            pendingSuggestionRef.current = s;
                            setInput(s);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] border transition-all hover:scale-[1.03] ${
                          isRefinement
                            ? 'border-violet-500/20 text-violet-400/70 bg-violet-500/[0.06] hover:bg-violet-500/[0.12]'
                            : isAction
                              ? 'border-cyan-500/20 text-cyan-400/70 bg-cyan-500/[0.06] hover:bg-cyan-500/[0.12]'
                              : isAmber
                                ? 'border-amber-500/20 text-amber-400/70 bg-amber-500/[0.06] hover:bg-amber-500/[0.12]'
                                : 'border-emerald-500/20 text-emerald-400/70 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12]'
                        }`}
                      >
                        {displayLabel}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Pin button on CID messages */}
              {msg.role === 'cid' && msg.content && (
                <button
                  onClick={() => togglePinMessage(msg.id)}
                  title={pinnedMessageIds.has(msg.id) ? 'Unpin' : 'Pin'}
                  className={`absolute -right-6 top-1 opacity-0 group-hover/msg:opacity-100 w-5 h-5 rounded flex items-center justify-center transition-all ${
                    pinnedMessageIds.has(msg.id)
                      ? isAmber ? 'text-amber-400/70' : 'text-emerald-400/70'
                      : 'text-white/20 hover:text-white/50'
                  }`}
                >
                  <Pin size={10} />
                </button>
              )}
              {/* Edit button on user messages */}
              {msg.role === 'user' && !isProcessing && (
                <button
                  onClick={() => {
                    setInput(msg.content);
                    deleteMessage(msg.id);
                    inputRef.current?.focus();
                  }}
                  title="Edit & resend"
                  className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 w-5 h-5 rounded flex items-center justify-center text-white/20 hover:text-white/50 transition-all"
                >
                  <Pencil size={10} />
                </button>
              )}
            </div>
          </div>
          );
        })}

        {/* Selection Cards */}
        {showCards && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 gap-2 pt-1"
          >
            {lastCardMessage!.cards!.map((card) => (
              <button
                key={card.id}
                onClick={() => onCardClick(card)}
                disabled={isProcessing}
                className="text-left p-3 rounded-xl border border-amber-500/[0.15] bg-amber-500/[0.04] hover:bg-amber-500/[0.1] hover:border-amber-500/[0.3] transition-all group disabled:opacity-30"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-amber-300/90">{card.label}</span>
                  <ChevronRight size={10} className="text-amber-400/30 group-hover:text-amber-400/60 transition-colors" />
                </div>
                {card.description && (
                  <span className="text-[9.5px] text-white/45 leading-snug">{card.description}</span>
                )}
              </button>
            ))}
          </motion.div>
        )}

        {/* Typing indicator — only before streaming text arrives */}
        {isProcessing && !messages.some(m => m.action === 'thinking' || m.action === 'investigating' || m.action === 'building') && !(messages.length > 0 && messages[messages.length - 1].role === 'cid' && messages[messages.length - 1].content) && (
          <div className="flex justify-start">
            <div className={`rounded-xl px-3.5 py-2 text-[12px] rounded-bl-sm ${
              isAmber
                ? 'bg-amber-500/[0.07] border border-amber-500/[0.12]'
                : 'bg-emerald-500/[0.07] border border-emerald-500/[0.12]'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium ${isAmber ? 'text-amber-400/70' : 'text-emerald-400/70'}`}>
                  {isAmber ? 'Poirot' : 'Rowan'}
                </span>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isAmber ? 'bg-amber-400/60' : 'bg-emerald-400/60'}`} style={{ animationDelay: '0ms' }} />
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isAmber ? 'bg-amber-400/60' : 'bg-emerald-400/60'}`} style={{ animationDelay: '150ms' }} />
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isAmber ? 'bg-amber-400/60' : 'bg-emerald-400/60'}`} style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom indicator */}
      {showScrollDown && (
        <div className="px-4 py-1 flex justify-center">
          <button
            onClick={() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              setShowScrollDown(false);
            }}
            className={`text-[10px] px-3 py-1 rounded-full border transition-colors ${
              isAmber
                ? 'border-amber-500/20 text-amber-400/70 bg-amber-500/10 hover:bg-amber-500/20'
                : 'border-emerald-500/20 text-emerald-400/70 bg-emerald-500/10 hover:bg-emerald-500/20'
            }`}
          >
            New messages below
          </button>
        </div>
      )}

      {/* Quick Actions — only show when there are nodes */}
      {nodes.length > 0 && (
        <div className="px-4 py-2 border-t border-white/[0.04]">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => handleQuickAction(action.prompt)}
                disabled={isProcessing}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px] text-white/45 hover:text-white/70 hover:bg-white/[0.07] hover:border-white/[0.1] transition-all whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/[0.04] disabled:hover:text-white/45`}
              >
                <action.icon size={10} />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 relative">
        {/* Autocomplete hints */}
        {matchingHints.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-1 rounded-lg border border-white/[0.08] bg-[#0e0e18]/95 backdrop-blur-xl overflow-hidden overflow-y-auto max-h-[300px] shadow-xl z-10">
            {matchingHints.map((h, i) => (
              <div key={h.trigger + i}>
                {'section' in h && h.section && (
                  <div className="px-3 py-1 text-[9px] text-white/35 uppercase tracking-wider font-medium border-t border-white/[0.04] first:border-t-0">
                    {h.section}
                  </div>
                )}
                <button
                  onClick={() => { setInput(h.trigger + ' '); inputRef.current?.focus(); }}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-white/50 hover:text-white/80 hover:bg-white/[0.05] transition-colors"
                >
                  {h.label}
                </button>
              </div>
            ))}
          </div>
        )}
        {/* File upload preview banner */}
        {uploadedFile && (
          <div className="flex items-center gap-2 px-3 py-1.5 mb-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-[11px]">
            <FileText size={12} className="text-cyan-400 shrink-0" />
            <span className="text-cyan-300 truncate">{uploadedFile.name}</span>
            <span className="text-cyan-500/60 shrink-0">{uploadedFile.sections}s ~{uploadedFile.tokens}t</span>
            <button onClick={() => setUploadedFile(null)} className="ml-auto text-cyan-500/40 hover:text-cyan-300 transition-colors">
              <XCircle size={12} />
            </button>
          </div>
        )}
        <div className={`flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 transition-colors ${
          isAmber ? 'focus-within:border-amber-500/30' : 'focus-within:border-emerald-500/30'
        }`}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />
          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isProcessing}
            title="Upload document (PDF, DOCX, TXT)"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors disabled:opacity-20"
          >
            {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
          </button>
          <input
            ref={inputRef}
            data-cid-input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
              if (e.key === 'Tab' && matchingHints.length > 0) {
                e.preventDefault();
                setInput(matchingHints[0].trigger + ' ');
              }
              if (e.key === 'Escape' && matchingHints.length > 0) setInput('');
              if (e.key === 'ArrowUp' && inputHistory.length > 0 && !matchingHints.length) {
                e.preventDefault();
                const next = Math.min(historyIndex + 1, inputHistory.length - 1);
                setHistoryIndex(next);
                setInput(inputHistory[next]);
              }
              if (e.key === 'ArrowDown' && historyIndex >= 0) {
                e.preventDefault();
                const next = historyIndex - 1;
                setHistoryIndex(next);
                setInput(next >= 0 ? inputHistory[next] : '');
              }
            }}
            placeholder={poirotContext.phase === 'interviewing' ? agent.placeholderInterviewing : agent.placeholder}
            disabled={isProcessing}
            className="flex-1 bg-transparent text-[12.5px] text-white/80 placeholder-white/30 outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          />
          {isProcessing ? (
            <button
              onClick={() => { cleanupRef.current?.(); stopProcessing(); }}
              title="Stop"
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors"
            >
              <Square size={11} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-20 ${
                isAmber
                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
              }`}
            >
              <Send size={13} />
            </button>
          )}
        </div>
        <p className="text-[10px] text-white/40 mt-2 text-center">
          {agent.footerText} · Tab to autocomplete
        </p>
      </div>
    </div>
  );
}
