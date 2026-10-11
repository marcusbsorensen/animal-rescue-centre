import { describe, it, expect, beforeAll } from 'vitest';
import { FakeSupabase, type Query } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, post, json, type Handler } from '../support/harness';
import { hashPin } from '../../../../supabase/functions/_shared/crypto.ts';

let handler: Handler;
let pinHash: string;

beforeAll(async () => {
  handler = await loadFunction(() => import('../../../../supabase/functions/login/index.ts'));
  pinHash = await hashPin('4821');
});

function withAccount(): FakeSupabase {
  return new FakeSupabase((q: Query) => {
    if (q.table === 'users' && q.op === 'select') {
      return {
        data: {
          id: 'u1', username: 'Bramble', pin_hash: pinHash,
          avatar_emoji: '🦊', avatar_bg_colour: '#ffd0a0', join_code: 'FOX-428', is_active: true,
        },
        error: null,
      };
    }
    return undefined;
  });
}

describe('login', () => {
  it('signs in with the right PIN and forgets the run of attempts', async () => {
    const db = useFakeSupabase(withAccount());
    const res = await handler(post({ username: 'Bramble', pin: '4821' }));
    expect(res.status).toBe(200);
    expect(((await json(res)).session as Record<string, unknown>).token).toMatch(/^[0-9a-f]{64}$/);
    expect(db.rpcs.map((r) => r.fn)).toContain('clear_rate_limit');
  });

  it('charges the address for a wrong PIN', async () => {
    const db = useFakeSupabase(withAccount());
    const res = await handler(post({ username: 'Bramble', pin: '0000' }));
    expect(res.status).toBe(401);
    expect(db.rpcs.map((r) => r.fn)).toContain('bump_rate_limit');
  });

  it('charges the address for a name with no account', async () => {
    const db = useFakeSupabase(new FakeSupabase());
    const res = await handler(post({ username: 'Nobody', pin: '1234' }));
    expect(res.status).toBe(404);
    expect(db.rpcs.map((r) => r.fn)).toContain('bump_rate_limit');
  });
});
