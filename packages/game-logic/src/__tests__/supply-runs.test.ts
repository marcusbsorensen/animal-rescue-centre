import { describe, it, expect } from 'vitest';
import {
  canAccessDestination,
  startSupplyRun,
  generateObstacle,
  applyObstacleHit,
  applySmash,
  changeLane,
  advanceDistance,
  checkCompletion,
  isCatastrophicDamage,
  calculateSupplyRewards,
  getRepairCost,
  getDailyContractBonus,
  SUPPLY_DESTINATIONS,
  OBSTACLES,
  DAMAGE_THRESHOLDS,
} from '../supply-runs';

describe('destination unlock levels', () => {
  it('bramble_farm is accessible at level 0', () => {
    expect(canAccessDestination('bramble_farm', 0)).toBe(true);
  });

  it('cove_harbour requires level 5', () => {
    expect(canAccessDestination('cove_harbour', 4)).toBe(false);
    expect(canAccessDestination('cove_harbour', 5)).toBe(true);
    expect(canAccessDestination('cove_harbour', 10)).toBe(true);
  });

  it('pinebark_medical requires level 10', () => {
    expect(canAccessDestination('pinebark_medical', 9)).toBe(false);
    expect(canAccessDestination('pinebark_medical', 10)).toBe(true);
  });

  it('returns false for unknown destination', () => {
    expect(canAccessDestination('nonexistent' as any, 99)).toBe(false);
  });
});

describe('startSupplyRun', () => {
  it('initialises state correctly for bramble_farm', () => {
    const state = startSupplyRun('bramble_farm', false);
    expect(state.destination).toBe('bramble_farm');
    expect(state.distance).toBe(100);
    expect(state.distanceCovered).toBe(0);
    expect(state.damages).toEqual([]);
    expect(state.obstaclesDestroyed).toBe(0);
    expect(state.completed).toBe(false);
    expect(state.outcome).toBe('in_progress');
    expect(state.lane).toBe(1);
    expect(state.score).toBe(0);
    expect(state.timeTrialMode).toBe(false);
    expect(state.timeTrialLimitMs).toBeUndefined();
  });

  it('sets time trial limit when time trial mode is on', () => {
    const state = startSupplyRun('bramble_farm', true);
    expect(state.timeTrialMode).toBe(true);
    expect(state.timeTrialLimitMs).toBeDefined();
    expect(state.timeTrialLimitMs).toBeGreaterThan(0);
  });

  it('throws for unknown destination', () => {
    expect(() => startSupplyRun('nowhere' as any, false)).toThrow('Unknown destination');
  });
});

describe('obstacle hits increase damage', () => {
  it('applying an obstacle hit adds a damage entry', () => {
    const state = startSupplyRun('bramble_farm', false);
    const obstacle = OBSTACLES.find((o) => o.type === 'wooden_crates')!;
    const after = applyObstacleHit(state, obstacle);
    expect(after.damages.length).toBe(1);
    expect(after.damages[0].severity).toBe(obstacle.damageOnHit);
  });

  it('multiple hits accumulate damage entries', () => {
    let state = startSupplyRun('bramble_farm', false);
    const obstacle = OBSTACLES.find((o) => o.type === 'traffic_cones')!;
    state = applyObstacleHit(state, obstacle);
    state = applyObstacleHit(state, obstacle);
    state = applyObstacleHit(state, obstacle);
    expect(state.damages.length).toBe(3);
  });
});

describe('smashing obstacles', () => {
  it('smashing a smashable obstacle increases score and obstaclesDestroyed', () => {
    const state = startSupplyRun('bramble_farm', false);
    const obstacle = OBSTACLES.find((o) => o.type === 'cardboard_boxes')!;
    const after = applySmash(state, obstacle);
    expect(after.obstaclesDestroyed).toBe(1);
    expect(after.score).toBe(obstacle.scoreOnSmash);
  });

  it('smashing applies reduced damage (30%)', () => {
    const state = startSupplyRun('bramble_farm', false);
    const obstacle = OBSTACLES.find((o) => o.type === 'wooden_crates')!;
    const after = applySmash(state, obstacle);
    const expectedDmg = Math.ceil(obstacle.damageOnHit * 0.3);
    expect(after.damages[0].severity).toBe(expectedDmg);
  });

  it('smashing a non-smashable obstacle applies full damage', () => {
    const state = startSupplyRun('bramble_farm', false);
    const obstacle = OBSTACLES.find((o) => o.type === 'barriers')!;
    expect(obstacle.smashable).toBe(false);
    const after = applySmash(state, obstacle);
    expect(after.damages[0].severity).toBe(obstacle.damageOnHit);
    expect(after.obstaclesDestroyed).toBe(0);
  });
});

describe('lane changes', () => {
  it('starts in lane 1 (middle)', () => {
    const state = startSupplyRun('bramble_farm', false);
    expect(state.lane).toBe(1);
  });

  it('moving left decreases lane', () => {
    const state = startSupplyRun('bramble_farm', false);
    const after = changeLane(state, -1);
    expect(after.lane).toBe(0);
  });

  it('moving right increases lane', () => {
    const state = startSupplyRun('bramble_farm', false);
    const after = changeLane(state, 1);
    expect(after.lane).toBe(2);
  });

  it('lane is bounded at 0 (cannot go below)', () => {
    let state = startSupplyRun('bramble_farm', false);
    state = changeLane(state, -1); // lane 0
    state = changeLane(state, -1); // still 0
    expect(state.lane).toBe(0);
  });

  it('lane is bounded at 2 (cannot go above)', () => {
    let state = startSupplyRun('bramble_farm', false);
    state = changeLane(state, 1);  // lane 2
    state = changeLane(state, 1);  // still 2
    expect(state.lane).toBe(2);
  });
});

describe('completion detection', () => {
  it('run is not complete when distance not reached', () => {
    let state = startSupplyRun('bramble_farm', false);
    state = advanceDistance(state, 50);
    state = checkCompletion(state);
    expect(state.completed).toBe(false);
    expect(state.outcome).toBe('in_progress');
  });

  it('run completes when distance is reached', () => {
    let state = startSupplyRun('bramble_farm', false);
    state = advanceDistance(state, 100);
    state = checkCompletion(state);
    expect(state.completed).toBe(true);
    expect(state.outcome).toBe('success');
  });

  it('run completes when distance is exceeded', () => {
    let state = startSupplyRun('bramble_farm', false);
    state = advanceDistance(state, 150);
    // distanceCovered is clamped to distance
    expect(state.distanceCovered).toBe(100);
    state = checkCompletion(state);
    expect(state.completed).toBe(true);
  });
});

describe('catastrophic damage', () => {
  it('is not catastrophic with low damage', () => {
    const state = startSupplyRun('bramble_farm', false);
    expect(isCatastrophicDamage(state)).toBe(false);
  });

  it('is catastrophic when total damage exceeds 90', () => {
    let state = startSupplyRun('bramble_farm', false);
    const barrel = OBSTACLES.find((o) => o.type === 'oil_drums')!; // 12 damage each
    // Hit 8 times = 96 damage
    for (let i = 0; i < 8; i++) {
      state = applyObstacleHit(state, barrel);
    }
    expect(isCatastrophicDamage(state)).toBe(true);
  });

  it('hitting too many obstacles marks run as totalled', () => {
    let state = startSupplyRun('bramble_farm', false);
    const barrier = OBSTACLES.find((o) => o.type === 'barriers')!; // 15 damage each
    // Hit 7 times = 105 damage
    for (let i = 0; i < 7; i++) {
      state = applyObstacleHit(state, barrier);
    }
    expect(state.outcome).toBe('totalled');
    expect(state.completed).toBe(true);
  });
});

describe('calculateSupplyRewards', () => {
  it('gives base pay for a clean completion', () => {
    let state = startSupplyRun('bramble_farm', false);
    state = advanceDistance(state, 100);
    state = checkCompletion(state);
    const rewards = calculateSupplyRewards(state);
    // Base 50 + 50% perfect run bonus = 75
    expect(rewards.earnings).toBe(75);
    expect(rewards.perfectRun).toBe(true);
    expect(rewards.bonuses).toContain('Perfect Run (+50%)');
  });

  it('gives cargo intact bonus for low damage', () => {
    let state = startSupplyRun('bramble_farm', false);
    const cones = OBSTACLES.find((o) => o.type === 'traffic_cones')!; // 3 damage
    state = applyObstacleHit(state, cones); // 3 total damage
    state = advanceDistance(state, 100);
    state = checkCompletion(state);
    const rewards = calculateSupplyRewards(state);
    // Base 50 + 25% cargo intact = 62.5 -> 63
    expect(rewards.earnings).toBe(63);
    expect(rewards.perfectRun).toBe(false);
    expect(rewards.bonuses).toContain('Cargo Intact (+25%)');
  });

  it('gives time trial bonus when time is within limit', () => {
    let state = startSupplyRun('bramble_farm', true);
    state = advanceDistance(state, 100);
    state = checkCompletion(state);
    // timeTakenMs is 0, well within limit
    const rewards = calculateSupplyRewards(state);
    expect(rewards.bonuses).toContain('Time Trial Beat (+30%)');
  });

  it('gives zero earnings for totalled runs', () => {
    let state = startSupplyRun('bramble_farm', false);
    const barrier = OBSTACLES.find((o) => o.type === 'barriers')!;
    for (let i = 0; i < 7; i++) {
      state = applyObstacleHit(state, barrier);
    }
    const rewards = calculateSupplyRewards(state);
    expect(rewards.earnings).toBe(0);
    expect(rewards.perfectRun).toBe(false);
  });

  it('gives smash spree bonus for 5+ destroyed', () => {
    let state = startSupplyRun('bramble_farm', false);
    const boxes = OBSTACLES.find((o) => o.type === 'cardboard_boxes')!;
    for (let i = 0; i < 5; i++) {
      state = applySmash(state, boxes);
    }
    state = advanceDistance(state, 100);
    state = checkCompletion(state);
    const rewards = calculateSupplyRewards(state);
    expect(rewards.bonuses).toContain('Smash Spree (+20%)');
  });
});

describe('getDailyContractBonus', () => {
  it('returns 1.5x for first run of the day', () => {
    expect(getDailyContractBonus(0)).toBe(1.5);
  });

  it('returns 1.0x for subsequent runs', () => {
    expect(getDailyContractBonus(1)).toBe(1.0);
    expect(getDailyContractBonus(5)).toBe(1.0);
  });
});

describe('getRepairCost', () => {
  it('returns empty parts for no damage', () => {
    const state = startSupplyRun('bramble_farm', false);
    const cost = getRepairCost(state);
    expect(Object.keys(cost).length).toBe(0);
  });

  it('returns parts matching damage thresholds', () => {
    let state = startSupplyRun('bramble_farm', false);
    const barrel = OBSTACLES.find((o) => o.type === 'oil_drums')!; // 12 each
    state = applyObstacleHit(state, barrel); // 12 total -> scratches threshold (10)
    const cost = getRepairCost(state);
    expect(cost['polish']).toBeGreaterThanOrEqual(1);
  });

  it('accumulates parts for higher damage', () => {
    let state = startSupplyRun('bramble_farm', false);
    const barrel = OBSTACLES.find((o) => o.type === 'oil_drums')!;
    // 3 hits = 36 total -> scratches + dents + rattles thresholds
    state = applyObstacleHit(state, barrel);
    state = applyObstacleHit(state, barrel);
    state = applyObstacleHit(state, barrel);
    const cost = getRepairCost(state);
    expect(cost['polish']).toBeGreaterThanOrEqual(1);
    expect(cost['bolts']).toBeGreaterThanOrEqual(2);
  });
});

describe('generateObstacle', () => {
  it('returns a valid obstacle', () => {
    for (let i = 0; i < 20; i++) {
      const obstacle = generateObstacle('bramble_farm');
      expect(obstacle).toBeDefined();
      expect(obstacle.type).toBeDefined();
      expect(typeof obstacle.damageOnHit).toBe('number');
    }
  });
});

describe('SUPPLY_DESTINATIONS catalogue', () => {
  it('has three destinations', () => {
    expect(SUPPLY_DESTINATIONS).toHaveLength(3);
  });

  it('destinations have increasing distances', () => {
    for (let i = 1; i < SUPPLY_DESTINATIONS.length; i++) {
      expect(SUPPLY_DESTINATIONS[i].distance).toBeGreaterThan(SUPPLY_DESTINATIONS[i - 1].distance);
    }
  });
});
