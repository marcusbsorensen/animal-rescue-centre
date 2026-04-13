import { describe, it, expect } from 'vitest';
import {
  validateFoodForSpecies,
  isFoodValidForSpecies,
  getFoodsForSpecies,
  generateKitchenRound,
  FOOD_CATALOGUE,
} from '../food';
import type { FoodItem } from '@arc/shared-types';

describe('FOOD_CATALOGUE', () => {
  it('has at least one food per species', () => {
    const species = ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake'] as const;
    for (const s of species) {
      const foods = FOOD_CATALOGUE.filter((f) => f.forSpecies.includes(s));
      expect(foods.length).toBeGreaterThan(0);
    }
  });

  it('every food has a non-empty emoji and label', () => {
    for (const food of FOOD_CATALOGUE) {
      expect(food.emoji.length).toBeGreaterThan(0);
      expect(food.label.length).toBeGreaterThan(0);
      expect(food.type.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate food types', () => {
    const types = FOOD_CATALOGUE.map((f) => f.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('validateFoodForSpecies', () => {
  it('returns true when food is valid for species', () => {
    const food: FoodItem = { type: 'tuna', forSpecies: ['cat'], quantity: 1 };
    expect(validateFoodForSpecies(food, 'cat')).toBe(true);
  });

  it('returns false when food is wrong for species', () => {
    const food: FoodItem = { type: 'tuna', forSpecies: ['cat'], quantity: 1 };
    expect(validateFoodForSpecies(food, 'dog')).toBe(false);
  });
});

describe('isFoodValidForSpecies', () => {
  it('returns true for correct pairings', () => {
    expect(isFoodValidForSpecies('tuna', 'cat')).toBe(true);
    expect(isFoodValidForSpecies('bone', 'dog')).toBe(true);
    expect(isFoodValidForSpecies('carrot', 'bunny')).toBe(true);
    expect(isFoodValidForSpecies('egg', 'snake')).toBe(true);
    expect(isFoodValidForSpecies('seeds', 'parrot')).toBe(true);
    expect(isFoodValidForSpecies('insects', 'bat')).toBe(true);
  });

  it('returns false for incorrect pairings', () => {
    expect(isFoodValidForSpecies('bone', 'cat')).toBe(false);
    expect(isFoodValidForSpecies('carrot', 'dog')).toBe(false);
    expect(isFoodValidForSpecies('tuna', 'snake')).toBe(false);
  });

  it('returns false for unknown food types', () => {
    expect(isFoodValidForSpecies('pizza', 'cat')).toBe(false);
  });

  it('handles shared foods correctly', () => {
    // Chicken is valid for cat, dog, and fox
    expect(isFoodValidForSpecies('chicken', 'cat')).toBe(true);
    expect(isFoodValidForSpecies('chicken', 'dog')).toBe(true);
    expect(isFoodValidForSpecies('chicken', 'fox')).toBe(true);
    expect(isFoodValidForSpecies('chicken', 'bunny')).toBe(false);
  });
});

describe('getFoodsForSpecies', () => {
  it('returns multiple foods for cats', () => {
    const catFoods = getFoodsForSpecies('cat');
    expect(catFoods.length).toBeGreaterThanOrEqual(3);
    expect(catFoods.some((f) => f.type === 'tuna')).toBe(true);
    expect(catFoods.some((f) => f.type === 'chicken')).toBe(true);
  });

  it('returns correct foods for bunnies', () => {
    const bunnyFoods = getFoodsForSpecies('bunny');
    expect(bunnyFoods.some((f) => f.type === 'carrot')).toBe(true);
    expect(bunnyFoods.some((f) => f.type === 'lettuce')).toBe(true);
    expect(bunnyFoods.some((f) => f.type === 'hay')).toBe(true);
    // Bunnies should NOT have meat
    expect(bunnyFoods.some((f) => f.type === 'chicken')).toBe(false);
  });
});

describe('generateKitchenRound', () => {
  it('includes at least one valid food per species', () => {
    const species = ['cat', 'dog'] as const;
    const round = generateKitchenRound([...species]);
    for (const s of species) {
      const hasValid = round.some((f) => f.forSpecies.includes(s));
      expect(hasValid).toBe(true);
    }
  });

  it('returns more items than species count (includes distractors)', () => {
    const round = generateKitchenRound(['cat'], 3);
    expect(round.length).toBeGreaterThan(1);
  });

  it('returns items with no duplicate types', () => {
    const round = generateKitchenRound(['cat', 'dog', 'bunny'], 4);
    const types = round.map((f) => f.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('handles empty species list', () => {
    const round = generateKitchenRound([], 3);
    expect(round.length).toBe(3);
  });

  // ── Edge cases an 8-year-old might trigger ──

  it('handles empty hungrySpecies with zero extraCount', () => {
    const round = generateKitchenRound([], 0);
    expect(round).toHaveLength(0);
  });

  it('handles all species being the same (e.g. 5 cats)', () => {
    const round = generateKitchenRound(['cat', 'cat', 'cat', 'cat', 'cat'], 2);
    // Should still have at least one valid cat food
    const hasCatFood = round.some((f) => f.forSpecies.includes('cat'));
    expect(hasCatFood).toBe(true);
    // No duplicate food types even though species repeated
    const types = round.map((f) => f.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('handles a species with only 1 food option (snake has egg + mouse)', () => {
    // Snake actually has 2, but let's test with a single-species call
    // to verify it doesn't break when valid foods are limited
    const round = generateKitchenRound(['snake'], 0);
    expect(round.length).toBe(1);
    const snakeFoods = getFoodsForSpecies('snake');
    expect(snakeFoods.map((f) => f.type)).toContain(round[0].type);
  });

  it('handles every species hungry at once', () => {
    const allSpecies = ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake'] as const;
    const round = generateKitchenRound([...allSpecies], 0);
    // Each species should have at least one valid food
    for (const s of allSpecies) {
      expect(round.some((f) => f.forSpecies.includes(s))).toBe(true);
    }
    // No duplicates
    const types = round.map((f) => f.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('handles extraCount larger than remaining catalogue', () => {
    // Ask for 100 extras — should not crash, just return what is available
    const round = generateKitchenRound(['cat'], 100);
    expect(round.length).toBeLessThanOrEqual(FOOD_CATALOGUE.length);
    const types = round.map((f) => f.type);
    expect(new Set(types).size).toBe(types.length);
  });
});
