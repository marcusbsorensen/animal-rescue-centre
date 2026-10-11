-- The PIN clue becomes a choice from a fixed list, and every typed hint
-- is blanked.
--
-- `users.pin_hint` (00004) held free text a child typed at signup, up to
-- 100 characters, stored as typed and returned by get-pin-hint to anyone
-- who knew the player's name. A child could write anything about
-- themselves in it, and the server never checked.
--
-- The new column holds a code from the list in
-- supabase/functions/_shared/pin-hints.ts (the same list as
-- packages/game-logic/src/pin-hints.ts; pin-hints.test.ts holds the
-- three, and this constraint, to one list).
--
-- Order of running on production, because the deployed functions change
-- at the same time (00012 has its own step, folded in here):
--   1. set the RATE_LIMIT_ADDRESS_KEY function secret (see 00012);
--   2. run this file by hand (SQL editor). It adds the new column and
--      blanks the old one; the old functions keep working, since the old
--      column still exists;
--   3. deploy signup, get-pin-hint, login and send-gift;
--   4. `supabase db push`, which runs this file again (safe), then 00011
--      (drops the old column) and 00012.
-- Running `supabase db push` before step 3 drops a column the deployed
-- functions still use.

alter table users
  add column if not exists pin_hint_code text
  constraint users_pin_hint_code_check check (
    pin_hint_code in ('birthday', 'year', 'pet', 'shirt', 'pattern', 'favourite')
  );

comment on column users.pin_hint_code is
  'Clue the player picked for their PIN, from a fixed list (supabase/functions/_shared/pin-hints.ts). Never typed text.';

-- Every typed hint goes now, not when the column is dropped.
update users set pin_hint = null where pin_hint is not null;

-- Between this migration and the deploy, the old signup function can
-- still send a typed hint. Blank it on the way in, so nothing typed is
-- stored again. 00011 drops this with the column.
create or replace function users_blank_pin_hint()
returns trigger
language plpgsql
as $$
begin
  new.pin_hint := null;
  return new;
end;
$$;

-- Dropped first so this file can run twice: by hand in the SQL editor
-- before the deploy, then again from `supabase db push`, which does not
-- know it already ran.
drop trigger if exists users_blank_pin_hint on users;
create trigger users_blank_pin_hint
  before insert or update of pin_hint on users
  for each row execute function users_blank_pin_hint();

