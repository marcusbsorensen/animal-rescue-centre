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
    hedgehogsRescued: 0,
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

  it('awards cosy_centre at the first house upgrade, not before', () => {
    const stats = makeStats();
    expect(evaluateBadges(stats, makeExtras({ houseUpgrades: 0 }), [])).not.toContain('cosy_centre');
    expect(evaluateBadges(stats, makeExtras({ houseUpgrades: 1 }), [])).toContain('cosy_centre');
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
      hedgehogsRescued: 1,
      totalRescued: 8,
    });
    const result = evaluateBadges(stats, makeExtras(), []);
    expect(result).toContain('all_species');
    expect(result).toContain('all_mammals');
  });

  it('does not award all_species until a hedgehog has been rescued', () => {
    const sevenOfEight = makeStats({
      catsRescued: 1,
      dogsRescued: 1,
      foxesRescued: 1,
      bunniesRescued: 1,
      batsRescued: 1,
      parrotsRescued: 1,
      snakesRescued: 1,
      totalRescued: 7,
    });
    const without = evaluateBadges(sevenOfEight, makeExtras(), []);
    expect(without).not.toContain('all_species');
    // The five mammals the badge names are all there; a hedgehog is not one of its five.
    expect(without).toContain('all_mammals');

    const withHog = evaluateBadges({ ...sevenOfEight, hedgehogsRescued: 1 }, makeExtras(), []);
    expect(withHog).toContain('all_species');
  });
});

/**
 * Every badge that reads a counter, at its threshold and one short of it.
 * The evaluator was never the broken half - it passed throughout, fed a
 * number directly - so these pin the thresholds and leave the wiring to
 * `apps/game/src/__tests__/badge-wiring.test.ts`, which reads the code that
 * supplies the numbers.
 */
describe('badges that read a counter', () => {
  const earns = (code: string, stats: Partial<RescueStats>, extras: Partial<BadgeExtras>) =>
    evaluateBadges(makeStats(stats), makeExtras(extras), []).includes(code);

  const cases: Array<[string, 'stats' | 'extras', string, number]> = [
    ['giver', 'stats', 'giftsSentCount', 5],
    ['generous', 'stats', 'giftsSentCount', 25],
    ['receiver', 'stats', 'giftsReceivedCount', 10],
    ['vet_apprentice', 'extras', 'selfHealed', 1],
    ['vet_pro', 'extras', 'selfHealed', 20],
    ['good_walker', 'extras', 'walksWithoutIncident', 10],
    ['peacekeeper', 'extras', 'conflictsResolved', 10],
    ['daily_week', 'extras', 'consecutiveDays', 7],
    ['daily_month', 'extras', 'totalDaysPlayed', 30],
  ];

  for (const [code, where, field, threshold] of cases) {
    it(`${code} comes at ${field} ${threshold}, and not at ${threshold - 1}`, () => {
      const at = (n: number) => earns(
        code,
        where === 'stats' ? { [field]: n } : {},
        where === 'extras' ? { [field]: n } : {},
      );
      expect(at(threshold - 1)).toBe(false);
      expect(at(threshold)).toBe(true);
    });
  }
});
