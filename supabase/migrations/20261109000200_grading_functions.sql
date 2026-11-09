-- Phase 9, migration 29: the grading functions. Trusted (service role only, behind grade-submission
-- and release-grades, which check the caller first): grade_save, grade_release and grade_reopen; each
-- re-checks the actor and the course (archived courses are read-only), writes the history through the
-- trigger in migration 28 and audits. Read functions for the course's lecturers and AAL2
-- administrators: assignment_results and assignment_result_counts (every enrolment except WITHDRAWN,
-- owner decision 4; Missing only after the learner's effective due date, owner decision 5), and
-- submission_review with the grade and its history; for the learner, my_grade (their own released
-- grade only, D16; owner decision 2).

-- ---------------------------------------------------------------- the answer being graded
/** Checks the actor and the course, then locks the learner's sent answer (P0002 when nothing was sent). */
create function private.lock_answer_for_grading(p_actor uuid, p_as_admin boolean, p_assignment uuid, p_learner uuid)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course uuid;
  v_sub public.submissions;
begin
  select a.course_id into v_course from public.assignments a where a.id = p_assignment;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_course);
  select * into v_sub from public.submissions s where s.assignment_id = p_assignment and s.learner_id = p_learner for update;
  if not found or v_sub.current_version = 0 then
    raise exception 'This learner has not sent an answer' using errcode = 'P0002';
  end if;
  return v_sub;
end;
$$;

revoke execute on function private.lock_answer_for_grading(uuid, boolean, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- save a grade
/**
 * Grades a sent answer: a score from 0 to the maximum marks and optional plain-text feedback (trimmed;
 * at most 10,000 characters). Saving the same grade again changes nothing. A released grade changes
 * only with a reason, and the change waits to be released (the learner keeps seeing the released one).
 */
create function public.grade_save(
  p_actor uuid, p_as_admin boolean, p_assignment uuid, p_learner uuid, p_score numeric, p_feedback text, p_reason text default null
)
returns table (submission_id uuid, changed boolean, grade_release_status public.grade_release_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.submissions;
  v_feedback text := nullif(btrim(coalesce(p_feedback, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_release public.grade_release_status;
begin
  v := private.lock_answer_for_grading(p_actor, p_as_admin, p_assignment, p_learner);
  if p_score is null then
    raise exception 'Enter a score' using errcode = '22023';
  end if;
  if char_length(v_feedback) > 10000 then
    raise exception 'Keep the feedback to 10,000 characters' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'Keep the reason to 1,000 characters' using errcode = '22023';
  end if;
  if v.status = 'GRADED' and v.score = p_score and v.feedback is not distinct from v_feedback then
    return query select v.id, false, v.grade_release_status;
    return;
  end if;
  if v.released_at is not null and (v.score is distinct from p_score or v.feedback is distinct from v_feedback) and v_reason is null then
    raise exception 'Give a reason for changing a released grade' using errcode = '22023';
  end if;
  -- RELEASED only when what the learner sees is exactly this grade.
  v_release := case
    when v.released_at is not null and v.released_score = p_score and v.released_feedback is not distinct from v_feedback then 'RELEASED'
    else 'DRAFT'
  end;
  perform set_config('app.actor_id', p_actor::text, true);
  perform set_config('app.grade_reason', coalesce(v_reason, ''), true);
  update public.submissions s
     set score = p_score, feedback = v_feedback, graded_by = p_actor, graded_at = clock_timestamp(),
         status = 'GRADED', grade_release_status = v_release
   where s.id = v.id;
  perform set_config('app.grade_reason', '', true);
  perform private.write_audit(case when v.released_at is null then 'grade.saved' else 'grade.changed' end, 'submission', v.id::text,
    jsonb_build_object('assignment_id', p_assignment, 'learner_id', p_learner, 'score', p_score, 'previous_score', v.score, 'reason', v_reason));
  return query select v.id, true, v_release;
end;
$$;

-- ---------------------------------------------------------------- release (D12, D16; owner decision 1)
/**
 * Releases one learner's draft grade (p_learner) or every draft grade of the assignment. Refused while
 * the course's category weights do not total 100 (D12). Each release shows the learner the grade,
 * writes one notification (New grade available, or Grade updated for a grade released before) and an
 * audit record. Returns how many grades were released.
 */
create function public.grade_release(p_actor uuid, p_as_admin boolean, p_assignment uuid, p_learner uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.assignments;
  r public.submissions;
  v_count integer := 0;
  v_first boolean;
  v_seq integer;
begin
  select * into v_a from public.assignments a where a.id = p_assignment;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_a.course_id);
  perform private.require_weights_total_100(v_a.course_id);
  perform set_config('app.actor_id', p_actor::text, true);
  for r in
    select * from public.submissions s
     where s.assignment_id = p_assignment and (p_learner is null or s.learner_id = p_learner)
       and s.status = 'GRADED' and s.score is not null and s.grade_release_status = 'DRAFT'
     order by s.id
       for update
  loop
    v_first := r.released_at is null;
    update public.submissions s
       set released_score = r.score, released_feedback = r.feedback, released_by = p_actor,
           released_at = clock_timestamp(), grade_release_status = 'RELEASED'
     where s.id = r.id;
    select count(*) into v_seq from public.grade_change_history h where h.submission_id = r.id and h.event = 'RELEASED';
    insert into public.notifications (recipient_id, notification_type, title, message, related_entity_type, related_entity_id, link_path, deduplication_key)
    values (
      r.learner_id,
      case when v_first then 'GRADE_RELEASED' else 'GRADE_UPDATED' end::public.notification_type,
      case when v_first then 'New grade available' else 'Grade updated' end,
      case when v_first then 'Your grade for ' || v_a.title || ' is ready.' else 'Your grade for ' || v_a.title || ' was updated.' end,
      'assignment', p_assignment, '/learner/courses/' || v_a.course_id || '/assignments/' || p_assignment,
      'grade-release:' || r.id || ':' || v_seq
    )
    on conflict (deduplication_key) do nothing;
    perform private.write_audit('grade.released', 'submission', r.id::text,
      jsonb_build_object('assignment_id', p_assignment, 'learner_id', r.learner_id, 'score', r.score, 'first_release', v_first));
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    if p_learner is not null then
      raise exception 'There is no grade to release for this learner' using errcode = '22023';
    end if;
    raise exception 'There are no grades to release' using errcode = '22023';
  end if;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------- reopen (owner decision 3, ADR-013)
/**
 * Reopens a graded answer with a reason: the lecturer may change the grade, and the learner may send
 * the answer again before their effective due date (submission_check allows a REOPENED answer). The
 * released grade stays visible to the learner until a new one is released.
 */
create function public.grade_reopen(p_actor uuid, p_as_admin boolean, p_assignment uuid, p_learner uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.submissions;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  v := private.lock_answer_for_grading(p_actor, p_as_admin, p_assignment, p_learner);
  if v_reason is null then
    raise exception 'Give a reason for reopening' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'Keep the reason to 1,000 characters' using errcode = '22023';
  end if;
  if v.status <> 'GRADED' then
    raise exception 'Only a graded answer can be reopened' using errcode = '22023';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  perform set_config('app.grade_reason', v_reason, true);
  update public.submissions s set status = 'REOPENED' where s.id = v.id;
  perform set_config('app.grade_reason', '', true);
  perform private.write_audit('grade.reopened', 'submission', v.id::text,
    jsonb_build_object('assignment_id', p_assignment, 'learner_id', p_learner, 'reason', v_reason));
end;
$$;

revoke execute on function public.grade_save(uuid, boolean, uuid, uuid, numeric, text, text), public.grade_release(uuid, boolean, uuid, uuid),
  public.grade_reopen(uuid, boolean, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.grade_save(uuid, boolean, uuid, uuid, numeric, text, text), public.grade_release(uuid, boolean, uuid, uuid),
  public.grade_reopen(uuid, boolean, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------- results (owner decisions 4 and 5)
/**
 * Every learner of the assignment's course except WITHDRAWN (counted), and anyone withdrawn who had
 * sent an answer (listed, not counted), with their branch (D42), result and grade: GRADED, UNGRADED
 * (sent, or reopened, and waiting), MISSING (nothing sent and their effective due date has passed) or
 * NOT_YET_DUE. Uploads waiting to be sent count as nothing sent. Only the course's lecturers and AAL2
 * administrators get rows.
 */
create function public.assignment_results(p_assignment uuid)
returns table (
  learner_id uuid, first_name text, second_name text, id_number integer, branch_name text, profile_image_path text,
  enrolment_status public.enrolment_status, counted boolean, result text,
  submission_id uuid, status public.submission_status, current_version integer, submitted_at timestamptz, is_late boolean,
  extended_due_at timestamptz, effective_due_at timestamptz,
  score numeric, max_marks numeric, percentage numeric, letter_grade text, band text,
  grade_release_status public.grade_release_status, released_at timestamptz, released_score numeric, changed_since_release boolean,
  graded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select x.id, x.course_id, x.due_at, x.max_marks from public.assignments x
     where x.id = p_assignment and private.can_manage_course(x.course_id)
  ), enrolled as (
    select distinct e.learner_id from public.course_enrollments e join a on a.course_id = e.course_id where e.enrolment_status <> 'WITHDRAWN'
  ), sent as (
    select s.* from public.submissions s join a on a.id = s.assignment_id where s.current_version > 0
  ), ids as (
    select n.learner_id, true as counted from enrolled n
    union all
    select s.learner_id, false from sent s where not exists (select 1 from enrolled n where n.learner_id = s.learner_id)
  )
  select p.id, p.first_name, p.second_name, p.id_number,
         (select b.name from public.branches b where b.id = p.branch_id),
         (select f.storage_path from public.file_objects f where f.id = p.profile_image_file_id and f.status = 'VALIDATED'),
         coalesce((select e.enrolment_status from public.course_enrollments e
                    where e.course_id = a.course_id and e.learner_id = p.id
                    order by e.enrolment_status = 'WITHDRAWN', e.enrolled_at desc limit 1), 'WITHDRAWN'::public.enrolment_status),
         ids.counted,
         case
           when s.id is null then case when now() > coalesce(x.extended_due_at, a.due_at) then 'MISSING' else 'NOT_YET_DUE' end
           when s.status = 'GRADED' then 'GRADED'
           else 'UNGRADED'
         end,
         s.id, s.status, s.current_version,
         (select v.submitted_at from public.submission_versions v where v.submission_id = s.id and v.version_number = s.current_version),
         s.is_late, x.extended_due_at, coalesce(x.extended_due_at, a.due_at),
         s.score, a.max_marks, g.percentage, g.letter_grade, g.band,
         s.grade_release_status, s.released_at, s.released_score,
         coalesce(s.released_at is not null and (s.score is distinct from s.released_score or s.feedback is distinct from s.released_feedback), false),
         s.graded_at
    from ids
    cross join a
    join public.profiles p on p.id = ids.learner_id
    left join sent s on s.learner_id = p.id
    left join public.submission_extensions x on x.assignment_id = a.id and x.learner_id = p.id and x.revoked_at is null
    left join lateral private.grade_facts(s.score, a.max_marks) g on true
   order by p.first_name, p.second_name;
$$;

/**
 * The assignment's counts, from assignment_results (so they always agree with the list): enrolled =
 * submitted + not_yet_due + missing and submitted = graded + ungraded; released counts graded answers
 * whose current grade the learner sees; withdrawn_submitted counts the listed learners who are not
 * counted. One row for the course's lecturers and AAL2 administrators, none for anyone else.
 */
create function public.assignment_result_counts(p_assignment uuid)
returns table (
  enrolled integer, submitted integer, graded integer, ungraded integer, not_yet_due integer, missing integer,
  released integer, withdrawn_submitted integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where r.counted)::int,
         count(*) filter (where r.counted and r.result in ('GRADED', 'UNGRADED'))::int,
         count(*) filter (where r.counted and r.result = 'GRADED')::int,
         count(*) filter (where r.counted and r.result = 'UNGRADED')::int,
         count(*) filter (where r.counted and r.result = 'NOT_YET_DUE')::int,
         count(*) filter (where r.counted and r.result = 'MISSING')::int,
         count(*) filter (where r.counted and r.result = 'GRADED' and r.grade_release_status = 'RELEASED')::int,
         count(*) filter (where not r.counted)::int
    from public.assignment_results(p_assignment) r
  having exists (select 1 from public.assignments x where x.id = p_assignment and private.can_manage_course(x.course_id));
$$;

-- ---------------------------------------------------------------- the learner's own grade (D16; owner decision 2)
/**
 * The caller's released grade for an assignment: the released score with its percentage, letter grade
 * and band, the released feedback, when it was released and whether it was updated since the first
 * release. Null before release, and for anyone but the learner.
 */
create function public.my_grade(p_assignment uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'score', s.released_score, 'max_marks', a.max_marks,
    'percentage', g.percentage, 'letter_grade', g.letter_grade, 'band', g.band, 'passed', g.passed,
    'feedback', s.released_feedback, 'released_at', s.released_at,
    'updated', (select count(*) from public.grade_change_history h where h.submission_id = s.id and h.event = 'RELEASED') > 1)
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    cross join lateral private.grade_facts(s.released_score, a.max_marks) g
   where s.assignment_id = p_assignment and s.learner_id = (select auth.uid()) and s.released_at is not null
     and (select private.is_active_user());
$$;

-- ---------------------------------------------------------------- one answer, with its grade and history
/**
 * One learner's answer for the course's lecturers and AAL2 administrators (Phase 8), now with the grade
 * being worked on, what the learner sees, and the grade history (newest first). Null for anyone else.
 */
create or replace function public.submission_review(p_assignment uuid, p_learner uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'learner', jsonb_build_object(
      'id', p.id, 'first_name', p.first_name, 'second_name', p.second_name, 'id_number', p.id_number,
      'branch_name', (select b.name from public.branches b where b.id = p.branch_id),
      'profile_image_path', (select f.storage_path from public.file_objects f where f.id = p.profile_image_file_id and f.status = 'VALIDATED')),
    'due_at', a.due_at,
    'extended_due_at', x.extended_due_at,
    'extension_reason', x.reason,
    'effective_due_at', coalesce(x.extended_due_at, a.due_at),
    'status', s.status,
    'current_version', coalesce(s.current_version, 0),
    'is_late', coalesce(s.is_late, false),
    'max_marks', a.max_marks,
    'grade', case when s.id is null then null else jsonb_build_object(
      'score', s.score, 'feedback', s.feedback,
      'percentage', g.percentage, 'letter_grade', g.letter_grade, 'band', g.band,
      'grade_release_status', s.grade_release_status,
      'graded_at', s.graded_at,
      'graded_by_name', (select gp.first_name || ' ' || gp.second_name from public.profiles gp where gp.id = s.graded_by),
      'released_at', s.released_at, 'released_score', s.released_score, 'released_feedback', s.released_feedback,
      'changed_since_release', coalesce(s.released_at is not null and (s.score is distinct from s.released_score or s.feedback is distinct from s.released_feedback), false)
    ) end,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event', h.event, 'previous_score', h.previous_score, 'new_score', h.new_score,
               'previous_feedback', h.previous_feedback, 'new_feedback', h.new_feedback, 'reason', h.reason,
               'changed_at', h.changed_at,
               'changed_by_name', (select hp.first_name || ' ' || hp.second_name from public.profiles hp where hp.id = h.changed_by))
             order by h.changed_at desc)
        from public.grade_change_history h where h.submission_id = s.id), '[]'::jsonb),
    'versions', coalesce((select jsonb_agg(private.submission_version_json(v.id) order by v.version_number desc)
                            from public.submission_versions v where v.submission_id = s.id), '[]'::jsonb))
    from public.assignments a
    join public.profiles p on p.id = p_learner and p.role = 'LEARNER'
    left join public.submissions s on s.assignment_id = a.id and s.learner_id = p.id and s.status <> 'DRAFT'
    left join public.submission_extensions x on x.assignment_id = a.id and x.learner_id = p.id and x.revoked_at is null
    left join lateral private.grade_facts(s.score, a.max_marks) g on true
   where a.id = p_assignment and private.can_manage_course(a.course_id);
$$;

revoke execute on function public.assignment_results(uuid), public.assignment_result_counts(uuid), public.my_grade(uuid) from public, anon;
grant execute on function public.assignment_results(uuid), public.assignment_result_counts(uuid), public.my_grade(uuid) to authenticated, service_role;
