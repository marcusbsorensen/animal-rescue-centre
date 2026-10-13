-- What the public anon key can read: only what the game needs.
--
-- The key ships inside the app, so anyone holding the app holds it.
-- Three rules let it read more than the game ever asks for:
--
-- 1. showcase_links: `showcase_read_public using (true)` let anyone list
--    every showcase, each with pet names a child typed. The game never
--    reads the table with that key: create-showcase and get-showcase are
--    Edge Functions on the service role, and get-showcase answers one
--    token at a time. The insert and update rules were never used either
--    (they key on auth.uid(), which ARC's own sessions do not set). All
--    three go, and the key loses every right on the table.
--
-- 2. users: the read rules (own row, friends' rows) key on auth.uid(),
--    which is null for ARC today, so they return nothing. If Supabase's
--    own sign-in were ever switched on they would hand a friend every
--    column, including the typed sign-in name and the PIN hash. The key
--    keeps the four columns another player is meant to see (id, display
--    name, avatar emoji and colour), which the friends list and the
--    friends board ask for, and loses the rest, whatever the rules say.
--    The typed name reaches only its own player, from login and signup.
--
-- 3. username_pool: `username_pool_read using (true)` showed claimed
--    names with the id of the account that took them, which is a typed
--    sign-in name joined to an account. The signup picker only ever asks
--    for unclaimed names, so the key now sees those and two columns.
--
-- The Edge Functions and the admin page use the service role, which
-- none of this touches. Safe to run any time; a second run changes
-- nothing.

-- 1. showcase_links
drop policy if exists "showcase_read_public" on showcase_links;
drop policy if exists "showcase_insert_own" on showcase_links;
drop policy if exists "showcase_update_own" on showcase_links;
revoke all on table showcase_links from anon, authenticated;

-- 2. users
revoke all on table users from anon, authenticated;
grant select (id, display_name, avatar_emoji, avatar_bg_colour)
  on table users to anon, authenticated;

-- 3. username_pool
drop policy if exists "username_pool_read" on username_pool;
drop policy if exists "username_pool_read_unclaimed" on username_pool;
create policy "username_pool_read_unclaimed" on username_pool
  for select using (claimed_at is null);
revoke all on table username_pool from anon, authenticated;
grant select (username, claimed_at) on table username_pool to anon, authenticated;
