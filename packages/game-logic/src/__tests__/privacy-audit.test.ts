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
 * - Player names: the name a child types is their login and stays with
 *   them; everything other players see carries a display name made from
 *   two word lists. Both halves are asserted, so undoing either fails.
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
      const dropped = stmt.match(/drop table (?:if exists )?(\w+)/);
      if (dropped) { tables.delete(dropped[1]); continue; }
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
    // username_lower (00018) is username in small letters, made by the
    // database: the same name, not a second piece of data about the child.
    expect([...schema.get('users')!].sort()).toEqual([
      'avatar_bg_colour',
      'avatar_emoji',
      'created_at',
      'display_name',
      'id',
      'is_active',
      'join_code',
      'last_seen_at',
      'pin_hash',
      'pin_hint_code',
      'username',
      'username_lower',
    ]);
  });

  it('the PIN clue is a code the database holds to a fixed list', () => {
    expect(allSql).toMatch(/pin_hint_code text\s+constraint \w+ check \(\s*pin_hint_code in \(/);
  });

  it('no table holds an email address or a hash of one', () => {
    // users.parent_email_hash held an unkeyed SHA-256 of any parent email
    // signup was sent, and no screen ever asked for one. 00013 drops it,
    // and deletion_requests, which nothing read or wrote.
    const emailCols = [...schema.entries()]
      .flatMap(([t, cols]) => [...cols].filter((c) => c.includes('email')).map((c) => `${t}.${c}`));
    expect(emailCols).toEqual([]);
    expect(schema.has('deletion_requests')).toBe(false);
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

describe('Privacy Audit: no parent email', () => {
  // Decided 2026-10-12: a grown-up asks for a deletion through the help
  // page, so ARC takes no parent email. The signup step that promised one
  // was never shown, and the hash it fed was never read.

  it('signup does not read or hash a parent email', () => {
    const src = read('supabase/functions/signup/index.ts');
    expect(src).not.toMatch(/parentEmail/);
    expect(src).not.toMatch(/parent_email/);
    expect(src).not.toMatch(/hashEmail/);
  });

  it('there is no email hashing helper left to call', () => {
    expect(read('supabase/functions/_shared/crypto.ts')).not.toMatch(/hashEmail/);
  });

  it('the app sends no parent email and has no step that asks for one', () => {
    expect(read('apps/game/src/lib/auth.ts')).not.toMatch(/parentEmail/);
    const scene = read('apps/game/src/scenes/SignupScene.ts');
    expect(scene).not.toMatch(/parentEmail/);
    expect(scene).not.toMatch(/showParentStep/);
    expect(scene).not.toMatch(/'parent'/);
  });

  it('00013 refuses to run while any account holds a parent email hash', () => {
    const raw = read('supabase/migrations/00013_drop_parent_email.sql');
    // The header gives Marcus the query to run first, by hand.
    expect(raw).toContain('select count(*) from users where parent_email_hash is not null');
    // And the migration checks the same thing itself before dropping.
    const sql = raw.replace(/--[^\n]*/g, '').toLowerCase();
    expect(sql).toMatch(/if exists \(select 1 from users where parent_email_hash is not null\)/);
    // A row in deletion_requests would be a request nobody acted on.
    expect(sql).toMatch(/if exists \(select 1 from deletion_requests\)/);
    expect(sql).toMatch(/raise exception/);
    expect(sql.indexOf('raise exception')).toBeLessThan(sql.indexOf('drop column'));
    expect(sql.indexOf('raise exception')).toBeLessThan(sql.indexOf('drop table'));
  });
});

describe('Privacy Audit: player names', () => {
  // The child used to type a name at signup. It was their login, and it
  // used to be what friends, the gift inbox, the friends board and a
  // public showcase showed too. Since 2026-10-12 other players see a
  // display name instead, made from two word lists
  // (packages/game-logic/src/display-names.ts): MossyOtter, or MossyOtter7
  // when that one is taken. Since 2026-10-14 the login is a ready-made
  // name too (packages/game-logic/src/sign-in-names.ts): PebbleKite,
  // picked from three the server offers, never typed.
  let signup: string;
  let allSql: string;

  beforeAll(() => {
    signup = read('supabase/functions/signup/index.ts');
    allSql = migrations().map((m) => m.sql).join('\n');
  });

  it('the login is picked from ready-made names: the signup page has no box to type one', () => {
    const page = read('apps/game/public/admin/signup.html');
    expect(page).not.toMatch(/<input[^>]*type="text"/);
    expect(page).toContain("send('need-names')");
    expect(page).toMatch(/send\('signup-complete', \{[^}]*readyMadeName: true/);
    // The server claims a ready-made name before making the account.
    expect(signup).toContain('claimSignInName(supabase, trimmedUsername)');
  });

  it('a typed login from an older build is still 2 to 18 letters past a short blocklist', () => {
    expect(signup).toContain('trimmedUsername.length < 2 || trimmedUsername.length > 18');
    expect(signup).toMatch(/const blocklist = \[/);
    expect(read('supabase/functions/login/index.ts')).toMatch(/\.eq\('username_lower', key\)/);
  });

  it('a sign-in name ignores capitals, and each name is held once in any capitals', () => {
    // Hub 96, Marcus 2026-10-14: "do NOT make them case sensitive".
    expect(allSql).toMatch(/add column if not exists username_lower text\s+generated always as \(lower\(username\)\) stored/);
    expect(allSql).toMatch(/create unique index if not exists users_username_lower_key on users \(username_lower\)/);
    expect(allSql).toMatch(/create unique index if not exists username_pool_username_lower_key\s+on username_pool \(lower\(username\)\)/);
    // Every lookup by name, and every per-name rate limit, is in small letters.
    for (const fn of ['login', 'get-pin-hint']) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src, fn).not.toMatch(/\.eq\('username',/);
      expect(src, fn).toContain("from '../_shared/login-name.ts'");
    }
    // signup's taken check; its one exact match left is on the pool, by
    // the name the pool itself offered.
    expect(signup).toContain(".eq('username_lower', loginKey(trimmedUsername))");
    expect(read('supabase/functions/login/index.ts')).toContain('`login:${key}`');
    expect(read('supabase/functions/get-pin-hint/index.ts')).toContain('`hint:${key}`');
  });

  it('a taken name gets ready-made suggestions, never ones made from the typed name', () => {
    expect(signup).not.toMatch(/suggestAvailableUsernames|\$\{base\}/);
    expect(signup).toContain('suggestions: existingUser ? await offerSignInNames(supabase, 3) : []');
  });

  it('every account has a display name, which the database holds to the word lists', () => {
    expect(allSql).toMatch(/alter table users add column if not exists display_name text/);
    expect(allSql).toMatch(/alter column display_name set not null/);
    expect(allSql).toMatch(/create unique index if not exists \w+ on users \(display_name\)/);
    expect(allSql).toMatch(/check \(arc_is_display_name\(display_name\)\)/);
    // An account made without one (an older signup) gets one from the lists.
    expect(allSql).toMatch(/alter column display_name set default arc_new_display_name\(\)/);
  });

  it('signup takes only a pair from the lists from the app, and adds any number itself', () => {
    expect(signup).toMatch(/isDisplayNameBase\(displayName\)/);
    expect(signup).toContain('display_name:');
  });

  it('a friend is told the display name, never the typed name', () => {
    const src = read('supabase/functions/add-friend/index.ts');
    expect(src).toContain('displayName: friend.display_name');
    expect(src).not.toMatch(/\busername\b/);
  });

  it('signup shows the child the name other players see, and sends it', () => {
    const page = read('apps/game/public/admin/signup.html');
    expect(page).toContain('Friends see this name');
    expect(page).toMatch(/send\('signup-complete', \{[^}]*displayName/);
    // The host passes on only a pair from the lists.
    expect(read('apps/game/src/auth-overlay/AuthOverlay.ts')).toMatch(/isDisplayNameBase\(raw\.displayName\)/);
  });

  it('the game shows other players by display name, and never asks for their login', () => {
    // The friends list comes from get-friends (146A), which reads the
    // display name; the game reads gifts and the board itself.
    for (const file of ['supabase/functions/get-friends/index.ts', 'apps/game/src/lib/gifts.ts']) {
      const src = read(file);
      expect(src, file).toContain('display_name');
      expect(src, file).not.toMatch(/\busername\b/);
    }
    const friendsLib = read('apps/game/src/lib/friends.ts');
    expect(friendsLib).toContain("invoke('get-friends'");
    expect(friendsLib).not.toMatch(/\busername\b/);
    for (const file of ['apps/game/src/scenes/SocialScene.ts', 'apps/game/src/scenes/FriendsScene.ts']) {
      expect(read(file), file).not.toMatch(/\.username\b|fromUsername/);
    }
    const friendsPage = read('apps/game/public/admin/friends.html');
    expect(friendsPage).toContain('f.displayName');
    expect(friendsPage).not.toMatch(/f\.username/);
  });

  it('a public showcase carries the display name, never the typed name', () => {
    const create = read('supabase/functions/create-showcase/index.ts');
    expect(create).toContain('displayName: user.display_name');
    expect(create).not.toMatch(/\busername\b/);
    // Showcases made before display names lose the typed name twice over:
    // 00014 rewrites them, and get-showcase drops it on the way out.
    expect(allSql).toMatch(/update showcase_links[\s\S]*snapshot - 'username'/);
    expect(read('supabase/functions/get-showcase/index.ts')).toMatch(/delete \w+\.username|username: _/);
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

describe('Privacy Audit: deleting an account', () => {
  // Apple guideline 5.1.1(v), and DPIA findings 5 and G3: a player can
  // delete their account from the account screen, and the deletion
  // reaches every row about them, not only those a cascade happens to.
  // packages/edge-functions/src/__tests__/delete-account-db.test.ts runs
  // it against a real Postgres; this checks the list stays whole.
  let fn: string;

  beforeAll(() => {
    const sql = migrations().map((m) => m.sql).join('\n');
    const start = sql.lastIndexOf('create or replace function delete_account(');
    expect(start).toBeGreaterThan(-1);
    fn = sql.slice(start, sql.indexOf('$$;', start));
  });

  it('every table that points at a player is cleared by name', () => {
    const pointing = migrations()
      .flatMap(({ sql }) => sql.split(';'))
      .map((stmt) => stmt.match(/create table (?:if not exists )?(\w+)\s*\(([\s\S]*)\)\s*$/))
      .filter((m): m is RegExpMatchArray => !!m && /references users\b/.test(m[2]))
      .map((m) => m[1])
      .filter((t) => currentSchema().has(t));
    expect(pointing.length).toBeGreaterThan(5);
    for (const table of pointing) {
      expect(fn, table).toMatch(new RegExp(`(delete from|update) ${table}\\b`));
    }
  });

  it('also clears the rows a cascade leaves: the activity log and the rate limits', () => {
    // audit_log.user_id is set null, not removed, and the signup row holds
    // the typed name; other players' rows hold the id or join code.
    expect(fn).toMatch(/delete from audit_log\s+where user_id = p_user_id\s+or target_id = p_user_id/);
    expect(fn).toContain("metadata->>'from_user'");
    expect(fn).toContain("metadata->>'join_code'");
    // login:<name> and hint:<name> hold the typed name; gift keys the id.
    expect(fn).toMatch(/delete from rate_limits/);
    expect(fn).toContain("key like 'login:%'");
    expect(fn).toContain("key like 'hint:%'");
    expect(fn).toMatch(/position\(p_user_id::text in key\)/);
  });

  it('only the service role can call it', () => {
    const raw = read('supabase/migrations/00015_delete_account.sql').toLowerCase();
    expect(raw).toMatch(/revoke execute on function delete_account\(uuid\) from public, anon, authenticated/);
  });

  it('the function takes the account from the session and checks the PIN', () => {
    const src = read('supabase/functions/delete-account/index.ts');
    expect(src).toMatch(/requireSession\(req, supabase\)/);
    expect(src).toMatch(/verifyPin\(pin, user\.pin_hash\)/);
    expect(src).toContain("rpc('delete_account', {\n      p_user_id: userId,");
    // The body gives a PIN and nothing else.
    expect(src).toContain('const { pin } = await req.json();');
  });
});

describe('Privacy Audit: what the public key can read', () => {
  // The anon key ships in the app. 00016 takes away what the game never
  // asks it for (DPIA open items 7 and 8, gaps G5 and G6).
  let sql: string;

  beforeAll(() => {
    sql = migrations().map((m) => m.sql).join('\n');
  });

  it('no rule lets it list showcases, which carry pet names a child typed', () => {
    const created = sql.lastIndexOf('create policy "showcase_read_public"');
    const dropped = sql.lastIndexOf('drop policy if exists "showcase_read_public"');
    expect(dropped).toBeGreaterThan(created);
    expect(sql).toContain('revoke all on table showcase_links from anon, authenticated');
  });

  it('it may read four columns of users, and the typed name is not one', () => {
    expect(sql).toContain('revoke all on table users from anon, authenticated');
    const grant = sql.match(/grant select \(([^)]*)\)\s+on table users to anon, authenticated/);
    expect(grant?.[1].split(',').map((c) => c.trim()).sort())
      .toEqual(['avatar_bg_colour', 'avatar_emoji', 'display_name', 'id']);
  });

  it('it reads nothing from the pool of sign-in names', () => {
    // 00016 let it read unclaimed names. 00017 takes that back: the names
    // are made from public word lists, so the free ones would show, by
    // what is missing, every child's sign-in name.
    expect(sql.lastIndexOf('drop policy if exists "username_pool_read_unclaimed"'))
      .toBeGreaterThan(sql.lastIndexOf('create policy "username_pool_read_unclaimed"'));
    const lastGrant = sql.lastIndexOf('grant select (username, claimed_at) on table username_pool');
    expect(sql.lastIndexOf('revoke all on table username_pool from anon, authenticated'))
      .toBeGreaterThan(lastGrant);
    expect(read('apps/game/src/lib/auth.ts')).not.toMatch(/from\('username_pool'\)/);
  });

  it('only the Edge Functions may offer, claim or refill sign-in names', () => {
    for (const fn of [
      'arc_refill_username_pool(int)',
      'arc_offer_sign_in_names(int)',
      'arc_claim_sign_in_name(text)',
    ]) {
      expect(sql).toContain(`revoke execute on function ${fn} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function ${fn} to service_role`);
    }
  });

  it('the game no longer searches sign-in names with it', () => {
    expect(read('apps/game/src/lib/auth.ts')).not.toMatch(/from\('users'\)/);
  });
});

describe('Privacy Audit: how long things are kept (43A, 44B, 45A, 46B)', () => {
  // The privacy page states these periods, and docs/legal/dpia-arc.md
  // repeats them. A change here is a change to both, so it fails until
  // the page and the DPIA are looked at too.
  // packages/edge-functions/src/__tests__/retention-db.test.ts runs the
  // jobs against a real Postgres.
  let sql: string;
  const body = (name: string): string => {
    const start = sql.lastIndexOf(`create or replace function ${name}(`);
    expect(start, name).toBeGreaterThan(-1);
    return sql.slice(start, sql.indexOf('$$;', start));
  };

  beforeAll(() => {
    sql = migrations().map((m) => m.sql).join('\n');
  });

  it('an account goes 3 years after it was last used, through delete_account', () => {
    const fn = body('arc_retention_accounts');
    expect(fn).toContain("now() - interval '3 years'");
    expect(fn).toContain('coalesce(u.last_seen_at, u.created_at)');
    expect(fn).toContain('s.last_used_at >=');
    // Every row of the child's goes the way an in-game deletion takes it,
    // not by a cascade that leaves the log and the counters behind.
    expect(fn).toContain('perform delete_account(v_id)');
    expect(fn).not.toMatch(/delete from users/);
  });

  it('an activity-log entry goes 2 years after it was made', () => {
    expect(body('arc_retention_audit_log')).toContain("created_at < now() - interval '2 years'");
  });

  it('a rate-limit counter goes 1 day after its window closed', () => {
    expect(body('arc_retention_rate_limits')).toContain("reset_at < now() - interval '1 day'");
  });

  it('a showcase goes 30 days after its link stopped working', () => {
    expect(body('arc_retention_showcases')).toContain("expires_at < now() - interval '30 days'");
  });

  it('the dry run uses the same periods', () => {
    const fn = body('arc_retention_preview');
    for (const period of ["interval '3 years'", "interval '2 years'", "interval '1 day'", "interval '30 days'"]) {
      expect(fn).toContain(period);
    }
  });

  it('the public key can call none of them', () => {
    for (const fn of [
      'arc_retention_accounts(int)', 'arc_retention_audit_log(int)', 'arc_retention_rate_limits(int)',
      'arc_retention_showcases(int)', 'arc_retention_preview()', 'arc_retention_run()',
      'arc_retention_schedule()', 'arc_retention_unschedule()',
    ]) {
      expect(sql, fn).toContain(`revoke execute on function ${fn} from public, anon, authenticated`);
    }
  });
});
