import { describe, it, expect } from 'vitest';
import {
  PAID_DIGS_PER_DAY,
  DIG_COINS,
  tunnelDayKey,
  tunnelDailySeed,
  normaliseTunnelDigs,
  paidDigsToday,
  paidDigsLeft,
  recordDig,
  mergeTunnelDigs,
  type TunnelDigs,
} from '../tunnel-digs';
import { mergeSaveState } from '../merge-save';

/**
 * Re-dig pay: at most three paid digs a day, the same UTC day the daily
 * tunnel seed is made from. Every dig after that plays normally and pays 0.
 */

const TODAY = '2026-10-14';
const TOMORROW = '2026-10-15';

/** Dig `n` times in a row on one day, the way the host would, and keep what each said. */
function digTimes(n: number, day = TODAY, from: unknown = null) {
  let digs: unknown = from;
  const outcomes = [];
  for (let i = 0; i < n; i++) {
    const o = recordDig(digs, day);
    digs = o.digs;
    outcomes.push(o);
  }
  return { digs: digs as TunnelDigs, outcomes };
}

describe('the day key', () => {
  it('is the UTC date, so it matches the daily seed', () => {
    const now = new Date(Date.UTC(2026, 9, 14, 23, 59, 59));
    expect(tunnelDayKey(now)).toBe('2026-10-14');
    expect(tunnelDailySeed(now)).toBe(20261014);
  });

  it('turns over at UTC midnight whatever the time zone', () => {
    expect(tunnelDayKey(new Date(Date.UTC(2026, 9, 14, 23, 59, 59, 999)))).toBe('2026-10-14');
    expect(tunnelDayKey(new Date(Date.UTC(2026, 9, 15, 0, 0, 0, 0)))).toBe('2026-10-15');
    expect(tunnelDailySeed(new Date(Date.UTC(2026, 9, 15, 0, 0, 0, 0)))).toBe(20261015);
  });

  it('zero-pads the month and day', () => {
    expect(tunnelDayKey(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05');
    expect(tunnelDailySeed(new Date(Date.UTC(2026, 0, 5)))).toBe(20260105);
  });
});

describe('paid digs', () => {
  it('pays the first three digs of a day, 10 coins each', () => {
    const { outcomes } = digTimes(3);
    expect(outcomes.map((o) => o.paid)).toEqual([true, true, true]);
    expect(outcomes.map((o) => o.coins)).toEqual([DIG_COINS, DIG_COINS, DIG_COINS]);
    expect(outcomes.map((o) => o.left)).toEqual([2, 1, 0]);
  });

  it('pays nothing from the fourth dig on, and says 0 left', () => {
    const { outcomes, digs } = digTimes(6);
    for (const o of outcomes.slice(PAID_DIGS_PER_DAY)) {
      expect(o.paid).toBe(false);
      expect(o.coins).toBe(0);
      expect(o.left).toBe(0);
    }
    // Unpaid digs do not push the count past the cap.
    expect(digs).toEqual({ day: TODAY, paid: PAID_DIGS_PER_DAY });
  });

  it('adds up to 30 coins for any number of digs in a day', () => {
    const { outcomes } = digTimes(40);
    expect(outcomes.reduce((sum, o) => sum + o.coins, 0)).toBe(PAID_DIGS_PER_DAY * DIG_COINS);
  });

  it('counts "Play again" like any other dig: both go through recordDig', () => {
    // One re-dig, one play-again, one re-dig: three paid. The fourth, a
    // play-again, is free. The host cannot tell them apart and nor can this.
    const { outcomes } = digTimes(4);
    expect(outcomes.map((o) => o.paid)).toEqual([true, true, true, false]);
  });

  it('starts again the next UTC day', () => {
    const day1 = digTimes(5, TODAY);
    expect(paidDigsLeft(day1.digs, TODAY)).toBe(0);
    expect(paidDigsLeft(day1.digs, TOMORROW)).toBe(PAID_DIGS_PER_DAY);
    const next = recordDig(day1.digs, TOMORROW);
    expect(next.paid).toBe(true);
    expect(next.digs).toEqual({ day: TOMORROW, paid: 1 });
  });

  it('does not carry yesterday\'s count into today', () => {
    expect(paidDigsToday({ day: '2026-10-13', paid: 3 }, TODAY)).toBe(0);
    expect(recordDig({ day: '2026-10-13', paid: 3 }, TODAY).paid).toBe(true);
  });

  it('treats no record, or a damaged one, as no digs yet', () => {
    for (const junk of [null, undefined, 'x', 7, [], {}, { day: 'soon', paid: 1 }, { day: '2026-02-30', paid: 1 }, { day: TODAY, paid: 'many' }, { day: TODAY, paid: NaN }]) {
      expect(normaliseTunnelDigs(junk)).toBeNull();
      expect(paidDigsLeft(junk, TODAY)).toBe(PAID_DIGS_PER_DAY);
    }
  });

  it('keeps a fractional or negative stored count sane', () => {
    expect(normaliseTunnelDigs({ day: TODAY, paid: 2.9 })).toEqual({ day: TODAY, paid: 2 });
    expect(normaliseTunnelDigs({ day: TODAY, paid: -4 })).toEqual({ day: TODAY, paid: 0 });
  });

  it('a stored count above the cap still means none left, and never goes negative', () => {
    expect(paidDigsLeft({ day: TODAY, paid: 9 }, TODAY)).toBe(0);
    expect(recordDig({ day: TODAY, paid: 9 }, TODAY).paid).toBe(false);
  });
});

describe('merging two devices', () => {
  it('takes the later day', () => {
    expect(mergeTunnelDigs({ day: TODAY, paid: 3 }, { day: TOMORROW, paid: 1 })).toEqual({ day: TOMORROW, paid: 1 });
    expect(mergeTunnelDigs({ day: TOMORROW, paid: 1 }, { day: TODAY, paid: 3 })).toEqual({ day: TOMORROW, paid: 1 });
  });

  it('takes the larger count on the same day, so a second device cannot reset it', () => {
    expect(mergeTunnelDigs({ day: TODAY, paid: 1 }, { day: TODAY, paid: 3 })).toEqual({ day: TODAY, paid: 3 });
    expect(mergeTunnelDigs({ day: TODAY, paid: 2 }, { day: TODAY, paid: 0 })).toEqual({ day: TODAY, paid: 2 });
  });

  it('keeps the one record when the other side has none', () => {
    expect(mergeTunnelDigs(null, { day: TODAY, paid: 2 })).toEqual({ day: TODAY, paid: 2 });
    expect(mergeTunnelDigs({ day: TODAY, paid: 2 }, undefined)).toEqual({ day: TODAY, paid: 2 });
    expect(mergeTunnelDigs(null, null)).toBeNull();
  });

  it('is what mergeSaveState does with the field', () => {
    const base = { economy: { coins: 0, lifetimeEarnings: 0 } };
    const mine = { ...base, tunnelDigs: { day: TODAY, paid: 1 } };
    const theirs = { ...base, tunnelDigs: { day: TODAY, paid: 3 } };
    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.tunnelDigs).toEqual({ day: TODAY, paid: 3 });
  });
});
