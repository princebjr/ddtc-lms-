-- Step 6.1, ADR-008 (owner decision 2026-11-06): every account has a unique six-digit ID number.
-- Assigned by the database for every role, 100000 to 999999, never repeated (a one-to-one shuffle),
-- not in joining order, never changed by anyone, and seen only by the person, administrators, and
-- the lecturers of the learner's courses (course_roster).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(28);

-- ---------------------------------------------------------------- people and a course
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Yaw', 'Darko')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;
-- Each person's number, read now (as the test owner) for comparisons made later as other roles.
select set_config('t.n_' || p, (select id_number::text from public.profiles where id = tests.uid(p)), true)
  from unnest(array['a1', 't1', 't2', 'l1', 'l2', 'l3']) p;
create function tests.num(p text) returns integer language sql stable as $$ select current_setting('t.n_' || p)::integer $$;
grant execute on function tests.num(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  ('00000000-0000-4000-8000-0000000000c1', 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  ('00000000-0000-4000-8000-0000000000c1', tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  ('00000000-0000-4000-8000-0000000000c1', tests.uid('l1'), 'ACTIVE', tests.uid('a1'));

-- ---------------------------------------------------------------- the column
select has_column('public', 'profiles', 'id_number', 'profiles.id_number exists');
select col_type_is('public', 'profiles', 'id_number', 'integer', 'it is a whole number');
select col_not_null('public', 'profiles', 'id_number', 'every account has one');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'u' and pg_get_constraintdef(oid) = 'UNIQUE (id_number)'),
  'no two accounts can share a number');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'c'
                   and pg_get_constraintdef(oid) like '%id_number >= 100000%' and pg_get_constraintdef(oid) like '%id_number <= 999999%'),
  'the table only accepts six-digit numbers from 100000 to 999999');

-- ---------------------------------------------------------------- every role gets one, automatically
select ok((select bool_and(id_number between 100000 and 999999) from public.profiles
            where id in (tests.uid('a1'), tests.uid('t1'), tests.uid('t2'), tests.uid('l1'), tests.uid('l2'), tests.uid('l3'))),
  'new administrators, lecturers and learners each get a number from 100000 to 999999');
select is((select count(distinct id_number)::int from public.profiles
            where id in (tests.uid('a1'), tests.uid('t1'), tests.uid('t2'), tests.uid('l1'), tests.uid('l2'), tests.uid('l3'))), 6,
  'all six are different');
select is((select count(*)::int from public.profiles where id_number is null), 0, 'no account is without a number (existing accounts got one too)');
select ok((select count(*) = count(distinct id_number) from public.profiles), 'no number is used twice anywhere');
select ok(abs(tests.num('l2') - tests.num('l1')) > 1000, 'accounts created one after another do not get neighbouring numbers (the joining order is not revealed)');

-- ---------------------------------------------------------------- the shuffle never repeats
select is((select count(distinct private.id_number_for(n))::int from generate_series(1, 900000) n), 900000,
  '900,000 accounts get 900,000 different numbers');
select results_eq($$ select min(private.id_number_for(n)), max(private.id_number_for(n)) from generate_series(1, 900000) n $$,
  $$ values (100000, 999999) $$, 'from 100000 to 999999, every one used once');
select throws_ok($$ select private.id_number_for(900001) $$, 'P0413', NULL, 'after 900,000 accounts it refuses rather than repeat a number');
select is(has_function_privilege('authenticated', 'private.id_number_for(bigint)', 'execute'), false, 'clients cannot call the numbering');

-- ---------------------------------------------------------------- nobody changes a number
select throws_ok($$ update public.profiles set id_number = 123456 where id = tests.uid('l2') $$, '42501', NULL,
  'not even the database owner can change a number');
select tests.as_service();
select throws_ok($$ update public.profiles set id_number = 123456 where id = tests.uid('l2') $$, '42501', NULL,
  'nor the server (service role)');
select tests.reset();
select tests.authenticate_as(tests.uid('l1'));
select throws_ok($$ update public.profiles set id_number = 123456 where id = tests.uid('l1') $$, '42501', NULL,
  'a person cannot change their own number');
select lives_ok($$ update public.profiles set contact_number = '+233200000000' where id = tests.uid('l1') $$,
  'and can still edit their own details');
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select throws_ok($$ update public.profiles set id_number = 123456 where id = tests.uid('l1') $$, '42501', NULL,
  'an administrator cannot change anyone''s number');
select tests.reset();
select is((select id_number from public.profiles where id = tests.uid('l1')), tests.num('l1'), 'the number is unchanged after all that');

-- ---------------------------------------------------------------- who sees numbers
select tests.authenticate_as(tests.uid('l1'));
select is((select id_number from public.profiles where id = tests.uid('l1')), tests.num('l1'), 'a person sees their own number');
select is((select count(*)::int from public.profiles where id = tests.uid('l2')), 0, 'a learner cannot see another learner''s number');
select throws_ok($$ select * from public.course_roster('00000000-0000-4000-8000-0000000000c1') $$, '42501', NULL,
  'a learner cannot read a course roster');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select learner_id, id_number from public.course_roster('00000000-0000-4000-8000-0000000000c1') $$,
  $$ values (tests.uid('l1'), tests.num('l1')) $$, 'the course''s lecturer sees the ID numbers of its learners');
select is((select count(*)::int from public.profiles where id = tests.uid('l1')), 0, 'but not the learner''s profile (email and phone stay private)');
select tests.reset();
select tests.authenticate_as(tests.uid('t2'));
select throws_ok($$ select * from public.course_roster('00000000-0000-4000-8000-0000000000c1') $$, '42501', NULL,
  'a lecturer who does not teach the course sees no numbers');
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is((select count(id_number)::int from public.profiles
            where id in (tests.uid('a1'), tests.uid('t1'), tests.uid('t2'), tests.uid('l1'), tests.uid('l2'), tests.uid('l3'))), 6,
  'an administrator sees everyone''s number');
select tests.reset();
select tests.as_anon();
select throws_ok($$ select id_number from public.profiles $$, '42501', NULL, 'a visitor sees nothing');
select tests.reset();

select * from finish();
rollback;
