-- Phase 11 (ADR-019): the dashboards' summaries show each person only what is theirs.
-- - learner_dashboard: the learner's own answers sent, missing work, what is due next, released grades
--   only, and lesson progress.
-- - lecturer_dashboard: only the lecturer's own courses; refused to learners.
-- - admin_dashboard: AAL2 administrators only; the grading backlog counts answers waiting for marks.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(12);

select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;
create function tests.part(p_course text) returns uuid language sql stable as $$
  select g.id from public.grade_categories g where g.course_id = tests.id(p_course) and g.part = 'ASSIGNMENTS' and g.archived_at is null
$$;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Church History', 'HIS101', tests.uid('t2'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')), (tests.id('c2'), tests.uid('t2'), 'OWNER', tests.uid('t2'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')), (tests.id('c1'), tests.uid('l2'), 'ACTIVE', tests.uid('a1'));
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at) values
  (tests.id('A1'), tests.id('c1'), tests.part('c1'), 'Reflection on Genesis 1', 'TEXT', '<p>Respond.</p>', now() + interval '3 days', 20, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now()),
  (tests.id('A2'), tests.id('c1'), tests.part('c1'), 'Covenant essay', 'TEXT', '<p>Write.</p>', now() - interval '1 day', 20, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now()),
  (tests.id('A3'), tests.id('c2'), tests.part('c2'), 'Reformation essay', 'TEXT', '<p>Write.</p>', now() + interval '2 days', 20, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t2'), now());
-- Kwame sent A1 (waiting for marks); Abena sent nothing. One lesson, Kwame completed it.
insert into public.submissions (assignment_id, learner_id, status, current_version) values (tests.id('A1'), tests.uid('l1'), 'SUBMITTED', 1);
insert into public.lessons (id, course_id, title, position, publication_status, created_by) values (tests.id('s1'), tests.id('c1'), 'Lesson 1', 1, 'PUBLISHED', tests.uid('t1'));
insert into public.lesson_progress (learner_id, lesson_id, completion_status, completed_at) values (tests.uid('l1'), tests.id('s1'), 'COMPLETED', now());

select tests.authenticate_as(tests.uid('l1'));
select is((public.learner_dashboard() ->> 'sent')::int, 1, 'Kwame: one answer sent');
select is((public.learner_dashboard() ->> 'missing')::int, 1, 'and one missing (the covenant essay is past due)');
select is(jsonb_array_length(public.learner_dashboard() -> 'due_next'), 0, 'nothing else due');
select is(public.learner_dashboard() -> 'progress' -> 0 ->> 'completed', '1', 'lesson progress: 1 of 1');
select is(jsonb_array_length(public.learner_dashboard() -> 'recent_grades'), 0, 'no grade shown before it is released');
select tests.reset(); select tests.authenticate_as(tests.uid('l2'));
select is(public.learner_dashboard() -> 'due_next' -> 0 ->> 'title', 'Reflection on Genesis 1', 'Abena sees what she has still to send');
select throws_ok($$ select public.lecturer_dashboard() $$, '42501', null, 'a learner cannot open the lecturer dashboard');
select throws_ok($$ select public.admin_dashboard() $$, '42501', null, 'or the administrator one');

select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select jsonb_array_elements(public.lecturer_dashboard() -> 'upcoming') ->> 'title' $$,
  $$ values ('Reflection on Genesis 1') $$, 'a lecturer sees deadlines in their own courses only');
select is(public.lecturer_dashboard() -> 'upcoming' -> 0 ->> 'sent', '1', 'with how many have sent their work');

select tests.reset(); select tests.authenticate_as(tests.uid('a1'));
select throws_ok($$ select public.admin_dashboard() $$, '42501', null, 'an administrator needs two-step verification');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
select ok((public.admin_dashboard() ->> 'grading_backlog')::int >= 1, 'the grading backlog counts answers waiting for marks');
select tests.reset();

select * from finish();
rollback;
