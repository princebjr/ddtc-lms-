-- Phase 7, migration 23: the trusted assignment functions (SECURITY_AND_ACCESS.md section 8; D07, D12,
-- D25, D29, ADR-009). manage-assignments and finalize-upload verify the caller and call these with
-- the service role, passing p_as_admin = true only after am_i_admin() succeeded with the caller's own
-- token. Each re-checks the actor and the course (administrators and the course's active lecturers;
-- archived courses are read-only), makes the change and writes the audit record in one transaction.
-- Clients cannot call them.

-- ---------------------------------------------------------------- helpers
/** Refuses publishing (or keeping published) what the instruction type lacks. */
create function private.require_instructions(p_type public.assignment_content_type, p_text text, p_audio uuid) returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_type in ('TEXT', 'TEXT_AND_AUDIO') and not private.has_visible_text(p_text) then
    raise exception 'Write the instructions before publishing' using errcode = '22023';
  end if;
  if p_type in ('AUDIO', 'TEXT_AND_AUDIO') and p_audio is null then
    raise exception 'Add the instruction audio before publishing' using errcode = '22023';
  end if;
end;
$$;

/**
 * D29: keeps the assignment's current state as its next version, unless it equals the latest one.
 * Returns the new version number, or null when nothing changed.
 */
create function private.snapshot_assignment(p_assignment uuid, p_actor uuid, p_reason text) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assignments;
  v public.assignment_versions;
  v_found boolean;
  n integer;
begin
  select * into a from public.assignments where id = p_assignment;
  select * into v from public.assignment_versions where assignment_id = p_assignment order by version_number desc limit 1;
  v_found := found;
  if v_found and v.title = a.title and v.description = a.description and v.content_type = a.content_type
     and v.text_instructions = a.text_instructions and v.instruction_audio_file_id is not distinct from a.instruction_audio_file_id
     and v.due_at = a.due_at and v.max_marks = a.max_marks and v.accepted_formats = a.accepted_formats
     and v.grading_criteria = a.grading_criteria and v.category_id = a.category_id and v.allow_late = a.allow_late then
    return null;
  end if;
  n := case when v_found then v.version_number + 1 else 1 end;
  insert into public.assignment_versions (assignment_id, version_number, title, description, content_type, text_instructions,
    instruction_audio_file_id, due_at, max_marks, accepted_formats, grading_criteria, category_id, allow_late, changed_by, change_reason)
  values (a.id, n, a.title, a.description, a.content_type, a.text_instructions, a.instruction_audio_file_id, a.due_at, a.max_marks,
    a.accepted_formats, a.grading_criteria, a.category_id, a.allow_late, p_actor, nullif(btrim(coalesce(p_reason, '')), ''));
  return n;
end;
$$;

revoke execute on function private.require_instructions(public.assignment_content_type, text, uuid), private.snapshot_assignment(uuid, uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- categories (D12)
-- p_categories is the full list, in order: [{ id?, name, weight }]. Listed ids are updated, new ones
-- added, and current categories left out are archived (never deleted), unless current assignments
-- use them. The weights need not total 100 to save; releasing grades needs it (Phase 9).
create function public.grade_categories_save(p_actor uuid, p_as_admin boolean, p_course uuid, p_categories jsonb) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_pos integer := 0;
  v_name text;
  v_weight integer;
  v_keep uuid[] := '{}';
  v_used text;
  v_total integer;
begin
  perform private.require_lesson_actor(p_actor, p_as_admin, p_course);
  if jsonb_typeof(p_categories) is distinct from 'array' or jsonb_array_length(p_categories) not between 1 and 10 then
    raise exception 'Give the course 1 to 10 categories' using errcode = '22023';
  end if;
  if (select count(distinct lower(btrim(coalesce(x ->> 'name', '')))) from jsonb_array_elements(p_categories) x) <> jsonb_array_length(p_categories) then
    raise exception 'Two categories cannot share a name' using errcode = '22023';
  end if;
  perform 1 from public.courses where id = p_course for update;

  for v_item in select value from jsonb_array_elements(p_categories) loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    if char_length(v_name) not between 1 and 80 then
      raise exception 'Give each category a name of up to 80 characters' using errcode = '22023';
    end if;
    begin
      v_weight := (v_item ->> 'weight')::integer;
    exception when others then
      raise exception 'Each weight is a whole number from 0 to 100' using errcode = '22023';
    end;
    if v_weight is null or v_weight not between 0 and 100 then
      raise exception 'Each weight is a whole number from 0 to 100' using errcode = '22023';
    end if;
    if nullif(v_item ->> 'id', '') is not null then
      if not exists (select 1 from public.grade_categories where id = (v_item ->> 'id')::uuid and course_id = p_course and archived_at is null) then
        raise exception 'That category does not belong to this course' using errcode = '22023';
      end if;
      v_keep := v_keep || (v_item ->> 'id')::uuid;
    end if;
  end loop;

  select string_agg(g.name, ', ' order by g.position) into v_used
    from public.grade_categories g
   where g.course_id = p_course and g.archived_at is null and not (g.id = any (v_keep))
     and exists (select 1 from public.assignments a where a.category_id = g.id and a.archived_at is null);
  if v_used is not null then
    raise exception 'Move the assignments in % to another category first', v_used using errcode = '22023';
  end if;

  set constraints public.grade_categories_course_name deferred;
  update public.grade_categories set archived_at = now()
   where course_id = p_course and archived_at is null and not (id = any (v_keep));
  for v_item in select value from jsonb_array_elements(p_categories) loop
    v_pos := v_pos + 1;
    if nullif(v_item ->> 'id', '') is not null then
      update public.grade_categories set name = btrim(v_item ->> 'name'), weight = (v_item ->> 'weight')::integer, position = v_pos
       where id = (v_item ->> 'id')::uuid;
    else
      insert into public.grade_categories (course_id, name, weight, position)
      values (p_course, btrim(v_item ->> 'name'), (v_item ->> 'weight')::integer, v_pos);
    end if;
  end loop;
  set constraints public.grade_categories_course_name immediate;

  v_total := (select coalesce(sum(weight), 0)::int from public.grade_categories where course_id = p_course and archived_at is null);
  perform private.write_audit('course.categories_saved', 'course', p_course::text, jsonb_build_object(
    'categories', (select jsonb_agg(jsonb_build_object('name', name, 'weight', weight) order by position)
                     from public.grade_categories where course_id = p_course and archived_at is null),
    'total', v_total));
  return jsonb_build_object('total', v_total, 'ready', v_total = 100);
end;
$$;

-- ---------------------------------------------------------------- save (create or update)
-- p_assignment null creates a DRAFT. p_fields: title, description, lesson_id, category_id,
-- content_type, text_instructions (HTML already cleaned by manage-assignments), due_at, allow_late,
-- max_marks, accepted_formats (TEXT and AUDIO are always added, ADR-009), grading_criteria.
-- Editing a published assignment keeps a snapshot with p_reason (D29); a new due date is audited.
create function public.assignment_save(p_actor uuid, p_as_admin boolean, p_course uuid, p_assignment uuid, p_fields jsonb, p_reason text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.assignments;
  v_id uuid;
  v_title text := btrim(coalesce(p_fields ->> 'title', ''));
  v_type public.assignment_content_type;
  v_text text := coalesce(p_fields ->> 'text_instructions', '');
  v_due timestamptz;
  v_marks numeric;
  v_late boolean;
  v_lesson uuid;
  v_category uuid;
  v_formats text[];
begin
  perform private.require_lesson_actor(p_actor, p_as_admin, p_course);
  if char_length(v_title) not between 3 and 200 then
    raise exception 'Enter a title of 3 to 200 characters' using errcode = '22023';
  end if;
  begin
    v_type := (p_fields ->> 'content_type')::public.assignment_content_type;
    v_due := (p_fields ->> 'due_at')::timestamptz;
    v_marks := (p_fields ->> 'max_marks')::numeric;
    v_late := coalesce((p_fields ->> 'allow_late')::boolean, false);
    v_lesson := nullif(p_fields ->> 'lesson_id', '')::uuid;
    v_category := (p_fields ->> 'category_id')::uuid;
  exception when others then
    raise exception 'Check the assignment details and try again' using errcode = '22023';
  end;
  if v_type is null then
    raise exception 'Choose how the instructions are given' using errcode = '22023';
  end if;
  if v_due is null then
    raise exception 'Choose a due date' using errcode = '22023';
  end if;
  if v_marks is null or v_marks <= 0 or v_marks > 10000 then
    raise exception 'Maximum marks must be more than 0 and at most 10000' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p_fields -> 'accepted_formats', '[]')) f where f not in ('TEXT', 'AUDIO', 'PDF', 'DOCX')) then
    raise exception 'Answers can be text, audio, PDF or Word' using errcode = '22023';
  end if;
  select array_agg(f order by array_position(array['TEXT', 'AUDIO', 'PDF', 'DOCX'], f)) into v_formats
    from (select distinct f from (
            select unnest(array['TEXT', 'AUDIO']) as f
            union all
            select jsonb_array_elements_text(coalesce(p_fields -> 'accepted_formats', '[]'))) s) d;

  if p_assignment is null then
    insert into public.assignments (course_id, lesson_id, category_id, title, description, content_type, text_instructions,
      due_at, allow_late, max_marks, accepted_formats, grading_criteria, created_by)
    values (p_course, v_lesson, v_category, v_title, coalesce(p_fields ->> 'description', ''), v_type, v_text,
      v_due, v_late, v_marks, v_formats, coalesce(p_fields ->> 'grading_criteria', ''), p_actor)
    returning id into v_id;
    perform private.write_audit('assignment.created', 'assignment', v_id::text, jsonb_build_object('course', p_course, 'title', v_title));
    return v_id;
  end if;

  select * into v_old from public.assignments where id = p_assignment for update;
  if not found or v_old.course_id <> p_course then
    raise exception 'This assignment does not belong to the course' using errcode = '22023';
  end if;
  if v_old.archived_at is not null then
    raise exception 'Restore the assignment before editing it' using errcode = '22023';
  end if;
  if v_old.publication_status = 'PUBLISHED' then
    perform private.require_instructions(v_type, v_text, v_old.instruction_audio_file_id);
  end if;

  update public.assignments
     set lesson_id = v_lesson, category_id = v_category, title = v_title, description = coalesce(p_fields ->> 'description', ''),
         content_type = v_type, text_instructions = v_text, due_at = v_due, allow_late = v_late, max_marks = v_marks,
         accepted_formats = v_formats, grading_criteria = coalesce(p_fields ->> 'grading_criteria', '')
   where id = p_assignment;
  v_id := p_assignment;

  if v_old.due_at is distinct from v_due then
    perform private.write_audit('assignment.due_date_changed', 'assignment', v_id::text,
      jsonb_build_object('course', p_course, 'from', v_old.due_at, 'to', v_due, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  end if;
  perform private.write_audit('assignment.updated', 'assignment', v_id::text, jsonb_build_object('course', p_course));
  if v_old.publication_status = 'PUBLISHED' then
    perform private.snapshot_assignment(v_id, p_actor, p_reason);
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- publish and unpublish
create function public.assignment_set_publication(p_actor uuid, p_as_admin boolean, p_assignment uuid, p_publish boolean) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assignments;
  v_status public.publication_status := case when p_publish then 'PUBLISHED' else 'DRAFT' end;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, a.course_id);
  if a.archived_at is not null then
    raise exception 'Restore the assignment first' using errcode = '22023';
  end if;
  if p_publish then
    perform private.require_instructions(a.content_type, a.text_instructions, a.instruction_audio_file_id);
  end if;
  update public.assignments
     set publication_status = v_status,
         published_at = case when p_publish then coalesce(published_at, now()) else published_at end
   where id = p_assignment;
  if p_publish then
    perform private.snapshot_assignment(p_assignment, p_actor, null);
  end if;
  perform private.write_audit(case when p_publish then 'assignment.published' else 'assignment.unpublished' end, 'assignment',
    p_assignment::text, jsonb_build_object('course', a.course_id));
  return jsonb_build_object('id', p_assignment, 'status', v_status);
end;
$$;

-- ---------------------------------------------------------------- archive and restore (D25: never deleted)
create function public.assignment_set_archived(p_actor uuid, p_as_admin boolean, p_assignment uuid, p_archived boolean) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course uuid;
begin
  select course_id into v_course from public.assignments where id = p_assignment for update;
  if v_course is null then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_course);
  update public.assignments
     set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
   where id = p_assignment;
  perform private.write_audit(case when p_archived then 'assignment.archived' else 'assignment.restored' end, 'assignment',
    p_assignment::text, jsonb_build_object('course', v_course));
  return jsonb_build_object('id', p_assignment, 'archived', p_archived);
end;
$$;

-- ---------------------------------------------------------------- instruction audio
-- Called by finalize-upload once an ASSIGNMENT_INSTRUCTION_AUDIO file is VALIDATED: it becomes the
-- assignment's instruction audio; a replaced file is kept (snapshots point at it). Replacing the
-- audio of a published assignment keeps a snapshot (D29).
create function public.assignment_audio_activate(p_actor uuid, p_as_admin boolean, p_file uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.file_objects;
  a public.assignments;
begin
  select * into v_file from public.file_objects where id = p_file;
  if not found or v_file.status <> 'VALIDATED' or v_file.resource_type <> 'ASSIGNMENT_INSTRUCTION_AUDIO'
     or v_file.bucket_name <> 'assignment-instructions-audio' then
    raise exception 'Only a validated instruction audio file can be used' using errcode = '22023';
  end if;
  select * into a from public.assignments where id = v_file.resource_id for update;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, a.course_id);
  if a.archived_at is not null then
    raise exception 'Restore the assignment first' using errcode = '22023';
  end if;

  update public.assignments set instruction_audio_file_id = p_file where id = a.id;
  if a.publication_status = 'PUBLISHED' then
    perform private.snapshot_assignment(a.id, p_actor, 'Instruction audio replaced');
  end if;
  perform private.write_audit(case when a.instruction_audio_file_id is null then 'assignment.audio_added' else 'assignment.audio_replaced' end,
    'assignment', a.id::text, jsonb_build_object('file', p_file, 'course', a.course_id));
  return jsonb_build_object('assignment', a.id, 'replaced', a.instruction_audio_file_id is not null);
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke execute on function
  public.grade_categories_save(uuid, boolean, uuid, jsonb),
  public.assignment_save(uuid, boolean, uuid, uuid, jsonb, text),
  public.assignment_set_publication(uuid, boolean, uuid, boolean),
  public.assignment_set_archived(uuid, boolean, uuid, boolean),
  public.assignment_audio_activate(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function
  public.grade_categories_save(uuid, boolean, uuid, jsonb),
  public.assignment_save(uuid, boolean, uuid, uuid, jsonb, text),
  public.assignment_set_publication(uuid, boolean, uuid, boolean),
  public.assignment_set_archived(uuid, boolean, uuid, boolean),
  public.assignment_audio_activate(uuid, boolean, uuid)
  to service_role;
