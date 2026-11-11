-- Phase 11, migration 40 (BUILD_PLAN Phase 11, ADR-019): the dashboards' summaries, one call each.
--   * admin_dashboard (AAL2 administrators): answers sent in the last 7 days, the grading backlog
--     (answers and examination scripts waiting for marks), grade releases in the last 7 days, the latest
--     releases, and the latest administrative and security events from the audit log.
--   * lecturer_dashboard (the signed-in lecturer's courses): deadlines in the next 14 days with how many
--     have sent their work, and each published course's learners, graded learners and average released
--     course grade (course_grade_summary, the one formula).
--   * learner_dashboard (the signed-in learner): answers sent, missing work, what is due next, recently
--     released grades and lesson progress per course. Released grades only (D16).
-- Lists are short (at most 8 rows) so each dashboard stays one screen.

create function public.admin_dashboard() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only administrators see this dashboard' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'answers_sent_7d', (select count(*) from public.submission_versions v where v.submitted_at >= now() - interval '7 days'),
    'grading_backlog', (select count(*) from public.submissions s join public.assignments a on a.id = s.assignment_id
                          where s.status in ('SUBMITTED', 'REOPENED') and a.archived_at is null)
                       + (select count(*) from public.exam_attempts t where t.status = 'SUBMITTED'
                            and exists (select 1 from public.exam_answers w where w.attempt_id = t.id and w.score is null)),
    'releases_7d', (select count(*) from public.audit_logs l where l.action in ('grade.released', 'grades.released_course', 'exam.released')
                      and l.created_at >= now() - interval '7 days'),
    'recent_releases', coalesce((
      select jsonb_agg(r order by r.at desc) from (
        select l.created_at as at, l.action, c.title as course_title, c.id as course_id,
               p.first_name || ' ' || p.second_name as actor_name
          from public.audit_logs l
          left join public.profiles p on p.id = l.actor_id
          left join public.assignments a on l.entity_type = 'assignment' and a.id::text = l.entity_id
          left join public.examinations x on l.entity_type in ('examination', 'exam') and x.id::text = l.entity_id
          left join public.courses c on c.id = coalesce(a.course_id, x.course_id, case when l.entity_type = 'course' then l.entity_id::uuid end)
         where l.action in ('grade.released', 'grades.released_course', 'exam.released')
         order by l.created_at desc limit 5) r), '[]'::jsonb),
    'recent_events', coalesce((
      select jsonb_agg(r order by r.at desc) from (
        select l.created_at as at, l.action, l.entity_type, case when p.id is null then 'System' else p.first_name || ' ' || p.second_name end as actor_name
          from public.audit_logs l left join public.profiles p on p.id = l.actor_id
         where l.action like 'admin.%' or l.action like 'profile.%' or l.action like 'setting.%' or l.action = 'audit_log.exported'
            or l.action in ('course.returned', 'course.archived', 'course.unarchived', 'grade_categories.standard_parts_applied')
         order by l.created_at desc limit 8) r), '[]'::jsonb)
  );
end;
$$;

create function public.lecturer_dashboard() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not private.is_active_lecturer() then
    raise exception 'Only lecturers see this dashboard' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'upcoming', coalesce((
      select jsonb_agg(u order by u.due) from (
        select * from (
          select 'ASSIGNMENT' as kind, a.id, a.title, c.id as course_id, c.title as course_title, a.due_at as due,
                 (select count(*) from public.submissions s where s.assignment_id = a.id and s.status <> 'DRAFT') as sent,
                 (select count(*) from public.course_enrollments e where e.course_id = c.id and e.enrolment_status = 'ACTIVE') as learners
            from public.assignments a join public.courses c on c.id = a.course_id
            join public.grade_categories g on g.id = a.category_id and g.part <> 'PRACTICALS'
           where a.publication_status = 'PUBLISHED' and a.archived_at is null and c.status = 'PUBLISHED'
             and a.due_at > now() and a.due_at <= now() + interval '14 days' and private.is_lecturer_of(c.id)
          union all
          select 'EXAMINATION', x.id, x.title, c.id, c.title, coalesce(x.closed_at, x.closes_at),
                 (select count(distinct t.learner_id) from public.exam_attempts t where t.exam_id = x.id and t.status = 'SUBMITTED'),
                 (select count(*) from public.course_enrollments e where e.course_id = c.id and e.enrolment_status = 'ACTIVE')
            from public.examinations x join public.courses c on c.id = x.course_id
           where x.publication_status = 'PUBLISHED' and x.archived_at is null and c.status = 'PUBLISHED'
             and coalesce(x.closed_at, x.closes_at) > now() and coalesce(x.closed_at, x.closes_at) <= now() + interval '14 days'
             and private.is_lecturer_of(c.id)
        ) all_items order by due limit 8) u), '[]'::jsonb),
    'performance', coalesce((
      select jsonb_agg(p order by p.course_title) from (
        select c.id as course_id, c.title as course_title, c.course_code,
               (select count(*) from public.course_enrollments e where e.course_id = c.id and e.enrolment_status <> 'WITHDRAWN') as learners,
               count(s.overall) as graded, round(avg(s.overall), 1) as average
          from public.courses c
          join public.course_lecturers l on l.course_id = c.id and l.lecturer_id = v_me and l.removed_at is null
          left join lateral private.course_grade_summary(c.id, false) s on true
         where c.status = 'PUBLISHED'
         group by c.id, c.title, c.course_code
         order by c.title limit 8) p), '[]'::jsonb)
  );
end;
$$;

create function public.learner_dashboard() returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not private.is_active_user() then
    raise exception 'Sign in again' using errcode = '42501';
  end if;
  create temporary table if not exists pg_temp.my_work (id uuid, title text, course_id uuid, course_title text, due timestamptz, sent boolean) on commit drop;
  truncate pg_temp.my_work;
  insert into pg_temp.my_work
    select a.id, a.title, c.id as course_id, c.title as course_title, private.effective_due_at(a.id, v_me) as due,
           exists (select 1 from public.submissions s where s.assignment_id = a.id and s.learner_id = v_me and s.status <> 'DRAFT') as sent
      from public.assignments a
      join public.courses c on c.id = a.course_id and c.status = 'PUBLISHED'
      join public.course_enrollments e on e.course_id = c.id and e.learner_id = v_me and e.enrolment_status = 'ACTIVE'
      join public.grade_categories g on g.id = a.category_id and g.part <> 'PRACTICALS'
     where a.publication_status = 'PUBLISHED' and a.archived_at is null;
  return jsonb_build_object(
    'sent', (select count(*) from pg_temp.my_work w where w.sent),
    'missing', (select count(*) from pg_temp.my_work w where not w.sent and w.due <= now()),
    'due_next', coalesce((select jsonb_agg(w order by w.due) from (
        select w.id, w.title, w.course_id, w.course_title, w.due from pg_temp.my_work w where not w.sent and w.due > now() order by w.due limit 5) w), '[]'::jsonb),
    'recent_grades', coalesce((select jsonb_agg(g order by g.released_at desc) from (
        select a.id, a.title, c.id as course_id, c.title as course_title, s.released_score as score, a.max_marks, s.released_at,
               round(s.released_score * 100 / nullif(a.max_marks, 0), 1) as percentage
          from public.submissions s join public.assignments a on a.id = s.assignment_id join public.courses c on c.id = a.course_id
         where s.learner_id = v_me and s.released_at is not null
         order by s.released_at desc limit 5) g), '[]'::jsonb),
    'progress', coalesce((select jsonb_agg(p order by p.course_title) from (
        select c.id as course_id, c.title as course_title,
               (select count(*) from public.lessons s where s.course_id = c.id and s.publication_status = 'PUBLISHED') as lessons,
               (select count(*) from public.lesson_progress g join public.lessons s on s.id = g.lesson_id
                 where s.course_id = c.id and s.publication_status = 'PUBLISHED' and g.learner_id = v_me and g.completion_status = 'COMPLETED') as completed
          from public.course_enrollments e join public.courses c on c.id = e.course_id and c.status = 'PUBLISHED'
         where e.learner_id = v_me and e.enrolment_status = 'ACTIVE'
         order by c.title limit 8) p), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_dashboard(), public.lecturer_dashboard(), public.learner_dashboard() from public, anon;
grant execute on function public.admin_dashboard(), public.lecturer_dashboard(), public.learner_dashboard() to authenticated;
