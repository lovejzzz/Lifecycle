import { describe, it, expect } from 'vitest';
import { getAgent, getInterviewQuestions, buildEnrichedPrompt } from '../agents';
import type { Node } from '@xyflow/react';
import type { NodeData } from '../types';

describe('agents', () => {
  describe('getAgent', () => {
    it('returns Rowan for rowan mode', () => {
      const agent = getAgent('rowan');
      expect(agent.name).toBe('CID Rowan');
      expect(agent.accent).toBe('emerald');
      expect(agent.interviewEnabled).toBe(false);
    });

    it('returns Poirot for poirot mode', () => {
      const agent = getAgent('poirot');
      expect(agent.name).toContain('Poirot');
      expect(agent.accent).toBe('amber');
      expect(agent.interviewEnabled).toBe(true);
    });

    it('agents have required response functions', () => {
      for (const mode of ['rowan', 'poirot'] as const) {
        const agent = getAgent(mode);
        expect(typeof agent.responses.solveFound).toBe('function');
        expect(typeof agent.responses.solveClean).toBe('function');
        expect(typeof agent.responses.propagated).toBe('function');
        expect(typeof agent.responses.propagateClean).toBe('function');
        expect(typeof agent.responses.optimized).toBe('function');
        expect(typeof agent.responses.fallback).toBe('function');
        expect(typeof agent.responses.buildComplete).toBe('function');
        expect(typeof agent.responses.buildCompleteWithFixes).toBe('function');
      }
    });

    it('agents have 5-layer architecture fields', () => {
      for (const mode of ['rowan', 'poirot'] as const) {
        const agent = getAgent(mode);
        expect(agent.temperament).toBeDefined();
        expect(agent.temperament.frame).toBeDefined();
        expect(agent.temperament.disposition).toBeTruthy();
        expect(agent.drivingForce).toBeDefined();
        expect(agent.drivingForce.drives.length).toBeGreaterThan(0);
        expect(agent.taskGoals).toBeDefined();
      }
    });
  });

  describe('agent responses', () => {
    it('rowan responses are concise and direct', () => {
      const r = getAgent('rowan').responses;
      expect(r.solveFound(2, ['A', 'B'])).toContain('2');
      expect(r.solveClean()).toBeTruthy();
      expect(r.propagated(3)).toContain('3');
      expect(r.propagateClean()).toBeTruthy();
      expect(r.optimized(5)).toContain('5');
      expect(r.buildComplete(4, 3)).toContain('4');
      expect(r.buildCompleteWithFixes(4, 3, 'Fixed orphans')).toContain('Fixed orphans');
      expect(r.qaPropagated(2)).toContain('2');
      expect(r.qaPropagateClean()).toBeTruthy();
      expect(r.qaOptimized(5)).toContain('5');
      expect(r.statusReport(['3 nodes', '2 stale'], 'fix stale')).toContain('fix stale');
      expect(r.statusClean()).toBeTruthy();
      expect(r.qaStatus(['healthy'], false)).toBeTruthy();
    });

    it('poirot responses have detective flair', () => {
      const r = getAgent('poirot').responses;
      expect(r.solveFound(1, ['Clue'])).toBeTruthy();
      expect(r.solveClean()).toBeTruthy();
      expect(r.propagated(2)).toContain('2');
      expect(r.buildComplete(3, 2)).toBeTruthy();
      expect(r.preInvestigate).toBeTruthy(); // Poirot has pre-investigation messages
    });

    it('fallback response handles empty workflow', () => {
      const r = getAgent('rowan').responses;
      const result = r.fallback('hello', [], []);
      expect(result).toContain('No workflow');
    });

    it('fallback response suggests actions for stale nodes', () => {
      const r = getAgent('rowan').responses;
      const nodes = [
        { id: 'n1', data: { label: 'A', category: 'input', status: 'active' } },
        { id: 'n2', data: { label: 'B', category: 'artifact', status: 'stale' } },
      ] as unknown as Node<NodeData>[];
      const edges = [{ id: 'e1', source: 'n1', target: 'n2' }] as any;
      const result = r.fallback('what now', nodes, edges);
      expect(result).toContain('stale');
      expect(result).toContain('propagate');
    });

    it('fallback response detects orphans', () => {
      const r = getAgent('rowan').responses;
      const nodes = [
        { id: 'n1', data: { label: 'A', category: 'input', status: 'active' } },
        { id: 'n2', data: { label: 'Orphan', category: 'note', status: 'active' } },
      ] as unknown as Node<NodeData>[];
      const edges = [] as any;
      const result = r.fallback('status', nodes, edges);
      expect(result).toContain('orphan');
    });
  });

  describe('getInterviewQuestions', () => {
    it('returns scale question for new workflow', () => {
      const qs = getInterviewQuestions('Build a blog pipeline');
      expect(qs.length).toBeGreaterThanOrEqual(3);
      expect(qs[0].key).toBe('scale');
      expect(qs[0].cards.length).toBe(4);
    });

    it('returns intent question when extending existing workflow', () => {
      const existingNodes = [
        { id: 'n1', data: { label: 'A', category: 'input', status: 'active' } },
      ] as unknown as Node<NodeData>[];
      const qs = getInterviewQuestions('Add more steps', existingNodes);
      expect(qs[0].key).toBe('intent');
      expect(qs[0].cards.some(c => c.id === 'extend')).toBe(true);
    });

    it('adds launch question for product launch prompts', () => {
      const qs = getInterviewQuestions('Launch a new product');
      const launchQ = qs.find(q => q.key === 'launch');
      expect(launchQ).toBeDefined();
      expect(launchQ!.cards.some(c => c.id === 'b2b')).toBe(true);
    });

    it('adds research question for research prompts', () => {
      const qs = getInterviewQuestions('Conduct user research');
      const researchQ = qs.find(q => q.key === 'research');
      expect(researchQ).toBeDefined();
    });

    it('adds pipeline question for CI/CD prompts', () => {
      const qs = getInterviewQuestions('Build a CI/CD pipeline');
      const pipelineQ = qs.find(q => q.key === 'pipeline');
      expect(pipelineQ).toBeDefined();
    });

    it('adds deliverable question for generic prompts', () => {
      const qs = getInterviewQuestions('Create a workflow for my team');
      const deliverableQ = qs.find(q => q.key === 'deliverable');
      expect(deliverableQ).toBeDefined();
    });

    it('always includes priority question', () => {
      const qs = getInterviewQuestions('anything');
      expect(qs.some(q => q.key === 'priority')).toBe(true);
    });

    it('skips stage question when extending', () => {
      const existingNodes = [
        { id: 'n1', data: { label: 'A', category: 'input', status: 'active' } },
      ] as unknown as Node<NodeData>[];
      const qs = getInterviewQuestions('extend', existingNodes);
      expect(qs.every(q => q.key !== 'stage')).toBe(true);
    });
  });

  describe('buildEnrichedPrompt', () => {
    it('returns original prompt when no answers', () => {
      const result = buildEnrichedPrompt('Build a blog', {}, []);
      expect(result).toBe('Build a blog');
    });

    it('enriches with quality priority', () => {
      const qs = getInterviewQuestions('Build a blog');
      const answers = { q1: 'quality' }; // priority question is at index 1
      const result = buildEnrichedPrompt('Build a blog', answers, qs);
      expect(result).toContain('quality review');
    });

    it('enriches with compliance priority', () => {
      const qs = getInterviewQuestions('Build a blog');
      const answers = { q1: 'compliance' };
      const result = buildEnrichedPrompt('Build a blog', answers, qs);
      expect(result).toContain('compliance');
    });

    it('enriches with large-team scale', () => {
      const qs = getInterviewQuestions('Build a system');
      const answers = { q0: 'large-team' };
      const result = buildEnrichedPrompt('Build a system', answers, qs);
      expect(result).toContain('collaboration');
    });

    it('enriches with enterprise scale', () => {
      const qs = getInterviewQuestions('Build a system');
      const answers = { q0: 'enterprise' };
      const result = buildEnrichedPrompt('Build a system', answers, qs);
      expect(result).toContain('policy compliance');
    });

    it('enriches launch prompts with audience context', () => {
      const qs = getInterviewQuestions('Launch a product');
      const launchIdx = qs.findIndex(q => q.key === 'launch');
      if (launchIdx >= 0) {
        const answers = { [`q${launchIdx}`]: 'b2b' };
        const result = buildEnrichedPrompt('Launch a product', answers, qs);
        expect(result).toContain('pitch deck');
      }
    });

    it('enriches research prompts with type context', () => {
      const qs = getInterviewQuestions('Do research analysis');
      const researchIdx = qs.findIndex(q => q.key === 'research');
      if (researchIdx >= 0) {
        const answers = { [`q${researchIdx}`]: 'competitive' };
        const result = buildEnrichedPrompt('Do research analysis', answers, qs);
        expect(result).toContain('competitive analysis');
      }
    });

    it('handles missing card gracefully', () => {
      const qs = getInterviewQuestions('Build something');
      const answers = { q0: 'nonexistent-id' };
      const result = buildEnrichedPrompt('Build something', answers, qs);
      expect(result).toBe('Build something');
    });
  });
});
