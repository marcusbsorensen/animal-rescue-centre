import { describe, it, expect } from 'vitest';
import { calculateBondIncrease, isBondComplete } from '../bond';
import type { Animal } from '@arc/shared-types';

function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'test-1',
    name: 'Whiskers',
    species: 'cat',
    state: 'sheltered',
    arrivalStory: 'Found in a box',
    hunger: 50,
    tiredness: 30,
    happiness: 80,
    health: 100,
    bondLevel: 20,
    roomId: 'room-cat',
    ...overrides,
  };
}

describe('calculateBondIncrease', () => {
  it('returns positive increase for valid actions', () => {
    const animal = makeAnimal();
    expect(calculateBondIncrease(animal, 'feed')).toBeGreaterThan(0);
    expect(calculateBondIncrease(animal, 'walk')).toBeGreaterThan(0);
    expect(calculateBondIncrease(animal, 'train')).toBeGreaterThan(0);
  });

  it('caps increase so bond never exceeds 100', () => {
    const animal = makeAnimal({ bondLevel: 98 });
    const increase = calculateBondIncrease(animal, 'heal');
    expect(animal.bondLevel + increase).toBeLessThanOrEqual(100);
  });

  it('happiness multiplier affects result', () => {
    const happy = makeAnimal({ happiness: 100 });
    const sad = makeAnimal({ happiness: 0 });
    expect(calculateBondIncrease(happy, 'walk')).toBeGreaterThan(
      calculateBondIncrease(sad, 'walk')
    );
  });
});

describe('isBondComplete', () => {
  it('returns true at bond level 100', () => {
    expect(isBondComplete(makeAnimal({ bondLevel: 100 }))).toBe(true);
  });

  it('returns false below 100', () => {
    expect(isBondComplete(makeAnimal({ bondLevel: 99 }))).toBe(false);
  });
});
