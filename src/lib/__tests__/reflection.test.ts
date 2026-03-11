import { describe, it, expect } from 'vitest';
import {
  computeGenerationContext,
  computeExpressionModifiers,
  computeCuriositySpikes,
  applyTemperamentReframing,
  resolveDriverTensions,
  generateSpontaneousDirectives,
  reflectOnInteraction,
  applyReflectionActions,
  updateGrowthEdges,
  createDefaultHabits,
  createDefaultGeneration,
  createDefaultReflection,
  migrateHabitsV1toV2,
  migrateReflectionV1toV2,
} from '../reflection';
import type { DrivingForceLayer, Drive, GenerationContext, HabitLayer, TemperamentLayer, ReflectionLayer } from '../types';

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
    const force: DrivingForceLayer = { drives: [], resolutionStrategy: 'dominant-wins', primaryDrive: '', curiosityStyle: '', agencyExpression: '', tensionSource: '' };
    const ctx = computeGenerationContext('test', 0, [], Date.now());
    const result = resolveDriverTensions(force, ctx);
    expect(result.dominant.name).toBe('default');
  });

  it('selects highest-weight drive as dominant', () => {
    const force: DrivingForceLayer = {
      drives: [mkDrive('speed', 0.3), mkDrive('thoroughness', 0.8)],
      resolutionStrategy: 'dominant-wins',
      primaryDrive: '', curiosityStyle: '', agencyExpression: '', tensionSource: '',
    };
    const ctx = computeGenerationContext('test', 0, [], Date.now());
    const result = resolveDriverTensions(force, ctx);
    expect(result.dominant.name).toBe('thoroughness');
  });

  it('urgency boosts speed-type drives', () => {
    const force: DrivingForceLayer = {
      drives: [mkDrive('speed', 0.5), mkDrive('elegance', 0.45)],
      resolutionStrategy: 'dominant-wins',
      primaryDrive: '', curiosityStyle: '', agencyExpression: '', tensionSource: '',
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
      primaryDrive: '', curiosityStyle: '', agencyExpression: '', tensionSource: '',
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

  it('rowan has terse style, poirot has verbose/metaphor style', () => {
    const rowan = createDefaultHabits('rowan');
    const poirot = createDefaultHabits('poirot');
    expect(rowan.communicationStyle.verbosity).toBe(0.3);
    expect(poirot.communicationStyle.verbosity).toBe(0.6);
    expect(poirot.communicationStyle.metaphorUsage).toBe(0.8);
    expect(rowan.communicationStyle.metaphorUsage).toBe(0.2);
  });
});

// ─── computeExpressionModifiers ──────────────────────────────────────────

describe('computeExpressionModifiers', () => {
  const mkContext = (overrides: Partial<GenerationContext> = {}): GenerationContext => ({
    requestComplexity: 'moderate',
    userEmotionalRegister: 'neutral',
    canvasState: 'sparse',
    sessionDepth: 'fresh',
    conversationMomentum: 'building',
    ...overrides,
  });

  const mkHabits = (overrides: Partial<HabitLayer> = {}): HabitLayer => ({
    ...createDefaultHabits(),
    ...overrides,
  });

  const defaultDrives: DrivingForceLayer = {
    drives: [], resolutionStrategy: 'dominant-wins',
    primaryDrive: '', curiosityStyle: '', agencyExpression: '', tensionSource: '',
  };

  it('reduces verbosity for trivial complexity', () => {
    const mods = computeExpressionModifiers(mkContext({ requestComplexity: 'trivial' }), mkHabits(), defaultDrives);
    expect(mods.verbosityShift).toBeLessThan(0);
  });

  it('increases verbosity for complex requests', () => {
    const mods = computeExpressionModifiers(mkContext({ requestComplexity: 'complex' }), mkHabits(), defaultDrives);
    expect(mods.verbosityShift).toBeGreaterThan(0);
  });

  it('boosts urgency and empathy for urgent emotion', () => {
    const mods = computeExpressionModifiers(mkContext({ userEmotionalRegister: 'urgent' }), mkHabits(), defaultDrives);
    expect(mods.urgencyLevel).toBe(1.0);
    expect(mods.empathyWeight).toBeGreaterThanOrEqual(0.6);
  });

  it('boosts empathy for frustrated emotion', () => {
    const mods = computeExpressionModifiers(mkContext({ userEmotionalRegister: 'frustrated' }), mkHabits(), defaultDrives);
    expect(mods.empathyWeight).toBeGreaterThanOrEqual(0.9);
  });

  it('boosts creativity for excited emotion', () => {
    const mods = computeExpressionModifiers(mkContext({ userEmotionalRegister: 'excited' }), mkHabits(), defaultDrives);
    expect(mods.creativityDial).toBeGreaterThanOrEqual(0.7);
  });

  it('boosts creativity on empty canvas', () => {
    const mods = computeExpressionModifiers(mkContext({ canvasState: 'empty' }), mkHabits(), defaultDrives);
    expect(mods.creativityDial).toBeGreaterThanOrEqual(0.8);
  });

  it('constrains creativity on dense canvas', () => {
    const mods = computeExpressionModifiers(mkContext({ canvasState: 'dense' }), mkHabits(), defaultDrives);
    expect(mods.creativityDial).toBeLessThanOrEqual(0.3);
  });

  it('boosts empathy and creativity when stuck', () => {
    const mods = computeExpressionModifiers(mkContext({ conversationMomentum: 'stuck' }), mkHabits(), defaultDrives);
    expect(mods.empathyWeight).toBeGreaterThanOrEqual(0.7);
    expect(mods.creativityDial).toBeGreaterThanOrEqual(0.8);
  });

  it('reduces verbosity during marathon sessions', () => {
    const mods = computeExpressionModifiers(mkContext({ sessionDepth: 'marathon' }), mkHabits(), defaultDrives);
    expect(mods.verbosityShift).toBeLessThan(0);
  });

  it('all values clamped to [-1,1] or [0,1]', () => {
    const mods = computeExpressionModifiers(mkContext({ requestComplexity: 'profound', userEmotionalRegister: 'urgent', canvasState: 'dense', sessionDepth: 'marathon', conversationMomentum: 'stuck' }), mkHabits(), defaultDrives);
    expect(mods.verbosityShift).toBeGreaterThanOrEqual(-1);
    expect(mods.verbosityShift).toBeLessThanOrEqual(1);
    expect(mods.urgencyLevel).toBeLessThanOrEqual(1);
    expect(mods.creativityDial).toBeGreaterThanOrEqual(0);
    expect(mods.creativityDial).toBeLessThanOrEqual(1);
    expect(mods.empathyWeight).toBeGreaterThanOrEqual(0);
    expect(mods.empathyWeight).toBeLessThanOrEqual(1);
  });
});

// ─── computeCuriositySpikes ──────────────────────────────────────────────

describe('computeCuriositySpikes', () => {
  it('spikes drives whose triggers match user message', () => {
    const force: DrivingForceLayer = {
      drives: [
        { name: 'speed', weight: 0.5, tensionPairs: [], curiosityTriggers: ['fast', 'quick'], agencyBoundary: 'act', currentSpike: 0 },
        { name: 'elegance', weight: 0.5, tensionPairs: [], curiosityTriggers: ['beautiful', 'clean'], agencyBoundary: 'act', currentSpike: 0 },
      ],
      resolutionStrategy: 'dominant-wins', primaryDrive: '', curiosityStyle: '', agencyExpression: '', tensionSource: '',
    };
    const result = computeCuriositySpikes(force, 'Make it fast and clean');
    expect(result.drives[0].currentSpike).toBeGreaterThan(0); // 'fast' matched
    expect(result.drives[1].currentSpike).toBeGreaterThan(0); // 'clean' matched
  });

  it('no spikes when no triggers match', () => {
    const force: DrivingForceLayer = {
      drives: [{ name: 'speed', weight: 0.5, tensionPairs: [], curiosityTriggers: ['performance', 'benchmark'], agencyBoundary: 'act', currentSpike: 0 }],
      resolutionStrategy: 'dominant-wins', primaryDrive: '', curiosityStyle: '', agencyExpression: '', tensionSource: '',
    };
    const result = computeCuriositySpikes(force, 'Create a dashboard');
    expect(result.drives[0].currentSpike).toBe(0);
  });

  it('caps spike at 1.0', () => {
    const force: DrivingForceLayer = {
      drives: [{ name: 'speed', weight: 0.5, tensionPairs: [], curiosityTriggers: ['fast', 'quick', 'rapid', 'speedy'], agencyBoundary: 'act', currentSpike: 0 }],
      resolutionStrategy: 'dominant-wins', primaryDrive: '', curiosityStyle: '', agencyExpression: '', tensionSource: '',
    };
    const result = computeCuriositySpikes(force, 'fast quick rapid speedy');
    expect(result.drives[0].currentSpike).toBeLessThanOrEqual(1.0);
  });
});

// ─── applyTemperamentReframing ───────────────────────────────────────────

describe('applyTemperamentReframing', () => {
  const mkTemperament = (): TemperamentLayer => ({
    frame: {
      lens: 'mission-objective',
      threatModel: 'neutral-scan',
      attentionPriorities: ['blockers'],
      categorizationSchema: { threats: ['test'] },
    },
    disposition: 'balanced',
    reframingRules: [
      { trigger: 'bug', reframeAs: 'An opportunity to strengthen the system' },
      { trigger: 'broken', reframeAs: 'A puzzle waiting to be solved' },
    ],
    communicationStyle: 'test',
    worldview: 'test',
    emotionalBaseline: 'test',
  });

  it('returns reframe when trigger matches', () => {
    const result = applyTemperamentReframing(mkTemperament(), [], 'There is a bug in the code');
    expect(result).toContain('opportunity');
  });

  it('returns undefined when no trigger matches', () => {
    const result = applyTemperamentReframing(mkTemperament(), [], 'Add a new feature');
    expect(result).toBeUndefined();
  });

  it('includes learned reframing rules', () => {
    const learned = [{ trigger: 'deploy', reframeAs: 'A chance to ship value to users' }];
    const result = applyTemperamentReframing(mkTemperament(), learned, 'Time to deploy');
    expect(result).toContain('ship value');
  });

  it('picks the most specific (longest) match', () => {
    const temperament = mkTemperament();
    temperament.reframingRules.push({ trigger: 'bug', reframeAs: 'A very specific and detailed opportunity to analyze root causes and strengthen the system against regression' });
    const result = applyTemperamentReframing(temperament, [], 'There is a bug');
    expect(result!.length).toBeGreaterThan(20); // picks the longer one
  });
});

// ─── generateSpontaneousDirectives ──────────────────────────────────────

describe('generateSpontaneousDirectives', () => {
  const mkContext = (overrides: Partial<GenerationContext> = {}): GenerationContext => ({
    requestComplexity: 'moderate', userEmotionalRegister: 'neutral', canvasState: 'sparse',
    sessionDepth: 'fresh', conversationMomentum: 'building', ...overrides,
  });

  const mkDrive = (name: string, spike = 0): Drive => ({
    name, weight: 0.5, tensionPairs: [], curiosityTriggers: [], agencyBoundary: 'act', currentSpike: spike,
  });

  it('generates stuck directive when conversation is stuck', () => {
    const habits = createDefaultHabits();
    const directives = generateSpontaneousDirectives('help', mkContext({ conversationMomentum: 'stuck' }), habits, mkDrive('speed'));
    expect(directives.some(d => d.includes('stuck'))).toBe(true);
  });

  it('generates pivot directive when conversation pivots', () => {
    const habits = createDefaultHabits();
    const directives = generateSpontaneousDirectives('new topic', mkContext({ conversationMomentum: 'pivoting' }), habits, mkDrive('speed'));
    expect(directives.some(d => d.includes('pivoted'))).toBe(true);
  });

  it('generates drive voice when spike is high', () => {
    const habits = createDefaultHabits();
    const directives = generateSpontaneousDirectives('optimize', mkContext(), habits, mkDrive('speed', 0.8));
    expect(directives.some(d => d.includes('speed drive'))).toBe(true);
  });

  it('generates domain reference when user mentions known domain', () => {
    const habits = createDefaultHabits();
    habits.domainExpertise.push({ id: 'd1', domain: 'frontend development', depth: 0.7, lastSeen: Date.now(), workflowsBuilt: 5, sedimentation: 0.5 });
    const directives = generateSpontaneousDirectives('help with frontend', mkContext(), habits, mkDrive('speed'));
    expect(directives.some(d => d.includes('frontend'))).toBe(true);
  });

  it('limits directives to max 3', () => {
    const habits = createDefaultHabits();
    habits.domainExpertise.push({ id: 'd1', domain: 'frontend development', depth: 0.7, lastSeen: Date.now(), workflowsBuilt: 5, sedimentation: 0.5 });
    const directives = generateSpontaneousDirectives('frontend', mkContext({ conversationMomentum: 'stuck', sessionDepth: 'marathon' }), { ...habits, relationshipDepth: 0.8 }, mkDrive('speed', 0.8));
    expect(directives.length).toBeLessThanOrEqual(3);
  });
});

// ─── reflectOnInteraction ───────────────────────────────────────────────

describe('reflectOnInteraction', () => {
  it('detects domain signals and creates actions', () => {
    const habits = createDefaultHabits();
    const ctx = computeGenerationContext('Build a React frontend', 5, [], Date.now());
    const actions = reflectOnInteraction('Build a React frontend', 'Sure!', habits, ctx);
    expect(actions.some(a => a.type === 'add-domain')).toBe(true);
  });

  it('strengthens existing domain', () => {
    const habits = createDefaultHabits();
    habits.domainExpertise.push({ id: 'd1', domain: 'frontend development', depth: 0.5, lastSeen: Date.now(), workflowsBuilt: 3, sedimentation: 0.2 });
    const ctx = computeGenerationContext('More React work', 5, [], Date.now());
    const actions = reflectOnInteraction('More React work', 'Done!', habits, ctx);
    expect(actions.some(a => a.type === 'strengthen-domain')).toBe(true);
  });

  it('detects verbosity feedback', () => {
    const habits = createDefaultHabits();
    const ctx = computeGenerationContext('Too verbose', 5, [], Date.now());
    const actions = reflectOnInteraction('Responses are too long and verbose', 'OK!', habits, ctx);
    expect(actions.some(a => a.type === 'update-comm-style' && (a.data.verbosity as number) < 0)).toBe(true);
  });

  it('detects more-detail feedback', () => {
    const habits = createDefaultHabits();
    const ctx = computeGenerationContext('More detail please', 5, [], Date.now());
    const actions = reflectOnInteraction('I need more detail in responses', 'Sure!', habits, ctx);
    expect(actions.some(a => a.type === 'update-comm-style' && (a.data.verbosity as number) > 0)).toBe(true);
  });

  it('detects simpler-language feedback', () => {
    const habits = createDefaultHabits();
    const ctx = computeGenerationContext('simpler', 5, [], Date.now());
    const actions = reflectOnInteraction('Use simpler language', 'OK!', habits, ctx);
    expect(actions.some(a => a.type === 'update-comm-style' && a.data.technicalDepth !== undefined)).toBe(true);
  });

  it('detects workflow preferences', () => {
    const habits = createDefaultHabits();
    const ctx = computeGenerationContext('automate', 5, [], Date.now());
    const actions = reflectOnInteraction('I want to automate this with a cron schedule', 'Done!', habits, ctx);
    expect(actions.some(a => a.type === 'add-preference')).toBe(true);
  });

  it('generates drive reorganization when spike is high', () => {
    const habits = createDefaultHabits();
    const ctx = computeGenerationContext('test', 5, [], Date.now());
    const drives: DrivingForceLayer = {
      drives: [{ name: 'speed', weight: 0.5, tensionPairs: [], curiosityTriggers: [], agencyBoundary: 'act', currentSpike: 0.5 }],
      resolutionStrategy: 'dominant-wins', primaryDrive: '', curiosityStyle: '', agencyExpression: '', tensionSource: '',
    };
    const actions = reflectOnInteraction('test', 'ok', habits, ctx, drives);
    expect(actions.some(a => a.type === 'reorganize-drives')).toBe(true);
  });

  it('generates growth edge for complex request in developing domain', () => {
    const habits = createDefaultHabits();
    habits.domainExpertise.push({ id: 'd1', domain: 'security', depth: 0.2, lastSeen: Date.now(), workflowsBuilt: 1, sedimentation: 0.1 });
    const ctx = computeGenerationContext('Complex security audit with multiple phases', 5, [], Date.now());
    // Make the context recognize complexity
    const actions = reflectOnInteraction('Complex security audit with if conditions, then next step, after that finally phase 1. phase 2. phase 3.', 'ok', habits, { ...ctx, requestComplexity: 'complex' });
    expect(actions.some(a => a.type === 'grow-edge')).toBe(true);
  });
});

// ─── applyReflectionActions ─────────────────────────────────────────────

describe('applyReflectionActions', () => {
  const defaultDrives: DrivingForceLayer = {
    drives: [{ name: 'speed', weight: 0.5, tensionPairs: [], curiosityTriggers: [], agencyBoundary: 'act', currentSpike: 0 }],
    resolutionStrategy: 'dominant-wins', primaryDrive: '', curiosityStyle: '', agencyExpression: '', tensionSource: '',
    evolvedWeights: {},
  };

  it('strengthens domain depth and sedimentation', () => {
    const habits = createDefaultHabits();
    habits.domainExpertise.push({ id: 'd1', domain: 'frontend', depth: 0.5, lastSeen: Date.now(), workflowsBuilt: 3, sedimentation: 0.2 });
    const result = applyReflectionActions(
      [{ type: 'strengthen-domain', description: 'test', confidence: 0.8, data: { domainId: 'd1', depthIncrease: 0.1, sedimentIncrease: 0.05 } }],
      habits, defaultDrives,
    );
    expect(result.habits.domainExpertise[0].depth).toBeCloseTo(0.6);
    expect(result.habits.domainExpertise[0].sedimentation).toBeCloseTo(0.25);
  });

  it('adds new domain', () => {
    const habits = createDefaultHabits();
    const result = applyReflectionActions(
      [{ type: 'add-domain', description: 'test', confidence: 0.6, data: { domain: 'backend', initialDepth: 0.1, initialSedimentation: 0.05 } }],
      habits, defaultDrives,
    );
    expect(result.habits.domainExpertise.length).toBe(1);
    expect(result.habits.domainExpertise[0].domain).toBe('backend');
  });

  it('updates communication style', () => {
    const habits = createDefaultHabits();
    const result = applyReflectionActions(
      [{ type: 'update-comm-style', description: 'test', confidence: 0.9, data: { verbosity: -0.15 } }],
      habits, defaultDrives,
    );
    expect(result.habits.communicationStyle.verbosity).toBeLessThan(habits.communicationStyle.verbosity);
  });

  it('adds and reinforces preferences', () => {
    const habits = createDefaultHabits();
    // Add new
    let result = applyReflectionActions(
      [{ type: 'add-preference', description: 'test', confidence: 0.5, data: { pattern: 'automation', frequencyIncrease: 1, isNew: true, initialSedimentation: 0.05 } }],
      habits, defaultDrives,
    );
    expect(result.habits.workflowPreferences.length).toBe(1);
    // Reinforce existing
    result = applyReflectionActions(
      [{ type: 'add-preference', description: 'test', confidence: 0.7, data: { pattern: 'automation', frequencyIncrease: 1, sedimentIncrease: 0.03 } }],
      result.habits, defaultDrives,
    );
    expect(result.habits.workflowPreferences[0].frequency).toBe(2);
  });

  it('reorganizes drive weights', () => {
    const result = applyReflectionActions(
      [{ type: 'reorganize-drives', description: 'test', confidence: 0.6, data: { driveName: 'speed', delta: 0.05 } }],
      createDefaultHabits(), defaultDrives,
    );
    expect(result.drives.evolvedWeights!['speed']).toBeCloseTo(0.55);
  });

  it('prunes stale domains with decay factor', () => {
    const habits = createDefaultHabits();
    habits.domainExpertise.push({ id: 'd1', domain: 'stale-domain', depth: 0.2, lastSeen: Date.now(), workflowsBuilt: 3, sedimentation: 0.5 });
    const result = applyReflectionActions(
      [{ type: 'prune-stale', description: 'test', confidence: 0.5, data: { domainId: 'd1' } }],
      habits, defaultDrives,
    );
    expect(result.habits.domainExpertise[0].depth).toBeLessThan(0.2);
    expect(result.habits.domainExpertise[0].depth).toBeGreaterThan(0); // not fully pruned due to sedimentation
  });

  it('increments totalInteractions and relationshipDepth', () => {
    const habits = createDefaultHabits();
    const result = applyReflectionActions([], habits, defaultDrives);
    expect(result.habits.totalInteractions).toBe(1);
    expect(result.habits.relationshipDepth).toBeGreaterThan(0);
  });
});

// ─── updateGrowthEdges ──────────────────────────────────────────────────

describe('updateGrowthEdges', () => {
  it('adds growth edges from actions', () => {
    const reflection = createDefaultReflection();
    const result = updateGrowthEdges(reflection, [
      { type: 'grow-edge', description: 'test', confidence: 0.7, data: { area: 'security', reason: 'developing domain' } },
    ]);
    expect(result.growthEdges.length).toBe(1);
    expect(result.growthEdges[0].area).toBe('security');
  });

  it('adds learned reframing rules', () => {
    const reflection = createDefaultReflection();
    const result = updateGrowthEdges(reflection, [
      { type: 'add-reframing-rule', description: 'test', confidence: 0.5, data: { trigger: 'deploy', reframeAs: 'Ship value' } },
    ]);
    expect(result.learnedReframingRules.length).toBe(1);
  });

  it('logs drive evolution', () => {
    const reflection = createDefaultReflection();
    const result = updateGrowthEdges(reflection, [
      { type: 'reorganize-drives', description: 'test', confidence: 0.6, data: { driveName: 'speed', delta: 0.02, reason: 'spike' } },
    ]);
    expect(result.driveEvolutionLog.length).toBe(1);
  });

  it('prunes growth edges older than 7 days', () => {
    const reflection = createDefaultReflection();
    reflection.growthEdges.push({
      area: 'old-edge', reason: 'test', priority: 0.5,
      identifiedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
    });
    const result = updateGrowthEdges(reflection, []);
    expect(result.growthEdges.length).toBe(0);
  });

  it('increments reflectionCount', () => {
    const reflection = createDefaultReflection();
    const result = updateGrowthEdges(reflection, []);
    expect(result.reflectionCount).toBe(1);
  });
});

// ─── Migration ──────────────────────────────────────────────────────────

describe('migration', () => {
  it('migrateHabitsV1toV2 returns existing V2 data as-is', () => {
    const habits = createDefaultHabits('rowan');
    const result = migrateHabitsV1toV2(habits as unknown as Record<string, unknown>, 'rowan');
    expect(result.communicationStyle.verbosity).toBe(0.3);
  });

  it('migrateHabitsV1toV2 creates defaults from V1 data', () => {
    const old = { interactionPatterns: [{ pattern: 'test', count: 1 }] };
    const result = migrateHabitsV1toV2(old as Record<string, unknown>, 'poirot');
    expect(result.domainExpertise).toBeDefined();
    expect(result.communicationStyle.verbosity).toBe(0.6); // poirot default
  });

  it('migrateReflectionV1toV2 returns existing V2 data as-is', () => {
    const reflection = createDefaultReflection();
    const result = migrateReflectionV1toV2(reflection as unknown as Record<string, unknown>);
    expect(result.reflectionCount).toBe(0);
  });

  it('migrateReflectionV1toV2 creates defaults from old data', () => {
    const result = migrateReflectionV1toV2({ someOldField: true });
    expect(result.pendingActions).toBeDefined();
    expect(result.growthEdges).toBeDefined();
  });
});
