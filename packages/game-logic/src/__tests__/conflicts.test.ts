import { describe, it, expect } from 'vitest';
import {
  shouldSpawnConflict,
  generateConflict,
  isResolutionEffective,
  resolveConflict,
  CONFLICT_TYPES,
  RESOLUTION_ACTIONS,
} from '../conflicts';
import type { Animal } from '@arc/shared-types';

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
    let spawned = false;
    for (let i = 0; i < 500; i++) {
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
