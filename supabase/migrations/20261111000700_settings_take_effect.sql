-- Step 11.1, migration 44 (owner request of 2026-11-11, ADR-020 item 7): every administrator setting takes
-- effect. A changed upload limit did nothing because the Storage buckets kept the sizes written by their
-- own migrations (2 MB for photos and covers) and the screens kept fixed numbers.
--   * Storage buckets follow file_limits: each bucket's file_size_limit is the largest limit of the kinds
--     stored in it, set now and again whenever an administrator changes file_limits (the Edge Functions
--     still check each kind's own limit, D18).
--   * client_settings(): the values the screens need to check a file before uploading it, to label the
--     publish button and to suggest a new examination's pass mark, for every active signed-in user
--     (learners cannot read system_settings). Nothing sensitive.

-- ---------------------------------------------------------------- buckets follow file_limits
/** Sets each bucket's size limit from file_limits (the largest of the kinds kept in that bucket). */
create function private.sync_bucket_limits(p_limits jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
begin
  for m in
    select * from (values
      ('profile-images', array['profile_image']),
      ('course-covers', array['course_cover']),
      ('lesson-audio', array['lesson_audio']),
      ('lesson-attachments', array['lesson_attachment']),
      ('assignment-instructions-audio', array['instruction_audio']),
      ('learner-submissions', array['submission_audio', 'submission_document'])
    ) as t(bucket, kinds)
  loop
    update storage.buckets b
       set file_size_limit = (select max((p_limits -> k ->> 'max_bytes')::bigint) from unnest(m.kinds) k)
     where b.id = m.bucket
       and (select max((p_limits -> k ->> 'max_bytes')::bigint) from unnest(m.kinds) k) is not null;
  end loop;
end;
$$;

revoke execute on function private.sync_bucket_limits(jsonb) from public, anon, authenticated;

create function private.file_limits_changed() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_bucket_limits(new.value);
  return null;
end;
$$;

revoke execute on function private.file_limits_changed() from public, anon, authenticated;

create trigger system_settings_file_limits_buckets
  after update on public.system_settings
  for each row
  when (new.key = 'file_limits' and old.value is distinct from new.value)
  execute function private.file_limits_changed();

select private.sync_bucket_limits((select value from public.system_settings where key = 'file_limits'));

-- ---------------------------------------------------------------- what the screens read
/** Upload limits per kind, the pass mark and whether courses need approval, for any active user. */
create function public.client_settings() returns jsonb
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
    'require_course_approval', coalesce((select value = 'true'::jsonb from public.system_settings where key = 'require_course_approval'), true));
end;
$$;

revoke execute on function public.client_settings() from public, anon;
grant execute on function public.client_settings() to authenticated, service_role;
