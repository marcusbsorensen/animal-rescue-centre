-- Ready-made sign-in names: a child picks a secret name to sign in with
-- from three the server offers, and never types one.
--
-- Until now the signup page asked "What's your name?" and a child typed
-- it, usually their real name. That name became their login. 00016 made
-- it unreadable to other players, but it was still a real name, kept as
-- typed, and it went into rate-limit keys (`login:<name>`).
--
-- A sign-in name is a thing and a thing from two word lists, for example
-- PebbleKite: never an animal, so it does not look like the name
-- friends see (MossyOtter, 00014). The lists are copies of
-- packages/game-logic/src/sign-in-names.ts; sign-in-names.test.ts holds
-- them to one list and checks every pair.
--
-- This migration:
--   1. fills username_pool with every pair of up to 13 letters (2,382 of
--      the 50 x 50 = 2,500; a longer one does not fit on one line of a
--      phone's name card), leaving out any that is already somebody's
--      login, in any capitals;
--   2. adds arc_refill_username_pool(), which adds any pair not yet in
--      the pool, gives back a claim whose signup never finished, and,
--      once fewer than 300 names are free, adds the pairs again with a
--      number on the end (PebbleKite2, then 3, ...), 2,382 at a time;
--   3. adds arc_offer_sign_in_names(), three free names at random, which
--      refills the pool first if it is running low;
--   4. adds arc_claim_sign_in_name(), which takes one name for one
--      signup: of two signups that pick the same name at the same moment,
--      exactly one gets it;
--   5. stops the public key reading the pool at all. 00016 let it read
--      unclaimed names, for a picker the game no longer has. With
--      ready-made names that would give away logins: the lists are
--      public, so every pair missing from the unclaimed list is somebody's
--      sign-in name.
--
-- How big, and why: 2,382 plain names is about 400 times the accounts
-- ARC has today; at 20 new players a week it lasts more than two years.
-- After that, names get a number, 2,382 more each time the pool runs low,
-- up to about 224,000 (the numbers 2 to 99, without the four that 00014
-- never uses). A deleted account's name goes back in (00015).
--
-- Production order, with the release of the app build that has the new
-- name screen:
--   1. `supabase db push`, which runs this file. Nothing deployed before
--      it calls these functions, and the old signup keeps working: it
--      still accepts a typed name from older builds.
--   2. deploy `signup` from the same commit (it offers and claims names).
--   3. release the app build.
-- Running this file twice changes nothing: the fill skips names already
-- in the pool.

create or replace function arc_sign_in_name_firsts() returns text[]
language sql immutable as $$
  select array[
    'Acorn', 'Apple', 'Bean', 'Berry', 'Biscuit', 'Bramble', 'Cactus', 'Candle',
    'Cloud', 'Clover', 'Cocoa', 'Comet', 'Conker', 'Cookie', 'Crumble', 'Cupcake',
    'Fig', 'Gumdrop', 'Jelly', 'Kettle', 'Lantern', 'Lemon', 'Mango', 'Marble',
    'Meadow', 'Moon', 'Nutmeg', 'Pancake', 'Pebble', 'Pickle', 'Pine', 'Planet',
    'Plum', 'Popcorn', 'Puddle', 'Pumpkin', 'Puzzle', 'Rainbow', 'Raindrop', 'Ripple',
    'Rocket', 'Sherbet', 'Sprinkle', 'Sprout', 'Teacup', 'Toffee', 'Tulip', 'Twig',
    'Waffle', 'Walnut'
  ]::text[]
$$;

create or replace function arc_sign_in_name_seconds() returns text[]
language sql immutable as $$
  select array[
    'Balloon', 'Basket', 'Bell', 'Bike', 'Blanket', 'Boat', 'Boots', 'Bridge',
    'Bucket', 'Crayon', 'Drum', 'Engine', 'Feather', 'Flag', 'Hat', 'Helmet',
    'Jigsaw', 'Jumper', 'Kazoo', 'Kite', 'Ladder', 'Lamp', 'Mitten',
    'Nest', 'Parcel', 'Pencil', 'Piano', 'Pillow', 'Pocket', 'Puppet', 'Ribbon',
    'Robot', 'Sandal', 'Scarf', 'Ship', 'Slipper', 'Sock', 'Sticker', 'Teapot',
    'Tent', 'Torch', 'Tower', 'Train', 'Trumpet', 'Tunnel', 'Wagon', 'Wand', 'Wheel',
    'Window', 'Yoyo'
  ]::text[]
$$;

-- Adds names until at least `p_min_free` are free, and returns how many
-- it added. Safe to run at any time and from two places at once: every
-- insert skips a name that is already there.
create or replace function arc_refill_username_pool(p_min_free int default 300)
returns int
language plpgsql
as $$
declare
  v_added int := 0;
  v_rows int;
  v_number int;
begin
  -- A name claimed for a signup that never finished (the function
  -- stopped between claiming the name and making the account) goes back
  -- after an hour.
  update username_pool p
  set claimed_at = null
  where p.source like 'ready-made%'
    and p.claimed_by is null
    and p.claimed_at < now() - interval '1 hour'
    and not exists (select 1 from users u where lower(u.username) = lower(p.username));

  -- Every plain pair of up to 13 letters. A pair that is somebody's login already, in any
  -- capitals, is left out; so is any that is a display name (none is,
  -- since the lists share no word, but the check costs nothing).
  insert into username_pool (username, source)
  select f || s, 'ready-made'
  from unnest(arc_sign_in_name_firsts()) f, unnest(arc_sign_in_name_seconds()) s
  where length(f || s) <= 13
    and not exists (select 1 from users u where lower(u.username) = lower(f || s))
    and lower(f || s) not in (
      select lower(a || b)
      from unnest(arc_display_name_adjectives()) a, unnest(arc_display_name_animals()) b
    )
  on conflict (username) do nothing;
  get diagnostics v_rows = row_count;
  v_added := v_added + v_rows;

  -- Running low: the same pairs again with a number, lowest first,
  -- skipping the numbers display names never use.
  for v_number in
    select n from generate_series(2, 99) n
    where n <> all (arc_display_name_skipped_numbers())
    order by n
  loop
    exit when (select count(*) from username_pool where claimed_at is null) >= p_min_free;
    insert into username_pool (username, source)
    select f || s || v_number, 'ready-made-numbered'
    from unnest(arc_sign_in_name_firsts()) f, unnest(arc_sign_in_name_seconds()) s
    where length(f || s) <= 13
      and not exists (select 1 from users u where lower(u.username) = lower(f || s || v_number))
    on conflict (username) do nothing;
    get diagnostics v_rows = row_count;
    v_added := v_added + v_rows;
  end loop;

  return v_added;
end;
$$;

-- Free names at random, for the signup page to show. It reserves
-- nothing: two children may be shown the same name, and the claim below
-- settles which of them gets it.
create or replace function arc_offer_sign_in_names(p_count int default 3)
returns setof text
language plpgsql
volatile
as $$
begin
  if (select count(*) from username_pool where claimed_at is null) < 300 then
    perform arc_refill_username_pool(300);
  end if;
  return query
    select p.username
    from username_pool p
    where p.claimed_at is null
      and p.source like 'ready-made%'
      and not exists (select 1 from users u where lower(u.username) = lower(p.username))
    order by random()
    limit greatest(1, least(coalesce(p_count, 3), 6));
end;
$$;

-- Takes one free name for one signup, and says whether it got it. The
-- row lock makes this safe under concurrency: a second claim on the same
-- name waits for the first, then finds it taken and returns false.
-- signup sets claimed_by once the account exists, and gives the name
-- back if making the account fails.
create or replace function arc_claim_sign_in_name(p_name text)
returns boolean
language plpgsql
volatile
as $$
begin
  update username_pool p
  set claimed_at = now()
  where p.username = p_name
    and p.claimed_at is null
    and p.source like 'ready-made%'
    and not exists (select 1 from users u where lower(u.username) = lower(p_name));
  return found;
end;
$$;

-- Only the Edge Functions (service role) may offer, claim or refill.
revoke execute on function arc_refill_username_pool(int) from public, anon, authenticated;
revoke execute on function arc_offer_sign_in_names(int) from public, anon, authenticated;
revoke execute on function arc_claim_sign_in_name(text) from public, anon, authenticated;
grant execute on function arc_refill_username_pool(int) to service_role;
grant execute on function arc_offer_sign_in_names(int) to service_role;
grant execute on function arc_claim_sign_in_name(text) to service_role;

-- The public key reads nothing from the pool (see 5 above). Row-level
-- security stays on with no rule, so even a grant added by mistake
-- returns no rows.
drop policy if exists "username_pool_read" on username_pool;
drop policy if exists "username_pool_read_unclaimed" on username_pool;
revoke all on table username_pool from anon, authenticated;

select arc_refill_username_pool(300);
