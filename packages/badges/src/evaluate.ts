import type { RescueStats } from '@arc/shared-types';
import { BADGE_DEFINITIONS, type BadgeExtras } from './definitions';

/**
 * Given current stats and a list of already-earned badge codes,
 * returns any newly earned badge codes.
 */
export function evaluateBadges(
  stats: RescueStats,
  extras: BadgeExtras,
  alreadyEarned: string[]
): string[] {
  const earned = new Set(alreadyEarned);
  const newBadges: string[] = [];

  for (const badge of BADGE_DEFINITIONS) {
    if (earned.has(badge.code)) continue;
    if (badge.criterion({ ...stats, extras })) {
      newBadges.push(badge.code);
    }
  }

  return newBadges;
}
