import { describe, it, expect, beforeEach, vi } from 'vitest';

// lib/auth imports lib/supabase, which builds a real client at module load.
const invoke = vi.fn();
const from = vi.fn();
vi.mock('../supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, from: (...a: unknown[]) => from(...a) },
  isSupabaseConfigured: () => true,
}));

const { offerSignInNames, signup, login, getRememberedUsernames, SignupError } = await import('../auth');

/**
 * The name screen offers ready-made sign-in names, which come from the
 * signup function (the public key cannot read the pool), and a name
 * picked from them is sent back marked as ready-made so the server
 * claims it.
 */
describe('ready-made sign-in names', () => {
  beforeEach(() => {
    invoke.mockReset();
    from.mockReset();
    localStorage.clear();
  });

  it('asks the signup function for names, never the database directly', async () => {
    invoke.mockResolvedValue({ data: { names: ['PebbleKite', 'AcornDrum', 'MoonSock'] }, error: null });
    expect(await offerSignInNames()).toEqual(['PebbleKite', 'AcornDrum', 'MoonSock']);
    expect(invoke).toHaveBeenCalledWith('signup', { body: { offerNames: true } });
    expect(from).not.toHaveBeenCalled();
  });

  it('gives an empty list, never an exception, when asking fails', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('429') });
    expect(await offerSignInNames()).toEqual([]);
    invoke.mockResolvedValue({ data: { names: 'PebbleKite' }, error: null });
    expect(await offerSignInNames()).toEqual([]);
    invoke.mockRejectedValue(new Error('offline'));
    expect(await offerSignInNames()).toEqual([]);
  });

  it('sends a picked name marked as ready-made', async () => {
    invoke.mockResolvedValue({
      data: { session: { userId: 'u-1', username: 'PebbleKite', avatarEmoji: '🦊', avatarBgColour: '#fff', joinCode: 'FOX-1', token: 't'.repeat(64) } },
      error: null,
    });
    await signup({ username: 'PebbleKite', pin: '4821', avatarEmoji: '🦊', avatarBgColour: '#fff', readyMadeName: true });
    expect(invoke.mock.calls[0][1].body).toMatchObject({ username: 'PebbleKite', readyMadeName: true });
  });

  it('passes on three new names when the picked one was just taken', async () => {
    const context = new Response(JSON.stringify({
      error: 'Someone just took that name. Pick another!',
      code: 'name_taken',
      suggestions: ['RocketKite', 'TulipDrum', 'FigBoat'],
    }), { status: 409 });
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('non-2xx'), { context }) });
    const err = await signup({ username: 'PebbleKite', pin: '4821', avatarEmoji: '🦊', avatarBgColour: '#fff', readyMadeName: true })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SignupError);
    expect((err as InstanceType<typeof SignupError>).message).toBe('Someone just took that name. Pick another!');
    expect((err as InstanceType<typeof SignupError>).suggestions).toEqual(['RocketKite', 'TulipDrum', 'FigBoat']);
  });
});

/**
 * Signing in by typing the secret name (131A, hub 96): the name goes to
 * the server without the spaces a keyboard adds, in the capitals she
 * typed (the server ignores them), and the device then remembers the
 * name as it was made, not as she typed it.
 */
describe('signing in with a typed name', () => {
  beforeEach(() => {
    invoke.mockReset();
    localStorage.clear();
  });

  it('sends the name without spaces either side, and remembers it as the server has it', async () => {
    invoke.mockResolvedValue({
      data: { session: { userId: 'u1', username: 'PebbleKite', displayName: 'MossyOtter', avatarEmoji: '🦊', avatarBgColour: '#ffd0a0', joinCode: 'FOX-428', token: 't' } },
      error: null,
    });
    const session = await login({ username: '  pebblekite ', pin: '4821' });
    expect(invoke).toHaveBeenCalledWith('login', { body: { username: 'pebblekite', pin: '4821' } });
    expect(session.username).toBe('PebbleKite');
    expect(getRememberedUsernames()).toEqual(['PebbleKite']);
  });
});
