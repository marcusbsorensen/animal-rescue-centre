import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
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

  it('stores the clue the child picked, as its code', async () => {
    const res = await handler(post(signupBody({ pinHintCode: 'birthday' })));
    expect(res.status).toBe(200);
    const row = db.on('users', 'insert')[0].values as Record<string, unknown>;
    expect(row.pin_hint_code).toBe('birthday');
    expect(row).not.toHaveProperty('pin_hint');
  });

  it('refuses a clue code that is not on the list', async () => {
    const res = await handler(post(signupBody({ pinHintCode: 'my nan was born 1950' })));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/clue/i);
    expect(db.on('users', 'insert')).toHaveLength(0);
  });

  it('keeps nothing of a typed hint sent by an older app build', async () => {
    // Builds already on phones send `pinHint` as free text. The account
    // is still made, so those children can sign up, and the text is
    // dropped before anything is written.
    const typed = 'my cat Pip was born in the spring';
    const res = await handler(post(signupBody({ pinHint: typed })));
    expect(res.status).toBe(200);
    const row = db.on('users', 'insert')[0].values as Record<string, unknown>;
    expect(row).not.toHaveProperty('pin_hint');
    expect(row.pin_hint_code ?? null).toBeNull();
    expect(JSON.stringify(db.queries)).not.toContain('Pip');
  });

  it('keeps nothing of a parent email sent by an older app build', async () => {
    // No screen asks for a parent email, but the signup function used to
    // read `parentEmail` and keep an unkeyed SHA-256 of it. Any build
    // that still sends one gets an account and nothing of the address,
    // or of its hash, is written.
    const email = 'Grown.Up@example.com';
    const sha256 = createHash('sha256').update(email.toLowerCase()).digest('hex');
    const res = await handler(post(signupBody({ parentEmail: email })));
    expect(res.status).toBe(200);
    const row = db.on('users', 'insert')[0].values as Record<string, unknown>;
    expect(row).not.toHaveProperty('parent_email_hash');
    const written = JSON.stringify(db.queries).toLowerCase();
    expect(written).not.toContain('example.com');
    expect(written).not.toContain(sha256);
  });

  it('answers a name check without creating anything', async () => {
    const res = await handler(post({ username: 'Bramble', checkOnly: true }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ available: true, suggestions: [] });
    expect(db.on('users', 'insert')).toHaveLength(0);
  });
});
