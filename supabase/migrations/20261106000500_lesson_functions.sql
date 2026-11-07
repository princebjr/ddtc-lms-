-- Phase 6, migration 18: the trusted lesson functions (SECURITY_AND_ACCESS.md section 8; D07, D08,
-- D09, D25). manage-lessons and finalize-upload verify the caller and call these with the service
-- role, passing p_as_admin = true only after am_i_admin() succeeded with the caller's own token. Each
-- re-checks the actor and the course, makes the change and writes the audit record in one
-- transaction. Archived courses are read-only. Clients cannot call them.

-- ---------------------------------------------------------------- actor check
/** An administrator, or an ACTIVE lecturer who teaches the course; the course exists and is not archived. */
create function private.require_lesson_actor(p_actor uuid, p_as_admin boolean, p_course uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := private.require_course_actor(p_actor, p_as_admin);
  v_status public.course_status;
begin
  select status into v_status from public.courses where id = p_course;
  if not found then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;
  if v_role = 'LECTURER' and private.course_permission_of(p_course, p_actor) is null then
    raise exception 'You do not teach this course' using errcode = '42501';
  end if;
  if v_status = 'ARCHIVED' then
    raise exception 'This course is archived and read-only' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function private.require_lesson_actor(uuid, boolean, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- save (create or update)
-- p_lesson null creates a DRAFT at the end of the course. p_content is HTML already cleaned by
-- manage-lessons; the lessons table checks it again.
create function public.lesson_save(
  p_actor uuid,
  p_as_admin boolean,
  p_course uuid,
  p_lesson uuid,
  p_title text,
  p_content text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_lesson_actor(p_actor, p_as_admin, p_course);
  if p_lesson is null then
    -- Lock the course so two new lessons never take the same position.
    perform 1 from public.courses where id = p_course for update;
    insert into public.lessons (course_id, title, content, position, created_by)
    values (p_course, btrim(p_title), coalesce(p_content, ''),
            coalesce((select max(position) from public.lessons where course_id = p_course), 0) + 1, p_actor)
    returning id into v_id;
    perform private.write_audit('lesson.created', 'lesson', v_id::text, jsonb_build_object('course', p_course));
  else
    update public.lessons set title = btrim(p_title), content = coalesce(p_content, '')
     where id = p_lesson and course_id = p_course
    returning id into v_id;
    if v_id is null then
      raise exception 'This lesson does not belong to the course' using errcode = '22023';
    end if;
    perform private.write_audit('lesson.updated', 'lesson', v_id::text, jsonb_build_object('course', p_course));
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- publish and unpublish
create function public.lesson_set_publication(p_actor uuid, p_as_admin boolean, p_lesson uuid, p_publish boolean) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course uuid;
  v_status public.publication_status := case when p_publish then 'PUBLISHED' else 'DRAFT' end;
begin
  select course_id into v_course from public.lessons where id = p_lesson for update;
  if v_course is null then
    raise exception 'Lesson not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_course);
  update public.lessons
     set publication_status = v_status,
         published_at = case when p_publish then coalesce(published_at, now()) else published_at end
   where id = p_lesson;
  perform private.write_audit(case when p_publish then 'lesson.published' else 'lesson.unpublished' end, 'lesson', p_lesson::text,
    jsonb_build_object('course', v_course));
  return jsonb_build_object('id', p_lesson, 'status', v_status);
end;
$$;

-- ---------------------------------------------------------------- reorder (D08, atomic)
-- p_lessons must list every lesson of the course exactly once, in the new order.
create function public.lesson_reorder(p_actor uuid, p_as_admin boolean, p_course uuid, p_lessons uuid[]) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform private.require_lesson_actor(p_actor, p_as_admin, p_course);
  perform 1 from public.lessons where course_id = p_course for update;
  select count(*) into v_count from public.lessons where course_id = p_course;
  if coalesce(array_length(p_lessons, 1), 0) <> v_count
     or (select count(distinct x) from unnest(p_lessons) x) <> v_count
     or exists (select 1 from unnest(p_lessons) x where not exists (select 1 from public.lessons l where l.id = x and l.course_id = p_course)) then
    raise exception 'List every lesson of the course exactly once' using errcode = '22023';
  end if;

  set constraints public.lessons_course_position_key deferred;
  update public.lessons l
     set position = o.ord
    from unnest(p_lessons) with ordinality as o(id, ord)
   where l.id = o.id;
  set constraints public.lessons_course_position_key immediate;

  perform private.write_audit('lesson.reordered', 'course', p_course::text, jsonb_build_object('order', to_jsonb(p_lessons)));
end;
$$;

-- ---------------------------------------------------------------- audio (D09)
-- Called by finalize-upload once a LESSON_AUDIO file is VALIDATED: it becomes the ACTIVE audio and
-- any previous ACTIVE file becomes SUPERSEDED (kept as history).
create function public.lesson_audio_activate(p_actor uuid, p_as_admin boolean, p_file uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.file_objects;
  v_course uuid;
  v_replaced int := 0;
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

  update public.lesson_audio_files set lifecycle_status = 'SUPERSEDED', superseded_at = now()
   where lesson_id = v_file.resource_id and lifecycle_status = 'ACTIVE';
  get diagnostics v_replaced = row_count;
  insert into public.lesson_audio_files (lesson_id, file_object_id, uploaded_by)
  values (v_file.resource_id, p_file, v_file.uploaded_by);

  perform private.write_audit(case when v_replaced > 0 then 'lesson.audio_replaced' else 'lesson.audio_added' end, 'lesson',
    v_file.resource_id::text, jsonb_build_object('file', p_file, 'course', v_course));
  return jsonb_build_object('lesson', v_file.resource_id, 'replaced', v_replaced > 0);
end;
$$;

-- ---------------------------------------------------------------- attachments
create function public.lesson_attachment_add(p_actor uuid, p_as_admin boolean, p_file uuid, p_title text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.file_objects;
  v_course uuid;
  v_id uuid;
begin
  select * into v_file from public.file_objects where id = p_file;
  if not found or v_file.status <> 'VALIDATED' or v_file.resource_type <> 'LESSON_ATTACHMENT' or v_file.bucket_name <> 'lesson-attachments' then
    raise exception 'Only a validated lesson attachment can be added' using errcode = '22023';
  end if;
  select course_id into v_course from public.lessons where id = v_file.resource_id for update;
  if v_course is null then
    raise exception 'Lesson not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_course);

  insert into public.lesson_attachments (lesson_id, file_object_id, uploaded_by, title, position)
  values (v_file.resource_id, p_file, v_file.uploaded_by,
          left(coalesce(nullif(btrim(p_title), ''), v_file.original_filename), 200),
          coalesce((select max(position) from public.lesson_attachments where lesson_id = v_file.resource_id), 0) + 1)
  returning id into v_id;
  perform private.write_audit('lesson.attachment_added', 'lesson', v_file.resource_id::text, jsonb_build_object('attachment', v_id));
  return v_id;
end;
$$;

create function public.lesson_attachment_remove(p_actor uuid, p_as_admin boolean, p_attachment uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson uuid;
  v_course uuid;
begin
  select x.lesson_id, l.course_id into v_lesson, v_course
    from public.lesson_attachments x join public.lessons l on l.id = x.lesson_id
   where x.id = p_attachment and x.removed_at is null;
  if v_lesson is null then
    raise exception 'Attachment not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_course);
  update public.lesson_attachments set removed_at = now(), removed_by = p_actor where id = p_attachment;
  perform private.write_audit('lesson.attachment_removed', 'lesson', v_lesson::text, jsonb_build_object('attachment', p_attachment));
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke execute on function
  public.lesson_save(uuid, boolean, uuid, uuid, text, text),
  public.lesson_set_publication(uuid, boolean, uuid, boolean),
  public.lesson_reorder(uuid, boolean, uuid, uuid[]),
  public.lesson_audio_activate(uuid, boolean, uuid),
  public.lesson_attachment_add(uuid, boolean, uuid, text),
  public.lesson_attachment_remove(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function
  public.lesson_save(uuid, boolean, uuid, uuid, text, text),
  public.lesson_set_publication(uuid, boolean, uuid, boolean),
  public.lesson_reorder(uuid, boolean, uuid, uuid[]),
  public.lesson_audio_activate(uuid, boolean, uuid),
  public.lesson_attachment_add(uuid, boolean, uuid, text),
  public.lesson_attachment_remove(uuid, boolean, uuid)
  to service_role;
