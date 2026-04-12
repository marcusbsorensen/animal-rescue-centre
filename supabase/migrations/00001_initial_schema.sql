-- A.R.C. Initial Schema
-- All tables from spec §8

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Users
create table users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  pin_hash text not null,
  avatar_emoji text not null,
  avatar_bg_colour text not null,
  parent_email_hash text,
  join_code text unique not null,
  created_at timestamptz default now(),
  last_seen_at timestamptz,
  is_active boolean default true
);

-- Friendships (bidirectional; two rows per friendship)
create table friendships (
  user_id uuid references users on delete cascade,
  friend_id uuid references users on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- Game state (one row per user)
create table game_states (
  user_id uuid primary key references users on delete cascade,
  state jsonb not null default '{}'::jsonb,
  level int default 1,
  updated_at timestamptz default now()
);

-- Rescue stats (denormalised; updated via triggers)
create table rescue_stats (
  user_id uuid primary key references users on delete cascade,
  cats_rescued int default 0,
  dogs_rescued int default 0,
  bunnies_rescued int default 0,
  foxes_rescued int default 0,
  snakes_rescued int default 0,
  parrots_rescued int default 0,
  bats_rescued int default 0,
  total_rescued int generated always as (
    cats_rescued + dogs_rescued + bunnies_rescued + foxes_rescued
    + snakes_rescued + parrots_rescued + bats_rescued
  ) stored,
  badges_unlocked_count int default 0,
  gifts_sent_count int default 0,
  gifts_received_count int default 0,
  updated_at timestamptz default now()
);

-- Badges earned
create table badges_earned (
  user_id uuid references users on delete cascade,
  badge_code text not null,
  earned_at timestamptz default now(),
  primary key (user_id, badge_code)
);

-- Gifts
create table gifts (
  id uuid primary key default gen_random_uuid(),
  from_user uuid references users on delete set null,
  to_user uuid references users on delete cascade,
  gift_type text not null,
  gift_data jsonb,
  message_preset_code text not null,
  sent_at timestamptz default now(),
  claimed_at timestamptz,
  check (from_user <> to_user)
);

-- Username pool
create table username_pool (
  username text primary key,
  added_at timestamptz default now(),
  source text not null,
  claimed_at timestamptz,
  claimed_by uuid references users on delete set null
);

-- Username candidates (LLM-generated, awaiting admin approval)
create table username_pending_review (
  username text primary key,
  generated_at timestamptz default now(),
  approved boolean,
  reviewed_at timestamptz,
  reviewed_by uuid
);

-- Showcase links
create table showcase_links (
  token text primary key,
  user_id uuid references users on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null,
  view_count int default 0
);

-- Audit log
create table audit_log (
  id bigserial primary key,
  user_id uuid references users on delete set null,
  action text not null,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Parent deletion requests
create table deletion_requests (
  token text primary key,
  user_id uuid references users on delete cascade,
  requested_at timestamptz default now(),
  completed_at timestamptz
);

-- Indexes for common queries
create index idx_friendships_friend on friendships(friend_id);
create index idx_gifts_to_user on gifts(to_user) where claimed_at is null;
create index idx_username_pool_available on username_pool(username) where claimed_at is null;
create index idx_showcase_links_user on showcase_links(user_id);
create index idx_audit_log_user on audit_log(user_id);
