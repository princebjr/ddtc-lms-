-- Phase 10.1, migration 36 (ADR-016; owner request of 2026-11-10): examinations on the dashboards.
-- my_exam_deadlines gives the learner's examinations still to do across their courses (the deadline on
-- their dashboard, no countdown); exam_marking_queue gives the course's managers, per examination, the
-- scripts waiting for marking and the marked results waiting for release (lecturer dashboard, To grade).

/** The signed-in learner's examinations still to do (upcoming or open, not submitted), soonest deadline first. */
create function public.my_exam_deadlines()
returns table (exam_id uuid, title text, course_id uuid, course_title text, course_code text, opens_at timestamptz, closes_at timestamptz, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.id, x.title, c.id, c.title, c.course_code, x.opens_at, private.exam_close_for(x.id, me.id),
         case when now() < x.opens_at then 'UPCOMING' when cur.status = 'IN_PROGRESS' then 'IN_PROGRESS' else 'OPEN' end
    from (select (select auth.uid()) as id) me
    join public.course_enrollments e on e.learner_id = me.id and e.enrolment_status = 'ACTIVE'
    join public.courses c on c.id = e.course_id and c.status = 'PUBLISHED'
    join public.examinations x on x.course_id = c.id and x.publication_status = 'PUBLISHED' and x.archived_at is null
    left join lateral (select * from public.exam_attempts a where a.exam_id = x.id and a.learner_id = me.id order by a.attempt_number desc limit 1) cur on true
   where (select private.is_active_user())
     and now() < private.exam_close_for(x.id, me.id)
     and (cur.status is null or cur.status <> 'SUBMITTED')
   order by 7, 2;
$$;

/** Per examination of the courses the caller manages: scripts waiting for marking, and marked results waiting for release. */
create function public.exam_marking_queue()
returns table (exam_id uuid, title text, course_id uuid, course_title text, course_code text, to_mark integer, to_release integer)
language sql
stable
security definer
set search_path = ''
as $$
  select x.id, x.title, c.id, c.title, c.course_code,
         (select count(*)::int from public.exam_attempts a
           where a.exam_id = x.id and a.id = (private.exam_markable_attempt(x.id, a.learner_id)).id
             and (select s.unmarked from private.exam_attempt_scores(a.id) s) > 0
             and (a.status = 'SUBMITTED' or exists (select 1 from public.exam_answers w where w.attempt_id = a.id))),
         (select count(*)::int from private.exam_releasable(x.id))
    from public.examinations x
    join public.courses c on c.id = x.course_id and c.status <> 'ARCHIVED'
   where x.archived_at is null and x.publication_status = 'PUBLISHED' and private.can_manage_course(c.id)
   order by c.title, x.closes_at;
$$;

revoke execute on function public.my_exam_deadlines(), public.exam_marking_queue() from public, anon;
grant execute on function public.my_exam_deadlines(), public.exam_marking_queue() to authenticated, service_role;
