import type { Animal } from '@arc/shared-types';

/**
 * +25% bond gain when the animal's sibling is also in the shelter.
 * Rewards the player for keeping a sibling pair together rather than
 * sending one away at max capacity. Matches the design intent of the
 * "Together Again" badge.
 */
export const SIBLING_BOND_BONUS = 1.25;

/**
 * Calculate how much bond increases from a care action.
 * Base amounts vary by action; happiness multiplies the effect.
 *
 * @param animal The animal being cared for.
 * @param action The care action performed.
 * @param siblingPresent True if this animal's sibling is also in the
 *   shelter and not in the arrival queue (i.e. both siblings are
 *   co-located and settled). Applies a 25% bond bonus. Defaults to
 *   false — callers that don't care about sibling bonuses can omit it.
 */
export function calculateBondIncrease(
  animal: Animal,
  action: 'feed' | 'walk' | 'train' | 'play' | 'heal',
  siblingPresent: boolean = false,
): number {
  const baseAmounts: Record<string, number> = {
    feed: 3,
    walk: 5,
    train: 7,
    play: 4,
    heal: 8,
  };

  const base = baseAmounts[action] ?? 0;
  const happinessMultiplier = 0.5 + (animal.happiness / 100) * 0.5; // 0.5–1.0x
  const siblingMultiplier = siblingPresent ? SIBLING_BOND_BONUS : 1;
  const increase = Math.round(base * happinessMultiplier * siblingMultiplier);

  return Math.min(increase, 100 - animal.bondLevel);
}

/**
 * Check if an animal has reached full bond (ready to become a pet).
 */
export function isBondComplete(animal: Animal): boolean {
  return animal.bondLevel >= 100;
}

/**
 * Helper: is this animal's sibling also present and settled in the
 * shelter? Used by callers to decide whether to pass `siblingPresent`
 * to calculateBondIncrease.
 */
export function isSiblingPresent(animal: Animal, allAnimals: Animal[]): boolean {
  if (!animal.siblingId) return false;
  const sibling = allAnimals.find((a) => a.id === animal.siblingId);
  return !!sibling && sibling.state !== 'arriving';
}
