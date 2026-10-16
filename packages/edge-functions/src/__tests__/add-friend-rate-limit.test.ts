import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import type { PGliteInterface } from '@electric-sql/pglite';
import { FakeSupabase, type Query, type Responder, type Result, type RpcResponder } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, setEnv, post, json, type Handler } from '../support/harness';
import { migratedDatabase } from '../support/postgres';

/**
 * add-friend counts every lookup against the account and against the
 * address, before it looks anyone up.
 *
 * A join code is WORD-NNN: 20 words times 900 numbers, 18,000 codes. A
 * miss answers 404 and a hit makes the caller a friend of whoever holds
 * the code, so without a limit anyone could try them all. The address
 * limit is the defence; the account limit only tidies up.
 *
 * No migration backs this: `rate_limits` and its functions (00007-00009)
 * take any key, and a new limit is a new key prefix. The second half runs
 * the real limiter in Postgres to prove the keys this function writes are
 * ones the table accepts (00012 refuses an `-ip:` key that is not a
 * 64-character hash, which would fail every request closed).
 */

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const IP = '203.0.113.7';
// A test value, not a real secret.
const SECRET = 'test-only-address-key-0123456789abcdef0123456789abcdef';
const hmac = (ip: string) => createHmac('sha256', SECRET).update(ip).digest('hex');

const ME = '00000000-0000-4000-8000-0000000000a1';
const FRIEND = '00000000-0000-4000-8000-0000000000b2';
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

/** The tables as a signed-in player sees them; `friendExists` is a real code. */
function answers(opts: { friendExists?: boolean } = {}): Responder {
  return (q: Query) => {
    if (q.table === 'sessions' && q.op === 'select') {
      const token = q.filters.find((f) => f.column === 'token')?.value as string;
      const userId = sessions.get(token);
      return userId
        ? { data: { token, user_id: userId, expires_at: new Date(Date.now() + 3_600_000).toISOString() }, error: null }
        : { data: null, error: { message: 'no rows' } };
    }
    if (q.table === 'users' && q.op === 'select' && opts.friendExists) {
      return {
        data: { id: FRIEND, display_name: 'MossyOtter', avatar_emoji: '🦊', avatar_bg_colour: '#ffd0a0' },
        error: null,
      };
    }
    return undefined;
  };
}

/** A limiter that refuses every key `refuses` picks out, and allows the rest. */
function refusing(refuses: (key: string) => boolean): RpcResponder {
  return (fn, args) =>
    fn === 'check_rate_limit' && refuses(String(args.p_key))
      ? { data: [{ allowed: false, retry_after_ms: 540_000 }], error: null }
      : undefined;
}

const limitCalls = (db: FakeSupabase) => db.rpcs.filter((r) => r.fn === 'check_rate_limit');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('add-friend: rate limits', () => {
  let handler: Handler;

  beforeAll(async () => {
    handler = await loadFunction(() => import('../../../../supabase/functions/add-friend/index.ts'));
  });

  beforeEach(() => {
    setEnv({ RATE_LIMIT_ADDRESS_KEY: SECRET });
  });

  it('spends one try from the account and one from the address, 20 per 15 minutes each', async () => {
    const db = useFakeSupabase(new FakeSupabase(answers({ friendExists: true })));
    const res = await handler(post({ joinCode: CODE }, { ip: IP, ...signIn(ME) }));
    expect(res.status).toBe(200);
    expect(limitCalls(db).map((r) => r.args)).toEqual([
      { p_key: `add-friend:${ME}`, p_max: MAX, p_window_ms: WINDOW_MS },
      { p_key: `add-friend-ip:${hmac(IP)}`, p_max: MAX, p_window_ms: WINDOW_MS },
    ]);
  });

  it('spends a try on a code nobody holds, so guessing costs as much as finding', async () => {
    const db = useFakeSupabase(new FakeSupabase(answers({ friendExists: false })));
    const res = await handler(post({ joinCode: CODE }, { ip: IP, ...signIn(ME) }));
    expect(res.status).toBe(404);
    expect(db.rateLimitKeys()).toEqual([`add-friend:${ME}`, `add-friend-ip:${hmac(IP)}`]);
  });

  it('answers 429 too_many_tries once the account has used its tries, before any lookup', async () => {
    const db = useFakeSupabase(new FakeSupabase(
      answers({ friendExists: true }),
      refusing((k) => k.startsWith('add-friend:')),
    ));
    const res = await handler(post({ joinCode: CODE }, { ip: IP, ...signIn(ME) }));
    expect(res.status).toBe(429);
    expect(await json(res)).toEqual({ error: 'Too many tries', code: 'too_many_tries', retryAfterMs: 540_000 });
    expect(db.on('users')).toEqual([]);
    expect(db.on('friendships')).toEqual([]);
    // The account is refused first, so it does not spend the household's
    // address budget on tries it was never going to be let make.
    expect(db.rateLimitKeys()).toEqual([`add-friend:${ME}`]);
  });

  it('answers 429 too_many_tries once the address has used its tries, and adds no friend', async () => {
    const db = useFakeSupabase(new FakeSupabase(
      answers({ friendExists: true }),
      refusing((k) => k.startsWith('add-friend-ip:')),
    ));
    // The account is fresh and the code is a real one: only the address
    // says no, and the friendship must not be made.
    const res = await handler(post({ joinCode: CODE }, { ip: IP, ...signIn(ME) }));
    expect(res.status).toBe(429);
    expect(await json(res)).toEqual({ error: 'Too many tries', code: 'too_many_tries', retryAfterMs: 540_000 });
    expect(db.on('users')).toEqual([]);
    expect(db.on('friendships', 'insert')).toEqual([]);
    expect(db.on('audit_log')).toEqual([]);
  });

  it('spends nothing on a request that is not a join code', async () => {
    for (const joinCode of ['', 'FOX428', 'FOX-4281', 'F0X-428', 'FOX-42', 42, null]) {
      const db = useFakeSupabase(new FakeSupabase(answers({ friendExists: true })));
      const res = await handler(post({ joinCode }, { ip: IP, ...signIn(ME) }));
      expect(res.status, String(joinCode)).toBe(400);
      expect(db.rateLimitKeys(), String(joinCode)).toEqual([]);
    }
  });

  it('spends nothing for a caller with no session', async () => {
    const db = useFakeSupabase(new FakeSupabase(answers({ friendExists: true })));
    const res = await handler(post({ joinCode: CODE }, { ip: IP }));
    expect(res.status).toBe(401);
    expect(db.rateLimitKeys()).toEqual([]);
  });

  it('counts only the account when the request carries no address, and still answers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = useFakeSupabase(new FakeSupabase(answers({ friendExists: true })));
    const res = await handler(post({ joinCode: CODE }, { ip: null, ...signIn(ME) }));
    expect(res.status).toBe(200);
    expect(db.rateLimitKeys()).toEqual([`add-friend:${ME}`]);
  });

  it('counts only the account when no address secret is set, and still answers', async () => {
    setEnv({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = useFakeSupabase(new FakeSupabase(answers({ friendExists: true })));
    const res = await handler(post({ joinCode: CODE }, { ip: IP, ...signIn(ME) }));
    expect(res.status).toBe(200);
    expect(db.rateLimitKeys()).toEqual([`add-friend:${ME}`]);
  });
});

/** `check_rate_limit` answered by the real function in Postgres. */
class LimiterOnPostgres extends FakeSupabase {
  constructor(private readonly pg: PGliteInterface, respond: Responder) {
    super(respond);
  }

  override async rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result> {
    this.rpcs.push({ fn, args });
    if (fn !== 'check_rate_limit') return { data: null, error: null };
    try {
      const { rows } = await this.pg.query(
        'select * from check_rate_limit($1, $2, $3)',
        [args.p_key, args.p_max, args.p_window_ms],
      );
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
    useFakeSupabase(new LimiterOnPostgres(pg, answers()));
  });

  const keysInTable = async () =>
    (await pg.query<{ key: string }>('select key from rate_limits')).rows.map((r) => r.key).sort();

  it('writes keys that rate_limits accepts, so the limiter does not fail closed', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handler(post({ joinCode: CODE }, { ip: IP, ...signIn(ME) }));
    // 404: nobody holds the code, and the request got as far as the lookup.
    expect(res.status).toBe(404);
    expect(errors).not.toHaveBeenCalled();
    expect(await keysInTable()).toEqual([`add-friend-ip:${hmac(IP)}`, `add-friend:${ME}`].sort());
  });

  it('refuses the 21st try from one address, however many accounts it comes from', async () => {
    for (let n = 1; n <= MAX; n++) {
      const account = `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
      const res = await handler(post({ joinCode: CODE }, { ip: IP, ...signIn(account) }));
      expect(res.status, `try ${n}`).toBe(404);
    }
    const res = await handler(post({ joinCode: CODE }, { ip: IP, ...signIn(FRIEND) }));
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.code).toBe('too_many_tries');
    expect(body.retryAfterMs).toBeGreaterThan(0);
    expect(body.retryAfterMs).toBeLessThanOrEqual(WINDOW_MS);

    // Another address is untouched by it.
    const elsewhere = await handler(post({ joinCode: CODE }, { ip: '198.51.100.9', ...signIn(FRIEND) }));
    expect(elsewhere.status).toBe(404);
  });

  it('refuses the 21st try from one account, however many addresses it comes from', async () => {
    const asMe = signIn(ME);
    for (let n = 1; n <= MAX; n++) {
      const res = await handler(post({ joinCode: CODE }, { ip: `192.0.2.${n}`, ...asMe }));
      expect(res.status, `try ${n}`).toBe(404);
    }
    const res = await handler(post({ joinCode: CODE }, { ip: '192.0.2.99', ...asMe }));
    expect(res.status).toBe(429);
    expect((await json(res)).code).toBe('too_many_tries');
  });

  it('leaves no account key behind when the account is deleted', async () => {
    const { rows } = await pg.query<{ id: string }>(
      `insert into users (username, pin_hash, avatar_emoji, avatar_bg_colour, join_code)
       values ('Ada', 'salt:hash', '🦊', '#ffd0a0', 'FOX-111') returning id`,
    );
    const ada = rows[0].id;
    await handler(post({ joinCode: CODE }, { ip: IP, ...signIn(ada) }));
    expect(await keysInTable()).toContain(`add-friend:${ada}`);

    await pg.query('select delete_account($1)', [ada]);
    const left = await keysInTable();
    expect(left.filter((k) => k.includes(ada))).toEqual([]);
    // The address key names nobody; it is shared and expires on its own.
    expect(left).toEqual([`add-friend-ip:${hmac(IP)}`]);
  });
});
