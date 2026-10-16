import { describe, it, expect, beforeAll } from 'vitest';
import { FakeSupabase, hasEq, type Query } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, post, json, type Handler } from '../support/harness';

/**
 * get-leaderboard: the Village Hall board, the player and their friends by
 * animals rescued.
 *
 * Three reads the public key could never satisfy — friendships, rescue_stats
 * and game_states all carry rules keyed on auth.uid() — so the board was
 * empty for everyone. These pin that the friend list comes from the session,
 * that a player with no friends still sees themselves, and that nobody
 * outside that list reaches the board.
 */

let handler: Handler;

const TOKEN = 'b'.repeat(64);
const ME = '00000000-0000-4000-8000-0000000000a1';
const FRIEND = '00000000-0000-4000-8000-0000000000b2';
const SOMEONE_ELSE = '00000000-0000-4000-8000-0000000000c3';

beforeAll(async () => {
  handler = await loadFunction(() => import('../../../../supabase/functions/get-leaderboard/index.ts'));
});

function signedIn(rows: Record<string, unknown[]> = {}): FakeSupabase {
  return new FakeSupabase((q: Query) => {
    if (q.table === 'sessions' && q.op === 'select') {
      return {
        data: { token: TOKEN, user_id: ME, expires_at: new Date(Date.now() + 3_600_000).toISOString() },
        error: null,
      };
    }
    if (q.op === 'select' && q.table in rows) return { data: rows[q.table], error: null };
    if (q.op === 'select') return { data: [], error: null };
    return undefined;
  });
}

const asMe = { headers: { 'x-arc-session': TOKEN } };

describe('get-leaderboard', () => {
  it('refuses a caller with no session, and reads nothing', async () => {
    const db = useFakeSupabase(new FakeSupabase());
    const res = await handler(post({}));
    expect(res.status).toBe(401);
    expect(db.on('friendships')).toEqual([]);
    expect(db.on('rescue_stats')).toEqual([]);
  });

  it("builds the board from the session's own friends, whatever the body says", async () => {
    const db = useFakeSupabase(signedIn({ friendships: [{ friend_id: FRIEND }] }));
    const res = await handler(post({ userId: SOMEONE_ELSE }, asMe));
    expect(res.status).toBe(200);
    const [read] = db.on('friendships', 'select');
    expect(hasEq(read, 'user_id', ME)).toBe(true);
    expect(JSON.stringify(db.queries)).not.toContain(SOMEONE_ELSE);
  });

  it('gives each player by display name and avatar, never the name they typed', async () => {
    const db = useFakeSupabase(signedIn({
      friendships: [{ friend_id: FRIEND }],
      rescue_stats: [
        { user_id: FRIEND, total_rescued: 4, user: { username: 'Amelia Jones', display_name: 'MossyOtter', avatar_emoji: '🐰' } },
      ],
      game_states: [{ user_id: FRIEND, level: 3 }],
    }));
    const res = await handler(post({}, asMe));
    expect(await json(res)).toEqual({
      board: [{ displayName: 'MossyOtter', avatarEmoji: '🐰', totalRescued: 4, level: 3 }],
    });
    const [read] = db.on('rescue_stats', 'select');
    expect(read.columns).toContain('display_name');
    expect(read.columns).not.toMatch(/\busername\b/);
  });

  it('a player with no friends is on their own board', async () => {
    // Showing them nothing reads as a broken screen. Showing them their own
    // rescues says what the board is for.
    useFakeSupabase(signedIn({
      friendships: [],
      rescue_stats: [{ user_id: ME, total_rescued: 2, user: { display_name: 'KindBadger', avatar_emoji: '🦊' } }],
      game_states: [{ user_id: ME, level: 1 }],
    }));
    const res = await handler(post({}, asMe));
    expect(await json(res)).toEqual({
      board: [{ displayName: 'KindBadger', avatarEmoji: '🦊', totalRescued: 2, level: 1 }],
    });
  });

  it('a player with no rescues yet still gets a level', async () => {
    useFakeSupabase(signedIn({
      friendships: [{ friend_id: FRIEND }],
      rescue_stats: [{ user_id: FRIEND, total_rescued: null, user: { display_name: 'MossyOtter', avatar_emoji: '🐰' } }],
      game_states: [],
    }));
    const res = await handler(post({}, asMe));
    expect(await json(res)).toEqual({
      board: [{ displayName: 'MossyOtter', avatarEmoji: '🐰', totalRescued: 0, level: 1 }],
    });
  });
});
