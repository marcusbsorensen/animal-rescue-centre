import type { SupplyDestination, DamageType, SupplyRunState, DamageEntry } from '@arc/shared-types';

// ── Supply Run System ────────────────────────────────────────
// Supply Runs are cargo-free drives — the player drives fast,
// smashes through obstacles, earns money. A deliberate tonal
// shift from the gentle care gameplay.

// ── Destinations ─────────────────────────────────────────────

export interface DestinationDef {
  destination: SupplyDestination;
  label: string;
  emoji: string;
  description: string;
  distance: number;            // arbitrary units (affects run length)
  basePay: number;             // coins
  unlockLevel: number;         // 0 = start, 5 = Cove, 10 = Pinebark
  obstacleFrequency: number;   // 0-1, how often obstacles appear
  trafficDensity: number;      // 0-1
}

export const SUPPLY_DESTINATIONS: DestinationDef[] = [
  {
    destination: 'bramble_farm',
    label: 'Bramble Farm Supplies',
    emoji: '\uD83C\uDF3E',
    description: 'Hay, straw, feed, and bedding for the animals',
    distance: 100,
    basePay: 50,
    unlockLevel: 0,
    obstacleFrequency: 0.3,
    trafficDensity: 0.2,
  },
  {
    destination: 'cove_harbour',
    label: 'Cove Harbour Fish Market',
    emoji: '\uD83D\uDC1F',
    description: 'Fresh fish for cats, foxes, and bats',
    distance: 150,
    basePay: 75,
    unlockLevel: 5,
    obstacleFrequency: 0.4,
    trafficDensity: 0.3,
  },
  {
    destination: 'pinebark_medical',
    label: 'Pinebark Medical Wholesale',
    emoji: '\uD83D\uDC8A',
    description: 'Bandages, medicines, and equipment',
    distance: 200,
    basePay: 120,
    unlockLevel: 10,
    obstacleFrequency: 0.5,
    trafficDensity: 0.4,
  },
];

// ── Obstacles ────────────────────────────────────────────────

export interface ObstacleDef {
  type: string;
  emoji: string;
  label: string;
  damageOnHit: number;   // 0-20
  smashable: boolean;     // can be destroyed by driving through
  scoreOnSmash: number;   // points for destroying it
}

export const OBSTACLES: ObstacleDef[] = [
  { type: 'cardboard_boxes', emoji: '\uD83D\uDCE6', label: 'Cardboard Boxes', damageOnHit: 2, smashable: true, scoreOnSmash: 10 },
  { type: 'traffic_cones', emoji: '\uD83E\uDEA7', label: 'Traffic Cones', damageOnHit: 3, smashable: true, scoreOnSmash: 15 },
  { type: 'hay_bales', emoji: '\uD83C\uDF3E', label: 'Hay Bales', damageOnHit: 5, smashable: true, scoreOnSmash: 20 },
  { type: 'wooden_crates', emoji: '\uD83E\uDDF0', label: 'Wooden Crates', damageOnHit: 8, smashable: true, scoreOnSmash: 30 },
  { type: 'puddles', emoji: '\uD83D\uDCA7', label: 'Puddles', damageOnHit: 1, smashable: false, scoreOnSmash: 0 },
  { type: 'oil_drums', emoji: '\uD83D\uDEE2\uFE0F', label: 'Oil Drums', damageOnHit: 12, smashable: false, scoreOnSmash: 0 },
  { type: 'tyre_stacks', emoji: '\u2B55', label: 'Tyre Stacks', damageOnHit: 6, smashable: true, scoreOnSmash: 25 },
  { type: 'barriers', emoji: '\uD83D\uDEA7', label: 'Barriers', damageOnHit: 15, smashable: false, scoreOnSmash: 0 },
];

// ── Damage System ────────────────────────────────────────────

export interface DamageThreshold {
  type: DamageType;
  label: string;
  emoji: string;
  threshold: number;        // damage level that triggers this category
  repairParts: Record<string, number>;  // part_code -> quantity needed
  severity: 'cosmetic' | 'minor' | 'moderate' | 'major' | 'catastrophic';
}

export const DAMAGE_THRESHOLDS: DamageThreshold[] = [
  { type: 'scratches', label: 'Scratches', emoji: '\uD83E\uDE79', threshold: 10, repairParts: { polish: 1 }, severity: 'cosmetic' },
  { type: 'dents', label: 'Dents', emoji: '\uD83D\uDD28', threshold: 20, repairParts: { panel_filler: 1, polish: 1 }, severity: 'minor' },
  { type: 'rattles', label: 'Rattles', emoji: '\uD83D\uDD14', threshold: 35, repairParts: { bolts: 2, wrench_kit: 1 }, severity: 'minor' },
  { type: 'broken_lights', label: 'Broken Lights', emoji: '\uD83D\uDCA1', threshold: 45, repairParts: { bulb_set: 1, wiring: 1 }, severity: 'moderate' },
  { type: 'suspension', label: 'Suspension Damage', emoji: '\uD83E\uDDBE', threshold: 60, repairParts: { spring_kit: 2, bolts: 4 }, severity: 'moderate' },
  { type: 'engine_trouble', label: 'Engine Trouble', emoji: '\u2699\uFE0F', threshold: 75, repairParts: { spark_plugs: 2, oil_can: 1, gasket: 1 }, severity: 'major' },
  { type: 'bodywork', label: 'Bodywork Damage', emoji: '\uD83D\uDE97', threshold: 85, repairParts: { panel_filler: 3, welding_kit: 1, paint: 2 }, severity: 'major' },
  { type: 'total', label: 'Total Write-Off', emoji: '\uD83D\uDCA5', threshold: 95, repairParts: { engine_rebuild: 1, chassis_parts: 4, welding_kit: 2, paint: 3 }, severity: 'catastrophic' },
];

// ── Extended run state (adds lane tracking on top of shared SupplyRunState) ──

export interface SupplyRunLaneState extends SupplyRunState {
  lane: number;   // 0, 1, or 2 (three-lane road)
  score: number;  // running smash score
}

// ── Helper: total damage from damages array ──

function getTotalDamage(damages: DamageEntry[]): number {
  return damages.reduce((sum, d) => sum + d.severity, 0);
}

// ── Functions ────────────────────────────────────────────────

/**
 * Check if a destination is accessible at the given player level.
 */
export function canAccessDestination(dest: SupplyDestination, level: number): boolean {
  const def = SUPPLY_DESTINATIONS.find((d) => d.destination === dest);
  if (!def) return false;
  return level >= def.unlockLevel;
}

/**
 * Start a new supply run.
 */
export function startSupplyRun(destination: SupplyDestination, timeTrial: boolean): SupplyRunLaneState {
  const def = SUPPLY_DESTINATIONS.find((d) => d.destination === destination);
  if (!def) {
    throw new Error(`Unknown destination: ${destination}`);
  }
  return {
    destination,
    distance: def.distance,
    distanceCovered: 0,
    speed: 0,
    maxSpeed: 100,
    damages: [],
    obstaclesDestroyed: 0,
    timeTakenMs: 0,
    timeTrialMode: timeTrial,
    timeTrialLimitMs: timeTrial ? def.distance * 200 : undefined,
    completed: false,
    outcome: 'in_progress',
    earnings: 0,
    lane: 1,   // start in the middle lane
    score: 0,
  };
}

/**
 * Generate a random obstacle based on the destination's obstacle frequency.
 * Harder destinations have a wider pool of dangerous obstacles.
 */
export function generateObstacle(destination: SupplyDestination): ObstacleDef {
  const def = SUPPLY_DESTINATIONS.find((d) => d.destination === destination);
  // More dangerous destinations include more of the heavy obstacles
  const maxIndex = def
    ? Math.min(OBSTACLES.length, Math.ceil(OBSTACLES.length * (0.5 + def.obstacleFrequency)))
    : OBSTACLES.length;
  const pool = OBSTACLES.slice(0, maxIndex);
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Apply damage from hitting an obstacle the player didn't avoid.
 */
export function applyObstacleHit(state: SupplyRunLaneState, obstacle: ObstacleDef): SupplyRunLaneState {
  const damageType = pickDamageType(getTotalDamage(state.damages) + obstacle.damageOnHit);
  const newDamages: DamageEntry[] = [...state.damages, { type: damageType, severity: obstacle.damageOnHit }];
  const totalDmg = getTotalDamage(newDamages);
  const isTotalled = totalDmg > 90;

  return {
    ...state,
    damages: newDamages,
    outcome: isTotalled ? 'totalled' : state.outcome,
    completed: isTotalled ? true : state.completed,
  };
}

/**
 * Smash through a smashable obstacle -- earns points, still takes reduced damage.
 */
export function applySmash(state: SupplyRunLaneState, obstacle: ObstacleDef): SupplyRunLaneState {
  if (!obstacle.smashable) {
    return applyObstacleHit(state, obstacle);
  }

  const reducedDamage = Math.ceil(obstacle.damageOnHit * 0.3);
  const damageType = pickDamageType(getTotalDamage(state.damages) + reducedDamage);
  const newDamages: DamageEntry[] = reducedDamage > 0
    ? [...state.damages, { type: damageType, severity: reducedDamage }]
    : state.damages;
  const totalDmg = getTotalDamage(newDamages);
  const isTotalled = totalDmg > 90;

  return {
    ...state,
    damages: newDamages,
    obstaclesDestroyed: state.obstaclesDestroyed + 1,
    score: state.score + obstacle.scoreOnSmash,
    outcome: isTotalled ? 'totalled' : state.outcome,
    completed: isTotalled ? true : state.completed,
  };
}

/**
 * Change lane: -1 for left, +1 for right. Clamped to 0-2.
 */
export function changeLane(state: SupplyRunLaneState, direction: -1 | 1): SupplyRunLaneState {
  const newLane = Math.max(0, Math.min(2, state.lane + direction));
  return { ...state, lane: newLane };
}

/**
 * Advance the run by a distance delta.
 */
export function advanceDistance(state: SupplyRunLaneState, delta: number): SupplyRunLaneState {
  const newDistance = state.distanceCovered + delta;
  return {
    ...state,
    distanceCovered: Math.min(newDistance, state.distance),
  };
}

/**
 * Check if the run is completed (distance covered >= total distance).
 */
export function checkCompletion(state: SupplyRunLaneState): SupplyRunLaneState {
  if (state.outcome === 'totalled') return state;
  if (state.distanceCovered >= state.distance) {
    return { ...state, completed: true, outcome: 'success' };
  }
  return state;
}

/**
 * Check if total damage exceeds catastrophic threshold (> 90).
 */
export function isCatastrophicDamage(state: SupplyRunLaneState): boolean {
  return getTotalDamage(state.damages) > 90;
}

/**
 * Calculate rewards for a completed supply run.
 */
export function calculateSupplyRewards(state: SupplyRunLaneState): {
  earnings: number;
  bonuses: string[];
  perfectRun: boolean;
  sticker?: string;
} {
  const def = SUPPLY_DESTINATIONS.find((d) => d.destination === state.destination);
  if (!def) return { earnings: 0, bonuses: [], perfectRun: false };

  const totalDmg = getTotalDamage(state.damages);
  const perfectRun = totalDmg === 0;
  let earnings = def.basePay;
  const bonuses: string[] = [];

  // Perfect run bonus: no damage taken
  if (perfectRun) {
    earnings += Math.round(def.basePay * 0.5);
    bonuses.push('Perfect Run (+50%)');
  }

  // Low damage bonus (cargo intact): < 20 total damage
  if (!perfectRun && totalDmg < 20) {
    earnings += Math.round(def.basePay * 0.25);
    bonuses.push('Cargo Intact (+25%)');
  }

  // Time trial bonus
  if (state.timeTrialMode && state.timeTrialLimitMs && state.timeTakenMs <= state.timeTrialLimitMs) {
    earnings += Math.round(def.basePay * 0.3);
    bonuses.push('Time Trial Beat (+30%)');
  }

  // Smash bonus: 5+ obstacles destroyed
  if (state.obstaclesDestroyed >= 5) {
    earnings += Math.round(def.basePay * 0.2);
    bonuses.push('Smash Spree (+20%)');
  }

  // Sticker for truly exceptional runs
  let sticker: string | undefined;
  if (perfectRun && state.obstaclesDestroyed >= 3) {
    sticker = 'speed_demon';
  }

  // Totalled runs earn nothing
  if (state.outcome === 'totalled') {
    return { earnings: 0, bonuses: ['Vehicle Totalled - No Earnings'], perfectRun: false };
  }

  return { earnings, bonuses, perfectRun, sticker };
}

/**
 * Calculate repair cost based on total accumulated damage.
 */
export function getRepairCost(state: SupplyRunLaneState): Record<string, number> {
  const totalDmg = getTotalDamage(state.damages);
  const parts: Record<string, number> = {};

  for (const threshold of DAMAGE_THRESHOLDS) {
    if (totalDmg >= threshold.threshold) {
      for (const [part, qty] of Object.entries(threshold.repairParts)) {
        parts[part] = (parts[part] || 0) + qty;
      }
    }
  }

  return parts;
}

/**
 * Daily contract bonus: first run of the day gets 1.5x multiplier.
 * Returns the multiplier.
 */
export function getDailyContractBonus(runsToday: number): number {
  return runsToday === 0 ? 1.5 : 1.0;
}

// ── Internal helpers ─────────────────────────────────────────

/**
 * Pick the most appropriate damage type based on total accumulated damage.
 */
function pickDamageType(totalAfterHit: number): DamageType {
  let matched: DamageType = 'scratches';
  for (const threshold of DAMAGE_THRESHOLDS) {
    if (totalAfterHit >= threshold.threshold) {
      matched = threshold.type;
    }
  }
  return matched;
}
