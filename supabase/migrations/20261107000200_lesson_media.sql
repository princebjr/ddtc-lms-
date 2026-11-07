-- Phase 6, migration 20 (ADR-007, owner decisions 2026-11-07): lesson media management.
--   * A lesson has up to 10 audio files, each with a title and a position the lecturer chooses
--     (replaces D09's "exactly one ACTIVE audio"). Replacing one keeps the old file as SUPERSEDED
--     history in the same place, as before.
--   * Delete, for lesson audio (in use or history), attachments and course covers: the item leaves
--     the lesson or course at once and its record is kept with who deleted it and when; the file
--     is then removed from Storage by the delete-media Edge Function, and the cleanup-files job
--     retries any removal that failed (this replaces D25's "files are kept" and Phase 12's "never
--     deletes lesson audio or attachments" for these resources only).
--   * Only administrators and the course's lecturers, and only through these trusted functions
--     (service role). There is no DELETE privilege or policy for any client role on the tables or
--     the buckets, so nobody can delete a row or a file directly.

-- ---------------------------------------------------------------- lesson audio: title, position, deleted
alter table public.lesson_audio_files
  add column title text,
  add column position integer,
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles (id) on delete restrict;

update public.lesson_audio_files a
   set title = left(coalesce(nullif(btrim(regexp_replace(f.original_filename, '\.[^.]*$', '')), ''), 'Lesson audio'), 200)
  from public.file_objects f
 where f.id = a.file_object_id;
update public.lesson_audio_files set position = 1 where lifecycle_status = 'ACTIVE';

drop index public.lesson_audio_files_one_active;

alter table public.lesson_audio_files
  alter column title set not null,
  add constraint lesson_audio_files_title_length check (char_length(title) between 1 and 200),
  -- An audio in use has a place in the lesson (1 to 10, so at most ten); history and deleted ones do not.
  add constraint lesson_audio_files_position check ((lifecycle_status = 'ACTIVE') = (position is not null) and (position is null or position between 1 and 10)),
  add constraint lesson_audio_files_deleted check ((lifecycle_status = 'DELETED') = (deleted_at is not null) and (deleted_at is null) = (deleted_by is null)),
  -- One audio per place. An exclusion constraint so it can be partial and deferred while a reorder
  -- or a deletion moves several audio files in one transaction.
  add constraint lesson_audio_files_active_position
    exclude using btree (lesson_id with =, position with =) where (lifecycle_status = 'ACTIVE') deferrable initially immediate;

comment on column public.lesson_attachments.removed_at is 'When the attachment was deleted (ADR-007): the record is kept, the file is removed from Storage.';

-- ---------------------------------------------------------------- Storage reads: deleted files are gone at once
-- As migration 17, plus: a file whose audio or attachment was deleted is readable by nobody, even
-- in the moments before Storage removes it.
create or replace function private.can_read_lesson_object(p_bucket text, p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.file_objects f
     where f.bucket_name = p_bucket and f.storage_path = p_name and f.status = 'VALIDATED'
       and f.resource_type in ('LESSON_AUDIO', 'LESSON_ATTACHMENT')
       and not exists (select 1 from public.lesson_audio_files d where d.file_object_id = f.id and d.lifecycle_status = 'DELETED')
       and not exists (select 1 from public.lesson_attachments d where d.file_object_id = f.id and d.removed_at is not null)
       and (
         private.can_manage_lesson(f.resource_id)
         or (p_bucket = 'lesson-audio' and exists (
               select 1 from public.lesson_audio_files a
                where a.file_object_id = f.id and a.lifecycle_status = 'ACTIVE' and private.can_see_lesson(a.lesson_id)))
         or (p_bucket = 'lesson-attachments' and exists (
               select 1 from public.lesson_attachments x
                where x.file_object_id = f.id and x.removed_at is null and private.can_see_lesson(x.lesson_id)))
       )
  );
$$;

-- ---------------------------------------------------------------- the player's facts: every audio in order
create or replace function public.lesson_media(p_lesson uuid)
returns table (
  kind text, item_id uuid, file_object_id uuid, title text, bucket_name text, storage_path text,
  safe_download_filename text, mime_type text, file_size bigint, duration_seconds numeric,
  waveform_peaks real[], sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'AUDIO', a.id, f.id, a.title, f.bucket_name, f.storage_path, f.safe_download_filename,
         f.detected_mime_type, f.file_size, f.duration_seconds, f.waveform_peaks, a.position
    from public.lesson_audio_files a
    join public.file_objects f on f.id = a.file_object_id and f.status = 'VALIDATED'
   where a.lesson_id = p_lesson and a.lifecycle_status = 'ACTIVE' and private.can_see_lesson(p_lesson)
  union all
  select 'ATTACHMENT', x.id, f.id, x.title, f.bucket_name, f.storage_path, f.safe_download_filename,
         f.detected_mime_type, f.file_size, null, null, x.position
    from public.lesson_attachments x
    join public.file_objects f on f.id = x.file_object_id and f.status = 'VALIDATED'
   where x.lesson_id = p_lesson and x.removed_at is null and private.can_see_lesson(p_lesson)
   order by 1, 12;
$$;

-- ---------------------------------------------------------------- adding or replacing audio
-- Called by finalize-upload once a LESSON_AUDIO file is VALIDATED. Without p_replace the file is
-- added at the end (at most 10 per lesson); with p_replace (an audio in use in the same lesson) it
-- takes that audio's place and title and the old one becomes SUPERSEDED history (D09).
drop function public.lesson_audio_activate(uuid, boolean, uuid);
create function public.lesson_audio_activate(p_actor uuid, p_as_admin boolean, p_file uuid, p_replace uuid default null, p_title text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.file_objects;
  v_course uuid;
  v_old public.lesson_audio_files;
  v_position integer;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_id uuid;
begin
  select * into v_file from public.file_objects where id = p_file;
  if not found or v_file.status <> 'VALIDATED' or v_file.resource_type <> 'LESSON_AUDIO' or v_file.bucket_name <> 'lesson-audio' then
    raise exception 'Only a validated lesson audio file can be used' using errcode = '22023';
  end if;
  select course_id into v_course from public.lessons where id = v_file.resource_id for update;
  if v_course is null then
    raise exception 'Lesson not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_course);

  if p_replace is not null then
    select * into v_old from public.lesson_audio_files
     where id = p_replace and lesson_id = v_file.resource_id and lifecycle_status = 'ACTIVE';
    if not found then
      raise exception 'The audio to replace is not in use in this lesson' using errcode = '22023';
    end if;
    update public.lesson_audio_files set lifecycle_status = 'SUPERSEDED', superseded_at = now(), position = null where id = v_old.id;
    v_position := v_old.position;
    v_title := coalesce(v_title, v_old.title);
  else
    if (select count(*) from public.lesson_audio_files where lesson_id = v_file.resource_id and lifecycle_status = 'ACTIVE') >= 10 then
      raise exception 'A lesson can have up to 10 audio files. Delete one to add another.' using errcode = 'P0413';
    end if;
    v_position := coalesce((select max(position) from public.lesson_audio_files where lesson_id = v_file.resource_id and lifecycle_status = 'ACTIVE'), 0) + 1;
  end if;
  v_title := left(coalesce(v_title, nullif(btrim(regexp_replace(v_file.original_filename, '\.[^.]*$', '')), ''), 'Lesson audio'), 200);

  insert into public.lesson_audio_files (lesson_id, file_object_id, uploaded_by, title, position)
  values (v_file.resource_id, p_file, v_file.uploaded_by, v_title, v_position)
  returning id into v_id;

  perform private.write_audit(case when p_replace is not null then 'lesson.audio_replaced' else 'lesson.audio_added' end, 'lesson',
    v_file.resource_id::text, jsonb_build_object('file', p_file, 'course', v_course, 'audio', v_id, 'replaced_audio', p_replace, 'title', v_title));
  return jsonb_build_object('lesson', v_file.resource_id, 'audio', v_id, 'replaced', p_replace is not null);
end;
$$;

-- ---------------------------------------------------------------- rename and reorder audio
create function public.lesson_audio_rename(p_actor uuid, p_as_admin boolean, p_audio uuid, p_title text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson uuid;
  v_course uuid;
  v_title text := btrim(coalesce(p_title, ''));
begin
  select a.lesson_id, l.course_id into v_lesson, v_course
    from public.lesson_audio_files a join public.lessons l on l.id = a.lesson_id
   where a.id = p_audio;
  if v_lesson is null then
    raise exception 'Audio not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_course);
  if char_length(v_title) not between 1 and 200 then
    raise exception 'Enter a title of 1 to 200 characters' using errcode = '22023';
  end if;
  update public.lesson_audio_files set title = v_title where id = p_audio and lifecycle_status = 'ACTIVE';
  if not found then
    raise exception 'Only an audio in use can be renamed' using errcode = '22023';
  end if;
  perform private.write_audit('lesson.audio_renamed', 'lesson', v_lesson::text, jsonb_build_object('audio', p_audio, 'title', v_title));
end;
$$;

-- p_audio must list every audio in use in the lesson exactly once, in the new order.
create function public.lesson_audio_reorder(p_actor uuid, p_as_admin boolean, p_lesson uuid, p_audio uuid[]) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course uuid;
  v_count integer;
begin
  select course_id into v_course from public.lessons where id = p_lesson for update;
  if v_course is null then
    raise exception 'Lesson not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_course);
  select count(*) into v_count from public.lesson_audio_files where lesson_id = p_lesson and lifecycle_status = 'ACTIVE';
  if coalesce(array_length(p_audio, 1), 0) <> v_count
     or (select count(distinct x) from unnest(p_audio) x) <> v_count
     or exists (select 1 from unnest(p_audio) x
                 where not exists (select 1 from public.lesson_audio_files a where a.id = x and a.lesson_id = p_lesson and a.lifecycle_status = 'ACTIVE')) then
    raise exception 'List every audio of the lesson exactly once' using errcode = '22023';
  end if;

  set constraints public.lesson_audio_files_active_position deferred;
  update public.lesson_audio_files a
     set position = o.ord
    from unnest(p_audio) with ordinality as o(id, ord)
   where a.id = o.id;
  set constraints public.lesson_audio_files_active_position immediate;

  perform private.write_audit('lesson.audio_reordered', 'lesson', p_lesson::text, jsonb_build_object('order', to_jsonb(p_audio)));
end;
$$;

-- ---------------------------------------------------------------- deleting audio
-- An audio in use or a history version: marked DELETED with who and when (the record is kept), the
-- remaining audio close the gap, and the answer names the file for delete-media to remove from
-- Storage. Deleting an already deleted audio answers the same (already = true) and changes nothing.
create function public.lesson_audio_delete(p_actor uuid, p_as_admin boolean, p_audio uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audio public.lesson_audio_files;
  v_course uuid;
  v_file public.file_objects;
begin
  select l.course_id into v_course
    from public.lesson_audio_files a join public.lessons l on l.id = a.lesson_id
   where a.id = p_audio;
  if v_course is null then
    raise exception 'Audio not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_course);
  select * into v_audio from public.lesson_audio_files where id = p_audio;
  perform 1 from public.lessons where id = v_audio.lesson_id for update;
  select * into v_audio from public.lesson_audio_files where id = p_audio;
  select * into v_file from public.file_objects where id = v_audio.file_object_id;

  if v_audio.lifecycle_status <> 'DELETED' then
    set constraints public.lesson_audio_files_active_position deferred;
    update public.lesson_audio_files
       set lifecycle_status = 'DELETED', deleted_at = now(), deleted_by = p_actor, position = null
     where id = p_audio;
    if v_audio.lifecycle_status = 'ACTIVE' then
      update public.lesson_audio_files set position = position - 1
       where lesson_id = v_audio.lesson_id and lifecycle_status = 'ACTIVE' and position > v_audio.position;
    end if;
    set constraints public.lesson_audio_files_active_position immediate;
    perform private.write_audit('lesson.audio_deleted', 'lesson', v_audio.lesson_id::text,
      jsonb_build_object('audio', p_audio, 'file', v_file.id, 'title', v_audio.title, 'was', v_audio.lifecycle_status, 'course', v_course));
  end if;
  return jsonb_build_object('lesson', v_audio.lesson_id, 'already', v_audio.lifecycle_status = 'DELETED',
    'file', v_file.id, 'bucket', v_file.bucket_name, 'path', v_file.storage_path);
end;
$$;

-- ---------------------------------------------------------------- deleting attachments
drop function public.lesson_attachment_remove(uuid, boolean, uuid);
create function public.lesson_attachment_delete(p_actor uuid, p_as_admin boolean, p_attachment uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachment public.lesson_attachments;
  v_course uuid;
  v_file public.file_objects;
begin
  select l.course_id into v_course
    from public.lesson_attachments x join public.lessons l on l.id = x.lesson_id
   where x.id = p_attachment;
  if v_course is null then
    raise exception 'Attachment not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_course);
  select * into v_attachment from public.lesson_attachments where id = p_attachment for update;
  select * into v_file from public.file_objects where id = v_attachment.file_object_id;

  if v_attachment.removed_at is null then
    update public.lesson_attachments set removed_at = now(), removed_by = p_actor where id = p_attachment;
    perform private.write_audit('lesson.attachment_deleted', 'lesson', v_attachment.lesson_id::text,
      jsonb_build_object('attachment', p_attachment, 'file', v_file.id, 'title', v_attachment.title, 'course', v_course));
  end if;
  return jsonb_build_object('lesson', v_attachment.lesson_id, 'already', v_attachment.removed_at is not null,
    'file', v_file.id, 'bucket', v_file.bucket_name, 'path', v_file.storage_path);
end;
$$;

-- ---------------------------------------------------------------- removing a course cover
-- The course falls back to the placeholder; the file is no longer used, so delete-media removes it
-- (and cleanup-files already retries unused covers). No cover: answers file = null.
create function public.course_cover_remove(p_actor uuid, p_as_admin boolean, p_course uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file_id uuid;
  v_file public.file_objects;
begin
  perform private.require_lesson_actor(p_actor, p_as_admin, p_course);
  select cover_image_file_id into v_file_id from public.courses where id = p_course for update;
  if v_file_id is null then
    return jsonb_build_object('course', p_course, 'file', null);
  end if;
  update public.courses set cover_image_file_id = null where id = p_course;
  select * into v_file from public.file_objects where id = v_file_id;
  perform private.write_audit('course.cover_removed', 'course', p_course::text, jsonb_build_object('file', v_file_id));
  return jsonb_build_object('course', p_course, 'file', v_file.id, 'bucket', v_file.bucket_name, 'path', v_file.storage_path);
end;
$$;

revoke execute on function
  public.lesson_audio_activate(uuid, boolean, uuid, uuid, text),
  public.lesson_audio_rename(uuid, boolean, uuid, text),
  public.lesson_audio_reorder(uuid, boolean, uuid, uuid[]),
  public.lesson_audio_delete(uuid, boolean, uuid),
  public.lesson_attachment_delete(uuid, boolean, uuid),
  public.course_cover_remove(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function
  public.lesson_audio_activate(uuid, boolean, uuid, uuid, text),
  public.lesson_audio_rename(uuid, boolean, uuid, text),
  public.lesson_audio_reorder(uuid, boolean, uuid, uuid[]),
  public.lesson_audio_delete(uuid, boolean, uuid),
  public.lesson_attachment_delete(uuid, boolean, uuid),
  public.course_cover_remove(uuid, boolean, uuid)
  to service_role;

-- ---------------------------------------------------------------- cleanup-files: retry deleted lesson media
-- As migration 16, plus the files of deleted lesson audio and attachments that are still in Storage
-- (delete-media removes them at once; this is the retry). Audio and attachments in use, and history
-- versions, are never listed.
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
           when f.resource_type = 'LESSON_AUDIO' then 'deleted_lesson_audio'
           when f.resource_type = 'LESSON_ATTACHMENT' then 'deleted_lesson_attachment'
           else 'replaced_profile_image'
         end
    from public.file_objects f, expiry e
   where (f.status = 'PENDING' and f.uploaded_at < now() - make_interval(hours => e.hours))
      or f.status in ('REJECTED', 'DELETE_FAILED')
      -- The only VALIDATED files ever removed here: profile images and course covers nobody uses any
      -- more, and the files of deleted lesson audio and attachments (ADR-007).
      or (f.status = 'VALIDATED' and f.resource_type = 'PROFILE_IMAGE'
          and not exists (select 1 from public.profiles p where p.profile_image_file_id = f.id))
      or (f.status = 'VALIDATED' and f.resource_type = 'COURSE_COVER'
          and not exists (select 1 from public.courses c where c.cover_image_file_id = f.id))
      or (f.status = 'VALIDATED' and f.resource_type = 'LESSON_AUDIO'
          and exists (select 1 from public.lesson_audio_files a where a.file_object_id = f.id and a.lifecycle_status = 'DELETED'))
      or (f.status = 'VALIDATED' and f.resource_type = 'LESSON_ATTACHMENT'
          and exists (select 1 from public.lesson_attachments x where x.file_object_id = f.id and x.removed_at is not null))
   order by f.uploaded_at
   limit greatest(1, least(p_limit, 500));
$$;
