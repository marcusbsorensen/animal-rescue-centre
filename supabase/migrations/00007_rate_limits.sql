-- Durable rate limiting.
--
-- `checkRateLimit` kept its counters in a module-level Map, one per Edge
-- Function isolate. Supabase starts isolates on demand and recycles them,
-- so a cold isolate began counting at zero and an attacker spreading
-- requests across them met no limit at all. Against a 4-digit PIN — ten
-- thousand combinations — that is the difference between a wall and a
-- speed bump.
--
-- This table gives the counters somewhere to live that outlives an
-- isolate. Service-role only: RLS is on with no policies, exactly as
-- `sessions` does it.

create table rate_limits (
  key      text primary key,
  count    integer not null default 0,
  reset_at timestamptz not null
);

-- Expired rows are dead weight; this index makes the sweep cheap.
create index rate_limits_reset_at_idx on rate_limits (reset_at);

alter table rate_limits enable row level security;
-- No policies, deliberately. Only the service role (Edge Functions)
-- touches this table; see supabase/functions/_shared/rate-limit.ts.

-- Count one attempt against `p_key` and say whether it is allowed.
--
-- The whole decision is one statement on purpose. Read-then-write would
-- let two simultaneous requests both read 4, both write 5, and both pass;
-- `insert ... on conflict do update` makes the increment atomic, so the
-- nth caller sees exactly n.
--
-- The window is fixed, not sliding: the first attempt sets `reset_at`,
-- and later attempts inside the window leave it alone. A blocked caller
-- therefore cannot push its own unlock further away by hammering.
create function check_rate_limit(
  p_key       text,
  p_max       integer,
  p_window_ms integer
)
returns table (allowed boolean, retry_after_ms integer)
language plpgsql
as $$
declare
  v_count    integer;
  v_reset_at timestamptz;
  v_window   interval := make_interval(secs => p_window_ms / 1000.0);
begin
  insert into rate_limits as rl (key, count, reset_at)
  values (p_key, 1, now() + v_window)
  on conflict (key) do update
    set count = case
          when rl.reset_at <= now() then 1
          else rl.count + 1
        end,
        reset_at = case
          when rl.reset_at <= now() then now() + v_window
          else rl.reset_at
        end
  returning rl.count, rl.reset_at into v_count, v_reset_at;

  return query select
    v_count <= p_max,
    greatest(
      0,
      ceil(extract(epoch from (v_reset_at - now())) * 1000)
    )::integer;
end;
$$;

-- Forget a key's attempts. Called after a login succeeds, so that a child
-- who simply plays a lot is never locked out by their own success — only
-- failures accumulate.
create function clear_rate_limit(p_key text)
returns void
language sql
as $$
  delete from rate_limits where key = p_key;
$$;

-- Drop rows whose window has closed. Nothing calls this on a timer yet;
-- it is here so the table can be swept without hand-written SQL.
create function sweep_rate_limits()
returns integer
language plpgsql
as $$
declare
  v_deleted integer;
begin
  delete from rate_limits where reset_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- PostgREST publishes every function in `public` as an RPC endpoint, and
-- the anon key is enough to call one. Without this, anyone holding the
-- key shipped in the client could call `clear_rate_limit('login:Ada')`
-- and wipe the counter between guesses — a worse hole than the one this
-- migration closes. These are for the service role alone.
revoke execute on function check_rate_limit(text, integer, integer)
  from public, anon, authenticated;
revoke execute on function clear_rate_limit(text) from public, anon, authenticated;
revoke execute on function sweep_rate_limits() from public, anon, authenticated;
