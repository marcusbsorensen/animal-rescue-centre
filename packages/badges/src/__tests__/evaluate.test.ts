import { describe, it, expect } from 'vitest';
import { evaluateBadges } from '../evaluate';
import type { RescueStats } from '@arc/shared-types';
import type { BadgeExtras } from '../definitions';

function makeStats(overrides: Partial<RescueStats> = {}): RescueStats {
  return {
    userId: 'test-user',
    catsRescued: 0,
    dogsRescued: 0,
    bunniesRescued: 0,
    foxesRescued: 0,
    snakesRescued: 0,
    parrotsRescued: 0,
    batsRescued: 0,
    totalRescued: 0,
    badgesUnlockedCount: 0,
    giftsSentCount: 0,
    giftsReceivedCount: 0,
    ...overrides,
  };
}

function makeExtras(overrides: Partial<BadgeExtras> = {}): BadgeExtras {
  return {
    totalBonded: 0,
    siblingPairsReunited: 0,
    selfHealed: 0,
    walksWithoutIncident: 0,
    animalsTrained: 0,
    conflictsResolved: 0,
    houseUpgrades: 0,
    totalPets: 0,
    consecutiveDays: 0,
    totalDaysPlayed: 0,
    playerNumber: 100,
    level: 1,
    ...overrides,
  };
}

describe('evaluateBadges', () => {
  it('awards first_rescue on first animal', () => {
    const stats = makeStats({ totalRescued: 1, catsRescued: 1 });
    const result = evaluateBadges(stats, makeExtras(), []);
    expect(result).toContain('first_rescue');
  });

  it('does not re-award already earned badges', () => {
    const stats = makeStats({ totalRescued: 1, catsRescued: 1 });
    const result = evaluateBadges(stats, makeExtras(), ['first_rescue']);
    expect(result).not.toContain('first_rescue');
  });

  it('awards first_bond when totalBonded >= 1', () => {
    const stats = makeStats({ totalRescued: 1 });
    const result = evaluateBadges(stats, makeExtras({ totalBonded: 1 }), []);
    expect(result).toContain('first_bond');
  });

  it('awards snake_friend at 5 snakes', () => {
    const stats = makeStats({ snakesRescued: 5, totalRescued: 5 });
    const result = evaluateBadges(stats, makeExtras(), []);
    expect(result).toContain('snake_friend');
  });

  it('awards early_supporter for player number <= 50', () => {
    const stats = makeStats();
    const result = evaluateBadges(stats, makeExtras({ playerNumber: 12 }), []);
    expect(result).toContain('early_supporter');
  });

  it('does not award early_supporter for player > 50', () => {
    const stats = makeStats();
    const result = evaluateBadges(stats, makeExtras({ playerNumber: 51 }), []);
    expect(result).not.toContain('early_supporter');
  });

  it('awards all_species when all counters >= 1', () => {
    const stats = makeStats({
      catsRescued: 1,
      dogsRescued: 1,
      foxesRescued: 1,
      bunniesRescued: 1,
      batsRescued: 1,
      parrotsRescued: 1,
      snakesRescued: 1,
      totalRescued: 7,
    });
    const result = evaluateBadges(stats, makeExtras(), []);
    expect(result).toContain('all_species');
    expect(result).toContain('all_mammals');
  });
});
