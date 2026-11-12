-- Phase 13, migration 50 (performance, measured on tests/load/seed.sql): course_grade_cells, under every course
-- grade, gradebook, chart and grade report, looked up each learner's due date through private.effective_due_at
-- once per learner-and-assignment cell; a SECURITY DEFINER function is never folded into the query, so that
-- was one extra query per cell. The same answer comes from one join on the learner's active extension (at
-- most one, unique index submission_extensions_current_key) falling back to the due date. Identical output
-- on all 45,031 cells of the seed (old and new compared both ways); about 140 ms down to about 85 ms a course.
-- Grades are still computed only here and in calculate_course_grades (CLAUDE.md); no formula changes.

CREATE OR REPLACE FUNCTION private.course_grade_cells(p_course uuid, p_reveal boolean)
 RETURNS TABLE(learner_id uuid, assignment_id uuid, category_id uuid, max_marks numeric, published boolean, effective_due_at timestamp with time zone, state text, score numeric, is_late boolean, counted boolean, earned numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with learners as (
    select distinct e.learner_id from public.course_enrollments e where e.course_id = p_course and e.enrolment_status <> 'WITHDRAWN'
  ), zero as (
    select coalesce((select (value)::text::boolean from public.system_settings where key = 'missing_as_zero'), false) as on
  ), base as (
    select l.learner_id, a.id as assignment_id, a.category_id, a.max_marks,
           (a.publication_status = 'PUBLISHED' and a.archived_at is null) as published,
           coalesce(ext.extended_due_at, a.due_at) as effective_due_at,
           g.part = 'PRACTICALS' as practical,
           s.status, s.score, s.released_score, s.released_at, s.grade_release_status, s.is_late,
           s.current_version
      from learners l
      cross join public.assignments a
      join public.grade_categories g on g.id = a.category_id
      left join public.submission_extensions ext on ext.assignment_id = a.id and ext.learner_id = l.learner_id and ext.revoked_at is null
      left join public.submissions s on s.assignment_id = a.id and s.learner_id = l.learner_id and (s.current_version > 0 or s.marked_in_person)
     where a.course_id = p_course
       and ((a.publication_status = 'PUBLISHED' and a.archived_at is null) or s.released_at is not null)
  ), stated as (
    select b.*,
           case
             when b.released_at is not null then 'RELEASED'
             when b.status = 'GRADED' then 'DRAFT'
             when b.status is not null then 'UNGRADED'
             when b.practical then 'UNGRADED'
             when b.published and now() > b.effective_due_at and (select z.on from zero z) then 'COUNTED_ZERO'
             when b.published and now() > b.effective_due_at then 'MISSING'
             else 'NOT_DUE'
           end as raw_state
      from base b
  ), exams as (
    -- the latest released attempt counts (a released retake replaces the earlier result); before any
    -- release the latest markable attempt is a draft once fully marked, otherwise waiting
    select l.learner_id, x.id as exam_id, x.category_id, private.exam_total(x.id) as max_marks,
           (x.publication_status = 'PUBLISHED' and x.archived_at is null) as published,
           private.exam_close_for(x.id, l.learner_id) as close_at,
           rel.released_score, rel.released_at, mk.id as markable, sc.total as current_total, sc.unmarked
      from learners l
      cross join public.examinations x
      left join lateral (select * from public.exam_attempts t where t.exam_id = x.id and t.learner_id = l.learner_id and t.released_at is not null
                          order by t.attempt_number desc limit 1) rel on true
      left join lateral (select (private.exam_markable_attempt(x.id, l.learner_id)).*) mk on true
      left join lateral private.exam_attempt_scores(mk.id) sc on mk.id is not null
     where x.course_id = p_course
       and ((x.publication_status = 'PUBLISHED' and x.archived_at is null) or rel.released_at is not null)
  ), exam_stated as (
    select e.*,
           case
             when e.released_at is not null then 'RELEASED'
             when e.markable is not null and e.unmarked = 0 then 'DRAFT'
             when e.markable is not null and exists (select 1 from public.exam_attempts t where t.id = e.markable and t.status = 'SUBMITTED') then 'UNGRADED'
             when e.published and now() >= e.close_at and (select z.on from zero z) then 'COUNTED_ZERO'
             when e.published and now() >= e.close_at then 'MISSING'
             else 'NOT_DUE'
           end as raw_state
      from exams e
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
    from stated x
  union all
  select e.learner_id, e.exam_id, e.category_id, e.max_marks, e.published, e.close_at,
         case when e.raw_state = 'DRAFT' and not p_reveal then 'UNGRADED' else e.raw_state end,
         case
           when e.raw_state = 'RELEASED' then e.released_score
           when e.raw_state = 'DRAFT' and p_reveal then e.current_total
           when e.raw_state = 'COUNTED_ZERO' then 0
         end,
         false,
         e.raw_state in ('RELEASED', 'COUNTED_ZERO'),
         case when e.raw_state = 'RELEASED' then e.released_score when e.raw_state = 'COUNTED_ZERO' then 0 end
    from exam_stated e;
$function$;
