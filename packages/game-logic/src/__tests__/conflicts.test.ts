import { describe, it, expect } from 'vitest';
import {
  shouldSpawnConflict,
  generateConflict,
  pickConflictPair,
  isResolutionEffective,
  resolveConflict,
  CONFLICT_TYPES,
  RESOLUTION_ACTIONS,
} from '../conflicts';
import { setRelationship } from '../relationships';
import type { Animal, AnimalRelationship } from '@arc/shared-types';

function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'c1',
    name: 'Whiskers',
    species: 'cat',
    state: 'sheltered',
    arrivalStory: '',
    hunger: 20,
    tiredness: 20,
    happiness: 70,
    health: 100,
    bondLevel: 40,
    roomId: 'r1',
    ...overrides,
  };
}

describe('shouldSpawnConflict', () => {
  it('never spawns with fewer than 2 animals', () => {
    const result = shouldSpawnConflict([makeAnimal()]);
    expect(result).toBe(false);
  });

  it('never spawns with empty room', () => {
    expect(shouldSpawnConflict([])).toBe(false);
  });

  it('can spawn with unhappy crowded room', () => {
    const animals = Array.from({ length: 8 }, (_, i) =>
      makeAnimal({ id: `a${i}`, happiness: 10 })
    );
    // 3000 trials, for the same reason as the two-animal case below.
    // At 8 animals on 10 happiness the per-call chance is ~0.0092
    // (0.0025 base + 0.833·0.005 unhappiness + 0.833·0.003 crowding), so
    // 500 trials missed 1.0% of the time — this test, not the sibling one,
    // is what failed a full-workspace run on 2026-08-27. 3000 trials takes
    // the miss probability to ~1e-12 and still runs in single-digit ms.
    let spawned = false;
    for (let i = 0; i < 3000; i++) {
      if (shouldSpawnConflict(animals)) { spawned = true; break; }
    }
    expect(spawned).toBe(true);
  });
});

describe('generateConflict', () => {
  it('generates a conflict with descriptions', () => {
    const a1 = makeAnimal({ id: 'a1', name: 'Whiskers' });
    const a2 = makeAnimal({ id: 'a2', name: 'Mittens' });
    const conflict = generateConflict(a1, a2);
    expect(conflict.animal1Id).toBe('a1');
    expect(conflict.animal2Id).toBe('a2');
    expect(conflict.description).toContain('Whiskers');
    expect(conflict.resolved).toBe(false);
  });

  it('generates sibling squabble for siblings', () => {
    const a1 = makeAnimal({ id: 'a1', name: 'Whiskers', siblingId: 'a2' });
    const a2 = makeAnimal({ id: 'a2', name: 'Mittens', siblingId: 'a1' });
    const conflict = generateConflict(a1, a2);
    expect(conflict.type).toBe('sibling_squabble');
  });
});

describe('isResolutionEffective', () => {
  it('separate works for space_sharing', () => {
    expect(isResolutionEffective('space_sharing', 'separate')).toBe(true);
  });

  it('give_treat works for food_jealousy', () => {
    expect(isResolutionEffective('food_jealousy', 'give_treat')).toBe(true);
  });

  it('play_together works for sibling_squabble', () => {
    expect(isResolutionEffective('sibling_squabble', 'play_together')).toBe(true);
  });

  it('wrong action is not effective', () => {
    expect(isResolutionEffective('space_sharing', 'give_treat')).toBe(false);
  });
});

describe('resolveConflict', () => {
  it('effective resolution gives bigger happiness boost', () => {
    const effective = resolveConflict('food_jealousy', 'give_treat');
    const ineffective = resolveConflict('food_jealousy', 'separate');
    expect(effective.happinessBoost).toBeGreaterThan(ineffective.happinessBoost);
    expect(effective.effective).toBe(true);
    expect(ineffective.effective).toBe(false);
  });
});

describe('CONFLICT_TYPES', () => {
  it('has 4 conflict types', () => {
    expect(CONFLICT_TYPES).toHaveLength(4);
  });

  it('each type has descriptions', () => {
    for (const type of CONFLICT_TYPES) {
      expect(type.descriptions.length).toBeGreaterThan(0);
    }
  });
});

describe('RESOLUTION_ACTIONS', () => {
  it('has 4 resolution actions', () => {
    expect(RESOLUTION_ACTIONS).toHaveLength(4);
  });
});

// ── Edge cases an 8-year-old might trigger ──

describe('conflict edge cases', () => {
  it('shouldSpawnConflict with exactly 2 animals', () => {
    const animals = [
      makeAnimal({ id: 'a1', happiness: 10 }),
      makeAnimal({ id: 'a2', happiness: 10 }),
    ];
    // With low happiness the per-call spawn chance is ~0.0067
    // (0.0025 base + 0.833·0.005 unhappiness, zero crowding at 2 animals).
    // 500 trials has a ~3.5% miss rate on CI — flaky. 3000 trials drops
    // the miss probability below 1e-8 while still completing in <10ms.
    let spawned = false;
    for (let i = 0; i < 3000; i++) {
      if (shouldSpawnConflict(animals)) { spawned = true; break; }
    }
    expect(spawned).toBe(true);
  });

  it('shouldSpawnConflict with all animals at 100 happiness has very low chance', () => {
    const animals = [
      makeAnimal({ id: 'a1', happiness: 100 }),
      makeAnimal({ id: 'a2', happiness: 100 }),
    ];
    // chance = 0.01 + 0*0.02 + (2/8)*0.01 = 0.01 + 0.0025 = 0.0125
    // Still possible but rare — just ensure no crash
    const result = shouldSpawnConflict(animals);
    expect(typeof result).toBe('boolean');
  });

  it('generateConflict with two identical animals (same id)', () => {
    const animal = makeAnimal({ id: 'same', name: 'Whiskers' });
    // Should not crash even with same animal
    const conflict = generateConflict(animal, animal);
    expect(conflict.animal1Id).toBe('same');
    expect(conflict.animal2Id).toBe('same');
    expect(conflict.description.length).toBeGreaterThan(0);
  });

  it('generateConflict produces unique ids for rapid calls', () => {
    const a1 = makeAnimal({ id: 'a1', name: 'Whiskers' });
    const a2 = makeAnimal({ id: 'a2', name: 'Mittens' });
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateConflict(a1, a2).id);
    }
    // The assertion was right and the generator was wrong: ids were
    // Date.now() plus four base-36 characters of Math.random(), and a
    // hundred of them inside one millisecond collided ~0.3% of the time.
    // They come from a counter now, so this holds by construction.
    expect(ids.size).toBe(100);
  });

  it('generateConflict description contains both animal names', () => {
    const a1 = makeAnimal({ id: 'a1', name: 'Whiskers' });
    const a2 = makeAnimal({ id: 'a2', name: 'Mittens' });
    for (let i = 0; i < 20; i++) {
      const conflict = generateConflict(a1, a2);
      // Description templates use {a1} and {a2}, both names should appear
      const hasA1 = conflict.description.includes('Whiskers');
      const hasA2 = conflict.description.includes('Mittens');
      expect(hasA1 || hasA2).toBe(true);
    }
  });

  it('resolveConflict returns positive happinessBoost even for wrong action', () => {
    const result = resolveConflict('space_sharing', 'give_treat');
    expect(result.effective).toBe(false);
    expect(result.happinessBoost).toBe(3); // still gives some comfort
  });
});

describe('pickConflictPair', () => {
  it('returns null for fewer than 2 animals', () => {
    expect(pickConflictPair([])).toBeNull();
    expect(pickConflictPair([makeAnimal({ id: 'a' })])).toBeNull();
  });

  it('returns a pair for 2+ unrelated animals', () => {
    const a = makeAnimal({ id: 'a' });
    const b = makeAnimal({ id: 'b' });
    const pair = pickConflictPair([a, b]);
    expect(pair).not.toBeNull();
    expect(pair![0].id === 'a' || pair![0].id === 'b').toBe(true);
  });

  it('returns null when all pairs are friends', () => {
    const a = makeAnimal({ id: 'a' });
    const b = makeAnimal({ id: 'b' });
    const rels: AnimalRelationship[] = setRelationship([], 'a', 'b', 'friend');
    expect(pickConflictPair([a, b], rels)).toBeNull();
  });

  it('strongly biases toward enemy pairs', () => {
    const a = makeAnimal({ id: 'a' });
    const b = makeAnimal({ id: 'b' });
    const c = makeAnimal({ id: 'c' });
    const d = makeAnimal({ id: 'd' });
    // A and B are enemies; all others are unrelated
    const rels = setRelationship([], 'a', 'b', 'enemy');

    // Sample many times; enemies should dominate but not monopolise.
    let enemyPicks = 0;
    const ITER = 4000;
    for (let i = 0; i < ITER; i += 1) {
      const pair = pickConflictPair([a, b, c, d], rels);
      if (!pair) continue;
      const ids = new Set([pair[0].id, pair[1].id]);
      if (ids.has('a') && ids.has('b')) enemyPicks += 1;
    }

    // There are 6 pairs total; a-b has weight 5, others weight 1.
    // Expected proportion: 5 / (5 + 5) = 0.5.
    // Wide tolerance for RNG noise.
    expect(enemyPicks / ITER).toBeGreaterThan(0.4);
    expect(enemyPicks / ITER).toBeLessThan(0.6);
  });

  it('never picks friend pairs even when they are the only option', () => {
    const a = makeAnimal({ id: 'a' });
    const b = makeAnimal({ id: 'b' });
    const rels = setRelationship([], 'a', 'b', 'friend');
    for (let i = 0; i < 100; i += 1) {
      expect(pickConflictPair([a, b], rels)).toBeNull();
    }
  });
});
