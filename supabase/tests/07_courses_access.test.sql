-- Phase 5: courses, course_lecturers and course_enrollments under RLS, the access helpers
-- (private.is_lecturer_of, private.is_enrolled, private.is_actively_enrolled, private.can_see_course),
-- the roster and teacher lists, and the `course-covers` bucket.
-- Tests required (phase file): lecturer A cannot read or edit lecturer B's course; draft and pending
-- courses are invisible to learners; duplicate course code and duplicate active enrolment are
-- rejected; a learner without enrolment sees nothing; a COMPLETED enrolment and an ARCHIVED course
-- are read-only for learners (D05, D07).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(87);

-- ---------------------------------------------------------------- people
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.t3', tests.create_user('t3@example.test', 'Ruth', 'Tetteh', 'LECTURER')::text, true);
select set_config('t.ts', tests.create_user('ts@example.test', 'Sus', 'Lecturer', 'LECTURER', 'SUSPENDED')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Yaw', 'Darko')::text, true);
select set_config('t.l4', tests.create_user('l4@example.test', 'John', 'Osei')::text, true);
select set_config('t.ls', tests.create_user('ls@example.test', 'Sus', 'Learner', 'LEARNER', 'SUSPENDED')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.cid(p text) returns uuid language sql stable as $$
  select ('00000000-0000-4000-8000-0000000c00' || lpad(p, 2, '0'))::uuid
$$;
grant execute on function tests.uid(text), tests.cid(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- schema
select has_table('public', 'courses', 'courses exists');
select has_table('public', 'course_lecturers', 'course_lecturers exists');
select has_table('public', 'course_enrollments', 'course_enrollments exists');
select enum_has_labels('public', 'course_status', array['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'ARCHIVED'], 'course_status has the D04 lifecycle');
select enum_has_labels('public', 'course_permission', array['OWNER', 'CO_LECTURER'], 'course_permission is OWNER or CO_LECTURER (D06)');
select enum_has_labels('public', 'enrolment_status', array['ACTIVE', 'COMPLETED', 'WITHDRAWN', 'SUSPENDED'], 'enrolment_status has the D05 statuses');
select has_column('public', 'profiles', 'can_publish_directly', 'profiles.can_publish_directly exists (ADR-005)');
select col_default_is('public', 'profiles', 'can_publish_directly', 'false', 'direct publishing is off by default');

-- Every foreign key on the new tables refuses deletes (D25)
select is(
  (select count(*)::int from pg_constraint
    where contype = 'f' and confdeltype <> 'r'
      and conrelid in ('public.courses'::regclass, 'public.course_lecturers'::regclass, 'public.course_enrollments'::regclass)),
  0, 'every foreign key on courses, course_lecturers and course_enrollments is ON DELETE RESTRICT');

-- ---------------------------------------------------------------- data (as the owner: trusted path)
insert into public.courses (id, title, course_code, created_by, status, published_at, archived_at) values
  (tests.cid('1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now(), null),
  (tests.cid('2'), 'Principles of Discipleship', 'DIS201', tests.uid('t2'), 'PUBLISHED', now(), null),
  (tests.cid('3'), 'Prayer and Spiritual Growth', 'PRA110', tests.uid('t1'), 'DRAFT', null, null),
  (tests.cid('4'), 'Christian Leadership', 'LEA301', tests.uid('t1'), 'PENDING_APPROVAL', null, null),
  (tests.cid('5'), 'Foundations of Christianity', 'FOU100', tests.uid('t1'), 'ARCHIVED', now(), now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.cid('1'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.cid('1'), tests.uid('t3'), 'CO_LECTURER', tests.uid('t1')),
  (tests.cid('2'), tests.uid('t2'), 'OWNER', tests.uid('t2')),
  (tests.cid('3'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.cid('4'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.cid('5'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.cid('2'), tests.uid('ts'), 'CO_LECTURER', tests.uid('t2'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.cid('1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')),
  (tests.cid('3'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')),
  (tests.cid('4'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')),
  (tests.cid('1'), tests.uid('l2'), 'COMPLETED', tests.uid('a1')),
  (tests.cid('5'), tests.uid('l2'), 'ACTIVE', tests.uid('a1')),
  (tests.cid('1'), tests.uid('l3'), 'WITHDRAWN', tests.uid('a1')),
  (tests.cid('2'), tests.uid('l3'), 'SUSPENDED', tests.uid('a1')),
  (tests.cid('1'), tests.uid('ls'), 'ACTIVE', tests.uid('a1'));

-- ---------------------------------------------------------------- constraints
select throws_ok($$ insert into public.courses (title, course_code, created_by) values ('Another', 'bib101', tests.uid('t2')) $$,
  '23505', NULL, 'a duplicate course code is rejected (case does not matter)');
select is((select course_code from public.courses where id = tests.cid('1')), 'BIB101', 'course codes are stored in capitals');
select throws_ok($$ insert into public.courses (title, course_code, created_by) values ('Bad code', 'B 1!', tests.uid('t2')) $$,
  '23514', NULL, 'a course code with spaces or symbols is rejected');
select throws_ok($$ insert into public.course_enrollments (course_id, learner_id, enrolled_by) values (tests.cid('1'), tests.uid('l1'), tests.uid('a1')) $$,
  '23505', NULL, 'a duplicate active enrolment is rejected');
select throws_ok($$ insert into public.course_enrollments (course_id, learner_id, enrolled_by) values (tests.cid('1'), tests.uid('l2'), tests.uid('a1')) $$,
  '23505', NULL, 'a COMPLETED enrolment also blocks a second enrolment in the same course');
select lives_ok($$ insert into public.course_enrollments (course_id, learner_id, enrolled_by, enrolment_status) values (tests.cid('1'), tests.uid('l3'), tests.uid('a1'), 'WITHDRAWN') $$,
  'a withdrawn enrolment does not block re-enrolment history');
select throws_ok($$ insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values (tests.cid('1'), tests.uid('t2'), 'OWNER', tests.uid('a1')) $$,
  '23505', NULL, 'a course has exactly one active OWNER');
select throws_ok($$ insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values (tests.cid('1'), tests.uid('t3'), 'CO_LECTURER', tests.uid('a1')) $$,
  '23505', NULL, 'a lecturer is listed once per course');
select throws_ok($$ update public.courses set status = 'ARCHIVED', archived_at = null where id = tests.cid('2') $$,
  '23514', NULL, 'an ARCHIVED course always has archived_at');

-- ---------------------------------------------------------------- helpers
select has_function('private', 'is_lecturer_of', array['uuid'], 'private.is_lecturer_of exists');
select has_function('private', 'is_enrolled', array['uuid'], 'private.is_enrolled exists');
select has_function('private', 'is_actively_enrolled', array['uuid'], 'private.is_actively_enrolled exists');
select has_function('private', 'can_see_course', array['uuid'], 'private.can_see_course exists');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.proname in ('is_lecturer_of', 'is_enrolled', 'is_actively_enrolled', 'can_see_course')
              and p.prosecdef and p.proconfig @> array['search_path=""']), 4,
  'the four course helpers are SECURITY DEFINER with an empty search_path');

select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select ok(private.is_lecturer_of(tests.cid('1')), 'is_lecturer_of: the OWNER of a course');
select ok(not private.is_lecturer_of(tests.cid('2')), 'is_lecturer_of: not for another lecturer''s course');
select tests.reset();
select tests.authenticate_as(tests.uid('t3'));
select ok(private.is_lecturer_of(tests.cid('1')), 'is_lecturer_of: a CO_LECTURER of the course');
select tests.reset();
select tests.authenticate_as(tests.uid('ts'));
select ok(not private.is_lecturer_of(tests.cid('2')), 'is_lecturer_of: not for a suspended lecturer');
select tests.reset();
select tests.authenticate_as(tests.uid('l1'));
select ok(private.is_enrolled(tests.cid('1')), 'is_enrolled: an ACTIVE enrolment');
select ok(not private.is_enrolled(tests.cid('2')), 'is_enrolled: not without an enrolment');
select ok(private.is_actively_enrolled(tests.cid('1')), 'is_actively_enrolled: ACTIVE in a PUBLISHED course (may submit in later phases)');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
select ok(private.is_enrolled(tests.cid('1')), 'is_enrolled: a COMPLETED enrolment keeps read access (D05)');
select ok(not private.is_actively_enrolled(tests.cid('1')), 'is_actively_enrolled: a COMPLETED enrolment is read-only (D05)');
select ok(not private.is_actively_enrolled(tests.cid('5')), 'is_actively_enrolled: an ARCHIVED course is read-only (D07)');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select ok(not private.is_enrolled(tests.cid('1')), 'is_enrolled: not for a WITHDRAWN enrolment');
select ok(not private.is_enrolled(tests.cid('2')), 'is_enrolled: not for a SUSPENDED enrolment');
select tests.reset();
select tests.authenticate_as(tests.uid('ls'));
select ok(not private.is_enrolled(tests.cid('1')), 'is_enrolled: not for a suspended account');
select tests.reset();

-- ---------------------------------------------------------------- courses: who sees what
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is((select count(*)::int from public.courses), 5, 'an administrator (AAL2) sees every course');
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal1');
select is((select count(*)::int from public.courses), 0, 'an administrator without MFA (AAL1) sees no course');

select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select course_code from public.courses order by course_code $$,
  $$ values ('BIB101'), ('FOU100'), ('LEA301'), ('PRA110') $$, 'lecturer A sees only the courses they teach');
select is((select count(*)::int from public.courses where id = tests.cid('2')), 0, 'lecturer A cannot read lecturer B''s course');
update public.courses set title = 'Taken over' where id = tests.cid('2');
select tests.reset();
select tests.authenticate_as(tests.uid('t3'));
select results_eq($$ select course_code from public.courses order by course_code $$, $$ values ('BIB101') $$,
  'a co-lecturer sees the course they co-teach');
select tests.reset();
select tests.authenticate_as(tests.uid('ts'));
select is((select count(*)::int from public.courses), 0, 'a suspended lecturer sees no course');
select tests.reset();
select is((select title from public.courses where id = tests.cid('2')), 'Principles of Discipleship', 'lecturer A cannot edit lecturer B''s course');

select tests.reset();
select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select course_code from public.courses order by course_code $$, $$ values ('BIB101') $$,
  'a learner sees only PUBLISHED courses they are enrolled in: draft and pending courses are invisible');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
select results_eq($$ select course_code from public.courses order by course_code $$, $$ values ('BIB101'), ('FOU100') $$,
  'a COMPLETED enrolment and an ARCHIVED course stay readable (D05, D07)');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select is((select count(*)::int from public.courses), 0, 'WITHDRAWN and SUSPENDED enrolments give no access');
select tests.reset();
select tests.authenticate_as(tests.uid('l4'));
select is((select count(*)::int from public.courses), 0, 'a learner without enrolment sees no course');
select is((select count(*)::int from public.course_enrollments), 0, 'a learner without enrolment sees no enrolment');
select is((select count(*)::int from public.course_lecturers), 0, 'a learner without enrolment sees no teaching rows');
select tests.reset();
select tests.authenticate_as(tests.uid('ls'));
select is((select count(*)::int from public.courses), 0, 'a suspended learner sees no course');
select tests.as_anon();
select throws_ok($$ select count(*) from public.courses $$, '42501', NULL, 'a visitor cannot read courses');
select tests.reset();

-- ---------------------------------------------------------------- courses: who may write
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select lives_ok($$ update public.courses set title = 'Introduction to Biblical Studies (2026)', description = 'An overview' where id = tests.cid('1') $$,
  'a lecturer can edit the details of their own course');
select throws_ok($$ update public.courses set status = 'PUBLISHED' where id = tests.cid('3') $$, '42501', NULL,
  'a lecturer cannot change a course status directly (only through course-lifecycle)');
select throws_ok($$ update public.courses set created_by = tests.uid('t2') where id = tests.cid('1') $$, '42501', NULL,
  'a lecturer cannot change who created a course');
select throws_ok($$ update public.courses set title = 'Edited' where id = tests.cid('5') $$, '42501', NULL,
  'an ARCHIVED course is read-only, even for its lecturers');
select throws_ok($$ insert into public.courses (title, course_code, created_by) values ('Mine', 'MIN100', tests.uid('t1')) $$, '42501', NULL,
  'a lecturer cannot insert a course directly (create-course does it)');
select throws_ok($$ insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values (tests.cid('1'), tests.uid('t2'), 'CO_LECTURER', tests.uid('t1')) $$,
  '42501', NULL, 'a lecturer cannot add teaching rows directly');
select throws_ok($$ insert into public.course_enrollments (course_id, learner_id, enrolled_by) values (tests.cid('1'), tests.uid('l4'), tests.uid('t1')) $$,
  '42501', NULL, 'a lecturer cannot enrol learners (D05: administrator only)');
select tests.reset();
select tests.authenticate_as(tests.uid('l1'));
update public.courses set title = 'Hacked' where id = tests.cid('1');
select throws_ok($$ insert into public.course_enrollments (course_id, learner_id, enrolled_by) values (tests.cid('2'), tests.uid('l1'), tests.uid('l1')) $$,
  '42501', NULL, 'a learner cannot enrol themself');
select throws_ok($$ update public.course_enrollments set enrolment_status = 'ACTIVE' where learner_id = tests.uid('l1') $$,
  '42501', NULL, 'a learner cannot change an enrolment');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
update public.courses set title = 'Hacked' where id = tests.cid('5');
select tests.reset();
select is((select count(*)::int from public.courses where title = 'Hacked'), 0, 'learners cannot edit courses, archived or not');
select is((select count(*)::int from public.courses where title like 'Introduction to Biblical Studies (2026)'), 1, 'the lecturer''s own edit was saved');

select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select lives_ok($$ update public.courses set category = 'Biblical Studies' where id = tests.cid('2') $$, 'an administrator can edit any course''s details');
select tests.reset();

-- ---------------------------------------------------------------- course_lecturers and enrolments
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.course_lecturers where course_id = tests.cid('1')), 2, 'a lecturer sees the teaching rows of their course');
select is((select count(*)::int from public.course_lecturers where course_id = tests.cid('2')), 0, 'a lecturer cannot see another course''s teaching rows');
select is((select count(*)::int from public.course_enrollments where course_id = tests.cid('1')), 5, 'a lecturer sees the enrolments of their course');
select is((select count(*)::int from public.course_enrollments where course_id = tests.cid('2')), 0, 'a lecturer cannot see another course''s enrolments');
select is((select count(*)::int from public.profiles where id = tests.uid('l1')), 0,
  'a lecturer still cannot read learner profile rows (email, phone); names and photos come from course_roster');
select tests.reset();
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.course_enrollments), 3, 'a learner sees their own enrolments');
select tests.reset();

-- ---------------------------------------------------------------- roster and teachers
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select first_name || ' ' || second_name from public.course_roster(tests.cid('1')) order by 1 $$,
  $$ values ('Abena Frimpong'), ('Kwame Mensah'), ('Sus Learner') $$,
  'course_roster: the lecturer gets the names of the current (not withdrawn) learners in their course');
select is((select count(*)::int from information_schema.routines r
            join information_schema.parameters p on p.specific_name = r.specific_name
           where r.routine_schema = 'public' and r.routine_name = 'course_roster' and p.parameter_mode = 'OUT'
             and p.parameter_name in ('email', 'contact_number')), 0,
  'course_roster returns no email or phone number (name and photo only)');
select throws_ok($$ select * from public.course_roster(tests.cid('2')) $$, '42501', NULL, 'course_roster: refused for another lecturer''s course');
select results_eq($$ select first_name || ':' || permission_level from public.course_teachers(tests.cid('1')) order by 1 $$,
  $$ values ('Ama:OWNER'), ('Ruth:CO_LECTURER') $$, 'course_teachers: a lecturer sees who teaches their course');
select tests.reset();
select tests.authenticate_as(tests.uid('l1'));
select throws_ok($$ select * from public.course_roster(tests.cid('1')) $$, '42501', NULL, 'course_roster: refused for learners');
select is((select count(*)::int from public.course_teachers(tests.cid('1'))), 2, 'course_teachers: an enrolled learner sees their lecturers');
select is((select count(*)::int from public.course_teachers(tests.cid('3'))), 0, 'course_teachers: nothing for a draft course');
select tests.reset();
select tests.authenticate_as(tests.uid('l4'));
select is((select count(*)::int from public.course_teachers(tests.cid('1'))), 0, 'course_teachers: nothing for a course the learner is not in');
select tests.reset();

-- ---------------------------------------------------------------- course-covers bucket
select ok(exists (select 1 from storage.buckets where id = 'course-covers' and not public), 'the course-covers bucket exists and is private');
select is((select file_size_limit from storage.buckets where id = 'course-covers'), 2097152::bigint, 'course covers are capped at 2 MB (D17)');
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, validated_at, validation_error)
values
  ('00000000-0000-4000-8000-0000000000c1', 'course-covers', tests.cid('1') || '/c1.png', 'c.png', 'c.png', tests.uid('t1'), 'VALIDATED', 'COURSE_COVER', tests.cid('1'), 'image/png', 1000, now(), null),
  ('00000000-0000-4000-8000-0000000000c2', 'course-covers', tests.cid('1') || '/c2.png', 'd.png', 'd.png', tests.uid('t1'), 'PENDING', 'COURSE_COVER', tests.cid('1'), null, null, null, null),
  ('00000000-0000-4000-8000-0000000000c3', 'course-covers', tests.cid('3') || '/c3.png', 'e.png', 'e.png', tests.uid('t1'), 'VALIDATED', 'COURSE_COVER', tests.cid('3'), 'image/png', 1000, now(), null);
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('course-covers', tests.cid('1') || '/c1.png', tests.uid('t1')::text, '{"mimetype":"image/png","size":1000}'),
  ('course-covers', tests.cid('1') || '/c2.png', tests.uid('t1')::text, '{"mimetype":"image/png","size":1000}'),
  ('course-covers', tests.cid('3') || '/c3.png', tests.uid('t1')::text, '{"mimetype":"image/png","size":1000}');
select throws_ok($$ update public.courses set cover_image_file_id = '00000000-0000-4000-8000-0000000000c2' where id = tests.cid('1') $$,
  '42501', NULL, 'a course cover must be a VALIDATED cover of that course');
select lives_ok($$ update public.courses set cover_image_file_id = '00000000-0000-4000-8000-0000000000c1' where id = tests.cid('1') $$,
  'a VALIDATED cover of the course can be set (by the trusted path)');
select tests.reset();
select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select name from storage.objects where bucket_id = 'course-covers' order by name $$,
  $$ select tests.cid('1') || '/c1.png' $$, 'a learner reads only the VALIDATED cover of a course they can see');
select results_eq($$ select course_id from public.course_cover_paths(array[tests.cid('1'), tests.cid('3')]) $$, $$ select tests.cid('1') $$,
  'course_cover_paths: a learner gets the cover path of a course they can see, not of a draft');
select tests.reset();
select tests.authenticate_as(tests.uid('t2'));
select is((select count(*)::int from public.course_cover_paths(array[tests.cid('1')])), 0, 'course_cover_paths: nothing for a course the lecturer does not teach');
select is((select count(*)::int from storage.objects where bucket_id = 'course-covers'), 0, 'another lecturer cannot read the covers of a course they do not teach');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('course-covers', tests.cid('2') || '/x.png', tests.uid('t2')::text) $$,
  '42501', NULL, 'nobody writes to the course-covers bucket directly');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from storage.objects where bucket_id = 'course-covers'), 2, 'the lecturer reads the VALIDATED covers of their own courses, draft included');
select tests.reset();

select * from finish();
rollback;
