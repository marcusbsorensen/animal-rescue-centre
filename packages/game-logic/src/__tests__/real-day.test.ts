import { describe, it, expect } from 'vitest';
import type { DepotState } from '@arc/shared-types';
import {
  startRealDay,
  recordPlayDay,
  mergePlayedDays,
  normalisePlayedDays,
  totalDaysPlayed,
  consecutiveDays,
} from '../real-day';
import { advanceCalendar, createCalendarState, isDailyReset } from '../calendar';
import type { CalendarState } from '../calendar';

/** A moment on a given local day. Local, because the calendar's day is. */
function at(month: number, day: number, hour = 9): Date {
  return new Date(2026, month - 1, day, hour, 0, 0);
}

function calendarLastHere(lastRealDayChecked: string): CalendarState {
  return { ...createCalendarState('2026-10-01T09:00:00.000Z'), lastRealDayChecked };
}

function depot(over: Partial<DepotState> = {}): DepotState {
  return {
    sessionsRemainingToday: 0,
    sessionsMaxToday: 3,
    lastSessionDay: '2026-10-11',
    totalSessionsPlayed: 12,
    inventory: { parts: {}, tools: {}, treats: {}, superTreats: {}, decorations: {}, medicalSupplies: {} },
    ...over,
  } as DepotState;
}

describe('startRealDay', () => {
  it('refills the daily sessions on the first launch of a new real day', () => {
    const out = startRealDay({ calendar: calendarLastHere('2026-10-11'), depot: depot() }, at(10, 12));
    expect(out.newRealDay).toBe(true);
    expect(out.depot.sessionsRemainingToday).toBe(3);
    expect(out.depot.totalSessionsPlayed).toBe(12);
  });

  it('records the day it refilled on, so the next launch that day does not', () => {
    const first = startRealDay({ calendar: calendarLastHere('2026-10-11'), depot: depot() }, at(10, 12, 9));
    expect(first.calendar.lastRealDayChecked).toBe('2026-10-12');

    const played = { ...first.depot, sessionsRemainingToday: 1 };
    const second = startRealDay({ calendar: first.calendar, depot: played }, at(10, 12, 21));
    expect(second.newRealDay).toBe(false);
    expect(second.depot.sessionsRemainingToday).toBe(1);
  });

  it('works on a calendar that advanceCalendar has just brought up to date', () => {
    // The regression: advanceCalendar ran first and stamped today, so the
    // question that followed could never be yes.
    const now = at(10, 12);
    const stale = calendarLastHere('2026-10-11');
    const advanced = advanceCalendar(stale, stale.gameStartedAt, now.toISOString());
    expect(isDailyReset(advanced, now)).toBe(true);
    expect(startRealDay({ calendar: advanced, depot: depot() }, now).depot.sessionsRemainingToday).toBe(3);
  });

  it('keeps an allowance that has been earned up, rather than dropping it to three', () => {
    const out = startRealDay(
      { calendar: calendarLastHere('2026-10-11'), depot: depot({ sessionsMaxToday: 6 }) },
      at(10, 12),
    );
    expect(out.depot.sessionsRemainingToday).toBe(6);
    expect(out.depot.sessionsMaxToday).toBe(6);
  });

  it('records today in the days played, new day or not', () => {
    const newDay = startRealDay({ calendar: calendarLastHere('2026-10-11'), depot: depot() }, at(10, 12));
    expect(newDay.playedDays).toEqual(['2026-10-12']);

    // A calendar already stamped today, from a build that did not keep the list.
    const sameDay = startRealDay({ calendar: calendarLastHere('2026-10-12'), depot: depot() }, at(10, 12));
    expect(sameDay.newRealDay).toBe(false);
    expect(sameDay.playedDays).toEqual(['2026-10-12']);
  });

  it('adds to the days already played without repeating any', () => {
    const out = startRealDay(
      { calendar: calendarLastHere('2026-10-12'), depot: depot(), playedDays: ['2026-10-11', '2026-10-12'] },
      at(10, 12, 20),
    );
    expect(out.playedDays).toEqual(['2026-10-11', '2026-10-12']);
  });
});

describe('consecutiveDays and totalDaysPlayed', () => {
  it('are zero for a save that has recorded nothing', () => {
    expect(consecutiveDays(undefined)).toBe(0);
    expect(totalDaysPlayed(undefined)).toBe(0);
    expect(consecutiveDays([])).toBe(0);
  });

  it('read a run of seven days as seven', () => {
    let days: string[] = [];
    for (let d = 5; d <= 11; d++) days = recordPlayDay(days, `2026-10-${String(d).padStart(2, '0')}`);
    expect(consecutiveDays(days)).toBe(7);
    expect(totalDaysPlayed(days)).toBe(7);
  });

  it('count the run ending at the latest day, not the longest', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-09', '2026-10-10'];
    expect(consecutiveDays(days)).toBe(2);
    expect(totalDaysPlayed(days)).toBe(6);
  });

  it('see a run across a month and a year boundary', () => {
    expect(consecutiveDays(['2026-12-30', '2026-12-31', '2027-01-01'])).toBe(3);
    expect(consecutiveDays(['2026-02-27', '2026-02-28', '2026-03-01'])).toBe(3);
  });

  it('treat the clocks changing as no gap at all', () => {
    // 2026-03-29 is 23 hours long in the UK; the keys are dates, not instants.
    expect(consecutiveDays(['2026-03-28', '2026-03-29', '2026-03-30'])).toBe(3);
    expect(consecutiveDays(['2026-10-24', '2026-10-25', '2026-10-26'])).toBe(3);
  });

  it('do not count a day that has not happened yet', () => {
    // A clock once set forward: the future day is kept, not counted.
    const days = ['2026-10-10', '2026-10-11', '2026-10-12', '2030-01-01'];
    expect(totalDaysPlayed(days, '2026-10-12')).toBe(3);
    expect(consecutiveDays(days, '2026-10-12')).toBe(3);
  });

  it('ignore anything in the list that is not a real day', () => {
    const junk = ['2026-10-11', 'yesterday', '2026-02-30', '', 42, null, '2026-10-12'];
    expect(normalisePlayedDays(junk)).toEqual(['2026-10-11', '2026-10-12']);
    expect(normalisePlayedDays('2026-10-11')).toEqual([]);
  });
});

describe('mergePlayedDays', () => {
  it('is every day either device played, once each', () => {
    const iPad = ['2026-10-08', '2026-10-09', '2026-10-12'];
    const phone = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'];
    expect(mergePlayedDays(iPad, phone)).toEqual([
      '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12',
    ]);
  });

  it('does not count a day twice because both devices opened the game on it', () => {
    expect(totalDaysPlayed(mergePlayedDays(['2026-10-12'], ['2026-10-12']))).toBe(1);
  });

  it('tolerates a side that has no list', () => {
    expect(mergePlayedDays(undefined, ['2026-10-12'])).toEqual(['2026-10-12']);
    expect(mergePlayedDays(['2026-10-12'], undefined)).toEqual(['2026-10-12']);
  });
});
