-- Phase 15 (ADR-028: production on the Supabase free plan), migration 57: warn before the plan's limits are reached.
--   * plan_storage_limit_mb (1024) and plan_database_limit_mb (500): the plan's limits as settings, so a change of
--     plan is one change on Settings (never a hard-coded limit).
--   * The daily health check and the System health card warn at 80% of either limit and raise an error at 95%,
--     saying how much is used and what is left. Stored files are counted from storage.objects, the database from
--     pg_database_size. Monthly downloads (egress) cannot be measured from the database: the runbook says where
--     to check them.

insert into public.system_settings (key, value, description, is_sensitive) values
  ('plan_storage_limit_mb', '1024'::jsonb, 'File storage the Supabase plan allows, in MB (free plan: 1024)', false),
  ('plan_database_limit_mb', '500'::jsonb, 'Database size the Supabase plan allows, in MB (free plan: 500)', false)
on conflict (key) do nothing;

alter table public.system_settings add constraint system_settings_plan_limits check (
  case key
    when 'plan_storage_limit_mb' then private.json_int_between(value, 100, 10000000)
    when 'plan_database_limit_mb' then private.json_int_between(value, 100, 10000000)
    else true
  end
);

/** Use of the plan's file storage and database, as issues once 80% is reached (95%: an error). */
create function private.plan_usage_issues()
returns table (key text, severity text, title text, message text)
language sql
stable
security definer
set search_path = ''
as $$
  with usage as (
    select 'storage' as what, 'File storage' as label,
           coalesce((select sum((o.metadata ->> 'size')::bigint) from storage.objects o), 0) as used,
           coalesce((select (value #>> '{}')::bigint from public.system_settings where key = 'plan_storage_limit_mb'), 1024) * 1048576 as allowed
    union all
    select 'database', 'The database', pg_database_size(current_database()),
           coalesce((select (value #>> '{}')::bigint from public.system_settings where key = 'plan_database_limit_mb'), 500) * 1048576
  )
  select 'plan_' || u.what || '_' || case when u.used >= u.allowed * 0.95 then 'full' else 'high' end,
         case when u.used >= u.allowed * 0.95 then 'error' else 'warning' end,
         case when u.used >= u.allowed * 0.95 then format('%s is almost full', u.label) else format('%s is filling up', u.label) end,
         format('%s uses %s MB of %s MB (%s%%); %s MB left. See the runbook, "Plan limits".', u.label,
                round(u.used / 1048576.0), round(u.allowed / 1048576.0), round(100.0 * u.used / u.allowed),
                greatest(0, round((u.allowed - u.used) / 1048576.0)))
    from usage u
   where u.allowed > 0 and u.used >= u.allowed * 0.80
$$;
revoke execute on function private.plan_usage_issues() from public, anon, authenticated;

-- The health check is the earlier checks (migration 51) plus plan usage.
alter function private.system_health_issues() rename to system_health_issues_base;
create function private.system_health_issues()
returns table (key text, severity text, title text, message text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.system_health_issues_base()
  union all
  select * from private.plan_usage_issues()
$$;
revoke execute on function private.system_health_issues(), private.system_health_issues_base() from public, anon, authenticated;
