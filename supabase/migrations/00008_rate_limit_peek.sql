-- Reading a limit without spending it.
--
-- 00007 made every check an increment, which is right for a key whose
-- budget can be cleared by proving you own the account: guessing at
-- `login:Ada` costs you an attempt, and getting the PIN right gives them
-- all back.
--
-- An IP bucket cannot work that way. Clearing it on a successful login
-- would let an attacker who holds one valid account spray sixty guesses,
-- log into their own account to wipe the counter, and repeat forever. So
-- the IP bucket counts failures only, which needs the question ("is this
-- address over its budget?") asked separately from the answer ("that was
-- another failure").
--
-- Hence a peek and a bump. The peek races — two simultaneous callers can
-- both read 59 and both proceed — and that is deliberate: a coarse
-- address-level cap that overshoots by one or two is fine, where the
-- per-username cap it sits behind is exact.

-- Is `p_key` within budget? Costs nothing, changes nothing.
create function peek_rate_limit(p_key text, p_max integer)
returns table (allowed boolean, retry_after_ms integer)
language sql
as $$
  select
    coalesce(rl.count, 0) <= p_max or rl.reset_at <= now(),
    case
      when rl.reset_at is null or rl.reset_at <= now() then 0
      else greatest(0, ceil(extract(epoch from (rl.reset_at - now())) * 1000))::integer
    end
  from (select null) as _
  left join rate_limits rl on rl.key = p_key;
$$;

-- Charge one attempt to `p_key`, opening a window if none is running.
create function bump_rate_limit(p_key text, p_window_ms integer)
returns void
language plpgsql
as $$
declare
  v_window interval := make_interval(secs => p_window_ms / 1000.0);
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
        end;
end;
$$;

-- Same reasoning as 00007: PostgREST would otherwise publish these as
-- RPCs the shipped anon key could call, and `bump_rate_limit` in the
-- wrong hands is a way to lock a child out of their own account.
revoke execute on function peek_rate_limit(text, integer) from public, anon, authenticated;
revoke execute on function bump_rate_limit(text, integer) from public, anon, authenticated;
