import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { FakeSupabase, type Query } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, post, json, type Handler } from '../support/harness';

/**
 * remove-friend (146A): the session says whose friendship it is, and the
 * ending is one SQL function, `remove_friend` (00021), which
 * remove-friend-db.test.ts runs against a real Postgres.
 */

let handler: Handler;

const TOKEN = 'e'.repeat(64);
const PLAYER = '00000000-0000-4000-8000-0000000000e5';
const FRIEND = '00000000-0000-4000-8000-0000000000f6';
const SOMEONE_ELSE = '00000000-0000-4000-8000-0000000000a7';

beforeAll(async () => {
  handler = await loadFunction(() => import('../../../../supabase/functions/remove-friend/index.ts'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** PLAYER is signed in on this device. `removed` is what the SQL answers. */
function signedIn(opts: { rpcError?: boolean; limited?: boolean; removed?: Record<string, number> } = {}): FakeSupabase {
  return new FakeSupabase(
    (q: Query) => {
      if (q.table === 'sessions' && q.op === 'select') {
        return {
          data: { token: TOKEN, user_id: PLAYER, expires_at: new Date(Date.now() + 3_600_000).toISOString() },
          error: null,
        };
      }
      return undefined;
    },
    (fn) => {
      if (fn === 'check_rate_limit' && opts.limited) {
        return { data: [{ allowed: false, retry_after_ms: 600_000 }], error: null };
      }
      if (fn === 'remove_friend') {
        return opts.rpcError
          ? { data: null, error: { message: 'boom' } }
          : { data: opts.removed ?? { friendships: 2, gifts_unclaimed: 1 }, error: null };
      }
      return undefined;
    },
  );
}

const asPlayer = { headers: { 'x-arc-session': TOKEN } };
const removals = (db: FakeSupabase) => db.rpcs.filter((r) => r.fn === 'remove_friend');

describe('remove-friend', () => {
  it('refuses a caller with no session, and removes nothing', async () => {
    const db = useFakeSupabase(new FakeSupabase());
    const res = await handler(post({ friendId: FRIEND }));
    expect(res.status).toBe(401);
    expect((await json(res)).code).toBe('signed_out');
    expect(removals(db)).toEqual([]);
  });

  it("ends the friendship between the session's player and the friend named", async () => {
    const db = useFakeSupabase(signedIn());
    const res = await handler(post({ friendId: FRIEND }, asPlayer));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ removed: true });
    expect(removals(db).map((r) => r.args)).toEqual([{ p_user_id: PLAYER, p_friend_id: FRIEND }]);
  });

  it('never reads a user id from the body, so it cannot end two other players\' friendship', async () => {
    const db = useFakeSupabase(signedIn());
    await handler(post({ friendId: FRIEND, userId: SOMEONE_ELSE, p_user_id: SOMEONE_ELSE }, asPlayer));
    expect(removals(db).map((r) => r.args)).toEqual([{ p_user_id: PLAYER, p_friend_id: FRIEND }]);
    expect(JSON.stringify(db.rpcs)).not.toContain(SOMEONE_ELSE);
  });

  it('refuses a friend that is missing, not an id, or the player', async () => {
    for (const friendId of [undefined, '', 'MossyOtter', 42, `${FRIEND}x`, PLAYER]) {
      const db = useFakeSupabase(signedIn());
      const res = await handler(post({ friendId }, asPlayer));
      expect(res.status, String(friendId)).toBe(400);
      expect((await json(res)).code).toBe('bad_friend');
      expect(removals(db)).toEqual([]);
    }
  });

  it('answers the same when asked again, with nothing left to remove', async () => {
    const db = useFakeSupabase(signedIn({ removed: { friendships: 0, gifts_unclaimed: 0 } }));
    for (let i = 0; i < 2; i++) {
      const res = await handler(post({ friendId: FRIEND }, asPlayer));
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ removed: true });
    }
    expect(removals(db)).toHaveLength(2);
  });

  it('counts tries by account, and stops after too many', async () => {
    const db = useFakeSupabase(signedIn({ limited: true }));
    const res = await handler(post({ friendId: FRIEND }, asPlayer));
    expect(res.status).toBe(429);
    expect((await json(res)).code).toBe('too_many_tries');
    expect(db.rateLimitKeys()).toEqual([`remove-friend:${PLAYER}`]);
    expect(removals(db)).toEqual([]);
  });

  it('says so when the removal fails, rather than claiming it worked', async () => {
    useFakeSupabase(signedIn({ rpcError: true }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handler(post({ friendId: FRIEND }, asPlayer));
    expect(res.status).toBe(500);
    expect((await json(res)).removed).toBeUndefined();
  });

  it('logs counts, and no id', async () => {
    useFakeSupabase(signedIn());
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handler(post({ friendId: FRIEND }, asPlayer));
    const said = JSON.stringify(log.mock.calls);
    expect(said).toContain('friendships');
    expect(said).not.toContain(PLAYER);
    expect(said).not.toContain(FRIEND);
    expect(said).not.toContain(TOKEN);
  });
});
