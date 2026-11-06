-- Phase 4, migration 12: an administrator's first requests after two-step verification could arrive
-- before the app recorded the session's first activity, and is_admin() then refused them (the admin
-- dashboard showed only the administrator's own row). Idle time now counts from the last recorded
-- activity, or from the start of the session when nothing is recorded yet. The D32 limits are
-- unchanged: 30 minutes idle, 12 hours absolute.

create or replace function private.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with limits as (
    select coalesce((value -> 'ADMIN' ->> 'absolute_hours')::int, 12) as absolute_hours,
           coalesce((value -> 'ADMIN' ->> 'idle_minutes')::int, 30) as idle_minutes
      from public.system_settings where key = 'session_limits'
    union all select 12, 30
    limit 1
  )
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (
       select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.role = 'ADMIN' and p.account_status = 'ACTIVE'
     )
     and exists (
       select 1
         from auth.sessions s
         left join private.session_activity a on a.session_id = s.id
         cross join limits l
        where s.id = nullif((select auth.jwt() ->> 'session_id'), '')::uuid
          and s.user_id = (select auth.uid())
          and s.created_at > now() - make_interval(hours => l.absolute_hours)
          and coalesce(a.last_seen_at, s.created_at) > now() - make_interval(mins => l.idle_minutes)
     );
$$;
