import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Adding a friend by code can be refused for six different reasons, and a
 * child has to be told which. supabase-js turns every non-2xx into one
 * generic "Edge Function returned a non-2xx status code" and hides the real
 * answer in `error.context`, so until the client read that body, "that code
 * is not ours", "that's your own code" and "you have tried too many times"
 * all arrived at the screen as the same sentence — a sentence about edge
 * functions.
 */

const invoke = vi.fn();
vi.mock('../supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
  isSupabaseConfigured: () => true,
}));

const { addFriendByCode, FriendError } = await import('../friends');

const ME = {
  userId: 'u-me', username: 'Amelia', displayName: 'KindBadger', avatarEmoji: '🦊',
  avatarBgColour: '#fff', joinCode: 'FOX-428', token: 'a'.repeat(64),
};

/** What supabase-js hands back for a non-2xx: a generic error, body behind
 *  `context.json()`, and `data` null. */
function refused(body: Record<string, unknown>) {
  return {
    data: null,
    error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: { json: async () => body },
    }),
  };
}

describe('why a friend could not be added', () => {
  beforeEach(() => {
    invoke.mockReset();
    localStorage.clear();
    localStorage.setItem('arc_session', JSON.stringify(ME));
  });

  it.each([
    ['not_found', 'No player found with that code'],
    ['own_code', "That's your own code!"],
    ['already_friends', 'Already friends!'],
    ['bad_format', 'Invalid join code format'],
    ['too_many_tries', 'Too many tries'],
  ])('tells the screen it was %s', async (code, error) => {
    invoke.mockResolvedValue(refused({ error, code }));
    await expect(addFriendByCode('FOX-123')).rejects.toMatchObject({ code, message: error });
  });

  it('carries how long to wait when there have been too many tries', async () => {
    invoke.mockResolvedValue(refused({ error: 'Too many tries', code: 'too_many_tries', retryAfterMs: 540_000 }));
    await expect(addFriendByCode('FOX-123')).rejects.toMatchObject({
      code: 'too_many_tries',
      retryAfterMs: 540_000,
    });
  });

  it('is a FriendError, so a screen can tell it from a bug', async () => {
    invoke.mockResolvedValue(refused({ error: 'Already friends!', code: 'already_friends' }));
    const err = await addFriendByCode('FOX-123').catch((e) => e);
    expect(err).toBeInstanceOf(FriendError);
  });

  it('falls back to failed when the refusal carries no body at all', async () => {
    // A gateway error, or anything else that is not our function answering.
    invoke.mockResolvedValue({ data: null, error: new Error('network down') });
    await expect(addFriendByCode('FOX-123')).rejects.toMatchObject({ code: 'failed' });
  });

  it('says signed_out before it asks the server anything', async () => {
    localStorage.clear();
    await expect(addFriendByCode('FOX-123')).rejects.toMatchObject({ code: 'signed_out' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('hands back the friend when the code is good', async () => {
    const friend = { id: 'u-2', displayName: 'MossyOtter', avatarEmoji: '🐰', avatarBgColour: '#d0f0c0' };
    invoke.mockResolvedValue({ data: { friend }, error: null });
    await expect(addFriendByCode('fox-123')).resolves.toEqual(friend);
    const [name, options] = invoke.mock.calls[0];
    expect(name).toBe('add-friend');
    expect(options.headers).toEqual({ 'x-arc-session': ME.token });
  });
});
