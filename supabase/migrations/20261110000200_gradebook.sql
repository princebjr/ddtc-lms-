-- Phase 10, migration 31: the gradebook. calculate_course_grades is the one place grade formulas live
-- (D30): built on private.grade_facts (Phase 9), it gives each learner's per-assignment state, category
-- percentages, overall grade and Final / Provisional / Not yet available exactly as D11 and D13 say.
-- assignment_statistics gives the class figures and the chart counts from released results only (D15).
-- Category weights lock after the first release (D12, D13): only an AAL2 administrator changes them,
-- with a reason (audited), after an impact preview (owner decision 4 of 2026-11-10). Course-wide review
-- and release of every draft grade at once (owner request and decision 1 of 2026-11-10). The assignment
-- performance report's totals (owner request 2026-11-06).

insert into public.system_settings (key, value, is_sensitive, description) values
  ('missing_as_zero', 'false', false,
   'D11: when true, published work past its effective due date with nothing sent counts as 0 (Counted as 0)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- one cell per learner and assignment (D11, D13)
/**
 * Every counted learner (any enrolment but WITHDRAWN) against every assignment of the course that is
 * published and not archived, or that has a released grade for that learner (D13: work unpublished
 * after release still counts). State: RELEASED (counted, the released score), DRAFT (graded, not
 * released), UNGRADED (sent, waiting), COUNTED_ZERO (missing_as_zero on, published, past the
 * effective due date, nothing sent: counted as 0), MISSING (the same with missing_as_zero off: not
 * counted) or NOT_DUE. With p_reveal false (a learner) a draft shows as UNGRADED with no score.
 */
create function private.course_grade_cells(p_course uuid, p_reveal boolean)
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
           s.status, s.score, s.released_score, s.released_at, s.grade_release_status, s.is_late,
           s.current_version
      from learners l
      cross join public.assignments a
      left join public.submissions s on s.assignment_id = a.id and s.learner_id = l.learner_id and s.current_version > 0
     where a.course_id = p_course
       and ((a.publication_status = 'PUBLISHED' and a.archived_at is null) or s.released_at is not null)
  ), stated as (
    select b.*,
           case
             when b.released_at is not null then 'RELEASED'
             when b.status = 'GRADED' then 'DRAFT'
             when b.status is not null then 'UNGRADED'
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

/**
 * Each learner's category percentages, overall grade and status from their cells (D13): category % =
 * earned / possible of counted items; overall = weighted average over the categories with at least
 * one counted item, one decimal rounded half up; Final when no published assignment is still to come
 * (not due, ungraded or draft), Provisional otherwise, Not yet available when nothing is counted.
 * p_weights ({id, weight} objects) replaces the saved weights for the impact preview.
 */
create function private.course_grade_summary(p_course uuid, p_reveal boolean, p_weights jsonb default null)
returns table (learner_id uuid, overall numeric, status text, categories jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with cells as (
    select * from private.course_grade_cells(p_course, p_reveal)
  ), cats as (
    select g.id, g.name, g.position,
           coalesce((select (w ->> 'weight')::numeric from jsonb_array_elements(p_weights) w where (w ->> 'id')::uuid = g.id), g.weight::numeric) as weight
      from public.grade_categories g
     where g.course_id = p_course
       and (g.archived_at is null or exists (select 1 from cells c where c.category_id = g.id and c.counted))
  ), per as (
    select l.learner_id, k.id as category_id, k.name, k.position, k.weight,
           coalesce(sum(c.earned) filter (where c.counted), 0) as earned,
           coalesce(sum(c.max_marks) filter (where c.counted), 0) as possible,
           count(*) filter (where c.counted) as items
      from (select distinct cells.learner_id from cells) l
      cross join cats k
      left join cells c on c.learner_id = l.learner_id and c.category_id = k.id
     group by l.learner_id, k.id, k.name, k.position, k.weight
  )
  select p.learner_id,
         case when sum(p.weight) filter (where p.items > 0) > 0
              then round(sum(p.earned / p.possible * 100 * p.weight) filter (where p.items > 0) / sum(p.weight) filter (where p.items > 0), 1)
         end,
         case
           when sum(p.items) = 0 then 'NOT_AVAILABLE'
           when exists (select 1 from cells c where c.learner_id = p.learner_id and c.published and c.state in ('NOT_DUE', 'UNGRADED', 'DRAFT')) then 'PROVISIONAL'
           else 'FINAL'
         end,
         jsonb_agg(jsonb_build_object(
           'category_id', p.category_id, 'name', p.name, 'weight', p.weight,
           'earned', p.earned, 'possible', p.possible, 'counted_items', p.items,
           'percentage', case when p.items > 0 then round(p.earned / p.possible * 100, 1) end
         ) order by p.position)
    from per p
   group by p.learner_id;
$$;

revoke execute on function private.course_grade_cells(uuid, boolean), private.course_grade_summary(uuid, boolean, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- calculate_course_grades (D30)
/**
 * The gradebook: one row per learner with their profile, overall grade (one decimal), letter grade and
 * band (D14, D15), status, category percentages and every cell. The course's lecturers and AAL2
 * administrators get every counted learner, drafts included; an administrator's view is audited. A
 * learner enrolled in the course gets only their own row, released results only. Nobody else gets rows.
 */
create function public.calculate_course_grades(p_course uuid)
returns table (
  learner_id uuid, first_name text, second_name text, id_number integer, branch_name text, profile_image_path text,
  enrolment_status public.enrolment_status, overall_percentage numeric, letter_grade text, band text, status text,
  categories jsonb, cells jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_manager boolean := private.can_manage_course(p_course);
  v_me uuid := (select auth.uid());
begin
  if not v_manager and not exists (
    select 1 from public.course_enrollments e
     where e.course_id = p_course and e.learner_id = v_me and e.enrolment_status <> 'WITHDRAWN'
  ) then
    return;
  end if;
  if v_manager and private.is_admin() and not private.is_lecturer_of(p_course) then
    perform private.write_audit('gradebook.viewed', 'course', p_course::text, '{}'::jsonb);
  end if;
  return query
    with cells as (
      select * from private.course_grade_cells(p_course, v_manager) c where v_manager or c.learner_id = v_me
    ), summary as (
      select * from private.course_grade_summary(p_course, v_manager) s where v_manager or s.learner_id = v_me
    )
    select p.id, p.first_name, p.second_name, p.id_number,
           (select b.name from public.branches b where b.id = p.branch_id),
           (select f.storage_path from public.file_objects f where f.id = p.profile_image_file_id and f.status = 'VALIDATED'),
           (select e.enrolment_status from public.course_enrollments e where e.course_id = p_course and e.learner_id = p.id
             order by e.enrolment_status = 'WITHDRAWN', e.enrolled_at desc limit 1),
           s.overall, g.letter_grade, g.band, s.status, s.categories,
           coalesce((select jsonb_agg(jsonb_build_object(
                       'assignment_id', c.assignment_id, 'category_id', c.category_id, 'state', c.state,
                       'score', c.score, 'max_marks', c.max_marks, 'is_late', c.is_late, 'counted', c.counted,
                       'published', c.published, 'effective_due_at', c.effective_due_at,
                       'percentage', f.percentage, 'letter_grade', f.letter_grade, 'band', f.band
                     ) order by a.due_at, a.title)
                       from cells c
                       join public.assignments a on a.id = c.assignment_id
                       left join lateral private.grade_facts(c.score, c.max_marks) f on c.score is not null
                      where c.learner_id = p.id), '[]'::jsonb)
      from summary s
      join public.profiles p on p.id = s.learner_id
      left join lateral private.grade_facts(s.overall, 100) g on s.overall is not null
     order by p.first_name, p.second_name;
end;
$$;

/** The assignments shown as gradebook columns (the same set as the cells), for whoever may see the gradebook. */
create function public.gradebook_assignments(p_course uuid)
returns table (assignment_id uuid, title text, category_id uuid, category_name text, max_marks numeric, due_at timestamptz, published boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.title, a.category_id, g.name, a.max_marks, a.due_at, (a.publication_status = 'PUBLISHED' and a.archived_at is null)
    from public.assignments a
    join public.grade_categories g on g.id = a.category_id
   where a.course_id = p_course
     and exists (select 1 from private.course_grade_cells(p_course, false) c
                  where c.assignment_id = a.id
                    and (private.can_manage_course(p_course) or c.learner_id = (select auth.uid())))
   order by a.due_at, a.title;
$$;

-- ---------------------------------------------------------------- class statistics and charts (D15)
/**
 * Per assignment, released results only: how many released, ungraded (sent, not released) and missing,
 * the average, highest and lowest percentage (one decimal) and the distribution over the D15 bands.
 * Managers always see the chart; a learner of the course sees it only from min_class_size released
 * results, with their own band to highlight. Nobody else gets rows.
 */
create function public.assignment_statistics(p_course uuid)
returns table (
  assignment_id uuid, released integer, ungraded integer, missing integer,
  average numeric, highest numeric, lowest numeric, distribution jsonb, chart_visible boolean, my_band text
)
language sql
stable
security definer
set search_path = ''
as $$
  with who as (
    select private.can_manage_course(p_course) as manager, (select auth.uid()) as me
  ), cells as (
    select c.*, f.percentage, f.band
      from private.course_grade_cells(p_course, false) c
      left join lateral private.grade_facts(c.score, c.max_marks) f on c.state = 'RELEASED'
     where (select manager from who) or exists (
       select 1 from public.course_enrollments e
        where e.course_id = p_course and e.learner_id = (select me from who) and e.enrolment_status <> 'WITHDRAWN')
  ), bands as (
    select (b ->> 0)::numeric as lo, (b ->> 1)::numeric as hi, n, n = jsonb_array_length(v.value) as last
      from public.system_settings v, jsonb_array_elements(v.value) with ordinality as x(b, n)
     where v.key = 'distribution_bands'
  ), minimum as (
    select coalesce((select (value)::text::int from public.system_settings where key = 'min_class_size'), 5) as n
  )
  select c.assignment_id,
         count(*) filter (where c.state = 'RELEASED')::int,
         count(*) filter (where c.state = 'UNGRADED')::int,
         count(*) filter (where c.state in ('MISSING', 'COUNTED_ZERO'))::int,
         round(avg(c.percentage) filter (where c.state = 'RELEASED'), 1),
         round(max(c.percentage) filter (where c.state = 'RELEASED'), 1),
         round(min(c.percentage) filter (where c.state = 'RELEASED'), 1),
         (select jsonb_agg(jsonb_build_object(
                   'band', case when b.last then trim_scale(b.lo) || '-' || trim_scale(b.hi) || '%' else trim_scale(b.lo) || '-' || trim_scale(b.hi - 1) || '%' end,
                   'count', (select count(*) from cells r where r.assignment_id = c.assignment_id and r.state = 'RELEASED'
                               and r.percentage >= b.lo and (r.percentage < b.hi or (b.last and r.percentage <= b.hi))))
                 order by b.n)
            from bands b),
         (select manager from who) or count(*) filter (where c.state = 'RELEASED') >= (select n from minimum),
         case when not (select manager from who) then max(c.band) filter (where c.learner_id = (select me from who) and c.state = 'RELEASED') end
    from cells c
   group by c.assignment_id;
$$;

-- ---------------------------------------------------------------- weights lock (D12, D13; owner decision 4)
/** Whether any grade of the course has been released (then its category weights are locked). */
create function public.course_weights_locked(p_course uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.submissions s join public.assignments a on a.id = s.assignment_id
                  where a.course_id = p_course and s.released_at is not null);
$$;

/** Refuses any change of weights (insert, weight, archiving) once grades are released, outside the administrator workflow. */
create function private.grade_categories_lock() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.weight is distinct from old.weight or new.archived_at is distinct from old.archived_at)
     and coalesce(current_setting('app.weights_unlocked', true), '') <> 'on'
     and public.course_weights_locked(new.course_id) then
    raise exception 'Category weights are locked after the first grade release' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger grade_categories_lock before insert or update on public.grade_categories
  for each row execute function private.grade_categories_lock();

revoke execute on function private.grade_categories_lock() from public, anon, authenticated;

drop function public.grade_categories_save(uuid, boolean, uuid, jsonb);

/**
 * Saves a course's grade categories (Phase 7). After the first release the weights are locked: a
 * lecturer is refused; an administrator changes them only with a reason, audited (owner decision 4).
 */
create function public.grade_categories_save(p_actor uuid, p_as_admin boolean, p_course uuid, p_categories jsonb, p_reason text default null) returns jsonb
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
  v_locked boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.require_lesson_actor(p_actor, p_as_admin, p_course);
  v_locked := public.course_weights_locked(p_course);
  if v_locked and not p_as_admin then
    raise exception 'Category weights are locked after the first grade release. An administrator can change them' using errcode = '42501';
  end if;
  if v_locked and v_reason is null then
    raise exception 'Give a reason for changing weights after grades were released' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'Keep the reason to 1,000 characters' using errcode = '22023';
  end if;
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

  perform set_config('app.actor_id', p_actor::text, true);
  if v_locked then
    perform set_config('app.weights_unlocked', 'on', true);
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
  perform set_config('app.weights_unlocked', '', true);

  v_total := (select coalesce(sum(weight), 0)::int from public.grade_categories where course_id = p_course and archived_at is null);
  perform private.write_audit(case when v_locked then 'grade_categories.changed_after_release' else 'course.categories_saved' end, 'course', p_course::text,
    jsonb_build_object(
      'categories', (select jsonb_agg(jsonb_build_object('name', name, 'weight', weight) order by position)
                       from public.grade_categories where course_id = p_course and archived_at is null),
      'total', v_total, 'reason', v_reason));
  return jsonb_build_object('total', v_total, 'ready', v_total = 100);
end;
$$;

revoke execute on function public.grade_categories_save(uuid, boolean, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.grade_categories_save(uuid, boolean, uuid, jsonb, text) to service_role;

/**
 * The impact of new weights before saving them (D13 workflow): each counted learner's overall now and
 * with p_categories ({id, weight} objects). The course's lecturers and AAL2 administrators only.
 */
create function public.weights_impact_preview(p_course uuid, p_categories jsonb)
returns table (learner_id uuid, first_name text, second_name text, current_overall numeric, new_overall numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.first_name, p.second_name, n.overall, w.overall
    from private.course_grade_summary(p_course, true) n
    join private.course_grade_summary(p_course, true, p_categories) w on w.learner_id = n.learner_id
    join public.profiles p on p.id = n.learner_id
   where private.can_manage_course(p_course)
   order by p.first_name, p.second_name;
$$;

-- ---------------------------------------------------------------- course-wide review and release (owner request)
/** Every draft grade in the course, for the review before Release all: a changed released grade marked. Managers only. */
create function public.course_release_preview(p_course uuid)
returns table (
  assignment_id uuid, assignment_title text, learner_id uuid, first_name text, second_name text, id_number integer, branch_name text,
  score numeric, max_marks numeric, percentage numeric, letter_grade text, changed boolean, released_score numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.title, p.id, p.first_name, p.second_name, p.id_number,
         (select b.name from public.branches b where b.id = p.branch_id),
         s.score, a.max_marks, f.percentage, f.letter_grade, s.released_at is not null, s.released_score
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    join public.profiles p on p.id = s.learner_id
    left join lateral private.grade_facts(s.score, a.max_marks) f on true
   where a.course_id = p_course and s.status = 'GRADED' and s.grade_release_status = 'DRAFT' and s.score is not null
     and private.can_manage_course(p_course)
   order by a.due_at, a.title, p.first_name, p.second_name;
$$;

/**
 * Releases every draft grade of the course at once (owner request 2026-11-10), assignment by assignment
 * through grade_release (the same checks, history, notifications and audit). Refused unless the
 * category weights total 100. Returns how many grades were released.
 */
create function public.grade_release_course(p_actor uuid, p_as_admin boolean, p_course uuid) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment uuid;
  v_total integer := 0;
begin
  perform private.require_lesson_actor(p_actor, p_as_admin, p_course);
  perform private.require_weights_total_100(p_course);
  for v_assignment in
    select distinct a.id from public.assignments a join public.submissions s on s.assignment_id = a.id
     where a.course_id = p_course and s.status = 'GRADED' and s.grade_release_status = 'DRAFT' and s.score is not null
  loop
    v_total := v_total + public.grade_release(p_actor, p_as_admin, v_assignment, null);
  end loop;
  if v_total = 0 then
    raise exception 'There are no grades to release' using errcode = '22023';
  end if;
  perform private.write_audit('grades.released_course', 'course', p_course::text, jsonb_build_object('released', v_total));
  return v_total;
end;
$$;

revoke execute on function public.grade_release_course(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.grade_release_course(uuid, boolean, uuid) to service_role;

-- ---------------------------------------------------------------- assignment performance report (owner request 2026-11-06)
/**
 * The report's totals, from assignment_results (so they agree with its rows): enrolled, submitted, not
 * submitted, graded, and the average, highest and lowest percentage of the graded answers (current
 * grades, released or not; one decimal). The course's lecturers and AAL2 administrators only.
 */
create function public.assignment_report_summary(p_assignment uuid)
returns table (enrolled integer, submitted integer, not_submitted integer, graded integer, average numeric, highest numeric, lowest numeric, max_marks numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where r.counted)::int,
         count(*) filter (where r.counted and r.result in ('GRADED', 'UNGRADED'))::int,
         count(*) filter (where r.counted and r.result in ('MISSING', 'NOT_YET_DUE'))::int,
         count(*) filter (where r.counted and r.result = 'GRADED')::int,
         round(avg(r.percentage) filter (where r.counted and r.result = 'GRADED'), 1),
         round(max(r.percentage) filter (where r.counted and r.result = 'GRADED'), 1),
         round(min(r.percentage) filter (where r.counted and r.result = 'GRADED'), 1),
         max(r.max_marks)
    from public.assignment_results(p_assignment) r
  having exists (select 1 from public.assignments a where a.id = p_assignment and private.can_manage_course(a.course_id));
$$;

revoke execute on function public.calculate_course_grades(uuid), public.gradebook_assignments(uuid), public.assignment_statistics(uuid),
  public.course_weights_locked(uuid), public.weights_impact_preview(uuid, jsonb), public.course_release_preview(uuid),
  public.assignment_report_summary(uuid) from public, anon;
grant execute on function public.calculate_course_grades(uuid), public.gradebook_assignments(uuid), public.assignment_statistics(uuid),
  public.course_weights_locked(uuid), public.weights_impact_preview(uuid, jsonb), public.course_release_preview(uuid),
  public.assignment_report_summary(uuid) to authenticated, service_role;
