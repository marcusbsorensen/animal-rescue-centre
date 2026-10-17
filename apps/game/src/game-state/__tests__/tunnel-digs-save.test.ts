import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The tunnel's paid re-digs, on the save.
 *
 * Three re-digs a day pay coins. That allowance is worth nothing if a reload
 * hands it back, so it has to reach the snapshot, come back on load, and a
 * save from before it existed has to load as "no digs yet". Same stubs as
 * `badge-counters-save.test.ts`, for the same reasons.
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

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;
const scene = {} as Parameters<typeof saveGameState>[0];
const USER = 'child-tunnel-digs';

function bodyOf(call: number): Record<string, unknown> {
  return invoke.mock.calls[call][1].body;
}

describe('tunnel digs on the save', () => {
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

  it('starts empty', () => {
    expect(new GameStateStore().tunnelDigs).toBeNull();
  });

  it('writes the day and the count into the snapshot', async () => {
    const store = new GameStateStore();
    store.tunnelDigs = { day: '2026-10-14', paid: 2 };

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 1 }, error: null });
    await saveGameState(scene, store);

    const state = bodyOf(0).state as Record<string, unknown>;
    expect(state.tunnelDigs).toEqual({ day: '2026-10-14', paid: 2 });
  });

  it('round-trips: a reload does not hand the allowance back', async () => {
    const first = new GameStateStore();
    first.tunnelDigs = { day: '2026-10-14', paid: 3 };

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 1 }, error: null });
    await saveGameState(scene, first);
    const saved = bodyOf(0).state;

    resetSaveTracking();
    invoke.mockResolvedValueOnce({ data: { save: { state: saved, level: 1, version: 1 } }, error: null });
    const second = new GameStateStore();
    await loadGameState(scene, second);

    expect(second.tunnelDigs).toEqual({ day: '2026-10-14', paid: 3 });
  });

  it('loads a save written before the tunnel paid by the day as no digs yet', async () => {
    invoke.mockResolvedValueOnce({
      data: { save: { state: { totalRescued: 3 }, level: 2, version: 1 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);
    expect(store.tunnelDigs).toBeNull();
  });

  it('ignores a damaged record rather than trusting it', async () => {
    invoke.mockResolvedValueOnce({
      data: { save: { state: { tunnelDigs: { day: 'someday', paid: '3' } }, level: 2, version: 1 } },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);
    expect(store.tunnelDigs).toBeNull();
  });
});
