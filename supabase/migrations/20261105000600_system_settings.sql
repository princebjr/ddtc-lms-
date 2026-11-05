-- Phase 2, migration 6: system settings, seeded with every default from BUILD_PLAN v1.7
-- (D04, D14, D15, D17, D20, D24, D31, D32, D10, D18, D19). Administrators (AAL2) read and edit;
-- lecturers read non-sensitive rows; learners read none. Keys are added only by migrations.

create table public.system_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  value jsonb not null,
  description text not null default '',
  is_sensitive boolean not null default false,
  updated_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger system_settings_set_updated_at
  before update on public.system_settings
  for each row execute function private.set_updated_at();

-- A setting keeps its JSON type, and the editor is recorded.
create function private.system_settings_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(new.value) is distinct from jsonb_typeof(old.value) then
    raise exception 'Setting % must stay a JSON %', old.key, jsonb_typeof(old.value) using errcode = '22023';
  end if;
  if new.key is distinct from old.key then
    raise exception 'Setting keys cannot be renamed' using errcode = '42501';
  end if;
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

create trigger system_settings_guard
  before update on public.system_settings
  for each row execute function private.system_settings_guard();

create function private.audit_setting_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.write_audit('setting.updated', 'system_setting', new.key,
    jsonb_build_object('old_value', old.value, 'new_value', new.value));
  return null;
end;
$$;

create trigger system_settings_audit
  after update on public.system_settings
  for each row
  when (old.value is distinct from new.value)
  execute function private.audit_setting_change();

alter table public.system_settings enable row level security;

revoke all on public.system_settings from anon, authenticated;
grant select on public.system_settings to authenticated;
grant update (value) on public.system_settings to authenticated;
grant select, update on public.system_settings to service_role;

create policy system_settings_select_admin on public.system_settings
  for select to authenticated
  using ((select private.is_admin()));

create policy system_settings_select_lecturer on public.system_settings
  for select to authenticated
  using (not is_sensitive and (select private.is_active_lecturer()));

create policy system_settings_update_admin on public.system_settings
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ---------------------------------------------------------------- defaults
insert into public.system_settings (key, value, is_sensitive, description) values
  ('require_course_approval', 'true', false,
   'D04: lecturers submit courses for administrator approval before publishing'),
  ('grade_scale', '[{"grade":"A","min":80,"max":100},{"grade":"B","min":70,"max":79},{"grade":"C","min":60,"max":69},{"grade":"D","min":50,"max":59},{"grade":"F","min":0,"max":49}]', false,
   'D14: letter grades by percentage'),
  ('pass_mark', '50', false,
   'D14: pass mark (percentage)'),
  ('distribution_bands', '[[0,50],[50,60],[60,70],[70,80],[80,90],[90,100]]', false,
   'D15: chart bands, lower <= percentage < upper; 100 is included in the last band'),
  ('min_class_size', '5', false,
   'D15: learners see the class chart only from this many graded results'),
  ('file_limits', '{
     "lesson_audio": {"max_bytes": 104857600, "max_seconds": 5400, "extensions": ["mp3","m4a","wav"]},
     "instruction_audio": {"max_bytes": 26214400, "max_seconds": 600, "extensions": ["mp3","m4a","wav"]},
     "submission_audio": {"max_bytes": 26214400, "max_seconds": 600, "extensions": ["mp3","m4a","mp4","wav","webm","ogg"]},
     "submission_document": {"max_bytes": 10485760, "extensions": ["pdf","docx"]},
     "lesson_attachment": {"max_bytes": 26214400, "extensions": ["pdf","docx","pptx"]},
     "profile_image": {"max_bytes": 2097152, "extensions": ["jpg","jpeg","png","webp"]},
     "course_cover": {"max_bytes": 2097152, "extensions": ["jpg","jpeg","png","webp"]},
     "resumable_over_bytes": 26214400
   }', false,
   'D17 and D18: upload limits'),
  ('max_files_per_submission_version', '5', false,
   'D10: files per submission version'),
  ('display_timezone', '"Africa/Accra"', false,
   'D24: display time zone; database timestamps are UTC'),
  ('retention_enabled', 'false', true,
   'D20: real deletion of learner audio; off at launch'),
  ('retention_days', '180', true,
   'D20: days after grade release before learner audio is eligible'),
  ('retention_dry_run_days', '30', true,
   'D20: dry-run period after launch'),
  ('notification_retry_minutes', '[1,5,15,60,240]', true,
   'D31: waits after each transient email failure; FAILED after the last'),
  ('session_limits', '{
     "ADMIN": {"idle_minutes": 30, "absolute_hours": 12},
     "LECTURER": {"idle_minutes": 480, "absolute_hours": 168},
     "LEARNER": {"idle_minutes": 10080, "absolute_hours": 720}
   }', true,
   'D32: idle and absolute session limits per role'),
  ('pending_upload_expiry_hours', '24', true,
   'D18: PENDING uploads older than this are cleaned'),
  ('signed_url_expiry_seconds', '{"playback": 3600, "download": 300}', true,
   'D19: signed URL lifetimes');
