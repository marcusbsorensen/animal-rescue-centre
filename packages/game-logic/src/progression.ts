import type { Species } from '@arc/shared-types';

/**
 * Species unlock schedule by level.
 * L1: cats+dogs → L2: +foxes+bunnies → L3: +bats+parrots → L4: +snakes → L5+: all
 */
export function getSpeciesUnlocksForLevel(level: number): Species[] {
  const unlocks: Species[] = ['cat', 'dog'];
  if (level >= 2) unlocks.push('fox', 'bunny');
  if (level >= 3) unlocks.push('bat', 'parrot');
  if (level >= 4) unlocks.push('snake');
  return unlocks;
}

/**
 * Level N requires 5×N total rescues to advance.
 */
export function getRequiredRescuesForLevel(level: number): number {
  return 5 * level;
}

/**
 * Maximum number of shelter animals (non-pet) allowed at the player's current level.
 * Starts small so young players aren't overwhelmed and can properly care for each animal.
 * L1: 2, L2: 4, L3: 6, L4: 8, L5: 10, L6+: 12 (hard cap)
 *
 * When `species` is 'cat' and an `apprenticeUnlocks` bag is supplied,
 * the cap grows by `extraCatSlots` — Amara's apprentice unlock bumps
 * the per-species shelter ceiling for cats only.
 */
export function getMaxShelterAnimals(
  level: number,
  species?: Species,
  apprenticeUnlocks?: { extraCatSlots?: number },
): number {
  const base = level <= 0 ? 2 : Math.min(2 * level, 12);
  if (species === 'cat' && apprenticeUnlocks?.extraCatSlots) {
    return base + apprenticeUnlocks.extraCatSlots;
  }
  return base;
}

/**
 * Maximum number of animals arriving at once (waiting in queue).
 * Keeps the welcoming area manageable.
 */
export function getMaxArrivals(level: number): number {
  if (level <= 1) return 1;
  if (level <= 3) return 2;
  return 3;
}
