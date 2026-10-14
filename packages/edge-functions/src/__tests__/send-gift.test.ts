import { describe, it, expect, beforeAll } from 'vitest';
import { FakeSupabase, type Query } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, post, type Handler } from '../support/harness';

let handler: Handler;

const TOKEN = 'a'.repeat(64);
const SENDER = '00000000-0000-4000-8000-0000000000a1';
const FRIEND = '00000000-0000-4000-8000-0000000000b2';

beforeAll(async () => {
  handler = await loadFunction(() => import('../../../../supabase/functions/send-gift/index.ts'));
});

/** A signed-in sender who is friends with FRIEND. */
function signedInWithFriend(): FakeSupabase {
  return new FakeSupabase((q: Query) => {
    if (q.table === 'sessions' && q.op === 'select') {
      return {
        data: { token: TOKEN, user_id: SENDER, expires_at: new Date(Date.now() + 3_600_000).toISOString() },
        error: null,
      };
    }
    if (q.table === 'friendships') return { data: { user_id: SENDER }, error: null };
    if (q.table === 'gifts' && q.op === 'insert') {
      return {
        data: { id: 'g1', gift_type: 'toy', message_preset_code: 'hello', sent_at: '2026-10-11T10:00:00Z' },
        error: null,
      };
    }
    return undefined;
  });
}

const giftBody = { toUserId: FRIEND, giftType: 'toy', messagePresetCode: 'hello' };

describe('send-gift', () => {
  it('refuses a caller with no session', async () => {
    const db = useFakeSupabase(new FakeSupabase());
    const res = await handler(post(giftBody));
    expect(res.status).toBe(401);
    expect(db.on('gifts')).toHaveLength(0);
  });

  it('sends a preset gift to a friend', async () => {
    const db = useFakeSupabase(signedInWithFriend());
    const res = await handler(post(giftBody, { headers: { 'x-arc-session': TOKEN } }));
    expect(res.status).toBe(200);
    const [insert] = db.on('gifts', 'insert');
    expect(insert.values).toMatchObject({ from_user: SENDER, to_user: FRIEND, message_preset_code: 'hello' });
  });

  it('refuses a gift type that is not on the list', async () => {
    useFakeSupabase(signedInWithFriend());
    const res = await handler(post({ ...giftBody, giftType: 'note' }, { headers: { 'x-arc-session': TOKEN } }));
    expect(res.status).toBe(400);
  });
});
