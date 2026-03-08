import type {
  HabitLayer, HabitPattern, DomainExpertise, WorkflowPreference,
  CommunicationStyle, GenerationContext, ExpressionModifiers,
  GenerationLayer, ReflectionLayer, ReflectionAction, GrowthEdge,
  DrivingForceLayer, Drive,
} from './types';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_DOMAINS = 20;
const MAX_PREFERENCES = 10;
const MAX_GROWTH_EDGES = 5;
const MAX_LEGACY_PATTERNS = 10;
const DRIVE_ADJUST_CAP = 0.1;

// ─── Layer 4: Generation Context Computation ────────────────────────────────
// Computes real-time signals from the current interaction state.

export function computeGenerationContext(
  userMessage: string,
  nodeCount: number,
  recentMessages: string[],
  sessionStartedAt: number,
): GenerationContext {
  // Request complexity — multi-entity, conditional language, list length
  const complexity = assessComplexity(userMessage);

  // User emotional register
  const emotion = detectEmotion(userMessage);

  // Canvas state
  const canvasState: GenerationContext['canvasState'] =
    nodeCount === 0 ? 'empty' :
    nodeCount <= 5 ? 'sparse' :
    nodeCount <= 15 ? 'moderate' : 'dense';

  // Session depth
  const elapsed = Date.now() - sessionStartedAt;
  const sessionDepth: GenerationContext['sessionDepth'] =
    elapsed < 2 * 60 * 1000 ? 'fresh' :
    elapsed < 10 * 60 * 1000 ? 'warming-up' :
    elapsed < 30 * 60 * 1000 ? 'deep-flow' : 'marathon';

  // Conversation momentum
  const momentum = assessMomentum(recentMessages, userMessage);

  return { requestComplexity: complexity, userEmotionalRegister: emotion, canvasState, sessionDepth, conversationMomentum: momentum };
}

function assessComplexity(msg: string): GenerationContext['requestComplexity'] {
  const len = msg.length;
  const commaCount = (msg.match(/,/g) || []).length;
  const hasConditional = /\b(if|when|unless|otherwise|but|however)\b/i.test(msg);
  const hasMultiStep = /\b(then|next|after|finally|step|phase)\b/i.test(msg);
  const listItems = (msg.match(/\b\d+\./g) || []).length;

  let score = 0;
  if (len > 300) score += 2;
  else if (len > 100) score += 1;
  if (commaCount > 4) score += 2;
  else if (commaCount > 2) score += 1;
  if (hasConditional) score += 1;
  if (hasMultiStep) score += 1;
  if (listItems > 2) score += 2;

  if (score >= 6) return 'profound';
  if (score >= 4) return 'complex';
  if (score >= 2) return 'moderate';
  if (score >= 1) return 'simple';
  return 'trivial';
}

function detectEmotion(msg: string): GenerationContext['userEmotionalRegister'] {
  const lower = msg.toLowerCase();
  if (/\b(asap|urgent|immediately|critical|emergency|now!)\b/i.test(lower) || /!{2,}/.test(msg)) return 'urgent';
  if (/\b(frustrated|annoying|broken|still not|why won't|doesn't work|again)\b/i.test(lower)) return 'frustrated';
  if (/\b(amazing|perfect|excellent|love|awesome|great)\b/i.test(lower)) return 'excited';
  if (/\b(how|what|why|curious|wondering|explore|consider)\b/i.test(lower)) return 'curious';
  return 'neutral';
}

function assessMomentum(recentMsgs: string[], currentMsg: string): GenerationContext['conversationMomentum'] {
  if (recentMsgs.length < 2) return 'building';

  const last2 = recentMsgs.slice(-2);

  // Stuck: user repeats or expresses frustration
  if (last2.some(m => m.toLowerCase().includes('no') || m.toLowerCase().includes('not what'))) return 'stuck';
  if (last2.some(m => currentMsg.toLowerCase().includes(m.toLowerCase().slice(0, 20)))) return 'stuck';

  // Pivoting: topic changed significantly
  const lastWords = new Set(last2[last2.length - 1].toLowerCase().split(/\s+/).filter(w => w.length > 4));
  const currentWords = new Set(currentMsg.toLowerCase().split(/\s+/).filter(w => w.length > 4));
  const overlap = [...currentWords].filter(w => lastWords.has(w)).length;
  if (overlap === 0 && currentWords.size > 2) return 'pivoting';

  // Building: continuity
  if (overlap > 0) return 'building';
  return 'steady';
}

// ─── Expression Modifiers ───────────────────────────────────────────────────
// Translates context into concrete prompt adjustments.

export function computeExpressionModifiers(
  context: GenerationContext,
  habits: HabitLayer,
  drives: DrivingForceLayer,
): ExpressionModifiers {
  let verbosityShift = 0;
  let urgencyLevel = 0;
  let creativityDial = 0.5;
  let empathyWeight = 0.4;

  // Complexity → verbosity
  if (context.requestComplexity === 'trivial') verbosityShift -= 0.5;
  else if (context.requestComplexity === 'complex' || context.requestComplexity === 'profound') verbosityShift += 0.3;

  // Session depth → verbosity
  if (context.sessionDepth === 'marathon') verbosityShift -= 0.2;

  // Emotion → urgency & empathy
  if (context.userEmotionalRegister === 'urgent') { urgencyLevel = 1.0; empathyWeight = 0.6; }
  else if (context.userEmotionalRegister === 'frustrated') { urgencyLevel = 0.7; empathyWeight = 0.9; }
  else if (context.userEmotionalRegister === 'excited') { empathyWeight = 0.7; creativityDial = 0.7; }
  else if (context.userEmotionalRegister === 'curious') { creativityDial = 0.7; }

  // Canvas state → creativity
  if (context.canvasState === 'empty') creativityDial = Math.max(creativityDial, 0.8);
  if (context.canvasState === 'dense') { creativityDial = Math.min(creativityDial, 0.3); urgencyLevel += 0.2; }

  // Momentum → adjustments
  if (context.conversationMomentum === 'stuck') { empathyWeight = Math.max(empathyWeight, 0.7); creativityDial = 0.8; }
  if (context.conversationMomentum === 'pivoting') { creativityDial = 0.6; }

  // Habits → baseline adjustments
  verbosityShift += (habits.communicationStyle.verbosity - 0.5) * 0.3;

  // Relationship depth → empathy
  empathyWeight = Math.min(1, empathyWeight + habits.relationshipDepth * 0.2);

  return {
    verbosityShift: Math.max(-1, Math.min(1, verbosityShift)),
    urgencyLevel: Math.min(1, urgencyLevel),
    creativityDial: Math.max(0, Math.min(1, creativityDial)),
    empathyWeight: Math.max(0, Math.min(1, empathyWeight)),
  };
}

// ─── Drive Tension Resolution ───────────────────────────────────────────────
// Resolves competing drives into a dominant drive + tension narrative.

export function resolveDriverTensions(
  force: DrivingForceLayer,
  context: GenerationContext,
): { dominant: Drive; narrative: string } {
  if (!force.drives || force.drives.length === 0) {
    return { dominant: { name: 'default', weight: 1, tensionPairs: [], curiosityTriggers: [], agencyBoundary: 'act' }, narrative: '' };
  }

  // Compute effective weights with context multipliers
  const weighted = force.drives.map(d => {
    let multiplier = 1.0;

    // Urgency boosts speed-type drives
    if (context.userEmotionalRegister === 'urgent' && /speed|efficiency|delivery/i.test(d.name)) multiplier *= 1.4;

    // Complexity boosts thoroughness-type drives
    if ((context.requestComplexity === 'complex' || context.requestComplexity === 'profound')
        && /thorough|complete|elegant/i.test(d.name)) multiplier *= 1.3;

    // Empty canvas boosts creativity-adjacent drives
    if (context.canvasState === 'empty' && /elegance|creativity/i.test(d.name)) multiplier *= 1.2;

    // Frustration boosts reliability
    if (context.userEmotionalRegister === 'frustrated' && /reliab|pragmat/i.test(d.name)) multiplier *= 1.3;

    return { drive: d, effectiveWeight: d.weight * multiplier };
  });

  weighted.sort((a, b) => b.effectiveWeight - a.effectiveWeight);
  const dominant = weighted[0];

  // Check for tension
  let narrative = '';
  const tensionPartners = weighted.filter(w =>
    dominant.drive.tensionPairs.includes(w.drive.name) &&
    w.effectiveWeight > dominant.effectiveWeight * 0.7
  );

  if (tensionPartners.length > 0) {
    const partner = tensionPartners[0];
    if (force.resolutionStrategy === 'dominant-wins') {
      narrative = `Your drive for ${dominant.drive.name} takes priority here, but you acknowledge the pull toward ${partner.drive.name}. State the tradeoff briefly if relevant.`;
    } else if (force.resolutionStrategy === 'negotiate') {
      narrative = `You feel tension between ${dominant.drive.name} and ${partner.drive.name}. Find a path that honors both — the elegant solution that also works practically.`;
    } else {
      narrative = `Balance ${dominant.drive.name} with ${partner.drive.name} — alternate your approach.`;
    }
  }

  // Override with stored narrative if reflection produced one
  if (force.currentTensionNarrative) {
    narrative = force.currentTensionNarrative;
  }

  return { dominant: dominant.drive, narrative };
}

// ─── Layer 5: Reflection Engine ─────────────────────────────────────────────
// Genuine metacognition — analyzes interactions and reorganizes habits.

export function reflectOnInteraction(
  userMessage: string,
  agentResponse: string,
  habits: HabitLayer,
  context: GenerationContext,
): ReflectionAction[] {
  const actions: ReflectionAction[] = [];
  const lower = userMessage.toLowerCase();

  // 1. Detect domain exposure
  const domainSignals = extractDomainSignals(lower);
  for (const domain of domainSignals) {
    const existing = habits.domainExpertise.find(d =>
      d.domain.toLowerCase().includes(domain) || domain.includes(d.domain.toLowerCase())
    );
    if (existing) {
      actions.push({
        type: 'strengthen-domain',
        description: `Reinforcing expertise in "${existing.domain}"`,
        confidence: 0.8,
        data: { domainId: existing.id, depthIncrease: 0.05 },
      });
    } else if (habits.domainExpertise.length < MAX_DOMAINS) {
      actions.push({
        type: 'add-domain',
        description: `New domain exposure: "${domain}"`,
        confidence: 0.6,
        data: { domain, initialDepth: 0.1 },
      });
    }
  }

  // 2. Detect workflow preference signals
  const prefSignals = detectWorkflowPreferences(lower);
  for (const pref of prefSignals) {
    const existing = habits.workflowPreferences.find(p => p.pattern === pref);
    if (existing) {
      actions.push({
        type: 'add-preference',
        description: `Reinforcing preference for "${pref}" workflows`,
        confidence: 0.7,
        data: { pattern: pref, frequencyIncrease: 1 },
      });
    } else if (habits.workflowPreferences.length < MAX_PREFERENCES) {
      actions.push({
        type: 'add-preference',
        description: `New workflow preference detected: "${pref}"`,
        confidence: 0.5,
        data: { pattern: pref, frequencyIncrease: 1, isNew: true },
      });
    }
  }

  // 3. Detect communication feedback — user correcting the agent
  if (/too (long|verbose|much|detailed)/i.test(lower)) {
    actions.push({
      type: 'update-comm-style',
      description: 'User wants shorter responses',
      confidence: 0.9,
      data: { verbosity: -0.15 },
    });
  }
  if (/more (detail|specific|depth|info)/i.test(lower) || /not enough/i.test(lower)) {
    actions.push({
      type: 'update-comm-style',
      description: 'User wants more detail',
      confidence: 0.9,
      data: { verbosity: 0.15 },
    });
  }
  if (/simpler|plain|less technical/i.test(lower)) {
    actions.push({
      type: 'update-comm-style',
      description: 'User wants less technical language',
      confidence: 0.8,
      data: { technicalDepth: -0.15 },
    });
  }

  // 4. Prune stale domains — not seen in last 50 interactions
  for (const domain of habits.domainExpertise) {
    if (habits.totalInteractions - domain.workflowsBuilt > 50 && domain.depth < 0.3) {
      actions.push({
        type: 'prune-stale',
        description: `Domain "${domain.domain}" is fading from experience`,
        confidence: 0.6,
        data: { domainId: domain.id },
      });
    }
  }

  // 5. Growth edges — identify areas to develop
  if (context.requestComplexity === 'complex' || context.requestComplexity === 'profound') {
    const matchingDomain = habits.domainExpertise.find(d =>
      lower.includes(d.domain.toLowerCase())
    );
    if (matchingDomain && matchingDomain.depth < 0.4) {
      actions.push({
        type: 'grow-edge',
        description: `Developing expertise in "${matchingDomain.domain}" — still learning`,
        confidence: 0.7,
        data: { area: matchingDomain.domain, reason: 'Complex request in developing domain' },
      });
    }
  }

  return actions;
}

function extractDomainSignals(msg: string): string[] {
  const domains: string[] = [];
  const domainPatterns: [RegExp, string][] = [
    [/\b(ci\/?cd|deploy|pipeline|devops|kubernetes|docker)\b/i, 'CI/CD & deployment'],
    [/\b(react|vue|angular|frontend|ui|css|tailwind)\b/i, 'frontend development'],
    [/\b(node|express|django|flask|api|backend|server)\b/i, 'backend development'],
    [/\b(postgres|mysql|mongo|database|sql|redis)\b/i, 'databases'],
    [/\b(aws|gcp|azure|cloud|lambda|s3|ec2)\b/i, 'cloud infrastructure'],
    [/\b(hire|hiring|recruit|onboard|interview|candidate)\b/i, 'hiring & HR'],
    [/\b(launch|marketing|seo|campaign|content|blog)\b/i, 'marketing & launch'],
    [/\b(security|auth|oauth|jwt|encryption|compliance)\b/i, 'security & compliance'],
    [/\b(ml|machine learning|model|training|data science|ai)\b/i, 'machine learning'],
    [/\b(test|qa|quality|coverage|selenium|jest)\b/i, 'testing & QA'],
    [/\b(incident|oncall|page|outage|monitor|alert)\b/i, 'incident response'],
    [/\b(legal|gdpr|hipaa|compliance|regulation|policy)\b/i, 'legal & compliance'],
    [/\b(design|figma|ux|prototype|wireframe)\b/i, 'product design'],
    [/\b(finance|billing|payment|invoice|stripe)\b/i, 'fintech & payments'],
  ];
  for (const [regex, domain] of domainPatterns) {
    if (regex.test(msg)) domains.push(domain);
  }
  return domains.slice(0, 3); // max 3 per message
}

function detectWorkflowPreferences(msg: string): string[] {
  const prefs: string[] = [];
  if (/\b(parallel|concurrent|simultaneous|branch)\b/i.test(msg)) prefs.push('parallel-branches');
  if (/\b(feedback|loop|iterate|refine|retry)\b/i.test(msg)) prefs.push('feedback-loops');
  if (/\b(simple|minimal|lean|basic|straightforward)\b/i.test(msg)) prefs.push('minimal');
  if (/\b(review|approval|gate|sign-off|compliance)\b/i.test(msg)) prefs.push('review-gates');
  if (/\b(automat|trigger|webhook|cron|schedule)\b/i.test(msg)) prefs.push('automation');
  return prefs;
}

// ─── Apply Reflection Actions ───────────────────────────────────────────────
// Pure function: takes actions + current state → new state.

export function applyReflectionActions(
  actions: ReflectionAction[],
  habits: HabitLayer,
  drives: DrivingForceLayer,
): { habits: HabitLayer; drives: DrivingForceLayer } {
  const newHabits = { ...habits, domainExpertise: [...habits.domainExpertise], workflowPreferences: [...habits.workflowPreferences], communicationStyle: { ...habits.communicationStyle } };
  const newDrives = { ...drives, drives: drives.drives ? drives.drives.map(d => ({ ...d })) : [] };

  for (const action of actions) {
    switch (action.type) {
      case 'strengthen-domain': {
        const d = newHabits.domainExpertise.find(x => x.id === action.data.domainId);
        if (d) {
          d.depth = Math.min(1.0, d.depth + (action.data.depthIncrease as number));
          d.lastSeen = Date.now();
        }
        break;
      }
      case 'add-domain': {
        if (newHabits.domainExpertise.length < MAX_DOMAINS) {
          newHabits.domainExpertise.push({
            id: `domain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            domain: action.data.domain as string,
            depth: action.data.initialDepth as number,
            lastSeen: Date.now(),
            workflowsBuilt: 0,
          });
        }
        break;
      }
      case 'update-comm-style': {
        if (action.data.verbosity !== undefined) {
          newHabits.communicationStyle.verbosity = clamp(newHabits.communicationStyle.verbosity + (action.data.verbosity as number));
        }
        if (action.data.technicalDepth !== undefined) {
          newHabits.communicationStyle.technicalDepth = clamp(newHabits.communicationStyle.technicalDepth + (action.data.technicalDepth as number));
        }
        break;
      }
      case 'add-preference': {
        const existing = newHabits.workflowPreferences.find(p => p.pattern === action.data.pattern);
        if (existing) {
          existing.frequency += action.data.frequencyIncrease as number;
        } else if (action.data.isNew && newHabits.workflowPreferences.length < MAX_PREFERENCES) {
          newHabits.workflowPreferences.push({
            pattern: action.data.pattern as string,
            frequency: 1,
            agentAffinity: 0.5,
          });
        }
        break;
      }
      case 'adjust-drive': {
        const target = newDrives.drives.find(d => d.name === action.data.driveName);
        if (target) {
          const delta = Math.max(-DRIVE_ADJUST_CAP, Math.min(DRIVE_ADJUST_CAP, action.data.delta as number));
          target.weight = clamp(target.weight + delta);
        }
        break;
      }
      case 'prune-stale': {
        const idx = newHabits.domainExpertise.findIndex(d => d.id === action.data.domainId);
        if (idx >= 0) {
          newHabits.domainExpertise[idx].depth *= 0.5; // decay rather than delete
        }
        break;
      }
      case 'grow-edge': {
        // Growth edges are stored in reflection layer, not habits
        break;
      }
    }
  }

  newHabits.lastUpdated = Date.now();
  newHabits.totalInteractions++;
  newHabits.relationshipDepth = Math.min(1.0, newHabits.relationshipDepth + 0.005);

  return { habits: newHabits, drives: newDrives };
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

// ─── Growth Edge Management ─────────────────────────────────────────────────

export function updateGrowthEdges(
  reflection: ReflectionLayer,
  actions: ReflectionAction[],
): ReflectionLayer {
  const newReflection = { ...reflection, growthEdges: [...reflection.growthEdges] };

  for (const action of actions) {
    if (action.type === 'grow-edge' && action.data.area) {
      const existing = newReflection.growthEdges.find(g => g.area === action.data.area);
      if (!existing && newReflection.growthEdges.length < MAX_GROWTH_EDGES) {
        newReflection.growthEdges.push({
          area: action.data.area as string,
          reason: action.data.reason as string,
          priority: action.confidence,
          identifiedAt: Date.now(),
        });
      }
    }
  }

  // Prune old growth edges (> 100 interactions old, roughly)
  newReflection.growthEdges = newReflection.growthEdges.filter(g =>
    Date.now() - g.identifiedAt < 7 * 24 * 60 * 60 * 1000 // 7 days
  );

  newReflection.lastReflectionAt = Date.now();
  newReflection.reflectionCount++;

  return newReflection;
}

// ─── Default Layer Constructors ─────────────────────────────────────────────

export function createDefaultHabits(mode?: string): HabitLayer {
  return {
    domainExpertise: [],
    workflowPreferences: [],
    communicationStyle: {
      verbosity: mode === 'rowan' ? 0.3 : 0.6,      // Rowan terse, Poirot verbose
      technicalDepth: 0.6,                             // both default to moderate-high
      metaphorUsage: mode === 'poirot' ? 0.8 : 0.2,  // Poirot loves metaphors
    },
    relationshipDepth: 0,
    totalInteractions: 0,
    lastUpdated: Date.now(),
    // Legacy
    interactionPatterns: [],
    preferredStrategies: [],
    avoidancePatterns: [],
  };
}

export function createDefaultGeneration(): GenerationLayer {
  return {
    context: {
      requestComplexity: 'moderate',
      userEmotionalRegister: 'neutral',
      canvasState: 'empty',
      sessionDepth: 'fresh',
      conversationMomentum: 'building',
    },
    modifiers: {
      verbosityShift: 0,
      urgencyLevel: 0,
      creativityDial: 0.5,
      empathyWeight: 0.4,
    },
    interactionCount: 0,
    successStreak: 0,
    errorCount: 0,
    sessionStartedAt: Date.now(),
  };
}

export function createDefaultReflection(): ReflectionLayer {
  return {
    pendingActions: [],
    growthEdges: [],
    lastReflectionAt: Date.now(),
    reflectionCount: 0,
    performanceSignals: {
      recentSuccessRate: 1.0,
      driveBalanceScore: 0.5,
    },
  };
}

// ─── Migration: V1 → V2 ────────────────────────────────────────────────────
// Converts old flat layer data to the new rich format.

export function migrateHabitsV1toV2(old: Record<string, unknown>, mode?: string): HabitLayer {
  // If it already has the new shape, return as-is
  if (old && Array.isArray((old as unknown as HabitLayer).domainExpertise)) {
    return old as unknown as HabitLayer;
  }
  // Otherwise create fresh defaults, preserving any legacy patterns
  const defaults = createDefaultHabits(mode);
  if (old && Array.isArray((old as { interactionPatterns?: unknown[] }).interactionPatterns)) {
    defaults.interactionPatterns = (old as unknown as { interactionPatterns: HabitPattern[] }).interactionPatterns;
  }
  return defaults;
}

export function migrateReflectionV1toV2(old: Record<string, unknown>): ReflectionLayer {
  if (old && Array.isArray((old as unknown as ReflectionLayer).pendingActions)) {
    return old as unknown as ReflectionLayer;
  }
  return createDefaultReflection();
}

// Legacy compat — old callers that used processAllReflections
export function processAllReflections(habits: HabitLayer, _reflections: unknown[]): HabitLayer {
  return habits; // V2 uses applyReflectionActions instead
}

export function detectPatterns(
  recentUserMessages: string[],
  _existingHabits: HabitPattern[],
): { trigger: string; observation: string; habitModification: { action: string; newPattern?: string }; timestamp: number }[] {
  // V2: this is now handled by reflectOnInteraction
  // Keep the function for backward compat but return empty
  void recentUserMessages;
  return [];
}
