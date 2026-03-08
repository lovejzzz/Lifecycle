import type {
  HabitLayer, HabitPattern,
  GenerationContext, ExpressionModifiers,
  GenerationLayer, ReflectionLayer, ReflectionAction,
  DrivingForceLayer, Drive, TemperamentLayer, ReframingRule,
} from './types';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_DOMAINS = 20;
const MAX_PREFERENCES = 10;
const MAX_GROWTH_EDGES = 5;
const _MAX_LEGACY_PATTERNS = 10;
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
  _drives: DrivingForceLayer,
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

// ─── Curiosity Spike System ──────────────────────────────────────────────────
// Drives spike when their curiosity triggers match the user's input.
// This is the "living" part — the agent's attention genuinely shifts.

export function computeCuriositySpikes(
  force: DrivingForceLayer,
  userMessage: string,
): DrivingForceLayer {
  const lower = userMessage.toLowerCase();
  const newDrives = force.drives.map(d => {
    let spike = 0;
    for (const trigger of d.curiosityTriggers) {
      if (new RegExp(`\\b${trigger}\\b`, 'i').test(lower)) {
        spike = Math.min(1, spike + 0.3); // each matching trigger adds 0.3, capped at 1
      }
    }
    return { ...d, currentSpike: spike };
  });
  return { ...force, drives: newDrives };
}

// ─── Temperament Reframing Engine ────────────────────────────────────────────
// Actually applies reframing rules to transform how the agent perceives input.
// Returns a reframed interpretation string injected into the generation layer.

export function applyTemperamentReframing(
  temperament: TemperamentLayer,
  learnedRules: ReframingRule[],
  userMessage: string,
): string | undefined {
  const allRules = [...temperament.reframingRules, ...learnedRules];
  const matchedReframes: string[] = [];

  for (const rule of allRules) {
    if (new RegExp(rule.trigger, 'i').test(userMessage)) {
      matchedReframes.push(rule.reframeAs);
    }
  }

  if (matchedReframes.length === 0) return undefined;

  // Take the most specific match (longest reframeAs = most specific)
  matchedReframes.sort((a, b) => b.length - a.length);
  return matchedReframes[0];
}

// ─── Drive Tension Resolution ───────────────────────────────────────────────
// Resolves competing drives into a dominant drive + tension narrative.
// Now incorporates curiosity spikes and evolved weights for genuine dynamism.

export function resolveDriverTensions(
  force: DrivingForceLayer,
  context: GenerationContext,
): { dominant: Drive; narrative: string } {
  if (!force.drives || force.drives.length === 0) {
    return { dominant: { name: 'default', weight: 1, tensionPairs: [], curiosityTriggers: [], agencyBoundary: 'act', currentSpike: 0 }, narrative: '' };
  }

  // Compute effective weights: base weight + evolved adjustment + context multiplier + curiosity spike
  const weighted = force.drives.map(d => {
    // Start with base weight, apply evolved adjustments if present
    let base = d.weight;
    if (force.evolvedWeights?.[d.name] !== undefined) {
      base = force.evolvedWeights[d.name];
    }

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

    // Curiosity spike — a drive that's triggered gets a significant boost
    const spikeBoost = (d.currentSpike || 0) * 0.4;

    return { drive: d, effectiveWeight: (base * multiplier) + spikeBoost };
  });

  weighted.sort((a, b) => b.effectiveWeight - a.effectiveWeight);
  const dominant = weighted[0];

  // Check for tension — this is where genuine inner conflict emerges
  let narrative = '';
  const tensionPartners = weighted.filter(w =>
    dominant.drive.tensionPairs.includes(w.drive.name) &&
    w.effectiveWeight > dominant.effectiveWeight * 0.7
  );

  if (tensionPartners.length > 0) {
    const partner = tensionPartners[0];
    // Generate tension narrative that acknowledges curiosity spikes
    const dominantSpiked = (dominant.drive.currentSpike || 0) > 0;
    const partnerSpiked = (partner.drive.currentSpike || 0) > 0;

    if (dominantSpiked && partnerSpiked) {
      // Both drives triggered — maximum tension
      narrative = `ACTIVE TENSION: Both your ${dominant.drive.name} and ${partner.drive.name} drives are triggered right now. This request genuinely pulls you in two directions. Name this tension in your response and explain how you're resolving it.`;
    } else if (force.resolutionStrategy === 'dominant-wins') {
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

// ─── Spontaneous Directive Generator ─────────────────────────────────────────
// Produces novel, on-the-spot directives for the Generation layer.
// These are NEVER repeated — they emerge from the specific interaction context.

export function generateSpontaneousDirectives(
  userMessage: string,
  context: GenerationContext,
  habits: HabitLayer,
  dominantDrive: Drive,
): string[] {
  const directives: string[] = [];
  const lower = userMessage.toLowerCase();

  // 1. Reference-back — if user echoes something from earlier interaction patterns
  const recentDomains = habits.domainExpertise
    .filter(d => d.sedimentation > 0.3)
    .map(d => d.domain.toLowerCase());
  for (const domain of recentDomains) {
    if (lower.includes(domain.split(' ')[0])) {
      directives.push(`You have deep experience with ${domain} (${Math.round(habits.domainExpertise.find(d => d.domain.toLowerCase() === domain)?.depth ?? 0 * 100)}% depth). Draw on this — reference specific patterns you've seen.`);
      break;
    }
  }

  // 2. Drive-colored directive — the dominant drive speaks
  if (dominantDrive.currentSpike > 0.5) {
    const driveVoices: Record<string, string> = {
      speed: 'Your speed drive is spiking — lead with the fastest path to value. Cut anything that delays delivery.',
      thoroughness: 'Your thoroughness drive is spiking — don\'t skip steps. Cover edge cases the user hasn\'t thought of.',
      reliability: 'Your reliability drive is spiking — emphasize failsafes, rollback procedures, and monitoring.',
      elegance: 'Your elegance drive is spiking — find the beautiful solution. Architecture should be admired, not merely functional.',
      pragmatism: 'Your pragmatism drive is spiking — resist over-engineering. What\'s the simplest thing that works?',
      completeness: 'Your completeness drive is spiking — leave no gap. If there\'s an unstated assumption, name it.',
    };
    const voice = driveVoices[dominantDrive.name];
    if (voice) directives.push(voice);
  }

  // 3. Momentum-aware directive
  if (context.conversationMomentum === 'stuck') {
    directives.push('The conversation is stuck. Try reframing the problem entirely — approach it from a direction the user hasn\'t considered.');
  } else if (context.conversationMomentum === 'pivoting') {
    directives.push('The user just pivoted topics. Acknowledge the shift and bring fresh energy — don\'t carry over assumptions from the previous topic.');
  }

  // 4. Session-depth coloring
  if (context.sessionDepth === 'marathon' && habits.relationshipDepth > 0.5) {
    directives.push('You and this user have a deep working relationship. Be direct, skip formalities, reference shared context naturally.');
  }

  return directives.slice(0, 3); // max 3 spontaneous directives
}

// ─── Layer 5: Reflection Engine ─────────────────────────────────────────────
// Genuine metacognition — analyzes interactions and REORGANIZES structure.
// This is NOT just number-tweaking. Reflection can:
// - Strengthen/weaken sedimented habits (hard to change = high sedimentation)
// - Evolve drive weights over time
// - Add new reframing rules to temperament
// - Identify growth edges for self-improvement

export function reflectOnInteraction(
  userMessage: string,
  agentResponse: string,
  habits: HabitLayer,
  context: GenerationContext,
  drives?: DrivingForceLayer,
): ReflectionAction[] {
  const actions: ReflectionAction[] = [];
  const lower = userMessage.toLowerCase();

  // 1. Detect domain exposure — with sedimentation awareness
  const domainSignals = extractDomainSignals(lower);
  for (const domain of domainSignals) {
    const existing = habits.domainExpertise.find(d =>
      d.domain.toLowerCase().includes(domain) || domain.includes(d.domain.toLowerCase())
    );
    if (existing) {
      // Sedimentation increases with reinforcement — deeply sedimented domains resist pruning
      actions.push({
        type: 'strengthen-domain',
        description: `Reinforcing expertise in "${existing.domain}" (sedimentation: ${(existing.sedimentation ?? 0).toFixed(2)})`,
        confidence: 0.8,
        data: { domainId: existing.id, depthIncrease: 0.05, sedimentIncrease: 0.02 },
      });
    } else if (habits.domainExpertise.length < MAX_DOMAINS) {
      actions.push({
        type: 'add-domain',
        description: `New domain exposure: "${domain}"`,
        confidence: 0.6,
        data: { domain, initialDepth: 0.1, initialSedimentation: 0.05 },
      });
    }
  }

  // 2. Detect workflow preference signals — with sedimentation
  const prefSignals = detectWorkflowPreferences(lower);
  for (const pref of prefSignals) {
    const existing = habits.workflowPreferences.find(p => p.pattern === pref);
    if (existing) {
      actions.push({
        type: 'add-preference',
        description: `Reinforcing preference for "${pref}" workflows`,
        confidence: 0.7,
        data: { pattern: pref, frequencyIncrease: 1, sedimentIncrease: 0.03 },
      });
    } else if (habits.workflowPreferences.length < MAX_PREFERENCES) {
      actions.push({
        type: 'add-preference',
        description: `New workflow preference detected: "${pref}"`,
        confidence: 0.5,
        data: { pattern: pref, frequencyIncrease: 1, isNew: true, initialSedimentation: 0.05 },
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

  // 4. Prune stale domains — BUT respect sedimentation
  // Deeply sedimented domains resist pruning even if not recently seen
  for (const domain of habits.domainExpertise) {
    const sedimentation = domain.sedimentation ?? 0;
    const interactionsSinceSeen = habits.totalInteractions - domain.workflowsBuilt;
    // High sedimentation needs many more interactions to prune (50 → 150 for fully sedimented)
    const pruneThreshold = 50 + Math.floor(sedimentation * 100);
    if (interactionsSinceSeen > pruneThreshold && domain.depth < 0.3) {
      actions.push({
        type: 'prune-stale',
        description: `Domain "${domain.domain}" is fading (sedimentation ${sedimentation.toFixed(2)} resisted ${pruneThreshold - 50} extra interactions)`,
        confidence: Math.max(0.3, 0.6 - sedimentation * 0.5),
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

  // 6. STRUCTURAL REORGANIZATION — Drive weight evolution
  // If a drive's curiosity triggers fire repeatedly, it should grow stronger over time
  if (drives) {
    for (const drive of drives.drives) {
      if ((drive.currentSpike || 0) > 0.3) {
        // This drive keeps getting triggered — it's becoming more important
        const currentEvolved = drives.evolvedWeights?.[drive.name] ?? drive.weight;
        if (currentEvolved < 0.95) {
          actions.push({
            type: 'reorganize-drives',
            description: `Drive "${drive.name}" is frequently triggered — growing stronger`,
            confidence: 0.6,
            data: { driveName: drive.name, delta: 0.02, reason: `Curiosity spike ${drive.currentSpike.toFixed(2)}` },
          });
        }
      }
    }
  }

  // 7. STRUCTURAL REORGANIZATION — Learn new reframing rules from repeated patterns
  // If the user consistently brings certain types of problems, add a reframing rule
  if (habits.totalInteractions > 5) {
    const topDomain = habits.domainExpertise
      .filter(d => (d.sedimentation ?? 0) > 0.3)
      .sort((a, b) => b.depth - a.depth)[0];
    if (topDomain && lower.includes(topDomain.domain.toLowerCase().split(' ')[0])) {
      actions.push({
        type: 'add-reframing-rule',
        description: `Learning to reframe "${topDomain.domain}" problems through accumulated experience`,
        confidence: 0.5,
        data: {
          trigger: topDomain.domain.toLowerCase().split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          reframeAs: `Familiar territory — you have deep experience here (${topDomain.workflowsBuilt} workflows). Apply proven patterns first, then innovate.`,
        },
      });
    }
  }

  // 8. Sedimentation — reinforce existing patterns that have been stable
  for (const domain of habits.domainExpertise) {
    if (domain.depth > 0.6 && (domain.sedimentation ?? 0) < 0.8) {
      actions.push({
        type: 'sediment-habit',
        description: `Domain "${domain.domain}" is becoming deeply ingrained`,
        confidence: 0.7,
        data: { type: 'domain', id: domain.id, sedimentIncrease: 0.01 },
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
  const newDrives = { ...drives, drives: drives.drives ? drives.drives.map(d => ({ ...d })) : [], evolvedWeights: { ...(drives.evolvedWeights || {}) } };

  for (const action of actions) {
    switch (action.type) {
      case 'strengthen-domain': {
        const d = newHabits.domainExpertise.find(x => x.id === action.data.domainId);
        if (d) {
          d.depth = Math.min(1.0, d.depth + (action.data.depthIncrease as number));
          d.lastSeen = Date.now();
          // Sedimentation grows with each reinforcement — making this habit harder to change
          d.sedimentation = Math.min(1.0, (d.sedimentation ?? 0) + (action.data.sedimentIncrease as number ?? 0.01));
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
            sedimentation: (action.data.initialSedimentation as number) ?? 0.05,
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
          existing.sedimentation = Math.min(1.0, (existing.sedimentation ?? 0) + (action.data.sedimentIncrease as number ?? 0.01));
        } else if (action.data.isNew && newHabits.workflowPreferences.length < MAX_PREFERENCES) {
          newHabits.workflowPreferences.push({
            pattern: action.data.pattern as string,
            frequency: 1,
            agentAffinity: 0.5,
            sedimentation: (action.data.initialSedimentation as number) ?? 0.05,
          });
        }
        break;
      }
      case 'adjust-drive': {
        const target = newDrives.drives.find(d => d.name === action.data.driveName);
        if (target) {
          const delta = Math.max(-DRIVE_ADJUST_CAP, Math.min(DRIVE_ADJUST_CAP, action.data.delta as number));
          target.weight = clamp(target.weight + delta);
          newDrives.evolvedWeights![target.name] = target.weight;
        }
        break;
      }
      case 'reorganize-drives': {
        // Structural reorganization: evolve drive weights based on usage patterns
        const driveName = action.data.driveName as string;
        const delta = Math.max(-DRIVE_ADJUST_CAP, Math.min(DRIVE_ADJUST_CAP, action.data.delta as number));
        const current = newDrives.evolvedWeights![driveName] ?? newDrives.drives.find(d => d.name === driveName)?.weight ?? 0.5;
        const newWeight = clamp(current + delta);
        newDrives.evolvedWeights![driveName] = newWeight;
        break;
      }
      case 'prune-stale': {
        const idx = newHabits.domainExpertise.findIndex(d => d.id === action.data.domainId);
        if (idx >= 0) {
          const sedimentation = newHabits.domainExpertise[idx].sedimentation ?? 0;
          // Sedimented habits decay slower — multiplier ranges from 0.5 (no sedimentation) to 0.85 (full)
          const decayFactor = 0.5 + (sedimentation * 0.35);
          newHabits.domainExpertise[idx].depth *= decayFactor;
        }
        break;
      }
      case 'sediment-habit': {
        // Pure sedimentation — make an existing habit more resistant to change
        if (action.data.type === 'domain') {
          const d = newHabits.domainExpertise.find(x => x.id === action.data.id);
          if (d) d.sedimentation = Math.min(1.0, (d.sedimentation ?? 0) + (action.data.sedimentIncrease as number));
        }
        break;
      }
      case 'grow-edge': {
        // Growth edges are stored in reflection layer, not habits
        break;
      }
      case 'add-reframing-rule': {
        // Reframing rules are applied in updateGrowthEdges → reflection layer
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

const MAX_LEARNED_REFRAMING_RULES = 5;
const MAX_DRIVE_EVOLUTION_LOG = 20;

export function updateGrowthEdges(
  reflection: ReflectionLayer,
  actions: ReflectionAction[],
): ReflectionLayer {
  const newReflection = {
    ...reflection,
    growthEdges: [...reflection.growthEdges],
    learnedReframingRules: [...(reflection.learnedReframingRules || [])],
    driveEvolutionLog: [...(reflection.driveEvolutionLog || [])],
  };

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

    // Structural reorganization: learn new reframing rules
    if (action.type === 'add-reframing-rule' && action.data.trigger && action.data.reframeAs) {
      const existing = newReflection.learnedReframingRules.find(r => r.trigger === action.data.trigger);
      if (!existing && newReflection.learnedReframingRules.length < MAX_LEARNED_REFRAMING_RULES) {
        newReflection.learnedReframingRules.push({
          trigger: action.data.trigger as string,
          reframeAs: action.data.reframeAs as string,
        });
      }
    }

    // Drive evolution logging — track how drives shift over time
    if (action.type === 'reorganize-drives' && action.data.driveName) {
      newReflection.driveEvolutionLog.push({
        driveName: action.data.driveName as string,
        oldWeight: 0, // filled by caller
        newWeight: 0, // filled by caller
        reason: action.data.reason as string || action.description,
        timestamp: Date.now(),
      });
      // Cap the log
      if (newReflection.driveEvolutionLog.length > MAX_DRIVE_EVOLUTION_LOG) {
        newReflection.driveEvolutionLog = newReflection.driveEvolutionLog.slice(-MAX_DRIVE_EVOLUTION_LOG);
      }
    }
  }

  // Prune old growth edges (> 7 days)
  newReflection.growthEdges = newReflection.growthEdges.filter(g =>
    Date.now() - g.identifiedAt < 7 * 24 * 60 * 60 * 1000
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
    spontaneousDirectives: [],
    reframedInput: undefined,
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
    learnedReframingRules: [],
    driveEvolutionLog: [],
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
