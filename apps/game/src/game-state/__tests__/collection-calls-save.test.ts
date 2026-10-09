import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Collection calls, on the save.
 *
 * A call is the only thing a collection drive leaves behind between the
 * phone ringing and the van coming home, so if it is not persisted the
 * feature loses its whole middle: a child who closes the lid after the
 * toast comes back to a map with nothing on it. `doFeed` is the standing
 * example of state changed and never saved, and these are the three
 * things that stop this becoming the second one — it reaches the
 * snapshot, it comes back on load, and a save written before the feature
 * existed still loads.
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
const { admitCollection } = await import('@arc/game-logic');
const { spawnAnimal } = await import('@arc/game-logic');

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;
const scene = {} as Parameters<typeof saveGameState>[0];
const USER = 'child-collection';

const CALL = {
  id: 'call-goose-end-farm-abc',
  destinationId: 'goose-end-farm',
  species: 'dog' as const,
  variant: 'collie',
  calledAt: 1_760_000_000_000,
};

/** The body of the nth call to the Edge Function. */
function bodyOf(call: number): Record<string, unknown> {
  return invoke.mock.calls[call][1].body;
}

describe('collection calls on the save', () => {
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

  it('writes a pending call into the snapshot', async () => {
    const store = new GameStateStore();
    store.collectionCalls = [CALL];

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 1 }, error: null });
    await saveGameState(scene, store);

    const state = bodyOf(0).state as Record<string, unknown>;
    expect(state.collectionCalls).toEqual([CALL]);
  });

  it('reads a pending call back on the next load', async () => {
    invoke.mockResolvedValueOnce({
      data: { save: { state: { collectionCalls: [CALL] }, level: 4, version: 2 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(store.collectionCalls).toEqual([CALL]);
  });

  it('loads a save written before collection drives existed', async () => {
    // No `collectionCalls` key at all — every save on every device
    // before today. An unguarded assignment would put `undefined` on
    // the store and the map would throw drawing its pins.
    invoke.mockResolvedValueOnce({
      data: { save: { state: { totalRescued: 3 }, level: 4, version: 2 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(store.collectionCalls).toEqual([]);
  });

  it('persists the collected animal and the answered call together', async () => {
    // The round trip the feature actually performs: the van is home,
    // `admitCollection` puts her in the shelter and hangs up the call,
    // and the next save carries both halves. One save, both changes —
    // an animal saved without the call being cleared would have the
    // place ringing about somebody who is already in the hallway.
    const store = new GameStateStore();
    store.level = 4;
    store.collectionCalls = [CALL];

    const collected = spawnAnimal('dog', { variant: 'collie' });
    const after = admitCollection(
      { animals: store.animals, collectionCalls: store.collectionCalls },
      collected,
      'goose-end-farm',
    );
    store.animals = after.animals;
    store.collectionCalls = after.collectionCalls;

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 1 }, error: null });
    await saveGameState(scene, store);

    const state = bodyOf(0).state as Record<string, unknown>;
    expect(state.collectionCalls).toEqual([]);
    expect((state.animals as Array<{ id: string }>).map((a) => a.id))
      .toContain(collected.id);
  });
});
