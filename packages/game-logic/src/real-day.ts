import type { DepotState } from '@arc/shared-types';
import { isDailyReset, markRealDayChecked, realDayKey } from './calendar';
import type { CalendarState } from './calendar';
import { resetDailySessions } from './depot-inventory';

// ── The real day ───────────────────────────────────────────────
//
// Two things in the game are about the real day rather than the in-game one:
// the depot's daily sessions, and the days a child has played (the `daily_week`
// and `daily_month` badges). Both start from the same question, "is this the
// first time the game has been opened today?", so they are answered in one
// place, from one spelling of the day (`realDayKey`), and cannot disagree
// about where a day begins.
//
// The days played are kept as a set of day keys, not as a pair of counters.
// A counter pair cannot be merged: two devices that both open the game on the
// same Tuesday each add one, and a three-way merge of counters then counts
// Tuesday twice. A set unions, and the total and the run are both read off it.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The depot's daily allowance for a player who has never earned more. */
const BASE_DEPOT_SESSIONS = 3;

/**
 * Whole-day number of a day key. Arithmetic is on UTC midnights of the
 * numbers in the key, so a clock change, or a time zone, cannot make two
 * neighbouring days 23 or 25 hours apart.
 */
function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** True for a real calendar day written YYYY-MM-DD ("2026-02-30" is not one). */
function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_KEY.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value;
}

/**
 * Tidy a list of day keys read from a save: only real days, each once,
 * earliest first. A save from an older build has no list at all, and a
 * damaged one may have junk in it; neither is an error.
 */
export function normalisePlayedDays(days: unknown): string[] {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.filter(isDayKey))].sort();
}

/** The list with `today` in it. Recording a day already there changes nothing. */
export function recordPlayDay(days: unknown, today: string): string[] {
  return normalisePlayedDays([...normalisePlayedDays(days), today]);
}

/** Two devices' lists, merged: every day either of them played. */
export function mergePlayedDays(mine: unknown, theirs: unknown): string[] {
  return normalisePlayedDays([...normalisePlayedDays(mine), ...normalisePlayedDays(theirs)]);
}

/**
 * Days played, any pattern. `today` is a ceiling: a day later than it has
 * not happened, so a clock that was once set forward cannot add a day the
 * child has not played.
 */
export function totalDaysPlayed(days: unknown, today?: string): number {
  const list = normalisePlayedDays(days);
  return today === undefined ? list.length : list.filter((d) => d <= today).length;
}

/**
 * Days played in a row, ending at the most recent day played (and no later
 * than `today`, for the reason above). A run that ended yesterday and has not
 * been added to yet still reads as that run; the launch that records today
 * either extends it or starts a new one of one.
 */
export function consecutiveDays(days: unknown, today?: string): number {
  const list = normalisePlayedDays(days).filter((d) => today === undefined || d <= today);
  if (list.length === 0) return 0;
  let run = 1;
  for (let i = list.length - 1; i > 0; i--) {
    if (dayNumber(list[i]) - dayNumber(list[i - 1]) !== 1) break;
    run++;
  }
  return run;
}

export interface RealDayState {
  calendar: CalendarState;
  depot: DepotState;
  /** Days played so far; absent on a save from before they were recorded. */
  playedDays?: readonly string[];
}

export interface RealDayResult {
  calendar: CalendarState;
  depot: DepotState;
  playedDays: string[];
  /** True when this is the first launch seen on `now`'s real day. */
  newRealDay: boolean;
}

/**
 * What opening the game does to the state that follows the real day.
 *
 * The order is the point. `isDailyReset` is asked first, against the day the
 * calendar last recorded, and only then is the day stamped. Done the other
 * way round (the calendar used to stamp it in `advanceCalendar`), the
 * question is always "is today not today" and the answer is always no.
 *
 * - A new real day refills the depot's daily sessions and records the day.
 * - The day is recorded in the played-days list whether or not it is new, and
 *   once: a save from before this list existed has a calendar that is already
 *   up to date and still gets today in it, rather than waiting for tomorrow.
 *
 * Pure: the caller supplies `now`, and keeps whatever this returns.
 */
export function startRealDay(state: RealDayState, now: Date): RealDayResult {
  const newRealDay = isDailyReset(state.calendar, now);
  return {
    newRealDay,
    calendar: newRealDay ? markRealDayChecked(state.calendar, now) : state.calendar,
    // Refilled to what this player is allowed, not to the default: an
    // allowance that has been earned up (to ten) must survive the night.
    depot: newRealDay
      ? resetDailySessions(state.depot, Math.max(BASE_DEPOT_SESSIONS, state.depot.sessionsMaxToday ?? 0))
      : state.depot,
    playedDays: recordPlayDay(state.playedDays, realDayKey(now)),
  };
}
