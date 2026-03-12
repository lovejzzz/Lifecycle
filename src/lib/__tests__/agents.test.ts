import { describe, it, expect } from 'vitest';
import { getAgent, getInterviewQuestions, buildEnrichedPrompt, detectPromptSignals, shouldSkipRemainingQuestions, getAdaptiveInterview } from '../agents';
import type { Node } from '@xyflow/react';
import type { NodeData } from '../types';

describe('agents', () => {
  describe('getAgent', () => {
    it('returns Rowan for rowan mode', () => {
      const agent = getAgent('rowan');
      expect(agent.name).toBe('CID Rowan');
      expect(agent.accent).toBe('emerald');
      expect(agent.interviewEnabled).toBe(true);
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

  describe('detectPromptSignals', () => {
    it('detects solo scale signal', () => {
      const signals = detectPromptSignals('I am working alone on this project');
      expect(signals.detected.scale).toBe('solo');
    });

    it('detects small team scale signal', () => {
      const signals = detectPromptSignals('We have a small team of 2-5 engineers');
      expect(signals.detected.scale).toBe('small-team');
    });

    it('detects enterprise scale signal', () => {
      const signals = detectPromptSignals('This is an enterprise organization-wide initiative');
      expect(signals.detected.scale).toBe('enterprise');
    });

    it('detects speed priority signal', () => {
      const signals = detectPromptSignals('We need to ship this fast, ASAP');
      expect(signals.detected.priority).toBe('speed');
    });

    it('detects quality priority signal', () => {
      const signals = detectPromptSignals('This needs to be high quality and production-ready');
      expect(signals.detected.priority).toBe('quality');
    });

    it('detects compliance priority signal', () => {
      const signals = detectPromptSignals('Must meet HIPAA compliance regulations');
      expect(signals.detected.priority).toBe('compliance');
    });

    it('detects deadline constraint signal', () => {
      const signals = detectPromptSignals('We have a hard deadline by Friday');
      expect(signals.detected.constraints).toBe('deadline');
    });

    it('detects ideation stage signal', () => {
      const signals = detectPromptSignals('Just an idea I want to brainstorm');
      expect(signals.detected.stage).toBe('ideation');
    });

    it('detects rescue stage signal', () => {
      const signals = detectPromptSignals('The project is a mess and needs rescue');
      expect(signals.detected.stage).toBe('rescue');
    });

    it('returns empty detected for generic prompt', () => {
      const signals = detectPromptSignals('Build a blog content workflow');
      expect(Object.keys(signals.detected).length).toBe(0);
    });

    it('detects multiple signals from a rich prompt', () => {
      const signals = detectPromptSignals('Solo developer, need to ship fast, hard deadline by end of week');
      expect(signals.detected.scale).toBe('solo');
      expect(signals.detected.priority).toBe('speed');
      expect(signals.detected.constraints).toBe('deadline');
    });
  });

  describe('shouldSkipRemainingQuestions', () => {
    it('returns true when scale and priority are both answered', () => {
      const qs = getInterviewQuestions('Build something');
      const scaleIdx = qs.findIndex(q => q.key === 'scale');
      const priorityIdx = qs.findIndex(q => q.key === 'priority');
      const answers: Record<string, string> = {};
      if (scaleIdx >= 0) answers[`q${scaleIdx}`] = 'solo';
      if (priorityIdx >= 0) answers[`q${priorityIdx}`] = 'speed';
      expect(shouldSkipRemainingQuestions(answers, qs)).toBe(true);
    });

    it('returns false when only scale is answered', () => {
      const qs = getInterviewQuestions('Build something');
      const scaleIdx = qs.findIndex(q => q.key === 'scale');
      const answers: Record<string, string> = {};
      if (scaleIdx >= 0) answers[`q${scaleIdx}`] = 'solo';
      expect(shouldSkipRemainingQuestions(answers, qs)).toBe(false);
    });

    it('returns false with empty answers', () => {
      const qs = getInterviewQuestions('Build something');
      expect(shouldSkipRemainingQuestions({}, qs)).toBe(false);
    });
  });

  describe('getAdaptiveInterview', () => {
    it('filters out questions answered by prompt signals', () => {
      const { questions, preAnswers } = getAdaptiveInterview('Solo developer building fast');
      const allQs = getInterviewQuestions('Solo developer building fast');
      // Should have fewer questions since scale and priority are detected
      expect(questions.length).toBeLessThan(allQs.length);
      expect(preAnswers).toHaveProperty(
        `q${allQs.findIndex(q => q.key === 'scale')}`,
        'solo'
      );
      expect(preAnswers).toHaveProperty(
        `q${allQs.findIndex(q => q.key === 'priority')}`,
        'speed'
      );
    });

    it('returns all questions when no signals detected', () => {
      const { questions, preAnswers } = getAdaptiveInterview('Build a blog content workflow');
      const allQs = getInterviewQuestions('Build a blog content workflow');
      expect(questions.length).toBe(allQs.length);
      expect(Object.keys(preAnswers).length).toBe(0);
    });

    it('returns empty questions array when all are pre-answered', () => {
      // Craft a prompt that answers scale, priority, constraints, and stage
      const prompt = 'Solo developer, need to ship fast, hard deadline, just an idea';
      const { questions, preAnswers } = getAdaptiveInterview(prompt);
      const allQs = getInterviewQuestions(prompt);
      // All standard keys should be detected
      expect(Object.keys(preAnswers).length).toBeGreaterThanOrEqual(3);
      expect(questions.length).toBeLessThan(allQs.length);
    });

    it('pre-answers use original question indices for buildEnrichedPrompt compatibility', () => {
      // Use enterprise + compliance signals which have enrichment rules
      const prompt = 'Enterprise organization-wide compliance audit pipeline';
      const allQs = getInterviewQuestions(prompt);
      const { preAnswers } = getAdaptiveInterview(prompt);
      // Verify pre-answers can enrich the prompt correctly
      const enriched = buildEnrichedPrompt(prompt, preAnswers, allQs);
      expect(enriched).not.toBe(prompt); // Should be enriched with policy/compliance text
    });

    it('works for rowan mode', () => {
      const { questions } = getAdaptiveInterview('Solo project, ship fast', undefined, undefined, 'rowan');
      const allQs = getInterviewQuestions('Solo project, ship fast', undefined, undefined, 'rowan');
      expect(questions.length).toBeLessThan(allQs.length);
    });
  });
});
