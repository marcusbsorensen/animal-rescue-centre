import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FakeSupabase, type Query } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, post, json, type Handler } from '../support/harness';

let handler: Handler;
let db: FakeSupabase;

const NEW_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'Bramble',
  avatar_emoji: '🦊',
  avatar_bg_colour: '#ffd0a0',
  join_code: 'FOX-428',
};

/** The database a first-time signup meets: the name is free. */
function freshDatabase(): FakeSupabase {
  return new FakeSupabase((q: Query) => {
    if (q.table === 'users' && q.op === 'insert') return { data: NEW_USER, error: null };
    return undefined;
  });
}

const signupBody = (extra: Record<string, unknown> = {}) => ({
  username: 'Bramble',
  pin: '4821',
  avatarEmoji: '🦊',
  avatarBgColour: '#ffd0a0',
  ...extra,
});

beforeAll(async () => {
  handler = await loadFunction(() => import('../../../../supabase/functions/signup/index.ts'));
});

beforeEach(() => {
  db = useFakeSupabase(freshDatabase());
});

describe('signup', () => {
  it('answers a CORS preflight without touching the database', async () => {
    const res = await handler(new Request('http://localhost/', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(db.queries).toHaveLength(0);
  });

  it('refuses a name with digits in it', async () => {
    const res = await handler(post(signupBody({ username: 'Bramble7' })));
    expect(res.status).toBe(400);
    expect(db.on('users', 'insert')).toHaveLength(0);
  });

  it('refuses a name on the blocklist', async () => {
    const res = await handler(post(signupBody({ username: 'Adminfox' })));
    expect(res.status).toBe(400);
  });

  it('creates the account and returns a session', async () => {
    const res = await handler(post(signupBody()));
    expect(res.status).toBe(200);
    const body = await json(res);
    const session = body.session as Record<string, unknown>;
    expect(session.username).toBe('Bramble');
    expect(session.token).toMatch(/^[0-9a-f]{64}$/);

    const [insert] = db.on('users', 'insert');
    const row = insert.values as Record<string, unknown>;
    expect(row.username).toBe('Bramble');
    // The PIN is stored as salt:hash, never as typed.
    expect(row.pin_hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain('4821');
  });

  it('answers a name check without creating anything', async () => {
    const res = await handler(post({ username: 'Bramble', checkOnly: true }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ available: true, suggestions: [] });
    expect(db.on('users', 'insert')).toHaveLength(0);
  });
});
