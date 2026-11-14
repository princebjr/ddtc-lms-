-- Phase 15 (D45 stability), migration 58: switches for heavy features, so DDTC can pause them when the system is
-- under strain (the graceful degradation order: exports and reports pause first; sign-in, lessons and answers are
-- protected last, docs/PERFORMANCE.md).
--   * exports_enabled: gradebook and report exports (the export-gradebook Edge Function checks it).
--   * reports_enabled: the administrators' reports (every report_* function checks it through
--     require_report_admin).
-- Both on by default; only an AAL2 administrator changes them (Settings), audited like every setting.

insert into public.system_settings (key, value, description, is_sensitive) values
  ('exports_enabled', 'true'::jsonb, 'Gradebook and report exports are available (off: paused for everyone)', false),
  ('reports_enabled', 'true'::jsonb, 'Administrator reports are available (off: paused)', false)
on conflict (key) do nothing;

alter table public.system_settings add constraint system_settings_feature_switches check (
  case key
    when 'exports_enabled' then jsonb_typeof(value) = 'boolean'
    when 'reports_enabled' then jsonb_typeof(value) = 'boolean'
    else true
  end
);

/** Whether a heavy feature is on (a missing setting counts as on). */
create function private.feature_enabled(p_key text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value = 'true'::jsonb from public.system_settings where key = p_key), true)
$$;
revoke execute on function private.feature_enabled(text) from public, anon, authenticated;
grant execute on function private.feature_enabled(text) to service_role;

create or replace function private.require_report_admin() returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only administrators read reports' using errcode = '42501';
  end if;
  if not private.feature_enabled('reports_enabled') then
    raise exception 'Reports are paused by DDTC for now. Try again later.' using errcode = 'P0503';
  end if;
end;
$$;

/** For the export Edge Function (service role): whether exports are on. */
create function public.exports_enabled() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.feature_enabled('exports_enabled')
$$;
revoke execute on function public.exports_enabled() from public, anon, authenticated;
grant execute on function public.exports_enabled() to service_role;
