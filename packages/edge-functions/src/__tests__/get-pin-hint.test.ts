import { describe, it, expect, beforeAll } from 'vitest';
import { FakeSupabase } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, post, json, type Handler } from '../support/harness';

let handler: Handler;

beforeAll(async () => {
  handler = await loadFunction(() => import('../../../../supabase/functions/get-pin-hint/index.ts'));
});

describe('get-pin-hint', () => {
  it('says nothing about a name that has no account', async () => {
    useFakeSupabase(new FakeSupabase());
    const res = await handler(post({ username: 'Nobody' }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ found: false });
  });

  it('returns the picked clue as its code and its words', async () => {
    const db = useFakeSupabase(new FakeSupabase((q) =>
      q.table === 'users' ? { data: { pin_hint_code: 'birthday', is_active: true }, error: null } : undefined,
    ));
    const res = await handler(post({ username: 'Bramble' }));
    expect(await json(res)).toEqual({ found: true, hintCode: 'birthday', hint: 'A birthday' });
    // Reads the code column only: the free-text column is gone.
    expect(db.on('users')[0].columns).toBe('pin_hint_code, is_active');
  });

  it('returns no clue for an account that never picked one', async () => {
    useFakeSupabase(new FakeSupabase((q) =>
      q.table === 'users' ? { data: { pin_hint_code: null, is_active: true }, error: null } : undefined,
    ));
    const res = await handler(post({ username: 'Bramble' }));
    expect(await json(res)).toEqual({ found: true, hintCode: null, hint: null });
  });

  it('refuses when the per-name budget is spent', async () => {
    const db = useFakeSupabase(new FakeSupabase(undefined, (fn) =>
      fn === 'check_rate_limit'
        ? { data: [{ allowed: false, retry_after_ms: 120_000 }], error: null }
        : undefined,
    ));
    const res = await handler(post({ username: 'Bramble' }));
    expect(res.status).toBe(429);
    expect(db.on('users')).toHaveLength(0);
  });
});
