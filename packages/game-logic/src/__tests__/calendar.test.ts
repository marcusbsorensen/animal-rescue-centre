import { describe, it, expect } from 'vitest';
import {
  calculateCurrentDate,
  getSeasonForMonth,
  getSeasonForDate,
  getCurrentSeason,
  getSeasonDef,
  getActiveEvents,
  createCalendarState,
  advanceCalendar,
  isDailyReset,
  SEASONS,
  SEASON_THEMES,
  CALENDAR_EVENTS,
} from '../calendar';

// Helper: add N real days to a start ISO string
function addRealDays(start: string, days: number): string {
  const ms = new Date(start).getTime() + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

const START = '2026-01-01T00:00:00.000Z';

describe('calculateCurrentDate', () => {
  it('returns year 1, month 1, day 1 at game start (0 real days)', () => {
    const d = calculateCurrentDate(START, START);
    expect(d).toEqual({ year: 1, month: 1, day: 1, dayOfYear: 1 });
  });

  it('7 real days = 30 in-game days = end of month 1', () => {
    const d = calculateCurrentDate(START, addRealDays(START, 7));
    expect(d).toEqual({ year: 1, month: 2, day: 1, dayOfYear: 31 });
  });

  it('14 real days = 60 in-game days = start of month 3', () => {
    const d = calculateCurrentDate(START, addRealDays(START, 14));
    expect(d).toEqual({ year: 1, month: 3, day: 1, dayOfYear: 61 });
  });

  it('84 real days = 360 in-game days = exactly 1 year', () => {
    const d = calculateCurrentDate(START, addRealDays(START, 84));
    // 84 real days * (30/7) = 360 in-game days exactly → year 2 day 1
    expect(d).toEqual({ year: 2, month: 1, day: 1, dayOfYear: 1 });
  });

  it('85 real days = year 2, month 1 (past year boundary)', () => {
    const d = calculateCurrentDate(START, addRealDays(START, 85));
    expect(d.year).toBe(2);
    expect(d.month).toBe(1);
    expect(d.day).toBeGreaterThan(1);
  });

  it('handles fractional days correctly (mid-day)', () => {
    // Half a real day = floor(0.5 * 30/7) = floor(2.14) = 2 in-game days elapsed → day 3
    const halfDay = new Date(new Date(START).getTime() + 12 * 60 * 60 * 1000).toISOString();
    const d = calculateCurrentDate(START, halfDay);
    expect(d.year).toBe(1);
    expect(d.month).toBe(1);
    expect(d.day).toBe(3); // 0-indexed elapsed = 2, so day = 3
  });

  it('never returns negative values for now before start', () => {
    const before = addRealDays(START, -5);
    const d = calculateCurrentDate(START, before);
    expect(d.year).toBe(1);
    expect(d.month).toBe(1);
    expect(d.day).toBe(1);
  });
});

describe('getSeasonForMonth', () => {
  it('months 1-3 = spring_bloom', () => {
    expect(getSeasonForMonth(1)).toBe('spring_bloom');
    expect(getSeasonForMonth(2)).toBe('spring_bloom');
    expect(getSeasonForMonth(3)).toBe('spring_bloom');
  });

  it('months 4-6 = summer_warmth', () => {
    expect(getSeasonForMonth(4)).toBe('summer_warmth');
    expect(getSeasonForMonth(5)).toBe('summer_warmth');
    expect(getSeasonForMonth(6)).toBe('summer_warmth');
  });

  it('months 7-9 = autumn_hush', () => {
    expect(getSeasonForMonth(7)).toBe('autumn_hush');
    expect(getSeasonForMonth(8)).toBe('autumn_hush');
    expect(getSeasonForMonth(9)).toBe('autumn_hush');
  });

  it('months 10-12 = winter_cosy', () => {
    expect(getSeasonForMonth(10)).toBe('winter_cosy');
    expect(getSeasonForMonth(11)).toBe('winter_cosy');
    expect(getSeasonForMonth(12)).toBe('winter_cosy');
  });

  it('exact season boundary: month 3 is spring, month 4 is summer', () => {
    expect(getSeasonForMonth(3)).toBe('spring_bloom');
    expect(getSeasonForMonth(4)).toBe('summer_warmth');
  });

  it('exact season boundary: month 9 is autumn, month 10 is winter', () => {
    expect(getSeasonForMonth(9)).toBe('autumn_hush');
    expect(getSeasonForMonth(10)).toBe('winter_cosy');
  });
});

describe('getSeasonDef', () => {
  it('returns correct definition for each season', () => {
    const spring = getSeasonDef('spring_bloom');
    expect(spring.label).toBe('Spring Bloom');
    expect(spring.months).toEqual([1, 2, 3]);

    const winter = getSeasonDef('winter_cosy');
    expect(winter.label).toBe('Winter Cosy');
    expect(winter.months).toEqual([10, 11, 12]);
  });
});

describe('SEASONS catalogue', () => {
  it('has exactly 4 seasons', () => {
    expect(SEASONS).toHaveLength(4);
  });

  it('covers all 12 months exactly once', () => {
    const allMonths = SEASONS.flatMap(s => s.months).sort((a, b) => a - b);
    expect(allMonths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('CALENDAR_EVENTS catalogue', () => {
  it('has exactly 4 events', () => {
    expect(CALENDAR_EVENTS).toHaveLength(4);
  });

  it('contains adoption_week, rescue_anniversary, winter_giving, player_birthday', () => {
    const codes = CALENDAR_EVENTS.map(e => e.code);
    expect(codes).toContain('adoption_week');
    expect(codes).toContain('rescue_anniversary');
    expect(codes).toContain('winter_giving');
    expect(codes).toContain('player_birthday');
  });
});

describe('getActiveEvents', () => {
  it('Adoption Week is active during month 2, days 10-16', () => {
    for (let day = 10; day <= 16; day++) {
      const doy = (2 - 1) * 30 + day; // month 2
      const events = getActiveEvents({ month: 2, day, dayOfYear: doy });
      expect(events).toContain('adoption_week');
    }
  });

  it('Adoption Week is NOT active on month 2, day 9', () => {
    const events = getActiveEvents({ month: 2, day: 9, dayOfYear: 39 });
    expect(events).not.toContain('adoption_week');
  });

  it('Adoption Week is NOT active on month 2, day 17', () => {
    const events = getActiveEvents({ month: 2, day: 17, dayOfYear: 47 });
    expect(events).not.toContain('adoption_week');
  });

  it('Adoption Week exactly on event start (day 10)', () => {
    const events = getActiveEvents({ month: 2, day: 10, dayOfYear: 40 });
    expect(events).toContain('adoption_week');
  });

  it('Adoption Week exactly on event end (day 16)', () => {
    const events = getActiveEvents({ month: 2, day: 16, dayOfYear: 46 });
    expect(events).toContain('adoption_week');
  });

  it('Winter Giving is active during month 12, days 20-26', () => {
    for (let day = 20; day <= 26; day++) {
      const doy = (12 - 1) * 30 + day;
      const events = getActiveEvents({ month: 12, day, dayOfYear: doy });
      expect(events).toContain('winter_giving');
    }
  });

  it('Winter Giving is NOT active on month 12, day 19', () => {
    const events = getActiveEvents({ month: 12, day: 19, dayOfYear: 349 });
    expect(events).not.toContain('winter_giving');
  });

  it('Player Birthday activates when birthday is set and date matches', () => {
    const birthday = { month: 5, day: 15 };
    const events = getActiveEvents({ month: 5, day: 15, dayOfYear: 135 }, birthday);
    expect(events).toContain('player_birthday');
  });

  it('Player Birthday spans 7 days from start', () => {
    const birthday = { month: 5, day: 15 };
    // Day 21 = 15 + 6 (7 days: 15,16,17,18,19,20,21)
    const events = getActiveEvents({ month: 5, day: 21, dayOfYear: 141 }, birthday);
    expect(events).toContain('player_birthday');
  });

  it('Player Birthday NOT active when no birthday set', () => {
    const events = getActiveEvents({ month: 5, day: 15, dayOfYear: 135 });
    expect(events).not.toContain('player_birthday');
  });

  it('Rescue Anniversary active on month 1, day 1', () => {
    const events = getActiveEvents({ month: 1, day: 1, dayOfYear: 1 });
    expect(events).toContain('rescue_anniversary');
  });

  it('no events active mid-year with no special dates', () => {
    const events = getActiveEvents({ month: 6, day: 15, dayOfYear: 165 });
    expect(events).toHaveLength(0);
  });
});

describe('createCalendarState', () => {
  it('initialises at year 1, month 1, day 1, spring_bloom', () => {
    const state = createCalendarState(START);
    expect(state.gameStartedAt).toBe(START);
    expect(state.currentInGameDate).toEqual({ year: 1, month: 1, day: 1 });
    expect(state.currentSeason).toBe('spring_bloom');
    expect(state.activeEvents).toEqual([]);
    expect(state.dayOfYear).toBe(1);
  });

  it('sets lastRealDayChecked to the game start date', () => {
    const state = createCalendarState(START);
    expect(state.lastRealDayChecked).toBe('2026-01-01');
  });

  it('sets lastRealDayChecked correctly for a different start date', () => {
    const state = createCalendarState('2025-06-15T14:30:00.000Z');
    expect(state.lastRealDayChecked).toBe('2025-06-15');
  });
});

describe('advanceCalendar', () => {
  it('advances state to the correct date', () => {
    const state = createCalendarState(START);
    const now = addRealDays(START, 7); // 1 month later
    const advanced = advanceCalendar(state, START, now);
    expect(advanced.currentInGameDate).toEqual({ year: 1, month: 2, day: 1 });
    expect(advanced.currentSeason).toBe('spring_bloom');
    expect(advanced.dayOfYear).toBe(31);
  });

  it('transitions to summer after 3 months (21 real days)', () => {
    const state = createCalendarState(START);
    const now = addRealDays(START, 21);
    const advanced = advanceCalendar(state, START, now);
    expect(advanced.currentInGameDate.month).toBe(4);
    expect(advanced.currentSeason).toBe('summer_warmth');
  });

  it('detects active events when advancing to event period', () => {
    const state = createCalendarState(START);
    // Month 2, day 12 → dayOfYear = 42 → realDays = 42 / (30/7) ≈ 9.8
    const now = addRealDays(START, 9.8);
    const advanced = advanceCalendar(state, START, now);
    // Should be in month 2, somewhere in adoption week range
    if (advanced.currentInGameDate.month === 2 &&
        advanced.currentInGameDate.day >= 10 &&
        advanced.currentInGameDate.day <= 16) {
      expect(advanced.activeEvents).toContain('adoption_week');
    }
  });

  it('preserves gameStartedAt from original state', () => {
    const state = createCalendarState(START);
    const advanced = advanceCalendar(state, START, addRealDays(START, 10));
    expect(advanced.gameStartedAt).toBe(START);
  });

  it('updates lastRealDayChecked when advancing', () => {
    const state = createCalendarState(START);
    const now = addRealDays(START, 5);
    const advanced = advanceCalendar(state, START, now);
    expect(advanced.lastRealDayChecked).toBe('2026-01-06');
  });
});

// ── New Phase 1 helpers ──────────────────────────────────────

describe('getCurrentSeason (alias)', () => {
  it('behaves identically to getSeasonForMonth', () => {
    for (let m = 1; m <= 12; m++) {
      expect(getCurrentSeason(m)).toBe(getSeasonForMonth(m));
    }
  });
});

describe('getSeasonForDate', () => {
  it('returns correct season from a date object with month', () => {
    expect(getSeasonForDate({ month: 1 })).toBe('spring_bloom');
    expect(getSeasonForDate({ month: 5 })).toBe('summer_warmth');
    expect(getSeasonForDate({ month: 8 })).toBe('autumn_hush');
    expect(getSeasonForDate({ month: 11 })).toBe('winter_cosy');
  });

  it('handles boundary months correctly', () => {
    expect(getSeasonForDate({ month: 3 })).toBe('spring_bloom');
    expect(getSeasonForDate({ month: 4 })).toBe('summer_warmth');
    expect(getSeasonForDate({ month: 6 })).toBe('summer_warmth');
    expect(getSeasonForDate({ month: 7 })).toBe('autumn_hush');
    expect(getSeasonForDate({ month: 9 })).toBe('autumn_hush');
    expect(getSeasonForDate({ month: 10 })).toBe('winter_cosy');
  });
});

describe('isDailyReset', () => {
  it('returns true when the real day has changed', () => {
    const state = createCalendarState(START);
    const nextDay = new Date('2026-01-02T08:00:00Z');
    expect(isDailyReset(state, nextDay)).toBe(true);
  });

  it('returns false when still on the same real day', () => {
    const state = createCalendarState(START);
    const sameDay = new Date('2026-01-01T23:59:59Z');
    expect(isDailyReset(state, sameDay)).toBe(false);
  });

  it('returns true after advanceCalendar moves to a new day', () => {
    const state = createCalendarState(START);
    const advanced = advanceCalendar(state, START, addRealDays(START, 1));
    // advanced.lastRealDayChecked is 2026-01-02
    expect(isDailyReset(advanced, new Date('2026-01-03T06:00:00Z'))).toBe(true);
    expect(isDailyReset(advanced, new Date('2026-01-02T18:00:00Z'))).toBe(false);
  });

  it('detects reset across month boundaries', () => {
    const state = createCalendarState('2026-01-31T12:00:00.000Z');
    const feb1 = new Date('2026-02-01T00:00:01Z');
    expect(isDailyReset(state, feb1)).toBe(true);
  });
});

describe('SEASON_THEMES', () => {
  it('has entries for all four seasons', () => {
    expect(Object.keys(SEASON_THEMES)).toHaveLength(4);
    expect(SEASON_THEMES.spring_bloom.label).toBe('Spring Bloom');
    expect(SEASON_THEMES.summer_warmth.label).toBe('Summer Warmth');
    expect(SEASON_THEMES.autumn_hush.label).toBe('Autumn Hush');
    expect(SEASON_THEMES.winter_cosy.label).toBe('Winter Cosy');
  });

  it('each theme has label, emoji, and description', () => {
    for (const theme of Object.values(SEASON_THEMES)) {
      expect(theme.label).toBeTruthy();
      expect(theme.emoji).toBeTruthy();
      expect(theme.description).toBeTruthy();
    }
  });

  it('themes align with SEASONS catalogue', () => {
    for (const seasonDef of SEASONS) {
      const theme = SEASON_THEMES[seasonDef.season];
      expect(theme).toBeDefined();
      expect(theme.label).toBe(seasonDef.label);
      expect(theme.emoji).toBe(seasonDef.emoji);
    }
  });
});
