-- Phase 13 (performance with the same rules): lesson progress is read by its learner and by the lesson's
-- managers (the course's lecturers and AAL2 administrators), exactly as before migration 52, now that the
-- managers' check is one set of lesson ids per query instead of a check per row.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(6);

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
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')), (tests.id('c1'), tests.uid('l2'), 'ACTIVE', tests.uid('a1')), (tests.id('c2'), tests.uid('l2'), 'ACTIVE', tests.uid('a1'));
insert into public.lessons (id, course_id, title, content, position, publication_status, created_by, published_at) values
  (tests.id('k1'), tests.id('c1'), 'Lesson one', '<p>x</p>', 1, 'PUBLISHED', tests.uid('t1'), now()),
  (tests.id('k2'), tests.id('c2'), 'Lesson two', '<p>x</p>', 1, 'PUBLISHED', tests.uid('t2'), now());
insert into public.lesson_progress (lesson_id, learner_id, completion_status, completed_at) values
  (tests.id('k1'), tests.uid('l1'), 'COMPLETED', now()), (tests.id('k1'), tests.uid('l2'), 'COMPLETED', now()), (tests.id('k2'), tests.uid('l2'), 'COMPLETED', now());

select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.lesson_progress where lesson_id in (tests.id('k1'), tests.id('k2'))), 1, 'a learner reads only their own progress');
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.lesson_progress where lesson_id in (tests.id('k1'), tests.id('k2'))), 2, 'a lecturer reads the progress on their course''s lessons');
select is((select count(*)::int from public.lesson_progress where lesson_id = tests.id('k2')), 0, 'but not on another course''s');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is((select count(*)::int from public.lesson_progress where lesson_id in (tests.id('k1'), tests.id('k2'))), 3, 'an administrator with two-step verification reads all of it');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'));
select is((select count(*)::int from public.lesson_progress where lesson_id in (tests.id('k1'), tests.id('k2'))), 0, 'an administrator without it reads none');
select tests.reset();
select is((select count(*)::int from pg_policies where tablename = 'lesson_progress' and qual ~ 'can_manage_lesson\(lesson_progress\.lesson_id\)'), 0,
  'the managers'' policy no longer runs a check per row');

select * from finish();
rollback;
