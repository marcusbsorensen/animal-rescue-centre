import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The real day, on load.
 *
 * `advanceCalendar` stamped `lastRealDayChecked` with today and the next
 * line then asked `isDailyReset` whether the real day had changed since
 * that stamp. It had not, by construction: the question was always "is
 * today not today". The depot's daily sessions were never refilled, and
 * the calendar's own unit tests passed throughout because they built their
 * "now" from the stamp they were checking.
 *
 * These drive `loadGameState` the way a launch does, one real day at a
 * time, so the answer depends on what the load actually does with the day.
 * The same moment feeds the play-day record that `daily_week` and
 * `daily_month` read, so they are here too.
 *
 * Same stubs as `save-version.test.ts`, for the same reasons.
 */

vi.mock('phaser', () => ({ default: {} }));

vi.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() }, from: vi.fn() },
  isSupabaseConfigured: () => true,
}));

vi.mock('../../ui/ErrorOverlay', () => ({
  showToast: vi.fn(),
  showBlocking: vi.fn(),
}));

const { supabase } = await import('../../lib/supabase');
const { loadGameState, saveGameState, resetSaveTracking } = await import('../loadSaveState');
const { GameStateStore } = await import('../GameStateStore');
const { clearLocalSave } = await import('../localSave');
const { createCalendarState, consecutiveDays, totalDaysPlayed } = await import('@arc/game-logic');

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;
const scene = {} as Parameters<typeof saveGameState>[0];
const USER = 'child-real-day';

/** A moment on a given local day. Local, because the calendar's day is. */
function at(month: number, day: number, hour = 9): Date {
  return new Date(2026, month - 1, day, hour, 0, 0);
}

const EMPTY_INVENTORY = {
  parts: {}, tools: {}, treats: {}, superTreats: {}, decorations: {}, medicalSupplies: {},
};

/** A depot that has been played out for the day. */
function spentDepot() {
  return {
    sessionsRemainingToday: 0,
    sessionsMaxToday: 3,
    lastSessionDay: '2026-10-11',
    totalSessionsPlayed: 12,
    inventory: EMPTY_INVENTORY,
  };
}

/** What the server holds after a launch on a given day. */
function savedOn(lastRealDayChecked: string, extra: Record<string, unknown> = {}) {
  return {
    data: {
      save: {
        state: {
          calendar: {
            ...createCalendarState('2026-10-01T09:00:00.000Z'),
            lastRealDayChecked,
          },
          depot: spentDepot(),
          ...extra,
        },
        level: 3,
        version: 4,
      },
    },
    error: null,
  };
}

describe('the real day on load', () => {
  beforeEach(async () => {
    // Only the clock: fake-indexeddb leans on timers the test needs real.
    vi.useFakeTimers({ toFake: ['Date'] });
    localStorage.setItem('arc_session', JSON.stringify({
      userId: USER,
      username: 'BrambleFox',
      avatarEmoji: '🦊',
      avatarBgColour: '#fff',
      joinCode: 'FOX-428',
      token: 'a'.repeat(64),
    }));
    await clearLocalSave(USER);
    resetSaveTracking();
    invoke.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the depot\'s daily sessions', () => {
    it('are refilled on the first launch of a new real day', async () => {
      vi.setSystemTime(at(10, 12));
      invoke.mockResolvedValueOnce(savedOn('2026-10-11'));

      const store = new GameStateStore();
      await loadGameState(scene, store);

      expect(store.depot.sessionsRemainingToday).toBe(3);
      expect(store.depot.sessionsMaxToday).toBe(3);
      // Only the day's allowance moves; the lifetime count is not today's.
      expect(store.depot.totalSessionsPlayed).toBe(12);
    });

    it('are refilled after a gap of many days, not only the next one', async () => {
      vi.setSystemTime(at(11, 2));
      invoke.mockResolvedValueOnce(savedOn('2026-10-11'));

      const store = new GameStateStore();
      await loadGameState(scene, store);

      expect(store.depot.sessionsRemainingToday).toBe(3);
    });

    it('are left alone by a second launch on the same real day', async () => {
      vi.setSystemTime(at(10, 12));
      invoke.mockResolvedValueOnce(savedOn('2026-10-12'));

      const store = new GameStateStore();
      await loadGameState(scene, store);

      expect(store.depot.sessionsRemainingToday).toBe(0);
    });

    it('are refilled once for the day, not once per launch', async () => {
      // The whole shape of the bug in one test: launch, play out the
      // depot, launch again the same afternoon, and again the next morning.
      vi.setSystemTime(at(10, 12, 9));
      invoke.mockResolvedValueOnce(savedOn('2026-10-11'));
      const first = new GameStateStore();
      await loadGameState(scene, first);
      expect(first.depot.sessionsRemainingToday).toBe(3);
      expect(first.calendar.lastRealDayChecked).toBe('2026-10-12');

      // Played out, then the app is closed and reopened that evening on
      // the state the first launch saved.
      first.depot.sessionsRemainingToday = 0;
      invoke.mockResolvedValueOnce({ data: { saved: true, version: 5 }, error: null });
      await saveGameState(scene, first);
      const saved = invoke.mock.calls[invoke.mock.calls.length - 1][1].body.state as Record<string, unknown>;

      vi.setSystemTime(at(10, 12, 20));
      invoke.mockResolvedValueOnce({ data: { save: { state: saved, level: 3, version: 5 } }, error: null });
      const evening = new GameStateStore();
      await loadGameState(scene, evening);
      expect(evening.depot.sessionsRemainingToday).toBe(0);

      vi.setSystemTime(at(10, 13, 8));
      invoke.mockResolvedValueOnce({ data: { save: { state: saved, level: 3, version: 5 } }, error: null });
      const morning = new GameStateStore();
      await loadGameState(scene, morning);
      expect(morning.depot.sessionsRemainingToday).toBe(3);
    });
  });

  describe('the days a child has played', () => {
    it('start counting on a save that predates them, from the launch that finds none', async () => {
      vi.setSystemTime(at(10, 12));
      invoke.mockResolvedValueOnce(savedOn('2026-10-12'));

      const store = new GameStateStore();
      await loadGameState(scene, store);

      // Nothing was recorded before, and nothing is made up: today is one.
      expect(store.playedDays).toEqual(['2026-10-12']);
      expect(totalDaysPlayed(store.playedDays)).toBe(1);
      expect(consecutiveDays(store.playedDays)).toBe(1);
    });

    it('count a launch once, however many times the app opens that day', async () => {
      vi.setSystemTime(at(10, 12));
      invoke.mockResolvedValueOnce(savedOn('2026-10-12', { playedDays: ['2026-10-11', '2026-10-12'] }));

      const store = new GameStateStore();
      await loadGameState(scene, store);

      expect(store.playedDays).toEqual(['2026-10-11', '2026-10-12']);
    });

    it('build a streak across seven launches on seven days', async () => {
      let state: Record<string, unknown> | null = null;
      let store = new GameStateStore();

      for (let day = 12; day <= 18; day++) {
        vi.setSystemTime(at(10, day));
        invoke.mockResolvedValueOnce(
          state
            ? { data: { save: { state, level: 3, version: day }, }, error: null }
            : savedOn('2026-10-11'),
        );
        store = new GameStateStore();
        await loadGameState(scene, store);

        invoke.mockResolvedValueOnce({ data: { saved: true, version: day + 1 }, error: null });
        await saveGameState(scene, store);
        state = invoke.mock.calls[invoke.mock.calls.length - 1][1].body.state as Record<string, unknown>;
      }

      expect(consecutiveDays(store.playedDays)).toBe(7);
      expect(totalDaysPlayed(store.playedDays)).toBe(7);
    });

    it('break the streak on a skipped day but keep the total', async () => {
      vi.setSystemTime(at(10, 14));
      invoke.mockResolvedValueOnce(savedOn('2026-10-12', { playedDays: ['2026-10-10', '2026-10-11', '2026-10-12'] }));

      const store = new GameStateStore();
      await loadGameState(scene, store);

      expect(totalDaysPlayed(store.playedDays)).toBe(4);
      expect(consecutiveDays(store.playedDays)).toBe(1);
    });
  });
});
