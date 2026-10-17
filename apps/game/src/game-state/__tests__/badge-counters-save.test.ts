import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The badge counters, on the save.
 *
 * Eleven badges sat unreachable because the numbers they read were literals
 * in `checkBadges`, and a counter that exists only in memory is the same
 * problem on a delay: `peacekeeper` wants ten resolved squabbles, and with a
 * 90-second cooldown between squabbles and a counter that reset on every
 * load, ten in one sitting was the only way to get there. These pin the
 * three things persistence has to do - the counter reaches the snapshot,
 * comes back on load, and a save from before it existed still loads - and
 * that the exit ledgers beside them are left exactly as they were found.
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
const { recordGiftCounts } = await import('../gift-counts');

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;
const scene = {} as Parameters<typeof saveGameState>[0];
const USER = 'child-badge-counters';

const REHOMED = [
  { animalId: 'a1', animalName: 'Biscuit', species: 'cat', householdId: '05-hana', date: 1_760_000_000_000 },
  { animalId: 'a2', animalName: 'Pip', species: 'bunny', householdId: 'place:wildlife-park', date: 1_760_100_000_000 },
];
const REWILDED = [
  { animalId: 'a3', animalName: 'Bramble', species: 'hedgehog', date: 1_760_200_000_000 },
];

function bodyOf(call: number): Record<string, unknown> {
  return invoke.mock.calls[call][1].body;
}

describe('badge counters on the save', () => {
  beforeEach(async () => {
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

  it('writes every counter into the snapshot', async () => {
    const store = new GameStateStore();
    store.conflictsResolved = 4;
    store.selfHealed = 2;
    store.walksWithoutIncident = 6;
    store.playedDays = ['2026-10-11', '2026-10-12'];

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 1 }, error: null });
    await saveGameState(scene, store);

    const state = bodyOf(0).state as Record<string, unknown>;
    expect(state.conflictsResolved).toBe(4);
    expect(state.selfHealed).toBe(2);
    expect(state.walksWithoutIncident).toBe(6);
    expect(state.playedDays).toEqual(['2026-10-11', '2026-10-12']);
  });

  it('reads them back on the next load, so ten squabbles need not be in one sitting', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        save: {
          state: {
            conflictsResolved: 9,
            selfHealed: 19,
            walksWithoutIncident: 8,
            playedDays: ['2026-10-10', '2026-10-11'],
          },
          level: 5,
          version: 3,
        },
      },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(store.conflictsResolved).toBe(9);
    expect(store.selfHealed).toBe(19);
    expect(store.walksWithoutIncident).toBe(8);
    // Today is added by the launch itself; what was saved is still there.
    expect(store.playedDays).toEqual(expect.arrayContaining(['2026-10-10', '2026-10-11']));
  });

  it('round-trips: what one sitting saves the next one starts from', async () => {
    const first = new GameStateStore();
    first.conflictsResolved = 6;
    first.selfHealed = 3;
    first.walksWithoutIncident = 2;

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 1 }, error: null });
    await saveGameState(scene, first);
    const saved = bodyOf(0).state;

    resetSaveTracking();
    invoke.mockResolvedValueOnce({ data: { save: { state: saved, level: 1, version: 1 } }, error: null });
    const second = new GameStateStore();
    await loadGameState(scene, second);

    expect(second.conflictsResolved).toBe(6);
    expect(second.selfHealed).toBe(3);
    expect(second.walksWithoutIncident).toBe(2);
  });

  it('loads a save written before any of them existed', async () => {
    // No counter keys at all: every save on every device before this build.
    // An unguarded assignment would put `undefined` on the store, and
    // `undefined >= 10` is false for ever, which is the bug in a new coat.
    invoke.mockResolvedValueOnce({
      data: { save: { state: { totalRescued: 3, rehomed: REHOMED, rewilded: REWILDED }, level: 4, version: 2 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(store.conflictsResolved).toBe(0);
    expect(store.selfHealed).toBe(0);
    expect(store.walksWithoutIncident).toBe(0);
    // The launch records today, once; nothing else is made up.
    expect(store.playedDays).toHaveLength(1);
  });

  it('leaves the rehomed and rewilded ledgers exactly as they were saved', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        save: {
          state: { rehomed: REHOMED, rewilded: REWILDED, selfHealed: 2, conflictsResolved: 1 },
          level: 4,
          version: 2,
        },
      },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(store.rehomed).toEqual(REHOMED);
    expect(store.rewilded).toEqual(REWILDED);

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 3 }, error: null });
    await saveGameState(scene, store);
    const state = bodyOf(1).state as Record<string, unknown>;
    expect(state.rehomed).toEqual(REHOMED);
    expect(state.rewilded).toEqual(REWILDED);
  });

  it('ignores a counter that is not a number rather than trusting it', async () => {
    invoke.mockResolvedValueOnce({
      data: { save: { state: { selfHealed: '12', conflictsResolved: null, walksWithoutIncident: {}, playedDays: 'today' }, level: 1, version: 1 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(store.selfHealed).toBe(0);
    expect(store.conflictsResolved).toBe(0);
    expect(store.walksWithoutIncident).toBe(0);
    expect(store.playedDays).toHaveLength(1);
  });
});

describe('gift counts, which the server keeps', () => {
  beforeEach(async () => {
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

  it('are taken from the stats load-game sends beside the save', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        save: { state: {}, level: 2, version: 1 },
        stats: { giftsSentCount: 7, giftsReceivedCount: 3 },
      },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(store.giftsSentCount).toBe(7);
    expect(store.giftsReceivedCount).toBe(3);
  });

  it('are taken for a first-time player too, who has no save to send', async () => {
    invoke.mockResolvedValueOnce({
      data: { save: null, stats: { giftsSentCount: 0, giftsReceivedCount: 0 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(store.giftsSentCount).toBe(0);
    expect(store.giftsReceivedCount).toBe(0);
  });

  it('stay at zero when the server says nothing, as an older deployment does not', async () => {
    invoke.mockResolvedValueOnce({ data: { save: { state: {}, level: 2, version: 1 } }, error: null });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(store.giftsSentCount).toBe(0);
    expect(store.giftsReceivedCount).toBe(0);
  });

  it('are not written into the save, where a second copy could drift from the server', async () => {
    const store = new GameStateStore();
    store.giftsSentCount = 12;
    store.giftsReceivedCount = 5;

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 1 }, error: null });
    await saveGameState(scene, store);

    const state = bodyOf(0).state as Record<string, unknown>;
    expect(state).not.toHaveProperty('giftsSentCount');
    expect(state).not.toHaveProperty('giftsReceivedCount');
  });
});

describe('recordGiftCounts', () => {
  const fresh = () => ({ giftsSentCount: 0, giftsReceivedCount: 0 });

  it('takes the counts a reply carries', () => {
    const store = fresh();
    recordGiftCounts(store, { giftsSentCount: 5 });
    expect(store).toEqual({ giftsSentCount: 5, giftsReceivedCount: 0 });
    recordGiftCounts(store, { giftsReceivedCount: 2 });
    expect(store).toEqual({ giftsSentCount: 5, giftsReceivedCount: 2 });
  });

  it('never lowers a count: a late reply is older news', () => {
    const store = { giftsSentCount: 9, giftsReceivedCount: 4 };
    recordGiftCounts(store, { giftsSentCount: 8, giftsReceivedCount: 1 });
    expect(store).toEqual({ giftsSentCount: 9, giftsReceivedCount: 4 });
  });

  it('ignores a value that is not a count', () => {
    const store = { giftsSentCount: 3, giftsReceivedCount: 3 };
    recordGiftCounts(store, { giftsSentCount: '30', giftsReceivedCount: Number.NaN });
    recordGiftCounts(store, { giftsSentCount: -4 });
    recordGiftCounts(store, null);
    recordGiftCounts(store, undefined);
    expect(store).toEqual({ giftsSentCount: 3, giftsReceivedCount: 3 });
  });
});
