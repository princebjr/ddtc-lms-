-- Phase 7, migration 25 (D43, ADR-011, owner request 2026-11-07): idle sign-out after 10 minutes for
-- every role, replacing D32's per-role idle values (the absolute session limits stay).
--   * Settings idle_timeout_minutes (10; whole minutes, 5 to 60) and idle_warning_seconds (120; whole
--     seconds, 30 to 180), not sensitive. Only an AAL2 administrator changes settings (existing
--     policy) and every change is audited (existing trigger); the bounds are a CHECK.
--   * idle_settings(): every signed-in user reads the two values (learners cannot read the table).
--   * is_admin(): an administrator session idle for longer than idle_timeout_minutes is refused (was 30
--     minutes, from session_limits). This is the server side of the idle limit for administrators;
--     for everyone, access tokens last 10 minutes and sign-out revokes the refresh token (Auth config).
--   * session_limits keeps only the absolute limits.

-- A whole number within bounds, for the CHECK below. A JSON value of another type is refused, never cast.
create function private.json_int_between(p_value jsonb, p_min integer, p_max integer) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if jsonb_typeof(p_value) is distinct from 'number' then
    return false;
  end if;
  v := (p_value #>> '{}')::numeric;
  return v = trunc(v) and v between p_min and p_max;
end;
$$;
-- A CHECK runs as the user making the change (an administrator's session), so they may call it.
revoke execute on function private.json_int_between(jsonb, integer, integer) from public, anon;
grant execute on function private.json_int_between(jsonb, integer, integer) to authenticated, service_role;

insert into public.system_settings (key, value, is_sensitive, description) values
  ('idle_timeout_minutes', '10', false, 'D43: every role is signed out after this many minutes without activity (5 to 60)'),
  ('idle_warning_seconds', '120', false, 'D43: the warning shows this many seconds before the idle sign-out (30 to 180)');

alter table public.system_settings add constraint system_settings_idle_bounds check (
  case key
    when 'idle_timeout_minutes' then private.json_int_between(value, 5, 60)
    when 'idle_warning_seconds' then private.json_int_between(value, 30, 180)
    else true
  end
);

-- D32's idle values no longer apply; the absolute lifetimes are unchanged.
update public.system_settings
   set value = jsonb_build_object(
         'ADMIN', jsonb_build_object('absolute_hours', coalesce((value -> 'ADMIN' ->> 'absolute_hours')::int, 12)),
         'LECTURER', jsonb_build_object('absolute_hours', coalesce((value -> 'LECTURER' ->> 'absolute_hours')::int, 168)),
         'LEARNER', jsonb_build_object('absolute_hours', coalesce((value -> 'LEARNER' ->> 'absolute_hours')::int, 720))),
       description = 'D32: absolute session lifetime per role (the idle limit is idle_timeout_minutes, D43)'
 where key = 'session_limits';

-- The idle limit and its warning, for every signed-in user.
create function public.idle_settings() returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'timeout_minutes', coalesce((select (value #>> '{}')::int from public.system_settings where key = 'idle_timeout_minutes'), 10),
    'warning_seconds', coalesce((select (value #>> '{}')::int from public.system_settings where key = 'idle_warning_seconds'), 120));
$$;
revoke execute on function public.idle_settings() from public, anon;
grant execute on function public.idle_settings() to authenticated, service_role;

-- As migration 12, with the idle window from idle_timeout_minutes (D43).
create or replace function private.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with limits as (
    select coalesce((select (value -> 'ADMIN' ->> 'absolute_hours')::int from public.system_settings where key = 'session_limits'), 12) as absolute_hours,
           coalesce((select (value #>> '{}')::int from public.system_settings where key = 'idle_timeout_minutes'), 10) as idle_minutes
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
