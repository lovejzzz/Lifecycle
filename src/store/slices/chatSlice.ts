/**
 * Chat Slice — message management, chat search/export.
 * CID IS the product. The canvas is CID's visual workspace.
 * Cross-slice dependencies: cidMode, nodes, edges, events, messages (via get()).
 *
 * NOTE: chatWithCID remains in useStore.ts because it depends on module-private state
 * (sessionGeneration, loadedHabits, runReflection, refreshGenerationContext, getAgentLayers,
 * recordBuild, streamMessageToStore, postBuildFinalize). Extracting it would require
 * exporting those module-private items first.
 */

import type { StateCreator } from 'zustand';
import type { LifecycleStore } from '../types';
import { getAgent } from '@/lib/agents';
import { saveToStorage } from '../useStore';

export interface ChatSlice {
  // State is shared (messages lives on LifecycleStore) — slice only manages actions
  addMessage: (message: import('@/lib/types').CIDMessage) => void;
  updateStreamingMessage: (id: string, content: string) => void;
  clearMessages: () => void;
  exportChatHistory: () => string;
  exportChatMarkdown: () => string;
  searchMessages: (query: string) => string;
  deleteMessage: (id: string) => void;
}

export const createChatSlice: StateCreator<LifecycleStore, [], [], ChatSlice> = (set, get) => ({
  addMessage: (message) =>
    set((s) => {
      const messages = [...s.messages, message];
      saveToStorage({ nodes: s.nodes, edges: s.edges, events: s.events, messages });
      return { messages };
    }),

  updateStreamingMessage: (id, content) =>
    set((s) => {
      const messages = s.messages.map((m) => (m.id === id ? { ...m, content } : m));
      // Only persist at key intervals to avoid thrashing localStorage during streaming
      if (content.split(' ').length % 10 === 0) {
        saveToStorage({ nodes: s.nodes, edges: s.edges, events: s.events, messages });
      }
      return { messages };
    }),

  clearMessages: () => {
    const agent = getAgent(get().cidMode);
    set({
      messages: [
        {
          id: `msg-${Date.now()}`,
          role: 'cid' as const,
          content: agent.welcome,
          timestamp: Date.now(),
        },
      ],
    });
    const s = get();
    saveToStorage({ nodes: s.nodes, edges: s.edges, events: s.events, messages: s.messages });
  },

  exportChatHistory: () => {
    const { messages, cidMode } = get();
    const agent = getAgent(cidMode);
    const lines = [
      `Chat History — ${agent.name}`,
      `Exported: ${new Date().toLocaleString()}`,
      '---',
      '',
    ];
    messages.forEach((m) => {
      if (m.action === 'thinking' || m.action === 'investigating' || m.action === 'building')
        return;
      const sender = m.role === 'user' ? 'You' : agent.name;
      lines.push(`[${sender}] ${m.content}`);
      lines.push('');
    });
    return lines.join('\n');
  },

  exportChatMarkdown: () => {
    const { messages, cidMode } = get();
    if (messages.length === 0) return '';
    const agentName = cidMode === 'poirot' ? 'Poirot' : 'Rowan';
    const lines: string[] = [
      `# Lifecycle Agent — CID (${agentName}) Conversation`,
      `*Exported ${new Date().toLocaleString()}*`,
      '',
      '---',
      '',
    ];
    for (const m of messages) {
      const time = new Date(m.timestamp).toLocaleTimeString();
      if (m.role === 'user') {
        lines.push(`### You (${time})`);
      } else {
        lines.push(`### CID (${time})`);
      }
      lines.push('', m.content, '');
    }
    return lines.join('\n');
  },

  searchMessages: (query: string) => {
    const { messages } = get();
    const q = query.toLowerCase();
    const matches = messages.filter((m) => m.content.toLowerCase().includes(q));
    if (matches.length === 0) return `No messages matching "${query}".`;
    const parts: string[] = [
      `### Search: "${query}" (${matches.length} result${matches.length > 1 ? 's' : ''})`,
      '',
    ];
    for (const m of matches.slice(-8)) {
      const who = m.role === 'user' ? '**You**' : '**CID**';
      const preview = m.content.slice(0, 120).replace(/\n/g, ' ');
      parts.push(`- ${who}: ${preview}${m.content.length > 120 ? '...' : ''}`);
    }
    if (matches.length > 8) parts.push(`\n*...and ${matches.length - 8} more*`);
    return parts.join('\n');
  },

  deleteMessage: (id: string) =>
    set((s) => {
      const messages = s.messages.filter((m) => m.id !== id);
      saveToStorage({ nodes: s.nodes, edges: s.edges, events: s.events, messages });
      return { messages };
    }),
});
