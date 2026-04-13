// ── Calendar System ────────────────────────────────────────────
// Manages in-game time, seasons, and special events.
// 1 real-world week = 1 in-game month (30 days).
// 1 real day ≈ 4.2857 in-game days (30/7).
// 12 months per year = 360 days per year = 84 real days per year.
// Seasons cycle: Spring Bloom → Summer Warmth → Autumn Hush → Winter Cosy
// Each season spans 3 months (3 real weeks).

export type Season = 'spring_bloom' | 'summer_warmth' | 'autumn_hush' | 'winter_cosy';

export interface CalendarState {
  gameStartedAt: string;        // ISO timestamp of when player started
  currentInGameDate: { year: number; month: number; day: number };
  currentSeason: Season;
  activeEvents: string[];       // event codes currently active
  dayOfYear: number;            // 1-360 (12 months × 30 days)
  lastRealDayChecked: string;   // YYYY-MM-DD — for daily reset logic
}

export interface SeasonDef {
  season: Season;
  label: string;
  emoji: string;
  months: number[];  // which in-game months (1-12) belong to this season
}

export interface CalendarEventDef {
  code: string;
  name: string;
  emoji: string;
  description: string;
  seasonAssociation: Season | null;  // null = player-specific timing
  startMonth: number;  // in-game month (1-12), 0 = dynamic
  startDay: number;    // in-game day (1-30), 0 = dynamic
  durationDays: number;
}

// ── Static Catalogues ──────────────────────────────────────────

export const SEASONS: SeasonDef[] = [
  { season: 'spring_bloom',  label: 'Spring Bloom',  emoji: '🌸', months: [1, 2, 3] },
  { season: 'summer_warmth', label: 'Summer Warmth', emoji: '☀️', months: [4, 5, 6] },
  { season: 'autumn_hush',   label: 'Autumn Hush',   emoji: '🍂', months: [7, 8, 9] },
  { season: 'winter_cosy',   label: 'Winter Cosy',   emoji: '❄️', months: [10, 11, 12] },
];

export const CALENDAR_EVENTS: CalendarEventDef[] = [
  {
    code: 'adoption_week',
    name: 'Animal Adoption Week',
    emoji: '🐾',
    description: 'A special week celebrating animal adoption — bonus visitors and adoption rates!',
    seasonAssociation: 'spring_bloom',
    startMonth: 2,
    startDay: 10,
    durationDays: 7,
  },
  {
    code: 'rescue_anniversary',
    name: 'Rescue Anniversary',
    emoji: '🎂',
    description: 'Celebrate the anniversary of your rescue centre opening!',
    seasonAssociation: null,
    startMonth: 0,   // dynamic — based on player's game start date + 1 year
    startDay: 0,
    durationDays: 7,
  },
  {
    code: 'winter_giving',
    name: 'Winter Giving',
    emoji: '🎁',
    description: 'A week of generosity — extra donations and heartwarming moments.',
    seasonAssociation: 'winter_cosy',
    startMonth: 12,
    startDay: 20,
    durationDays: 7,
  },
  {
    code: 'player_birthday',
    name: 'Player Birthday',
    emoji: '🎉',
    description: 'Happy birthday! Your animals have a surprise for you.',
    seasonAssociation: null,
    startMonth: 0,   // dynamic — based on player's birthday
    startDay: 0,
    durationDays: 7,
  },
];

// ── Constants ──────────────────────────────────────────────────

const DAYS_PER_MONTH = 30;
const MONTHS_PER_YEAR = 12;
const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR; // 360
const REAL_DAYS_PER_MONTH = 7;  // 1 real week = 1 in-game month
const IN_GAME_DAYS_PER_REAL_DAY = DAYS_PER_MONTH / REAL_DAYS_PER_MONTH; // 30/7 ≈ 4.2857
const MS_PER_REAL_DAY = 24 * 60 * 60 * 1000;

// ── Functions ──────────────────────────────────────────────────

/** Convert real elapsed time to in-game date. */
export function calculateCurrentDate(
  gameStartedAt: string,
  now?: string,
): { year: number; month: number; day: number; dayOfYear: number } {
  const startMs = new Date(gameStartedAt).getTime();
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const elapsedRealDays = Math.max(0, (nowMs - startMs) / MS_PER_REAL_DAY);

  // Total elapsed in-game days (0-indexed)
  const totalInGameDays = Math.floor(elapsedRealDays * IN_GAME_DAYS_PER_REAL_DAY);

  const year = Math.floor(totalInGameDays / DAYS_PER_YEAR) + 1;
  const dayOfYear = (totalInGameDays % DAYS_PER_YEAR) + 1; // 1-360
  const month = Math.floor((dayOfYear - 1) / DAYS_PER_MONTH) + 1; // 1-12
  const day = ((dayOfYear - 1) % DAYS_PER_MONTH) + 1; // 1-30

  return { year, month, day, dayOfYear };
}

/** Get the season for a given in-game month (1-12). */
export function getSeasonForMonth(month: number): Season {
  if (month >= 1 && month <= 3) return 'spring_bloom';
  if (month >= 4 && month <= 6) return 'summer_warmth';
  if (month >= 7 && month <= 9) return 'autumn_hush';
  return 'winter_cosy';
}

/** Get the full season definition for a season. */
export function getSeasonDef(season: Season): SeasonDef {
  const def = SEASONS.find(s => s.season === season);
  if (!def) throw new Error(`Unknown season: ${season}`);
  return def;
}

/** Check if a date falls within an event's active period. */
function isDateInEventRange(
  date: { month: number; day: number },
  eventMonth: number,
  eventDay: number,
  durationDays: number,
): boolean {
  // Convert both to absolute day-of-year for comparison
  const dateDoy = (date.month - 1) * DAYS_PER_MONTH + date.day;
  const eventStartDoy = (eventMonth - 1) * DAYS_PER_MONTH + eventDay;
  const eventEndDoy = eventStartDoy + durationDays - 1;

  // Handle year wraparound
  if (eventEndDoy > DAYS_PER_YEAR) {
    return dateDoy >= eventStartDoy || dateDoy <= (eventEndDoy - DAYS_PER_YEAR);
  }

  return dateDoy >= eventStartDoy && dateDoy <= eventEndDoy;
}

/** Get event codes active for the given in-game date. */
export function getActiveEvents(
  date: { month: number; day: number; dayOfYear: number },
  playerBirthday?: { month: number; day: number },
): string[] {
  const active: string[] = [];

  for (const evt of CALENDAR_EVENTS) {
    if (evt.code === 'player_birthday') {
      if (playerBirthday && isDateInEventRange(date, playerBirthday.month, playerBirthday.day, evt.durationDays)) {
        active.push(evt.code);
      }
      continue;
    }

    if (evt.code === 'rescue_anniversary') {
      // Anniversary always falls on month 1, day 1 (the game start date in-game)
      // but only triggers from year 2 onwards — handled by caller checking year >= 2
      if (isDateInEventRange(date, 1, 1, evt.durationDays)) {
        active.push(evt.code);
      }
      continue;
    }

    // Static events
    if (evt.startMonth > 0 && evt.startDay > 0) {
      if (isDateInEventRange(date, evt.startMonth, evt.startDay, evt.durationDays)) {
        active.push(evt.code);
      }
    }
  }

  return active;
}

/** Create initial calendar state. */
export function createCalendarState(gameStartedAt: string): CalendarState {
  const startDate = new Date(gameStartedAt);
  return {
    gameStartedAt,
    currentInGameDate: { year: 1, month: 1, day: 1 },
    currentSeason: 'spring_bloom',
    activeEvents: [],
    dayOfYear: 1,
    lastRealDayChecked: formatDateYMD(startDate),
  };
}

/** Advance calendar state to the current real-world time. */
export function advanceCalendar(
  state: CalendarState,
  gameStartedAt: string,
  now?: string,
): CalendarState {
  const date = calculateCurrentDate(gameStartedAt, now);
  const season = getSeasonForMonth(date.month);
  const activeEvents = getActiveEvents(date);
  const nowDate = now ? new Date(now) : new Date();

  return {
    ...state,
    currentInGameDate: { year: date.year, month: date.month, day: date.day },
    currentSeason: season,
    activeEvents,
    dayOfYear: date.dayOfYear,
    lastRealDayChecked: formatDateYMD(nowDate),
  };
}

// ── Additional helpers (Phase 1: Depot & Supply Run) ─────────

/** Alias: get season for a given in-game month. Same as getSeasonForMonth. */
export const getCurrentSeason = getSeasonForMonth;

/** Get season from a date-like object with a month property. */
export function getSeasonForDate(date: { month: number }): Season {
  return getSeasonForMonth(date.month);
}

/** True if the real-world day has changed since lastRealDayChecked. */
export function isDailyReset(state: CalendarState, now: Date): boolean {
  return formatDateYMD(now) !== state.lastRealDayChecked;
}

/** Season theme definitions with labels, emoji, and descriptions. */
export const SEASON_THEMES: Record<Season, { label: string; emoji: string; description: string }> = {
  spring_bloom: {
    label: 'Spring Bloom',
    emoji: '🌸',
    description: 'Flowers are blooming and new animals are arriving at the rescue centre!',
  },
  summer_warmth: {
    label: 'Summer Warmth',
    emoji: '☀️',
    description: 'Long sunny days — perfect for walks and outdoor play.',
  },
  autumn_hush: {
    label: 'Autumn Hush',
    emoji: '🍂',
    description: 'Leaves are falling and the animals are getting cosy indoors.',
  },
  winter_cosy: {
    label: 'Winter Cosy',
    emoji: '❄️',
    description: 'Wrap up warm! The animals need extra blankets and hot meals.',
  },
};

// ── Utilities ─────────────────────────────────────────────────

function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
