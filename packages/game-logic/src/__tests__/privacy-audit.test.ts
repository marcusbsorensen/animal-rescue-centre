import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Privacy Audit Tests — §3 Child Safety & Privacy
 *
 * These read the schema as every migration leaves it, and the Edge
 * Functions and pages that put data into it. They assert what is true
 * today, including the gaps, so that a change in either direction fails
 * here and has to be looked at:
 *
 * - A new column on `users`, or a new table, fails until it is listed
 *   below, which is the moment to ask what a child could put in it.
 * - The known gap (a child types their own player name, and it is public
 *   to friends and on a showcase) is asserted as it is, with the reason.
 *   Fixing it fails these tests, and the fix updates them.
 *
 * This file used to read migration 00001 alone, so it could not see
 * `pin_hint` (00004, free text a child typed) or `rate_limits` (00007,
 * keyed by IP address), and it claimed usernames came from the pool when
 * signup had accepted any typed name since 2026-04.
 */

const ROOT = path.resolve(__dirname, '../../../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

/** Migration SQL in the order Supabase applies it, comments removed. */
function migrations(): Array<{ file: string; sql: string }> {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort()
    .map((file) => ({
      file,
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')
        .replace(/--[^\n]*/g, '')
        .toLowerCase(),
    }));
}

const NOT_COLUMNS = new Set(['primary', 'check', 'unique', 'constraint', 'foreign', 'exclude']);

/**
 * Each table's columns after every migration has run: `create table`,
 * then `add column` and `drop column` in order. Enough SQL for this
 * repository's migrations, not a general parser.
 */
function currentSchema(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const { sql } of migrations()) {
    // Statements in file order, so an add and a later drop apply in turn.
    for (const stmt of sql.split(';')) {
      const create = stmt.match(/create table (?:if not exists )?(\w+)\s*\(([\s\S]*)\)\s*$/);
      if (create) {
        const cols = new Set<string>();
        let depth = 0;
        let item = '';
        for (const ch of create[2]) {
          if (ch === '(') depth++;
          if (ch === ')') depth--;
          if (ch === ',' && depth === 0) { addColumn(cols, item); item = ''; } else item += ch;
        }
        addColumn(cols, item);
        tables.set(create[1], cols);
        continue;
      }
      const alter = stmt.match(/alter table (?:if exists )?(\w+)\s+([\s\S]*)$/);
      if (!alter) continue;
      const cols = tables.get(alter[1]);
      if (!cols) continue;
      for (const m of alter[2].matchAll(/add column (?:if not exists )?(\w+)/g)) cols.add(m[1]);
      for (const m of alter[2].matchAll(/drop column (?:if exists )?(\w+)/g)) cols.delete(m[1]);
    }
  }
  return tables;
}

function addColumn(cols: Set<string>, item: string): void {
  const first = item.trim().split(/\s+/)[0];
  if (first && !NOT_COLUMNS.has(first)) cols.add(first);
}

describe('Privacy Audit: schema after every migration', () => {
  let schema: Map<string, Set<string>>;
  let allSql: string;

  beforeAll(() => {
    schema = currentSchema();
    allSql = migrations().map((m) => m.sql).join('\n');
  });

  it('reads every migration, not only the first', () => {
    const files = migrations().map((m) => m.file);
    expect(files[0]).toBe('00001_initial_schema.sql');
    expect(files.length).toBeGreaterThan(1);
    // A table from a later migration is in the schema.
    expect(schema.has('rate_limits')).toBe(true);
    expect(schema.has('sessions')).toBe(true);
  });

  it('every table is one this audit has looked at', () => {
    // A new table fails here until it is added, with a line on what it holds.
    expect([...schema.keys()].sort()).toEqual([
      'audit_log',              // actions; metadata is server-written
      'badges_earned',          // codes
      'calendar_events',        // game calendar, codes
      'deletion_requests',      // unused: nothing reads or writes it
      'depot_inventory_ledger', // game economy
      'depot_sessions',         // game economy
      'friendships',            // ids
      'game_states',            // jsonb written by save-game
      'gifts',                  // preset codes, no free text
      'rate_limits',            // keys; see the address test below
      'rescue_stats',           // counts
      'sessions',               // tokens
      'showcase_links',         // public snapshot, expires
      'supply_run_records',     // game economy
      'username_pending_review',// candidate pool names
      'username_pool',          // suggested names
      'users',                  // see below
    ]);
  });

  it('users holds these columns and no others', () => {
    // username is typed by the child (see "player names" below).
    // pin_hint (00004, free text) is gone: 00010 blanked it, 00011 drops it.
    expect([...schema.get('users')!].sort()).toEqual([
      'avatar_bg_colour',
      'avatar_emoji',
      'created_at',
      'id',
      'is_active',
      'join_code',
      'last_seen_at',
      'parent_email_hash',
      'pin_hash',
      'pin_hint_code',
      'username',
    ]);
  });

  it('the PIN clue is a code the database holds to a fixed list', () => {
    expect(allSql).toMatch(/pin_hint_code text\s+constraint \w+ check \(\s*pin_hint_code in \(/);
  });

  it('parent_email_hash is the only email-related column', () => {
    const emailCols = [...schema.entries()]
      .flatMap(([t, cols]) => [...cols].filter((c) => c.includes('email')).map((c) => `${t}.${c}`));
    expect(emailCols).toEqual(['users.parent_email_hash']);
  });

  it('no age or date_of_birth column exists', () => {
    const cols = [...schema.values()].flatMap((c) => [...c]);
    for (const bad of ['age', 'date_of_birth', 'dob', 'birthday', 'birth_year']) {
      expect(cols).not.toContain(bad);
    }
  });

  it('no location or address column exists', () => {
    const cols = [...schema.values()].flatMap((c) => [...c]);
    for (const bad of ['latitude', 'longitude', 'address', 'ip_address', 'ip', 'geolocation', 'postcode']) {
      expect(cols).not.toContain(bad);
    }
  });

  it('gifts carry a preset message code, not free text', () => {
    const gifts = schema.get('gifts')!;
    expect(gifts.has('message_preset_code')).toBe(true);
    expect(gifts.has('message')).toBe(false);
    expect(gifts.has('custom_message')).toBe(false);
  });

  it('showcase_links have expiry', () => {
    expect(schema.get('showcase_links')!.has('expires_at')).toBe(true);
    expect(allSql).toContain('expires_at timestamptz not null');
  });

  it('every table has row level security turned on', () => {
    for (const table of schema.keys()) {
      expect(allSql, table).toContain(`alter table ${table} enable row level security`);
    }
  });
});

describe('Privacy Audit: IP addresses', () => {
  const FUNCTIONS = ['signup', 'login', 'get-pin-hint', 'send-gift'];

  it('no function puts a raw address into a rate-limit key', () => {
    for (const fn of FUNCTIONS) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src, fn).not.toMatch(/-ip:\$\{ip\}/);
      expect(src, fn).not.toMatch(/\bclientIp\(/);
      expect(src, fn).toMatch(/\baddressKey\(req\)/);
    }
  });

  it('the address is hashed with HMAC under a secret from the function env', () => {
    const shared = read('supabase/functions/_shared/rate-limit.ts');
    expect(shared).toMatch(/name: 'HMAC', hash: 'SHA-256'/);
    expect(shared).toContain("Deno.env.get('RATE_LIMIT_ADDRESS_KEY')");
  });

  it('the database removes raw-address rows and refuses new ones', () => {
    const sql = migrations().find((m) => m.file.startsWith('00012_'))?.sql ?? '';
    expect(sql).toMatch(/delete from rate_limits/);
    expect(sql).toMatch(/add constraint \w+ check/);
    expect(sql).toContain("[0-9a-f]{64}$");
  });
});

describe('Privacy Audit: player names (known gap, asserted as it is)', () => {
  // The child types their own player name. The pool in `username_pool`
  // only supplies suggestions, and signup marks a pool name claimed if
  // one was used. The typed name is shown to friends, in the gift inbox,
  // on the friends board and in a public showcase, and it is also the
  // login. The proposal for a separate display name drawn from a pool is
  // in the child-data report of 2026-10-11 (branch claude/child-data-gaps).
  //
  // When that is built these assertions fail, and they should be
  // rewritten to assert the new state.
  let signup: string;

  beforeAll(() => {
    signup = read('supabase/functions/signup/index.ts');
  });

  it('signup accepts any name of 2 to 18 letters that passes a short blocklist', () => {
    expect(signup).toContain('trimmedUsername.length < 2 || trimmedUsername.length > 18');
    expect(signup).toMatch(/const blocklist = \[/);
    // The name is never checked against the pool before the account is made.
    expect(signup).not.toMatch(/from\('username_pool'\)\s*\.select/);
    expect(signup).toMatch(/from\('username_pool'\)\s*\.update/);
  });

  it('the signup page asks the child to type the name', () => {
    expect(read('apps/game/public/admin/signup.html')).toMatch(/<input[^>]*class="name-field"/);
  });

  it('the typed name is also the login', () => {
    expect(read('supabase/functions/login/index.ts')).toMatch(/\.eq\('username', username\)/);
  });

  it('the typed name goes into a public showcase and to friends', () => {
    expect(read('supabase/functions/create-showcase/index.ts')).toContain('username: user.username');
    expect(read('supabase/functions/add-friend/index.ts')).toContain('username: friend.username');
  });
});

describe('Privacy Audit: RLS', () => {
  let rls: string;

  beforeAll(() => {
    rls = read('supabase/migrations/00002_rls_policies.sql');
  });

  it('username_pending_review has RLS enabled (admin only)', () => {
    expect(rls).toContain('alter table username_pending_review enable row level security');
  });

  it('game_states is restricted to own user', () => {
    expect(rls).toContain('game_states_all_own');
    expect(rls).toContain('user_id = auth.uid()');
  });

  it('audit_log has no client read policy', () => {
    // Audit log should not have a SELECT policy for regular users
    // Extract only the audit_log section (between AUDIT_LOG comment and next section)
    const auditStart = rls.indexOf('-- AUDIT_LOG');
    const auditEnd = rls.indexOf('-- DELETION_REQUESTS');
    const auditSection = rls.substring(auditStart, auditEnd > auditStart ? auditEnd : rls.length);
    expect(auditSection).not.toContain('for select');
  });
});
