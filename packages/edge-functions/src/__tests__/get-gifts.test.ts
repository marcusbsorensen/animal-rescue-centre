import { describe, it, expect, beforeAll } from 'vitest';
import { FakeSupabase, hasEq, type Query } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, post, json, type Handler } from '../support/harness';

/**
 * get-gifts: the gifts waiting for the account the session belongs to.
 *
 * This read is why gifts looked like they never arrived. It used to happen
 * in the browser with the public key, against a rule of
 * `to_user = auth.uid()`; ARC's sessions are its own, so auth.uid() was null
 * and every inbox was empty. These pin the two things that fix is made of:
 * the account comes from the session and never from the body, and the reply
 * carries only what the sender lets another player see.
 */

let handler: Handler;

const TOKEN = 'b'.repeat(64);
const ME = '00000000-0000-4000-8000-0000000000a1';
const SOMEONE_ELSE = '00000000-0000-4000-8000-0000000000c3';

beforeAll(async () => {
  handler = await loadFunction(() => import('../../../../supabase/functions/get-gifts/index.ts'));
});

function signedIn(rows: unknown[] = []): FakeSupabase {
  return new FakeSupabase((q: Query) => {
    if (q.table === 'sessions' && q.op === 'select') {
      return {
        data: { token: TOKEN, user_id: ME, expires_at: new Date(Date.now() + 3_600_000).toISOString() },
        error: null,
      };
    }
    if (q.table === 'gifts' && q.op === 'select') return { data: rows, error: null };
    return undefined;
  });
}

const asMe = { headers: { 'x-arc-session': TOKEN } };

describe('get-gifts', () => {
  it('refuses a caller with no session, and reads no gifts', async () => {
    const db = useFakeSupabase(new FakeSupabase());
    const res = await handler(post({}));
    expect(res.status).toBe(401);
    expect(db.on('gifts')).toEqual([]);
  });

  it("reads the session's own inbox, whatever the body says", async () => {
    const db = useFakeSupabase(signedIn());
    const res = await handler(post({ userId: SOMEONE_ELSE }, asMe));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ gifts: [] });
    const [read] = db.on('gifts', 'select');
    expect(hasEq(read, 'to_user', ME)).toBe(true);
    expect(JSON.stringify(db.queries)).not.toContain(SOMEONE_ELSE);
  });

  it('gives the sender by display name and avatar, never the name they typed', async () => {
    const db = useFakeSupabase(signedIn([
      // The fake answers whatever was asked for; a username here would only
      // reach the reply if the function passed it on.
      {
        id: 'g1', gift_type: 'toy', message_preset_code: 'hello', sent_at: '2026-10-12T10:00:00Z',
        sender: { username: 'Amelia Jones', display_name: 'SunnyHare', avatar_emoji: '🐶' },
      },
    ]));
    const res = await handler(post({}, asMe));
    expect(await json(res)).toEqual({
      gifts: [{
        id: 'g1', fromDisplayName: 'SunnyHare', fromAvatarEmoji: '🐶',
        giftType: 'toy', messagePresetCode: 'hello', sentAt: '2026-10-12T10:00:00Z',
      }],
    });
    const [read] = db.on('gifts', 'select');
    expect(read.columns).toContain('display_name');
    expect(read.columns).not.toMatch(/\busername\b/);
    expect(read.columns).not.toMatch(/join_code|pin/);
  });

  it('names a sender whose account has gone, rather than dropping the gift', async () => {
    // The gift is still the child's to open. A sender who deleted their
    // account between the two reads must not make it disappear.
    useFakeSupabase(signedIn([
      { id: 'g2', gift_type: 'treat', message_preset_code: 'thanks', sent_at: '2026-10-12T11:00:00Z', sender: null },
    ]));
    const res = await handler(post({}, asMe));
    const body = await json(res) as { gifts: Array<Record<string, unknown>> };
    expect(body.gifts).toHaveLength(1);
    expect(body.gifts[0].fromDisplayName).toBe('Unknown');
    expect(body.gifts[0].fromAvatarEmoji).toBe('🐾');
  });
});
