-- Phase 13 (monitoring without an error-reporting service, owner decision ADR-023): the daily health check.
-- - backup_report: only the scheduled backup job (service role) records a backup run; AAL2 administrators read them.
-- - system_health lists what needs attention: a scheduled job that failed in the last day, a failed call to an
--   Edge Function, files that keep failing to be removed, emails that failed, retention that has not run or
--   failed, and a database or Storage backup older than 26 hours (or none at all). AAL2 administrators only.
-- - private.check_system_health alerts every active administrator once per issue per day (deduplicated), and
--   not at all when everything is healthy.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(16);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;
/** The issues as their keys. */
create function tests.issues() returns text[] language sql security definer set search_path = '' as $$
  select coalesce(array_agg(i.key order by i.key), '{}') from private.system_health_issues() i $$;

-- A healthy starting point: no job history from other runs, a recent retention run, fresh backups.
delete from cron.job_run_details;
delete from net._http_response;
delete from public.retention_runs;
insert into public.retention_runs (mode, started_at, finished_at) values ('DRY_RUN', now() - interval '3 hours', now() - interval '3 hours');

-- ---------------------------------------------------------------- recording backups
select tests.as_service();
select lives_ok($$ select public.backup_report('DATABASE', true, 52428800, 'r2://ddtc-backups/db/2026-11-12.sql.gz.age', null) $$, 'the backup job records a database backup');
select lives_ok($$ select public.backup_report('STORAGE', true, 1073741824, 'r2://ddtc-backups/storage/2026-11-12', null) $$, 'and a Storage backup');
select throws_ok($$ select public.backup_report('DATABASE', false, null, null, null) $$, '22023', 'Say why the backup failed', 'a failure needs its reason');
select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select throws_ok($$ select public.backup_report('DATABASE', true, 1, 'x', null) $$, '42501', null, 'a signed-in user cannot record a backup');
select throws_ok($$ select * from public.system_health() $$, '42501', null, 'nor read the system''s health');
select tests.reset();

select is(tests.issues(), '{}'::text[], 'healthy: nothing needs attention');
select private.check_system_health();
select is((select count(*)::int from public.notifications where notification_type = 'SYSTEM_ALERT'), 0, 'and no one is alerted');

-- ---------------------------------------------------------------- each kind of problem
insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)
select j.jobid, 990001, 1, 'postgres', 'postgres', j.command, 'failed', 'connection refused', now() - interval '2 hours', now() - interval '2 hours'
  from cron.job j where j.jobname = 'cleanup-files-hourly';
insert into net._http_response (id, status_code, content, timed_out, created) values (990001, 503, 'unavailable', false, now() - interval '1 hour');
update public.backup_runs set finished_at = now() - interval '30 hours', started_at = now() - interval '30 hours' where kind = 'STORAGE';
update public.retention_runs set started_at = now() - interval '3 days', finished_at = now() - interval '3 days';
select is(tests.issues(), array['backup_storage_old', 'function_calls_failed', 'job_failed:cleanup-files-hourly', 'retention_not_running'],
  'a failed job, a failed function call, an old Storage backup and retention not running are each listed');

select private.check_system_health();
select is((select count(*)::int from public.notifications where notification_type = 'SYSTEM_ALERT' and recipient_id = tests.uid('a1')), 4,
  'the administrator gets one alert for each');
select private.check_system_health();
select is((select count(*)::int from public.notifications where notification_type = 'SYSTEM_ALERT' and recipient_id = tests.uid('a1')), 4,
  'running the check again the same day alerts no one twice');
select is((select count(*)::int from public.notifications where notification_type = 'SYSTEM_ALERT' and recipient_id = tests.uid('l1')), 0, 'learners are never alerted');

-- A database backup that never ran at all, and a failed one.
delete from public.backup_runs where kind = 'DATABASE';
select ok('backup_database_missing' = any (tests.issues()), 'no database backup at all is listed');
select tests.as_service();
select public.backup_report('DATABASE', false, null, null, 'pg_dump: connection timed out');
select tests.reset();
select ok('backup_database_failed' = any (tests.issues()), 'a failed last database backup is listed');

-- ---------------------------------------------------------------- what administrators see
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select ok((select count(*) from public.system_health()) >= 4, 'an administrator with two-step verification reads the issues');
select ok((select bool_and(message <> '' and severity in ('warning', 'error')) from public.system_health()), 'each with a message and a severity');
select is((select count(*)::int from public.backup_runs), 2, 'and reads the backup runs');

select * from finish();
rollback;
