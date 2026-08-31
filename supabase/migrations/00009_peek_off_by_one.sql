-- peek_rate_limit permitted one attempt too many.
--
-- 00008 asked `count <= p_max`, copying the shape of check_rate_limit.
-- That is right there and wrong here, because the two count at
-- different moments. check_rate_limit increments first, so its count
-- includes the attempt being judged and `<=` is correct. A peek happens
-- *before* the attempt, so its count is what has already been spent:
-- with a budget of 60 and 60 already spent, `60 <= 60` waved through a
-- 61st.
--
-- Off by one in the safe-looking direction, which is how it read as a
-- race in the first test — 64 sequential sprayed logins produced 61
-- misses rather than 60, and nothing was actually racing.
create or replace function peek_rate_limit(p_key text, p_max integer)
returns table (allowed boolean, retry_after_ms integer)
language sql
as $$
  select
    coalesce(rl.count, 0) < p_max or rl.reset_at <= now(),
    case
      when rl.reset_at is null or rl.reset_at <= now() then 0
      else greatest(0, ceil(extract(epoch from (rl.reset_at - now())) * 1000))::integer
    end
  from (select null) as _
  left join rate_limits rl on rl.key = p_key;
$$;

revoke execute on function peek_rate_limit(text, integer) from public, anon, authenticated;
