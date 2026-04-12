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
