import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Everything the game shows about another player uses their display name
 * (MossyOtter), never the name they typed, which is their login. These
 * pin what lib/friends.ts and lib/gifts.ts ask the database for and what
 * they hand to the screens.
 */

const selects: Array<{ table: string; columns: string }> = [];
let rows: Record<string, unknown[]> = {};

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  Object.assign(b, {
    select: (columns: string) => { selects.push({ table, columns }); return b; },
    eq: chain, is: chain, in: chain, order: chain, limit: chain,
    then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve),
  });
  return b;
}

const invoke = vi.fn();
vi.mock('../supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) }, from: (table: string) => builder(table) },
  isSupabaseConfigured: () => true,
}));

const { getFriends } = await import('../friends');
const { getGiftInbox, getFriendLeaderboard } = await import('../gifts');

const ME = {
  userId: 'u-me', username: 'Amelia', displayName: 'KindBadger', avatarEmoji: '🦊',
  avatarBgColour: '#fff', joinCode: 'FOX-428', token: 'a'.repeat(64),
};

/** Asked-for columns that name the typed login. */
const asksForLogin = () => selects.filter((s) => /\busername\b/.test(s.columns));

describe('what one player is shown about another', () => {
  beforeEach(() => {
    selects.length = 0;
    rows = {};
    invoke.mockReset();
    localStorage.clear();
    localStorage.setItem('arc_session', JSON.stringify(ME));
  });

  it('a friend in the list is their display name, from get-friends', async () => {
    // The function answers with what another player may see; anything
    // else it might carry is not passed on to the screens.
    invoke.mockResolvedValue({
      data: { friends: [{ id: 'u-2', displayName: 'MossyOtter', avatarEmoji: '🐰', avatarBgColour: '#d0f0c0', username: 'Amelia' }] },
      error: null,
    });
    const friends = await getFriends();
    expect(friends).toEqual([{ id: 'u-2', displayName: 'MossyOtter', avatarEmoji: '🐰', avatarBgColour: '#d0f0c0' }]);
    const [name, options] = invoke.mock.calls[0];
    expect(name).toBe('get-friends');
    expect(options.headers).toEqual({ 'x-arc-session': ME.token });
    expect(options.body).toEqual({});
    // Not read with the public key any more.
    expect(selects.filter((s) => s.table === 'friendships')).toEqual([]);
  });

  it('a gift says who sent it by display name', async () => {
    rows.gifts = [{
      id: 'g1', gift_type: 'toy', message_preset_code: 'hello', sent_at: '2026-10-12T10:00:00Z',
      sender: { display_name: 'SunnyHare', avatar_emoji: '🐶' },
    }];
    const [gift] = await getGiftInbox();
    expect(gift.fromDisplayName).toBe('SunnyHare');
    expect(gift).not.toHaveProperty('fromUsername');
    expect(asksForLogin()).toEqual([]);
  });

  it('the friends board lists display names', async () => {
    rows.friendships = [{ friend_id: 'u-2' }];
    rows.rescue_stats = [{ user_id: 'u-2', total_rescued: 4, user: { display_name: 'MossyOtter', avatar_emoji: '🐰' } }];
    rows.game_states = [{ user_id: 'u-2', level: 3 }];
    const [entry] = await getFriendLeaderboard();
    expect(entry.displayName).toBe('MossyOtter');
    expect(entry).not.toHaveProperty('username');
    expect(asksForLogin()).toEqual([]);
  });
});
