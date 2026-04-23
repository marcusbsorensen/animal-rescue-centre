import { describe, it, expect, beforeEach } from 'vitest';
import {
  APPRENTICE_DEFS,
  canRecruit,
  recruitApprentice,
  recomputeApprenticeUnlocks,
  isApprenticeRecruited,
  type ApprenticeStoreSlice,
} from '../apprentices';
import { getMaxShelterAnimals } from '../progression';

function makeStore(level = 2): ApprenticeStoreSlice {
  return {
    level,
    apprentices: [],
    apprenticeUnlocks: {
      extraCareTasksPerDay: 0,
      extraCatSlots: 0,
      extraSpeciesSlots: 0,
    },
  };
}

describe('APPRENTICE_DEFS', () => {
  it('defines exactly rhubarb, amara, kofi', () => {
    expect(Object.keys(APPRENTICE_DEFS).sort()).toEqual(['amara', 'kofi', 'rhubarb']);
  });

  it('links each apprentice to their cast household', () => {
    expect(APPRENTICE_DEFS.rhubarb.householdId).toBe('30-two-houses');
    expect(APPRENTICE_DEFS.amara.householdId).toBe('13-kumar-ishii');
    expect(APPRENTICE_DEFS.kofi.householdId).toBe('14-theo-grandkids');
  });
});

describe('canRecruit', () => {
  let store: ApprenticeStoreSlice;
  beforeEach(() => { store = makeStore(2); });

  it('allows recruiting a known apprentice at level 2', () => {
    expect(canRecruit('rhubarb', store)).toEqual({ ok: true });
  });

  it('rejects unknown apprentice ids', () => {
    const res = canRecruit('bogus', store);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/unknown/i);
  });

  it('rejects when player is below the minimum level', () => {
    const res = canRecruit('rhubarb', makeStore(1));
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/level/i);
  });

  it('rejects recruiting the same apprentice twice', () => {
    recruitApprentice('rhubarb', store);
    const res = canRecruit('rhubarb', store);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/already/i);
  });
});

describe('recruitApprentice', () => {
  it('adds the apprentice to the list with a timestamp and role', () => {
    const store = makeStore();
    const before = Date.now();
    recruitApprentice('rhubarb', store);
    const after = Date.now();
    expect(store.apprentices).toHaveLength(1);
    const entry = store.apprentices[0];
    expect(entry.id).toBe('rhubarb');
    expect(entry.householdId).toBe('30-two-houses');
    expect(entry.role).toBe('feeder');
    expect(entry.recruitedAt).toBeGreaterThanOrEqual(before);
    expect(entry.recruitedAt).toBeLessThanOrEqual(after);
  });

  it('recomputes unlocks on each recruit', () => {
    const store = makeStore();
    recruitApprentice('rhubarb', store);
    expect(store.apprenticeUnlocks.extraCareTasksPerDay).toBe(1);
    expect(store.apprenticeUnlocks.extraCatSlots).toBe(0);

    recruitApprentice('amara', store);
    expect(store.apprenticeUnlocks.extraCareTasksPerDay).toBe(1);
    expect(store.apprenticeUnlocks.extraCatSlots).toBe(1);
    expect(store.apprenticeUnlocks.extraSpeciesSlots).toBe(0);

    recruitApprentice('kofi', store);
    expect(store.apprenticeUnlocks).toEqual({
      extraCareTasksPerDay: 1,
      extraCatSlots: 1,
      extraSpeciesSlots: 1,
    });
  });

  it('throws when preconditions are not met', () => {
    const store = makeStore(1);
    expect(() => recruitApprentice('rhubarb', store)).toThrow();
    expect(store.apprentices).toHaveLength(0);
  });

  it('throws on double-recruit and leaves list intact', () => {
    const store = makeStore();
    recruitApprentice('rhubarb', store);
    expect(() => recruitApprentice('rhubarb', store)).toThrow();
    expect(store.apprentices).toHaveLength(1);
  });
});

describe('recomputeApprenticeUnlocks', () => {
  it('returns zeros for an empty list', () => {
    expect(recomputeApprenticeUnlocks([])).toEqual({
      extraCareTasksPerDay: 0,
      extraCatSlots: 0,
      extraSpeciesSlots: 0,
    });
  });

  it('ignores unknown ids without crashing (save-migration safety)', () => {
    const result = recomputeApprenticeUnlocks([
      { id: 'rhubarb', householdId: '30-two-houses', recruitedAt: 0, role: 'feeder' },
      { id: 'ghost',   householdId: 'x',             recruitedAt: 0, role: 'x' },
    ]);
    expect(result.extraCareTasksPerDay).toBe(1);
  });
});

describe('isApprenticeRecruited', () => {
  it('reflects the current list', () => {
    const store = makeStore();
    expect(isApprenticeRecruited('rhubarb', store)).toBe(false);
    recruitApprentice('rhubarb', store);
    expect(isApprenticeRecruited('rhubarb', store)).toBe(true);
    expect(isApprenticeRecruited('amara', store)).toBe(false);
  });
});

describe('getMaxShelterAnimals with apprentice unlocks', () => {
  it('matches the base cap when no species or unlocks are provided', () => {
    expect(getMaxShelterAnimals(1)).toBe(2);
    expect(getMaxShelterAnimals(3)).toBe(6);
  });

  it('adds extraCatSlots only when species is cat', () => {
    const unlocks = { extraCatSlots: 2 };
    expect(getMaxShelterAnimals(3, 'cat', unlocks)).toBe(8);
    expect(getMaxShelterAnimals(3, 'dog', unlocks)).toBe(6);
    expect(getMaxShelterAnimals(3, undefined, unlocks)).toBe(6);
  });

  it('is a no-op when extraCatSlots is zero or missing', () => {
    expect(getMaxShelterAnimals(2, 'cat', { extraCatSlots: 0 })).toBe(4);
    expect(getMaxShelterAnimals(2, 'cat')).toBe(4);
  });
});
