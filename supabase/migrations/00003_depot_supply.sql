-- Depot & Supply Run tables + Calendar events
-- Migration 3: Adds economy tracking for depot sessions, supply runs, and inventory

-- ── Depot Sessions ──────────────────────────────────────────
-- One row per completed depot puzzle session
create table depot_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  mode text not null,                    -- 'parts' | 'treats' | 'decorations' | 'medical'
  score int not null default 0,
  moves_used int not null default 0,
  goals_met boolean not null default false,
  rewards jsonb not null default '[]'::jsonb,  -- array of { type, quantity, label }
  started_at timestamptz default now(),
  completed_at timestamptz default now()
);

-- ── Supply Run Records ──────────────────────────────────────
-- One row per completed (or totalled) supply run
create table supply_run_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  destination text not null,             -- 'bramble_farm' | 'cove_harbour' | 'pinebark_medical'
  earnings int not null default 0,
  distance_covered int not null default 0,
  obstacles_smashed int not null default 0,
  obstacles_hit int not null default 0,
  damage_entries jsonb not null default '[]'::jsonb,
  outcome text not null default 'completed',  -- 'completed' | 'totalled'
  perfect_run boolean not null default false,
  cargo_intact boolean not null default false,
  completed_at timestamptz default now()
);

-- ── Depot Inventory Ledger ──────────────────────────────────
-- Append-only audit trail for all depot item transactions
create table depot_inventory_ledger (
  id bigserial primary key,
  user_id uuid not null references users on delete cascade,
  item_type text not null,               -- e.g. 'parts', 'tools', 'treats', 'decorations', 'medical'
  item_key text not null,                -- specific item identifier
  quantity_change int not null,           -- positive = earned, negative = spent
  balance_after int not null,            -- running balance for this item
  source text not null,                  -- 'depot_session' | 'supply_run' | 'gift' | 'admin'
  source_id uuid,                        -- reference to depot_sessions.id or supply_run_records.id
  created_at timestamptz default now()
);

-- ── Calendar Events ─────────────────────────────────────────
-- Seasonal and special events that affect depot/game content
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  event_code text unique not null,       -- e.g. 'spring_festival', 'winter_holiday'
  title text not null,
  description text,
  season text,                           -- 'spring' | 'summer' | 'autumn' | 'winter' | null (any)
  start_month int,                       -- 1-12 in-game month (null = always active)
  end_month int,
  effects jsonb not null default '{}'::jsonb,  -- { tileOverrides, bonusMultiplier, etc. }
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- ── Indexes ─────────────────────────────────────────────────
create index idx_depot_sessions_user on depot_sessions(user_id);
create index idx_depot_sessions_completed on depot_sessions(user_id, completed_at desc);
create index idx_supply_run_records_user on supply_run_records(user_id);
create index idx_supply_run_records_completed on supply_run_records(user_id, completed_at desc);
create index idx_depot_inventory_ledger_user on depot_inventory_ledger(user_id);
create index idx_depot_inventory_ledger_item on depot_inventory_ledger(user_id, item_type, item_key);
create index idx_calendar_events_active on calendar_events(is_active) where is_active = true;

-- ── RLS ─────────────────────────────────────────────────────
alter table depot_sessions enable row level security;
alter table supply_run_records enable row level security;
alter table depot_inventory_ledger enable row level security;
alter table calendar_events enable row level security;

-- Depot sessions: read/insert own
create policy "depot_sessions_read_own" on depot_sessions
  for select using (user_id = auth.uid());

create policy "depot_sessions_insert_own" on depot_sessions
  for insert with check (user_id = auth.uid());

-- Supply run records: read own + friends (for leaderboard)
create policy "supply_runs_read_own" on supply_run_records
  for select using (user_id = auth.uid());

create policy "supply_runs_read_friends" on supply_run_records
  for select using (
    user_id in (select friend_id from friendships where user_id = auth.uid())
  );

create policy "supply_runs_insert_own" on supply_run_records
  for insert with check (user_id = auth.uid());

-- Inventory ledger: read/insert own (append-only — no update/delete)
create policy "inventory_ledger_read_own" on depot_inventory_ledger
  for select using (user_id = auth.uid());

create policy "inventory_ledger_insert_own" on depot_inventory_ledger
  for insert with check (user_id = auth.uid());

-- Calendar events: public read (everyone sees the same events)
create policy "calendar_events_read" on calendar_events
  for select using (true);
-- Insert/update via service role only (admin)
