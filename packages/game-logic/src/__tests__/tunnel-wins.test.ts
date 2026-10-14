import { describe, it, expect } from 'vitest';
import {
  REWARDED_WINS_PER_DAY,
  normaliseTunnelWins,
  rewardedWinsToday,
  rewardedWinsLeft,
  recordWin,
  mergeTunnelWins,
  type TunnelWins,
} from '../tunnel-wins';
import { PAID_DIGS_PER_DAY, tunnelDayKey } from '../tunnel-digs';
import { mergeSaveState } from '../merge-save';

/**
 * Win pay: at most three wins a day raise happiness and bond, on the same
 * UTC day (and with the same limit) as the paid re-digs. Every win after
 * that still plays and pays nothing to the animals.
 */

const TODAY = '2026-10-14';
const TOMORROW = '2026-10-15';

/** Win `n` times in a row on one day, the way the host would, and keep what each said. */
function winTimes(n: number, day = TODAY, from: unknown = null) {
  let wins: unknown = from;
  const outcomes = [];
  for (let i = 0; i < n; i++) {
    const o = recordWin(wins, day);
    wins = o.wins;
    outcomes.push(o);
  }
  return { wins: wins as TunnelWins, outcomes };
}

describe('the limit', () => {
  it('is the coins\' limit: three a day', () => {
    expect(REWARDED_WINS_PER_DAY).toBe(3);
    expect(REWARDED_WINS_PER_DAY).toBe(PAID_DIGS_PER_DAY);
  });

  it('counts against the day the paid digs and the daily seed use', () => {
    const now = new Date(Date.UTC(2026, 9, 14, 23, 59, 59));
    expect(tunnelDayKey(now)).toBe(TODAY);
    expect(recordWin(null, tunnelDayKey(now)).wins.day).toBe(TODAY);
  });
});

describe('rewarded wins', () => {
  it('rewards the first three wins of a day', () => {
    const { outcomes } = winTimes(3);
    expect(outcomes.map((o) => o.rewarded)).toEqual([true, true, true]);
    expect(outcomes.map((o) => o.left)).toEqual([2, 1, 0]);
  });

  it('rewards nothing from the fourth win on, and says 0 left', () => {
    const { outcomes, wins } = winTimes(7);
    for (const o of outcomes.slice(REWARDED_WINS_PER_DAY)) {
      expect(o.rewarded).toBe(false);
      expect(o.left).toBe(0);
    }
    // Wins after the cap do not push the count past it.
    expect(wins).toEqual({ day: TODAY, rewarded: REWARDED_WINS_PER_DAY });
  });

  it('adds up to three rewards for any number of wins in a day', () => {
    const { outcomes } = winTimes(50);
    expect(outcomes.filter((o) => o.rewarded)).toHaveLength(REWARDED_WINS_PER_DAY);
  });

  it('starts again the next UTC day', () => {
    const day1 = winTimes(5, TODAY);
    expect(rewardedWinsLeft(day1.wins, TODAY)).toBe(0);
    expect(rewardedWinsLeft(day1.wins, TOMORROW)).toBe(REWARDED_WINS_PER_DAY);
    const next = recordWin(day1.wins, TOMORROW);
    expect(next.rewarded).toBe(true);
    expect(next.wins).toEqual({ day: TOMORROW, rewarded: 1 });
  });

  it('does not carry yesterday\'s count into today', () => {
    expect(rewardedWinsToday({ day: '2026-10-13', rewarded: 3 }, TODAY)).toBe(0);
    expect(recordWin({ day: '2026-10-13', rewarded: 3 }, TODAY).rewarded).toBe(true);
  });

  it('replaces an old day\'s record rather than carrying it on', () => {
    expect(recordWin({ day: '2026-10-13', rewarded: 3 }, TODAY).wins).toEqual({ day: TODAY, rewarded: 1 });
  });

  it('treats no record, or a damaged one, as no wins yet', () => {
    for (const junk of [null, undefined, 'x', 7, [], {}, { day: 'soon', rewarded: 1 }, { day: '2026-02-30', rewarded: 1 }, { day: TODAY, rewarded: 'many' }, { day: TODAY, rewarded: NaN }, { day: TODAY, paid: 3 }]) {
      expect(normaliseTunnelWins(junk)).toBeNull();
      expect(rewardedWinsLeft(junk, TODAY)).toBe(REWARDED_WINS_PER_DAY);
      expect(recordWin(junk, TODAY).rewarded).toBe(true);
    }
  });

  it('keeps a fractional or negative stored count sane', () => {
    expect(normaliseTunnelWins({ day: TODAY, rewarded: 2.9 })).toEqual({ day: TODAY, rewarded: 2 });
    expect(normaliseTunnelWins({ day: TODAY, rewarded: -4 })).toEqual({ day: TODAY, rewarded: 0 });
  });

  it('a stored count above the cap still means none left, and never goes negative', () => {
    expect(rewardedWinsLeft({ day: TODAY, rewarded: 9 }, TODAY)).toBe(0);
    const o = recordWin({ day: TODAY, rewarded: 9 }, TODAY);
    expect(o.rewarded).toBe(false);
    expect(o.left).toBe(0);
  });

  it('is its own count: digs paid today do not use up the wins', () => {
    // A record of three paid digs is not a record of wins.
    expect(recordWin({ day: TODAY, paid: 3 }, TODAY).rewarded).toBe(true);
  });
});

describe('merging two devices', () => {
  it('takes the later day', () => {
    expect(mergeTunnelWins({ day: TODAY, rewarded: 3 }, { day: TOMORROW, rewarded: 1 })).toEqual({ day: TOMORROW, rewarded: 1 });
    expect(mergeTunnelWins({ day: TOMORROW, rewarded: 1 }, { day: TODAY, rewarded: 3 })).toEqual({ day: TOMORROW, rewarded: 1 });
  });

  it('takes the larger count on the same day, so a second device cannot reset it', () => {
    expect(mergeTunnelWins({ day: TODAY, rewarded: 1 }, { day: TODAY, rewarded: 3 })).toEqual({ day: TODAY, rewarded: 3 });
    expect(mergeTunnelWins({ day: TODAY, rewarded: 2 }, { day: TODAY, rewarded: 0 })).toEqual({ day: TODAY, rewarded: 2 });
  });

  it('keeps the one record when the other side has none', () => {
    expect(mergeTunnelWins(null, { day: TODAY, rewarded: 2 })).toEqual({ day: TODAY, rewarded: 2 });
    expect(mergeTunnelWins({ day: TODAY, rewarded: 2 }, undefined)).toEqual({ day: TODAY, rewarded: 2 });
    expect(mergeTunnelWins(null, null)).toBeNull();
  });

  it('is what mergeSaveState does with the field', () => {
    const base = { economy: { coins: 0, lifetimeEarnings: 0 } };
    const mine = { ...base, tunnelWins: { day: TODAY, rewarded: 1 } };
    const theirs = { ...base, tunnelWins: { day: TODAY, rewarded: 3 } };
    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.tunnelWins).toEqual({ day: TODAY, rewarded: 3 });
  });

  it('merges beside tunnelDigs without one touching the other', () => {
    const base = {};
    const mine = { tunnelDigs: { day: TODAY, paid: 3 }, tunnelWins: { day: TODAY, rewarded: 0 } };
    const theirs = { tunnelDigs: { day: TODAY, paid: 1 }, tunnelWins: { day: TODAY, rewarded: 2 } };
    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.tunnelDigs).toEqual({ day: TODAY, paid: 3 });
    expect(state.tunnelWins).toEqual({ day: TODAY, rewarded: 2 });
  });
});
