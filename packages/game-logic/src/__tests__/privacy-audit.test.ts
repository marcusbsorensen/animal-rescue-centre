import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Privacy Audit Tests — §3 Child Safety & Privacy
 *
 * These verify the schema and codebase comply with the hard constraints:
 * - No email addresses collected (except parent, hashed)
 * - No free-text fields in user-facing tables
 * - No age field
 * - No location data
 */

const SCHEMA_PATH = path.resolve(__dirname, '../../../../supabase/migrations/00001_initial_schema.sql');
const RLS_PATH = path.resolve(__dirname, '../../../../supabase/migrations/00002_rls_policies.sql');

describe('Privacy Audit: Schema', () => {
  let schema: string;

  beforeAll(() => {
    schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  });

  it('parent_email_hash is the only email-related column and is hashed', () => {
    // Find all column definitions that mention "email"
    const columnDefs = schema.match(/^\s+\w*email\w*\s+/gim) ?? [];
    const columnNames = columnDefs.map((d) => d.trim().split(/\s+/)[0]);
    // The only email column should be parent_email_hash
    expect(columnNames).toEqual(['parent_email_hash']);
  });

  it('no age or date_of_birth column exists', () => {
    expect(schema.toLowerCase()).not.toContain('age ');
    expect(schema.toLowerCase()).not.toContain('date_of_birth');
    expect(schema.toLowerCase()).not.toContain('birthday');
    expect(schema.toLowerCase()).not.toContain('dob ');
  });

  it('no location or address columns exist', () => {
    expect(schema.toLowerCase()).not.toContain('latitude');
    expect(schema.toLowerCase()).not.toContain('longitude');
    expect(schema.toLowerCase()).not.toContain('address ');
    expect(schema.toLowerCase()).not.toContain('geolocation');
    expect(schema.toLowerCase()).not.toContain('ip_address');
  });

  it('gifts table uses preset message codes, not free text', () => {
    // The message_preset_code column should be text (a code), not a free-text "message" column
    expect(schema).toContain('message_preset_code text');
    // No free-text message column
    const giftSection = schema.substring(
      schema.indexOf('create table gifts'),
      schema.indexOf(');', schema.indexOf('create table gifts')) + 2
    );
    expect(giftSection).not.toContain('message text');
    expect(giftSection).not.toContain('custom_message');
  });

  it('usernames come from pool, not free text input', () => {
    expect(schema).toContain('create table username_pool');
    // The users table gets username from pool, not user input
    expect(schema).toContain('username text unique not null');
  });

  it('showcase_links have expiry', () => {
    expect(schema).toContain('expires_at timestamptz not null');
  });
});

describe('Privacy Audit: RLS', () => {
  let rls: string;

  beforeAll(() => {
    rls = fs.readFileSync(RLS_PATH, 'utf-8');
  });

  it('RLS is enabled on all user-facing tables', () => {
    const tables = [
      'users', 'friendships', 'game_states', 'rescue_stats',
      'badges_earned', 'gifts', 'username_pool', 'showcase_links',
      'audit_log', 'deletion_requests',
    ];
    tables.forEach((table) => {
      expect(rls).toContain(`alter table ${table} enable row level security`);
    });
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
