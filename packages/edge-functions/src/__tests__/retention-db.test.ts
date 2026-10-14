import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PGliteInterface } from '@electric-sql/pglite';
import { migratedDatabase, asRole } from '../support/postgres';

/**
 * The retention jobs (migrations/00019_retention_jobs.sql) against a real
 * Postgres with every migration applied: privacy answers 43A, 44B, 45A
 * and 46B.
 *
 * Every limit is tested a day either side, and where a minute matters, a
 * minute either side. Times are written as SQL against the database's own
 * clock, the clock the jobs read.
 */

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const DAY_INSIDE_3Y = `now() - interval '3 years' + interval '1 day'`;
const DAY_OUTSIDE_3Y = `now() - interval '3 years' - interval '1 day'`;

let db: PGliteInterface;
let poolNames = 0;

interface Player { id: string; username: string; joinCode: string }

/**
 * A player with a row in every table that can hold something of theirs,
 * written the way the functions write it. `lastSeen` and `created` are SQL
 * expressions for users.last_seen_at and users.created_at; the session is
 * last used at `lastSeen` unless `sessionUsed` says otherwise (null: no
 * session at all).
 */
async function makePlayer(
  username: string,
  joinCode: string,
  times: { lastSeen: string | null; created?: string; sessionUsed?: string | null },
): Promise<Player> {
  const created = times.created ?? `now() - interval '4 years'`;
  const lastSeen = times.lastSeen ?? 'null';
  const { rows } = await db.query<{ id: string }>(
    `insert into users (username, pin_hash, avatar_emoji, avatar_bg_colour, join_code, created_at, last_seen_at)
     values ($1, 'salt:hash', '🦊', '#ffd0a0', $2, ${created}, ${lastSeen}) returning id`,
    [username, joinCode],
  );
  const id = rows[0].id;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, [id, ...params]);

  const sessionUsed = times.sessionUsed === undefined ? times.lastSeen : times.sessionUsed;
  if (sessionUsed !== null) {
    await q(
      `insert into sessions (token, user_id, created_at, last_used_at, expires_at)
       values ($2, $1, ${sessionUsed}, ${sessionUsed}, ${sessionUsed} + interval '90 days')`,
      [`tok-${username}`],
    );
  }
  await q(`insert into game_states (user_id, state, level) values ($1, '{"animals":[{"name":"Biscuit"}]}', 3)`);
  await q(`insert into rescue_stats (user_id, cats_rescued) values ($1, 4)`);
  await q(`insert into badges_earned (user_id, badge_code) values ($1, 'first_rescue')`);
  await q(`insert into depot_sessions (user_id, mode) values ($1, 'parts')`);
  await q(`insert into supply_run_records (user_id, destination) values ($1, 'bramble_farm')`);
  await q(
    `insert into depot_inventory_ledger (user_id, item_type, item_key, quantity_change, balance_after, source)
     values ($1, 'parts', 'bolt', 2, 2, 'depot_session')`,
  );
  // Recent log lines, so only the account job can be what removes them.
  await q(`insert into audit_log (user_id, action, metadata) values ($1, 'signup', jsonb_build_object('username', $2::text))`, [username]);
  for (const key of [`login:${username.toLowerCase()}`, `hint:${username.toLowerCase()}`]) {
    await db.query(`insert into rate_limits (key, count, reset_at) values ($1, 1, now() + interval '15 minutes')`, [key]);
  }
  await q(`insert into rate_limits (key, count, reset_at) values ('gift:' || $1, 1, now() + interval '15 minutes')`);
  // A pool name that does not contain the sign-in name, so that once it is
  // given back it names nobody.
  await q(`insert into username_pool (username, source, claimed_at, claimed_by) values ($2, 'seed', now(), $1)`, [`Pool${++poolNames}`]);
  return { id, username, joinCode };
}

async function befriend(a: Player, b: Player): Promise<void> {
  await db.query(`insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1) on conflict do nothing`, [a.id, b.id]);
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
     values ($1, 'gift_sent', $2, jsonb_build_object('gift_id', $3::text))`,
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

async function showcase(p: Player, token: string, expires: string): Promise<void> {
  await db.query(
    `insert into showcase_links (token, user_id, snapshot, expires_at)
     values ($1, $2, '{"pets":[{"name":"Biscuit"}]}', ${expires})`,
    [token, p.id],
  );
}

/** A trigger that stops some users rows being deleted, as a fault would. */
async function refuseDelete(condition: string): Promise<void> {
  await db.query(`
    create function refuse_delete() returns trigger language plpgsql as $$
    begin if ${condition} then raise exception 'refused'; end if; return old; end $$`);
  await db.query(`create trigger refuse_delete before delete on users for each row execute function refuse_delete()`);
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

/**
 * True when a row names the player: by id, by join code, or by sign-in
 * name in any capitals, as a whole value ("Ada") or the end of a key
 * (login:ada).
 */
function mentions(row: string, p: Player): boolean {
  const lower = row.toLowerCase();
  const name = p.username.toLowerCase();
  return row.includes(p.id) || row.includes(p.joinCode) || lower.includes(`"${name}"`) || lower.includes(`:${name}"`);
}

async function usernames(): Promise<string[]> {
  const { rows } = await db.query<{ username: string }>(`select username from users order by username`);
  return rows.map((r) => r.username);
}

async function accounts(limit?: number): Promise<{ deleted: number; failed: number }> {
  const { rows } = await db.query<{ r: { deleted: number; failed: number } }>(
    limit === undefined ? `select arc_retention_accounts() as r` : `select arc_retention_accounts($1) as r`,
    limit === undefined ? [] : [limit],
  );
  return rows[0].r;
}

async function count(fn: string, limit?: number): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    limit === undefined ? `select ${fn}() as n` : `select ${fn}($1) as n`,
    limit === undefined ? [] : [limit],
  );
  return rows[0].n;
}

async function preview(): Promise<Record<string, number>> {
  const { rows } = await db.query<{ p: Record<string, number> }>(`select arc_retention_preview() as p`);
  return rows[0].p;
}

beforeEach(async () => {
  db = await migratedDatabase();
});

describe('43A: an account goes 3 years after it was last used', () => {
  it('a day outside goes, a day inside stays', async () => {
    await makePlayer('Gone', 'OUT-001', { lastSeen: DAY_OUTSIDE_3Y });
    await makePlayer('Stays', 'INS-001', { lastSeen: DAY_INSIDE_3Y });
    expect(await accounts()).toEqual({ deleted: 1, failed: 0 });
    expect(await usernames()).toEqual(['Stays']);
  });

  it('counts from when the account was made, when it never signed in after', async () => {
    await makePlayer('Gone', 'OUT-001', { lastSeen: null, created: DAY_OUTSIDE_3Y, sessionUsed: null });
    await makePlayer('Stays', 'INS-001', { lastSeen: null, created: DAY_INSIDE_3Y, sessionUsed: null });
    expect(await accounts()).toEqual({ deleted: 1, failed: 0 });
    expect(await usernames()).toEqual(['Stays']);
  });

  it('a sign-in token used inside the 3 years keeps the account, even when the last sign-in is older', async () => {
    // Play carries on with a token for up to 90 days after signing in.
    await makePlayer('Played', 'INS-002', { lastSeen: DAY_OUTSIDE_3Y, sessionUsed: DAY_INSIDE_3Y });
    await makePlayer('Gone', 'OUT-002', { lastSeen: DAY_OUTSIDE_3Y, sessionUsed: DAY_OUTSIDE_3Y });
    expect(await accounts()).toEqual({ deleted: 1, failed: 0 });
    expect(await usernames()).toEqual(['Played']);
  });

  it('deletes an account that holds gifts, friends and a showcase, and leaves nothing that names it', async () => {
    const ada = await makePlayer('Ada', 'FOX-111', { lastSeen: DAY_OUTSIDE_3Y });
    const bo = await makePlayer('Bo', 'OWL-222', { lastSeen: `now() - interval '2 days'` });
    const cy = await makePlayer('Cy', 'EEL-333', { lastSeen: `now() - interval '1 hour'` });
    await befriend(ada, bo);
    await befriend(bo, ada);
    await befriend(bo, cy);
    await gift(ada, bo);
    await gift(bo, ada);
    await gift(bo, cy);
    // A showcase still inside its 30 days: the account job removes it, not
    // the showcase job.
    await showcase(ada, 'show-ada', `now() + interval '3 days'`);
    await showcase(bo, 'show-bo', `now() + interval '3 days'`);

    const before = await everyRow();
    for (const table of ['audit_log', 'friendships', 'gifts', 'showcase_links', 'sessions', 'users', 'username_pool']) {
      expect(before.get(table)!.some((r) => mentions(r, ada)), table).toBe(true);
    }

    expect(await accounts()).toEqual({ deleted: 1, failed: 0 });
    const after = await everyRow();

    // Nothing anywhere names her.
    for (const [table, rows] of after) {
      expect(rows.filter((r) => mentions(r, ada)), table).toEqual([]);
    }
    // Every row that never named her is still there, unchanged.
    for (const [table, rows] of before) {
      const untouched = rows.filter((r) => !mentions(r, ada));
      expect(after.get(table)!.filter((r) => untouched.includes(r)), table).toEqual(untouched);
    }
    // What is new is what delete_account always leaves: her gift to Bo,
    // without a sender; her pool name, free again; one line of counts.
    const added = [...after].flatMap(([t, rows]) =>
      rows.filter((r) => !before.get(t)!.includes(r)).map((r) => [t, JSON.parse(r)] as const));
    expect(added.map(([t]) => t).sort()).toEqual(['audit_log', 'gifts', 'username_pool']);
    const [, giftRow] = added.find(([t]) => t === 'gifts')!;
    expect(giftRow).toMatchObject({ from_user: null, to_user: bo.id });
    const [, logRow] = added.find(([t]) => t === 'audit_log')!;
    expect(logRow).toMatchObject({ action: 'account_deleted', user_id: null, target_id: null });
    expect(logRow.metadata.removed).toMatchObject({
      users: 1, friendships: 2, gifts_received: 1, gifts_sent_unlinked: 1, showcase_links: 1,
    });

    // Bo and Cy carry on: their friendship, their showcases, their sessions.
    const { rows: friends } = await db.query(`select 1 from friendships where user_id = $1 and friend_id = $2`, [bo.id, cy.id]);
    expect(friends).toHaveLength(1);
    expect(await usernames()).toEqual(['Bo', 'Cy']);
  });

  it('works in bounded batches, oldest first', async () => {
    await makePlayer('Oldest', 'OUT-001', { lastSeen: `now() - interval '5 years'` });
    await makePlayer('Older', 'OUT-002', { lastSeen: `now() - interval '4 years'` });
    await makePlayer('Old', 'OUT-003', { lastSeen: DAY_OUTSIDE_3Y });
    await makePlayer('Recent', 'INS-001', { lastSeen: `now()` });

    expect(await accounts(2)).toEqual({ deleted: 2, failed: 0 });
    expect(await usernames()).toEqual(['Old', 'Recent']);
    expect(await accounts(2)).toEqual({ deleted: 1, failed: 0 });
    expect(await accounts(2)).toEqual({ deleted: 0, failed: 0 });
    expect(await usernames()).toEqual(['Recent']);
  });

  it('an account that cannot be deleted is left whole, and the others still go', async () => {
    const ada = await makePlayer('Ada', 'FOX-111', { lastSeen: DAY_OUTSIDE_3Y });
    const bo = await makePlayer('Bo', 'OWL-222', { lastSeen: `now() - interval '4 years'` });
    await befriend(ada, bo);
    await refuseDelete(`old.username = 'Bo'`);
    const boBefore = [...(await everyRow())].map(([t, rows]) =>
      [t, rows.filter((r) => mentions(r, bo) && !mentions(r, ada))] as const);

    expect(await accounts()).toEqual({ deleted: 1, failed: 1 });
    expect(await usernames()).toEqual(['Bo']);
    // Everything of Bo's that did not also name Ada is exactly as it was.
    const after = await everyRow();
    for (const [table, rows] of boBefore) {
      expect(after.get(table)!.filter((r) => rows.includes(r)), table).toEqual(rows);
    }
  });

  it('when every account in the batch fails, it says so and deletes nothing', async () => {
    await makePlayer('Bo', 'OWL-222', { lastSeen: DAY_OUTSIDE_3Y });
    await refuseDelete('true');
    const before = await everyRow();
    await expect(accounts()).rejects.toThrow(/1 account\(s\) could not be deleted/);
    expect(await everyRow()).toEqual(before);
  });
});

describe('44B: an activity-log entry goes 2 years after it was made', () => {
  it('a day outside goes, a day inside stays, with or without an account', async () => {
    const bo = await makePlayer('Bo', 'OWL-222', { lastSeen: 'now()' });
    await db.query(
      `insert into audit_log (user_id, action, created_at) values
         ($1, 'gift_sent', now() - interval '2 years' - interval '1 day'),
         ($1, 'gift_claimed', now() - interval '2 years' + interval '1 day'),
         (null, 'account_deleted', now() - interval '2 years' - interval '1 day'),
         (null, 'account_deleted', now() - interval '2 years' + interval '1 day')`,
      [bo.id],
    );
    expect(await count('arc_retention_audit_log')).toBe(2);
    const { rows } = await db.query<{ action: string }>(
      `select action from audit_log where created_at < now() - interval '1 year' order by action`,
    );
    expect(rows.map((r) => r.action)).toEqual(['account_deleted', 'gift_claimed']);
    // The account itself is untouched.
    expect(await usernames()).toEqual(['Bo']);
  });

  it('works in bounded batches, oldest first', async () => {
    await db.query(
      `insert into audit_log (action, created_at)
       select 'signup', now() - interval '3 years' - (n || ' days')::interval from generate_series(1, 5) n`,
    );
    expect(await count('arc_retention_audit_log', 3)).toBe(3);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from audit_log where created_at < now() - interval '3 years' - interval '2 days 12 hours'`,
    );
    expect(rows[0].n).toBe(0);
    expect(await count('arc_retention_audit_log', 3)).toBe(2);
    expect(await count('arc_retention_audit_log', 3)).toBe(0);
  });
});

describe('45A: a rate-limit counter goes 1 day after its window closed', () => {
  it('keeps open windows and those closed less than a day ago; deletes the rest', async () => {
    const rows: Array<[string, string]> = [
      ['open', `now() + interval '10 minutes'`],
      ['closed-a-minute-ago', `now() - interval '1 minute'`],
      ['closed-a-day-less-a-minute-ago', `now() - interval '1 day' + interval '1 minute'`],
      ['closed-a-day-and-a-minute-ago', `now() - interval '1 day' - interval '1 minute'`],
      ['closed-two-days-ago', `now() - interval '2 days'`],
    ];
    for (const [key, resetAt] of rows) {
      await db.query(`insert into rate_limits (key, count, reset_at) values ($1, 3, ${resetAt})`, [`login:${key}`]);
    }
    expect(await count('arc_retention_rate_limits')).toBe(2);
    const { rows: left } = await db.query<{ key: string }>(`select key from rate_limits order by key`);
    expect(left.map((r) => r.key)).toEqual([
      'login:closed-a-day-less-a-minute-ago', 'login:closed-a-minute-ago', 'login:open',
    ]);
  });

  it('treats an address counter the same way', async () => {
    const hashed = 'a'.repeat(64);
    await db.query(
      `insert into rate_limits (key, count, reset_at) values
         ($1, 2, now()),
         ($2, 2, now() - interval '2 days')`,
      [`signup-ip:${hashed}`, `login-ip:${hashed}`],
    );
    expect(await count('arc_retention_rate_limits')).toBe(1);
    const { rows } = await db.query<{ key: string }>(`select key from rate_limits`);
    expect(rows.map((r) => r.key)).toEqual([`signup-ip:${hashed}`]);
  });
});

describe('46B: a showcase goes 30 days after its link stopped working', () => {
  it('a day outside goes, a day inside stays, and a live link stays', async () => {
    const bo = await makePlayer('Bo', 'OWL-222', { lastSeen: 'now()' });
    await showcase(bo, 'live', `now() + interval '6 days'`);
    await showcase(bo, 'expired-29-days', `now() - interval '30 days' + interval '1 day'`);
    await showcase(bo, 'expired-31-days', `now() - interval '30 days' - interval '1 day'`);
    expect(await count('arc_retention_showcases')).toBe(1);
    const { rows } = await db.query<{ token: string }>(`select token from showcase_links order by token`);
    expect(rows.map((r) => r.token)).toEqual(['expired-29-days', 'live']);
    expect(await usernames()).toEqual(['Bo']);
  });
});

describe('every job', () => {
  /** One of everything, half of it past its limit. */
  async function mixedFixture(): Promise<void> {
    const ada = await makePlayer('Ada', 'FOX-111', { lastSeen: DAY_OUTSIDE_3Y });
    const bo = await makePlayer('Bo', 'OWL-222', { lastSeen: DAY_INSIDE_3Y });
    await befriend(ada, bo);
    await gift(ada, bo);
    await showcase(ada, 'show-ada', `now() - interval '40 days'`);
    await showcase(bo, 'show-bo-old', `now() - interval '40 days'`);
    await showcase(bo, 'show-bo-new', `now() - interval '20 days'`);
    await db.query(
      `insert into audit_log (user_id, action, created_at) values
         ($1, 'signup', now() - interval '2 years' - interval '1 day'),
         ($1, 'gift_sent', now() - interval '2 years' + interval '1 day')`,
      [bo.id],
    );
    await db.query(
      `insert into rate_limits (key, count, reset_at) values
         ('login:old', 1, now() - interval '3 days'), ('login:new', 1, now() - interval '3 hours')`,
    );
  }

  it('a second run changes nothing', async () => {
    await mixedFixture();
    const { rows: first } = await db.query<{ r: Record<string, unknown> }>(`select arc_retention_run() as r`);
    expect(first[0].r).toEqual({
      accounts: { deleted: 1, failed: 0 },
      // Ada's showcase went with her account; Bo's old one by this rule.
      showcases: 1,
      audit_log: 1,
      rate_limits: 1,
    });
    const afterFirst = await everyRow();

    const { rows: second } = await db.query<{ r: Record<string, unknown> }>(`select arc_retention_run() as r`);
    expect(second[0].r).toEqual({ accounts: { deleted: 0, failed: 0 }, showcases: 0, audit_log: 0, rate_limits: 0 });
    expect(await everyRow()).toEqual(afterFirst);
    expect(await preview()).toEqual({ accounts: 0, audit_log: 0, rate_limits: 0, showcases: 0 });
  });

  it('the dry run counts what the jobs delete, and deletes nothing', async () => {
    await mixedFixture();
    const before = await everyRow();
    const dry = await preview();
    expect(await everyRow()).toEqual(before);
    // Ada's showcase is past 30 days too, so the dry run counts it under
    // showcases as well as her account.
    expect(dry).toEqual({ accounts: 1, audit_log: 1, rate_limits: 1, showcases: 2 });

    // Each job on its own, against the same rows, deletes what was counted.
    expect(await count('arc_retention_showcases')).toBe(dry.showcases);
    expect(await count('arc_retention_audit_log')).toBe(dry.audit_log);
    expect(await count('arc_retention_rate_limits')).toBe(dry.rate_limits);
    expect((await accounts()).deleted).toBe(dry.accounts);
  });

  it('cannot be called with the public key, or by a signed-in player', async () => {
    await mixedFixture();
    const before = await everyRow();
    for (const fn of [
      'arc_retention_accounts()', 'arc_retention_audit_log()', 'arc_retention_rate_limits()',
      'arc_retention_showcases()', 'arc_retention_preview()', 'arc_retention_run()',
      'arc_retention_schedule()', 'arc_retention_unschedule()',
    ]) {
      for (const role of ['anon', 'authenticated'] as const) {
        await expect(asRole(db, role, () => db.query(`select ${fn}`)), `${role} ${fn}`)
          .rejects.toThrow(/permission denied/);
      }
    }
    // The switch is not the service role's either.
    for (const fn of ['arc_retention_schedule()', 'arc_retention_unschedule()']) {
      await expect(asRole(db, 'service_role', () => db.query(`select ${fn}`)), fn)
        .rejects.toThrow(/permission denied/);
    }
    expect(await everyRow()).toEqual(before);
  });

  it('the service role may run the dry run and the jobs, for a scheduler other than pg_cron', async () => {
    await mixedFixture();
    const { rows } = await asRole(db, 'service_role', () =>
      db.query<{ p: Record<string, number> }>(`select arc_retention_preview() as p`));
    expect(rows[0].p.accounts).toBe(1);
    const { rows: ran } = await asRole(db, 'service_role', () =>
      db.query<{ r: { accounts: { deleted: number } } }>(`select arc_retention_run() as r`));
    expect(ran[0].r.accounts.deleted).toBe(1);
  });

  it('the switch says what to enable when pg_cron is missing, and schedules nothing', async () => {
    // PGlite has no pg_cron, like a project that has not switched it on.
    await expect(db.query(`select arc_retention_schedule()`))
      .rejects.toThrow(/pg_cron is not enabled.*Database > Extensions > pg_cron.*Nothing was scheduled/);
    const { rows } = await db.query<{ n: number }>(`select arc_retention_unschedule() as n`);
    expect(rows[0].n).toBe(0);
  });
});
