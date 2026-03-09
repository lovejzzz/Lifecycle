import { describe, it, expect } from 'vitest';
import {
  computeGenerationContext,
  resolveDriverTensions,
  createDefaultHabits,
  createDefaultGeneration,
  createDefaultReflection,
} from '../reflection';
import type { DrivingForceLayer, Drive } from '../types';

// ─── computeGenerationContext ──────────────────────────────────────────────

describe('computeGenerationContext', () => {
  const now = Date.now();

  it('classifies empty canvas state', () => {
    const ctx = computeGenerationContext('hello', 0, [], now);
    expect(ctx.canvasState).toBe('empty');
  });

  it('classifies sparse canvas state', () => {
    const ctx = computeGenerationContext('test', 3, [], now);
    expect(ctx.canvasState).toBe('sparse');
  });

  it('classifies moderate canvas state', () => {
    const ctx = computeGenerationContext('test', 10, [], now);
    expect(ctx.canvasState).toBe('moderate');
  });

  it('classifies dense canvas state', () => {
    const ctx = computeGenerationContext('test', 20, [], now);
    expect(ctx.canvasState).toBe('dense');
  });

  it('detects trivial complexity', () => {
    const ctx = computeGenerationContext('hi', 0, [], now);
    expect(ctx.requestComplexity).toBe('trivial');
  });

  it('detects urgent emotion', () => {
    const ctx = computeGenerationContext('Fix this ASAP!! Critical issue', 5, [], now);
    expect(ctx.userEmotionalRegister).toBe('urgent');
  });

  it('detects frustrated emotion', () => {
    const ctx = computeGenerationContext("This still doesn't work, it's broken again", 5, [], now);
    expect(ctx.userEmotionalRegister).toBe('frustrated');
  });

  it('classifies fresh session', () => {
    const ctx = computeGenerationContext('hello', 0, [], now);
    expect(ctx.sessionDepth).toBe('fresh');
  });

  it('classifies deep-flow session', () => {
    const ctx = computeGenerationContext('hello', 0, [], now - 20 * 60 * 1000);
    expect(ctx.sessionDepth).toBe('deep-flow');
  });

  it('detects complex request with conditionals and steps', () => {
    const ctx = computeGenerationContext(
      'If the user uploads a file, then process it. After that, unless there is an error, send the output. Finally, archive it.',
      0, [], now,
    );
    expect(['complex', 'profound']).toContain(ctx.requestComplexity);
  });
});

// ─── resolveDriverTensions ─────────────────────────────────────────────────

describe('resolveDriverTensions', () => {
  const mkDrive = (name: string, weight: number, tensionPairs: string[] = []): Drive => ({
    name,
    weight,
    tensionPairs,
    curiosityTriggers: [],
    agencyBoundary: 'act' as const,
    currentSpike: 0,
  });

  it('returns default drive for empty drives', () => {
    const force: DrivingForceLayer = { drives: [], resolutionStrategy: 'dominant-wins' };
    const ctx = computeGenerationContext('test', 0, [], Date.now());
    const result = resolveDriverTensions(force, ctx);
    expect(result.dominant.name).toBe('default');
  });

  it('selects highest-weight drive as dominant', () => {
    const force: DrivingForceLayer = {
      drives: [mkDrive('speed', 0.3), mkDrive('thoroughness', 0.8)],
      resolutionStrategy: 'dominant-wins',
    };
    const ctx = computeGenerationContext('test', 0, [], Date.now());
    const result = resolveDriverTensions(force, ctx);
    expect(result.dominant.name).toBe('thoroughness');
  });

  it('urgency boosts speed-type drives', () => {
    const force: DrivingForceLayer = {
      drives: [mkDrive('speed', 0.5), mkDrive('elegance', 0.45)],
      resolutionStrategy: 'dominant-wins',
    };
    const ctx = computeGenerationContext('Fix this ASAP!!', 0, [], Date.now());
    const result = resolveDriverTensions(force, ctx);
    // Urgency multiplies speed by 1.4 (0.5*1.4=0.7), elegance boosted by empty canvas 1.2 (0.45*1.2=0.54)
    expect(result.dominant.name).toBe('speed');
  });

  it('generates tension narrative when drives are close', () => {
    const force: DrivingForceLayer = {
      drives: [
        mkDrive('speed', 0.8, ['thoroughness']),
        mkDrive('thoroughness', 0.75, ['speed']),
      ],
      resolutionStrategy: 'negotiate',
    };
    const ctx = computeGenerationContext('test', 0, [], Date.now());
    const result = resolveDriverTensions(force, ctx);
    expect(result.narrative).toContain('speed');
    expect(result.narrative).toContain('thoroughness');
  });
});

// ─── Default Creators ──────────────────────────────────────────────────────

describe('default layer creators', () => {
  it('creates default habits with domain expertise', () => {
    const habits = createDefaultHabits('rowan');
    expect(habits.domainExpertise).toBeDefined();
    expect(habits.communicationStyle).toBeDefined();
  });

  it('creates default generation layer', () => {
    const gen = createDefaultGeneration();
    expect(gen).toBeDefined();
  });

  it('creates default reflection layer', () => {
    const ref = createDefaultReflection();
    expect(ref).toBeDefined();
    expect(ref.growthEdges).toBeDefined();
  });
});
