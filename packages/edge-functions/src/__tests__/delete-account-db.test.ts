import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PGliteInterface } from '@electric-sql/pglite';
import { migratedDatabase, asRole } from '../support/postgres';

/**
 * `delete_account` (migrations/00015_delete_account.sql) against a real
 * Postgres with every migration applied.
 *
 * Three players: Ada is deleted. Bo is her friend, so rows they share are
 * where a deletion could go too far or not far enough. Cy has never met
 * her, and nothing of Cy's may change.
 */

// The migrations take a few seconds under WebAssembly, once per file, and
// each test copies the result.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

interface Player { id: string; username: string; joinCode: string }

let db: PGliteInterface;
let ada: Player;
let bo: Player;
let cy: Player;

async function makePlayer(username: string, joinCode: string, poolName: string): Promise<Player> {
  const { rows } = await db.query<{ id: string }>(
    `insert into users (username, pin_hash, avatar_emoji, avatar_bg_colour, join_code)
     values ($1, 'salt:hash', '🦊', '#ffd0a0', $2) returning id`,
    [username, joinCode],
  );
  const id = rows[0].id;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, [id, ...params]);

  // Everything one player has on their own, the way the functions write it.
  await q(`insert into sessions (token, user_id) values ($2, $1)`, [`tok-${username}`]);
  await q(`insert into game_states (user_id, state, level) values ($1, '{"animals":[]}', 3)`);
  await q(`insert into rescue_stats (user_id, cats_rescued) values ($1, 4)`);
  await q(`insert into badges_earned (user_id, badge_code) values ($1, 'first_rescue')`);
  await q(
    `insert into showcase_links (token, user_id, snapshot, expires_at)
     values ($2, $1, '{"pets":[{"name":"Biscuit"}]}', now() + interval '7 days')`,
    [`show-${username}`],
  );
  await q(`insert into depot_sessions (user_id, mode) values ($1, 'parts')`);
  await q(`insert into supply_run_records (user_id, destination) values ($1, 'bramble_farm')`);
  await q(
    `insert into depot_inventory_ledger (user_id, item_type, item_key, quantity_change, balance_after, source)
     values ($1, 'parts', 'bolt', 2, 2, 'depot_session')`,
  );
  await q(`insert into audit_log (user_id, action, metadata) values ($1, 'signup', jsonb_build_object('username', $2::text))`, [username]);
  await q(`insert into audit_log (user_id, action, metadata) values ($1, 'showcase_created', jsonb_build_object('token', $2::text))`, [`show-${username}`]);
  // Rate limits keyed by the typed name (login, get-pin-hint), as typed,
  // and by the user id (send-gift).
  for (const key of [`login:${username}`, `login: ${username} `, `hint:${username}`]) {
    await db.query(`insert into rate_limits (key, count, reset_at) values ($1, 1, now() + interval '15 minutes')`, [key]);
  }
  await q(`insert into rate_limits (key, count, reset_at) values ('gift:' || $1, 1, now() + interval '15 minutes')`);
  await q(`insert into rate_limits (key, count, reset_at) values ('delete-account:' || $1, 1, now() + interval '15 minutes')`);
  // A suggested name from the pool, claimed at signup.
  await q(`insert into username_pool (username, source, claimed_at, claimed_by) values ($2, 'seed', now(), $1)`, [poolName]);
  return { id, username, joinCode };
}

/** `a` adds `b` by join code, as add-friend does: two rows and a log line. */
async function befriend(a: Player, b: Player): Promise<void> {
  await db.query(`insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)`, [a.id, b.id]);
  await logFriendAdded(a, b);
}

async function logFriendAdded(a: Player, b: Player): Promise<void> {
  await db.query(
    `insert into audit_log (user_id, action, target_id, metadata)
     values ($1, 'friend_added', $2, jsonb_build_object('join_code', $3::text))`,
    [a.id, b.id, b.joinCode],
  );
}

async function gift(from: Player, to: Player): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `insert into gifts (from_user, to_user, gift_type, message_preset_code)
     values ($1, $2, 'toy', 'hello') returning id`,
    [from.id, to.id],
  );
  await db.query(
    `insert into audit_log (user_id, action, target_id, metadata)
     values ($1, 'gift_sent', $2, jsonb_build_object('gift_id', $3::text, 'gift_type', 'toy'))`,
    [from.id, to.id, rows[0].id],
  );
  await db.query(
    `insert into audit_log (user_id, action, metadata)
     values ($2, 'gift_claimed', jsonb_build_object('gift_id', $3::text, 'from_user', $1::text))`,
    [from.id, to.id, rows[0].id],
  );
  await db.query(`insert into rate_limits (key, count, reset_at) values ($1, 1, now() + interval '1 hour')`, [
    `gift-pair:${from.id}:${to.id}`,
  ]);
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

/** True when a row names Ada in any way: her id, typed name or join code. */
function mentions(row: string, p: Player): boolean {
  return row.includes(p.id) || row.includes(p.username) || row.includes(p.joinCode);
}

beforeEach(async () => {
  db = await migratedDatabase();
  ada = await makePlayer('Ada', 'FOX-111', 'MoonBunny');
  bo = await makePlayer('Bo', 'OWL-222', 'CloverPaws');
  cy = await makePlayer('Cy', 'EEL-333', 'BrambleFox');
  await befriend(ada, bo);
  // Bo's log line for the same friendship, as if he had typed her code.
  await logFriendAdded(bo, ada);
  await befriend(bo, cy);
  await gift(ada, bo);
  await gift(bo, ada);
  await gift(bo, cy);
});

describe('delete_account', () => {
  it('leaves no row anywhere that names the deleted player', async () => {
    const before = await everyRow();
    // The seeding reached every table that can hold something of hers.
    for (const table of [
      'audit_log', 'badges_earned', 'depot_inventory_ledger', 'depot_sessions', 'friendships',
      'game_states', 'gifts', 'rate_limits', 'rescue_stats', 'sessions', 'showcase_links',
      'supply_run_records', 'username_pool', 'users',
    ]) {
      expect(before.get(table)!.some((r) => mentions(r, ada)), table).toBe(true);
    }

    await db.query(`select delete_account($1)`, [ada.id]);

    const after = await everyRow();
    for (const [table, rows] of after) {
      expect(rows.filter((r) => mentions(r, ada)), table).toEqual([]);
    }
  });

  it('changes nothing that does not name the deleted player', async () => {
    const before = await everyRow();
    await db.query(`select delete_account($1)`, [ada.id]);
    const after = await everyRow();

    for (const [table, rows] of before) {
      const untouched = rows.filter((r) => !mentions(r, ada));
      // Every row that never named her is still there, unchanged.
      expect(after.get(table)!.filter((r) => untouched.includes(r)), table).toEqual(untouched);
    }

    // What is new: one log line with counts; her gift to Bo, which is
    // his, with the sender taken off; and the suggested name she took,
    // back in the pool with nobody's id on it.
    const newRows = [...after].flatMap(([t, rows]) =>
      rows.filter((r) => !before.get(t)!.includes(r)).map((r) => [t, JSON.parse(r)] as const));
    expect(newRows.map(([t]) => t).sort()).toEqual(['audit_log', 'gifts', 'username_pool']);
    const [, poolRow] = newRows.find(([t]) => t === 'username_pool')!;
    expect(poolRow).toMatchObject({ username: 'MoonBunny', claimed_at: null, claimed_by: null });
    const [, logRow] = newRows.find(([t]) => t === 'audit_log')!;
    expect(logRow).toMatchObject({ action: 'account_deleted', user_id: null, target_id: null });
    const [, giftRow] = newRows.find(([t]) => t === 'gifts')!;
    expect(giftRow).toMatchObject({ from_user: null, to_user: bo.id, gift_type: 'toy' });
  });

  it('leaves the other players able to carry on', async () => {
    await db.query(`select delete_account($1)`, [ada.id]);
    const { rows: users } = await db.query<{ username: string }>(`select username from users order by username`);
    expect(users.map((u) => u.username)).toEqual(['Bo', 'Cy']);
    const { rows: friends } = await db.query(`select 1 from friendships where user_id = $1 and friend_id = $2`, [bo.id, cy.id]);
    expect(friends).toHaveLength(1);
    const { rows: sessions } = await db.query(`select user_id from sessions`);
    expect(sessions).toHaveLength(2);
    const { rows: limits } = await db.query<{ key: string }>(`select key from rate_limits where key like 'login:%' order by key`);
    expect(limits.map((l) => l.key)).toEqual(['login: Bo ', 'login: Cy ', 'login:Bo', 'login:Cy']);
  });

  it('says what it removed, in counts', async () => {
    const { rows } = await db.query<{ removed: Record<string, number> }>(
      `select delete_account($1) as removed`, [ada.id],
    );
    expect(rows[0].removed).toMatchObject({
      users: 1, sessions: 1, game_states: 1, rescue_stats: 1, badges_earned: 1,
      showcase_links: 1, friendships: 2, gifts_received: 1, gifts_sent_unlinked: 1,
      depot_sessions: 1, supply_run_records: 1, depot_inventory_ledger: 1,
      username_pool_released: 1,
      // login, login with spaces, hint, gift, delete-account, and the two
      // gift-pair keys (hers to Bo, Bo's to her).
      rate_limits: 7,
      // signup, showcase_created; friend_added both ways; gift_sent and
      // gift_claimed for both gifts.
      audit_log: 8,
    });
  });

  it('returns null for an account that is not there, and deletes nothing', async () => {
    const before = await everyRow();
    const { rows } = await db.query<{ removed: unknown }>(
      `select delete_account('00000000-0000-4000-8000-000000000000') as removed`,
    );
    expect(rows[0].removed).toBeNull();
    expect(await everyRow()).toEqual(before);
  });

  it('is one transaction: if any part fails, nothing is deleted', async () => {
    // Make the very last step, deleting the users row, fail.
    await db.exec(`
      create function refuse_delete() returns trigger language plpgsql as $$
      begin raise exception 'refused'; end $$;
      create trigger refuse_delete before delete on users for each row execute function refuse_delete();
    `);
    const before = await everyRow();
    await expect(db.query(`select delete_account($1)`, [ada.id])).rejects.toThrow(/refused/);
    expect(await everyRow()).toEqual(before);
  });

  it('cannot be called with the public key, or by a signed-in player', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(
        asRole(db, role, () => db.query(`select delete_account($1)`, [ada.id]), ada.id),
      ).rejects.toThrow(/permission denied/);
    }
    const { rows } = await db.query(`select 1 from users where id = $1`, [ada.id]);
    expect(rows).toHaveLength(1);
  });
});

describe('what the public key can read (00016)', () => {
  it('cannot read showcase rows at all', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(
        asRole(db, role, () => db.query(`select token from showcase_links`), ada.id),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('cannot read a typed sign-in name, a PIN hash or a join code, even from a row it may see', async () => {
    // As Supabase's own sign-in would set it: Ada, signed in, reading
    // her own row and her friend Bo's.
    for (const column of ['username', 'pin_hash', 'join_code', 'pin_hint_code', '*']) {
      await expect(
        asRole(db, 'authenticated', () => db.query(`select ${column} from users`), ada.id),
        column,
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      asRole(db, 'anon', () => db.query(`select username from users`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('still reads what other players are meant to see: the display name and avatar', async () => {
    const { rows } = await asRole(db, 'authenticated', () => db.query<{ id: string }>(
      `select id, display_name, avatar_emoji, avatar_bg_colour from users order by id`,
    ), ada.id);
    // Her own row and her friend's, as the rules always said; not Cy's.
    expect(rows.map((r) => r.id).sort()).toEqual([ada.id, bo.id].sort());
  });

  it('reads nothing from the pool of sign-in names (00017 took back what 00016 allowed)', async () => {
    // The names are made from public word lists, so a list of the free
    // ones would show, by what is missing, every child's sign-in name.
    for (const column of ['username', 'claimed_at', 'claimed_by']) {
      await expect(
        asRole(db, 'anon', () => db.query(`select ${column} from username_pool`)),
        column,
      ).rejects.toThrow(/permission denied/);
    }
  });
});
