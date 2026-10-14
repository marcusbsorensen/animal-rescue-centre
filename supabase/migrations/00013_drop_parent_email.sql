-- Drop the parent email hash and the deletion requests table.
--
-- Decided 2026-10-12: a grown-up asks for an account to be deleted
-- through the help page, so ARC keeps no parent email. No screen ever
-- asked for one (the signup step that promised it was never shown), but
-- signup kept an unkeyed SHA-256 of any `parentEmail` it was sent, in
-- users.parent_email_hash. deletion_requests was never read or written.
--
-- BEFORE RUNNING, by hand in the SQL editor, both must return 0:
--
--   select count(*) from users where parent_email_hash is not null;
--   select count(*) from deletion_requests;
--
-- A hash is not reversible, so a non-zero first count cannot be turned
-- back into an address to write to; stop and decide what to do with
-- those accounts first. A row in the second would be a request to delete
-- that nobody acted on. This migration checks both itself and stops if
-- either is non-zero, so running it by mistake changes nothing.
--
-- Run only after signup has been deployed from the same commit: the
-- signup deployed before that writes `parent_email_hash: null` on every
-- new account, and would fail once the column is gone.

do $$
begin
  if exists (select 1 from users where parent_email_hash is not null) then
    raise exception 'users.parent_email_hash holds values; see the header of 00013';
  end if;
  if exists (select 1 from deletion_requests) then
    raise exception 'deletion_requests has rows; see the header of 00013';
  end if;
end
$$;

alter table users drop column if exists parent_email_hash;

drop table if exists deletion_requests;
