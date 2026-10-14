import { describe, it, expect, beforeEach, vi } from 'vitest';

const invoke = vi.fn();
const from = vi.fn();
vi.mock('../supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) }, from: (...args: unknown[]) => from(...args) },
  isSupabaseConfigured: () => true,
}));

const { removeFriend } = await import('../friends');

/**
 * Removing a friend (146A) goes through the remove-friend function, which
 * takes the player from the session. It used to delete the rows itself
 * with the public key, which the rules on `friendships` let it do nowhere.
 */

const ADA = {
  userId: 'ada-id', username: 'Ada', displayName: 'MossyOtter', avatarEmoji: '🦊',
  avatarBgColour: '#fff', joinCode: 'FOX-111', token: 'a'.repeat(64),
};
const BO = '00000000-0000-4000-8000-0000000000b2';

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  from.mockReset();
  localStorage.setItem('arc_session', JSON.stringify(ADA));
});

describe('removeFriend', () => {
  it("sends the friend's id with the session header, and no user id", async () => {
    invoke.mockResolvedValue({ data: { removed: true }, error: null });
    await removeFriend(BO);
    const [name, options] = invoke.mock.calls[0];
    expect(name).toBe('remove-friend');
    expect(options.headers).toEqual({ 'x-arc-session': ADA.token });
    expect(options.body).toEqual({ friendId: BO });
    expect(from).not.toHaveBeenCalled();
  });

  it('fails when the function says it failed, so the screen keeps the friend', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code' } });
    await expect(removeFriend(BO)).rejects.toThrow();
    invoke.mockResolvedValue({ data: { error: 'Too many tries', code: 'too_many_tries' }, error: null });
    await expect(removeFriend(BO)).rejects.toThrow('Too many tries');
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(removeFriend(BO)).rejects.toThrow();
  });

  it('asks nothing when nobody is signed in', async () => {
    localStorage.clear();
    await expect(removeFriend(BO)).rejects.toThrow('Not logged in');
    expect(invoke).not.toHaveBeenCalled();
  });
});
