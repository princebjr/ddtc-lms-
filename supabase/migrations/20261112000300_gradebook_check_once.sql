-- Phase 13, migration 49 (performance, measured on tests/load/seed.sql): the gradebook's column list checked
-- "may the caller manage this course?" once for every learner-and-assignment cell (2,250 for a course of 150
-- learners and 15 assignments), each check a query of its own. Asked once instead, as (select ...): the same
-- answer, 3.7 s down to 0.14 s for that course (docs/acceptance/phase-13.md). Nothing else changes.

CREATE OR REPLACE FUNCTION public.gradebook_assignments(p_course uuid)
 RETURNS TABLE(assignment_id uuid, title text, category_id uuid, category_name text, max_marks numeric, due_at timestamp with time zone, published boolean, part text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with visible as (
    select distinct c.assignment_id from private.course_grade_cells(p_course, false) c
     where (select private.can_manage_course(p_course)) or c.learner_id = (select auth.uid())
  )
  select * from (
    select a.id, a.title, a.category_id, g.name, a.max_marks, a.due_at, (a.publication_status = 'PUBLISHED' and a.archived_at is null), g.part::text
      from public.assignments a
      join public.grade_categories g on g.id = a.category_id
     where a.course_id = p_course and a.id in (select assignment_id from visible)
    union all
    select x.id, x.title, x.category_id, g.name, private.exam_total(x.id), x.closes_at, (x.publication_status = 'PUBLISHED' and x.archived_at is null), 'EXAMINATIONS'
      from public.examinations x
      join public.grade_categories g on g.id = x.category_id
     where x.course_id = p_course and x.id in (select assignment_id from visible)
  ) cols
   order by 6, 2;
$function$;
