import type { HabitLayer, HabitPattern, ReflectionEntry } from './types';

const MAX_HABITS = 10;
const STRENGTHEN_DELTA = 0.1;
const WEAKEN_DELTA = 0.15;
const MIN_STRENGTH = 0.1;
const INITIAL_STRENGTH = 0.3;

/** Process a single reflection entry and return updated habits */
export function processReflection(habits: HabitLayer, entry: ReflectionEntry): HabitLayer {
  const patterns = [...habits.interactionPatterns];
  const mod = entry.habitModification;

  switch (mod.action) {
    case 'strengthen': {
      const target = patterns.find(p => p.id === mod.targetId);
      if (target) {
        target.strength = Math.min(1.0, target.strength + STRENGTHEN_DELTA);
        target.reinforcedCount++;
      }
      break;
    }
    case 'weaken': {
      const idx = patterns.findIndex(p => p.id === mod.targetId);
      if (idx >= 0) {
        patterns[idx].strength -= WEAKEN_DELTA;
        if (patterns[idx].strength < MIN_STRENGTH) {
          patterns.splice(idx, 1);
        }
      }
      break;
    }
    case 'add': {
      if (mod.newPattern) {
        patterns.push({
          id: `habit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          pattern: mod.newPattern,
          strength: INITIAL_STRENGTH,
          formedAt: Date.now(),
          reinforcedCount: 0,
        });
      }
      break;
    }
    case 'remove': {
      const removeIdx = patterns.findIndex(p => p.id === mod.targetId);
      if (removeIdx >= 0) patterns.splice(removeIdx, 1);
      break;
    }
  }

  // Prune to max, keeping highest-strength habits
  if (patterns.length > MAX_HABITS) {
    patterns.sort((a, b) => b.strength - a.strength);
    patterns.length = MAX_HABITS;
  }

  return {
    ...habits,
    interactionPatterns: patterns,
    lastUpdated: Date.now(),
  };
}

/** Process all pending reflections and return cleaned state */
export function processAllReflections(
  habits: HabitLayer,
  reflections: ReflectionEntry[],
): HabitLayer {
  let result = habits;
  for (const entry of reflections) {
    result = processReflection(result, entry);
  }
  return result;
}

/** Detect patterns from recent conversation and suggest habit formations */
export function detectPatterns(
  recentUserMessages: string[],
  existingHabits: HabitPattern[],
): ReflectionEntry[] {
  const entries: ReflectionEntry[] = [];
  const combined = recentUserMessages.join(' ').toLowerCase();
  const existingPatternTexts = existingHabits.map(h => h.pattern.toLowerCase());

  // Detect repeated category preferences
  const categoryMentions: Record<string, number> = {};
  const categories = ['test', 'review', 'policy', 'action', 'trigger', 'input', 'output'];
  for (const cat of categories) {
    const regex = new RegExp(`\\b${cat}\\b`, 'gi');
    const matches = combined.match(regex);
    if (matches && matches.length >= 2) {
      categoryMentions[cat] = matches.length;
    }
  }

  for (const [cat, count] of Object.entries(categoryMentions)) {
    const patternText = `User frequently requests ${cat} nodes`;
    if (count >= 3 && !existingPatternTexts.some(p => p.includes(cat))) {
      entries.push({
        trigger: 'session_end',
        observation: `User mentioned "${cat}" ${count} times in recent messages`,
        habitModification: { action: 'add', newPattern: patternText },
        timestamp: Date.now(),
      });
    } else {
      // Reinforce existing pattern
      const existing = existingHabits.find(h => h.pattern.toLowerCase().includes(cat));
      if (existing) {
        entries.push({
          trigger: 'session_end',
          observation: `Reinforcing: user continues to request ${cat}`,
          habitModification: { action: 'strengthen', targetId: existing.id },
          timestamp: Date.now(),
        });
      }
    }
  }

  // Detect verbosity preference
  const shortMessages = recentUserMessages.filter(m => m.length < 30).length;
  if (shortMessages > recentUserMessages.length * 0.7 && recentUserMessages.length >= 3) {
    if (!existingPatternTexts.some(p => p.includes('concise') || p.includes('brief') || p.includes('short'))) {
      entries.push({
        trigger: 'session_end',
        observation: 'User consistently sends short messages — prefers brevity',
        habitModification: { action: 'add', newPattern: 'User prefers concise responses — keep messages brief' },
        timestamp: Date.now(),
      });
    }
  }

  return entries;
}

/** Create default empty habit layer */
export function createDefaultHabits(): HabitLayer {
  return {
    interactionPatterns: [],
    preferredStrategies: [],
    avoidancePatterns: [],
    lastUpdated: Date.now(),
  };
}

/** Create default generation layer (ephemeral) */
export function createDefaultGeneration(): import('./types').GenerationLayer {
  return {
    currentMood: 'focused',
    activeGoal: null,
    recentObservations: [],
    interactionCount: 0,
    successStreak: 0,
    errorCount: 0,
  };
}

/** Create default reflection layer */
export function createDefaultReflection(): import('./types').ReflectionLayer {
  return {
    pendingReflections: [],
    lastReflectionAt: Date.now(),
  };
}
