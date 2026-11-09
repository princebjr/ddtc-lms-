-- Phase 8, migration 27: the submission rules and the trusted submission functions
-- (SECURITY_AND_ACCESS.md section 8; D05, D07, D10, D13, D24, ADR-009; owner decisions 3, 4 and 6 of
-- 2026-11-08). submit-assignment, register-upload and manage-assignments verify the caller and call
-- these with the service role; each re-checks the actor, makes the change and writes the audit
-- record in one transaction. Lateness and due dates come from the server clock only (D24). Clients
-- cannot call them; learners read their own state through my_submission().

-- ---------------------------------------------------------------- the rules (D10 as the owner read it, decision 3)
/**
 * Whether a learner may send an answer to an assignment now, and whether it would be late:
 *   - an active learner account with an ACTIVE enrolment (a COMPLETED enrolment or an archived course
 *     is read-only, D05 and D07), and a published, current assignment in a published course;
 *   - not once the answer is graded (a reopened answer may be sent again);
 *   - before the effective due date (the learner's standing extension, or the due date, D13): send and
 *     send again as new versions;
 *   - after it: a learner who never sent an answer may send one, marked late, only when the
 *     assignment allows late answers; someone who already sent one cannot send again.
 * reason is null when allowed, otherwise not_found, not_allowed, not_enrolled, read_only, not_open,
 * graded, past_due or past_due_resubmit.
 */
create function private.submission_check(
  p_assignment uuid, p_learner uuid,
  out can_submit boolean, out will_be_late boolean, out reason text, out effective_due_at timestamptz,
  out submission_id uuid, out status public.submission_status, out current_version integer,
  out course_id uuid, out accepted_formats text[], out allow_late boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_a public.assignments;
  v_course public.course_status;
  v_enrolment public.enrolment_status;
begin
  can_submit := false;
  will_be_late := false;
  select * into v_a from public.assignments where id = p_assignment;
  if not found then
    reason := 'not_found';
    return;
  end if;
  course_id := v_a.course_id;
  accepted_formats := v_a.accepted_formats;
  allow_late := v_a.allow_late;
  effective_due_at := private.effective_due_at(p_assignment, p_learner);
  select s.id, s.status, s.current_version into submission_id, status, current_version
    from public.submissions s where s.assignment_id = p_assignment and s.learner_id = p_learner;
  current_version := coalesce(current_version, 0);

  if not exists (select 1 from public.profiles where id = p_learner and role = 'LEARNER' and account_status = 'ACTIVE') then
    reason := 'not_allowed';
    return;
  end if;
  select e.enrolment_status into v_enrolment from public.course_enrollments e
   where e.course_id = v_a.course_id and e.learner_id = p_learner and e.enrolment_status in ('ACTIVE', 'COMPLETED')
   order by e.enrolled_at desc limit 1;
  if v_enrolment is null then
    reason := 'not_enrolled';
    return;
  end if;
  select c.status into v_course from public.courses c where c.id = v_a.course_id;
  if v_enrolment = 'COMPLETED' or v_course = 'ARCHIVED' then
    reason := 'read_only';
    return;
  end if;
  if v_course <> 'PUBLISHED' or v_a.publication_status <> 'PUBLISHED' or v_a.archived_at is not null then
    reason := 'not_open';
    return;
  end if;
  if status = 'GRADED' then
    reason := 'graded';
    return;
  end if;
  if now() > effective_due_at then
    if current_version >= 1 then
      reason := 'past_due_resubmit';
      return;
    elsif not v_a.allow_late then
      reason := 'past_due';
      return;
    end if;
    will_be_late := true;
  end if;
  can_submit := true;
end;
$$;

/** Raises the error a learner sees for a reason from submission_check. */
create function private.raise_submission_block(p_reason text) returns void
language plpgsql
set search_path = ''
as $$
begin
  case p_reason
    when 'not_found' then raise exception 'Assignment not found' using errcode = 'P0002';
    when 'not_allowed' then raise exception 'Your account cannot send answers' using errcode = '42501';
    when 'not_enrolled' then raise exception 'You are not enrolled in this course' using errcode = '42501';
    when 'read_only' then raise exception 'This course is read-only for you' using errcode = '22023';
    when 'not_open' then raise exception 'This assignment is not open for answers' using errcode = '22023';
    when 'graded' then raise exception 'This answer has been graded' using errcode = '22023';
    when 'past_due' then raise exception 'The due date has passed' using errcode = '22023';
    when 'past_due_resubmit' then raise exception 'The due date has passed, so you cannot submit again' using errcode = '22023';
    else raise exception 'You cannot send an answer now' using errcode = '22023';
  end case;
end;
$$;

/** Files waiting in a submission for its next version: uploads not yet sent, pending or validated. */
create function private.submission_waiting_files(p_submission uuid, p_version integer) returns setof public.file_objects
language sql
stable
security definer
set search_path = ''
as $$
  select f.* from public.file_objects f
   where f.resource_type = 'SUBMISSION_FILE' and f.resource_id = p_submission
     and f.status in ('PENDING', 'VALIDATED')
     and split_part(f.storage_path, '/', 3) = p_version::text
     and not exists (select 1 from public.submission_files sf where sf.file_object_id = f.id);
$$;

revoke execute on function private.submission_check(uuid, uuid), private.raise_submission_block(text), private.submission_waiting_files(uuid, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- the learner's own view
/**
 * Everything the learner's assignment page needs, decided on the server: the due dates, whether an
 * answer may be sent now and whether it would be late (with the reason when not), the files waiting
 * for the next version, and every version sent with its files. Null unless the caller is a learner
 * who may see the assignment.
 */
create function public.my_submission(p_assignment uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_a public.assignments;
  v record;
  v_max integer := coalesce((select (value)::text::int from public.system_settings where key = 'max_files_per_submission_version'), 5);
begin
  if v_me is null
     or not exists (select 1 from public.profiles where id = v_me and role = 'LEARNER')
     or not private.can_see_assignment(p_assignment) then
    return null;
  end if;
  select * into v_a from public.assignments where id = p_assignment;
  select * into v from private.submission_check(p_assignment, v_me);
  return jsonb_build_object(
    'assignment_id', p_assignment,
    'due_at', v_a.due_at,
    'effective_due_at', v.effective_due_at,
    'extended', exists (select 1 from public.submission_extensions x where x.assignment_id = p_assignment and x.learner_id = v_me and x.revoked_at is null),
    'allow_late', v_a.allow_late,
    'accepted_formats', to_jsonb(v_a.accepted_formats),
    'max_files', v_max,
    'submission_id', v.submission_id,
    'status', v.status,
    'current_version', v.current_version,
    'next_version', v.current_version + 1,
    'is_late', coalesce((select s.is_late from public.submissions s where s.id = v.submission_id), false),
    'can_submit', v.can_submit,
    'will_be_late', v.will_be_late,
    'blocked_reason', v.reason,
    'draft_files', coalesce((select jsonb_agg(private.submission_file_json(w.id) order by w.uploaded_at, w.id)
                               from private.submission_waiting_files(v.submission_id, v.current_version + 1) w
                              where w.uploaded_by = v_me), '[]'::jsonb),
    'versions', coalesce((select jsonb_agg(private.submission_version_json(sv.id) order by sv.version_number desc)
                            from public.submission_versions sv where sv.submission_id = v.submission_id), '[]'::jsonb));
end;
$$;
revoke execute on function public.my_submission(uuid) from public, anon;
grant execute on function public.my_submission(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- an upload for the next version
/**
 * register-upload calls this before it creates the upload: the learner may send an answer now, the
 * kind is accepted (audio always, PDF and Word where the lecturer allowed them, ADR-009), and fewer
 * than max_files_per_submission_version files are waiting. Starts the draft submission when there is
 * none. Returns the submission and the version the file is for (part of its path).
 */
create function public.submission_prepare_upload(p_actor uuid, p_assignment uuid, p_role public.submission_file_role)
returns table (submission_id uuid, version_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_sub public.submissions;
  v_max integer := coalesce((select (value)::text::int from public.system_settings where key = 'max_files_per_submission_version'), 5);
begin
  select * into v from private.submission_check(p_assignment, p_actor);
  if not v.can_submit then
    perform private.raise_submission_block(v.reason);
  end if;
  if p_role = 'PDF' and not ('PDF' = any (v.accepted_formats)) then
    raise exception 'This assignment does not accept PDF files' using errcode = '22023';
  elsif p_role = 'DOCX' and not ('DOCX' = any (v.accepted_formats)) then
    raise exception 'This assignment does not accept Word files' using errcode = '22023';
  elsif p_role is null or p_role = 'OTHER' then
    raise exception 'This kind of file is not accepted' using errcode = '22023';
  end if;
  insert into public.submissions (assignment_id, learner_id) values (p_assignment, p_actor)
  on conflict on constraint submissions_assignment_learner_key do nothing;
  select * into v_sub from public.submissions s where s.assignment_id = p_assignment and s.learner_id = p_actor for update;
  if (select count(*) from private.submission_waiting_files(v_sub.id, v_sub.current_version + 1)) >= v_max then
    raise exception 'You can add at most % files', v_max using errcode = '22023';
  end if;
  return query select v_sub.id, v_sub.current_version + 1;
end;
$$;

-- ---------------------------------------------------------------- submitting (D10)
/**
 * Sends the learner's answer as the next version: the plain-text answer (at most 20,000 characters)
 * and up to 5 of their own validated files waiting for that version, of kinds the assignment accepts.
 * Text or at least one file is required. Lateness comes from server time and is never penalised. The
 * same p_request sent again returns the version it made (replayed = true) instead of a second one.
 */
create function public.submission_submit(p_actor uuid, p_assignment uuid, p_text text, p_files uuid[], p_request uuid)
returns table (submission_id uuid, version_number integer, is_late boolean, resubmitted boolean, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_sub public.submissions;
  v_prior public.submission_versions;
  v_text text := coalesce(p_text, '');
  v_files uuid[] := coalesce(p_files, '{}');
  v_count integer := coalesce(array_length(p_files, 1), 0);
  v_max integer := coalesce((select (value)::text::int from public.system_settings where key = 'max_files_per_submission_version'), 5);
  v_version integer;
  v_id uuid;
begin
  if p_request is null then
    raise exception 'A request id is required' using errcode = '22023';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);

  -- The same request again: return what it made.
  select sv.* into v_prior from public.submission_versions sv
    join public.submissions s on s.id = sv.submission_id
   where s.assignment_id = p_assignment and s.learner_id = p_actor and sv.client_request_id = p_request;
  if found then
    return query select v_prior.submission_id, v_prior.version_number, v_prior.is_late, v_prior.version_number > 1, true;
    return;
  end if;

  select * into v from private.submission_check(p_assignment, p_actor);
  if not v.can_submit then
    perform private.raise_submission_block(v.reason);
  end if;
  if char_length(v_text) > 20000 then
    raise exception 'Your text answer is longer than 20,000 characters' using errcode = '22023';
  end if;
  if btrim(v_text) = '' and v_count = 0 then
    raise exception 'Add a text answer, a recording or a file' using errcode = '22023';
  end if;
  if v_count > v_max then
    raise exception 'You can add at most % files', v_max using errcode = '22023';
  end if;
  if v_count <> (select count(distinct x) from unnest(v_files) x) then
    raise exception 'A file is listed twice' using errcode = '22023';
  end if;

  insert into public.submissions (assignment_id, learner_id) values (p_assignment, p_actor)
  on conflict on constraint submissions_assignment_learner_key do nothing;
  select * into v_sub from public.submissions s where s.assignment_id = p_assignment and s.learner_id = p_actor for update;
  -- Checked again under the lock: a duplicate request or a grade may have arrived meanwhile.
  select sv.* into v_prior from public.submission_versions sv where sv.submission_id = v_sub.id and sv.client_request_id = p_request;
  if found then
    return query select v_prior.submission_id, v_prior.version_number, v_prior.is_late, v_prior.version_number > 1, true;
    return;
  end if;
  select * into v from private.submission_check(p_assignment, p_actor);
  if not v.can_submit then
    perform private.raise_submission_block(v.reason);
  end if;
  v_version := v_sub.current_version + 1;

  -- Every file: the learner's own validated upload waiting for this version.
  if (select count(*) from private.submission_waiting_files(v_sub.id, v_version) w
       where w.id = any (v_files) and w.status = 'VALIDATED' and w.uploaded_by = p_actor) <> v_count then
    raise exception 'One of the files cannot be sent. Remove it and try again' using errcode = '22023';
  end if;
  if exists (select 1 from public.file_objects f where f.id = any (v_files) and private.submission_role_for(f.detected_mime_type) is null) then
    raise exception 'This kind of file is not accepted' using errcode = '22023';
  end if;
  if exists (select 1 from public.file_objects f where f.id = any (v_files) and f.detected_mime_type = 'application/pdf')
     and not ('PDF' = any (v.accepted_formats)) then
    raise exception 'This assignment does not accept PDF files' using errcode = '22023';
  end if;
  if exists (select 1 from public.file_objects f where f.id = any (v_files)
              and f.detected_mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
     and not ('DOCX' = any (v.accepted_formats)) then
    raise exception 'This assignment does not accept Word files' using errcode = '22023';
  end if;

  insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id)
  values (v_sub.id, v_version, v_text, v.will_be_late, p_request)
  returning id into v_id;
  insert into public.submission_files (submission_version_id, file_object_id, file_role)
  select v_id, f.id, private.submission_role_for(f.detected_mime_type)
    from public.file_objects f
    join unnest(v_files) with ordinality as u(file_id, n) on u.file_id = f.id
   order by u.n;
  update public.submissions s set status = 'SUBMITTED', current_version = v_version, is_late = v.will_be_late where s.id = v_sub.id;
  perform private.write_audit('submission.submitted', 'submission', v_sub.id::text, jsonb_build_object(
    'assignment_id', p_assignment, 'version', v_version, 'late', v.will_be_late, 'files', v_count));
  return query select v_sub.id, v_version, v.will_be_late, v_version > 1, false;
end;
$$;

-- ---------------------------------------------------------------- removing a file not yet sent (decision 4)
/**
 * The learner removes one of their uploads that has not been sent. Returns where it is stored; the
 * Edge Function removes it from Storage and marks it DELETED (or DELETE_FAILED for cleanup-files).
 * A sent file stays with its version for good.
 */
create function public.submission_draft_file_remove(p_actor uuid, p_file uuid)
returns table (bucket_name text, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f public.file_objects;
begin
  perform set_config('app.actor_id', p_actor::text, true);
  select * into v_f from public.file_objects f where f.id = p_file and f.resource_type = 'SUBMISSION_FILE' for update;
  if not found then
    raise exception 'File not found' using errcode = 'P0002';
  end if;
  if v_f.uploaded_by <> p_actor then
    raise exception 'This is not your file' using errcode = '42501';
  end if;
  if exists (select 1 from public.submission_files sf where sf.file_object_id = p_file) then
    raise exception 'This file was sent and stays with your answer' using errcode = '22023';
  end if;
  if v_f.status not in ('PENDING', 'VALIDATED', 'REJECTED') then
    raise exception 'This file has already been removed' using errcode = '22023';
  end if;
  perform private.write_audit('submission.file_removed', 'file_object', p_file::text, jsonb_build_object('submission_id', v_f.resource_id));
  return query select v_f.bucket_name, v_f.storage_path;
end;
$$;

-- ---------------------------------------------------------------- extensions (D13, decision 6)
/**
 * The course's lecturers or an administrator set or change one learner's extension: the learner is
 * actively enrolled, the date is after the assignment's due date and in the future (p_undo restores a
 * previous date that may have passed). Returns the previous date, or null when there was none.
 */
create function public.submission_extension_set(
  p_actor uuid, p_as_admin boolean, p_assignment uuid, p_learner uuid, p_due timestamptz, p_reason text, p_undo boolean default false
) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.assignments;
  v_prev public.submission_extensions;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_a from public.assignments where id = p_assignment;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_a.course_id);
  if v_a.archived_at is not null then
    raise exception 'This assignment is archived and read-only' using errcode = '22023';
  end if;
  if p_due is null or p_due <= v_a.due_at then
    raise exception 'Choose a date after the assignment''s due date' using errcode = '22023';
  end if;
  if p_due <= now() and not coalesce(p_undo, false) then
    raise exception 'Choose a date in the future' using errcode = '22023';
  end if;
  if char_length(coalesce(v_reason, '')) > 1000 then
    raise exception 'Keep the reason to 1,000 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.course_enrollments e join public.profiles p on p.id = e.learner_id
                  where e.course_id = v_a.course_id and e.learner_id = p_learner and e.enrolment_status = 'ACTIVE' and p.role = 'LEARNER') then
    raise exception 'This learner is not enrolled in the course' using errcode = '22023';
  end if;

  select * into v_prev from public.submission_extensions x
   where x.assignment_id = p_assignment and x.learner_id = p_learner and x.revoked_at is null for update;
  if found then
    update public.submission_extensions x set extended_due_at = p_due, granted_by = p_actor, reason = coalesce(v_reason, x.reason)
     where x.id = v_prev.id;
    perform private.write_audit('extension.changed', 'assignment', p_assignment::text, jsonb_build_object(
      'learner_id', p_learner, 'from', v_prev.extended_due_at, 'to', p_due, 'undo', coalesce(p_undo, false)));
    return v_prev.extended_due_at;
  end if;
  insert into public.submission_extensions (assignment_id, learner_id, extended_due_at, granted_by, reason)
  values (p_assignment, p_learner, p_due, p_actor, v_reason);
  perform private.write_audit('extension.granted', 'assignment', p_assignment::text, jsonb_build_object(
    'learner_id', p_learner, 'to', p_due, 'reason', v_reason));
  return null;
end;
$$;

/** Takes a learner's extension back (kept, marked with who and when). Returns its date, for Undo. */
create function public.submission_extension_remove(p_actor uuid, p_as_admin boolean, p_assignment uuid, p_learner uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.assignments;
  v_prev public.submission_extensions;
begin
  select * into v_a from public.assignments where id = p_assignment;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_a.course_id);
  select * into v_prev from public.submission_extensions x
   where x.assignment_id = p_assignment and x.learner_id = p_learner and x.revoked_at is null for update;
  if not found then
    raise exception 'This learner has no extension to take back' using errcode = '22023';
  end if;
  update public.submission_extensions x set revoked_at = now(), revoked_by = p_actor where x.id = v_prev.id;
  perform private.write_audit('extension.removed', 'assignment', p_assignment::text, jsonb_build_object(
    'learner_id', p_learner, 'from', v_prev.extended_due_at));
  return v_prev.extended_due_at;
end;
$$;

revoke execute on function
  public.submission_prepare_upload(uuid, uuid, public.submission_file_role),
  public.submission_submit(uuid, uuid, text, uuid[], uuid),
  public.submission_draft_file_remove(uuid, uuid),
  public.submission_extension_set(uuid, boolean, uuid, uuid, timestamptz, text, boolean),
  public.submission_extension_remove(uuid, boolean, uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.submission_prepare_upload(uuid, uuid, public.submission_file_role),
  public.submission_submit(uuid, uuid, text, uuid[], uuid),
  public.submission_draft_file_remove(uuid, uuid),
  public.submission_extension_set(uuid, boolean, uuid, uuid, timestamptz, text, boolean),
  public.submission_extension_remove(uuid, boolean, uuid, uuid)
  to service_role;
