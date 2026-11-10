-- Phase 10.1, migration 33 (ADR-016; owner decisions of 2026-11-10). The course grade has three fixed
-- parts: Weekly assignments 40, Local Assembly practicals 30 and Final examinations 30.
-- - Each part is one grade category, marked by `part`, so the D13 formula in calculate_course_grades
--   stays as it is (a part with nothing counted is left out).
-- - Only an AAL2 administrator changes a split, always with a reason.
-- - Existing courses switch here where no grade has been released. Elsewhere an administrator switches
--   them with apply_standard_parts, after standard_parts_preview.
-- - An assignment in the practicals part is marked in person: learners send nothing; the course's
--   lecturers type the marks (practical_marks_save) into the learner's submission row, flagged
--   marked_in_person, so grade history, release, the gradebook and exports work as for any grade. An
--   unmarked practical is UNGRADED ("Not marked"), never Missing.

create type public.grade_part as enum ('ASSIGNMENTS', 'PRACTICALS', 'EXAMINATIONS');

alter table public.grade_categories add column part public.grade_part not null default 'ASSIGNMENTS';
comment on column public.grade_categories.part is 'Which of the three parts of the course grade this category is (ADR-016)';

-- ---------------------------------------------------------------- practicals marked in person
alter table public.submissions add column marked_in_person boolean not null default false;
comment on column public.submissions.marked_in_person is 'A practical mark typed by a lecturer: no answer was sent (ADR-016)';
alter table public.submissions drop constraint submissions_version_matches_status;
-- Only a draft (uploads waiting, nothing sent yet) has no version (D10), except a practical marked in
-- person, which never has one.
alter table public.submissions add constraint submissions_version_matches_status
  check ((status = 'DRAFT') = (current_version = 0 and not marked_in_person));
alter table public.submissions add constraint submissions_in_person_has_no_version
  check (not marked_in_person or (current_version = 0 and status <> 'DRAFT'));

/** The part of the course grade an assignment belongs to. */
create function private.assignment_part(p_assignment uuid) returns public.grade_part
language sql
stable
security definer
set search_path = ''
as $$
  select g.part from public.assignments a join public.grade_categories g on g.id = a.category_id where a.id = p_assignment;
$$;
revoke execute on function private.assignment_part(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- new courses start with the three parts
create or replace function private.add_default_category() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.grade_categories (course_id, name, weight, position, part) values
    (new.id, 'Weekly assignments', 40, 1, 'ASSIGNMENTS'),
    (new.id, 'Local Assembly practicals', 30, 2, 'PRACTICALS'),
    (new.id, 'Final examinations', 30, 3, 'EXAMINATIONS');
  return new;
end;
$$;

/** Whether the course has exactly the three parts, one category each. */
create function public.course_uses_standard_parts(p_course uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) = 3 and count(distinct part) = 3
    from public.grade_categories where course_id = p_course and archived_at is null;
$$;
revoke execute on function public.course_uses_standard_parts(uuid) from public, anon;
grant execute on function public.course_uses_standard_parts(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- assignments never sit in the examinations part
create or replace function private.assignments_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  if tg_op = 'UPDATE' and new.course_id is distinct from old.course_id then
    raise exception 'An assignment cannot move to another course' using errcode = '22023';
  end if;
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not exists (select 1 from public.grade_categories g where g.id = new.category_id and g.course_id = new.course_id and g.archived_at is null) then
    raise exception 'Choose a category of this course' using errcode = '22023';
  end if;
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and exists (select 1 from public.grade_categories g where g.id = new.category_id and g.part = 'EXAMINATIONS') then
    raise exception 'Examinations are set in the Examinations tab, not as assignments' using errcode = '22023';
  end if;
  if new.lesson_id is not null and (tg_op = 'INSERT' or new.lesson_id is distinct from old.lesson_id)
     and not exists (select 1 from public.lessons l where l.id = new.lesson_id and l.course_id = new.course_id) then
    raise exception 'Choose a lesson of this course' using errcode = '22023';
  end if;
  if new.instruction_audio_file_id is not null and (tg_op = 'INSERT' or new.instruction_audio_file_id is distinct from old.instruction_audio_file_id)
     and not exists (
       select 1 from public.file_objects f
        where f.id = new.instruction_audio_file_id and f.status = 'VALIDATED'
          and f.resource_type = 'ASSIGNMENT_INSTRUCTION_AUDIO' and f.resource_id = new.id
     ) then
    raise exception 'The instruction audio must be a validated audio file of this assignment' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- learners do not answer practicals
create or replace function private.submission_check(
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
  if private.assignment_part(p_assignment) = 'PRACTICALS' then
    reason := 'in_person';
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

create or replace function private.raise_submission_block(p_reason text) returns void
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
    when 'in_person' then raise exception 'This practical is marked in person by your lecturer' using errcode = '22023';
    when 'graded' then raise exception 'This answer has been graded' using errcode = '22023';
    when 'past_due' then raise exception 'The due date has passed' using errcode = '22023';
    when 'past_due_resubmit' then raise exception 'The due date has passed, so you cannot submit again' using errcode = '22023';
    else raise exception 'You cannot send an answer now' using errcode = '22023';
  end case;
end;
$$;

-- ---------------------------------------------------------------- grading a practical: the row is made when it is marked
create or replace function private.lock_answer_for_grading(p_actor uuid, p_as_admin boolean, p_assignment uuid, p_learner uuid)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course uuid;
  v_sub public.submissions;
  v_name text;
  v_found boolean;
begin
  select a.course_id into v_course from public.assignments a where a.id = p_assignment;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_course);
  select * into v_sub from public.submissions s where s.assignment_id = p_assignment and s.learner_id = p_learner for update;
  v_found := found;
  if private.assignment_part(p_assignment) = 'PRACTICALS' then
    if not exists (select 1 from public.course_enrollments e where e.course_id = v_course and e.learner_id = p_learner and e.enrolment_status <> 'WITHDRAWN') then
      select coalesce(p.first_name || ' ' || p.second_name, 'This person') into v_name from public.profiles p where p.id = p_learner;
      raise exception '% is not a learner of this course', coalesce(v_name, 'This person') using errcode = '22023';
    end if;
    if not v_found then
      insert into public.submissions (assignment_id, learner_id, status, current_version, marked_in_person)
      values (p_assignment, p_learner, 'SUBMITTED', 0, true)
      returning * into v_sub;
    end if;
    return v_sub;
  end if;
  if not v_found or v_sub.current_version = 0 then
    raise exception 'This learner has not sent an answer' using errcode = 'P0002';
  end if;
  return v_sub;
end;
$$;

/**
 * The practical mark sheet (owner request 2026-11-10): many learners' marks at once, each through
 * grade_save (0 to the maximum, optional feedback, a reason for a changed released mark), so history,
 * audit and release are those of any grade. Rows without a score are skipped. Returns how many marks
 * were saved or changed.
 */
create function public.practical_marks_save(p_actor uuid, p_as_admin boolean, p_assignment uuid, p_marks jsonb, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course uuid;
  v_item jsonb;
  v_changed boolean;
  v_count integer := 0;
begin
  select a.course_id into v_course from public.assignments a where a.id = p_assignment;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v_course);
  if private.assignment_part(p_assignment) is distinct from 'PRACTICALS' then
    raise exception 'Only practicals are marked on the mark sheet' using errcode = '22023';
  end if;
  if jsonb_typeof(p_marks) is distinct from 'array' or jsonb_array_length(p_marks) > 1000 then
    raise exception 'Send the marks as a list of up to 1,000 learners' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_marks) loop
    continue when nullif(v_item ->> 'score', '') is null;
    select g.changed into v_changed
      from public.grade_save(p_actor, p_as_admin, p_assignment, (v_item ->> 'learner_id')::uuid, (v_item ->> 'score')::numeric,
                             v_item ->> 'feedback', p_reason) g;
    if v_changed then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.practical_marks_save(uuid, boolean, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.practical_marks_save(uuid, boolean, uuid, jsonb, text) to service_role;

-- ---------------------------------------------------------------- the split: administrators only, with a reason
drop function public.grade_categories_save(uuid, boolean, uuid, jsonb, text);

/**
 * Changes the weights of a course's three parts (ADR-016): an AAL2 administrator only, always with a
 * reason, audited (grade_categories.changed_after_release once a grade was released, otherwise
 * grade_categories.weights_changed). Names and parts stay; the weights are whole numbers totalling 100.
 */
create function public.grade_categories_save(p_actor uuid, p_as_admin boolean, p_course uuid, p_categories jsonb, p_reason text default null) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_weight integer;
  v_total integer := 0;
  v_locked boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.require_lesson_actor(p_actor, p_as_admin, p_course);
  if not p_as_admin then
    raise exception 'Only an administrator can change the grade weights' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Give a reason for changing the grade weights' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'Keep the reason to 1,000 characters' using errcode = '22023';
  end if;
  if not public.course_uses_standard_parts(p_course) then
    raise exception 'Switch this course to the three parts first' using errcode = '22023';
  end if;
  if jsonb_typeof(p_categories) is distinct from 'array' or jsonb_array_length(p_categories) <> 3
     or (select count(distinct g.id) from jsonb_array_elements(p_categories) x
           join public.grade_categories g on g.id::text = x ->> 'id' and g.course_id = p_course and g.archived_at is null) <> 3 then
    raise exception 'A course has exactly three parts: weekly assignments, practicals and examinations' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_categories) loop
    begin
      v_weight := (v_item ->> 'weight')::integer;
    exception when others then
      raise exception 'Each weight is a whole number from 0 to 100' using errcode = '22023';
    end;
    if v_weight is null or v_weight not between 0 and 100 then
      raise exception 'Each weight is a whole number from 0 to 100' using errcode = '22023';
    end if;
    v_total := v_total + v_weight;
  end loop;
  if v_total <> 100 then
    raise exception 'The weights must total 100' using errcode = '22023';
  end if;

  perform 1 from public.courses where id = p_course for update;
  v_locked := public.course_weights_locked(p_course);
  perform set_config('app.actor_id', p_actor::text, true);
  perform set_config('app.weights_unlocked', 'on', true);
  update public.grade_categories g set weight = (x ->> 'weight')::integer
    from jsonb_array_elements(p_categories) x
   where g.id::text = x ->> 'id';
  perform set_config('app.weights_unlocked', '', true);
  perform private.write_audit(case when v_locked then 'grade_categories.changed_after_release' else 'grade_categories.weights_changed' end,
    'course', p_course::text,
    jsonb_build_object(
      'categories', (select jsonb_agg(jsonb_build_object('name', name, 'weight', weight, 'part', part) order by position)
                       from public.grade_categories where course_id = p_course and archived_at is null),
      'total', 100, 'reason', v_reason));
  return jsonb_build_object('total', 100, 'ready', true);
end;
$$;
revoke execute on function public.grade_categories_save(uuid, boolean, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.grade_categories_save(uuid, boolean, uuid, jsonb, text) to service_role;

-- ---------------------------------------------------------------- switching an existing course to the parts
/**
 * Gives the course the three parts: its current categories are archived (never deleted), the three
 * parts are added, and each assignment moves to Local Assembly practicals when its category's name
 * says "practical", otherwise to Weekly assignments. Nothing happens for a course that already has them.
 */
create function private.apply_parts(p_course uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid[];
  v_weekly uuid;
  v_practicals uuid;
begin
  if public.course_uses_standard_parts(p_course) then
    return;
  end if;
  select array_agg(id) into v_old from public.grade_categories where course_id = p_course and archived_at is null;
  perform set_config('app.weights_unlocked', 'on', true);
  update public.grade_categories set archived_at = now() where id = any (coalesce(v_old, '{}'));
  insert into public.grade_categories (course_id, name, weight, position, part) values (p_course, 'Weekly assignments', 40, 1, 'ASSIGNMENTS')
  returning id into v_weekly;
  insert into public.grade_categories (course_id, name, weight, position, part) values (p_course, 'Local Assembly practicals', 30, 2, 'PRACTICALS')
  returning id into v_practicals;
  insert into public.grade_categories (course_id, name, weight, position, part) values (p_course, 'Final examinations', 30, 3, 'EXAMINATIONS');
  update public.assignments a
     set category_id = case when g.part = 'PRACTICALS' or g.name ilike '%practical%' then v_practicals else v_weekly end
    from public.grade_categories g
   where g.id = a.category_id and a.course_id = p_course and g.id = any (coalesce(v_old, '{}'));
  perform set_config('app.weights_unlocked', '', true);
end;
$$;
revoke execute on function private.apply_parts(uuid) from public, anon, authenticated;

/** Each counted learner's overall grade now and once the course has the three parts; nothing is kept. Managers only. */
create function public.standard_parts_preview(p_course uuid)
returns table (learner_id uuid, first_name text, second_name text, current_overall numeric, new_overall numeric)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now jsonb;
  v_after jsonb;
begin
  if not private.can_manage_course(p_course) then
    return;
  end if;
  select coalesce(jsonb_object_agg(s.learner_id, s.overall), '{}') into v_now from private.course_grade_summary(p_course, true) s;
  begin
    perform private.apply_parts(p_course);
    select coalesce(jsonb_object_agg(s.learner_id, s.overall), '{}') into v_after from private.course_grade_summary(p_course, true) s;
    raise exception 'preview only' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    null; -- the switch is undone; the figures stay
  end;
  return query
    select p.id, p.first_name, p.second_name, (v_now ->> p.id::text)::numeric, (v_after ->> p.id::text)::numeric
      from public.profiles p
     where v_now ? p.id::text or v_after ? p.id::text
     order by p.first_name, p.second_name;
end;
$$;
revoke execute on function public.standard_parts_preview(uuid) from public, anon;
grant execute on function public.standard_parts_preview(uuid) to authenticated, service_role;

/**
 * Switches a course to the three parts (ADR-016): an AAL2 administrator only, with a reason, audited
 * grade_categories.standard_parts_applied.
 */
create function public.apply_standard_parts(p_actor uuid, p_as_admin boolean, p_course uuid, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.require_lesson_actor(p_actor, p_as_admin, p_course);
  if not p_as_admin then
    raise exception 'Only an administrator can change the grade weights' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Give a reason for changing the grade weights' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'Keep the reason to 1,000 characters' using errcode = '22023';
  end if;
  if public.course_uses_standard_parts(p_course) then
    return;
  end if;
  perform 1 from public.courses where id = p_course for update;
  perform set_config('app.actor_id', p_actor::text, true);
  perform private.apply_parts(p_course);
  perform private.write_audit('grade_categories.standard_parts_applied', 'course', p_course::text, jsonb_build_object('reason', v_reason));
end;
$$;
revoke execute on function public.apply_standard_parts(uuid, boolean, uuid, text) from public, anon, authenticated;
grant execute on function public.apply_standard_parts(uuid, boolean, uuid, text) to service_role;

-- Existing courses with no released grade switch now; the others wait for an administrator.
do $$
declare
  v_course uuid;
begin
  for v_course in
    select c.id from public.courses c
     where not public.course_uses_standard_parts(c.id) and not public.course_weights_locked(c.id)
  loop
    perform private.apply_parts(v_course);
    perform private.write_audit('grade_categories.standard_parts_applied', 'course', v_course::text,
      jsonb_build_object('reason', 'Phase 10.1: every course uses weekly assignments 40, practicals 30 and examinations 30 (owner decision of 2026-11-10)'));
  end loop;
end;
$$;

-- ---------------------------------------------------------------- reads that know about practicals
create or replace function private.course_grade_cells(p_course uuid, p_reveal boolean)
returns table (
  learner_id uuid, assignment_id uuid, category_id uuid, max_marks numeric, published boolean,
  effective_due_at timestamptz, state text, score numeric, is_late boolean, counted boolean, earned numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with learners as (
    select distinct e.learner_id from public.course_enrollments e where e.course_id = p_course and e.enrolment_status <> 'WITHDRAWN'
  ), zero as (
    select coalesce((select (value)::text::boolean from public.system_settings where key = 'missing_as_zero'), false) as on
  ), base as (
    select l.learner_id, a.id as assignment_id, a.category_id, a.max_marks,
           (a.publication_status = 'PUBLISHED' and a.archived_at is null) as published,
           private.effective_due_at(a.id, l.learner_id) as effective_due_at,
           g.part = 'PRACTICALS' as practical,
           s.status, s.score, s.released_score, s.released_at, s.grade_release_status, s.is_late,
           s.current_version
      from learners l
      cross join public.assignments a
      join public.grade_categories g on g.id = a.category_id
      left join public.submissions s on s.assignment_id = a.id and s.learner_id = l.learner_id and (s.current_version > 0 or s.marked_in_person)
     where a.course_id = p_course
       and ((a.publication_status = 'PUBLISHED' and a.archived_at is null) or s.released_at is not null)
  ), stated as (
    select b.*,
           case
             when b.released_at is not null then 'RELEASED'
             when b.status = 'GRADED' then 'DRAFT'
             when b.status is not null then 'UNGRADED'
             -- a practical not marked yet: never Missing, never counted as 0
             when b.practical then 'UNGRADED'
             when b.published and now() > b.effective_due_at and (select z.on from zero z) then 'COUNTED_ZERO'
             when b.published and now() > b.effective_due_at then 'MISSING'
             else 'NOT_DUE'
           end as raw_state
      from base b
  )
  select x.learner_id, x.assignment_id, x.category_id, x.max_marks, x.published, x.effective_due_at,
         case when x.raw_state = 'DRAFT' and not p_reveal then 'UNGRADED' else x.raw_state end,
         case
           when x.raw_state = 'RELEASED' then x.released_score
           when x.raw_state = 'DRAFT' and p_reveal then x.score
           when x.raw_state = 'COUNTED_ZERO' then 0
         end,
         coalesce(x.is_late, false),
         x.raw_state in ('RELEASED', 'COUNTED_ZERO'),
         case when x.raw_state = 'RELEASED' then x.released_score when x.raw_state = 'COUNTED_ZERO' then 0 end
    from stated x;
$$;

drop function public.gradebook_assignments(uuid);
/** The assignments shown as gradebook columns (the same set as the cells), with their part (ADR-016). */
create function public.gradebook_assignments(p_course uuid)
returns table (assignment_id uuid, title text, category_id uuid, category_name text, max_marks numeric, due_at timestamptz, published boolean, part text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.title, a.category_id, g.name, a.max_marks, a.due_at, (a.publication_status = 'PUBLISHED' and a.archived_at is null), g.part::text
    from public.assignments a
    join public.grade_categories g on g.id = a.category_id
   where a.course_id = p_course
     and exists (select 1 from private.course_grade_cells(p_course, false) c
                  where c.assignment_id = a.id
                    and (private.can_manage_course(p_course) or c.learner_id = (select auth.uid())))
   order by a.due_at, a.title;
$$;
revoke execute on function public.gradebook_assignments(uuid) from public, anon;
grant execute on function public.gradebook_assignments(uuid) to authenticated, service_role;

create or replace function public.assignment_results(p_assignment uuid)
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
    select x.id, x.course_id, x.due_at, x.max_marks, private.assignment_part(x.id) = 'PRACTICALS' as practical from public.assignments x
     where x.id = p_assignment and private.can_manage_course(x.course_id)
  ), enrolled as (
    select distinct e.learner_id from public.course_enrollments e join a on a.course_id = e.course_id where e.enrolment_status <> 'WITHDRAWN'
  ), sent as (
    select s.* from public.submissions s join a on a.id = s.assignment_id where s.current_version > 0 or s.marked_in_person
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
           -- a practical not marked yet is waiting for its mark (Not marked), never Missing
           when s.id is null and a.practical then 'UNGRADED'
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

-- To grade lists sent answers and draft grades; a practical's draft marks are drafts to release too.
create or replace function public.grading_queue()
returns table (
  course_id uuid, course_title text, course_code text,
  assignment_id uuid, assignment_title text, due_at timestamptz, max_marks numeric,
  learner_id uuid, first_name text, second_name text, id_number integer, branch_name text, profile_image_path text,
  state text, status public.submission_status, current_version integer, submitted_at timestamptz, is_late boolean, score numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.title, c.course_code,
         a.id, a.title, a.due_at, a.max_marks,
         p.id, p.first_name, p.second_name, p.id_number,
         (select b.name from public.branches b where b.id = p.branch_id),
         (select f.storage_path from public.file_objects f where f.id = p.profile_image_file_id and f.status = 'VALIDATED'),
         case when s.status = 'GRADED' then 'DRAFT' else 'UNGRADED' end,
         s.status, s.current_version,
         (select v.submitted_at from public.submission_versions v where v.submission_id = s.id and v.version_number = s.current_version),
         s.is_late,
         case when s.status = 'GRADED' then s.score end
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    join public.courses c on c.id = a.course_id
    join public.profiles p on p.id = s.learner_id
   where (s.current_version > 0 or s.marked_in_person)
     and (s.status in ('SUBMITTED', 'REOPENED') or (s.status = 'GRADED' and s.grade_release_status = 'DRAFT'))
     and c.status <> 'ARCHIVED'
     and private.can_manage_course(c.id)
   order by 17 nulls last, c.title, a.title, p.first_name, p.second_name;
$$;

create or replace function public.my_grades()
returns table (
  course_id uuid, course_title text, course_code text,
  assignment_id uuid, assignment_title text, due_at timestamptz, max_marks numeric,
  state text, score numeric, percentage numeric, letter_grade text, band text, passed boolean,
  feedback text, released_at timestamptz, updated boolean, submitted_at timestamptz, current_version integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.title, c.course_code,
         a.id, a.title, a.due_at, a.max_marks,
         case when s.released_at is not null then 'RELEASED' else 'AWAITING' end,
         s.released_score, g.percentage, g.letter_grade, g.band, g.passed,
         s.released_feedback, s.released_at,
         s.released_at is not null and (select count(*) from public.grade_change_history h where h.submission_id = s.id and h.event = 'RELEASED') > 1,
         (select v.submitted_at from public.submission_versions v where v.submission_id = s.id and v.version_number = s.current_version),
         s.current_version
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id and a.publication_status = 'PUBLISHED'
    join public.courses c on c.id = a.course_id
    left join lateral private.grade_facts(s.released_score, a.max_marks) g on true
   where s.learner_id = (select auth.uid())
     and (s.current_version > 0 or s.marked_in_person)
     and (select private.is_active_user())
     and exists (select 1 from public.course_enrollments e
                  where e.course_id = c.id and e.learner_id = s.learner_id and e.enrolment_status in ('ACTIVE', 'COMPLETED'))
   order by c.title, a.due_at, a.title;
$$;

/** The practical mark sheet's current marks and comments (the course's lecturers and AAL2 administrators only). */
create function public.practical_marks(p_assignment uuid)
returns table (learner_id uuid, score numeric, feedback text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.learner_id, s.score, s.feedback
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
   where s.assignment_id = p_assignment and s.marked_in_person and private.can_manage_course(a.course_id);
$$;
revoke execute on function public.practical_marks(uuid) from public, anon;
grant execute on function public.practical_marks(uuid) to authenticated, service_role;
