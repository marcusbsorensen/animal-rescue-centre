-- Retention, switched on (151A, 14 October 2026): enables pg_cron and
-- schedules the four jobs from 00019, daily from 03:10 UTC.
--
-- pg_cron goes in pg_catalog, as Supabase's Cron docs give it
-- (https://supabase.com/docs/guides/cron/install). Production lists
-- pg_cron 1.6.4 as available. The docs' two grants to postgres are left
-- out: Supabase's own after-create script gives postgres those rights
-- whenever the extension is created, and once postgres has granted them
-- to itself, that script fails the next create ("dependent privileges
-- exist"), so this file could not run twice.
--
-- Running this again changes nothing: the extension is created only if it
-- is missing, and arc_retention_schedule() updates the four jobs by name.
--
-- Where pg_cron is not available, as in PGlite (the edge-functions tests),
-- this does nothing and says so.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice '00020: pg_cron is not available here. Nothing was scheduled.';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  perform public.arc_retention_schedule();
end;
$$;
