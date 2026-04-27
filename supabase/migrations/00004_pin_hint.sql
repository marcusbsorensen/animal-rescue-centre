-- Add pin_hint column for the Tier 2 forgot-PIN recovery flow.
-- See docs/forgot-pin-recovery.md.
--
-- The hint is captured at signup, validated client-side (and server-side)
-- to ensure it doesn't leak the PIN, and stored as plain text on the
-- user row. It's surfaced when the kid passes 2/3 of the recovery
-- questions in the forgot-PIN flow. Nullable for back-compat with
-- accounts created before this migration.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin_hint text;

COMMENT ON COLUMN users.pin_hint IS
  'Optional kid-set memory aid for their PIN, shown if they pass 2/3 recovery questions. See docs/forgot-pin-recovery.md.';
