-- Sign-in names ignore capitals (hub 96, Marcus 2026-10-14: "do NOT make
-- them case sensitive").
--
-- PebbleKite, pebblekite and PEBBLEKITE are one account. A child who
-- signs in on a new device types her secret name from memory, and on a
-- phone or tablet the keyboard decides the first capital for her. Until
-- now login matched the name exactly, so a name typed in the wrong
-- capitals answered "can't find that name"; and two accounts could hold
-- names that differ only in capitals (Lily and lily), which would make a
-- match that ignores capitals ambiguous.
--
-- This migration:
--   1. stops, changing nothing, if two accounts already hold names that
--      differ only in capitals, or two pool names do. Production's six
--      accounts were made through signup, which matched names exactly, so
--      this is the one thing that could be in the way. If it stops, find
--      them with
--        select lower(username), count(*) from users
--        group by 1 having count(*) > 1;
--      and decide which keeps the name before running it again;
--   2. adds users.username_lower, the sign-in name in small letters, made
--      by the database from username (so the two cannot disagree), and
--      unique: a name can be held once, in whatever capitals. login,
--      get-pin-hint and signup look names up by it. username keeps the
--      capitals the name was made with, which is what the game shows back.
--      The public key cannot read the new column: 00016 took away its
--      table-wide read and granted four columns by name;
--   3. makes the pool's names unique in any capitals too, and has the
--      refill skip a name that clashes that way rather than fail;
--   4. has delete_account clear the per-name rate limits in any capitals:
--      login and get-pin-hint now key them on the name in small letters
--      (login:pebblekite), and keys from before this keep the capitals the
--      name was typed in.
--
-- Production order, with 00017 and before the functions from the same
-- commit (they read username_lower, which does not exist until this has
-- run):
--   1. `supabase db push`, which runs 00017 and then this file.
--   2. deploy `login`, `get-pin-hint` and `signup`.
-- The functions already deployed keep working after this runs: they look
-- names up by username, which is unchanged.
-- Running this file twice changes nothing.

-- 1. Nothing to merge.
do $$
declare
  v_users int;
  v_pool int;
begin
  select count(*) into v_users from (
    select 1 from users group by lower(username) having count(*) > 1
  ) clash;
  if v_users > 0 then
    raise exception
      '00018: % sign-in name(s) are held by more than one account in different capitals. Nothing was changed. See the comment at the top of this file.',
      v_users;
  end if;

  select count(*) into v_pool from (
    select 1 from username_pool group by lower(username) having count(*) > 1
  ) clash;
  if v_pool > 0 then
    raise exception
      '00018: % pool name(s) appear more than once in different capitals. Nothing was changed.',
      v_pool;
  end if;
end $$;

-- 2. users.username_lower
alter table users add column if not exists username_lower text
  generated always as (lower(username)) stored;
create unique index if not exists users_username_lower_key on users (username_lower);

-- 3. The pool
create unique index if not exists username_pool_username_lower_key
  on username_pool (lower(username));

-- As in 00017, except that each insert skips a name that clashes with one
-- already in the pool in any capitals (`on conflict do nothing`, with no
-- column named), where 00017 skipped only an exact match.
create or replace function arc_refill_username_pool(p_min_free int default 300)
returns int
language plpgsql
as $$
declare
  v_added int := 0;
  v_rows int;
  v_number int;
begin
  -- A name claimed for a signup that never finished goes back after an hour.
  update username_pool p
  set claimed_at = null
  where p.source like 'ready-made%'
    and p.claimed_by is null
    and p.claimed_at < now() - interval '1 hour'
    and not exists (select 1 from users u where lower(u.username) = lower(p.username));

  -- Every plain pair of up to 13 letters that is nobody's login and no
  -- display name, in any capitals.
  insert into username_pool (username, source)
  select f || s, 'ready-made'
  from unnest(arc_sign_in_name_firsts()) f, unnest(arc_sign_in_name_seconds()) s
  where length(f || s) <= 13
    and not exists (select 1 from users u where lower(u.username) = lower(f || s))
    and lower(f || s) not in (
      select lower(a || b)
      from unnest(arc_display_name_adjectives()) a, unnest(arc_display_name_animals()) b
    )
  on conflict do nothing;
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
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_added := v_added + v_rows;
  end loop;

  return v_added;
end;
$$;

revoke execute on function arc_refill_username_pool(int) from public, anon, authenticated;
grant execute on function arc_refill_username_pool(int) to service_role;

-- 4. delete_account: as in 00015, except that the per-name rate limits
-- are matched in any capitals.
create or replace function delete_account(p_user_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_username  text;
  v_join_code text;
  v_removed   jsonb := '{}'::jsonb;
  n           integer;
begin
  -- Lock the row. A login racing this waits on the lock to write its
  -- session (the foreign key needs the row), then fails once it is gone.
  select username, join_code into v_username, v_join_code
  from users where id = p_user_id
  for update;
  if not found then
    return null;
  end if;

  -- The activity log: this account's own rows, and rows other players
  -- wrote that name it by id or by join code.
  delete from audit_log
  where user_id = p_user_id
     or target_id = p_user_id
     or metadata->>'from_user' = p_user_id::text
     or upper(metadata->>'join_code') = upper(v_join_code);
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('audit_log', n);

  -- Rate limits keyed by the sign-in name (login:<name>, hint:<name>), in
  -- small letters since 00018 and as typed before it, so in any capitals
  -- and with spaces either side; or keyed by the user id. Keys made from
  -- an address are a keyed hash of that address, shared by everyone
  -- behind it and not tied to any account; they expire.
  delete from rate_limits
  where ((key like 'login:%' or key like 'hint:%')
         and lower(btrim(substr(key, position(':' in key) + 1))) = lower(v_username))
     or position(p_user_id::text in key) > 0;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('rate_limits', n);

  delete from sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('sessions', n);

  delete from showcase_links where user_id = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('showcase_links', n);

  delete from game_states where user_id = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('game_states', n);

  delete from rescue_stats where user_id = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('rescue_stats', n);

  delete from badges_earned where user_id = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('badges_earned', n);

  -- Both rows of each friendship.
  delete from friendships where user_id = p_user_id or friend_id = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('friendships', n);

  delete from gifts where to_user = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('gifts_received', n);

  -- A gift this account sent is in the friend's inbox, and is theirs.
  -- It keeps the gift and the picked message, and loses who sent it.
  update gifts set from_user = null where from_user = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('gifts_sent_unlinked', n);

  delete from depot_sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('depot_sessions', n);

  delete from supply_run_records where user_id = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('supply_run_records', n);

  delete from depot_inventory_ledger where user_id = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('depot_inventory_ledger', n);

  -- A suggested name this account took goes back in the pool.
  update username_pool set claimed_at = null, claimed_by = null
  where claimed_by = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('username_pool_released', n);

  delete from users where id = p_user_id;
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('users', n);

  -- One line saying a deletion happened, and how much it removed. No id,
  -- no name, no join code: nothing in it points back at the child.
  insert into audit_log (user_id, action, target_id, metadata)
  values (null, 'account_deleted', null, jsonb_build_object('removed', v_removed));

  return v_removed;
end;
$$;

revoke execute on function delete_account(uuid) from public, anon, authenticated;
grant execute on function delete_account(uuid) to service_role;
