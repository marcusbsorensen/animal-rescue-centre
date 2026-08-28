-- Optimistic-concurrency version for saved games.
--
-- `game_states` has one row per child and save-game wrote it with a blind
-- upsert. A family with two iPads — or one iPad and the web build — meant
-- whichever device happened to save last silently erased everything the
-- other had done since. There was no way to notice, because there was
-- nothing to compare: `updated_at` records when a write happened, not what
-- the writer believed it was overwriting.
--
-- This column is that comparison. Every save carries the version the client
-- last saw; the update only lands `where version = <that value>`, and the
-- row's version moves on. A device working from a stale copy matches no
-- row, and save-game answers 409 with the current state instead of
-- destroying it.
--
-- Existing rows start at 0, which is also what a client that has just
-- loaded an un-versioned row will send, so nobody is locked out by the
-- migration itself.
alter table game_states
  add column version bigint not null default 0;

-- No index on (user_id, version): user_id is already the primary key and
-- there is exactly one row per child, so the conditional update finds its
-- row by PK and filters in place. An index here would be write cost for
-- nothing.

-- Backfill before tightening. 00001 declared updated_at nullable, so a row
-- written before the default took effect could hold null.
update game_states set updated_at = now() where updated_at is null;

alter table game_states
  alter column updated_at set default now(),
  alter column updated_at set not null;

-- Both fields are server-owned from here on.
--
-- A column default only fires on insert, so an update would otherwise leave
-- updated_at untouched unless the caller sent one — and a caller-supplied
-- version could be set to anything, which would defeat the point of having
-- one. The trigger takes both out of the request: whatever save-game sends,
-- the stored row gets the database's clock and exactly one version step.
-- The `where version = ...` filter still gates the write, because a BEFORE
-- UPDATE trigger runs only on rows the WHERE clause already matched.
create or replace function touch_game_state()
  returns trigger
  language plpgsql
  -- Empty search_path: the body resolves no table or function names, and
  -- pinning it keeps the linter quiet about mutable search paths.
  set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger game_states_touch
  before update on game_states
  for each row execute function touch_game_state();

comment on column game_states.version is
  'Optimistic-concurrency counter, server-owned. Clients echo back the version '
  'they loaded; save-game rejects a write whose expected version is stale.';
