-- Phase 15 (D45), migration 55: one round trip per learner screen.
-- Each function returns, as one JSON value, exactly what the screen used to fetch with 4 to 8 separate calls:
--   get_lesson_page(course, lesson)  the lesson, its course (from the address, as the screen did), the course's lessons, the lesson's audio and
--                                    attachments, the learner's progress in the course and their enrolment;
--   get_course_page(course)          the course, its teachers, the enrolment, lessons, progress, the course's
--                                    assignments (as list_my_assignments), examinations and the course grade;
--   get_assignment_page(course, a.)  the assignment, its course (from the address), its instruction audio, the learner's answer
--                                    and their grade;
--   list_my_assignments(course?)     the learner's assignments with their extension, sent answer and released
--                                    grade (all courses, or one).
-- They are SECURITY INVOKER: every row comes through the same RLS policies and the same SECURITY DEFINER read
-- functions (lesson_media, course_teachers, my_exams, calculate_course_grades, assignment_media, my_submission,
-- my_grade, my_grades) the separate calls used, so nobody can see anything they could not see before. pgTAP 44
-- proves each part equals the separate reads for every role.
-- The columns are the ones the screens selected (src/lib/courses, lessons, assignments).

/** The course columns a screen reads (courses.js DETAIL). */
create function private.course_detail_json(p_course uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(c) from (
    select id, title, course_code, description, learning_objectives, category, status, return_reason, cover_image_file_id,
           published_at, archived_at, updated_at
      from public.courses where id = p_course) c
$$;

/** The signed-in learner's progress in a course: lesson id -> completed (lessons.js fetchMyProgress). */
create function private.my_progress_json(p_course uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(p.lesson_id, p.completion_status = 'COMPLETED'), '{}'::jsonb)
    from public.lesson_progress p join public.lessons l on l.id = p.lesson_id
   where l.course_id = p_course
$$;

/** The course's lessons in order (lessons.js fetchLessons, without audio counts). */
create function private.course_lessons_json(p_course uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'position', l.position,
                                               'publication_status', l.publication_status, 'updated_at', l.updated_at, 'audio_count', 0)
                            order by l.position), '[]'::jsonb)
    from public.lessons l where l.course_id = p_course
$$;

create function public.list_my_assignments(p_course uuid default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with released as (
    select g.assignment_id, to_jsonb(g) as grade from public.my_grades() g where g.state = 'RELEASED'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'course_id', a.course_id, 'title', a.title, 'content_type', a.content_type, 'due_at', a.due_at,
           'allow_late', a.allow_late,
           'course', (select jsonb_build_object('title', c.title, 'course_code', c.course_code) from public.courses c where c.id = a.course_id),
           'category', (select jsonb_build_object('part', g.part) from public.grade_categories g where g.id = a.category_id),
           'extended_to', (select x.extended_due_at from public.submission_extensions x where x.assignment_id = a.id limit 1),
           'submission', (select jsonb_build_object('status', s.status, 'current_version', s.current_version, 'is_late', s.is_late)
                            from public.submissions s where s.assignment_id = a.id and s.status <> 'DRAFT' limit 1),
           'grade', (select r.grade from released r where r.assignment_id = a.id))
         order by a.due_at), '[]'::jsonb)
    from public.assignments a
   where p_course is null or a.course_id = p_course
$$;

create function public.get_lesson_page(p_course uuid, p_lesson uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
           'lesson', (select to_jsonb(l) from (select id, course_id, title, content, position, publication_status, published_at, updated_at
                                                  from public.lessons where id = p_lesson) l),
           'course', private.course_detail_json(p_course),
           'lessons', private.course_lessons_json(p_course),
           'media', coalesce((select jsonb_agg(to_jsonb(m) - 'ordinality' order by m.ordinality)
                                from public.lesson_media(p_lesson) with ordinality m), '[]'::jsonb),
           'progress', private.my_progress_json(p_course),
           'enrolment', (select e.enrolment_status from public.course_enrollments e where e.course_id = p_course and e.enrolment_status in ('ACTIVE', 'COMPLETED') limit 1))
$$;

create function public.get_course_page(p_course uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
           'course', private.course_detail_json(p_course),
           'teachers', coalesce((select jsonb_agg(to_jsonb(t) - 'ordinality' order by t.ordinality)
                                   from public.course_teachers(p_course) with ordinality t), '[]'::jsonb),
           'enrolment', (select e.enrolment_status from public.course_enrollments e where e.course_id = p_course and e.enrolment_status in ('ACTIVE', 'COMPLETED') limit 1),
           'lessons', private.course_lessons_json(p_course),
           'progress', private.my_progress_json(p_course),
           'assignments', public.list_my_assignments(p_course),
           'exams', coalesce((select jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality)
                                from public.my_exams(p_course) with ordinality x), '[]'::jsonb),
           'grade', (select to_jsonb(g) from public.calculate_course_grades(p_course) g limit 1))
$$;

create function public.get_assignment_page(p_course uuid, p_assignment uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
           'assignment', (select to_jsonb(a) from (
                            select id, course_id, lesson_id, category_id, title, description, content_type, text_instructions, instruction_audio_file_id,
                                   due_at, allow_late, max_marks, accepted_formats, grading_criteria, publication_status, published_at, archived_at
                              from public.assignments where id = p_assignment) a),
           'course', private.course_detail_json(p_course),
           'audio', (select to_jsonb(m) from public.assignment_media(p_assignment) m limit 1),
           'mine', public.my_submission(p_assignment),
           'grade', public.my_grade(p_assignment))
$$;

revoke execute on function private.course_detail_json(uuid), private.my_progress_json(uuid), private.course_lessons_json(uuid) from public, anon;
grant execute on function private.course_detail_json(uuid), private.my_progress_json(uuid), private.course_lessons_json(uuid) to authenticated;
revoke execute on function public.list_my_assignments(uuid), public.get_lesson_page(uuid, uuid), public.get_course_page(uuid), public.get_assignment_page(uuid, uuid) from public, anon;
grant execute on function public.list_my_assignments(uuid), public.get_lesson_page(uuid, uuid), public.get_course_page(uuid), public.get_assignment_page(uuid, uuid) to authenticated;
