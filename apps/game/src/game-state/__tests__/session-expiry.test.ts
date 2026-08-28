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
const { showToast, showBlocking } = await import('../../ui/ErrorOverlay');
const { loadGameState, saveGameState, resetSaveTracking } = await import('../loadSaveState');
const { GameStateStore } = await import('../GameStateStore');
const { clearLocalSave, putLocalSave } = await import('../localSave');
const { getSession } = await import('../../lib/auth');

/**
 * A session the server no longer recognises.
 *
 * Sessions became a stored, verified thing in the August audit, so every
 * token minted by the login that shipped before it has no `sessions` row
 * behind it. Those clients get a 401 on every request — which used to land
 * in the same branch as a flaky connection, so the child was told their
 * wifi was down and invited to retry something no retry could fix.
 */

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;
const scene = {} as Parameters<typeof saveGameState>[0];
const USER = 'child-1';

function unauthorised() {
  return {
    data: null,
    error: {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    },
  };
}

function signIn() {
  localStorage.setItem('arc_session', JSON.stringify({
    userId: USER,
    username: 'BrambleFox',
    avatarEmoji: '🦊',
    avatarBgColour: '#fff',
    joinCode: 'FOX-428',
    token: 'a'.repeat(64),
  }));
}

/** The labels showBlocking was called with, if any. */
function blockingLabels(): Record<string, string> | undefined {
  return (showBlocking as ReturnType<typeof vi.fn>).mock.calls[0]?.[3];
}

describe('a session the server does not recognise', () => {
  beforeEach(async () => {
    signIn();
    await clearLocalSave(USER);
    resetSaveTracking();
    invoke.mockReset();
    (showToast as ReturnType<typeof vi.fn>).mockReset();
    (showBlocking as ReturnType<typeof vi.fn>).mockReset();
  });

  it('asks the child to sign in again when the load is refused', async () => {
    invoke.mockResolvedValueOnce(unauthorised());
    await loadGameState(scene, new GameStateStore());

    expect(showBlocking).toHaveBeenCalled();
    expect(blockingLabels()?.action).toBe('Sign in');
    // Not the offline toast: nothing here is about the connection.
    expect(showToast).not.toHaveBeenCalled();
    expect(getSession()).toBeNull();
  });

  it('does not offer the device copy instead, which would never sync again', async () => {
    await putLocalSave({
      userId: USER,
      state: { totalRescued: 9 },
      level: 2,
      version: 4,
      synced: true,
      savedAt: Date.now(),
    });

    invoke.mockResolvedValueOnce(unauthorised());
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(showBlocking).toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('asks once when a save is refused, rather than every interaction', async () => {
    invoke.mockResolvedValueOnce({ data: { save: null }, error: null });
    const store = new GameStateStore();
    await loadGameState(scene, store);

    invoke.mockResolvedValueOnce(unauthorised());
    await saveGameState(scene, store);

    expect(showBlocking).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();

    // The session is gone, so a further save is a no-op rather than a
    // second modal — saves fire on almost every tap.
    await saveGameState(scene, store);
    expect(showBlocking).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('still plays from the device when it is only the connection', async () => {
    await putLocalSave({
      userId: USER,
      state: { totalRescued: 9 },
      level: 2,
      version: 4,
      synced: true,
      savedAt: Date.now(),
    });

    invoke.mockRejectedValueOnce(new Error('network down'));
    const store = new GameStateStore();
    await loadGameState(scene, store);

    expect(store.totalRescued).toBe(9);
    expect(showToast).toHaveBeenCalled();
    expect(showBlocking).not.toHaveBeenCalled();
    expect(getSession()).not.toBeNull();
  });
});
