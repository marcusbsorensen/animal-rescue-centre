import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { FakeSupabase, type Query } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, setEnv, post, json, type Handler } from '../support/harness';
import { isDisplayName } from '../../../game-logic/src/display-names';

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

  it('gives the account the display name the child was shown', async () => {
    const res = await handler(post(signupBody({ displayName: 'MossyOtter' })));
    expect(res.status).toBe(200);
    const row = db.on('users', 'insert')[0].values as Record<string, unknown>;
    expect(row.display_name).toBe('MossyOtter');
    // The typed name stays the login, and only the player sees it.
    expect(row.username).toBe('Bramble');
    const session = (await json(res)).session as Record<string, unknown>;
    expect(session.displayName).toBe('MossyOtter');
  });

  it('adds a number when that display name is taken', async () => {
    db = useFakeSupabase(new FakeSupabase((q: Query) => {
      if (q.table === 'users' && q.op === 'insert') return { data: NEW_USER, error: null };
      if (q.table === 'users' && q.op === 'select' && q.filters.some((f) => f.column === 'display_name')) {
        return { data: [{ display_name: 'MossyOtter' }, { display_name: 'MossyOtter2' }], error: null };
      }
      return undefined;
    }));
    const res = await handler(post(signupBody({ displayName: 'MossyOtter' })));
    expect(res.status).toBe(200);
    const name = (db.on('users', 'insert')[0].values as Record<string, unknown>).display_name as string;
    expect(name).toMatch(/^MossyOtter\d{1,2}$/);
    expect(name).not.toBe('MossyOtter2');
    expect(isDisplayName(name)).toBe(true);
    expect(((await json(res)).session as Record<string, unknown>).displayName).toBe(name);
  });

  it('never stores a display name that is not from the lists', async () => {
    // Only a pair from the lists, with no number, is taken from the app.
    // Anything else, typed or tampered with, is replaced, not refused:
    // the child has no box to fix it in.
    for (const sent of ['Lily Smith', 'MossyOtter7', 'mossyotter', undefined]) {
      db = useFakeSupabase(freshDatabase());
      const res = await handler(post(signupBody({ displayName: sent })));
      expect(res.status).toBe(200);
      const name = (db.on('users', 'insert')[0].values as Record<string, unknown>).display_name;
      expect(isDisplayName(name), String(sent)).toBe(true);
      expect(name).not.toBe(sent);
    }
  });

  it('tries another display name if one is taken between the check and the insert', async () => {
    let inserts = 0;
    db = useFakeSupabase(new FakeSupabase((q: Query) => {
      if (q.table === 'users' && q.op === 'insert') {
        inserts++;
        if (inserts === 1) {
          return {
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint "users_display_name_key"' },
          };
        }
        return { data: NEW_USER, error: null };
      }
      return undefined;
    }));
    const res = await handler(post(signupBody({ displayName: 'MossyOtter' })));
    expect(res.status).toBe(200);
    const [first, second] = db.on('users', 'insert').map((q) => (q.values as Record<string, unknown>).display_name);
    expect(first).toBe('MossyOtter');
    expect(second).not.toBe('MossyOtter');
    expect(isDisplayName(second)).toBe(true);
  });

  it('answers a name check without creating anything', async () => {
    const res = await handler(post({ username: 'Bramble', checkOnly: true }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ available: true, suggestions: [] });
    expect(db.on('users', 'insert')).toHaveLength(0);
  });
});

describe('signup: ready-made sign-in names', () => {
  const OFFERED = ['PebbleKite', 'AcornDrum', 'MoonSock'];

  /** A database with free names in the pool; `claim` says whether a claim wins. */
  function poolDatabase(opts: {
    claim?: boolean;
    takenName?: string;
    insertFails?: boolean;
    offersAllowed?: boolean;
  } = {}): FakeSupabase {
    return useFakeSupabase(new FakeSupabase(
      (q: Query) => {
        if (q.table === 'users' && q.op === 'insert') {
          return opts.insertFails
            ? { data: null, error: { code: 'XX000', message: 'boom' } }
            : { data: NEW_USER, error: null };
        }
        if (
          opts.takenName && q.table === 'users' && q.op === 'select' && q.shape === 'maybeSingle'
          && q.filters.some((f) => f.column === 'username' && f.value === opts.takenName)
        ) {
          return { data: { id: 'someone-else' }, error: null };
        }
        return undefined;
      },
      (fn) => {
        if (fn === 'arc_offer_sign_in_names') return { data: OFFERED, error: null };
        if (fn === 'arc_claim_sign_in_name') return { data: opts.claim ?? true, error: null };
        if (fn === 'check_rate_limit' && opts.offersAllowed === false) {
          return { data: [{ allowed: false, retry_after_ms: 120_000 }], error: null };
        }
        return undefined;
      },
    ));
  }

  it('offers three ready-made names, and creates nothing', async () => {
    db = poolDatabase();
    const res = await handler(post({ offerNames: true }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ names: OFFERED });
    expect(db.rpcs.find((r) => r.fn === 'arc_offer_sign_in_names')?.args).toEqual({ p_count: 3 });
    expect(db.on('users')).toHaveLength(0);
    expect(db.on('username_pool')).toHaveLength(0);
  });

  it('counts offers on their own address budget, keyed by a hash of the address', async () => {
    setEnv({ RATE_LIMIT_ADDRESS_KEY: 'test-only-address-key-0123456789abcdef0123456789abcdef' });
    try {
      db = poolDatabase();
      await handler(post({ offerNames: true }));
      const keys = db.rateLimitKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatch(/^signup-names-ip:[0-9a-f]{64}$/);
      expect(keys.join(' ')).not.toContain('203.0.113.7');
    } finally {
      setEnv({});
    }
  });

  it('says to wait when a child has asked for names too many times', async () => {
    setEnv({ RATE_LIMIT_ADDRESS_KEY: 'test-only-address-key-0123456789abcdef0123456789abcdef' });
    try {
      db = poolDatabase({ offersAllowed: false });
      const res = await handler(post({ offerNames: true }));
      expect(res.status).toBe(429);
      expect(db.rpcs.some((r) => r.fn === 'arc_offer_sign_in_names')).toBe(false);
    } finally {
      setEnv({});
    }
  });

  it('claims a ready-made name, then makes the account and marks the name as its own', async () => {
    db = poolDatabase();
    const res = await handler(post(signupBody({ username: 'PebbleKite', readyMadeName: true })));
    expect(res.status).toBe(200);
    expect(db.rpcs.find((r) => r.fn === 'arc_claim_sign_in_name')?.args).toEqual({ p_name: 'PebbleKite' });
    expect(db.on('users', 'insert')).toHaveLength(1);
    const [mark] = db.on('username_pool', 'update');
    expect((mark.values as Record<string, unknown>).claimed_by).toBe(NEW_USER.id);
    expect(mark.filters).toContainEqual({ kind: 'eq', column: 'username', value: 'PebbleKite' });
  });

  it('refuses a ready-made name somebody has just taken, and offers three new ones', async () => {
    db = poolDatabase({ claim: false });
    const res = await handler(post(signupBody({ username: 'PebbleKite', readyMadeName: true })));
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.code).toBe('name_taken');
    expect(body.suggestions).toEqual(OFFERED);
    expect(db.on('users', 'insert')).toHaveLength(0);
  });

  it('gives the name back when the account cannot be made', async () => {
    db = poolDatabase({ insertFails: true });
    const res = await handler(post(signupBody({ username: 'PebbleKite', readyMadeName: true })));
    expect(res.status).toBe(500);
    const [release] = db.on('username_pool', 'update');
    expect(release.values).toEqual({ claimed_at: null });
    expect(release.filters).toContainEqual({ kind: 'eq', column: 'username', value: 'PebbleKite' });
    expect(release.filters).toContainEqual({ kind: 'is', column: 'claimed_by', value: null });
  });

  it('still signs up a typed name from an older build, without claiming it first', async () => {
    db = poolDatabase();
    const res = await handler(post(signupBody()));
    expect(res.status).toBe(200);
    expect(db.rpcs.some((r) => r.fn === 'arc_claim_sign_in_name')).toBe(false);
    expect(db.on('users', 'insert')).toHaveLength(1);
  });

  it('suggests ready-made names for a taken typed name, never the typed name', async () => {
    db = poolDatabase({ takenName: 'Lily' });
    const check = await json(await handler(post({ username: 'Lily', checkOnly: true })));
    expect(check).toEqual({ available: false, suggestions: OFFERED });

    const res = await handler(post(signupBody({ username: 'Lily' })));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.suggestions).toEqual(OFFERED);
    for (const s of [...(check.suggestions as string[]), ...(body.suggestions as string[])]) {
      expect(s.toLowerCase()).not.toContain('lily');
    }
  });
});
