import type { Animal, Species } from '@arc/shared-types';

// ── Walk System ────────────────────────────────────────────────
// Animals can go on walks — they encounter roads where the player
// must press "Stop" to teach road safety. Successful walks boost
// bond and happiness. Training with treats teaches new tricks.

export type WalkZone = 'park' | 'town' | 'beach' | 'forest';
export type WalkEvent = 'road_crossing' | 'friendly_animal' | 'treat_found' | 'puddle' | 'bird_chase' | 'rest_spot';

export interface WalkState {
  animal: Animal;
  zone: WalkZone;
  steps: number;
  maxSteps: number;
  leadOn: boolean;
  events: WalkEvent[];
  currentEventIndex: number;
  roadSafetyScore: number;    // 0–100, how well they did at crossings
  incidentCount: number;       // failed road crossings
  treatsUsed: number;
  completed: boolean;
}

export interface WalkEventDef {
  type: WalkEvent;
  emoji: string;
  description: string;
  requiresAction: boolean;
}

export const WALK_EVENTS: WalkEventDef[] = [
  { type: 'road_crossing',  emoji: '🚗', description: 'A road! Remember to stop and look both ways!', requiresAction: true },
  { type: 'friendly_animal', emoji: '🐿️', description: 'A friendly squirrel waves hello!', requiresAction: false },
  { type: 'treat_found',    emoji: '🍬', description: 'Found a treat on the path!', requiresAction: false },
  { type: 'puddle',         emoji: '💧', description: 'A big puddle! Splish splash!', requiresAction: false },
  { type: 'bird_chase',     emoji: '🐦', description: 'A cheeky bird is teasing!', requiresAction: false },
  { type: 'rest_spot',      emoji: '🪑', description: 'A nice bench for a rest.', requiresAction: false },
];

export const WALK_ZONES: Array<{ zone: WalkZone; emoji: string; label: string; description: string }> = [
  { zone: 'park',   emoji: '🌳', label: 'Park',   description: 'A lovely green park with paths and ponds.' },
  { zone: 'town',   emoji: '🏘️', label: 'Town',   description: 'The town centre with shops and crossings.' },
  { zone: 'beach',  emoji: '🏖️', label: 'Beach',  description: 'Sandy beach with waves and seagulls.' },
  { zone: 'forest', emoji: '🌲', label: 'Forest', description: 'A quiet forest full of wildlife.' },
];

/** Species that can go on walks */
export const WALKABLE_SPECIES: Species[] = ['cat', 'dog', 'fox', 'bunny'];

export function canGoOnWalk(animal: Animal): boolean {
  return (
    WALKABLE_SPECIES.includes(animal.species) &&
    animal.state !== 'arriving' &&
    animal.hunger < 70 &&
    animal.tiredness < 70
  );
}

/**
 * Generate a walk's event sequence based on the zone.
 * Town has more road crossings; park/beach/forest have fewer.
 */
export function generateWalkEvents(zone: WalkZone, steps: number): WalkEvent[] {
  const events: WalkEvent[] = [];
  const roadFrequency = zone === 'town' ? 0.4 : zone === 'park' ? 0.2 : 0.1;

  for (let i = 0; i < steps; i++) {
    const roll = Math.random();
    if (roll < roadFrequency) {
      events.push('road_crossing');
    } else if (roll < roadFrequency + 0.15) {
      events.push('friendly_animal');
    } else if (roll < roadFrequency + 0.25) {
      events.push('treat_found');
    } else if (roll < roadFrequency + 0.35) {
      events.push('puddle');
    } else if (roll < roadFrequency + 0.45) {
      events.push('bird_chase');
    } else {
      events.push('rest_spot');
    }
  }

  // Ensure at least one road crossing for educational value
  if (!events.includes('road_crossing') && events.length > 0) {
    events[Math.floor(events.length / 2)] = 'road_crossing';
  }

  return events;
}

/**
 * Start a new walk.
 */
export function startWalk(animal: Animal, zone: WalkZone): WalkState {
  const maxSteps = zone === 'town' ? 6 : 5;
  return {
    animal,
    zone,
    steps: 0,
    maxSteps,
    leadOn: true,
    events: generateWalkEvents(zone, maxSteps),
    currentEventIndex: 0,
    roadSafetyScore: 100,
    incidentCount: 0,
    treatsUsed: 0,
    completed: false,
  };
}

/**
 * Handle a road crossing — player pressed STOP in time.
 */
export function handleRoadCrossingSuccess(state: WalkState): WalkState {
  return { ...state };  // Score stays at 100, no penalty
}

/**
 * Handle a road crossing — player missed the STOP.
 */
export function handleRoadCrossingFail(state: WalkState): WalkState {
  return {
    ...state,
    roadSafetyScore: Math.max(0, state.roadSafetyScore - 25),
    incidentCount: state.incidentCount + 1,
  };
}

/**
 * Advance to the next event on the walk.
 */
export function advanceWalk(state: WalkState): WalkState {
  const nextIndex = state.currentEventIndex + 1;
  const completed = nextIndex >= state.events.length;

  return {
    ...state,
    currentEventIndex: nextIndex,
    steps: state.steps + 1,
    completed,
  };
}

/**
 * Calculate walk rewards when completed.
 */
export function calculateWalkRewards(state: WalkState): {
  bondIncrease: number;
  happinessIncrease: number;
  tirednessIncrease: number;
  perfectWalk: boolean;
} {
  const perfectWalk = state.incidentCount === 0;
  return {
    bondIncrease: perfectWalk ? 8 : 5,
    happinessIncrease: perfectWalk ? 15 : 10,
    tirednessIncrease: 20, // Walks are tiring!
    perfectWalk,
  };
}

// ── Training System ──────────────────────────────────────────

export type Trick = 'sit' | 'paw' | 'spin' | 'fetch' | 'roll_over' | 'high_five';

export interface TrickDef {
  trick: Trick;
  emoji: string;
  label: string;
  treatsRequired: number;
  speciesAllowed: Species[];
}

export const TRICKS: TrickDef[] = [
  { trick: 'sit',        emoji: '🪑', label: 'Sit',        treatsRequired: 1, speciesAllowed: ['cat', 'dog', 'fox', 'bunny'] },
  { trick: 'paw',        emoji: '🐾', label: 'Give Paw',   treatsRequired: 2, speciesAllowed: ['cat', 'dog', 'fox'] },
  { trick: 'spin',       emoji: '🔄', label: 'Spin',       treatsRequired: 2, speciesAllowed: ['dog', 'fox', 'parrot'] },
  { trick: 'fetch',      emoji: '🎾', label: 'Fetch',      treatsRequired: 3, speciesAllowed: ['dog', 'fox'] },
  { trick: 'roll_over',  emoji: '🤸', label: 'Roll Over',  treatsRequired: 3, speciesAllowed: ['dog', 'cat'] },
  { trick: 'high_five',  emoji: '🖐️', label: 'High Five',  treatsRequired: 4, speciesAllowed: ['parrot', 'bat'] },
];

/**
 * Get available tricks for a species that haven't been learned yet.
 */
export function getAvailableTricks(species: Species, learnedTricks: Trick[]): TrickDef[] {
  return TRICKS.filter(
    (t) => t.speciesAllowed.includes(species) && !learnedTricks.includes(t.trick)
  );
}

/**
 * Check if training can proceed (enough treats).
 */
export function canTrain(treatsAvailable: number, trick: TrickDef): boolean {
  return treatsAvailable >= trick.treatsRequired;
}
