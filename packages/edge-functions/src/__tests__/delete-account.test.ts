import { describe, it, expect, beforeAll } from 'vitest';
import { FakeSupabase, hasEq, type Query } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, post, json, type Handler } from '../support/harness';
import { hashPin } from '../../../../supabase/functions/_shared/crypto.ts';

let handler: Handler;
let pinHash: string;

const TOKEN = 'c'.repeat(64);
const PLAYER = '00000000-0000-4000-8000-0000000000c3';
const SOMEONE_ELSE = '00000000-0000-4000-8000-0000000000d4';

beforeAll(async () => {
  handler = await loadFunction(() => import('../../../../supabase/functions/delete-account/index.ts'));
  pinHash = await hashPin('4821');
});

/** PLAYER is signed in on this device, with PIN 4821. */
function signedIn(opts: { rpcError?: boolean; limited?: boolean } = {}): FakeSupabase {
  return new FakeSupabase(
    (q: Query) => {
      if (q.table === 'sessions' && q.op === 'select') {
        return {
          data: { token: TOKEN, user_id: PLAYER, expires_at: new Date(Date.now() + 3_600_000).toISOString() },
          error: null,
        };
      }
      if (q.table === 'users' && q.op === 'select') return { data: { pin_hash: pinHash }, error: null };
      return undefined;
    },
    (fn) => {
      if (fn === 'check_rate_limit' && opts.limited) {
        return { data: [{ allowed: false, retry_after_ms: 600_000 }], error: null };
      }
      if (fn === 'delete_account') {
        return opts.rpcError
          ? { data: null, error: { message: 'boom' } }
          : { data: { users: 1 }, error: null };
      }
      return undefined;
    },
  );
}

const asPlayer = { headers: { 'x-arc-session': TOKEN } };

describe('delete-account', () => {
  it('refuses a caller with no session, and deletes nothing', async () => {
    const db = useFakeSupabase(new FakeSupabase());
    const res = await handler(post({ pin: '4821' }));
    expect(res.status).toBe(401);
    expect((await json(res)).code).toBe('signed_out');
    expect(db.rpcs.map((r) => r.fn)).not.toContain('delete_account');
  });

  it('refuses the wrong PIN, and deletes nothing', async () => {
    const db = useFakeSupabase(signedIn());
    const res = await handler(post({ pin: '1111' }, asPlayer));
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('wrong_pin');
    expect(db.rpcs.map((r) => r.fn)).not.toContain('delete_account');
  });

  it('refuses a PIN that is not four digits', async () => {
    const db = useFakeSupabase(signedIn());
    const res = await handler(post({ pin: '12' }, asPlayer));
    expect(res.status).toBe(400);
    expect(db.rpcs.map((r) => r.fn)).not.toContain('delete_account');
  });

  it('deletes the account the session belongs to, with the right PIN', async () => {
    const db = useFakeSupabase(signedIn());
    const res = await handler(post({ pin: '4821' }, asPlayer));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ deleted: true });
    const call = db.rpcs.find((r) => r.fn === 'delete_account');
    expect(call?.args).toEqual({ p_user_id: PLAYER });
    // The PIN was checked against the session's own account.
    expect(hasEq(db.on('users', 'select')[0], 'id', PLAYER)).toBe(true);
  });

  it('never reads a user id from the body', async () => {
    const db = useFakeSupabase(signedIn());
    await handler(post({ pin: '4821', userId: SOMEONE_ELSE, p_user_id: SOMEONE_ELSE }, asPlayer));
    const call = db.rpcs.find((r) => r.fn === 'delete_account');
    expect(call?.args).toEqual({ p_user_id: PLAYER });
    expect(JSON.stringify(db.queries)).not.toContain(SOMEONE_ELSE);
  });

  it('counts tries by account, and stops after too many', async () => {
    const db = useFakeSupabase(signedIn({ limited: true }));
    const res = await handler(post({ pin: '4821' }, asPlayer));
    expect(res.status).toBe(429);
    expect((await json(res)).code).toBe('too_many_tries');
    expect(db.rateLimitKeys()).toEqual([`delete-account:${PLAYER}`]);
    expect(db.rpcs.map((r) => r.fn)).not.toContain('delete_account');
  });

  it('says so when the deletion fails, rather than claiming it worked', async () => {
    useFakeSupabase(signedIn({ rpcError: true }));
    const res = await handler(post({ pin: '4821' }, asPlayer));
    expect(res.status).toBe(500);
    expect((await json(res)).deleted).toBeUndefined();
  });
});
