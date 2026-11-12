-- Phase 13, migration 51 (monitoring; owner decision ADR-023: no Sentry): a daily health check that turns failed
-- scheduled work into an alert every active administrator sees, in the app (and by email once the sending
-- domain exists).
--   * backup_runs: the scheduled backup job (outside the database, runbook "Backups") records each database and
--     Storage backup through backup_report (service role only). AAL2 administrators read the runs.
--   * private.system_health_issues: what needs attention now:
--       job_failed:<job>          a pg_cron job failed in the last 24 hours;
--       function_calls_failed     a scheduled call to an Edge Function failed or timed out in the last 24 hours;
--       files_not_removed         files failed to be removed three times or more;
--       emails_failed             emails failed for good in the last 24 hours;
--       retention_failed          the last retention run had failed deletions;
--       retention_not_running     no retention run for 48 hours;
--       backup_<kind>_missing     no successful backup of the database or Storage at all;
--       backup_<kind>_failed      the last backup failed;
--       backup_<kind>_old         the last successful backup is older than 26 hours (D34: RPO 24 hours).
--   * public.system_health: the same for the administrator dashboard (AAL2 administrators only).
--   * private.check_system_health: daily at 06:15, alerts administrators once per issue per day.

create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('DATABASE', 'STORAGE')),
  succeeded boolean not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  location text check (location is null or char_length(location) <= 500),
  error text check (error is null or char_length(error) <= 2000),
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint backup_runs_failure_has_reason check (succeeded or error is not null)
);
create index backup_runs_kind_finished_idx on public.backup_runs (kind, finished_at desc);
alter table public.backup_runs enable row level security;
revoke all on public.backup_runs from anon, authenticated;
grant select on public.backup_runs to authenticated;
grant select, insert on public.backup_runs to service_role;
create policy backup_runs_admin_read on public.backup_runs for select to authenticated using ((select private.is_admin()));

/** Records one backup run (the scheduled backup job, service role only). */
create function public.backup_report(p_kind text, p_succeeded boolean, p_size_bytes bigint, p_location text, p_error text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not p_succeeded and nullif(btrim(coalesce(p_error, '')), '') is null then
    raise exception 'Say why the backup failed' using errcode = '22023';
  end if;
  insert into public.backup_runs (kind, succeeded, size_bytes, location, error)
  values (p_kind, p_succeeded, p_size_bytes, p_location, left(p_error, 2000))
  returning id into v_id;
  perform private.write_audit(case when p_succeeded then 'backup.succeeded' else 'backup.failed' end, 'backup_run', v_id::text,
    jsonb_build_object('kind', p_kind, 'size_bytes', p_size_bytes));
  return v_id;
end;
$$;
revoke execute on function public.backup_report(text, boolean, bigint, text, text) from public, anon, authenticated;
grant execute on function public.backup_report(text, boolean, bigint, text, text) to service_role;

/** Everything that needs an administrator's attention now. */
create function private.system_health_issues()
returns table (key text, severity text, title text, message text)
language sql
stable
security definer
set search_path = ''
as $$
  -- pg_cron jobs that failed in the last day
  select 'job_failed:' || j.jobname, 'error', 'A scheduled job failed',
         format('"%s" failed %s time(s) in the last 24 hours. Last error: %s', j.jobname, count(*), left(max(d.return_message), 200))
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
   where d.status = 'failed' and d.start_time > now() - interval '24 hours'
   group by j.jobname
  union all
  -- scheduled calls to Edge Functions (cleanup, email, retention) that failed
  select 'function_calls_failed', 'error', 'Scheduled work could not run',
         format('%s scheduled call(s) to the server functions failed or timed out in the last 24 hours.', count(*))
    from net._http_response r
   where r.created > now() - interval '24 hours' and (r.timed_out or r.status_code >= 400 or r.error_msg is not null)
  having count(*) > 0
  union all
  select 'files_not_removed', 'warning', 'Files could not be removed',
         format('%s stored file(s) failed to be removed three times or more.', count(*))
    from public.file_objects f where f.status = 'DELETE_FAILED' and f.delete_attempts >= 3
  having count(*) > 0
  union all
  select 'emails_failed', 'warning', 'Emails could not be sent',
         format('%s email(s) failed for good in the last 24 hours.', count(*))
    from public.notification_deliveries n where n.status = 'FAILED' and n.updated_at > now() - interval '24 hours'
  having count(*) > 0
  union all
  select 'retention_failed', 'warning', 'Retention could not remove some files',
         format('The last retention run could not remove %s file(s); it tries again tomorrow.', r.failed_count)
    from (select * from public.retention_runs order by started_at desc limit 1) r where r.failed_count > 0
  union all
  select 'retention_not_running', 'warning', 'Retention has not run',
         'No retention run in the last 48 hours: the daily job is not running.'
   where not exists (select 1 from public.retention_runs where started_at > now() - interval '48 hours')
  union all
  -- backups (D34: up to 24 hours of data may be lost; alert after 26)
  select format('backup_%s_%s', lower(k.kind), case when last_any.id is null then 'missing' when not last_any.succeeded then 'failed' else 'old' end),
         'error',
         case when last_any.id is null then format('No %s backup yet', lower(k.kind))
              when not last_any.succeeded then format('The last %s backup failed', lower(k.kind))
              else format('The %s backup is out of date', lower(k.kind)) end,
         case when last_any.id is null then format('No successful %s backup has been recorded. See the runbook, "Backups".', lower(k.kind))
              when not last_any.succeeded then format('%s backup failed at %s: %s', initcap(lower(k.kind)), to_char(last_any.finished_at at time zone 'Africa/Accra', 'DD Mon HH24:MI'), left(last_any.error, 200))
              else format('The last successful %s backup finished %s hours ago (D34 allows 24).', lower(k.kind), floor(extract(epoch from now() - last_ok.finished_at) / 3600)) end
    from (values ('DATABASE'), ('STORAGE')) as k(kind)
    left join lateral (select * from public.backup_runs b where b.kind = k.kind order by b.finished_at desc limit 1) last_any on true
    left join lateral (select * from public.backup_runs b where b.kind = k.kind and b.succeeded order by b.finished_at desc limit 1) last_ok on true
   where last_any.id is null or not last_any.succeeded or last_ok.finished_at < now() - interval '26 hours';
$$;
revoke execute on function private.system_health_issues() from public, anon, authenticated;

/** What needs attention, for the administrator dashboard. AAL2 administrators only. */
create function public.system_health()
returns table (key text, severity text, title text, message text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only administrators read the system''s health' using errcode = '42501';
  end if;
  return query select * from private.system_health_issues() order by 2, 1;
end;
$$;
revoke execute on function public.system_health() from public, anon;
grant execute on function public.system_health() to authenticated;

/** Daily: alerts every active administrator once per issue per day (alert_admins deduplicates by key). */
create function private.check_system_health() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i record;
begin
  for i in select * from private.system_health_issues() loop
    perform private.alert_admins(i.title, i.message, 'health:' || i.key || ':' || to_char(now() at time zone 'Africa/Accra', 'YYYY-MM-DD'));
  end loop;
end;
$$;
revoke execute on function private.check_system_health() from public, anon, authenticated;

select cron.schedule('system-health-daily', '15 6 * * *', 'select private.check_system_health()');
