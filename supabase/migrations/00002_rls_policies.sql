-- Row Level Security Policies
-- Assumes auth.uid() returns the logged-in user's UUID

-- Enable RLS on all tables
alter table users enable row level security;
alter table friendships enable row level security;
alter table game_states enable row level security;
alter table rescue_stats enable row level security;
alter table badges_earned enable row level security;
alter table gifts enable row level security;
alter table username_pool enable row level security;
alter table username_pending_review enable row level security;
alter table showcase_links enable row level security;
alter table audit_log enable row level security;
alter table deletion_requests enable row level security;

-- USERS: read own + friends
create policy "users_read_own" on users
  for select using (id = auth.uid());

create policy "users_read_friends" on users
  for select using (
    id in (select friend_id from friendships where user_id = auth.uid())
  );

create policy "users_update_own" on users
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- FRIENDSHIPS: read own rows
create policy "friendships_read_own" on friendships
  for select using (user_id = auth.uid() or friend_id = auth.uid());

create policy "friendships_insert" on friendships
  for insert with check (user_id = auth.uid());

create policy "friendships_delete_own" on friendships
  for delete using (user_id = auth.uid());

-- GAME_STATES: read/write only own
create policy "game_states_all_own" on game_states
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- RESCUE_STATS: read own + friends
create policy "rescue_stats_read_own" on rescue_stats
  for select using (user_id = auth.uid());

create policy "rescue_stats_read_friends" on rescue_stats
  for select using (
    user_id in (select friend_id from friendships where user_id = auth.uid())
  );

-- BADGES_EARNED: read own + friends
create policy "badges_read_own" on badges_earned
  for select using (user_id = auth.uid());

create policy "badges_read_friends" on badges_earned
  for select using (
    user_id in (select friend_id from friendships where user_id = auth.uid())
  );

-- GIFTS: sender reads sent, recipient reads received + can claim
create policy "gifts_read_sent" on gifts
  for select using (from_user = auth.uid());

create policy "gifts_read_received" on gifts
  for select using (to_user = auth.uid());

create policy "gifts_insert" on gifts
  for insert with check (from_user = auth.uid());

create policy "gifts_claim" on gifts
  for update using (to_user = auth.uid())
  with check (to_user = auth.uid());

-- USERNAME_POOL: anyone can read available names (for signup picker)
create policy "username_pool_read" on username_pool
  for select using (true);

-- USERNAME_PENDING_REVIEW: admin only (service role)
-- No policies = no client access

-- SHOWCASE_LINKS: public read by token, insert only own
create policy "showcase_read_public" on showcase_links
  for select using (true);

create policy "showcase_insert_own" on showcase_links
  for insert with check (user_id = auth.uid());

create policy "showcase_update_own" on showcase_links
  for update using (user_id = auth.uid());

-- AUDIT_LOG: insert via edge functions (service role), no client read
-- No client-facing policies

-- DELETION_REQUESTS: read/insert own
create policy "deletion_read_own" on deletion_requests
  for select using (user_id = auth.uid());

create policy "deletion_insert_own" on deletion_requests
  for insert with check (user_id = auth.uid());
