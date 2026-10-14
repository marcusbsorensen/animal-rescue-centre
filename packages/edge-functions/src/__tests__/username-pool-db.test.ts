import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PGliteInterface } from '@electric-sql/pglite';
import { migratedDatabase, asRole } from '../support/postgres';
import { isDisplayName } from '../../../game-logic/src/display-names';

/**
 * The ready-made sign-in name pool (migrations/00017) against a real
 * Postgres with every migration applied: what it is filled with, what it
 * offers, how a claim settles two children picking the same name, how it
 * tops itself up, and who may touch it.
 */

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGliteInterface;

beforeEach(async () => {
  db = await migratedDatabase();
});

async function count(where = 'true'): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from username_pool where ${where}`);
  return rows[0].n;
}

async function offer(n = 3): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>(`select arc_offer_sign_in_names($1) as name`, [n]);
  return rows.map((r) => r.name);
}

async function claim(name: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(`select arc_claim_sign_in_name($1) as ok`, [name]);
  return rows[0].ok;
}

async function addUser(username: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into users (username, pin_hash, avatar_emoji, avatar_bg_colour, join_code)
     values ($1, 'salt:hash', '🦊', '#ffd0a0', $2) returning id`,
    [username, `T-${Math.random().toString(36).slice(2, 8)}`],
  );
  return rows[0].id;
}

describe('username pool: filled by the migration', () => {
  it('holds every pair of up to 13 letters, 2,382 names, none taken', async () => {
    expect(await count(`source = 'ready-made'`)).toBe(2382);
    expect(await count(`length(username) > 13`)).toBe(0);
    expect(await count(`claimed_at is not null`)).toBe(0);
  });

  it('holds only names signup accepts, and none that is a display name', async () => {
    const { rows } = await db.query<{ username: string }>(`select username from username_pool`);
    for (const { username } of rows) {
      expect(username).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
      expect(username.length).toBeLessThanOrEqual(18);
      expect(isDisplayName(username), username).toBe(false);
    }
  });
});

describe('username pool: offering and claiming', () => {
  it('offers three different free names', async () => {
    const names = await offer();
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
  });

  it('gives a name to the first claim and refuses the second', async () => {
    const [name] = await offer(1);
    expect(await claim(name)).toBe(true);
    expect(await claim(name)).toBe(false);
  });

  it('never offers a claimed name again', async () => {
    // Every name starting with P is taken, leaving about 1,900 free, so
    // no top-up runs and every offer comes from the free ones.
    await db.query(`update username_pool set claimed_at = now() where username like 'P%'`);
    for (let i = 0; i < 30; i++) {
      for (const name of await offer(6)) expect(name.startsWith('P'), name).toBe(false);
    }
  });

  it('never offers or gives out a name that is somebody\'s login, in any capitals', async () => {
    await addUser('pebblekite');
    expect(await claim('PebbleKite')).toBe(false);
    for (let i = 0; i < 20; i++) expect(await offer(6)).not.toContain('PebbleKite');
  });

  it('refuses a name that is not in the pool at all', async () => {
    expect(await claim('Lily')).toBe(false);
  });
});

describe('username pool: topping up', () => {
  it('adds nothing when there are plenty of free names', async () => {
    const { rows } = await db.query<{ n: number }>(`select arc_refill_username_pool(300) as n`);
    expect(rows[0].n).toBe(0);
  });

  it('adds the pairs again with a number once fewer than 300 are free', async () => {
    await db.query(`update username_pool set claimed_at = now() where username not like 'A%'`);
    expect(await count(`claimed_at is null`)).toBeLessThan(300);

    const names = await offer(3);
    expect(names).toHaveLength(3);
    expect(await count(`source = 'ready-made-numbered'`)).toBe(2382);
    expect(await count(`username = 'PebbleKite2'`)).toBe(1);
    // Never a number display names leave out.
    for (const n of [1, 14, 18, 69, 88]) expect(await count(`username like '%Kite${n}'`)).toBe(0);
  });

  it('gives back a claim whose signup never finished, after an hour', async () => {
    await db.query(`update username_pool set claimed_at = now() - interval '2 hours' where username = 'PebbleKite'`);
    await db.query(`update username_pool set claimed_at = now() - interval '5 minutes' where username = 'AcornDrum'`);
    const id = await addUser('MoonSock');
    await db.query(
      `update username_pool set claimed_at = now() - interval '2 hours', claimed_by = $1 where username = 'MoonSock'`,
      [id],
    );
    await db.query(`select arc_refill_username_pool(300)`);
    expect(await count(`username = 'PebbleKite' and claimed_at is null`)).toBe(1);
    expect(await count(`username = 'AcornDrum' and claimed_at is not null`)).toBe(1);
    expect(await count(`username = 'MoonSock' and claimed_at is not null`)).toBe(1);
  });

  it('can run again and changes nothing', async () => {
    await db.query(`select arc_refill_username_pool(300)`);
    expect(await count()).toBe(2382);
  });
});

describe('username pool: who may touch it', () => {
  for (const role of ['anon', 'authenticated'] as const) {
    it(`${role} can neither read the pool nor offer, claim or refill`, async () => {
      for (const sql of [
        `select username from username_pool limit 1`,
        `select arc_offer_sign_in_names(3)`,
        `select arc_claim_sign_in_name('PebbleKite')`,
        `select arc_refill_username_pool(300)`,
      ]) {
        await expect(asRole(db, role, () => db.query(sql)), `${role}: ${sql}`)
          .rejects.toThrow(/permission denied/);
      }
    });
  }

  it('the Edge Functions (service role) can offer and claim', async () => {
    const names = await asRole(db, 'service_role', () => offer(3));
    expect(names).toHaveLength(3);
    expect(await asRole(db, 'service_role', () => claim(names[0]))).toBe(true);
  });
});
