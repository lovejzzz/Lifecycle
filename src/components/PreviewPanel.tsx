'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, X, Send, Loader2, RotateCcw, ChevronRight, Sparkles,
} from 'lucide-react';
import { useLifecycleStore } from '@/store/useStore';
import { getAgent } from '@/lib/agents';
import { renderMarkdown } from '@/lib/markdown';

interface PreviewMessage {
  id: string;
  role: 'user' | 'bot' | 'system';
  content: string;
  timestamp: number;
  nodeTrace?: { name: string; durationMs: number | null }[];
  totalDurationMs?: number;
}

export default function PreviewPanel() {
  const {
    nodes, edges, showPreviewPanel, togglePreviewPanel, cidMode,
    executeNode, cidAIModel,
  } = useLifecycleStore();

  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const agent = getAgent(cidMode);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (showPreviewPanel) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [showPreviewPanel]);

  // Find input and output nodes for the workflow
  const inputNode = nodes.find(n => n.data.category === 'input');
  const outputNode = nodes.find(n => n.data.category === 'output');

  // Get topological order of nodes for execution
  const getExecutionOrder = useCallback(() => {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const n of nodes) {
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    }
    for (const e of edges) {
      adj.get(e.source)?.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
    const queue = nodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);
    const order: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      for (const next of (adj.get(current) || [])) {
        const newDeg = (inDegree.get(next) || 1) - 1;
        inDegree.set(next, newDeg);
        if (newDeg === 0) queue.push(next);
      }
    }
    return order;
  }, [nodes, edges]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isRunning) return;

    const userMsg: PreviewMessage = {
      id: `prev-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsRunning(true);

    try {
      // Inject user message into input node content
      if (inputNode) {
        useLifecycleStore.getState().updateNodeData(inputNode.id, {
          content: trimmed,
          executionResult: trimmed,
        });
      }

      // Execute nodes in topological order
      const order = getExecutionOrder();
      const trace: { name: string; durationMs: number | null }[] = [];
      const errors: string[] = [];
      const workflowStart = Date.now();

      for (const nodeId of order) {
        const node = useLifecycleStore.getState().nodes.find(n => n.id === nodeId);
        if (!node) continue;

        // Skip note nodes
        if (node.data.category === 'note') continue;

        setActiveNodeId(nodeId);

        // Skip input node (already set content)
        if (node.data.category === 'input') {
          trace.push({ name: node.data.label, durationMs: 0 });
          continue;
        }

        try {
          await executeNode(nodeId);
          // Check if this node errored
          const updated = useLifecycleStore.getState().nodes.find(n => n.id === nodeId);
          trace.push({ name: node.data.label, durationMs: updated?.data._executionDurationMs ?? null });
          if (updated?.data.executionStatus === 'error') {
            errors.push(`${node.data.label}: ${updated.data.executionError || 'failed'}`);
          }
        } catch (e) {
          trace.push({ name: node.data.label, durationMs: null });
          errors.push(`${node.data.label}: ${e instanceof Error ? e.message : 'failed'}`);
        }
      }

      setActiveNodeId(null);
      const totalDurationMs = Date.now() - workflowStart;

      // Find the best response to display
      const store = useLifecycleStore.getState();
      const executedNodes = order
        .map(id => store.nodes.find(n => n.id === id))
        .filter((n): n is NonNullable<typeof n> => !!n && !!n.data.executionResult);

      // Priority: output node > last cid node > last node with result
      const outNode = executedNodes.find(n => n.data.category === 'output');
      const lastCidNode = [...executedNodes].reverse().find(n => n.data.category === 'cid');
      const bestNode = outNode || lastCidNode || executedNodes[executedNodes.length - 1];
      let botResponse = bestNode?.data.executionResult || '';

      // If the output node's result is very long (verbose passthrough from policy/action nodes),
      // prefer the last cid node's cleaner response
      if (outNode && lastCidNode && outNode.data.executionResult
        && lastCidNode.data.executionResult
        && outNode.data.executionResult.length > lastCidNode.data.executionResult.length * 3) {
        botResponse = lastCidNode.data.executionResult;
      }

      if (!botResponse && errors.length > 0) {
        botResponse = `Workflow execution had errors:\n${errors.map(e => `- ${e}`).join('\n')}`;
      } else if (!botResponse) {
        botResponse = 'No output generated. Check that your workflow nodes are connected and an API key is configured.';
      }

      const botMsg: PreviewMessage = {
        id: `prev-${Date.now()}-bot`,
        role: 'bot',
        content: botResponse,
        timestamp: Date.now(),
        nodeTrace: trace,
        totalDurationMs,
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      const errMsg: PreviewMessage = {
        id: `prev-${Date.now()}-err`,
        role: 'system',
        content: `Execution error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsRunning(false);
      setActiveNodeId(null);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput('');
    setActiveNodeId(null);
  };

  if (!showPreviewPanel) return null;

  const hasWorkflow = nodes.length >= 2;
  const activeNode = nodes.find(n => n.id === activeNodeId);

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed right-0 top-0 bottom-0 w-[380px] bg-[#0c0c14]/95 backdrop-blur-xl border-l border-white/[0.06] z-40 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
            agent.accent === 'amber'
              ? 'bg-amber-500/15 border border-amber-500/20'
              : 'bg-emerald-500/15 border border-emerald-500/20'
          }`}>
            <Play size={10} className={agent.accent === 'amber' ? 'text-amber-400' : 'text-emerald-400'} />
          </div>
          <div>
            <span className="text-[12px] font-semibold text-white/90">Preview</span>
            <span className="text-[9px] text-white/30 ml-2">Test your workflow</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors"
            title="Reset conversation"
          >
            <RotateCcw size={12} />
          </button>
          <button
            onClick={togglePreviewPanel}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Active node indicator */}
      <AnimatePresence>
        {activeNodeId && activeNode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-2 border-b border-white/[0.04] bg-white/[0.02] overflow-hidden"
          >
            <div className="flex items-center gap-2 text-[10px]">
              <Loader2 size={10} className="text-cyan-400 animate-spin" />
              <span className="text-white/40">Running</span>
              <span className="text-cyan-400/70 font-medium">{activeNode.data.label}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin">
        {!hasWorkflow ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <Sparkles size={24} className="text-white/10" />
            <div className="text-[11px] text-white/25 leading-relaxed max-w-[240px]">
              Build a workflow with at least an <span className="text-emerald-400/50">input</span> and <span className="text-emerald-400/50">output</span> node, then preview it here.
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <Play size={24} className="text-white/10" />
            <div className="text-[11px] text-white/25 leading-relaxed max-w-[240px]">
              Send a message to test your workflow end-to-end.
              {inputNode && (
                <span className="block mt-1 text-white/15">
                  Input: <span className="text-cyan-400/40">{inputNode.data.label}</span>
                  {outputNode && <> &rarr; Output: <span className="text-cyan-400/40">{outputNode.data.label}</span></>}
                </span>
              )}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                msg.role === 'user'
                  ? agent.accent === 'amber'
                    ? 'bg-amber-500/10 border border-amber-500/15 text-white/80'
                    : 'bg-emerald-500/10 border border-emerald-500/15 text-white/80'
                  : msg.role === 'system'
                    ? 'bg-rose-500/10 border border-rose-500/15 text-rose-300/70'
                    : 'bg-white/[0.04] border border-white/[0.06] text-white/70'
              }`}>
                <div className="text-[11px] leading-relaxed">
                  {msg.role === 'user' ? msg.content : renderMarkdown(msg.content)}
                </div>
                {msg.nodeTrace && msg.nodeTrace.length > 0 && (
                  <div className="mt-2 pt-1.5 border-t border-white/[0.04]">
                    <div className="flex flex-wrap gap-1">
                      {msg.nodeTrace.map((t, i) => (
                        <span key={i} className="flex items-center gap-0.5 text-[8px] text-white/20">
                          {i > 0 && <ChevronRight size={7} className="text-white/10" />}
                          {t.name}
                          {t.durationMs != null && t.durationMs > 0 && (
                            <span className="text-white/10 font-mono ml-0.5">
                              {t.durationMs < 1000 ? `${t.durationMs}ms` : `${(t.durationMs / 1000).toFixed(1)}s`}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                    {msg.totalDurationMs != null && (
                      <div className="text-[7px] text-white/15 mt-1 font-mono">
                        Total: {msg.totalDurationMs < 1000 ? `${msg.totalDurationMs}ms` : `${(msg.totalDurationMs / 1000).toFixed(1)}s`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isRunning && (
          <div className="flex justify-start">
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <Loader2 size={11} className="text-white/30 animate-spin" />
                <span className="text-[10px] text-white/30">Processing workflow...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${
          agent.accent === 'amber'
            ? 'border-amber-500/15 bg-amber-500/[0.03] focus-within:border-amber-500/30'
            : 'border-emerald-500/15 bg-emerald-500/[0.03] focus-within:border-emerald-500/30'
        }`}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={hasWorkflow ? 'Type a message to test...' : 'Build a workflow first...'}
            disabled={!hasWorkflow || isRunning}
            className="flex-1 bg-transparent text-[11px] text-white/80 placeholder:text-white/20 outline-none disabled:opacity-40"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isRunning || !hasWorkflow}
            className={`p-1.5 rounded-lg transition-colors disabled:opacity-20 ${
              agent.accent === 'amber'
                ? 'text-amber-400/60 hover:bg-amber-500/10'
                : 'text-emerald-400/60 hover:bg-emerald-500/10'
            }`}
          >
            {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[8px] text-white/15">
            {nodes.length} nodes &middot; {edges.length} edges &middot; {cidAIModel}
          </span>
          {messages.length > 0 && (
            <button onClick={handleReset} className="text-[8px] text-white/15 hover:text-white/30 transition-colors">
              Clear chat
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
