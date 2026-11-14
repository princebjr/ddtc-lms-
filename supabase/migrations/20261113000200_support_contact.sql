-- Phase 15 (owner request 2026-11-13, ADR-027), migration 56: the support contact shown in Help & Support.
--   * support_email and support_phone: settings administrators change on Settings (AAL2, audited like every
--     setting). Empty until DDTC sets them; the Help page then says to ask a lecturer or an administrator.
--   * The database refuses a malformed value: an email with one @ and a dot in its domain (up to 200 characters),
--     a phone number of 7 to 15 digits with an optional leading + and spaces (used for calls and WhatsApp).
--   * client_settings() (active signed-in users) gains `support`, so learners and lecturers can read the contact.

insert into public.system_settings (key, value, description, is_sensitive) values
  ('support_email', '""'::jsonb, 'Support email shown in Help & Support (empty: not shown)', false),
  ('support_phone', '""'::jsonb, 'Support phone and WhatsApp number shown in Help & Support (empty: not shown)', false)
on conflict (key) do nothing;

alter table public.system_settings add constraint system_settings_support_contact check (
  case key
    when 'support_email' then jsonb_typeof(value) = 'string'
      and (value #>> '{}' = '' or (char_length(value #>> '{}') <= 200 and value #>> '{}' ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
    when 'support_phone' then jsonb_typeof(value) = 'string'
      and (value #>> '{}' = '' or (value #>> '{}' ~ '^\+?[0-9 ]+$' and char_length(regexp_replace(value #>> '{}', '[^0-9]', '', 'g')) between 7 and 15))
    else true
  end
);

create or replace function public.client_settings() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limits jsonb := '{}';
  r record;
begin
  if not private.is_active_user() then
    raise exception 'Sign in to read settings' using errcode = '42501';
  end if;
  for r in select key, value from jsonb_each((select value from public.system_settings where key = 'file_limits')) loop
    if jsonb_typeof(r.value) = 'object' then
      v_limits := v_limits || jsonb_build_object(r.key, jsonb_strip_nulls(jsonb_build_object(
        'max_bytes', r.value -> 'max_bytes', 'max_seconds', r.value -> 'max_seconds')));
    end if;
  end loop;
  return jsonb_build_object(
    'file_limits', v_limits,
    'pass_mark', coalesce((select (value #>> '{}')::int from public.system_settings where key = 'pass_mark'), 50),
    'require_course_approval', coalesce((select value = 'true'::jsonb from public.system_settings where key = 'require_course_approval'), true),
    'support', jsonb_build_object(
      'email', coalesce((select value #>> '{}' from public.system_settings where key = 'support_email'), ''),
      'phone', coalesce((select value #>> '{}' from public.system_settings where key = 'support_phone'), '')));
end;
$$;

revoke execute on function public.client_settings() from public, anon;
grant execute on function public.client_settings() to authenticated, service_role;
