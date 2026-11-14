-- Phase 15 (D45, migration 55): one call per learner screen, with the same access as the separate reads.
-- Each part of get_lesson_page, get_course_page, get_assignment_page and list_my_assignments must equal what the
-- separate reads return for the same person (they run as the caller: RLS and the existing read functions decide).
--   The enrolled learner sees the published lesson, never the draft; a learner not enrolled and another course's
--   lecturer see nothing; the course's lecturer sees drafts; an administrator sees it only with two-step
--   verification. Anonymous callers cannot run them.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(27);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Church History', 'HIS101', tests.uid('t2'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')), (tests.id('c2'), tests.uid('t2'), 'OWNER', tests.uid('t2'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1'));
insert into public.lessons (id, course_id, title, content, position, publication_status, published_at, created_by) values
  (tests.id('L1'), tests.id('c1'), 'Genesis', '<p>In the beginning</p>', 1, 'PUBLISHED', now(), tests.uid('t1')),
  (tests.id('L2'), tests.id('c1'), 'Exodus (draft)', '<p>Draft</p>', 2, 'DRAFT', null, tests.uid('t1'));
insert into public.lesson_progress (lesson_id, learner_id, completion_status, completed_at) values (tests.id('L1'), tests.uid('l1'), 'COMPLETED', now());
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at)
select tests.id('A1'), tests.id('c1'), g.id, 'Reflection', 'TEXT', '<p>x</p>', now() + interval '7 days', 20, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now()
  from public.grade_categories g where g.course_id = tests.id('c1') and g.part = 'ASSIGNMENTS' and g.archived_at is null;
insert into public.submission_extensions (assignment_id, learner_id, extended_due_at, granted_by, reason)
values (tests.id('A1'), tests.uid('l1'), now() + interval '9 days', tests.uid('t1'), 'Travel');
insert into public.submissions (id, assignment_id, learner_id, status, current_version) values (tests.id('s1'), tests.id('A1'), tests.uid('l1'), 'SUBMITTED', 1);
insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id) values (tests.id('s1'), 1, 'Mine.', false, gen_random_uuid());

/** The separate reads the screens used to make, as the current user, for comparison. */
create function tests.lesson_row(p uuid) returns jsonb language sql stable as $$
  select to_jsonb(l) from (select id, course_id, title, content, position, publication_status, published_at, updated_at from public.lessons where id = p) l
$$;
create function tests.media(p uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(m) - 'ordinality' order by m.ordinality), '[]'::jsonb) from public.lesson_media(p) with ordinality m
$$;
create function tests.course_row(p uuid) returns jsonb language sql stable as $$
  select to_jsonb(c) from (select id, title, course_code, description, learning_objectives, category, status, return_reason, cover_image_file_id,
                                  published_at, archived_at, updated_at from public.courses where id = p) c
$$;
grant execute on function tests.lesson_row(uuid), tests.media(uuid), tests.course_row(uuid) to authenticated;

-- ---------------------------------------------------------------- the enrolled learner
select tests.authenticate_as(tests.uid('l1'));
select is(public.get_lesson_page(tests.id('c1'), tests.id('L1')) -> 'lesson', tests.lesson_row(tests.id('L1')), 'learner: the lesson part equals the lesson read');
select is(public.get_lesson_page(tests.id('c1'), tests.id('L1')) -> 'media', tests.media(tests.id('L1')), 'learner: the media part equals lesson_media');
select is(jsonb_array_length(public.get_lesson_page(tests.id('c1'), tests.id('L1')) -> 'lessons'), 1, 'learner: the lesson list leaves out the draft');
select is(public.get_lesson_page(tests.id('c1'), tests.id('L1')) -> 'progress', jsonb_build_object(tests.id('L1')::text, true), 'learner: their own progress');
select is(public.get_lesson_page(tests.id('c1'), tests.id('L1')) ->> 'enrolment', 'ACTIVE', 'learner: their enrolment');
select is(public.get_lesson_page(tests.id('c1'), tests.id('L2')) ->> 'lesson', null, 'learner: a draft lesson is not returned');
select is(public.list_my_assignments() -> 0 ->> 'id', tests.id('A1')::text, 'learner: their assignment is listed');
select is((public.list_my_assignments() -> 0 ->> 'extended_to')::timestamptz,
          (select extended_due_at from public.submission_extensions where assignment_id = tests.id('A1')), 'learner: with their own extension');
select is(public.list_my_assignments() -> 0 -> 'submission' ->> 'status', 'SUBMITTED', 'learner: with their sent answer');
select is(public.get_assignment_page(tests.id('c1'), tests.id('A1')) -> 'mine', coalesce(public.my_submission(tests.id('A1')), 'null'::jsonb), 'learner: the answer part equals my_submission');
select is(public.get_assignment_page(tests.id('c1'), tests.id('A1')) -> 'grade', coalesce(public.my_grade(tests.id('A1')), 'null'::jsonb), 'learner: the grade part equals my_grade');
select is(public.get_course_page(tests.id('c1')) -> 'assignments', public.list_my_assignments(tests.id('c1')), 'learner: the course page lists the course''s assignments');
select is(public.get_course_page(tests.id('c1')) -> 'grade' ->> 'learner_id', tests.uid('l1')::text, 'learner: the course grade is their own');
select is(jsonb_array_length(public.get_course_page(tests.id('c1')) -> 'teachers'), (select count(*)::int from public.course_teachers(tests.id('c1'))), 'learner: the teachers part equals course_teachers');

-- ---------------------------------------------------------------- people who may not see it
select tests.reset(); select tests.authenticate_as(tests.uid('l2'));
select is(public.get_lesson_page(tests.id('c1'), tests.id('L1')) ->> 'lesson', null, 'a learner not enrolled gets no lesson');
select is(public.list_my_assignments(), '[]'::jsonb, 'a learner not enrolled has no assignments');
select is(public.get_assignment_page(tests.id('c1'), tests.id('A1')) ->> 'assignment', null, 'a learner not enrolled gets no assignment');
select is(public.get_course_page(tests.id('c1')) -> 'course', coalesce(tests.course_row(tests.id('c1')), 'null'::jsonb),
          'a learner not enrolled sees the course part exactly as the course read allows');
select tests.reset(); select tests.authenticate_as(tests.uid('t2'));
select is(public.get_lesson_page(tests.id('c1'), tests.id('L1')) ->> 'lesson', null, 'another course''s lecturer gets no lesson');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'));
select is(public.get_lesson_page(tests.id('c1'), tests.id('L1')) ->> 'lesson', null, 'an administrator without two-step verification gets no lesson');

-- ---------------------------------------------------------------- people who manage the course
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select is(public.get_lesson_page(tests.id('c1'), tests.id('L2')) -> 'lesson', tests.lesson_row(tests.id('L2')), 'the course''s lecturer sees the draft');
select is(jsonb_array_length(public.get_lesson_page(tests.id('c1'), tests.id('L1')) -> 'lessons'), 2, 'and every lesson in the list');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
select isnt(public.get_lesson_page(tests.id('c1'), tests.id('L1')) ->> 'lesson', null, 'an administrator with two-step verification sees the lesson');
select tests.reset();

-- ---------------------------------------------------------------- how they run
select is((select count(*)::int from pg_proc where proname in ('get_lesson_page', 'get_course_page', 'get_assignment_page', 'list_my_assignments') and prosecdef), 0,
          'every page read runs with the caller''s rights (security invoker)');
select is((select count(*)::int from pg_proc where proname in ('get_lesson_page', 'get_course_page', 'get_assignment_page', 'list_my_assignments')), 4, 'all four exist');
select ok(not has_function_privilege('anon', 'public.get_lesson_page(uuid, uuid)', 'execute') and not has_function_privilege('anon', 'public.get_course_page(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.get_assignment_page(uuid, uuid)', 'execute') and not has_function_privilege('anon', 'public.list_my_assignments(uuid)', 'execute'),
          'signed-out visitors cannot run them');
select ok(has_function_privilege('authenticated', 'public.get_lesson_page(uuid, uuid)', 'execute'), 'signed-in users can');

select * from finish();
rollback;
