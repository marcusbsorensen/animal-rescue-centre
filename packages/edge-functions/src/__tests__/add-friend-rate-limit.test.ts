import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import type { PGliteInterface } from '@electric-sql/pglite';
import { FakeSupabase, type Query, type Responder, type Result, type RpcResponder } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, setEnv, post, json, type Handler } from '../support/harness';
import { migratedDatabase } from '../support/postgres';

/**
 * add-friend counts MISSES ONLY, by account and by address.
 *
 * A join code is WORD-NNN: 20 words times 900 numbers, 18,000 codes. A
 * miss answers 404 and a hit makes the caller a friend of whoever holds
 * the code, so without a limit anyone could try them all.
 *
 * Both buckets are read (peeked) before the lookup and charged (bumped)
 * only when the code turns out to be nobody's. A real code costs nothing:
 * the address bucket is shared by everyone behind one connection, and a
 * class of thirty children swapping real codes would otherwise lock each
 * other out. Someone sweeping the code space misses almost every time, so
 * 20 misses per 15 minutes still costs them about nine days for 18,000.
 *
 * No migration backs this: `rate_limits` and its functions (00007-00009)
 * take any key, and a new limit is a new key prefix. The second half runs
 * the real limiter in Postgres, to prove the keys this function writes are
 * ones the table accepts (00012 refuses an `-ip:` key that is not a
 * 64-character hash, which would fail every request closed) and that the
 * limit behaves as described.
 */

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const IP = '203.0.113.7';
// A test value, not a real secret.
const SECRET = 'test-only-address-key-0123456789abcdef0123456789abcdef';
const hmac = (ip: string) => createHmac('sha256', SECRET).update(ip).digest('hex');

const accountId = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ME = accountId(0xa1);
const FRIEND = accountId(0xb2);
const CODE = 'FOX-428';

const MAX = 20;
const WINDOW_MS = 15 * 60 * 1000;

/** Session tokens handed out by `signIn`, and who each one is. */
const sessions = new Map<string, string>();

function signIn(userId: string): { headers: Record<string, string> } {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, userId);
  return { headers: { 'x-arc-session': token } };
}

/**
 * What the tables hold. `friend` is who the code belongs to: a real
 * player (`other`), the caller (`me`), or nobody. `alreadyFriends` says
 * the caller has added that player before.
 */
interface World {
  friend?: 'other' | 'me' | 'nobody';
  alreadyFriends?: boolean;
}

function answers(world: World = {}): Responder {
  const { friend = 'nobody', alreadyFriends = false } = world;
  return (q: Query) => {
    if (q.table === 'sessions' && q.op === 'select') {
      const token = q.filters.find((f) => f.column === 'token')?.value as string;
      const userId = sessions.get(token);
      return userId
        ? { data: { token, user_id: userId, expires_at: new Date(Date.now() + 3_600_000).toISOString() }, error: null }
        : { data: null, error: { message: 'no rows' } };
    }
    if (q.table === 'users' && q.op === 'select' && friend !== 'nobody') {
      // The fake answers whatever was asked for. Callers in these tests
      // that mean to be "me" sign in as ME.
      return {
        data: {
          id: friend === 'me' ? ME : FRIEND,
          display_name: 'MossyOtter', avatar_emoji: '🦊', avatar_bg_colour: '#ffd0a0',
        },
        error: null,
      };
    }
    if (q.table === 'friendships' && q.op === 'select' && alreadyFriends) {
      return { data: { user_id: ME }, error: null };
    }
    return undefined;
  };
}

/** A limiter whose peek refuses every key `refuses` picks out. */
function peekRefusing(refuses: (key: string) => boolean): RpcResponder {
  return (fn, args) =>
    fn === 'peek_rate_limit' && refuses(String(args.p_key))
      ? { data: [{ allowed: false, retry_after_ms: 540_000 }], error: null }
      : undefined;
}

const peeks = (db: FakeSupabase) => db.rpcs.filter((r) => r.fn === 'peek_rate_limit').map((r) => r.args);
const bumps = (db: FakeSupabase) => db.rpcs.filter((r) => r.fn === 'bump_rate_limit').map((r) => r.args);
/** Every call to a rate-limit function, whichever it was. */
const limiterCalls = (db: FakeSupabase) => db.rpcs.filter((r) => r.fn.endsWith('_rate_limit'));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('add-friend: rate limits count misses only', () => {
  let handler: Handler;

  beforeAll(async () => {
    handler = await loadFunction(() => import('../../../../supabase/functions/add-friend/index.ts'));
  });

  beforeEach(() => {
    setEnv({ RATE_LIMIT_ADDRESS_KEY: SECRET });
  });

  /** ME, from IP, adds CODE. */
  const tryCode = (opts: { ip?: string | null } = {}) =>
    handler(post({ joinCode: CODE }, { ip: opts.ip === undefined ? IP : opts.ip, ...signIn(ME) }));

  it('reads both buckets, 20 each, before it looks anyone up', async () => {
    const db = useFakeSupabase(new FakeSupabase(answers({ friend: 'other' })));
    await tryCode();
    expect(peeks(db)).toEqual([
      { p_key: `add-friend:${ME}`, p_max: MAX },
      { p_key: `add-friend-ip:${hmac(IP)}`, p_max: MAX },
    ]);
  });

  it('charges neither bucket for a real code, and adds the friend', async () => {
    const db = useFakeSupabase(new FakeSupabase(answers({ friend: 'other' })));
    const res = await tryCode();
    expect(res.status).toBe(200);
    expect(db.on('friendships', 'insert')).toHaveLength(1);
    expect(bumps(db)).toEqual([]);
    expect(db.rpcs.map((r) => r.fn)).not.toContain('check_rate_limit');
  });

  it('charges neither bucket for the caller\'s own code', async () => {
    const db = useFakeSupabase(new FakeSupabase(answers({ friend: 'me' })));
    const res = await tryCode();
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('own_code');
    expect(bumps(db)).toEqual([]);
  });

  it('charges neither bucket for a friend who was added already', async () => {
    const db = useFakeSupabase(new FakeSupabase(answers({ friend: 'other', alreadyFriends: true })));
    const res = await tryCode();
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('already_friends');
    expect(bumps(db)).toEqual([]);
  });

  it('charges both buckets, 15 minutes each, for a code nobody holds', async () => {
    const db = useFakeSupabase(new FakeSupabase(answers({ friend: 'nobody' })));
    const res = await tryCode();
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('not_found');
    expect(bumps(db)).toEqual([
      { p_key: `add-friend:${ME}`, p_window_ms: WINDOW_MS },
      { p_key: `add-friend-ip:${hmac(IP)}`, p_window_ms: WINDOW_MS },
    ]);
  });

  it('answers 429 too_many_tries when the account is already over, before any lookup', async () => {
    const db = useFakeSupabase(new FakeSupabase(
      answers({ friend: 'other' }),
      peekRefusing((k) => k.startsWith('add-friend:')),
    ));
    const res = await tryCode();
    expect(res.status).toBe(429);
    expect(await json(res)).toEqual({ error: 'Too many tries', code: 'too_many_tries', retryAfterMs: 540_000 });
    expect(db.on('users')).toEqual([]);
    expect(db.on('friendships')).toEqual([]);
    expect(db.on('audit_log')).toEqual([]);
    // Turned away costs nothing more: the window runs out on its own.
    expect(bumps(db)).toEqual([]);
  });

  it('answers 429 too_many_tries when the address is already over, before any lookup', async () => {
    const db = useFakeSupabase(new FakeSupabase(
      answers({ friend: 'other' }),
      peekRefusing((k) => k.startsWith('add-friend-ip:')),
    ));
    // The account is fresh and the code is a real one: only the address
    // says no, and the friendship must not be made.
    const res = await tryCode();
    expect(res.status).toBe(429);
    expect(await json(res)).toEqual({ error: 'Too many tries', code: 'too_many_tries', retryAfterMs: 540_000 });
    expect(db.on('users')).toEqual([]);
    expect(db.on('friendships')).toEqual([]);
    expect(db.on('audit_log')).toEqual([]);
    expect(bumps(db)).toEqual([]);
  });

  it('refuses, and looks nobody up, when the limiter cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = useFakeSupabase(new FakeSupabase(
      answers({ friend: 'other' }),
      (fn) => (fn === 'peek_rate_limit' ? { data: null, error: { message: 'boom' } } : undefined),
    ));
    const res = await tryCode();
    expect(res.status).toBe(429);
    expect(db.on('users')).toEqual([]);
    expect(db.on('friendships', 'insert')).toEqual([]);
  });

  it('touches the limiter not at all for a request that is not a join code', async () => {
    for (const joinCode of ['', 'FOX428', 'FOX-4281', 'F0X-428', 'FOX-42', 42, null]) {
      const db = useFakeSupabase(new FakeSupabase(answers({ friend: 'nobody' })));
      const res = await handler(post({ joinCode }, { ip: IP, ...signIn(ME) }));
      expect(res.status, String(joinCode)).toBe(400);
      expect(limiterCalls(db), String(joinCode)).toEqual([]);
    }
  });

  it('touches the limiter not at all for a caller with no session', async () => {
    const db = useFakeSupabase(new FakeSupabase(answers({ friend: 'nobody' })));
    const res = await handler(post({ joinCode: CODE }, { ip: IP }));
    expect(res.status).toBe(401);
    expect(limiterCalls(db)).toEqual([]);
  });

  it('counts only the account when the request carries no address, and still answers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = useFakeSupabase(new FakeSupabase(answers({ friend: 'nobody' })));
    const res = await tryCode({ ip: null });
    expect(res.status).toBe(404);
    expect(peeks(db).map((a) => a.p_key)).toEqual([`add-friend:${ME}`]);
    expect(bumps(db).map((a) => a.p_key)).toEqual([`add-friend:${ME}`]);
  });

  it('counts only the account when no address secret is set, and still answers', async () => {
    setEnv({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = useFakeSupabase(new FakeSupabase(answers({ friend: 'nobody' })));
    const res = await tryCode();
    expect(res.status).toBe(404);
    expect(peeks(db).map((a) => a.p_key)).toEqual([`add-friend:${ME}`]);
    expect(bumps(db).map((a) => a.p_key)).toEqual([`add-friend:${ME}`]);
  });
});

const SQL: Record<string, { sql: string; params: (a: Record<string, unknown>) => unknown[] }> = {
  check_rate_limit: {
    sql: 'select * from check_rate_limit($1, $2, $3)',
    params: (a) => [a.p_key, a.p_max, a.p_window_ms],
  },
  peek_rate_limit: {
    sql: 'select * from peek_rate_limit($1, $2)',
    params: (a) => [a.p_key, a.p_max],
  },
  bump_rate_limit: {
    sql: 'select * from bump_rate_limit($1, $2)',
    params: (a) => [a.p_key, a.p_window_ms],
  },
};

/** The rate-limit functions answered by the real ones, in Postgres. */
class LimiterOnPostgres extends FakeSupabase {
  constructor(private readonly pg: PGliteInterface, respond: Responder) {
    super(respond);
  }

  override async rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result> {
    this.rpcs.push({ fn, args });
    const call = SQL[fn];
    if (!call) return { data: null, error: null };
    try {
      const { rows } = await this.pg.query(call.sql, call.params(args));
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: { message: (err as Error).message } };
    }
  }
}

describe('add-friend: rate limits against the real limiter', () => {
  let handler: Handler;
  let pg: PGliteInterface;

  beforeAll(async () => {
    handler = await loadFunction(() => import('../../../../supabase/functions/add-friend/index.ts'));
  });

  beforeEach(async () => {
    setEnv({ RATE_LIMIT_ADDRESS_KEY: SECRET });
    pg = await migratedDatabase();
    use({ friend: 'nobody' });
  });

  const use = (world: World) => useFakeSupabase(new LimiterOnPostgres(pg, answers(world)));

  const keysInTable = async () =>
    (await pg.query<{ key: string }>('select key from rate_limits')).rows.map((r) => r.key).sort();

  /** `account` adds CODE from `ip`. */
  const tryCode = (account: string, ip: string) =>
    handler(post({ joinCode: CODE }, { ip, ...signIn(account) }));

  it('writes keys that rate_limits accepts, so the limiter does not fail closed', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await tryCode(ME, IP);
    // 404: nobody holds the code, so the miss was charged to both buckets.
    expect(res.status).toBe(404);
    expect(errors).not.toHaveBeenCalled();
    const keys = await keysInTable();
    expect(keys).toEqual([`add-friend-ip:${hmac(IP)}`, `add-friend:${ME}`].sort());
    // 00012's rule, as written there.
    for (const key of keys) {
      expect(!/-ip:/.test(key) || /-ip:[0-9a-f]{64}$/.test(key), key).toBe(true);
    }
    expect(keys.join(' ')).not.toContain(IP);
  });

  it('allows 20 misses from one address and refuses the 21st, whatever accounts they come from', async () => {
    for (let n = 1; n <= MAX; n++) {
      const res = await tryCode(accountId(n), IP);
      expect(res.status, `miss ${n}`).toBe(404);
    }
    const res = await tryCode(accountId(100), IP);
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.code).toBe('too_many_tries');
    expect(body.retryAfterMs).toBeGreaterThan(0);
    expect(body.retryAfterMs).toBeLessThanOrEqual(WINDOW_MS);

    // Another address is untouched by it.
    const elsewhere = await tryCode(accountId(100), '198.51.100.9');
    expect(elsewhere.status).toBe(404);
  });

  it('allows 20 misses from one account and refuses the 21st, whatever addresses they come from', async () => {
    const asMe = signIn(ME);
    for (let n = 1; n <= MAX; n++) {
      const res = await handler(post({ joinCode: CODE }, { ip: `192.0.2.${n}`, ...asMe }));
      expect(res.status, `miss ${n}`).toBe(404);
    }
    const res = await handler(post({ joinCode: CODE }, { ip: '192.0.2.99', ...asMe }));
    expect(res.status).toBe(429);
    expect((await json(res)).code).toBe('too_many_tries');
  });

  it('is not touched by 30 children on one connection each adding a real code', async () => {
    // The classroom: thirty children, one address, thirty real codes. That
    // is more than the 20 the limit allows, and none of it is charged.
    use({ friend: 'other' });
    for (let n = 1; n <= 30; n++) {
      const res = await tryCode(accountId(n), IP);
      expect(res.status, `add ${n}`).toBe(200);
    }
    expect(await keysInTable()).toEqual([]);

    // The address still has its whole budget: 20 misses, then the 21st.
    use({ friend: 'nobody' });
    for (let n = 1; n <= MAX; n++) {
      const res = await tryCode(accountId(100 + n), IP);
      expect(res.status, `miss ${n}`).toBe(404);
    }
    expect((await tryCode(accountId(200), IP)).status).toBe(429);
  });

  it('is not touched by one child adding 30 real codes either', async () => {
    use({ friend: 'other' });
    const asMe = signIn(ME);
    for (let n = 1; n <= 30; n++) {
      const res = await handler(post({ joinCode: CODE }, { ip: IP, ...asMe }));
      expect(res.status, `add ${n}`).toBe(200);
    }
    expect(await keysInTable()).toEqual([]);
  });

  it('leaves no account key behind when the account is deleted', async () => {
    const { rows } = await pg.query<{ id: string }>(
      `insert into users (username, pin_hash, avatar_emoji, avatar_bg_colour, join_code)
       values ('Ada', 'salt:hash', '🦊', '#ffd0a0', 'FOX-111') returning id`,
    );
    const ada = rows[0].id;
    // A miss, which is what writes the key.
    expect((await tryCode(ada, IP)).status).toBe(404);
    expect(await keysInTable()).toContain(`add-friend:${ada}`);

    await pg.query('select delete_account($1)', [ada]);
    const left = await keysInTable();
    expect(left.filter((k) => k.includes(ada))).toEqual([]);
    // The address key names nobody; it is shared and expires on its own.
    expect(left).toEqual([`add-friend-ip:${hmac(IP)}`]);
  });
});
