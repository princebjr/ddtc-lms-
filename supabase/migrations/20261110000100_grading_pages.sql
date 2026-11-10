-- Step 9.1, migration 30: the reads behind the lecturer's "To grade" and the learner's "Grades and
-- feedback" (navigation pages promised for Phase 9). Both are read-only and security definer with the
-- checks inside: grading_queue() for the courses the caller manages (private.can_manage_course: the
-- course's active lecturers and AAL2 administrators), my_grades() for the signed-in learner's own
-- answers, released grades only (D16; owner decision 2 of 2026-11-09). Figures come from
-- private.grade_facts (D30).

/**
 * Work waiting in the courses the caller manages, oldest first: each answer sent or reopened and not
 * graded (UNGRADED), and each draft grade not yet released, including a released grade changed since
 * (DRAFT). Never an archived course (it is read-only). Nothing for anyone else.
 */
create function public.grading_queue()
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
   where s.current_version > 0
     and (s.status in ('SUBMITTED', 'REOPENED') or (s.status = 'GRADED' and s.grade_release_status = 'DRAFT'))
     and c.status <> 'ARCHIVED'
     and private.can_manage_course(c.id)
   order by 17 nulls last, c.title, a.title, p.first_name, p.second_name;
$$;

/**
 * The signed-in learner's answered assignments in courses they are enrolled in (active or completed),
 * course by course: RELEASED with the released score, percentage, letter grade, band, pass, feedback,
 * when it was released and whether it was updated since the first release; or AWAITING with no score
 * and no feedback (a draft never reaches the learner).
 */
create function public.my_grades()
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
     and s.current_version > 0
     and (select private.is_active_user())
     and exists (select 1 from public.course_enrollments e
                  where e.course_id = c.id and e.learner_id = s.learner_id and e.enrolment_status in ('ACTIVE', 'COMPLETED'))
   order by c.title, a.due_at, a.title;
$$;

revoke execute on function public.grading_queue(), public.my_grades() from public, anon;
grant execute on function public.grading_queue(), public.my_grades() to authenticated, service_role;
