import type { Species, FoodItem } from '@arc/shared-types';

// ── Food Catalogue ─────────────────────────────────────────────
// Each food type and which species can eat it.

export interface FoodDefinition {
  type: string;
  emoji: string;
  label: string;
  forSpecies: Species[];
}

export const FOOD_CATALOGUE: FoodDefinition[] = [
  // Cat foods
  { type: 'tuna',     emoji: '🐟', label: 'Tuna',       forSpecies: ['cat'] },
  { type: 'fish',     emoji: '🐠', label: 'Fish',       forSpecies: ['cat', 'bat'] },

  // Dog foods
  { type: 'bone',     emoji: '🦴', label: 'Bone',       forSpecies: ['dog'] },
  { type: 'kibble',   emoji: '🥫', label: 'Kibble',     forSpecies: ['dog', 'cat'] },

  // Shared meat
  { type: 'chicken',  emoji: '🍗', label: 'Chicken',    forSpecies: ['cat', 'dog', 'fox'] },

  // Fox foods
  { type: 'berries',  emoji: '🫐', label: 'Berries',    forSpecies: ['fox', 'parrot'] },
  { type: 'mouse',    emoji: '🐭', label: 'Mouse',      forSpecies: ['fox', 'snake'] },

  // Bunny foods
  { type: 'carrot',   emoji: '🥕', label: 'Carrot',     forSpecies: ['bunny'] },
  { type: 'lettuce',  emoji: '🥬', label: 'Lettuce',    forSpecies: ['bunny'] },
  { type: 'hay',      emoji: '🌾', label: 'Hay',        forSpecies: ['bunny'] },

  // Bat foods
  { type: 'fruit',    emoji: '🍎', label: 'Fruit',      forSpecies: ['bat', 'parrot'] },
  { type: 'insects',  emoji: '🦗', label: 'Insects',    forSpecies: ['bat'] },

  // Parrot foods
  { type: 'seeds',    emoji: '🌻', label: 'Seeds',      forSpecies: ['parrot'] },
  { type: 'nuts',     emoji: '🥜', label: 'Nuts',       forSpecies: ['parrot'] },

  // Snake foods
  { type: 'egg',      emoji: '🥚', label: 'Egg',        forSpecies: ['snake'] },
];

/**
 * Check whether a food item is appropriate for a given species.
 */
export function validateFoodForSpecies(food: FoodItem, species: Species): boolean {
  return food.forSpecies.includes(species);
}

/**
 * Check whether a food type string is valid for a species, using the catalogue.
 */
export function isFoodValidForSpecies(foodType: string, species: Species): boolean {
  const def = FOOD_CATALOGUE.find((f) => f.type === foodType);
  if (!def) return false;
  return def.forSpecies.includes(species);
}

/**
 * Get all foods that a given species can eat.
 */
export function getFoodsForSpecies(species: Species): FoodDefinition[] {
  return FOOD_CATALOGUE.filter((f) => f.forSpecies.includes(species));
}

/**
 * Pick a random selection of food items for a kitchen round.
 * Ensures at least one correct food per hungry animal present.
 * Returns a shuffled array of food definitions.
 */
export function generateKitchenRound(hungrySpecies: Species[], extraCount = 3): FoodDefinition[] {
  const items: FoodDefinition[] = [];
  const usedTypes = new Set<string>();

  // One guaranteed correct food per hungry species (no duplicates)
  for (const species of hungrySpecies) {
    const valid = getFoodsForSpecies(species).filter((f) => !usedTypes.has(f.type));
    if (valid.length > 0) {
      const pick = valid[Math.floor(Math.random() * valid.length)];
      items.push(pick);
      usedTypes.add(pick.type);
    }
  }

  // Add some extra distractors (any food from catalogue not already used)
  const available = FOOD_CATALOGUE.filter((f) => !usedTypes.has(f.type));
  for (let i = 0; i < Math.min(extraCount, available.length); i++) {
    const idx = Math.floor(Math.random() * available.length);
    const pick = available.splice(idx, 1)[0];
    items.push(pick);
    usedTypes.add(pick.type);
  }

  // Shuffle (Fisher-Yates)
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items;
}
