-- Delete an account, and everything held about it, in one transaction.
--
-- Apple guideline 5.1.1(v): an app that lets a child make an account
-- must let them start its deletion inside the app. The delete-account
-- Edge Function checks the caller's session and PIN, then calls this
-- with the user id from the session. Nothing else calls it.
--
-- Deleting the users row alone was not enough. It cascades to sessions,
-- game_states, rescue_stats, badges_earned, friendships, gifts received,
-- showcase_links and the depot tables, but it left behind:
--   - audit_log rows: user_id is nulled, not removed, and the signup row
--     keeps the typed name in metadata. Rows other players wrote about
--     this account (a friend added by join code, a gift sent to it or
--     claimed from it) keep its id or join code.
--   - rate_limits rows keyed by the typed name (login:<name>,
--     hint:<name>) or by the user id (gift:, gift-pair:, delete-account:).
--   - gifts this account sent: from_user is nulled by the foreign key.
--   - username_pool: a pool name it claimed stays marked claimed.
-- Each table is named here rather than left to a cascade, so a reader
-- can see the whole list, and the counts say what was removed.
--
-- A function body runs as one transaction: if any statement fails,
-- nothing is deleted.
--
-- Run BEFORE deploying the delete-account function from the same
-- commit. It changes no existing table, so it is safe to run any time.

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

  -- Rate limits keyed by the typed name (login and get-pin-hint use the
  -- name as typed, so allow for spaces either side) or by the user id.
  -- Keys made from an address are a keyed hash of that address, shared
  -- by everyone behind it and not tied to any account; they expire.
  delete from rate_limits
  where ((key like 'login:%' or key like 'hint:%')
         and btrim(substr(key, position(':' in key) + 1)) = v_username)
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

-- PostgREST publishes every function in `public`, and the anon key is
-- enough to call one. This one deletes any account it is given, so it is
-- for the service role alone, as the rate-limit functions are (00007).
revoke execute on function delete_account(uuid) from public, anon, authenticated;
grant execute on function delete_account(uuid) to service_role;
