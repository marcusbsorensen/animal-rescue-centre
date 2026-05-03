import type { Species } from '@arc/shared-types';

/**
 * Species unlock schedule by level.
 * L1: cats+dogs → L2: +foxes+bunnies → L3: +bats+parrots → L4: +snakes → L5+: all
 *
 * Kofi the apprentice (bookworm) can unlock one additional species slot
 * early — see `ApprenticeUnlocks.extraSpeciesSlots`. When that bag is
 * set to 1, the player gets an early peek at the next species in the
 * normal progression order (parrot, then snake). It's a specific
 * early-peek, not a wildcard: if parrot AND snake are already unlocked
 * by level, the extra slot has no further effect.
 */
export function getSpeciesUnlocksForLevel(
  level: number,
  extraSpeciesSlots = 0,
): Species[] {
  const unlocks: Species[] = ['cat', 'dog'];
  if (level >= 2) unlocks.push('fox', 'bunny');
  if (level >= 3) unlocks.push('bat', 'parrot');
  if (level >= 4) unlocks.push('snake');

  // Apprentice early-peek: follows the normal progression order so
  // level-driven unlocks and apprentice-driven unlocks stay consistent.
  if (extraSpeciesSlots > 0) {
    const earlyOrder: Species[] = ['parrot', 'snake'];
    for (const species of earlyOrder) {
      if (!unlocks.includes(species)) {
        unlocks.push(species);
        break;
      }
    }
  }
  return unlocks;
}

/**
 * Level N requires 5×N total rescues to advance.
 */
export function getRequiredRescuesForLevel(level: number): number {
  return 5 * level;
}

/**
 * Maximum number of shelter animals (non-pet) allowed at the player's
 * current level.
 *
 * Pacing curve (Marcus 2026-05-03 — extended past L10):
 *   L1=2, L2=4, L3=6, L4=8, L5=10        ← learning + bonding
 *   L6=12, L7=14, L8=15, L9=17, L10=18   ← busy mid-game
 *   L11=20, L12=22, L13=24, ...          ← +2 per level
 *   Hard ceiling at 30                   ← gameplay still manageable
 *
 * The garden + tile system supports more space at higher levels and
 * the kid often has 3 arrivals queued at once by L6, so the old
 * hard cap of 12 was too tight for higher-level play.
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
  let base: number;
  if (level <= 0) {
    base = 2;
  } else if (level <= 5) {
    base = 2 * level;            // L1=2, L2=4, L3=6, L4=8, L5=10
  } else if (level === 6) {
    base = 12;
  } else if (level === 7) {
    base = 14;
  } else if (level === 8) {
    base = 15;
  } else if (level === 9) {
    base = 17;
  } else if (level === 10) {
    base = 18;
  } else {
    // L11+: +2 per level above 10, capped at 30
    base = Math.min(18 + (level - 10) * 2, 30);
  }
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
