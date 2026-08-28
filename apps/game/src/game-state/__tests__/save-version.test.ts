import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Phaser is only ever used here as the type of the scene we pass through
// for error UI. Loading the real thing into jsdom costs a WebGL probe and
// buys nothing.
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
const { showToast, showBlocking } = await import('../../ui/ErrorOverlay');
const { loadGameState, saveGameState, resetSaveTracking } = await import('../loadSaveState');
const { GameStateStore } = await import('../GameStateStore');
const { getLocalSave, getRejectedSave, clearLocalSave, putLocalSave } = await import('../localSave');

/**
 * Versioned saves.
 *
 * `game_states` was written with a blind upsert, so a family with two iPads
 * had one device silently erasing the other. The version is what makes that
 * collision visible; these pin the client half — that it claims the version
 * it loaded, that a rejected save keeps the copy it was rejected in favour
 * of, and that nothing gets posted to the cloud before it is on the device.
 */

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;
const scene = {} as Parameters<typeof saveGameState>[0];

const USER = 'child-1';

/** A 409 in the shape supabase-js reports it: status and body on `.context`. */
function staleRejection(serverState: Record<string, unknown>, level: number, version: number) {
  return {
    data: null,
    error: {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(
        JSON.stringify({
          error: 'Your game was saved somewhere else since this device last loaded it',
          conflict: true,
          save: { state: serverState, level, version, updatedAt: '2026-08-27T10:00:00Z' },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    },
  };
}

/** The body of the nth call to the Edge Function. */
function bodyOf(call: number): Record<string, unknown> {
  return invoke.mock.calls[call][1].body;
}

describe('versioned saves', () => {
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
    (showToast as ReturnType<typeof vi.fn>).mockReset();
    (showBlocking as ReturnType<typeof vi.fn>).mockReset();
  });

  it('claims the version it loaded when it next saves', async () => {
    invoke.mockResolvedValueOnce({
      data: { save: { state: { totalRescued: 2 }, level: 3, version: 7 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(store.level).toBe(3);
    expect(store.totalRescued).toBe(2);

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 8 }, error: null });
    await saveGameState(scene, store);

    expect(bodyOf(1).expectedVersion).toBe(7);
  });

  it('claims no version at all for a player with no server row', async () => {
    invoke.mockResolvedValueOnce({ data: { save: null }, error: null });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 0 }, error: null });
    await saveGameState(scene, store);

    // null, not 0 — the difference between "insert this" and "replace the
    // row I believe is at version 0", which on a returning player's account
    // is the difference between a save and a wipe.
    expect(bodyOf(1).expectedVersion).toBeNull();
  });

  it('moves on to the version the server hands back', async () => {
    invoke.mockResolvedValueOnce({ data: { save: null }, error: null });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 1 }, error: null });
    await saveGameState(scene, store);

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 2 }, error: null });
    await saveGameState(scene, store);

    expect(bodyOf(2).expectedVersion).toBe(1);
  });

  it('writes to the device before the request, so a failed save still exists', async () => {
    invoke.mockResolvedValueOnce({ data: { save: null }, error: null });
    const store = new GameStateStore();
    await loadGameState(scene, store);
    store.totalRescued = 12;

    invoke.mockRejectedValueOnce(new Error('network down'));
    await saveGameState(scene, store);

    const local = await getLocalSave(USER);
    expect(local?.state.totalRescued).toBe(12);
    expect(local?.synced).toBe(false);
    expect(showToast).toHaveBeenCalled();
  });

  it('marks the device copy synced once the server has it', async () => {
    invoke.mockResolvedValueOnce({ data: { save: null }, error: null });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 1 }, error: null });
    await saveGameState(scene, store);

    const local = await getLocalSave(USER);
    expect(local?.synced).toBe(true);
    expect(local?.version).toBe(1);
  });

  it('keeps the copy it was rejected in favour of, and re-sends once', async () => {
    invoke.mockResolvedValueOnce({
      data: { save: { state: { totalRescued: 2 }, level: 3, version: 7 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    invoke.mockResolvedValueOnce(staleRejection({ totalRescued: 40 }, 6, 9));
    invoke.mockResolvedValueOnce({ data: { saved: true, version: 10 }, error: null });
    await saveGameState(scene, store);

    // The other device's shelter is the thing that used to vanish.
    const rejected = await getRejectedSave(USER);
    expect(rejected?.state.totalRescued).toBe(40);
    expect(rejected?.level).toBe(6);

    // And the retry claims the version the server actually reported.
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(bodyOf(2).expectedVersion).toBe(9);
  });

  it('gives up after one retry rather than looping', async () => {
    invoke.mockResolvedValueOnce({
      data: { save: { state: {}, level: 1, version: 7 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    // Two distinct rejections: a Response body can only be read once, and
    // reusing one instance would make the retry fail for the wrong reason.
    invoke.mockResolvedValueOnce(staleRejection({ totalRescued: 40 }, 6, 9));
    invoke.mockResolvedValueOnce(staleRejection({ totalRescued: 41 }, 6, 11));
    await saveGameState(scene, store);

    // load + save + one retry. A third device writing in the gap must not
    // turn a save into an unbounded round of collisions.
    expect(invoke).toHaveBeenCalledTimes(3);
    // Still not lost: the snapshot is on the device, and the newer server
    // copy replaced the one kept a moment earlier.
    expect((await getRejectedSave(USER))?.state.totalRescued).toBe(41);
    expect((await getLocalSave(USER))?.synced).toBe(false);
  });

  it('opens the device copy when the cloud is unreachable', async () => {
    await putLocalSave({
      userId: USER,
      state: { totalRescued: 21 },
      level: 5,
      version: 4,
      synced: true,
      savedAt: 1_700_000_000_000,
    });

    invoke.mockRejectedValueOnce(new Error('network down'));
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(store.level).toBe(5);
    expect(store.totalRescued).toBe(21);
    expect(showBlocking).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalled();

    // And the save that follows still claims a version, so it is checked
    // rather than assumed safe.
    invoke.mockResolvedValueOnce({ data: { saved: true, version: 5 }, error: null });
    await saveGameState(scene, store);
    expect(bodyOf(1).expectedVersion).toBe(4);
  });

  it('blocks only when there is nothing on the device either', async () => {
    invoke.mockRejectedValueOnce(new Error('network down'));
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(showBlocking).toHaveBeenCalled();
  });

  it('leaves an unsynced device copy alone when the cloud load succeeds', async () => {
    await putLocalSave({
      userId: USER,
      state: { totalRescued: 99 },
      level: 9,
      version: 4,
      synced: false,
      savedAt: 1_700_000_000_000,
    });

    invoke.mockResolvedValueOnce({
      data: { save: { state: { totalRescued: 2 }, level: 3, version: 7 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    // Overwriting it would throw away whatever was played offline — which
    // of the two wins is the resolution question, and is not settled here.
    const local = await getLocalSave(USER);
    expect(local?.level).toBe(9);
    expect(local?.synced).toBe(false);
  });

  it('does nothing at all when signed out', async () => {
    localStorage.removeItem('arc_session');
    const store = new GameStateStore();
    await loadGameState(scene, store);
    await saveGameState(scene, store);

    expect(invoke).not.toHaveBeenCalled();
    // The store is still playable — calendar and depot are seeded.
    expect(store.calendar).toBeTruthy();
    expect(store.depot).toBeTruthy();
  });
});
