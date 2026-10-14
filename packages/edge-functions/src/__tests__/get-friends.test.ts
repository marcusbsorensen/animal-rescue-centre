import { describe, it, expect, beforeAll } from 'vitest';
import { FakeSupabase, hasEq, type Query } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, post, json, type Handler } from '../support/harness';

/**
 * get-friends: the friends screen's list, for the account the session
 * belongs to, with each friend as another player may see them.
 */

let handler: Handler;

const TOKEN = 'b'.repeat(64);
const ME = '00000000-0000-4000-8000-0000000000a1';
const FRIEND = '00000000-0000-4000-8000-0000000000b2';
const SOMEONE_ELSE = '00000000-0000-4000-8000-0000000000c3';

beforeAll(async () => {
  handler = await loadFunction(() => import('../../../../supabase/functions/get-friends/index.ts'));
});

function signedIn(rows: unknown[] = []): FakeSupabase {
  return new FakeSupabase((q: Query) => {
    if (q.table === 'sessions' && q.op === 'select') {
      return {
        data: { token: TOKEN, user_id: ME, expires_at: new Date(Date.now() + 3_600_000).toISOString() },
        error: null,
      };
    }
    if (q.table === 'friendships' && q.op === 'select') return { data: rows, error: null };
    return undefined;
  });
}

const asMe = { headers: { 'x-arc-session': TOKEN } };

describe('get-friends', () => {
  it('refuses a caller with no session, and reads no friendships', async () => {
    const db = useFakeSupabase(new FakeSupabase());
    const res = await handler(post({}));
    expect(res.status).toBe(401);
    expect(db.on('friendships')).toEqual([]);
  });

  it("reads the session's own friendships, whatever the body says", async () => {
    const db = useFakeSupabase(signedIn());
    const res = await handler(post({ userId: SOMEONE_ELSE }, asMe));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ friends: [] });
    const [read] = db.on('friendships', 'select');
    expect(hasEq(read, 'user_id', ME)).toBe(true);
    expect(JSON.stringify(db.queries)).not.toContain(SOMEONE_ELSE);
  });

  it('gives each friend by id, display name and avatar, never the name they typed', async () => {
    const db = useFakeSupabase(signedIn([
      // The fake answers whatever was asked for; a username here would
      // only reach the reply if the function passed it on.
      { created_at: '2026-10-14T10:00:00Z', friend: { id: FRIEND, username: 'Amelia Jones', display_name: 'MossyOtter', avatar_emoji: '🐰', avatar_bg_colour: '#d0f0c0' } },
      // A friend whose account has gone between the two reads.
      { created_at: '2026-10-14T11:00:00Z', friend: null },
    ]));
    const res = await handler(post({}, asMe));
    expect(await json(res)).toEqual({
      friends: [{ id: FRIEND, displayName: 'MossyOtter', avatarEmoji: '🐰', avatarBgColour: '#d0f0c0' }],
    });
    const [read] = db.on('friendships', 'select');
    expect(read.columns).toContain('display_name');
    expect(read.columns).not.toMatch(/\busername\b/);
    expect(read.columns).not.toMatch(/join_code|pin/);
  });
});
