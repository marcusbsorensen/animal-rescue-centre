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
