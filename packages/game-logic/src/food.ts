import type { Species, FoodItem } from '@arc/shared-types';

/**
 * Check whether a food item is appropriate for a given species.
 */
export function validateFoodForSpecies(food: FoodItem, species: Species): boolean {
  return food.forSpecies.includes(species);
}
