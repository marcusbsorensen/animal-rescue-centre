-- Remove a friend, for both players, in one transaction (146A).
--
-- The friends screen gets a "Remove" on each friend's card. The
-- remove-friend Edge Function takes the caller from the session and the
-- friend from the request, and calls this. Nothing else calls it.
--
-- What goes:
--   - both rows of the friendship (00001 keeps two, one each way);
--   - gifts between the two that are not yet claimed, either way. A gift
--     waiting in an inbox from someone who is no longer a friend is the
--     friendship carrying on after one of them ended it. A claimed gift
--     stays: it is already in the receiver's game, and its row is the
--     record that it happened.
-- What stays:
--   - the activity log, including both players' friend_added lines, which
--     the retention job removes after 2 years (00019, 44B). A grown-up's
--     report to support may need to know that two accounts were friends.
--   - rate-limit counters (gift-pair:<a>:<b>), which expire on their own.
--
-- Repeating the call is harmless: there is nothing left to delete, it
-- returns zeros, and it logs nothing. The two can become friends again
-- later by swapping codes, because nothing here stops add-friend.
--
-- The log line says a friendship ended, and what went with it, in counts.
-- No id, no name, no join code, as delete_account's line (00015).
--
-- Also: a gift can only be made between friends (the trigger at the end).
-- send-gift checks the friendship, then inserts, in two requests; a
-- removal landing between them would leave a gift from a friend who is no
-- longer one. The trigger checks again inside the insert and holds the
-- friendship row while it does, so a removal either waits for the gift
-- and then deletes it, or finishes first and the gift is refused.
--
-- Run BEFORE deploying the remove-friend function from the same commit.
-- It changes no table's columns. Running this file twice changes nothing.

create or replace function remove_friend(p_user_id uuid, p_friend_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_removed jsonb := '{}'::jsonb;
  n         integer;
begin
  if p_user_id is null or p_friend_id is null or p_user_id = p_friend_id then
    return jsonb_build_object('friendships', 0, 'gifts_unclaimed', 0);
  end if;

  -- Lock both rows in one order, whoever calls. Two friends removing each
  -- other at the same moment would otherwise each hold one row and wait
  -- for the other's.
  perform 1 from friendships
  where (user_id = p_user_id and friend_id = p_friend_id)
     or (user_id = p_friend_id and friend_id = p_user_id)
  order by user_id, friend_id
  for update;

  -- Both rows of the friendship. One of the two is always the caller, so
  -- no other pair's friendship can match.
  delete from friendships
  where (user_id = p_user_id and friend_id = p_friend_id)
     or (user_id = p_friend_id and friend_id = p_user_id);
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('friendships', n);

  -- Gifts still waiting, either way.
  delete from gifts
  where claimed_at is null
    and ((from_user = p_user_id and to_user = p_friend_id)
      or (from_user = p_friend_id and to_user = p_user_id));
  get diagnostics n = row_count;
  v_removed := v_removed || jsonb_build_object('gifts_unclaimed', n);

  if (v_removed->>'friendships')::int > 0 then
    insert into audit_log (user_id, action, target_id, metadata)
    values (null, 'friend_removed', null, jsonb_build_object('removed', v_removed));
  end if;

  return v_removed;
end;
$$;

-- PostgREST publishes every function in `public`, and the anon key is
-- enough to call one. This one ends any pair's friendship it is given, so
-- it is for the service role alone, as delete_account is (00015).
revoke execute on function remove_friend(uuid, uuid) from public, anon, authenticated;
grant execute on function remove_friend(uuid, uuid) to service_role;

-- A gift with a sender is between friends. A gift whose sender deleted
-- their account has no sender (00015) and is not checked: that is an
-- update, and this runs on insert only.
--
-- FOR KEY SHARE holds the friendship row until the gift is in, so
-- remove_friend's delete of it waits, and its gift delete, a later
-- statement, then sees the new gift. If the removal got there first, the
-- lock waits for it, finds no row, and the gift is refused.
create or replace function gifts_between_friends()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform 1 from friendships
  where user_id = new.from_user and friend_id = new.to_user
  for key share;
  if not found then
    raise exception 'a gift can only be sent to a friend'
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists gifts_between_friends on gifts;
create trigger gifts_between_friends
  before insert on gifts
  for each row
  when (new.from_user is not null)
  execute function gifts_between_friends();
