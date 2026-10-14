import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FakeSupabase, type Query } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, setEnv, post, json, type Handler } from '../support/harness';
import { hashPin } from '../../../../supabase/functions/_shared/crypto.ts';

let handler: Handler;
let pinHash: string;

beforeAll(async () => {
  handler = await loadFunction(() => import('../../../../supabase/functions/login/index.ts'));
  pinHash = await hashPin('4821');
});

beforeEach(() => {
  // A test value, not a real secret: address limits need one to run.
  setEnv({ RATE_LIMIT_ADDRESS_KEY: 'test-only-address-key-0123456789abcdef0123456789abcdef' });
});

function withAccount(): FakeSupabase {
  return new FakeSupabase((q: Query) => {
    if (q.table === 'users' && q.op === 'select') {
      return {
        data: {
          id: 'u1', username: 'Bramble', display_name: 'MossyOtter', pin_hash: pinHash,
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

  it('tells the app the name other players see', async () => {
    const db = useFakeSupabase(withAccount());
    const res = await handler(post({ username: 'Bramble', pin: '4821' }));
    const session = (await json(res)).session as Record<string, unknown>;
    expect(session.displayName).toBe('MossyOtter');
    expect(db.on('users', 'select')[0].columns).toContain('display_name');
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

  it('finds the account whatever capitals the name is typed in', async () => {
    for (const username of ['bramble', 'BRAMBLE', 'bRaMbLe', ' Bramble ']) {
      const db = useFakeSupabase(withAccount());
      const res = await handler(post({ username, pin: '4821' }));
      expect(res.status, username).toBe(200);
      // Looked up by the name in small letters (00018), never as typed.
      const lookup = db.on('users', 'select')[0];
      expect(lookup.filters).toEqual([{ kind: 'eq', column: 'username_lower', value: 'bramble' }]);
      // The session carries the name as it was made, for the device to remember.
      expect(((await json(res)).session as Record<string, unknown>).username).toBe('Bramble');
    }
  });

  it('gives one budget of tries to a name, whatever its capitals', async () => {
    const keys = new Set<string>();
    for (const username of ['Bramble', 'bramble', 'BRAMBLE']) {
      const db = useFakeSupabase(withAccount());
      await handler(post({ username, pin: '0000' }));
      for (const k of db.rateLimitKeys()) if (k.startsWith('login:')) keys.add(k);
    }
    expect([...keys]).toEqual(['login:bramble']);
  });

  it('refuses a name that is only spaces', async () => {
    const db = useFakeSupabase(new FakeSupabase());
    const res = await handler(post({ username: '   ', pin: '1234' }));
    expect(res.status).toBe(400);
    expect(db.queries).toHaveLength(0);
  });
});
