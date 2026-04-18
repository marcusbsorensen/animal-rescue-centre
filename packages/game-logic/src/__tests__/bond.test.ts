import { describe, it, expect } from 'vitest';
import { calculateBondIncrease, isBondComplete, isSiblingPresent, SIBLING_BOND_BONUS } from '../bond';
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

// ── Edge cases an 8-year-old might trigger ──

describe('bond edge cases', () => {
  it('calculateBondIncrease when bond is already 100', () => {
    const animal = makeAnimal({ bondLevel: 100, happiness: 80 });
    const increase = calculateBondIncrease(animal, 'feed');
    expect(increase).toBe(0);
    expect(animal.bondLevel + increase).toBe(100);
  });

  it('calculateBondIncrease when bond is already 100 for all actions', () => {
    const animal = makeAnimal({ bondLevel: 100, happiness: 100 });
    const actions = ['feed', 'walk', 'train', 'play', 'heal'] as const;
    for (const action of actions) {
      const increase = calculateBondIncrease(animal, action);
      expect(increase).toBe(0);
    }
  });

  it('isBondComplete at exactly 100 vs 99', () => {
    expect(isBondComplete(makeAnimal({ bondLevel: 100 }))).toBe(true);
    expect(isBondComplete(makeAnimal({ bondLevel: 99 }))).toBe(false);
  });

  it('isBondComplete at above 100 (should still be true)', () => {
    // In case bond somehow exceeds 100 through a bug elsewhere
    expect(isBondComplete(makeAnimal({ bondLevel: 150 }))).toBe(true);
  });

  it('calculateBondIncrease at bond=99 does not exceed 100', () => {
    const animal = makeAnimal({ bondLevel: 99, happiness: 100 });
    const increase = calculateBondIncrease(animal, 'heal'); // base=8, max multiplier=1.0
    expect(animal.bondLevel + increase).toBeLessThanOrEqual(100);
  });

  it('calculateBondIncrease with happiness=0 still gives some bond', () => {
    const animal = makeAnimal({ bondLevel: 0, happiness: 0 });
    const increase = calculateBondIncrease(animal, 'heal'); // base=8, multiplier=0.5 -> 4
    expect(increase).toBeGreaterThan(0);
    expect(increase).toBe(4); // Math.round(8 * 0.5)
  });

  it('calculateBondIncrease with happiness=0 and bond=0 for feed', () => {
    const animal = makeAnimal({ bondLevel: 0, happiness: 0 });
    const increase = calculateBondIncrease(animal, 'feed'); // base=3, multiplier=0.5 -> round(1.5)=2
    expect(increase).toBe(2);
  });

  it('bond progression from 0 to 100 via repeated heal actions', () => {
    let animal = makeAnimal({ bondLevel: 0, happiness: 80 });
    let totalIncrease = 0;
    for (let i = 0; i < 100; i++) {
      const increase = calculateBondIncrease(animal, 'heal');
      totalIncrease += increase;
      animal = { ...animal, bondLevel: Math.min(100, animal.bondLevel + increase) };
      if (animal.bondLevel >= 100) break;
    }
    expect(animal.bondLevel).toBe(100);
    expect(isBondComplete(animal)).toBe(true);
  });
});

// ── Sibling bond bonus ──

describe('sibling bond bonus', () => {
  it('calculateBondIncrease applies 25% bonus when sibling is present', () => {
    const animal = makeAnimal({ bondLevel: 0, happiness: 80 });
    const without = calculateBondIncrease(animal, 'walk', false);
    const withSibling = calculateBondIncrease(animal, 'walk', true);
    expect(withSibling).toBeGreaterThan(without);
    // The unrounded relationship is exactly SIBLING_BOND_BONUS — after
    // rounding it can shift by 1 in either direction, so we assert on
    // the unrounded ratio via close-to-expected.
    expect(withSibling).toBeGreaterThanOrEqual(Math.floor(without * SIBLING_BOND_BONUS));
  });

  it('SIBLING_BOND_BONUS is 1.25', () => {
    expect(SIBLING_BOND_BONUS).toBe(1.25);
  });

  it('sibling bonus still caps bond at 100', () => {
    const animal = makeAnimal({ bondLevel: 98, happiness: 100 });
    const increase = calculateBondIncrease(animal, 'heal', true);
    expect(animal.bondLevel + increase).toBeLessThanOrEqual(100);
  });

  it('defaults siblingPresent to false when param omitted', () => {
    const animal = makeAnimal({ bondLevel: 0, happiness: 80 });
    expect(calculateBondIncrease(animal, 'walk'))
      .toBe(calculateBondIncrease(animal, 'walk', false));
  });
});

describe('isSiblingPresent', () => {
  it('returns false when animal has no sibling', () => {
    const animal = makeAnimal();
    expect(isSiblingPresent(animal, [animal])).toBe(false);
  });

  it('returns true when sibling is sheltered', () => {
    const a = makeAnimal({ id: 'a', siblingId: 'b' });
    const b = makeAnimal({ id: 'b', state: 'sheltered' });
    expect(isSiblingPresent(a, [a, b])).toBe(true);
  });

  it('returns false when sibling is still arriving', () => {
    const a = makeAnimal({ id: 'a', siblingId: 'b' });
    const b = makeAnimal({ id: 'b', state: 'arriving' });
    expect(isSiblingPresent(a, [a, b])).toBe(false);
  });

  it('returns false when sibling is not in the animals list', () => {
    const a = makeAnimal({ id: 'a', siblingId: 'missing' });
    expect(isSiblingPresent(a, [a])).toBe(false);
  });

  it('returns true for both members of a sheltered pair', () => {
    const a = makeAnimal({ id: 'a', siblingId: 'b' });
    const b = makeAnimal({ id: 'b', siblingId: 'a' });
    expect(isSiblingPresent(a, [a, b])).toBe(true);
    expect(isSiblingPresent(b, [a, b])).toBe(true);
  });
});
