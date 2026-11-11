-- Phase 11, migration 39 (ADR-019; BUILD_PLAN Phase 11; D11, D14, D15, D17, D42, D43; owner answer 6 of
-- 2026-11-10): what the administrator screens need.
--   * Settings: every editable value is checked by the table itself (pass mark, minimum class size, grade
--     scale, chart bands, file limits; the idle limits and the JSON type were already checked). Only an
--     AAL2 administrator changes a setting (existing policy) and every change is audited (existing trigger).
--   * Audit log viewer: audit_log_search (filters by action, person, item and date, newest first, paged)
--     and audit_log_actions for the filter; audit_log_export returns the filtered rows for a CSV and is
--     itself audited (audit_log.exported). AAL2 administrators only.
--   * Reports (D42: by course and branch, filtered by course, branch and dates): enrolment, activity,
--     completion and grade summaries (released grades only, from course_grade_summary, so the one formula
--     of calculate_course_grades). AAL2 administrators only.

-- ---------------------------------------------------------------- settings checks
/** A grade scale: objects {grade, min, max} with whole numbers, covering 0 to 100 without gaps or overlaps. */
create function private.valid_grade_scale(p jsonb) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_expect integer := 100;
  r jsonb;
begin
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between 2 and 12 then
    return false;
  end if;
  for r in select value from jsonb_array_elements(p) order by (value ->> 'max')::numeric desc loop
    if jsonb_typeof(r -> 'grade') is distinct from 'string' or char_length(r ->> 'grade') not between 1 and 3
       or not private.json_int_between(r -> 'min', 0, 100) or not private.json_int_between(r -> 'max', 0, 100)
       or (r ->> 'max')::int <> v_expect or (r ->> 'min')::int > (r ->> 'max')::int then
      return false;
    end if;
    v_expect := (r ->> 'min')::int - 1;
  end loop;
  return v_expect = -1;
end;
$$;

/** Chart bands: [[lower, upper], ...] with whole numbers, from 0 to 100, each starting where the last ended. */
create function private.valid_bands(p jsonb) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_expect integer := 0;
  r jsonb;
begin
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between 2 and 20 then
    return false;
  end if;
  for r in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(r) is distinct from 'array' or jsonb_array_length(r) <> 2
       or not private.json_int_between(r -> 0, 0, 100) or not private.json_int_between(r -> 1, 0, 100)
       or (r ->> 0)::int <> v_expect or (r ->> 1)::int <= (r ->> 0)::int then
      return false;
    end if;
    v_expect := (r ->> 1)::int;
  end loop;
  return v_expect = 100;
end;
$$;

/** File limits: each kind's max_bytes between 1 KB and 2 GB, and max_seconds (where present) between 10 s and 6 hours. */
create function private.valid_file_limits(p jsonb) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  r record;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return false;
  end if;
  for r in select key, value from jsonb_each(p) loop
    if r.key = 'resumable_over_bytes' then
      if not private.json_int_between(r.value, 1048576, 2147483647) then return false; end if;
    elsif jsonb_typeof(r.value) is distinct from 'object' or not private.json_int_between(r.value -> 'max_bytes', 1024, 2147483647)
       or (r.value ? 'max_seconds' and not private.json_int_between(r.value -> 'max_seconds', 10, 21600)) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke execute on function private.valid_grade_scale(jsonb), private.valid_bands(jsonb), private.valid_file_limits(jsonb) from public, anon;
grant execute on function private.valid_grade_scale(jsonb), private.valid_bands(jsonb), private.valid_file_limits(jsonb) to authenticated, service_role;

alter table public.system_settings add constraint system_settings_values_check check (
  case key
    when 'pass_mark' then private.json_int_between(value, 0, 100)
    when 'min_class_size' then private.json_int_between(value, 1, 500)
    when 'max_files_per_submission_version' then private.json_int_between(value, 1, 20)
    when 'grade_scale' then private.valid_grade_scale(value)
    when 'distribution_bands' then private.valid_bands(value)
    when 'file_limits' then private.valid_file_limits(value)
    else true
  end
);

-- ---------------------------------------------------------------- audit log viewer
/** Filtered audit entries, newest first, 50 a page (before = the created_at of the last one shown). */
create function public.audit_log_search(p_action text default null, p_actor uuid default null, p_entity_type text default null, p_entity_id text default null,
                                        p_from timestamptz default null, p_to timestamptz default null, p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, created_at timestamptz, action text, entity_type text, entity_id text, metadata jsonb, actor_id uuid, actor_name text, actor_role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only administrators read the audit log' using errcode = '42501';
  end if;
  return query
  select l.id, l.created_at, l.action, l.entity_type, l.entity_id, l.metadata, l.actor_id,
         case when p.id is null then 'System' else p.first_name || ' ' || p.second_name end, p.role::text
    from public.audit_logs l left join public.profiles p on p.id = l.actor_id
   where (p_action is null or l.action = p_action)
     and (p_actor is null or l.actor_id = p_actor)
     and (p_entity_type is null or l.entity_type = p_entity_type)
     and (p_entity_id is null or l.entity_id = p_entity_id)
     and (p_from is null or l.created_at >= p_from)
     and (p_to is null or l.created_at < p_to)
     and (p_before is null or l.created_at < p_before)
   order by l.created_at desc, l.id
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

/** The actions and item types that appear in the log, for the filters. */
create function public.audit_log_actions() returns table (action text, entity_type text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only administrators read the audit log' using errcode = '42501';
  end if;
  return query select distinct l.action, l.entity_type from public.audit_logs l order by 1, 2;
end;
$$;

/** The filtered entries for a CSV (at most 10,000), recorded in the log itself (owner answer 6). */
create function public.audit_log_export(p_action text default null, p_actor uuid default null, p_entity_type text default null, p_entity_id text default null,
                                        p_from timestamptz default null, p_to timestamptz default null)
returns table (id uuid, created_at timestamptz, action text, entity_type text, entity_id text, metadata jsonb, actor_id uuid, actor_name text, actor_role text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.is_admin() then
    raise exception 'Only administrators export the audit log' using errcode = '42501';
  end if;
  create temporary table if not exists pg_temp.audit_export on commit drop as
    select * from public.audit_log_search(p_action, p_actor, p_entity_type, p_entity_id, p_from, p_to, null, 1) where false;
  truncate pg_temp.audit_export;
  insert into pg_temp.audit_export
  select l.id, l.created_at, l.action, l.entity_type, l.entity_id, l.metadata, l.actor_id,
         case when p.id is null then 'System' else p.first_name || ' ' || p.second_name end, p.role::text
    from public.audit_logs l left join public.profiles p on p.id = l.actor_id
   where (p_action is null or l.action = p_action)
     and (p_actor is null or l.actor_id = p_actor)
     and (p_entity_type is null or l.entity_type = p_entity_type)
     and (p_entity_id is null or l.entity_id = p_entity_id)
     and (p_from is null or l.created_at >= p_from)
     and (p_to is null or l.created_at < p_to)
   order by l.created_at desc, l.id
   limit 10000;
  get diagnostics v_count = row_count;
  perform private.write_audit('audit_log.exported', 'audit_log', null, jsonb_strip_nulls(jsonb_build_object(
    'rows', v_count, 'action', p_action, 'actor_id', p_actor, 'entity_type', p_entity_type, 'entity_id', p_entity_id, 'from', p_from, 'to', p_to)));
  return query select * from pg_temp.audit_export e order by e.created_at desc, e.id;
end;
$$;

revoke execute on function public.audit_log_search(text, uuid, text, text, timestamptz, timestamptz, timestamptz, integer),
  public.audit_log_actions(), public.audit_log_export(text, uuid, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.audit_log_search(text, uuid, text, text, timestamptz, timestamptz, timestamptz, integer),
  public.audit_log_actions(), public.audit_log_export(text, uuid, text, text, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------- reports (D42)
/** The learners a report counts: enrolments in matching courses, with their branch; WITHDRAWN only when asked. */
create function private.report_learners(p_course uuid, p_branch uuid, p_with_withdrawn boolean)
returns table (course_id uuid, course_title text, course_code text, learner_id uuid, branch_name text, branch_position integer,
               enrolment_status public.enrolment_status, enrolled_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.title, c.course_code, e.learner_id, b.name, b.position, e.enrolment_status, e.enrolled_at
    from public.course_enrollments e
    join public.courses c on c.id = e.course_id
    join public.profiles p on p.id = e.learner_id
    left join public.branches b on b.id = p.branch_id
   where (p_course is null or c.id = p_course)
     and (p_branch is null or p.branch_id = p_branch)
     and (p_with_withdrawn or e.enrolment_status <> 'WITHDRAWN')
     and c.status <> 'DRAFT';
$$;
revoke execute on function private.report_learners(uuid, uuid, boolean) from public, anon, authenticated;

create function private.require_report_admin() returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only administrators read reports' using errcode = '42501';
  end if;
end;
$$;

/** Enrolment by course and branch: each status, and enrolments made in the date range. */
create function public.report_enrolment(p_course uuid default null, p_branch uuid default null, p_from timestamptz default null, p_to timestamptz default null)
returns table (course_id uuid, course_title text, course_code text, branch_name text, active integer, completed integer, suspended integer,
               withdrawn integer, enrolled_in_period integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_report_admin();
  return query
  select r.course_id, r.course_title, r.course_code, r.branch_name,
         count(*) filter (where r.enrolment_status = 'ACTIVE')::int, count(*) filter (where r.enrolment_status = 'COMPLETED')::int,
         count(*) filter (where r.enrolment_status = 'SUSPENDED')::int, count(*) filter (where r.enrolment_status = 'WITHDRAWN')::int,
         count(*) filter (where (p_from is null or r.enrolled_at >= p_from) and (p_to is null or r.enrolled_at < p_to))::int
    from private.report_learners(p_course, p_branch, true) r
   group by r.course_id, r.course_title, r.course_code, r.branch_name, r.branch_position
   order by r.course_title, r.branch_position nulls last;
end;
$$;

/** Activity by course and branch in the date range: answers sent, examination scripts submitted, lessons completed. */
create function public.report_activity(p_course uuid default null, p_branch uuid default null, p_from timestamptz default null, p_to timestamptz default null)
returns table (course_id uuid, course_title text, course_code text, branch_name text, learners integer, active_learners integer,
               answers_sent integer, exam_scripts integer, lessons_completed integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_report_admin();
  return query
  with l as (select * from private.report_learners(p_course, p_branch, false)),
  per as (
    select l.course_id, l.learner_id,
           (select count(*) from public.submission_versions v join public.submissions s on s.id = v.submission_id
              join public.assignments a on a.id = s.assignment_id
             where a.course_id = l.course_id and s.learner_id = l.learner_id
               and (p_from is null or v.submitted_at >= p_from) and (p_to is null or v.submitted_at < p_to))::int as answers,
           (select count(*) from public.exam_attempts t join public.examinations x on x.id = t.exam_id
             where x.course_id = l.course_id and t.learner_id = l.learner_id and t.status = 'SUBMITTED'
               and (p_from is null or t.submitted_at >= p_from) and (p_to is null or t.submitted_at < p_to))::int as scripts,
           (select count(*) from public.lesson_progress g join public.lessons s on s.id = g.lesson_id
             where s.course_id = l.course_id and g.learner_id = l.learner_id and g.completion_status = 'COMPLETED'
               and (p_from is null or g.completed_at >= p_from) and (p_to is null or g.completed_at < p_to))::int as lessons
      from l
  )
  select l.course_id, l.course_title, l.course_code, l.branch_name, count(*)::int,
         count(*) filter (where p.answers + p.scripts + p.lessons > 0)::int,
         coalesce(sum(p.answers), 0)::int, coalesce(sum(p.scripts), 0)::int, coalesce(sum(p.lessons), 0)::int
    from l join per p on p.course_id = l.course_id and p.learner_id = l.learner_id
   group by l.course_id, l.course_title, l.course_code, l.branch_name, l.branch_position
   order by l.course_title, l.branch_position nulls last;
end;
$$;

/** Completion by course and branch: published lessons, average progress, and learners who completed them all. */
create function public.report_completion(p_course uuid default null, p_branch uuid default null)
returns table (course_id uuid, course_title text, course_code text, branch_name text, learners integer, lessons integer,
               average_progress numeric, completed_all integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_report_admin();
  return query
  with l as (select * from private.report_learners(p_course, p_branch, false)),
  n as (select s.course_id, count(*)::int as lessons from public.lessons s where s.publication_status = 'PUBLISHED' group by s.course_id),
  per as (
    select l.course_id, l.learner_id,
           (select count(*) from public.lesson_progress g join public.lessons s on s.id = g.lesson_id
             where s.course_id = l.course_id and s.publication_status = 'PUBLISHED' and g.learner_id = l.learner_id
               and g.completion_status = 'COMPLETED')::int as done
      from l
  )
  select l.course_id, l.course_title, l.course_code, l.branch_name, count(*)::int, coalesce(max(n.lessons), 0),
         case when coalesce(max(n.lessons), 0) = 0 then null
              else round(avg(p.done::numeric * 100 / n.lessons), 1) end,
         count(*) filter (where coalesce(n.lessons, 0) > 0 and p.done >= n.lessons)::int
    from l join per p on p.course_id = l.course_id and p.learner_id = l.learner_id
    left join n on n.course_id = l.course_id
   group by l.course_id, l.course_title, l.course_code, l.branch_name, l.branch_position
   order by l.course_title, l.branch_position nulls last;
end;
$$;

/**
 * Grade summaries by course and branch (D42: learner count and average grade per branch), from released
 * grades only, through course_grade_summary (the one formula, D13): learners with a course grade, the
 * average, and how many are at or above the pass mark (D14).
 */
create function public.report_grades(p_course uuid default null, p_branch uuid default null)
returns table (course_id uuid, course_title text, course_code text, branch_name text, learners integer, graded integer,
               average_percentage numeric, passed integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pass numeric := coalesce((select (value #>> '{}')::numeric from public.system_settings where key = 'pass_mark'), 50);
begin
  perform private.require_report_admin();
  return query
  with l as (select * from private.report_learners(p_course, p_branch, false)),
  g as (
    select c.id as course_id, s.learner_id, s.overall
      from (select distinct l.course_id as id from l) c
      cross join lateral private.course_grade_summary(c.id, false) s
  )
  select l.course_id, l.course_title, l.course_code, l.branch_name, count(*)::int, count(g.overall)::int,
         round(avg(g.overall), 1), count(*) filter (where g.overall >= v_pass)::int
    from l left join g on g.course_id = l.course_id and g.learner_id = l.learner_id
   group by l.course_id, l.course_title, l.course_code, l.branch_name, l.branch_position
   order by l.course_title, l.branch_position nulls last;
end;
$$;

revoke execute on function public.report_enrolment(uuid, uuid, timestamptz, timestamptz), public.report_activity(uuid, uuid, timestamptz, timestamptz),
  public.report_completion(uuid, uuid), public.report_grades(uuid, uuid) from public, anon;
grant execute on function public.report_enrolment(uuid, uuid, timestamptz, timestamptz), public.report_activity(uuid, uuid, timestamptz, timestamptz),
  public.report_completion(uuid, uuid), public.report_grades(uuid, uuid) to authenticated;
