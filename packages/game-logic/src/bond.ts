import type { Animal } from '@arc/shared-types';

/**
 * Calculate how much bond increases from a care action.
 * Base amounts vary by action; happiness multiplies the effect.
 */
export function calculateBondIncrease(
  animal: Animal,
  action: 'feed' | 'walk' | 'train' | 'play' | 'heal'
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
  const increase = Math.round(base * happinessMultiplier);

  return Math.min(increase, 100 - animal.bondLevel);
}

/**
 * Check if an animal has reached full bond (ready to become a pet).
 */
export function isBondComplete(animal: Animal): boolean {
  return animal.bondLevel >= 100;
}
