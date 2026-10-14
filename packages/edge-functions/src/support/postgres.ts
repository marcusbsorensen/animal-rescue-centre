/**
 * A real Postgres, in-process, with every migration in
 * `supabase/migrations/` applied in order.
 *
 * PGlite is Postgres compiled to WebAssembly: no server, no Docker, no
 * network. The fake client in `fake-supabase.ts` records what a function
 * asks for; this answers the questions only a database can, such as
 * whether a SQL function deleted what it says it deleted, and what the
 * public key can read once the row level security rules have run.
 *
 * Supabase adds a few things before any migration runs, and this adds
 * the same ones: the `anon`, `authenticated` and `service_role` roles,
 * `auth.uid()`, which reads the caller's id from the request settings
 * as PostgREST sets them, and the default grants that give those roles
 * every table and function made in `public` (so a migration has to
 * revoke what it does not want them to have, exactly as in production).
 */
import { PGlite, type PGliteInterface } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../supabase/migrations');

const SUPABASE_PRELUDE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export function migrationFiles(): string[] {
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
}

let template: Promise<PGlite> | null = null;

async function migrate(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_PRELUDE);
  for (const file of migrationFiles()) {
    try {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    } catch (err) {
      throw new Error(`${file} failed: ${(err as Error).message}`);
    }
  }
  return db;
}

/**
 * A fresh database with the migrations up to and including `lastFile`
 * applied, and none after it: for testing what a migration does to rows
 * that were there before it ran. Not cached.
 */
export async function databaseThrough(lastFile: string): Promise<PGlite> {
  const files = migrationFiles();
  if (!files.includes(lastFile)) throw new Error(`no migration ${lastFile}`);
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_PRELUDE);
  for (const file of files.slice(0, files.indexOf(lastFile) + 1)) {
    await runMigration(db, file);
  }
  return db;
}

/** Run one migration file, as `supabase db push` would. */
export async function runMigration(db: PGliteInterface, file: string): Promise<void> {
  try {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
  } catch (err) {
    throw new Error(`${file} failed: ${(err as Error).message}`);
  }
}

/**
 * A fresh database with every migration applied. The migrations run once
 * per test file; each call after that is a copy of the result.
 */
export async function migratedDatabase(): Promise<PGliteInterface> {
  template ??= migrate();
  return (await template).clone();
}

/**
 * Run `fn` as one of Supabase's roles, as PostgREST would for a request
 * made with that key, then go back to the owner.
 */
export async function asRole<T>(
  db: PGliteInterface,
  role: 'anon' | 'authenticated' | 'service_role',
  fn: () => Promise<T>,
  userId?: string,
): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
