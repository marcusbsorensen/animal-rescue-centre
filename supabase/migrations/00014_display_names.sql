-- Every player gets a display name: the name other players see.
--
-- It is an adjective and an animal from two word lists, for example
-- MossyOtter, with a number from 2 to 99 on the end when that one is
-- taken (14, 18, 69 and 88 are never used). A child never types it. The
-- name a child types at signup stays their login and is no longer shown
-- to anyone else: friends, gifts, the friends board and a showcase all
-- show the display name.
--
-- The word lists are copies of packages/game-logic/src/display-names.ts;
-- display-names-copies.test.ts fails if they differ.
--
-- This migration:
--   1. adds users.display_name and gives every existing player one,
--      oldest account first;
--   2. makes a name from the lists for any account inserted without
--      one (the column default), so the signup function deployed now
--      keeps working;
--   3. holds every name to the lists (a check constraint) and to one
--      player each (a unique index);
--   4. takes the typed name out of every showcase already made and puts
--      the display name in its place.
--
-- Run BEFORE deploying the functions from the same commit (signup,
-- login, add-friend, create-showcase, get-showcase): they read and write
-- display_name and fail without it. It can be run by hand first and then
-- again by `supabase db push`; a second run changes nothing.

create or replace function arc_display_name_adjectives() returns text[]
language sql immutable as $$
  select array[
    'Brave', 'Breezy', 'Bright', 'Bubbly', 'Calm', 'Cheery', 'Chirpy', 'Clever',
    'Comfy', 'Cosy', 'Curious', 'Daring', 'Gentle', 'Gleeful', 'Happy', 'Helpful',
    'Hopeful', 'Jolly', 'Kind', 'Leafy', 'Lucky', 'Merry', 'Misty', 'Mossy',
    'Nimble', 'Plucky', 'Rosy', 'Snowy', 'Snug', 'Sparkly', 'Starry', 'Sunny',
    'Swift', 'Twinkly', 'Wise', 'Zippy'
  ]::text[]
$$;

create or replace function arc_display_name_animals() returns text[]
language sql immutable as $$
  select array[
    'Alpaca', 'Badger', 'Bee', 'Canary', 'Deer', 'Dolphin', 'Dormouse', 'Fawn',
    'Ferret', 'Finch', 'Flamingo', 'Gecko', 'Gerbil', 'Hamster', 'Hare', 'Hedgehog',
    'Heron', 'Kitten', 'Koala', 'Ladybird', 'Lamb', 'Lemur', 'Llama', 'Meerkat',
    'Otter', 'Owl', 'Panda', 'Pangolin', 'Penguin', 'Pony', 'Puppy', 'Quokka',
    'Rabbit', 'Robin', 'Seal', 'Sparrow', 'Squirrel', 'Starling', 'Swan', 'Tortoise',
    'Toucan', 'Turtle', 'Vole', 'Wombat', 'Wren'
  ]::text[]
$$;

-- 14 and 88 are white-supremacist codes, 18 a neo-Nazi group's number,
-- 69 is sexual.
create or replace function arc_display_name_skipped_numbers() returns int[]
language sql immutable as $$
  select array[14, 18, 69, 88]::int[]
$$;

-- True for a pair from the lists, with or without an allowed number.
create or replace function arc_is_display_name(name text) returns boolean
language plpgsql immutable as $$
declare
  m text[];
begin
  if name is null then
    return false;
  end if;
  m := regexp_match(name, '^([A-Za-z]+)([0-9]*)$');
  if m is null then
    return false;
  end if;
  if m[2] <> '' then
    if m[2] !~ '^[1-9][0-9]?$' then
      return false;
    end if;
    if m[2]::int < 2 or m[2]::int = any(arc_display_name_skipped_numbers()) then
      return false;
    end if;
  end if;
  return exists (
    select 1
    from unnest(arc_display_name_adjectives()) a, unnest(arc_display_name_animals()) b
    where a || b = m[1]
  );
end
$$;

-- A display name nobody has yet: a random pair, or that pair with a
-- random allowed number if the pair is taken.
create or replace function arc_new_display_name() returns text
language plpgsql volatile as $$
declare
  adjs text[] := arc_display_name_adjectives();
  animals text[] := arc_display_name_animals();
  base text;
  candidate text;
  n int;
begin
  for attempt in 1..50 loop
    base := adjs[1 + floor(random() * array_length(adjs, 1))::int]
         || animals[1 + floor(random() * array_length(animals, 1))::int];
    if not exists (select 1 from users where display_name = base) then
      return base;
    end if;
    for try in 1..20 loop
      n := 2 + floor(random() * 98)::int;
      continue when n = any(arc_display_name_skipped_numbers());
      candidate := base || n;
      if not exists (select 1 from users where display_name = candidate) then
        return candidate;
      end if;
    end loop;
  end loop;
  raise exception 'arc_new_display_name: no free display name found';
end
$$;

alter table users add column if not exists display_name text;

-- Existing players, one at a time and oldest first, so each name is
-- checked against the ones given before it.
do $$
declare
  r record;
begin
  for r in select id from users where display_name is null order by created_at, id loop
    update users set display_name = arc_new_display_name() where id = r.id;
  end loop;
end
$$;

alter table users alter column display_name set default arc_new_display_name();
alter table users alter column display_name set not null;

create unique index if not exists users_display_name_key on users (display_name);

alter table users drop constraint if exists users_display_name_from_lists;
alter table users add constraint users_display_name_from_lists
  check (arc_is_display_name(display_name));

-- Showcases already made carry the name the child typed. Swap it for the
-- display name, then drop it from any left over.
update showcase_links s
set snapshot = (s.snapshot - 'username') || jsonb_build_object('displayName', u.display_name)
from users u
where u.id = s.user_id and s.snapshot ? 'username';

update showcase_links
set snapshot = snapshot - 'username'
where snapshot ? 'username';
