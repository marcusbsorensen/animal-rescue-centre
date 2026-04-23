import { describe, it, expect } from 'vitest';
import type { Animal, TimeProgress } from '@arc/shared-types';
import {
  phaseIndex,
  nextPhase,
  getTaskWeight,
  baseTasksPerPhase,
  computeTasksPerPhase,
  createTimeProgress,
  recordCareTask,
  refreshTasksPerPhase,
  countFullyBondedPets,
  isWeekend,
} from '../time';

function makeAnimal(id: string, overrides: Partial<Animal> = {}): Animal {
  return {
    id,
    name: 'T ' + id,
    species: 'cat',
    state: 'sheltered',
    arrivalStory: '',
    hunger: 30,
    tiredness: 20,
    happiness: 80,
    health: 100,
    bondLevel: 50,
    roomId: 'room-cat',
    ...overrides,
  };
}

// ── phase order ──────────────────────────────────────────────

describe('phaseIndex / nextPhase', () => {
  it('orders morning → afternoon → evening → night', () => {
    expect(phaseIndex('morning')).toBe(0);
    expect(phaseIndex('afternoon')).toBe(1);
    expect(phaseIndex('evening')).toBe(2);
    expect(phaseIndex('night')).toBe(3);
  });
  it('nextPhase wraps night → morning', () => {
    expect(nextPhase('morning')).toBe('afternoon');
    expect(nextPhase('afternoon')).toBe('evening');
    expect(nextPhase('evening')).toBe('night');
    expect(nextPhase('night')).toBe('morning');
  });
});

// ── task weights ─────────────────────────────────────────────

describe('getTaskWeight', () => {
  it('weights most tasks as 1 and supply runs as 3', () => {
    expect(getTaskWeight('feed')).toBe(1);
    expect(getTaskWeight('walk')).toBe(1);
    expect(getTaskWeight('bond')).toBe(1);
    expect(getTaskWeight('supply_run_complete')).toBe(3);
  });
});

// ── base tasks per phase ─────────────────────────────────────

describe('baseTasksPerPhase', () => {
  it('is slow at low levels, fast at high', () => {
    expect(baseTasksPerPhase(1)).toBe(12);
    expect(baseTasksPerPhase(2)).toBe(12);
    expect(baseTasksPerPhase(3)).toBe(10);
    expect(baseTasksPerPhase(5)).toBe(10);
    expect(baseTasksPerPhase(6)).toBe(8);
    expect(baseTasksPerPhase(8)).toBe(8);
    expect(baseTasksPerPhase(9)).toBe(6);
    expect(baseTasksPerPhase(20)).toBe(6);
  });
});

// ── helper modifiers ─────────────────────────────────────────

describe('computeTasksPerPhase', () => {
  it('returns base when no helpers', () => {
    expect(computeTasksPerPhase(1)).toBe(12);
    expect(computeTasksPerPhase(6)).toBe(8);
  });

  it('volunteer reduces by 15%', () => {
    // 12 * 0.85 = 10.2 → 10
    expect(computeTasksPerPhase(1, { volunteerHired: true })).toBe(10);
  });

  it('fully-bonded pets each reduce by 10%, capped at 3', () => {
    // 1 pet: 12 * 0.90 = 10.8 → 11
    expect(computeTasksPerPhase(1, { fullyBondedPets: 1 })).toBe(11);
    // 3 pets: 12 * 0.70 = 8.4 → 8
    expect(computeTasksPerPhase(1, { fullyBondedPets: 3 })).toBe(8);
    // 5 pets: capped to 3 → 8
    expect(computeTasksPerPhase(1, { fullyBondedPets: 5 })).toBe(8);
  });

  it('weekend reduces by 20%', () => {
    // 12 * 0.80 = 9.6 → 10
    expect(computeTasksPerPhase(1, { isWeekend: true })).toBe(10);
  });

  it('stacks multipliers but floors at 50%', () => {
    // Volunteer + 3 pets + weekend = 1 - 0.15 - 0.30 - 0.20 = 0.35 → floored to 0.50
    // 12 * 0.50 = 6
    expect(computeTasksPerPhase(1, {
      volunteerHired: true,
      fullyBondedPets: 3,
      isWeekend: true,
    })).toBe(6);
  });

  it('never returns below 1', () => {
    // Even with everything, level 9 base of 6 * 0.5 = 3 — not below 1
    expect(computeTasksPerPhase(9, {
      volunteerHired: true,
      fullyBondedPets: 3,
      isWeekend: true,
    })).toBe(3);
  });
});

// ── createTimeProgress ───────────────────────────────────────

describe('createTimeProgress', () => {
  it('initialises at morning with level-appropriate threshold', () => {
    const now = new Date('2026-04-19T08:00:00Z');
    const p = createTimeProgress(1, {}, now);
    expect(p.currentPhase).toBe('morning');
    expect(p.tasksThisPhase).toBe(0);
    expect(p.tasksPerPhase).toBe(12);
    expect(p.lastPhaseAdvanceAt).toBe(now.toISOString());
  });

  it('higher level starts with faster threshold', () => {
    const p = createTimeProgress(9);
    expect(p.tasksPerPhase).toBe(6);
  });
});

// ── recordCareTask ───────────────────────────────────────────

describe('recordCareTask', () => {
  const makeProgress = (overrides: Partial<TimeProgress> = {}): TimeProgress => ({
    currentPhase: 'morning',
    tasksThisPhase: 0,
    tasksPerPhase: 12,
    lastPhaseAdvanceAt: '2026-04-19T08:00:00Z',
    ...overrides,
  });

  it('adds one to the counter for a weight-1 task', () => {
    const p = makeProgress({ tasksThisPhase: 5 });
    const r = recordCareTask(p, 'feed');
    expect(r.progress.tasksThisPhase).toBe(6);
    expect(r.progress.currentPhase).toBe('morning');
    expect(r.phaseAdvanced).toBe(false);
    expect(r.dayRolled).toBe(false);
  });

  it('adds weight-3 for a supply run', () => {
    const p = makeProgress({ tasksThisPhase: 2 });
    const r = recordCareTask(p, 'supply_run_complete');
    expect(r.progress.tasksThisPhase).toBe(5);
    expect(r.phaseAdvanced).toBe(false);
  });

  it('advances phase when threshold reached exactly', () => {
    const p = makeProgress({ tasksThisPhase: 11 });
    const now = new Date('2026-04-19T12:00:00Z');
    const r = recordCareTask(p, 'feed', now);
    expect(r.phaseAdvanced).toBe(true);
    expect(r.newPhase).toBe('afternoon');
    expect(r.progress.currentPhase).toBe('afternoon');
    expect(r.progress.tasksThisPhase).toBe(0);
    expect(r.progress.lastPhaseAdvanceAt).toBe(now.toISOString());
    expect(r.dayRolled).toBe(false);
  });

  it('carries excess into the next phase counter', () => {
    // 10 done, add weight 3 (supply run) → 13 which is 1 past threshold 12
    const p = makeProgress({ tasksThisPhase: 10 });
    const r = recordCareTask(p, 'supply_run_complete');
    expect(r.phaseAdvanced).toBe(true);
    expect(r.newPhase).toBe('afternoon');
    expect(r.progress.tasksThisPhase).toBe(1);
  });

  it('rolls the day when advancing past night', () => {
    const p = makeProgress({ currentPhase: 'night', tasksThisPhase: 11 });
    const r = recordCareTask(p, 'walk');
    expect(r.phaseAdvanced).toBe(true);
    expect(r.dayRolled).toBe(true);
    expect(r.newPhase).toBe('morning');
  });

  it('does not mutate input', () => {
    const p = makeProgress({ tasksThisPhase: 11 });
    recordCareTask(p, 'feed');
    expect(p.tasksThisPhase).toBe(11);
    expect(p.currentPhase).toBe('morning');
  });
});

// ── refreshTasksPerPhase ─────────────────────────────────────

describe('refreshTasksPerPhase', () => {
  it('recomputes threshold when level changes', () => {
    const p: TimeProgress = {
      currentPhase: 'afternoon',
      tasksThisPhase: 3,
      tasksPerPhase: 12,
      lastPhaseAdvanceAt: '2026-04-19T10:00:00Z',
    };
    const result = refreshTasksPerPhase(p, 9);
    expect(result.tasksPerPhase).toBe(6);
    expect(result.currentPhase).toBe('afternoon');
    expect(result.tasksThisPhase).toBe(3);
  });

  it('clamps counter if new threshold is below current count', () => {
    const p: TimeProgress = {
      currentPhase: 'morning',
      tasksThisPhase: 10,   // already near the old threshold
      tasksPerPhase: 12,
      lastPhaseAdvanceAt: '2026-04-19T10:00:00Z',
    };
    // Hiring volunteer at level 9 → threshold becomes ~5
    const result = refreshTasksPerPhase(p, 9, { volunteerHired: true });
    expect(result.tasksThisPhase).toBeLessThan(result.tasksPerPhase);
  });

  it('returns unchanged if threshold is already correct', () => {
    const p: TimeProgress = {
      currentPhase: 'morning',
      tasksThisPhase: 3,
      tasksPerPhase: 12,
      lastPhaseAdvanceAt: '2026-04-19T10:00:00Z',
    };
    expect(refreshTasksPerPhase(p, 1)).toBe(p);
  });
});

// ── countFullyBondedPets ─────────────────────────────────────

describe('countFullyBondedPets', () => {
  it('counts pets at bondLevel 100', () => {
    const animals = [
      makeAnimal('a', { state: 'pet',       bondLevel: 100 }),
      makeAnimal('b', { state: 'pet',       bondLevel: 50  }),
      makeAnimal('c', { state: 'sheltered', bondLevel: 100 }),  // not a pet
      makeAnimal('d', { state: 'pet',       bondLevel: 100 }),
    ];
    expect(countFullyBondedPets(animals)).toBe(2);
  });
});

// ── isWeekend ────────────────────────────────────────────────

describe('isWeekend', () => {
  it('true for Saturday and Sunday', () => {
    expect(isWeekend(new Date('2026-04-18T12:00:00Z'))).toBe(true); // Sat
    expect(isWeekend(new Date('2026-04-19T12:00:00Z'))).toBe(true); // Sun
  });
  it('false for weekdays', () => {
    expect(isWeekend(new Date('2026-04-20T12:00:00Z'))).toBe(false); // Mon
    expect(isWeekend(new Date('2026-04-22T12:00:00Z'))).toBe(false); // Wed
  });
});
