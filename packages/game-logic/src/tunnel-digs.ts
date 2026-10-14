/**
 * Garden tunnel — the pay for re-digging.
 *
 * "Re-dig tunnels" pays the centre 10 coins (design doc decision #2: a small
 * reward for the centre, never the animals). Left alone, that is a coin
 * machine: press, press, press. So it pays at most `PAID_DIGS_PER_DAY` times
 * a day, and every dig after that still plays normally and simply pays
 * nothing. "Play again" after a win is the same dig and counts the same.
 *
 * The count is kept in the save as one record, `{ day, paid }`, and the day
 * is the UTC date the daily tunnel seed is made from, so the board and the
 * allowance turn over at the same moment. A record from an earlier day is
 * simply a day with nothing paid.
 *
 * Pure: the host asks `recordDig`, applies the coins it names, and tells the
 * tunnel page what happened so the page can say so in plain words.
 */

/** How many re-digs a day pay coins. */
export const PAID_DIGS_PER_DAY = 3;

/** Coins a paid re-dig earns. */
export const DIG_COINS = 10;

/** What the save holds: the UTC day (YYYY-MM-DD) and how many digs paid on it. */
export interface TunnelDigs {
  day: string;
  paid: number;
}

export interface DigOutcome {
  /** The record to keep. */
  digs: TunnelDigs;
  /** Whether this dig earned coins. */
  paid: boolean;
  /** Coins to add: `DIG_COINS` when paid, 0 when not. */
  coins: number;
  /** Paid digs still to come today, after this one. */
  left: number;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The UTC day the tunnel's daily seed and allowance both belong to. */
export function tunnelDayKey(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The daily seed: the same UTC date as a number (2026-10-14 is 20261014), so
 * the board stays put through the day and changes at the same moment the
 * allowance does.
 */
export function tunnelDailySeed(now: Date): number {
  return (now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate()) >>> 0;
}

/** True for a real calendar day written YYYY-MM-DD ("2026-02-30" is not one). */
function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_KEY.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value;
}

/**
 * Tidy a record read from a save. A save from before this existed has none,
 * and a damaged one may hold anything; neither is an error, both are "no
 * digs yet".
 */
export function normaliseTunnelDigs(value: unknown): TunnelDigs | null {
  if (!value || typeof value !== 'object') return null;
  const { day, paid } = value as Record<string, unknown>;
  if (!isDayKey(day)) return null;
  if (typeof paid !== 'number' || !Number.isFinite(paid)) return null;
  return { day, paid: Math.max(0, Math.floor(paid)) };
}

/** Paid digs already used on `today`. */
export function paidDigsToday(digs: unknown, today: string): number {
  const d = normaliseTunnelDigs(digs);
  return d && d.day === today ? d.paid : 0;
}

/** Paid digs still available on `today`. */
export function paidDigsLeft(digs: unknown, today: string): number {
  return Math.max(0, PAID_DIGS_PER_DAY - paidDigsToday(digs, today));
}

/**
 * One dig, on `today`. Paid while the day's allowance lasts, free after.
 * A record from another day is replaced by today's rather than carried on.
 */
export function recordDig(digs: unknown, today: string): DigOutcome {
  const used = paidDigsToday(digs, today);
  if (used >= PAID_DIGS_PER_DAY) {
    return { digs: { day: today, paid: used }, paid: false, coins: 0, left: 0 };
  }
  const paid = used + 1;
  return {
    digs: { day: today, paid },
    paid: true,
    coins: DIG_COINS,
    left: PAID_DIGS_PER_DAY - paid,
  };
}

/**
 * Two devices' records, merged: the later day wins outright, and on the same
 * day the larger count does. Coins are merged separately and additively, so
 * this never creates or removes any; it only decides how many of today's
 * paid digs are already gone.
 */
export function mergeTunnelDigs(mine: unknown, theirs: unknown): TunnelDigs | null {
  const a = normaliseTunnelDigs(mine);
  const b = normaliseTunnelDigs(theirs);
  if (!a) return b;
  if (!b) return a;
  if (a.day !== b.day) return a.day > b.day ? a : b;
  return { day: a.day, paid: Math.max(a.paid, b.paid) };
}
