-- Retention: four daily jobs that delete what ARC keeps no longer than
-- the privacy page says (answers 43A, 44B, 45A and 46B, 13 October 2026).
--
-- Until now nothing deleted any of it. sweep_rate_limits() (00007) was
-- never scheduled, and nothing touched old accounts, old log entries or
-- expired showcases.
--
--   43A  An account, 3 years after it was last used, with no warning: ARC
--        holds no email address to send one to. It goes through
--        delete_account (00015, as 00018 left it), so every row of the
--        child's goes exactly as when she deletes the account herself, in
--        one transaction per account.
--   44B  An activity-log entry, 2 years after it was made.
--   45A  A rate-limit counter, 1 day after its window closed. The windows
--        run from 15 minutes to 24 hours.
--   46B  A showcase and its snapshot, 30 days after its link stopped
--        working (a link works for 7 days).
--
-- "Last used" is the later of the last sign-in (users.last_seen_at, which
-- signup, login and save-game move) and the last request made with one of
-- the account's sign-in tokens (sessions.last_used_at). An account with
-- neither counts from when it was made. A token works for 90 days at most
-- (00005), so an account goes no sooner than 3 years after the last
-- sign-in, and no more than 90 days after that.
--
-- Each job:
--   - deletes at most one batch per run, oldest first, so a backlog clears
--     over a few days rather than in one long lock;
--   - is safe to run twice, or twice at once: a second run finds nothing
--     left, and a row the other run holds is skipped, not waited for;
--   - says what it did.
-- arc_retention_preview() counts what the jobs would delete and deletes
-- nothing. It is the dry run. arc_retention_run() runs all four once.
--
-- Scheduling is a separate step, because it needs the pg_cron extension
-- and nothing in this repository says whether production has it switched
-- on. Once it is (Dashboard > Database > Extensions > pg_cron), one line in
-- the SQL editor schedules the four jobs daily, from 03:10 UTC:
--     select arc_retention_schedule();
-- and one line takes them off again:
--     select arc_retention_unschedule();
--
-- This file deletes nothing when it runs. It adds functions and two
-- indexes, and changes no table. Production order (dry run first) is in
-- docs/legal/dpia-arc.md, "Switching the jobs on". Running this file twice
-- changes nothing.

-- The two lookups that grow with the game. rate_limits(reset_at) exists
-- (00007); users and sessions are small enough to read whole once a day.
create index if not exists audit_log_created_at_idx on audit_log (created_at);
create index if not exists showcase_links_expires_at_idx on showcase_links (expires_at);

-- 43A. Accounts, 3 years after last use.
create or replace function arc_retention_accounts(p_limit int default 100)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_cutoff  timestamptz := now() - interval '3 years';
  v_id      uuid;
  v_deleted int := 0;
  v_failed  int := 0;
  v_state   text;
begin
  -- The lock is taken with the condition. A sign-in that lands first moves
  -- last_seen_at, and the row no longer matches; one that comes after waits
  -- for this to finish. SKIP LOCKED lets two runs share the work.
  for v_id in
    select u.id
    from users u
    where coalesce(u.last_seen_at, u.created_at) < v_cutoff
      and not exists (
        select 1 from sessions s
        where s.user_id = u.id and s.last_used_at >= v_cutoff
      )
    order by coalesce(u.last_seen_at, u.created_at), u.id
    limit greatest(coalesce(p_limit, 100), 0)
    for update of u skip locked
  loop
    -- One account at a time. The block is a savepoint: if delete_account
    -- fails part-way, that account is left exactly as it was, and the
    -- others in the batch still go.
    begin
      perform delete_account(v_id);
      v_deleted := v_deleted + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_state := coalesce(v_state, sqlstate);
    end;
  end loop;

  -- No id or name in either message. When every account failed, raising
  -- loses nothing and marks the scheduled run as failed, where it is seen.
  if v_failed > 0 and v_deleted = 0 then
    raise exception 'arc_retention_accounts: % account(s) could not be deleted (SQLSTATE %). Each was left as it was.',
      v_failed, v_state;
  elsif v_failed > 0 then
    raise warning 'arc_retention_accounts: % deleted, % could not be (SQLSTATE %) and were left as they were.',
      v_deleted, v_failed, v_state;
  end if;

  return jsonb_build_object('deleted', v_deleted, 'failed', v_failed);
end;
$$;

-- 44B. Activity-log entries, 2 years after they were made. That includes
-- the counts-only line delete_account leaves.
create or replace function arc_retention_audit_log(p_limit int default 5000)
returns int
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  delete from audit_log
  where id in (
    select id from audit_log
    where created_at < now() - interval '2 years'
    order by created_at, id
    limit greatest(coalesce(p_limit, 5000), 0)
    for update skip locked
  );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 45A. Rate-limit counters, 1 day after their window closed. A closed
-- window already counts as zero (check_rate_limit starts it again), so
-- this removes rows that limit nothing, some of them keyed by a sign-in
-- name.
create or replace function arc_retention_rate_limits(p_limit int default 5000)
returns int
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  delete from rate_limits
  where key in (
    select key from rate_limits
    where reset_at < now() - interval '1 day'
    order by reset_at, key
    limit greatest(coalesce(p_limit, 5000), 0)
    for update skip locked
  );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 46B. Showcases, 30 days after the link stopped working. get-showcase
-- already refuses an expired link; this removes the snapshot, which holds
-- the pet names a child typed.
create or replace function arc_retention_showcases(p_limit int default 1000)
returns int
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  delete from showcase_links
  where token in (
    select token from showcase_links
    where expires_at < now() - interval '30 days'
    order by expires_at, token
    limit greatest(coalesce(p_limit, 1000), 0)
    for update skip locked
  );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The dry run: what each job would delete now, without a batch limit.
-- Reads only. The conditions are the jobs' own, and
-- packages/edge-functions/src/__tests__/retention-db.test.ts holds the
-- two to the same answer.
create or replace function arc_retention_preview()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'accounts', (
      select count(*) from users u
      where coalesce(u.last_seen_at, u.created_at) < now() - interval '3 years'
        and not exists (
          select 1 from sessions s
          where s.user_id = u.id and s.last_used_at >= now() - interval '3 years'
        )
    ),
    'audit_log', (
      select count(*) from audit_log where created_at < now() - interval '2 years'
    ),
    'rate_limits', (
      select count(*) from rate_limits where reset_at < now() - interval '1 day'
    ),
    'showcases', (
      select count(*) from showcase_links where expires_at < now() - interval '30 days'
    )
  );
$$;

-- All four, once each, in this order. Accounts go first, so the log rows
-- and counters that name them leave with them.
create or replace function arc_retention_run()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_accounts  jsonb;
  v_showcases int;
  v_audit_log int;
  v_limits    int;
begin
  v_accounts  := arc_retention_accounts();
  v_showcases := arc_retention_showcases();
  v_audit_log := arc_retention_audit_log();
  v_limits    := arc_retention_rate_limits();
  return jsonb_build_object(
    'accounts', v_accounts,
    'showcases', v_showcases,
    'audit_log', v_audit_log,
    'rate_limits', v_limits
  );
end;
$$;

-- The switch. Four pg_cron jobs, one per rule, so a failure in one is
-- reported against it (cron.job_run_details) and stops none of the others.
-- Running it again updates the four jobs in place; it never adds a fifth.
-- The jobs run as whoever runs this: in the SQL editor, postgres, which
-- owns these functions and delete_account.
create or replace function arc_retention_schedule()
returns setof text
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'arc_retention_schedule: pg_cron is not enabled. Enable it (Dashboard > Database > Extensions > pg_cron), then run this again. Nothing was scheduled.';
  end if;
  perform cron.schedule('arc-retention-accounts', '10 3 * * *', 'select public.arc_retention_accounts()');
  perform cron.schedule('arc-retention-showcases', '15 3 * * *', 'select public.arc_retention_showcases()');
  perform cron.schedule('arc-retention-audit-log', '20 3 * * *', 'select public.arc_retention_audit_log()');
  perform cron.schedule('arc-retention-rate-limits', '25 3 * * *', 'select public.arc_retention_rate_limits()');
  return query
    select j.jobname || ' at ' || j.schedule || ' UTC'
    from cron.job j
    where j.jobname like 'arc-retention-%'
    order by j.schedule;
end;
$$;

create or replace function arc_retention_unschedule()
returns int
language plpgsql
set search_path = public
as $$
declare
  v_name text;
  n      int := 0;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return 0;
  end if;
  for v_name in select jobname from cron.job where jobname like 'arc-retention-%' loop
    perform cron.unschedule(v_name);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- PostgREST publishes every function in `public`, and the anon key is
-- enough to call one (00007). These delete children's data, so the key
-- may call none of them. The service role keeps the jobs and the dry run,
-- so a scheduler other than pg_cron could call arc_retention_run() with
-- it; the switch is for the database owner alone.
revoke execute on function arc_retention_accounts(int) from public, anon, authenticated;
revoke execute on function arc_retention_audit_log(int) from public, anon, authenticated;
revoke execute on function arc_retention_rate_limits(int) from public, anon, authenticated;
revoke execute on function arc_retention_showcases(int) from public, anon, authenticated;
revoke execute on function arc_retention_preview() from public, anon, authenticated;
revoke execute on function arc_retention_run() from public, anon, authenticated;
revoke execute on function arc_retention_schedule() from public, anon, authenticated, service_role;
revoke execute on function arc_retention_unschedule() from public, anon, authenticated, service_role;
grant execute on function arc_retention_accounts(int) to service_role;
grant execute on function arc_retention_audit_log(int) to service_role;
grant execute on function arc_retention_rate_limits(int) to service_role;
grant execute on function arc_retention_showcases(int) to service_role;
grant execute on function arc_retention_preview() to service_role;
grant execute on function arc_retention_run() to service_role;
