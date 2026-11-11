-- Step 11.1 (owner answers of 2026-11-06, plan approved 2026-11-11, ADR-020): live presence.
-- - One private Realtime channel per course, presence:course:{id}. Only the course's active learners and
--   its lecturers may join it (read and track); never administrators, never anyone else.
-- - presence_my_courses lists the channels a person may join; administrators get none.
-- - presence_people turns announced user ids into names for course-mates only: learners and co-lecturers of
--   shared courses; administrators, strangers and inactive accounts are never returned, and nothing
--   private (email, ID number) is.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(19);

select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Esi', 'Owusu')::text, true);
select set_config('t.l4', tests.create_user('l4@example.test', 'Yaw', 'Darko')::text, true);
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;
/** Sets the channel Realtime is authorising, as Realtime does. */
create function tests.topic(p_course text) returns void language sql as $$ select set_config('realtime.topic', 'presence:course:' || tests.id(p_course), true) $$;
grant execute on function tests.topic(text) to authenticated;

-- c1: Ama teaches; Kwame and Abena active; Esi withdrawn. c2: Grace teaches; Yaw active.
insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Church History', 'HIS101', tests.uid('t2'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')), (tests.id('c2'), tests.uid('t2'), 'OWNER', tests.uid('t2'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')), (tests.id('c1'), tests.uid('l2'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c1'), tests.uid('l3'), 'WITHDRAWN', tests.uid('a1')), (tests.id('c2'), tests.uid('l4'), 'ACTIVE', tests.uid('a1'));
-- A presence message in each course channel, as Realtime would keep it.
insert into realtime.messages (topic, extension, payload, event, private)
select 'presence:course:' || tests.id(c), 'presence', '{}'::jsonb, 'presence', true from unnest(array['c1', 'c2']) c;

-- ---------------------------------------------------------------- joining a course channel
select tests.authenticate_as(tests.uid('l1')); select tests.topic('c1');
select is((select count(*)::int from realtime.messages where extension = 'presence'), 1, 'an active learner may listen on their course''s channel');
select lives_ok($$ insert into realtime.messages (topic, extension, payload, event, private)
                   values ('presence:course:' || tests.id('c1'), 'presence', '{}', 'presence', true) $$, 'and announce themselves on it');
select tests.topic('c2');
select is((select count(*)::int from realtime.messages where extension = 'presence'), 0, 'but not on another course''s channel');
select throws_ok($$ insert into realtime.messages (topic, extension, payload, event, private)
                    values ('presence:course:' || tests.id('c2'), 'presence', '{}', 'presence', true) $$, '42501', null, 'nor announce themselves there');
select tests.reset(); select tests.authenticate_as(tests.uid('l3')); select tests.topic('c1');
select is((select count(*)::int from realtime.messages where extension = 'presence'), 0, 'a withdrawn learner may not listen');
select tests.reset(); select tests.authenticate_as(tests.uid('t1')); select tests.topic('c1');
select is((select count(*)::int from realtime.messages where extension = 'presence'), 2, 'the course''s lecturer may listen (and hears Kwame)');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2'); select tests.topic('c1');
select is((select count(*)::int from realtime.messages where extension = 'presence'), 0, 'an administrator may never listen');
select throws_ok($$ insert into realtime.messages (topic, extension, payload, event, private)
                    values ('presence:course:' || tests.id('c1'), 'presence', '{}', 'presence', true) $$, '42501', null, 'or be announced');

-- ---------------------------------------------------------------- the channels a person may join
select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select * from public.presence_my_courses() $$, $$ values (tests.id('c1')) $$, 'Kwame may join his course''s channel only');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is((select count(*)::int from public.presence_my_courses()), 0, 'an administrator has no channel');

-- ---------------------------------------------------------------- names for course-mates only
create temporary table everyone as select array[tests.uid('t1'), tests.uid('t2'), tests.uid('l1'), tests.uid('l2'), tests.uid('l3'), tests.uid('l4'), tests.uid('a1')] as ids;
grant select on everyone to authenticated;
select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select first_name, role::text from public.presence_people((select ids from everyone)) order by role, first_name $$,
  $$ values ('Abena'::text, 'LEARNER'::text), ('Ama', 'LECTURER') $$,
  'Kwame sees Abena and his lecturer: not himself, not Esi (withdrawn), not another course, never the administrator');
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select first_name from public.presence_people((select ids from everyone)) order by first_name $$,
  $$ values ('Abena'::text), ('Kwame') $$, 'Ama sees her learners, not Grace (no shared course)');
select tests.reset();
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values (tests.id('c1'), tests.uid('t2'), 'CO_LECTURER', tests.uid('t1'));
select tests.authenticate_as(tests.uid('t1'));
select ok('Grace' in (select first_name from public.presence_people((select ids from everyone))), 'a co-lecturer of a shared course is shown');
select tests.reset(); select tests.authenticate_as(tests.uid('l4'));
select results_eq($$ select first_name from public.presence_people((select ids from everyone)) $$,
  $$ values ('Grace'::text) $$, 'Yaw sees only his own course''s lecturer');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is((select count(*)::int from public.presence_people((select ids from everyone))), 0, 'an administrator sees nobody');
select tests.reset();
update public.profiles set account_status = 'SUSPENDED' where id = tests.uid('l2');
select tests.authenticate_as(tests.uid('l1'));
select ok('Abena' not in (select first_name from public.presence_people((select ids from everyone))), 'a suspended account is never shown');
select tests.reset();
select is((select count(*)::int from unnest((select proargnames from pg_proc where proname = 'presence_people')) n
            where n in ('email', 'id_number')), 0, 'nothing private is returned (no email, no ID number)');
select tests.as_anon();
select throws_ok($$ select * from public.presence_people(array[gen_random_uuid()]) $$, '42501', null, 'signed-out visitors cannot ask');
select tests.reset();
select ok(exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname like 'presence_%'),
  'the channel rules live in the database (Realtime authorisation)');

select * from finish();
rollback;
