import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

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
const { showToast } = await import('../../ui/ErrorOverlay');
const { loadGameState, saveGameState, resetSaveTracking } = await import('../loadSaveState');
const { GameStateStore } = await import('../GameStateStore');
const { getBaseSave, clearLocalSave, putLocalSave } = await import('../localSave');

/**
 * Merging two divergent shelters — save sync, phase 2.
 *
 * The merge rules themselves are pinned in game-logic. These are about the
 * two places the client discovers a divergence and what it does with the
 * result: a rejected save, and a launch that finds an unsynced copy on the
 * device against a cloud copy that has moved on. Both must end with the
 * merged shelter in the store the child is playing, and neither may say
 * anything to the child about it.
 */

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;
const scene = {} as Parameters<typeof saveGameState>[0];
const USER = 'child-1';

const animal = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `A${id}`,
  species: 'cat',
  state: 'sheltered',
  arrivalStory: '',
  hunger: 20,
  tiredness: 20,
  happiness: 80,
  health: 100,
  bondLevel: 0,
  roomId: 'room-cat',
  ...over,
});

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
          save: { state: serverState, level, version, updatedAt: '2026-08-28T10:00:00Z' },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    },
  };
}

function bodyOf(call: number): Record<string, unknown> {
  return invoke.mock.calls[call][1].body;
}

function idsOf(animals: unknown): string[] {
  return (animals as Array<{ id: string }>).map((a) => a.id).sort();
}

describe('merging divergent shelters', () => {
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
  });

  it('records an ancestor on a cloud load and again on a confirmed save', async () => {
    invoke.mockResolvedValueOnce({
      data: { save: { state: { totalRescued: 2, animals: [animal('1')] }, level: 3, version: 7 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    // The cloud copy is, by definition, what the server holds.
    expect((await getBaseSave(USER))?.version).toBe(7);
    expect((await getBaseSave(USER))?.state.totalRescued).toBe(2);

    store.totalRescued = 5;
    invoke.mockResolvedValueOnce({ data: { saved: true, version: 8 }, error: null });
    await saveGameState(scene, store);

    // And so is a save the server has just accepted.
    expect((await getBaseSave(USER))?.version).toBe(8);
    expect((await getBaseSave(USER))?.state.totalRescued).toBe(5);
  });

  it('merges the other device shelter into this one on a rejected save', async () => {
    // Ancestor: animal 1. This device rescued 2; the other rescued 3.
    invoke.mockResolvedValueOnce({
      data: { save: { state: { animals: [animal('1')], totalRescued: 1 }, level: 1, version: 7 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    store.animals = [animal('1'), animal('2')] as typeof store.animals;
    store.totalRescued = 2;

    invoke.mockResolvedValueOnce(
      staleRejection({ animals: [animal('1'), animal('3')], totalRescued: 2 }, 1, 9),
    );
    invoke.mockResolvedValueOnce({ data: { saved: true, version: 10 }, error: null });
    await saveGameState(scene, store);

    // Both children's afternoons are in the shelter the child is playing…
    expect(idsOf(store.animals)).toEqual(['1', '2', '3']);
    expect(store.totalRescued).toBe(3);
    // …and in what went back to the server.
    expect(idsOf(bodyOf(2).state && (bodyOf(2).state as Record<string, unknown>).animals))
      .toEqual(['1', '2', '3']);
    expect(bodyOf(2).expectedVersion).toBe(9);
  });

  it('does not resurrect an animal the other device adopted out', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        save: { state: { animals: [animal('1'), animal('2')], totalRescued: 2 }, level: 1, version: 7 },
      },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);
    expect(idsOf(store.animals)).toEqual(['1', '2']);

    // This device changed nothing about animal 2; the other device rehomed it.
    invoke.mockResolvedValueOnce(staleRejection({ animals: [animal('1')], totalRescued: 2 }, 1, 9));
    invoke.mockResolvedValueOnce({ data: { saved: true, version: 10 }, error: null });
    await saveGameState(scene, store);

    expect(idsOf(store.animals)).toEqual(['1']);
  });

  it('says nothing to the child about any of it', async () => {
    invoke.mockResolvedValueOnce({
      data: { save: { state: { animals: [animal('1')] }, level: 1, version: 7 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    invoke.mockResolvedValueOnce(staleRejection({ animals: [animal('1'), animal('9')] }, 1, 9));
    invoke.mockResolvedValueOnce({ data: { saved: true, version: 10 }, error: null });
    await saveGameState(scene, store);

    expect(showToast).not.toHaveBeenCalled();
  });

  it('merges an afternoon played offline with a cloud copy that moved on', async () => {
    // The load-time half of the same collision. The device holds an
    // unsynced save built on version 7; the cloud is now at 9.
    await putLocalSave({
      userId: USER,
      state: { animals: [animal('1'), animal('offline')], totalRescued: 2 },
      level: 1,
      version: 7,
      synced: false,
      savedAt: Date.now(),
    });
    // The ancestor both diverged from.
    const { putBaseSave } = await import('../localSave');
    await putBaseSave({
      userId: USER,
      state: { animals: [animal('1')], totalRescued: 1 },
      level: 1,
      version: 7,
      synced: true,
      savedAt: Date.now(),
    });

    invoke.mockResolvedValueOnce({
      data: {
        save: { state: { animals: [animal('1'), animal('other')], totalRescued: 2 }, level: 1, version: 9 },
      },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(idsOf(store.animals)).toEqual(['1', 'offline', 'other']);
    expect(store.totalRescued).toBe(3);
  });

  it('does not call the merged state the new ancestor', async () => {
    // The merged shelter is neither copy and the server has not seen it.
    // Recording it as the ancestor would tell the next merge that all of
    // it was already agreed — which is how a merge undoes itself.
    await putLocalSave({
      userId: USER,
      state: { animals: [animal('offline')] },
      level: 1,
      version: 7,
      synced: false,
      savedAt: Date.now(),
    });
    invoke.mockResolvedValueOnce({
      data: { save: { state: { animals: [animal('other')] }, level: 1, version: 9 }, },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(await getBaseSave(USER)).toBeNull();
  });

  it('takes the cloud copy plainly when the device has nothing unsynced', async () => {
    await putLocalSave({
      userId: USER,
      state: { animals: [animal('stale')] },
      level: 1,
      version: 7,
      synced: true,
      savedAt: Date.now(),
    });
    invoke.mockResolvedValueOnce({
      data: { save: { state: { animals: [animal('1')] }, level: 2, version: 9 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(idsOf(store.animals)).toEqual(['1']);
    expect((await getBaseSave(USER))?.version).toBe(9);
  });

  it('merges as a union when the device has no ancestor to measure against', async () => {
    // An older build, or IndexedDB cleared between the load and the
    // conflict. Keeping an adopted animal too long beats deleting a
    // rescued one, so nothing is dropped.
    invoke.mockResolvedValueOnce({ data: { save: null }, error: null });
    const store = new GameStateStore();
    await loadGameState(scene, store);
    store.animals = [animal('mine')] as typeof store.animals;

    invoke.mockResolvedValueOnce(staleRejection({ animals: [animal('theirs')] }, 1, 9));
    invoke.mockResolvedValueOnce({ data: { saved: true, version: 10 }, error: null });
    await saveGameState(scene, store);

    expect(idsOf(store.animals)).toEqual(['mine', 'theirs']);
  });
});
