/**
 * Garden tunnel — how many wins cheer the animals up in a day.
 *
 * A solved tunnel lets the animals out to play, and the host gives each one
 * a lift in happiness and bond. Left alone that is a farm: dig, solve, dig,
 * solve, until every animal is topped up. So the lift is given for at most
 * `REWARDED_WINS_PER_DAY` wins a UTC day, the same limit, and the same day,
 * as the coins the re-digs pay (see tunnel-digs.ts). Every win after that
 * still plays and still ends on the win card; the animals simply enjoyed the
 * play, and the card says so without numbers.
 *
 * The count is kept in the save as one record, `{ day, rewarded }`, beside
 * `tunnelDigs`. A record from an earlier day is simply a day with nothing
 * given.
 *
 * Pure: the host asks `recordWin`, applies the happiness and bond when it
 * says `rewarded`, and tells the tunnel page which it was.
 */

import { PAID_DIGS_PER_DAY, isTunnelDayKey } from './tunnel-digs';

/** How many wins a day raise happiness and bond. The coins' own limit, on purpose. */
export const REWARDED_WINS_PER_DAY = PAID_DIGS_PER_DAY;

/** What the save holds: the UTC day (YYYY-MM-DD) and how many wins were rewarded on it. */
export interface TunnelWins {
  day: string;
  rewarded: number;
}

export interface WinOutcome {
  /** The record to keep. */
  wins: TunnelWins;
  /** Whether this win raises happiness and bond. */
  rewarded: boolean;
  /** Rewarded wins still to come today, after this one. */
  left: number;
}

/**
 * Tidy a record read from a save. A save from before this existed has none,
 * and a damaged one may hold anything; neither is an error, both are "no
 * wins yet".
 */
export function normaliseTunnelWins(value: unknown): TunnelWins | null {
  if (!value || typeof value !== 'object') return null;
  const { day, rewarded } = value as Record<string, unknown>;
  if (!isTunnelDayKey(day)) return null;
  if (typeof rewarded !== 'number' || !Number.isFinite(rewarded)) return null;
  return { day, rewarded: Math.max(0, Math.floor(rewarded)) };
}

/** Rewarded wins already used on `today`. */
export function rewardedWinsToday(wins: unknown, today: string): number {
  const w = normaliseTunnelWins(wins);
  return w && w.day === today ? w.rewarded : 0;
}

/** Rewarded wins still available on `today`. */
export function rewardedWinsLeft(wins: unknown, today: string): number {
  return Math.max(0, REWARDED_WINS_PER_DAY - rewardedWinsToday(wins, today));
}

/**
 * One win, on `today`. Rewarded while the day's allowance lasts, plain play
 * after. A record from another day is replaced by today's rather than
 * carried on.
 */
export function recordWin(wins: unknown, today: string): WinOutcome {
  const used = rewardedWinsToday(wins, today);
  if (used >= REWARDED_WINS_PER_DAY) {
    return { wins: { day: today, rewarded: used }, rewarded: false, left: 0 };
  }
  const rewarded = used + 1;
  return {
    wins: { day: today, rewarded },
    rewarded: true,
    left: REWARDED_WINS_PER_DAY - rewarded,
  };
}

/**
 * Two devices' records, merged: the later day wins outright, and on the same
 * day the larger count does. A day's rewarded wins are a small allowance, not
 * a total to add up, so a second device cannot hand it back; the happiness
 * and bond they gave are merged by the animals' own rule.
 */
export function mergeTunnelWins(mine: unknown, theirs: unknown): TunnelWins | null {
  const a = normaliseTunnelWins(mine);
  const b = normaliseTunnelWins(theirs);
  if (!a) return b;
  if (!b) return a;
  if (a.day !== b.day) return a.day > b.day ? a : b;
  return { day: a.day, rewarded: Math.max(a.rewarded, b.rewarded) };
}
