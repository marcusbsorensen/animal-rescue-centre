import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PGliteInterface } from '@electric-sql/pglite';
import { migratedDatabase, asRole, runMigration } from '../support/postgres';

/**
 * `remove_friend` and the gift trigger (migrations/00020_remove_friend.sql)
 * against a real Postgres with every migration applied (146A).
 *
 * Ada removes Bo. Bo is also friends with Cy, and nothing between Bo and
 * Cy may change.
 */

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

interface Player { id: string; username: string; joinCode: string }

let db: PGliteInterface;
let ada: Player;
let bo: Player;
let cy: Player;

async function makePlayer(username: string, joinCode: string): Promise<Player> {
  const { rows } = await db.query<{ id: string }>(
    `insert into users (username, pin_hash, avatar_emoji, avatar_bg_colour, join_code)
     values ($1, 'salt:hash', '🦊', '#ffd0a0', $2) returning id`,
    [username, joinCode],
  );
  const id = rows[0].id;
  await db.query(`insert into sessions (token, user_id) values ($1, $2)`, [`tok-${username}`, id]);
  await db.query(`insert into rescue_stats (user_id) values ($1)`, [id]);
  await db.query(`insert into audit_log (user_id, action, metadata) values ($1, 'signup', jsonb_build_object('username', $2::text))`, [id, username]);
  return { id, username, joinCode };
}

/** `a` adds `b` by join code, as add-friend does: two rows and a log line. */
async function befriend(a: Player, b: Player): Promise<void> {
  await db.query(`insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)`, [a.id, b.id]);
  await db.query(
    `insert into audit_log (user_id, action, target_id, metadata)
     values ($1, 'friend_added', $2, jsonb_build_object('join_code', $3::text))`,
    [a.id, b.id, b.joinCode],
  );
}

/** A gift, as send-gift inserts it; claimed if `claimed`. */
async function gift(from: Player, to: Player, claimed = false): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into gifts (from_user, to_user, gift_type, message_preset_code, claimed_at)
     values ($1, $2, 'toy', 'hello', ${claimed ? 'now()' : 'null'}) returning id`,
    [from.id, to.id],
  );
  return rows[0].id;
}

async function removeFriend(a: Player, b: Player): Promise<Record<string, number>> {
  const { rows } = await db.query<{ removed: Record<string, number> }>(
    `select remove_friend($1, $2) as removed`, [a.id, b.id],
  );
  return rows[0].removed;
}

async function friendsOf(p: Player): Promise<string[]> {
  const { rows } = await db.query<{ friend_id: string }>(
    `select friend_id from friendships where user_id = $1 order by friend_id`, [p.id],
  );
  return rows.map((r) => r.friend_id);
}

async function giftIds(): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(`select id from gifts order by id`);
  return rows.map((r) => r.id);
}

async function removalLog(): Promise<Array<{ user_id: string | null; target_id: string | null; metadata: unknown }>> {
  const { rows } = await db.query<{ user_id: string | null; target_id: string | null; metadata: unknown }>(
    `select user_id, target_id, metadata from audit_log where action = 'friend_removed' order by id`,
  );
  return rows;
}

/** Every table in `public`, each row as JSON text, in a stable order. */
async function everyRow(): Promise<Map<string, string[]>> {
  const { rows: tables } = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  );
  const out = new Map<string, string[]>();
  for (const { table_name } of tables) {
    const { rows } = await db.query<{ j: string }>(`select to_jsonb(t)::text as j from ${table_name} t`);
    out.set(table_name, rows.map((r) => r.j).sort());
  }
  return out;
}

const sameIds = (ids: string[]) => [...ids].sort();

beforeEach(async () => {
  db = await migratedDatabase();
  ada = await makePlayer('Ada', 'FOX-111');
  bo = await makePlayer('Bo', 'OWL-222');
  cy = await makePlayer('Cy', 'EEL-333');
  await befriend(ada, bo);
  await befriend(bo, cy);
});

describe('remove_friend', () => {
  it('ends the friendship both ways', async () => {
    const removed = await removeFriend(ada, bo);
    expect(removed).toMatchObject({ friendships: 2 });
    expect(await friendsOf(ada)).toEqual([]);
    expect(await friendsOf(bo)).toEqual([cy.id]);
  });

  it('works the same whichever of the two asks', async () => {
    await removeFriend(bo, ada);
    expect(await friendsOf(ada)).toEqual([]);
    expect(await friendsOf(bo)).toEqual([cy.id]);
  });

  it("cannot end a friendship the caller is not in", async () => {
    // Ada names Cy, a friend of Bo's she has never met: one side of the
    // pair is always the caller, so Bo and Cy's rows cannot match.
    const before = await everyRow();
    expect(await removeFriend(ada, cy)).toEqual({ friendships: 0, gifts_unclaimed: 0 });
    expect(await everyRow()).toEqual(before);
    expect(await friendsOf(cy)).toEqual([bo.id]);
  });

  it('changes nothing, and logs nothing, when asked again', async () => {
    await gift(ada, bo);
    expect(await removeFriend(ada, bo)).toEqual({ friendships: 2, gifts_unclaimed: 1 });
    const after = await everyRow();
    expect(await removeFriend(ada, bo)).toEqual({ friendships: 0, gifts_unclaimed: 0 });
    expect(await removeFriend(bo, ada)).toEqual({ friendships: 0, gifts_unclaimed: 0 });
    expect(await everyRow()).toEqual(after);
    expect(await removalLog()).toHaveLength(1);
  });

  it('removes nothing for itself, nobody, or an account that is not there', async () => {
    const before = await everyRow();
    expect(await removeFriend(ada, ada)).toEqual({ friendships: 0, gifts_unclaimed: 0 });
    const { rows } = await db.query<{ removed: unknown }>(
      `select remove_friend($1, '00000000-0000-4000-8000-000000000000') as removed`, [ada.id],
    );
    expect(rows[0].removed).toEqual({ friendships: 0, gifts_unclaimed: 0 });
    const { rows: nulls } = await db.query<{ removed: unknown }>(`select remove_friend(null, $1) as removed`, [bo.id]);
    expect(nulls[0].removed).toEqual({ friendships: 0, gifts_unclaimed: 0 });
    expect(await everyRow()).toEqual(before);
  });

  it('deletes the gifts between the two that are not claimed, either way, and keeps the rest', async () => {
    const waitingForBo = await gift(ada, bo);
    const waitingForAda = await gift(bo, ada);
    const claimedByBo = await gift(ada, bo, true);
    const claimedByAda = await gift(bo, ada, true);
    const boToCy = await gift(bo, cy);
    const cyToBo = await gift(cy, bo, true);

    expect(await removeFriend(ada, bo)).toEqual({ friendships: 2, gifts_unclaimed: 2 });

    const left = await giftIds();
    expect(left).not.toContain(waitingForBo);
    expect(left).not.toContain(waitingForAda);
    // Claimed gifts are in the receiver's game already; the rows stay.
    // Bo and Cy's gifts are theirs, and are not touched.
    expect(left).toEqual(sameIds([claimedByBo, claimedByAda, boToCy, cyToBo]));
  });

  it('logs one line with counts, and nothing that names either player', async () => {
    await gift(ada, bo);
    await removeFriend(ada, bo);
    const log = await removalLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toEqual({
      user_id: null,
      target_id: null,
      metadata: { removed: { friendships: 2, gifts_unclaimed: 1 } },
    });
    const text = JSON.stringify(log);
    for (const p of [ada, bo]) {
      for (const s of [p.id, p.username, p.joinCode]) expect(text).not.toContain(s);
    }
  });

  it('keeps the activity log as it was, apart from that line', async () => {
    const { rows: before } = await db.query(`select * from audit_log order by id`);
    await removeFriend(ada, bo);
    const { rows: after } = await db.query<{ action: string }>(`select * from audit_log order by id`);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length).map((r) => r.action)).toEqual(['friend_removed']);
  });

  it('lets the two become friends again, as add-friend would make them', async () => {
    await gift(ada, bo);
    await removeFriend(ada, bo);
    await befriend(bo, ada);
    expect(await friendsOf(ada)).toEqual([bo.id]);
    expect(sameIds(await friendsOf(bo))).toEqual(sameIds([ada.id, cy.id]));
    // And gifts go between them again.
    await expect(gift(ada, bo)).resolves.toMatch(/^[0-9a-f-]{36}$/);
    // A second removal ends the second friendship just the same.
    expect(await removeFriend(ada, bo)).toEqual({ friendships: 2, gifts_unclaimed: 1 });
  });

  it('cannot be called with the public key, or by a signed-in player', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(
        asRole(db, role, () => db.query(`select remove_friend($1, $2)`, [ada.id, bo.id]), ada.id),
      ).rejects.toThrow(/permission denied/);
    }
    expect(await friendsOf(ada)).toEqual([bo.id]);
  });

  it('can be called with the service role, as the Edge Function does', async () => {
    await asRole(db, 'service_role', () => db.query(`select remove_friend($1, $2)`, [ada.id, bo.id]));
    expect(await friendsOf(ada)).toEqual([]);
  });
});

describe('a gift is between friends (the trigger)', () => {
  it('refuses a gift to someone who is not a friend, and to a friend who was removed', async () => {
    await expect(gift(ada, cy)).rejects.toThrow(/only be sent to a friend/);
    await removeFriend(ada, bo);
    await expect(gift(ada, bo)).rejects.toThrow(/only be sent to a friend/);
    await expect(gift(bo, ada)).rejects.toThrow(/only be sent to a friend/);
    expect(await giftIds()).toEqual([]);
  });

  it('still takes a gift between friends, as the service role sends it', async () => {
    await asRole(db, 'service_role', () => gift(bo, cy));
    expect(await giftIds()).toHaveLength(1);
  });
});

describe('00020 itself', () => {
  it('changes nothing when run a second time', async () => {
    await gift(ada, bo);
    const before = await everyRow();
    await runMigration(db, '00020_remove_friend.sql');
    expect(await everyRow()).toEqual(before);
    const { rows } = await db.query(`select tgname from pg_trigger where tgrelid = 'gifts'::regclass and not tgisinternal`);
    expect(rows).toEqual([{ tgname: 'gifts_between_friends' }]);
    expect(await removeFriend(ada, bo)).toEqual({ friendships: 2, gifts_unclaimed: 1 });
  });
});

describe('delete_account and the retention jobs, after a removal', () => {
  it('delete_account still leaves nothing that names the deleted player', async () => {
    await gift(ada, bo);
    await gift(bo, ada, true);
    await removeFriend(ada, bo);
    await befriend(ada, cy);
    await gift(ada, cy);

    const { rows } = await db.query<{ removed: Record<string, number> }>(`select delete_account($1) as removed`, [ada.id]);
    expect(rows[0].removed).toMatchObject({ users: 1, friendships: 2, gifts_received: 1, gifts_sent_unlinked: 1 });

    for (const [table, rowsLeft] of await everyRow()) {
      const naming = rowsLeft.filter((r) => r.includes(ada.id) || r.includes(ada.joinCode) || r.includes('"Ada"'));
      expect(naming, table).toEqual([]);
    }
    // Her gift to Cy is Cy's, without the sender (the trigger checks
    // inserts, not this update), and the removal's log line is still there.
    const { rows: cyGifts } = await db.query(`select from_user from gifts where to_user = $1`, [cy.id]);
    expect(cyGifts).toEqual([{ from_user: null }]);
    expect(await removalLog()).toHaveLength(1);
  });

  it('the retention jobs run as before, and the removal line goes after 2 years like any other', async () => {
    await removeFriend(ada, bo);
    await db.query(
      `update audit_log set created_at = now() - interval '2 years' - interval '1 day' where action = 'friend_removed'`,
    );
    const { rows: preview } = await db.query<{ p: Record<string, number> }>(`select arc_retention_preview() as p`);
    expect(preview[0].p).toMatchObject({ accounts: 0, audit_log: 1 });

    const { rows } = await db.query<{ r: Record<string, unknown> }>(`select arc_retention_run() as r`);
    expect(rows[0].r).toMatchObject({ accounts: { deleted: 0, failed: 0 }, audit_log: 1 });
    expect(await removalLog()).toEqual([]);
    expect(await friendsOf(bo)).toEqual([cy.id]);
  });

  it('an account the retention job deletes takes its friendships and gifts with it, trigger and all', async () => {
    await gift(bo, cy);
    await gift(cy, bo);
    await db.query(
      `update users set created_at = now() - interval '4 years', last_seen_at = now() - interval '3 years' - interval '1 day' where id = $1`,
      [bo.id],
    );
    await db.query(`update sessions set last_used_at = now() - interval '3 years' - interval '1 day' where user_id = $1`, [bo.id]);
    const { rows } = await db.query<{ r: Record<string, number> }>(`select arc_retention_accounts() as r`);
    expect(rows[0].r).toEqual({ deleted: 1, failed: 0 });
    expect(await friendsOf(ada)).toEqual([]);
    expect(await friendsOf(cy)).toEqual([]);
    const { rows: left } = await db.query(`select from_user, to_user from gifts`);
    expect(left).toEqual([{ from_user: null, to_user: cy.id }]);
  });
});
