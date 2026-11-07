-- Phase 7, D42 (owner request 2026-11-07): learner branches. Six seeded branches; a learner sets or
-- changes only their own (single, optional, existing and active); administrators with a verified
-- (AAL2) session change any learner's branch and nothing else of theirs; lecturers read the branch
-- of learners in courses they teach, through course_roster, and of nobody else; learners never read
-- another learner's branch; every change is audited; a branch in use cannot be deleted.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(29);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Yaw', 'Darko')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
/** A branch by name. */
create function tests.branch(p text) returns uuid language sql stable security definer set search_path = '' as $$ select id from public.branches where name = p $$;
grant execute on function tests.uid(text), tests.branch(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  ('00000000-0000-4000-8000-0000000000c1', 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  ('00000000-0000-4000-8000-0000000000c2', 'Principles of Discipleship', 'DIS201', tests.uid('t2'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  ('00000000-0000-4000-8000-0000000000c1', tests.uid('t1'), 'OWNER', tests.uid('t1')),
  ('00000000-0000-4000-8000-0000000000c2', tests.uid('t2'), 'OWNER', tests.uid('t2'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  ('00000000-0000-4000-8000-0000000000c1', tests.uid('l1'), 'ACTIVE', tests.uid('a1')),
  ('00000000-0000-4000-8000-0000000000c1', tests.uid('l2'), 'ACTIVE', tests.uid('a1')),
  ('00000000-0000-4000-8000-0000000000c2', tests.uid('l3'), 'ACTIVE', tests.uid('a1'));
insert into public.branches (name, position, is_active) values ('Closed branch', 99, false);

-- ---------------------------------------------------------------- the branches
select has_table('public', 'branches', 'branches exists');
select results_eq($$ select name, position from public.branches where is_active order by position $$,
  $$ values ('Kasoa C.P', 1), ('Affumkrom - Nsawam', 2), ('Sampa', 3), ('Amanfrom', 4), ('Kumasi', 5), ('Atwitwiriso', 6) $$,
  'the six branches, spelled and ordered exactly as DDTC gave them');
select col_is_null('public', 'profiles', 'branch_id', 'a branch is optional');
select is((select confdeltype::text from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'f'
            and conkey = array[(select attnum from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'branch_id')]), 'r',
  'profiles.branch_id is ON DELETE RESTRICT');
update public.profiles set branch_id = tests.branch('Sampa') where id = tests.uid('l3');
select throws_ok($$ delete from public.branches where id = tests.branch('Sampa') $$, '23503', NULL, 'a branch in use cannot be deleted');
select is((select count(*)::int from unnest(array['anon', 'authenticated']) r where has_table_privilege(r, 'public.branches', 'delete') or has_table_privilege(r, 'public.branches', 'insert') or has_table_privilege(r, 'public.branches', 'update')), 0,
  'no client may add, change or delete branches');

-- ---------------------------------------------------------------- a learner and their own branch
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.branches where is_active), 6, 'a learner reads the list of branches');
select lives_ok($$ update public.profiles set branch_id = tests.branch('Kumasi') where id = tests.uid('l1') $$, 'a learner sets their branch');
select lives_ok($$ update public.profiles set branch_id = tests.branch('Kasoa C.P') where id = tests.uid('l1') $$, 'and changes it');
select is((select b.name from public.profiles p join public.branches b on b.id = p.branch_id where p.id = tests.uid('l1')), 'Kasoa C.P', 'the change is kept');
select throws_ok($$ update public.profiles set branch_id = tests.branch('Closed branch') where id = tests.uid('l1') $$, '22023', NULL, 'an inactive branch is refused');
select throws_ok($$ update public.profiles set branch_id = '00000000-0000-4000-8000-00000000dead' where id = tests.uid('l1') $$, '22023', NULL, 'an unknown branch is refused');
select lives_ok($$ update public.profiles set branch_id = null where id = tests.uid('l1') $$, 'a learner may leave it unset');
update public.profiles set branch_id = tests.branch('Kasoa C.P') where id = tests.uid('l1');
select is((select count(*)::int from public.profiles where id = tests.uid('l2')), 0, 'a learner cannot read another learner''s branch');
update public.profiles set branch_id = tests.branch('Kumasi') where id = tests.uid('l2');
select throws_ok($$ update public.profiles set role = 'ADMIN' where id = tests.uid('l1') $$, '42501', NULL, 'a learner cannot change their role');
select throws_ok($$ update public.profiles set account_status = 'SUSPENDED' where id = tests.uid('l1') $$, '42501', NULL, 'or their account status');
select tests.reset();
select is((select branch_id from public.profiles where id = tests.uid('l2')), null::uuid, 'and cannot set another learner''s branch');

-- ---------------------------------------------------------------- lecturers read, never write
select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select first_name, branch_name from public.course_roster('00000000-0000-4000-8000-0000000000c1') order by first_name $$,
  $$ values ('Abena', null::text), ('Kwame', 'Kasoa C.P') $$, 'a lecturer reads the branch of the learners in their course');
select is((select count(*)::int from public.profiles where id = tests.uid('l1')), 0, 'but not the learner''s profile itself');
update public.profiles set branch_id = tests.branch('Sampa') where id = tests.uid('l1');
select tests.reset();
select is((select b.name from public.profiles p join public.branches b on b.id = p.branch_id where p.id = tests.uid('l1')), 'Kasoa C.P', 'a lecturer cannot change a learner''s branch');
select tests.authenticate_as(tests.uid('t2'));
select throws_ok($$ select * from public.course_roster('00000000-0000-4000-8000-0000000000c1') $$, '42501', NULL, 'a lecturer of another course sees no branch of these learners');
select tests.reset();

-- ---------------------------------------------------------------- administrators
select tests.authenticate_as(tests.uid('a1'), 'aal1');
update public.profiles set branch_id = tests.branch('Amanfrom') where id = tests.uid('l2');
select tests.reset();
select is((select branch_id from public.profiles where id = tests.uid('l2')), null::uuid, 'an administrator without two-step verification (AAL1) cannot change a branch');
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select lives_ok($$ update public.profiles set branch_id = tests.branch('Amanfrom') where id = tests.uid('l2') $$, 'a verified administrator (AAL2) changes a learner''s branch');
select throws_ok($$ update public.profiles set first_name = 'Changed' where id = tests.uid('l2') $$, '42501', NULL, 'but nothing else of theirs');
select throws_ok($$ update public.profiles set branch_id = tests.branch('Kumasi') where id = tests.uid('t1') $$, '22023', NULL, 'only learners have a branch');
select tests.reset();
select is((select b.name from public.profiles p join public.branches b on b.id = p.branch_id where p.id = tests.uid('l2')), 'Amanfrom', 'the administrator''s change is kept');

-- ---------------------------------------------------------------- audited
select bag_eq($$ select actor_id, metadata ->> 'from' as from_name, metadata ->> 'to' as to_name from public.audit_logs
                   where action = 'profile.branch_changed' and entity_id = tests.uid('l1')::text $$,
  $$ values (tests.uid('l1'), null::text, 'Kumasi'), (tests.uid('l1'), 'Kumasi', 'Kasoa C.P'), (tests.uid('l1'), 'Kasoa C.P', null), (tests.uid('l1'), null, 'Kasoa C.P') $$,
  'every change of a learner''s branch is audited with who changed it, from and to');
select results_eq($$ select actor_id, metadata ->> 'to' from public.audit_logs where action = 'profile.branch_changed' and entity_id = tests.uid('l2')::text $$,
  $$ values (tests.uid('a1'), 'Amanfrom') $$, 'including an administrator''s change');
select tests.as_anon();
select throws_ok($$ select count(*) from public.branches $$, '42501', NULL, 'a visitor cannot read the branches');
select tests.reset();

select * from finish();
rollback;
