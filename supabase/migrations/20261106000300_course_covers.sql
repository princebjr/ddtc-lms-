-- Phase 5, migration 16: the `course-covers` bucket (DATA_MODEL.md section 6; D17, D18, D33),
-- built like `profile-images`. Private. A VALIDATED cover is readable by whoever can see the course
-- (administrators, its lecturers, learners enrolled once it is PUBLISHED or ARCHIVED). There is no
-- client write policy: register-upload creates the PENDING row and a signed upload URL for the
-- server-chosen path `<course id>/<file id>.<ext>`, and finalize-upload checks the bytes and sets
-- the course's cover. Replaced covers are removed by finalize-upload and the cleanup-files job.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-covers', 'course-covers', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

-- The course id is the first path segment. A malformed name answers false instead of failing.
create function private.can_see_cover(p_name text) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_course uuid;
begin
  begin
    v_course := split_part(p_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return private.can_see_course(v_course);
end;
$$;
revoke execute on function private.can_see_cover(text) from public, anon;
grant execute on function private.can_see_cover(text) to authenticated;

create policy course_covers_read_validated on storage.objects
  for select to authenticated
  using (
    bucket_id = 'course-covers'
    and (select private.is_active_user())
    and private.is_validated_object(bucket_id, name)
    and private.can_see_cover(name)
  );

-- Same as Phase 4, plus VALIDATED course covers that no course points to any more (replaced).
create or replace function public.files_due_for_cleanup(p_limit integer default 100)
returns table (id uuid, bucket_name text, storage_path text, status public.file_status, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  with expiry as (
    select coalesce((select (value)::text::int from public.system_settings where key = 'pending_upload_expiry_hours'), 24) as hours
  )
  select f.id, f.bucket_name, f.storage_path, f.status,
         case
           when f.status = 'PENDING' then 'expired_pending'
           when f.status = 'REJECTED' then 'rejected'
           when f.status = 'DELETE_FAILED' then 'retry'
           when f.resource_type = 'COURSE_COVER' then 'replaced_course_cover'
           else 'replaced_profile_image'
         end
    from public.file_objects f, expiry e
   where (f.status = 'PENDING' and f.uploaded_at < now() - make_interval(hours => e.hours))
      or f.status in ('REJECTED', 'DELETE_FAILED')
      -- The only VALIDATED files ever removed here: profile images and course covers nobody uses any more.
      or (f.status = 'VALIDATED' and f.resource_type = 'PROFILE_IMAGE'
          and not exists (select 1 from public.profiles p where p.profile_image_file_id = f.id))
      or (f.status = 'VALIDATED' and f.resource_type = 'COURSE_COVER'
          and not exists (select 1 from public.courses c where c.cover_image_file_id = f.id))
   order by f.uploaded_at
   limit greatest(1, least(p_limit, 500));
$$;

-- Where each visible course's cover is stored. file_objects shows people only their own uploads,
-- so learners and co-lecturers get the path here, and only for courses they may see.
create function public.course_cover_paths(p_courses uuid[])
returns table (course_id uuid, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, f.storage_path
    from public.courses c
    join public.file_objects f on f.id = c.cover_image_file_id and f.status = 'VALIDATED'
   where c.id = any (p_courses[1:200]) and private.can_see_course(c.id);
$$;
revoke execute on function public.course_cover_paths(uuid[]) from public, anon;
grant execute on function public.course_cover_paths(uuid[]) to authenticated;
