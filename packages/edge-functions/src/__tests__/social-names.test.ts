import { describe, it, expect, beforeAll } from 'vitest';
import { FakeSupabase, type Query } from '../support/fake-supabase';
import { loadFunction, useFakeSupabase, post, json, type Handler } from '../support/harness';

/**
 * What one player learns about another: the display name made from the
 * word lists (MossyOtter), never the name the other child typed, which
 * is their login.
 */

const TOKEN = 'a'.repeat(64);
const ME = '00000000-0000-4000-8000-0000000000a1';
const FRIEND = '00000000-0000-4000-8000-0000000000b2';

function signedIn(respond: (q: Query) => { data: unknown; error: unknown } | undefined): FakeSupabase {
  return new FakeSupabase((q: Query) => {
    if (q.table === 'sessions' && q.op === 'select') {
      return {
        data: { token: TOKEN, user_id: ME, expires_at: new Date(Date.now() + 3_600_000).toISOString() },
        error: null,
      };
    }
    return respond(q);
  });
}

const asMe = { headers: { 'x-arc-session': TOKEN } };

describe('add-friend', () => {
  let handler: Handler;
  beforeAll(async () => {
    handler = await loadFunction(() => import('../../../../supabase/functions/add-friend/index.ts'));
  });

  it("returns the friend's display name, and not the name they typed", async () => {
    const db = useFakeSupabase(signedIn((q) => {
      if (q.table === 'users' && q.op === 'select') {
        // The fake answers whatever was asked for; a username here would
        // only reach the reply if the function passed it on.
        return {
          data: {
            id: FRIEND, username: 'Amelia Jones', display_name: 'SunnyBadger',
            avatar_emoji: '🐰', avatar_bg_colour: '#d0f0c0',
          },
          error: null,
        };
      }
      return undefined;
    }));
    const res = await handler(post({ joinCode: 'OWL-123' }, asMe));
    expect(res.status).toBe(200);
    const friend = (await json(res)).friend as Record<string, unknown>;
    expect(friend.displayName).toBe('SunnyBadger');
    expect(friend).not.toHaveProperty('username');
    expect(JSON.stringify(friend)).not.toContain('Amelia');
    const [lookup] = db.on('users', 'select');
    expect(lookup.columns).toContain('display_name');
    expect(lookup.columns).not.toMatch(/\busername\b/);
  });
});

describe('create-showcase', () => {
  let handler: Handler;
  beforeAll(async () => {
    handler = await loadFunction(() => import('../../../../supabase/functions/create-showcase/index.ts'));
  });

  it('puts the display name on the public page, and not the name typed', async () => {
    const db = useFakeSupabase(signedIn((q) => {
      if (q.table === 'users' && q.op === 'select') {
        return {
          data: { username: 'Amelia Jones', display_name: 'MossyOtter', avatar_emoji: '🦊', avatar_bg_colour: '#ffd0a0' },
          error: null,
        };
      }
      return undefined;
    }));
    const res = await handler(post({}, asMe));
    expect(res.status).toBe(200);
    const [insert] = db.on('showcase_links', 'insert');
    const snapshot = (insert.values as Record<string, unknown>).snapshot as Record<string, unknown>;
    expect(snapshot.displayName).toBe('MossyOtter');
    expect(snapshot).not.toHaveProperty('username');
    expect(JSON.stringify(snapshot)).not.toContain('Amelia');
    expect(db.on('users', 'select')[0].columns).not.toMatch(/\busername\b/);
  });
});

describe('get-showcase', () => {
  let handler: Handler;
  beforeAll(async () => {
    handler = await loadFunction(() => import('../../../../supabase/functions/get-showcase/index.ts'));
  });

  it('never hands out a typed name from a showcase made before display names', async () => {
    // 00014 rewrites stored showcases, and this is the second line: a
    // snapshot that still carries `username` loses it on the way out.
    useFakeSupabase(new FakeSupabase((q) => {
      if (q.table === 'showcase_links' && q.op === 'select') {
        return {
          data: {
            snapshot: { username: 'Amelia Jones', displayName: 'MossyOtter', level: 3 },
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            view_count: 0,
          },
          error: null,
        };
      }
      return undefined;
    }));
    const res = await handler(post({ token: 'x'.repeat(32) }));
    expect(res.status).toBe(200);
    const snapshot = (await json(res)).snapshot as Record<string, unknown>;
    expect(snapshot).not.toHaveProperty('username');
    expect(snapshot.displayName).toBe('MossyOtter');
    expect(snapshot.level).toBe(3);
  });
});
