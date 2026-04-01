/**
 * Central Brain Slice — source ingestion, artifact generation, sync, overrides.
 * CID IS the product. The canvas is CID's visual workspace.
 * Cross-slice dependencies: setProcessing, addMessage, trackCost, pushHistory, updateNodeData,
 *   requestFitView, nodes, edges, events, messages, cidAIModel, cidMode (via get()).
 */

import type { StateCreator } from 'zustand';
import type { Node } from '@xyflow/react';
import type { LifecycleStore } from '../types';
import type {
  NodeData,
  NodeCategory,
  CentralContext,
  ArtifactContract,
  SurgicalDiff,
  Override,
} from '@/lib/types';
import { callCID } from '@/lib/cidClient';
import { getAgent } from '@/lib/agents';
import { cidLog } from '../helpers';
import { uid, saveToStorage } from '../useStore';

export interface CentralBrainSlice {
  centralContext: CentralContext | null;
  ingestSource: (
    input: string,
    contentType: 'text' | 'url' | 'file' | 'conversation',
    title?: string,
  ) => Promise<void>;
  updateSource: (newContent: string) => Promise<void>;
  getUnderstanding: () => CentralContext['understanding'] | null;
  createArtifact: (artifactType: string, customPrompt?: string) => Promise<string | null>;
  syncArtifact: (nodeId: string) => Promise<SurgicalDiff | null>;
  syncAllStale: () => Promise<SurgicalDiff[]>;
  previewSync: () => { nodeId: string; reason: string }[];
  recordOverride: (nodeId: string, field: string, oldVal: string, newVal: string) => void;
  interpretOverride: (overrideId: string) => Promise<string | null>;
  propagateOverride: (
    overrideId: string,
    scope: 'this-node' | 'all-similar' | 'global',
  ) => Promise<void>;
  forgetOverride: (overrideId: string) => void;
  getArtifactContracts: () => Record<string, ArtifactContract>;
  hasContext: () => boolean;
}

export const createCentralBrainSlice: StateCreator<LifecycleStore, [], [], CentralBrainSlice> = (
  set,
  get,
) => ({
  centralContext: null,

  hasContext: () => !!get().centralContext,

  getUnderstanding: () => get().centralContext?.understanding ?? null,

  getArtifactContracts: () => get().centralContext?.artifacts ?? {},

  ingestSource: async (input, contentType, title) => {
    const store = get();
    cidLog('ingestSource', { contentType, length: input.length, title });
    store.setProcessing(true);

    const thinkingId = uid();
    store.addMessage({
      id: thinkingId,
      role: 'cid',
      content: '',
      timestamp: Date.now(),
      action: 'analyzing',
    });

    try {
      const _agent = getAgent(store.cidMode);
      const systemPrompt = `You are CID, an AI agent analyzing source material for a content lifecycle system.

Analyze the following source material and return a JSON object with this exact structure:
{
  "summary": "2-3 sentence summary of the content",
  "keyEntities": ["entity1", "entity2"],
  "tone": "professional|casual|technical|academic|playful",
  "audience": "who this content is for",
  "intent": "what the author is trying to achieve",
  "constraints": ["things to preserve or respect"],
  "suggestedArtifacts": ["blog-post", "email", "social-thread", "ad-copy", "press-release", "landing-page", "newsletter", "product-description"]
}

Only suggest artifact types that make sense for this content. Be specific about tone, audience, and intent.
Return ONLY valid JSON, no other text.`;

      const data = await callCID({
        systemPrompt,
        messages: [
          { role: 'user', content: `Analyze this source material:\n\n${input.slice(0, 8000)}` },
        ],
        model: store.cidAIModel,
        taskType: 'generate',
        timeout: 90000,
      });
      if (data.usage)
        store.trackCost(data.usage.prompt_tokens, data.usage.completion_tokens, store.cidAIModel);
      set((s) => ({ messages: s.messages.filter((m) => m.id !== thinkingId) }));

      let understanding;
      if (data.result) {
        const raw =
          typeof data.result === 'string'
            ? data.result
            : data.result.message || JSON.stringify(data.result);
        try {
          // Extract JSON from response (handle markdown code blocks)
          const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
          understanding = JSON.parse(jsonMatch[1]!.trim());
        } catch {
          // Fallback: basic understanding without AI
          understanding = {
            summary: input.slice(0, 200) + '...',
            keyEntities: [],
            tone: 'professional',
            audience: 'general',
            intent: 'content creation',
            constraints: [],
            suggestedArtifacts: ['blog-post', 'email', 'social-thread'],
          };
        }
      } else {
        understanding = {
          summary: input.slice(0, 200) + '...',
          keyEntities: [],
          tone: 'professional',
          audience: 'general',
          intent: 'content creation',
          constraints: [],
          suggestedArtifacts: ['blog-post', 'email', 'social-thread'],
        };
      }

      // Simple hash of source content for change detection
      const _sourceHash = btoa(input.slice(0, 500)).slice(0, 32);

      const newContext: CentralContext = {
        source: {
          content: input,
          contentType,
          title: title || understanding.keyEntities?.[0] || 'Untitled',
          lastUpdated: Date.now(),
        },
        understanding,
        artifacts: get().centralContext?.artifacts ?? {},
        overrides: get().centralContext?.overrides ?? [],
      };

      set({ centralContext: newContext, isProcessing: false });
      saveToStorage({
        nodes: store.nodes,
        edges: store.edges,
        events: store.events,
        messages: store.messages,
      });

      // Build response message with suggestions
      const artifactSuggestions = understanding.suggestedArtifacts?.slice(0, 6) || [];
      const _agentObj = getAgent(store.cidMode);
      const emoji = store.cidMode === 'rowan' ? '\u{1F3AF}' : '\u{1F50D}';
      const responseMsg = `${emoji} **Source ingested.** Here's what I understand:

**Summary:** ${understanding.summary}
**Tone:** ${understanding.tone} \u00B7 **Audience:** ${understanding.audience}
**Key entities:** ${understanding.keyEntities?.join(', ') || 'none identified'}
**Intent:** ${understanding.intent}

I can generate these artifact types from your content:
${artifactSuggestions.map((a: string) => `\u2022 ${a.replace(/-/g, ' ')}`).join('\n')}

What should I build first?`;

      store.addMessage({
        id: uid(),
        role: 'cid',
        content: responseMsg,
        timestamp: Date.now(),
        suggestions: artifactSuggestions.map((a: string) => `create ${a.replace(/-/g, ' ')}`),
      });

      cidLog('ingestSource:complete', {
        entities: understanding.keyEntities?.length,
        artifacts: artifactSuggestions.length,
      });
    } catch {
      set((s) => ({
        messages: s.messages.filter((m) => m.id !== thinkingId),
        isProcessing: false,
      }));
      store.addMessage({
        id: uid(),
        role: 'cid',
        content:
          "\u26A0 Failed to analyze source material. I've stored the raw content \u2014 you can still ask me to generate artifacts from it.",
        timestamp: Date.now(),
      });
      // Still store the raw context even on AI failure — preserve existing artifacts/overrides
      const existingCtx = get().centralContext;
      set({
        centralContext: {
          source: {
            content: input,
            contentType,
            title: title || existingCtx?.source?.title || 'Untitled',
            lastUpdated: Date.now(),
          },
          understanding: existingCtx?.understanding ?? {
            summary: input.slice(0, 200),
            keyEntities: [],
            tone: 'professional',
            audience: 'general',
            intent: 'content creation',
            constraints: [],
            suggestedArtifacts: [],
          },
          artifacts: existingCtx?.artifacts ?? {},
          overrides: existingCtx?.overrides ?? [],
        },
      });
    }
  },

  updateSource: async (newContent) => {
    const store = get();
    const ctx = store.centralContext;
    if (!ctx) {
      // No existing context — treat as fresh ingestion
      return store.ingestSource(newContent, 'text');
    }

    cidLog('updateSource', {
      oldLength: ctx.source.content.length,
      newLength: newContent.length,
    });

    // Update source and re-analyze
    const _oldContent = ctx.source.content;
    set({
      centralContext: {
        ...ctx,
        source: { ...ctx.source, content: newContent, lastUpdated: Date.now() },
      },
    });

    // Mark all artifacts as stale
    const artifacts = { ...ctx.artifacts };
    console.error('[CID:updateSource]', 'marking stale:', Object.keys(artifacts));
    for (const nodeId of Object.keys(artifacts)) {
      artifacts[nodeId] = { ...artifacts[nodeId], syncStatus: 'stale' };
      // Also mark the node itself as stale on canvas
      const node = store.nodes.find((n) => n.id === nodeId);
      if (node) {
        store.updateNodeData(nodeId, {
          status: 'stale',
          artifactContract: { ...artifacts[nodeId] },
        });
      }
    }
    set((s) => ({
      centralContext: s.centralContext ? { ...s.centralContext, artifacts } : null,
    }));

    // Re-ingest to update understanding
    await store.ingestSource(newContent, ctx.source.contentType, ctx.source.title);
  },

  createArtifact: async (artifactType, customPrompt) => {
    const store = get();
    const ctx = store.centralContext;
    if (!ctx) {
      store.addMessage({
        id: uid(),
        role: 'cid',
        content:
          "\u26A0 No source material ingested yet. Paste or describe your content first, and I'll analyze it before generating artifacts.",
        timestamp: Date.now(),
      });
      return null;
    }

    cidLog('createArtifact', { artifactType });
    store.setProcessing(true);
    store.pushHistory();

    const thinkingId = uid();
    store.addMessage({
      id: thinkingId,
      role: 'cid',
      content: '',
      timestamp: Date.now(),
      action: 'building',
    });

    try {
      const prompt =
        customPrompt || `Generate a ${artifactType.replace(/-/g, ' ')} from the source material.`;
      const systemPrompt = `You are CID, an AI agent generating content artifacts.

SOURCE MATERIAL:
${ctx.source.content.slice(0, 6000)}

UNDERSTANDING:
- Summary: ${ctx.understanding.summary}
- Tone: ${ctx.understanding.tone}
- Audience: ${ctx.understanding.audience}
- Intent: ${ctx.understanding.intent}
- Key entities: ${ctx.understanding.keyEntities.join(', ')}
- Constraints: ${ctx.understanding.constraints.join(', ') || 'none'}

${ctx.overrides
  .filter((o) => o.scope === 'global')
  .map((o) => `GLOBAL OVERRIDE: ${o.cidInterpretation || o.field + ': ' + o.userValue}`)
  .join('\n')}

Generate a high-quality ${artifactType.replace(/-/g, ' ')} based on this source material.
Return ONLY valid JSON:
{
  "title": "artifact title",
  "content": "full artifact content in markdown (at least 300 chars, real content not placeholders)",
  "derivedFields": [
    { "field": "field name (e.g. headline, body, cta)", "sourceMapping": "what part of source this came from", "transform": "how it was transformed" }
  ]
}`;

      const data = await callCID({
        systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        model: store.cidAIModel,
        taskType: 'generate',
      });
      if (data.usage)
        store.trackCost(data.usage.prompt_tokens, data.usage.completion_tokens, store.cidAIModel);
      set((s) => ({ messages: s.messages.filter((m) => m.id !== thinkingId) }));

      if (data.error) {
        set({ isProcessing: false });
        store.addMessage({
          id: uid(),
          role: 'cid',
          content: '\u26A0 Failed to generate artifact. Try again or rephrase.',
          timestamp: Date.now(),
        });
        return null;
      }

      let result;
      const raw =
        typeof data.result === 'string'
          ? data.result
          : data.result?.message || JSON.stringify(data.result);
      try {
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
        result = JSON.parse(jsonMatch[1]!.trim());
      } catch {
        // AI returned plain text — use it as content directly
        result = {
          title: `${artifactType.replace(/-/g, ' ')} \u2014 ${ctx.source.title || 'Untitled'}`,
          content: raw,
          derivedFields: [{ field: 'body', sourceMapping: 'full source', transform: 'generate' }],
        };
      }

      // Create the node on canvas
      const nodeId = uid();
      const sourceHash = btoa(ctx.source.content.slice(0, 500)).slice(0, 32);
      const contract: ArtifactContract = {
        nodeId,
        artifactType,
        derivedFields: result.derivedFields || [],
        generationPrompt: prompt,
        model: store.cidAIModel,
        lastSyncedAt: Date.now(),
        lastSourceHash: sourceHash,
        syncStatus: 'current',
        userEdits: [],
      };

      // Position: find a good spot radiating from center
      const existingNodes = get().nodes;
      const centerX =
        existingNodes.length > 0
          ? existingNodes.reduce((sum, n) => sum + n.position.x, 0) / existingNodes.length
          : 400;
      const centerY =
        existingNodes.length > 0
          ? existingNodes.reduce((sum, n) => sum + n.position.y, 0) / existingNodes.length
          : 300;
      const angle =
        Object.keys(ctx.artifacts).length *
        ((2 * Math.PI) / Math.max(Object.keys(ctx.artifacts).length + 1, 4));
      const radius = 300;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      const newNode: Node<NodeData> = {
        id: nodeId,
        type: 'lifecycleNode',
        position: { x, y },
        data: {
          label: result.title || `${artifactType.replace(/-/g, ' ')}`,
          category: 'deliverable' as NodeCategory,
          status: 'active',
          description: `CID-managed ${artifactType.replace(/-/g, ' ')} \u00B7 derived from source`,
          content: result.content || '',
          version: 1,
          lastUpdated: Date.now(),
          artifactContract: contract,
        },
      };

      // Add node and update central context
      set((s) => {
        const updatedArtifacts = {
          ...(s.centralContext?.artifacts ?? {}),
          [nodeId]: contract,
        };
        return {
          nodes: [...s.nodes, newNode],
          centralContext: s.centralContext
            ? { ...s.centralContext, artifacts: updatedArtifacts }
            : null,
          isProcessing: false,
        };
      });

      get().requestFitView();
      saveToStorage({
        nodes: get().nodes,
        edges: get().edges,
        events: get().events,
        messages: get().messages,
      });

      const agentEmoji = store.cidMode === 'rowan' ? '\u2705' : '\u{1F4CB}';
      store.addMessage({
        id: uid(),
        role: 'cid',
        content: `${agentEmoji} **${result.title || artifactType}** created and added to canvas.\n\n${(result.derivedFields || []).length} fields derived from source. This artifact is now tracked \u2014 I'll keep it in sync when your source changes.`,
        timestamp: Date.now(),
        suggestions: [
          ...(ctx?.understanding?.suggestedArtifacts || [])
            .filter((a) => a !== artifactType)
            .slice(0, 2)
            .map((a) => `create ${a.replace(/-/g, ' ')}`),
          'sync all',
          'show understanding',
          `edit ${result.title || artifactType}`,
        ],
      });

      cidLog('createArtifact:complete', {
        nodeId,
        artifactType,
        contentLength: result.content?.length,
      });
      return nodeId;
    } catch {
      set((s) => ({
        messages: s.messages.filter((m) => m.id !== thinkingId),
        isProcessing: false,
      }));
      store.addMessage({
        id: uid(),
        role: 'cid',
        content: '\u26A0 Artifact generation failed. Try again.',
        timestamp: Date.now(),
      });
      return null;
    }
  },

  syncArtifact: async (nodeId) => {
    const store = get();
    const ctx = store.centralContext;
    if (!ctx) {
      (window as any).__cidSync = { exit: 'no context' };
      return null;
    }

    const contract = ctx.artifacts[nodeId];
    if (!contract) {
      (window as any).__cidSync = {
        exit: 'no contract',
        nodeId,
        artifactKeys: Object.keys(ctx.artifacts),
      };
      return null;
    }
    if (contract.syncStatus === 'current') {
      (window as any).__cidSync = { exit: 'already current', nodeId };
      return null;
    }

    cidLog('syncArtifact', { nodeId, artifactType: contract.artifactType });

    const node = store.nodes.find((n) => n.id === nodeId);
    if (!node) {
      (window as any).__cidSync = { exit: 'node not found', nodeId };
      return null;
    }

    // Mark as regenerating
    store.updateNodeData(nodeId, {
      status: 'generating',
      artifactContract: { ...contract, syncStatus: 'regenerating' },
    });

    try {
      const overrides = ctx.overrides.filter((o) => o.nodeId === nodeId);
      const overrideInstructions =
        overrides.length > 0
          ? `\n\nUSER OVERRIDES (respect these \u2014 do not change these aspects):\n${overrides.map((o) => `- ${o.field}: "${o.userValue}" (reason: ${o.cidInterpretation || 'user preference'})`).join('\n')}`
          : '';

      const systemPrompt = `You are CID performing a surgical sync on an artifact.

SOURCE MATERIAL (updated):
${ctx.source.content.slice(0, 6000)}

CURRENT ARTIFACT CONTENT:
${node.data.content?.slice(0, 4000) || '(empty)'}

ARTIFACT CONTRACT:
- Type: ${contract.artifactType}
- Derived fields: ${contract.derivedFields.map((f) => `${f.field} (from: ${f.sourceMapping}, transform: ${f.transform})`).join('; ')}
${overrideInstructions}

The source material has been updated since this artifact was last synced.
Surgically update ONLY the parts of the artifact that are affected by the source changes.
Preserve the overall structure and any user overrides.

Return JSON:
{
  "updatedContent": "the full updated artifact content",
  "changes": [
    { "field": "field name", "before": "old text snippet", "after": "new text snippet", "reason": "why this changed" }
  ],
  "skipped": [
    { "field": "field name", "reason": "why this was not changed" }
  ],
  "confidence": 0.85
}`;

      const data = await callCID({
        systemPrompt,
        messages: [{ role: 'user', content: 'Perform surgical sync now.' }],
        model: store.cidAIModel,
        taskType: 'generate',
        timeout: 90000,
      });
      if (data.usage)
        store.trackCost(data.usage.prompt_tokens, data.usage.completion_tokens, store.cidAIModel);
      (window as any).__cidSync = {
        stage: 'api_response',
        hasError: !!data.error,
        hasResult: !!data.result,
        resultType: typeof data.result,
      };
      if (data.error) {
        (window as any).__cidSync = { exit: 'api_error', error: data.error };
        store.updateNodeData(nodeId, { status: 'stale' });
        return null;
      }

      let result;
      const raw =
        typeof data.result === 'string'
          ? data.result
          : data.result?.message || JSON.stringify(data.result);
      cidLog('syncArtifact:rawResponse', {
        nodeId,
        rawLength: raw?.length,
        rawPreview: raw?.slice(0, 200),
      });
      try {
        // Try to extract JSON from code blocks or raw text
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ||
          raw.match(/(\{[\s\S]*\})/) || [null, raw];
        result = JSON.parse(jsonMatch[1]!.trim());
      } catch (parseErr) {
        (window as any).__cidSync = {
          exit: 'parse_error',
          error: String(parseErr),
          rawPreview: raw?.slice(0, 300),
        };
        store.updateNodeData(nodeId, { status: 'stale' });
        return null;
      }

      // Apply the sync
      const sourceHash = btoa(ctx.source.content.slice(0, 500)).slice(0, 32);
      const updatedContract: ArtifactContract = {
        ...contract,
        lastSyncedAt: Date.now(),
        lastSourceHash: sourceHash,
        syncStatus: 'current',
      };

      store.updateNodeData(nodeId, {
        content: result.updatedContent || node.data.content,
        status: 'active',
        artifactContract: updatedContract,
        version: (node.data.version || 1) + 1,
        lastUpdated: Date.now(),
      });

      // Update central context
      set((s) => ({
        centralContext: s.centralContext
          ? {
              ...s.centralContext,
              artifacts: { ...s.centralContext.artifacts, [nodeId]: updatedContract },
            }
          : null,
      }));

      const diff: SurgicalDiff = {
        nodeId,
        changes: result.changes || [],
        skipped: result.skipped || [],
        confidence: result.confidence || 0.8,
      };

      cidLog('syncArtifact:complete', {
        nodeId,
        changes: diff.changes.length,
        skipped: diff.skipped.length,
      });
      return diff;
    } catch (outerErr) {
      (window as any).__cidSync = { exit: 'outer_catch', error: String(outerErr) };
      store.updateNodeData(nodeId, { status: 'stale' });
      return null;
    }
  },

  syncAllStale: async () => {
    const store = get();
    const ctx = store.centralContext;
    if (!ctx) return [];

    const allArtifacts = Object.entries(ctx.artifacts);
    console.error(
      '[CID:syncAllStale]',
      'artifacts:',
      allArtifacts.map(([id, c]) => `${id}:${c.syncStatus}`),
    );
    const staleIds = allArtifacts.filter(([, c]) => c.syncStatus === 'stale').map(([id]) => id);

    if (staleIds.length === 0) {
      store.addMessage({
        id: uid(),
        role: 'cid',
        content: 'All artifacts are current. Nothing to sync.',
        timestamp: Date.now(),
      });
      return [];
    }

    store.addMessage({
      id: uid(),
      role: 'cid',
      content: `\u{1F504} Syncing ${staleIds.length} stale artifact${staleIds.length > 1 ? 's' : ''}...`,
      timestamp: Date.now(),
    });

    const results: SurgicalDiff[] = [];
    for (const nodeId of staleIds) {
      const diff = await store.syncArtifact(nodeId);
      if (diff) results.push(diff);
    }

    const totalChanges = results.reduce((sum, d) => sum + d.changes.length, 0);
    const totalSkipped = results.reduce((sum, d) => sum + d.skipped.length, 0);
    store.addMessage({
      id: uid(),
      role: 'cid',
      content: `\u2705 Sync complete. **${results.length}** artifact${results.length > 1 ? 's' : ''} updated with **${totalChanges}** surgical change${totalChanges !== 1 ? 's' : ''}. ${totalSkipped} field${totalSkipped !== 1 ? 's' : ''} unchanged.`,
      timestamp: Date.now(),
      suggestions: ['status', 'show understanding', 'diff'],
    });

    return results;
  },

  previewSync: () => {
    const ctx = get().centralContext;
    if (!ctx) return [];
    return Object.entries(ctx.artifacts)
      .filter(([, c]) => c.syncStatus === 'stale')
      .map(([nodeId, c]) => ({
        nodeId,
        reason: `${c.artifactType} is stale \u2014 source changed since last sync`,
      }));
  },

  recordOverride: (nodeId, field, oldVal, newVal) => {
    const ctx = get().centralContext;
    if (!ctx) return;

    const override: Override = {
      id: `ovr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nodeId,
      field,
      originalValue: oldVal,
      userValue: newVal,
      timestamp: Date.now(),
      propagated: false,
      scope: 'this-node',
    };

    set((s) => ({
      centralContext: s.centralContext
        ? {
            ...s.centralContext,
            overrides: [...s.centralContext.overrides, override],
          }
        : null,
    }));

    // Also update the artifact contract's userEdits
    const contract = ctx.artifacts[nodeId];
    if (contract) {
      const updatedContract: ArtifactContract = {
        ...contract,
        syncStatus: 'override',
        userEdits: [
          ...contract.userEdits,
          {
            field,
            originalValue: oldVal,
            userValue: newVal,
            timestamp: Date.now(),
          },
        ],
      };
      set((s) => ({
        centralContext: s.centralContext
          ? {
              ...s.centralContext,
              artifacts: { ...s.centralContext.artifacts, [nodeId]: updatedContract },
            }
          : null,
      }));
    }

    cidLog('recordOverride', { nodeId, field });
  },

  interpretOverride: async (overrideId) => {
    const store = get();
    const ctx = store.centralContext;
    if (!ctx) return null;

    const override = ctx.overrides.find((o) => o.id === overrideId);
    if (!override) return null;

    const node = store.nodes.find((n) => n.id === override.nodeId);
    const nodeLabel = node?.data?.label || override.nodeId;
    const contract = ctx.artifacts[override.nodeId];

    cidLog('interpretOverride', {
      overrideId,
      nodeId: override.nodeId,
      field: override.field,
    });

    try {
      const result = await callCID({
        systemPrompt: `You are CID, a content intelligence agent. Analyze a user's manual edit to an AI-generated artifact and deduce the user's intent. Be concise \u2014 one sentence explaining what the user wanted and why. Examples: "User wants a more casual tone for social content", "User corrected a factual error about pricing", "User prefers shorter paragraphs for readability".`,
        model: store.cidAIModel,
        taskType: 'analyze',
        messages: [
          {
            role: 'user',
            content: `Artifact: "${nodeLabel}" (${contract?.artifactType || 'unknown type'})\nField changed: ${override.field}\n\nOriginal value:\n${override.originalValue.slice(0, 500)}\n\nUser's new value:\n${override.userValue.slice(0, 500)}\n\nWhat was the user's intent with this edit? Respond with a single concise sentence.`,
          },
        ],
      });
      if (result.usage)
        store.trackCost(
          result.usage.prompt_tokens,
          result.usage.completion_tokens,
          store.cidAIModel,
        );

      if (result.error) return null;
      // Extract interpretation text from CIDResponse
      const resultObj = result.result;
      const interpretation = (
        (typeof resultObj === 'object' && resultObj !== null
          ? resultObj.content || resultObj.message
          : typeof resultObj === 'string'
            ? resultObj
            : '') ||
        result.message ||
        // Fallback: some providers return content at top level
        (result as unknown as Record<string, unknown>).content ||
        ''
      )
        .toString()
        .trim();
      if (!interpretation) return null;

      // Store the interpretation on the override
      set((s) => ({
        centralContext: s.centralContext
          ? {
              ...s.centralContext,
              overrides: s.centralContext.overrides.map((o) =>
                o.id === overrideId ? { ...o, cidInterpretation: interpretation } : o,
              ),
            }
          : null,
      }));

      cidLog('interpretOverride:done', {
        overrideId,
        interpretation: interpretation.slice(0, 80),
      });
      return interpretation;
    } catch (err) {
      cidLog('interpretOverride:error', String(err));
      return null;
    }
  },

  propagateOverride: async (overrideId, scope) => {
    const store = get();
    const ctx = store.centralContext;
    if (!ctx) return;

    const override = ctx.overrides.find((o) => o.id === overrideId);
    if (!override) return;

    cidLog('propagateOverride', { overrideId, scope });

    // Ensure we have an interpretation first
    let interpretation = override.cidInterpretation;
    if (!interpretation) {
      interpretation = (await store.interpretOverride(overrideId)) || undefined;
    }

    if (scope === 'this-node') {
      // Already scoped — just mark as propagated
      set((s) => ({
        centralContext: s.centralContext
          ? {
              ...s.centralContext,
              overrides: s.centralContext.overrides.map((o) =>
                o.id === overrideId ? { ...o, scope: 'this-node', propagated: true } : o,
              ),
            }
          : null,
      }));
      store.addMessage({
        id: `msg-${Date.now()}`,
        role: 'cid',
        content: `Override kept for this node only. I'll respect "${override.field}" edits on "${store.nodes.find((n) => n.id === override.nodeId)?.data?.label || override.nodeId}" going forward.`,
        timestamp: Date.now(),
      });
    } else if (scope === 'all-similar') {
      // Apply the override intent to all artifacts of the same type
      const sourceContract = ctx.artifacts[override.nodeId];
      if (!sourceContract) return;
      const similarNodeIds = Object.entries(ctx.artifacts)
        .filter(
          ([id, c]) => id !== override.nodeId && c.artifactType === sourceContract.artifactType,
        )
        .map(([id]) => id);

      // Record override on similar nodes
      for (const nodeId of similarNodeIds) {
        store.recordOverride(nodeId, override.field, '', override.userValue);
      }

      set((s) => ({
        centralContext: s.centralContext
          ? {
              ...s.centralContext,
              overrides: s.centralContext.overrides.map((o) =>
                o.id === overrideId ? { ...o, scope: 'all-similar', propagated: true } : o,
              ),
            }
          : null,
      }));

      const names = similarNodeIds.map(
        (id) => store.nodes.find((n) => n.id === id)?.data?.label || id,
      );
      store.addMessage({
        id: `msg-${Date.now()}`,
        role: 'cid',
        content:
          similarNodeIds.length > 0
            ? `Override applied to ${similarNodeIds.length} similar artifact${similarNodeIds.length > 1 ? 's' : ''}: ${names.join(', ')}. ${interpretation ? `Intent: ${interpretation}` : ''}`
            : `No other artifacts of the same type found. Override kept on this node.`,
        timestamp: Date.now(),
      });
    } else if (scope === 'global') {
      // Update the central context understanding based on the override intent
      if (interpretation) {
        set((s) => {
          if (!s.centralContext) return {};
          const currentConstraints = s.centralContext.understanding.constraints || [];
          return {
            centralContext: {
              ...s.centralContext,
              understanding: {
                ...s.centralContext.understanding,
                constraints: [...currentConstraints, interpretation],
              },
              overrides: s.centralContext.overrides.map((o) =>
                o.id === overrideId ? { ...o, scope: 'global', propagated: true } : o,
              ),
            },
          };
        });

        store.addMessage({
          id: `msg-${Date.now()}`,
          role: 'cid',
          content: `Updated my understanding globally: "${interpretation}". All future artifacts will respect this preference.`,
          timestamp: Date.now(),
        });
      } else {
        store.addMessage({
          id: `msg-${Date.now()}`,
          role: 'cid',
          content: `I couldn't determine the intent of this edit clearly enough to apply it globally. Try describing what you want in the chat instead.`,
          timestamp: Date.now(),
        });
      }
    }

    cidLog('propagateOverride:done', { overrideId, scope });
  },

  forgetOverride: (overrideId) => {
    set((s) => ({
      centralContext: s.centralContext
        ? {
            ...s.centralContext,
            overrides: s.centralContext.overrides.filter((o) => o.id !== overrideId),
          }
        : null,
    }));
  },
});
