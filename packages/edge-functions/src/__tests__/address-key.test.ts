import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { FakeSupabase } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, setEnv, post, type Handler } from '../support/harness';
import { addressKey } from '../../../../supabase/functions/_shared/rate-limit.ts';

/**
 * Rate limits by address keep a keyed hash of the address, never the
 * address. `rate_limits` rows used to be `login-ip:203.0.113.7` and so
 * on, and nothing swept them, so a child's IP address sat in the table
 * long after its window closed.
 */

const IP = '203.0.113.7';
// A test value, not a real secret.
const SECRET = 'test-only-address-key-0123456789abcdef0123456789abcdef';
const hmac = (secret: string, ip: string) => createHmac('sha256', secret).update(ip).digest('hex');

describe('addressKey', () => {
  beforeEach(async () => {
    await loadFunction(() => import('../../../../supabase/functions/login/index.ts'));
  });

  it('is the HMAC-SHA-256 of the address under RATE_LIMIT_ADDRESS_KEY', async () => {
    setEnv({ RATE_LIMIT_ADDRESS_KEY: SECRET });
    const key = await addressKey(post({}, { ip: IP }));
    expect(key).toBe(hmac(SECRET, IP));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives the same address the same key, and another secret another key', async () => {
    setEnv({ RATE_LIMIT_ADDRESS_KEY: SECRET });
    const a = await addressKey(post({}, { ip: IP }));
    const b = await addressKey(post({}, { ip: IP }));
    setEnv({ RATE_LIMIT_ADDRESS_KEY: SECRET.replace('test', 'tset') });
    const c = await addressKey(post({}, { ip: IP }));
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('is null with no secret, or one too short to be a key, so address limits are skipped', async () => {
    setEnv({});
    expect(await addressKey(post({}, { ip: IP }))).toBeNull();
    setEnv({ RATE_LIMIT_ADDRESS_KEY: 'short' });
    expect(await addressKey(post({}, { ip: IP }))).toBeNull();
  });

  it('is null when the request carries no address', async () => {
    setEnv({ RATE_LIMIT_ADDRESS_KEY: SECRET });
    expect(await addressKey(post({}, { ip: null }))).toBeNull();
  });
});

/** Every function with an address limit, and a request that reaches it. */
const CASES: Array<{
  name: string;
  load: () => Promise<unknown>;
  body: unknown;
  headers?: Record<string, string>;
  prefixes: string[];
  db?: () => FakeSupabase;
}> = [
  {
    name: 'signup',
    load: () => import('../../../../supabase/functions/signup/index.ts'),
    body: { username: 'Bramble', pin: '4821', avatarEmoji: '🦊', avatarBgColour: '#ffd0a0' },
    prefixes: ['signup-ip:', 'signup-create-ip:'],
    db: () => new FakeSupabase((q) =>
      q.table === 'users' && q.op === 'insert'
        ? { data: { id: 'u1', username: 'Bramble', avatar_emoji: '🦊', avatar_bg_colour: '#ffd0a0', join_code: 'FOX-428' }, error: null }
        : undefined),
  },
  {
    name: 'login',
    load: () => import('../../../../supabase/functions/login/index.ts'),
    body: { username: 'Nobody', pin: '1234' },
    prefixes: ['login-ip:'],
  },
  {
    name: 'get-pin-hint',
    load: () => import('../../../../supabase/functions/get-pin-hint/index.ts'),
    body: { username: 'Bramble' },
    prefixes: ['hint-ip:'],
  },
  {
    name: 'send-gift',
    load: () => import('../../../../supabase/functions/send-gift/index.ts'),
    body: { toUserId: 'friend', giftType: 'toy', messagePresetCode: 'hello' },
    headers: { 'x-arc-session': 'a'.repeat(64) },
    prefixes: ['gift-ip:'],
    db: () => new FakeSupabase((q) =>
      q.table === 'sessions' && q.op === 'select'
        ? { data: { token: 'a'.repeat(64), user_id: 'me', expires_at: new Date(Date.now() + 3_600_000).toISOString() }, error: null }
        : undefined),
  },
  {
    name: 'add-friend',
    load: () => import('../../../../supabase/functions/add-friend/index.ts'),
    body: { joinCode: 'FOX-428' },
    headers: { 'x-arc-session': 'a'.repeat(64) },
    prefixes: ['add-friend-ip:'],
    db: () => new FakeSupabase((q) =>
      q.table === 'sessions' && q.op === 'select'
        ? { data: { token: 'a'.repeat(64), user_id: 'me', expires_at: new Date(Date.now() + 3_600_000).toISOString() }, error: null }
        : undefined),
  },
];

describe.each(CASES)('$name: address limits', ({ load, body, headers, prefixes, db }) => {
  let handler: Handler;

  beforeEach(async () => {
    handler = await loadFunction(load);
  });

  it('keys the address limit by the HMAC of the address, never the address', async () => {
    setEnv({ RATE_LIMIT_ADDRESS_KEY: SECRET });
    const fake = useFakeSupabase(db ? db() : new FakeSupabase());
    await handler(post(body, { ip: IP, headers }));

    const keys = fake.rateLimitKeys();
    expect(keys.join(' ')).not.toContain(IP);
    for (const prefix of prefixes) {
      expect(keys).toContain(`${prefix}${hmac(SECRET, IP)}`);
    }
  });

  it('skips the address limit, and still answers, with no secret set', async () => {
    setEnv({});
    const fake = useFakeSupabase(db ? db() : new FakeSupabase());
    const res = await handler(post(body, { ip: IP, headers }));
    expect(res.status).toBeLessThan(500);
    expect(fake.rateLimitKeys().filter((k) => k.includes('-ip:'))).toEqual([]);
  });
});
