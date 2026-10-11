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
-- Order of running, because the deployed functions change at the same
-- time:
--   1. this migration (adds the new column, blanks the old one; the old
--      functions keep working, since the old column still exists);
--   2. deploy signup and get-pin-hint;
--   3. 00011, which drops the old column.

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

create trigger users_blank_pin_hint
  before insert or update of pin_hint on users
  for each row execute function users_blank_pin_hint();

