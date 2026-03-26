/**
 * Artifact Slice — artifact preview panel, version history, rewrite, downstream.
 * Cross-slice dependencies: pushHistory, updateNodeData, addEvent (via get()).
 */

import type { StateCreator } from 'zustand';
import type { Node } from '@xyflow/react';
import type { LifecycleStore } from '../types';
import type { NodeData } from '@/lib/types';
import { topoSort } from '@/lib/graph';
import { cidLog } from '../helpers';

export interface ArtifactSlice {
  activeArtifactNodeId: string | null;
  artifactPanelTab: 'content' | 'result';
  artifactPanelMode: 'preview' | 'edit';
  artifactReadingMode: boolean;
  artifactVersions: Record<string, Array<{ content: string; result?: string; timestamp: number; label: string }>>;
  openArtifactPanel: (nodeId: string) => void;
  closeArtifactPanel: () => void;
  setArtifactTab: (tab: 'content' | 'result') => void;
  setArtifactMode: (mode: 'preview' | 'edit') => void;
  setArtifactReadingMode: (on: boolean) => void;
  getExecutedNodesInOrder: () => Array<{ id: string; label: string; category: string }>;
  saveArtifactVersion: (nodeId: string) => void;
  restoreArtifactVersion: (nodeId: string, versionIndex: number) => void;
  rewriteArtifactSelection: (nodeId: string, selectedText: string, instruction: string) => Promise<string | null>;
  getDownstreamNodes: (nodeId: string) => Array<{ id: string; label: string; category: string }>;
}

export const createArtifactSlice: StateCreator<LifecycleStore, [], [], ArtifactSlice> = (set, get) => ({
  activeArtifactNodeId: null,
  artifactPanelTab: 'content' as const,
  artifactPanelMode: 'preview' as const,
  artifactReadingMode: false,
  artifactVersions: {},

  openArtifactPanel: (nodeId) => {
    const node = get().nodes.find(n => n.id === nodeId);
    if (!node) return;
    const versions = get().artifactVersions;
    if (!versions[nodeId]) {
      versions[nodeId] = [{
        content: node.data.content || '',
        result: node.data.executionResult || '',
        timestamp: Date.now(),
        label: 'Initial',
      }];
    }
    set({
      activeArtifactNodeId: nodeId,
      artifactPanelTab: node.data.executionResult ? 'result' : 'content',
      artifactPanelMode: 'preview',
      artifactVersions: { ...versions },
    });
    cidLog('artifactPanel', `opened for "${node.data.label}"`);
  },

  closeArtifactPanel: () => set({ activeArtifactNodeId: null }),

  setArtifactTab: (tab) => set({ artifactPanelTab: tab }),
  setArtifactMode: (mode) => set({ artifactPanelMode: mode }),
  setArtifactReadingMode: (on) => set({ artifactReadingMode: on }),

  getExecutedNodesInOrder: () => {
    const { nodes, edges } = get();
    const { order } = topoSort(nodes, edges);
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    return order
      .map(id => nodeById.get(id))
      .filter((n): n is Node<NodeData> => !!n && !!(n.data.executionResult || n.data.content))
      .map(n => ({ id: n.id, label: n.data.label, category: n.data.category }));
  },

  saveArtifactVersion: (nodeId) => {
    const node = get().nodes.find(n => n.id === nodeId);
    if (!node) return;
    const versions = { ...get().artifactVersions };
    const history = versions[nodeId] || [];
    history.push({
      content: node.data.content || '',
      result: node.data.executionResult || '',
      timestamp: Date.now(),
      label: `v${history.length}`,
    });
    if (history.length > 20) history.splice(0, history.length - 20);
    versions[nodeId] = history;
    set({ artifactVersions: versions });
    cidLog('artifactVersion', `saved v${history.length - 1} for "${node.data.label}"`);
  },

  restoreArtifactVersion: (nodeId, versionIndex) => {
    const versions = get().artifactVersions[nodeId];
    if (!versions || !versions[versionIndex]) return;
    const version = versions[versionIndex];
    const { pushHistory, updateNodeData, addEvent, nodes } = get();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    pushHistory();
    const updates: Partial<NodeData> = { content: version.content };
    if (version.result) updates.executionResult = version.result;
    updateNodeData(nodeId, updates);
    addEvent({ id: `ev-${Date.now()}`, type: 'edited', message: `Restored ${version.label} of "${node.data.label}"`, timestamp: Date.now(), nodeId, agent: false });
    cidLog('artifactRestore', `restored ${version.label} for "${node.data.label}"`);
  },

  rewriteArtifactSelection: async (nodeId, selectedText, instruction) => {
    const { cidAIModel, nodes } = get();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;
    const tab = get().artifactPanelTab;
    const fullText = tab === 'result' ? (node.data.executionResult || '') : (node.data.content || '');

    try {
      const res = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: 'You are a rewriting assistant. Rewrite ONLY the selected text according to the instruction. Return ONLY the rewritten text — no JSON, no explanation, no wrapping.',
          messages: [{ role: 'user', content: `SELECTED TEXT:\n"${selectedText}"\n\nINSTRUCTION: ${instruction}\n\nFULL CONTEXT (do not rewrite this, only the selected text):\n${fullText.slice(0, 2000)}` }],
          model: cidAIModel,
          taskType: 'analyze',
        }),
      });
      const data = await res.json();
      const rewritten = data.result?.message || data.result?.content || null;
      if (!rewritten) return null;

      const newText = fullText.replace(selectedText, rewritten);
      const { pushHistory, updateNodeData, saveArtifactVersion } = get();
      pushHistory();
      saveArtifactVersion(nodeId);
      if (tab === 'result') {
        updateNodeData(nodeId, { executionResult: newText });
      } else {
        updateNodeData(nodeId, { content: newText });
      }
      cidLog('artifactRewrite', `rewrote ${selectedText.length}c → ${rewritten.length}c in "${node.data.label}"`);
      return rewritten;
    } catch (err) {
      console.error('[Artifact] Rewrite failed:', err);
      return null;
    }
  },

  getDownstreamNodes: (nodeId) => {
    const { nodes, edges } = get();
    const downstream: Array<{ id: string; label: string; category: string }> = [];
    const visited = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of edges) {
        if (edge.source === current && !visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
          const n = nodes.find(nd => nd.id === edge.target);
          if (n) downstream.push({ id: n.id, label: n.data.label, category: n.data.category });
        }
      }
    }
    return downstream;
  },
});
