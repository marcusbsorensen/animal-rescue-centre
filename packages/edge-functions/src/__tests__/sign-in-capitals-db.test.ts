import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PGliteInterface } from '@electric-sql/pglite';
import { migratedDatabase, databaseThrough, runMigration, asRole } from '../support/postgres';

/**
 * Sign-in names ignore capitals (migrations/00018, hub 96), against a real
 * Postgres: one account per name in any capitals, the same for the pool,
 * the lowercase copy the functions look names up by, what the public key
 * can see of it, deletion clearing rate limits in any capitals, and what
 * the migration does with the accounts that were there before it.
 */

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const MIGRATION = '00018_sign_in_names_ignore_capitals.sql';

async function addUser(db: PGliteInterface, username: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into users (username, pin_hash, avatar_emoji, avatar_bg_colour, join_code)
     values ($1, 'salt:hash', '🦊', '#ffd0a0', $2) returning id`,
    [username, `T-${Math.random().toString(36).slice(2, 8)}`],
  );
  return rows[0].id;
}

async function usernames(db: PGliteInterface): Promise<Array<{ username: string; username_lower: string }>> {
  const { rows } = await db.query<{ username: string; username_lower: string }>(
    `select username, username_lower from users order by username_lower`,
  );
  return rows;
}

describe('one account per sign-in name, in any capitals', () => {
  let db: PGliteInterface;
  beforeEach(async () => { db = await migratedDatabase(); });

  it('keeps the capitals the name was made with, beside the name in small letters', async () => {
    await addUser(db, 'PebbleKite');
    expect(await usernames(db)).toEqual([{ username: 'PebbleKite', username_lower: 'pebblekite' }]);
  });

  it('refuses a second account whose name differs only in capitals', async () => {
    await addUser(db, 'Lily');
    for (const name of ['lily', 'LILY', 'lIlY']) {
      await expect(addUser(db, name), name).rejects.toThrow(/users_username_lower_key/);
    }
    expect(await usernames(db)).toHaveLength(1);
  });

  it('finds the account from the name in any capitals, as login and get-pin-hint ask', async () => {
    const id = await addUser(db, 'SunnyOtter');
    for (const typed of ['SunnyOtter', 'sunnyotter', 'SUNNYOTTER']) {
      const { rows } = await db.query<{ id: string }>(
        `select id from users where username_lower = $1`, [typed.trim().toLowerCase()],
      );
      expect(rows.map((r) => r.id), typed).toEqual([id]);
    }
  });

  it('follows the name if it is ever changed', async () => {
    const id = await addUser(db, 'PebbleKite');
    await db.query(`update users set username = 'CloverBoat' where id = $1`, [id]);
    expect(await usernames(db)).toEqual([{ username: 'CloverBoat', username_lower: 'cloverboat' }]);
  });

  it('cannot be written to directly', async () => {
    const id = await addUser(db, 'PebbleKite');
    await expect(
      db.query(`update users set username_lower = 'somethingelse' where id = $1`, [id]),
    ).rejects.toThrow(/can only be updated to DEFAULT/);
  });

  it('cannot be read with the public key', async () => {
    const id = await addUser(db, 'PebbleKite');
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(
        asRole(db, role, () => db.query(`select username_lower from users`), id),
        role,
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe('the pool, in any capitals', () => {
  let db: PGliteInterface;
  beforeEach(async () => { db = await migratedDatabase(); });

  it('refuses a pool name that is already there in other capitals', async () => {
    await expect(
      db.query(`insert into username_pool (username, source) values ('pebblekite', 'llm_approved')`),
    ).rejects.toThrow(/username_pool_username_lower_key/);
  });

  it('tops up past a name held in other capitals instead of failing', async () => {
    // An approved name from the admin page, in its own capitals, where a
    // ready-made pair would go.
    await db.query(`delete from username_pool where username = 'PebbleKite'`);
    await db.query(`insert into username_pool (username, source) values ('pebblekite', 'llm_approved')`);
    await db.query(`select arc_refill_username_pool(300)`);
    const { rows } = await db.query<{ username: string }>(
      `select username from username_pool where lower(username) = 'pebblekite'`,
    );
    expect(rows).toEqual([{ username: 'pebblekite' }]);
  });

  it('never offers or gives out a name somebody holds in other capitals', async () => {
    await addUser(db, 'pebblekite');
    const { rows } = await db.query<{ ok: boolean }>(`select arc_claim_sign_in_name('PebbleKite') as ok`);
    expect(rows[0].ok).toBe(false);
    const offered = await db.query<{ name: string }>(`select arc_offer_sign_in_names(6) as name`);
    expect(offered.rows.map((r) => r.name.toLowerCase())).not.toContain('pebblekite');
  });
});

describe('deleting an account clears its rate limits in any capitals', () => {
  it('removes login: and hint: keys whatever capitals they were written in', async () => {
    const db = await migratedDatabase();
    const id = await addUser(db, 'PebbleKite');
    await addUser(db, 'CloverBoat');
    for (const key of [
      'login:pebblekite',   // login since 00018
      'hint:pebblekite',    // get-pin-hint since 00018
      'login:PebbleKite',   // as typed, before 00018
      'hint: PebbleKite ',  // as typed, with spaces
      'login:cloverboat',   // somebody else's
    ]) {
      await db.query(`insert into rate_limits (key, count, reset_at) values ($1, 1, now() + interval '15 minutes')`, [key]);
    }
    await db.query(`select delete_account($1)`, [id]);
    const { rows } = await db.query<{ key: string }>(`select key from rate_limits order by key`);
    expect(rows.map((r) => r.key)).toEqual(['login:cloverboat']);
  });
});

describe('00018 and the accounts already there', () => {
  it('keeps every name as it was when none differ only in capitals', async () => {
    const db = await databaseThrough('00017_ready_made_sign_in_names.sql');
    for (const name of ['Lily', 'SAM', 'rosie', "Mia-Rose O'Neil", 'PebbleKite']) await addUser(db, name);
    await runMigration(db, MIGRATION);
    expect(await usernames(db)).toEqual([
      { username: 'Lily', username_lower: 'lily' },
      { username: "Mia-Rose O'Neil", username_lower: "mia-rose o'neil" },
      { username: 'PebbleKite', username_lower: 'pebblekite' },
      { username: 'rosie', username_lower: 'rosie' },
      { username: 'SAM', username_lower: 'sam' },
    ]);
  });

  it('stops, changing nothing, when two accounts hold one name in different capitals', async () => {
    const db = await databaseThrough('00017_ready_made_sign_in_names.sql');
    await addUser(db, 'Lily');
    await addUser(db, 'lily');
    await addUser(db, 'Sam');
    await expect(runMigration(db, MIGRATION)).rejects.toThrow(
      /00018: 1 sign-in name\(s\) are held by more than one account in different capitals\. Nothing was changed/,
    );
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.columns
       where table_name = 'users' and column_name = 'username_lower'`,
    );
    expect(rows[0].n).toBe(0);
    const { rows: names } = await db.query<{ username: string }>(`select username from users order by username`);
    expect(names.map((r) => r.username)).toEqual(['Lily', 'Sam', 'lily']);
  });

  it('changes nothing when run a second time', async () => {
    const db = await migratedDatabase();
    await addUser(db, 'PebbleKite');
    const before = await db.query(`select count(*)::int as n from username_pool`);
    await runMigration(db, MIGRATION);
    expect(await usernames(db)).toEqual([{ username: 'PebbleKite', username_lower: 'pebblekite' }]);
    const after = await db.query(`select count(*)::int as n from username_pool`);
    expect(after.rows).toEqual(before.rows);
  });
});
