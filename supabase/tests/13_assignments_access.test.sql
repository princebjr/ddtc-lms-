-- Phase 7: grade_categories, assignments, assignment_versions, submission_extensions under RLS; the
-- assignment-instructions-audio bucket; assignment_media(); the instruction-type CHECKs; ADR-009
-- (answers always accept text and audio); the exit gate (category weights must total 100 before any
-- grade can be released). Tests required (phase file): database CHECKs reject invalid instruction
-- combinations; only the course's lecturers manage assignments; learners see only published
-- assignments of enrolled courses; instruction audio is denied to everyone else.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(61);

-- ---------------------------------------------------------------- people and courses
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.t3', tests.create_user('t3@example.test', 'Ruth', 'Tetteh', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Yaw', 'Darko')::text, true);
select set_config('t.ls', tests.create_user('ls@example.test', 'Sus', 'Learner', 'LEARNER', 'SUSPENDED')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
-- Fixture ids from short hex names: c = course, e = lesson, a = assignment, f = file, ca = category, ee = extension.
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;
/** Instruction audio object names the current role can read (this test's courses only), sorted. */
create function tests.readable() returns text[] language sql stable as $$
  select coalesce(array_agg(split_part(name, '/', 3) order by split_part(name, '/', 3)), '{}') from storage.objects
   where bucket_id = 'assignment-instructions-audio' and name like '00000000-0000-4000-8000-%'
$$;
grant execute on function tests.uid(text), tests.id(text), tests.readable() to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Principles of Discipleship', 'DIS201', tests.uid('t2'), 'PUBLISHED', now()),
  (tests.id('c3'), 'Prayer and Spiritual Growth', 'PRA110', tests.uid('t1'), 'DRAFT', null);
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.id('c1'), tests.uid('t3'), 'CO_LECTURER', tests.uid('t1')),
  (tests.id('c2'), tests.uid('t2'), 'OWNER', tests.uid('t2')),
  (tests.id('c3'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c3'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c1'), tests.uid('l2'), 'COMPLETED', tests.uid('a1')),
  (tests.id('c1'), tests.uid('ls'), 'ACTIVE', tests.uid('a1'));
insert into public.lessons (id, course_id, title, content, position, publication_status, created_by, published_at) values
  (tests.id('e1'), tests.id('c1'), 'The Creation Account', '<p>Genesis 1</p>', 1, 'PUBLISHED', tests.uid('t1'), now()),
  (tests.id('e2'), tests.id('c2'), 'What a disciple is', '<p>Mark 1</p>', 1, 'PUBLISHED', tests.uid('t2'), now());

/** The course's default category (created with the course). */
create function tests.cat(p_course text) returns uuid language sql stable as $$
  select id from public.grade_categories where course_id = tests.id(p_course) and archived_at is null order by position limit 1
$$;
grant execute on function tests.cat(text) to anon, authenticated, service_role;

-- a1 published TEXT, a2 draft AUDIO (its audio f3), a3 published TEXT_AND_AUDIO (current audio f1,
-- replaced f0, pending f2), a4 published but archived, a5 another course, a6 in a draft course.
insert into public.assignments (id, course_id, lesson_id, category_id, title, content_type, text_instructions, due_at, max_marks, publication_status, created_by, published_at, archived_at) values
  (tests.id('a1'), tests.id('c1'), tests.id('e1'), tests.cat('c1'), 'Reflection on Genesis 1', 'TEXT', '<p>Read Genesis 1 and reflect.</p>', now() + interval '7 days', 20, 'PUBLISHED', tests.uid('t1'), now(), null),
  (tests.id('a2'), tests.id('c1'), null, tests.cat('c1'), 'Prayer journal', 'AUDIO', '', now() + interval '14 days', 10, 'DRAFT', tests.uid('t1'), null, null),
  (tests.id('a3'), tests.id('c1'), null, tests.cat('c1'), 'Covenant essay', 'TEXT_AND_AUDIO', '<p>Listen, then write.</p>', now() + interval '21 days', 50, 'DRAFT', tests.uid('t1'), null, null),
  (tests.id('a4'), tests.id('c1'), null, tests.cat('c1'), 'Old exercise', 'TEXT', '<p>Old.</p>', now() - interval '7 days', 10, 'PUBLISHED', tests.uid('t1'), now(), now()),
  (tests.id('a5'), tests.id('c2'), tests.id('e2'), tests.cat('c2'), 'Discipleship reflection', 'TEXT', '<p>Reflect.</p>', now() + interval '7 days', 20, 'PUBLISHED', tests.uid('t2'), now(), null),
  (tests.id('a6'), tests.id('c3'), null, tests.cat('c3'), 'Why we pray', 'TEXT', '<p>Pray.</p>', now() + interval '7 days', 20, 'PUBLISHED', tests.uid('t1'), now(), null);
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, duration_seconds, validated_at) values
  (tests.id('f0'), 'assignment-instructions-audio', tests.id('c1') || '/' || tests.id('a3') || '/f0.mp3', 'old.mp3', 'old.mp3', tests.uid('t1'), 'VALIDATED', 'ASSIGNMENT_INSTRUCTION_AUDIO', tests.id('a3'), 'audio/mpeg', 1000, 60, now()),
  (tests.id('f1'), 'assignment-instructions-audio', tests.id('c1') || '/' || tests.id('a3') || '/f1.mp3', 'brief.mp3', 'brief.mp3', tests.uid('t1'), 'VALIDATED', 'ASSIGNMENT_INSTRUCTION_AUDIO', tests.id('a3'), 'audio/mpeg', 1000, 90, now()),
  (tests.id('f2'), 'assignment-instructions-audio', tests.id('c1') || '/' || tests.id('a3') || '/f2.mp3', 'pending.mp3', 'pending.mp3', tests.uid('t1'), 'PENDING', 'ASSIGNMENT_INSTRUCTION_AUDIO', tests.id('a3'), null, null, null, null),
  (tests.id('f3'), 'assignment-instructions-audio', tests.id('c1') || '/' || tests.id('a2') || '/f3.mp3', 'draft.mp3', 'draft.mp3', tests.uid('t1'), 'VALIDATED', 'ASSIGNMENT_INSTRUCTION_AUDIO', tests.id('a2'), 'audio/mpeg', 1000, 30, now());
update public.assignments set instruction_audio_file_id = tests.id('f1'), publication_status = 'PUBLISHED', published_at = now() where id = tests.id('a3');
update public.assignments set instruction_audio_file_id = tests.id('f3') where id = tests.id('a2');
insert into storage.objects (bucket_id, name, owner_id, metadata)
select f.bucket_name, f.storage_path, tests.uid('t1')::text, '{"mimetype":"audio/mpeg","size":1000}'
  from public.file_objects f where f.id in (tests.id('f0'), tests.id('f1'), tests.id('f2'), tests.id('f3'));
insert into public.assignment_versions (assignment_id, version_number, title, description, content_type, text_instructions, due_at, max_marks, accepted_formats, grading_criteria, category_id, allow_late, changed_by)
select id, 1, title, description, content_type, text_instructions, due_at, max_marks, accepted_formats, grading_criteria, category_id, allow_late, tests.uid('t1')
  from public.assignments where id = tests.id('a1');
insert into public.submission_extensions (id, assignment_id, learner_id, extended_due_at, granted_by) values
  (tests.id('ee1'), tests.id('a1'), tests.uid('l1'), now() + interval '10 days', tests.uid('t1'));

-- ---------------------------------------------------------------- schema
select has_table('public', 'grade_categories', 'grade_categories exists');
select has_table('public', 'assignments', 'assignments exists');
select has_table('public', 'assignment_versions', 'assignment_versions exists');
select has_table('public', 'submission_extensions', 'submission_extensions exists');
select is(
  (select count(*)::int from pg_constraint
    where contype = 'f' and confdeltype <> 'r'
      and conrelid in ('public.grade_categories'::regclass, 'public.assignments'::regclass, 'public.assignment_versions'::regclass, 'public.submission_extensions'::regclass)),
  0, 'every foreign key on the assignment tables is ON DELETE RESTRICT (D25)');
select results_eq($$ select name, weight from public.grade_categories where course_id = tests.id('c1') $$, $$ values ('Assignments', 100) $$,
  'a new course gets one category, Assignments, weighted 100 (D12)');

-- ---------------------------------------------------------------- the instruction types (published assignments)
select throws_ok($$ insert into public.assignments (course_id, category_id, title, content_type, text_instructions, due_at, max_marks, publication_status, created_by, published_at)
                    values (tests.id('c1'), tests.cat('c1'), 'No text', 'TEXT', '<p> </p>', now(), 10, 'PUBLISHED', tests.uid('t1'), now()) $$,
  '23514', NULL, 'a published TEXT assignment needs text');
select throws_ok($$ insert into public.assignments (course_id, category_id, title, content_type, due_at, max_marks, publication_status, created_by, published_at)
                    values (tests.id('c1'), tests.cat('c1'), 'No audio', 'AUDIO', now(), 10, 'PUBLISHED', tests.uid('t1'), now()) $$,
  '23514', NULL, 'a published AUDIO assignment needs audio');
select throws_ok($$ update public.assignments set instruction_audio_file_id = null where id = tests.id('a3') $$,
  '23514', NULL, 'a published TEXT_AND_AUDIO assignment needs its audio as well as its text');
select throws_ok($$ update public.assignments set text_instructions = '' where id = tests.id('a3') $$,
  '23514', NULL, 'and its text as well as its audio');
select lives_ok($$ insert into public.assignments (course_id, category_id, title, content_type, due_at, max_marks, created_by)
                   values (tests.id('c1'), tests.cat('c1'), 'Audio to come', 'AUDIO', now() + interval '1 day', 10, tests.uid('t1')) $$,
  'a draft may wait for its audio (the audio is uploaded after the draft exists)');
select throws_ok($$ insert into public.assignments (course_id, category_id, title, content_type, text_instructions, due_at, max_marks, created_by)
                    values (tests.id('c1'), tests.cat('c1'), 'Bad', 'TEXT', '<p>x</p><script>alert(1)</script>', now(), 10, tests.uid('t1')) $$,
  '23514', NULL, 'instructions with a script are refused by the database');

-- ---------------------------------------------------------------- ADR-009: answers always accept text and audio
select is((select accepted_formats from public.assignments where id = tests.id('a1')), array['TEXT', 'AUDIO'], 'by default an assignment accepts text and audio answers');
select throws_ok($$ update public.assignments set accepted_formats = array['TEXT'] where id = tests.id('a1') $$,
  '23514', NULL, 'an assignment cannot refuse audio answers (ADR-009)');
select throws_ok($$ update public.assignments set accepted_formats = array['AUDIO', 'PDF'] where id = tests.id('a1') $$,
  '23514', NULL, 'nor text answers');
select throws_ok($$ update public.assignments set accepted_formats = array['TEXT', 'AUDIO', 'ZIP'] where id = tests.id('a1') $$,
  '23514', NULL, 'only TEXT, AUDIO, PDF and DOCX exist');
select lives_ok($$ update public.assignments set accepted_formats = array['TEXT', 'AUDIO', 'PDF', 'DOCX'] where id = tests.id('a1') $$,
  'PDF and Word can be allowed as well');
select throws_ok($$ update public.assignments set max_marks = 0 where id = tests.id('a1') $$, '23514', NULL, 'maximum marks must be more than 0');

-- ---------------------------------------------------------------- same-course rules and categories
select throws_ok($$ update public.assignments set category_id = tests.cat('c2') where id = tests.id('a1') $$,
  '22023', NULL, 'an assignment''s category belongs to its own course');
select throws_ok($$ update public.assignments set lesson_id = tests.id('e2') where id = tests.id('a1') $$,
  '22023', NULL, 'and so does its lesson');
select throws_ok($$ update public.assignments set course_id = tests.id('c2') where id = tests.id('a1') $$,
  '22023', NULL, 'an assignment never moves to another course');
select throws_ok($$ insert into public.grade_categories (course_id, name, weight, position) values (tests.id('c1'), 'Late', 101, 9) $$,
  '23514', NULL, 'a category weight lies between 0 and 100');
select throws_ok($$ insert into public.grade_categories (course_id, name, weight, position) values (tests.id('c1'), 'assignments', 0, 9) $$,
  '23P01', NULL, 'two categories of a course cannot share a name (capital letters aside)');

-- ---------------------------------------------------------------- exit gate: weights must total 100 before any release
select lives_ok($$ select private.require_weights_total_100(tests.id('c1')) $$, 'weights totalling 100 allow grades to be released');
insert into public.grade_categories (id, course_id, name, weight, position) values (tests.id('ca2'), tests.id('c1'), 'Participation', 40, 2);
select throws_ok($$ select private.require_weights_total_100(tests.id('c1')) $$, '22023', 'Category weights must total 100 before grades can be released',
  'weights totalling 140 block every release (exit gate)');
select is(public.course_weight_total(tests.id('c1')), 140, 'the course''s weight total is reported for the editor');
update public.grade_categories set archived_at = now() where id = tests.id('ca2');
select lives_ok($$ select private.require_weights_total_100(tests.id('c1')) $$, 'an archived category no longer counts');

-- ---------------------------------------------------------------- assignments: who sees what
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is((select count(*)::int from public.assignments where course_id in (tests.id('c1'), tests.id('c2'), tests.id('c3')) and title <> 'Audio to come'), 6, 'an administrator sees every assignment');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.assignments where id in (tests.id('a1'), tests.id('a2'), tests.id('a3'), tests.id('a4'), tests.id('a6'))), 5,
  'the owner sees every assignment of their courses, drafts and archived included');
select is((select count(*)::int from public.assignments where id = tests.id('a5')), 0, 'but not another lecturer''s');
select throws_ok($$ update public.assignments set title = 'Changed' where id = tests.id('a1') $$, '42501', NULL, 'a lecturer cannot change an assignment directly (the server does)');
select tests.reset();
select tests.authenticate_as(tests.uid('t3'));
select is((select count(*)::int from public.assignments where course_id = tests.id('c1') and title <> 'Audio to come'), 4, 'a co-lecturer sees the course''s assignments');
select tests.reset();
select tests.authenticate_as(tests.uid('t2'));
select is((select count(*)::int from public.assignments where course_id = tests.id('c1')), 0, 'another lecturer sees none of them');
select tests.reset();
select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select title from public.assignments order by title $$, $$ values ('Covenant essay'), ('Reflection on Genesis 1') $$,
  'an enrolled learner sees only published, current assignments of published courses they are enrolled in');
select throws_ok($$ insert into public.assignments (course_id, category_id, title, content_type, text_instructions, due_at, max_marks, created_by) values (tests.id('c1'), tests.cat('c1'), 'Mine', 'TEXT', '<p>x</p>', now(), 1, tests.uid('l1')) $$,
  '42501', NULL, 'a learner cannot create an assignment');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
select is((select count(*)::int from public.assignments), 2, 'a COMPLETED enrolment still reads the assignments (D05)');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select is((select count(*)::int from public.assignments), 0, 'a learner without enrolment sees no assignment');
select is((select count(*)::int from public.grade_categories where course_id = tests.id('c1')), 0, 'nor the course''s categories');
select tests.reset();
select tests.authenticate_as(tests.uid('ls'));
select is((select count(*)::int from public.assignments), 0, 'a suspended learner sees no assignment');
select tests.reset();
select tests.as_anon();
select throws_ok($$ select count(*) from public.assignments $$, '42501', NULL, 'a visitor cannot read assignments');
select tests.reset();

-- ---------------------------------------------------------------- categories, versions and extensions
select tests.authenticate_as(tests.uid('l1'));
select ok((select count(*) from public.grade_categories where course_id = tests.id('c1')) >= 1, 'an enrolled learner sees the course''s categories');
select is((select count(*)::int from public.assignment_versions), 0, 'learners never see assignment snapshots');
select results_eq($$ select id from public.submission_extensions $$, $$ values (tests.id('ee1')) $$, 'a learner sees their own extension');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
select is((select count(*)::int from public.submission_extensions), 0, 'but not another learner''s');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.assignment_versions where assignment_id = tests.id('a1')), 1, 'the course lecturer reads the snapshots');
select is((select count(*)::int from public.submission_extensions where assignment_id = tests.id('a1')), 1, 'and the extensions on their assignments');
select tests.reset();
select tests.authenticate_as(tests.uid('t2'));
select is((select count(*)::int from public.assignment_versions where assignment_id = tests.id('a1')) + (select count(*)::int from public.submission_extensions where assignment_id = tests.id('a1')), 0,
  'another lecturer reads neither');
select tests.reset();
select is(private.effective_due_at(tests.id('a1'), tests.uid('l1')), (select extended_due_at from public.submission_extensions where id = tests.id('ee1')),
  'a learner''s effective due date is their extension when they have one (D13)');
select is(private.effective_due_at(tests.id('a1'), tests.uid('l2')), (select due_at from public.assignments where id = tests.id('a1')), 'and the assignment''s due date otherwise');

-- ---------------------------------------------------------------- assignment_media(): the instruction audio
select tests.authenticate_as(tests.uid('l1'));
select is((select storage_path from public.assignment_media(tests.id('a3'))), tests.id('c1') || '/' || tests.id('a3') || '/f1.mp3', 'an enrolled learner gets the current instruction audio');
select is((select count(*)::int from public.assignment_media(tests.id('a2'))), 0, 'nothing for a draft');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select is((select count(*)::int from public.assignment_media(tests.id('a3'))), 0, 'nothing for a learner who is not enrolled');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.assignment_media(tests.id('a2'))), 1, 'the lecturer gets a draft''s audio');
select tests.reset();

-- ---------------------------------------------------------------- Storage: assignment-instructions-audio
select ok(exists (select 1 from storage.buckets where id = 'assignment-instructions-audio' and not public and file_size_limit = 26214400),
  'assignment-instructions-audio is private and capped at 25 MB (D17)');
select tests.authenticate_as(tests.uid('l1'));
select is(tests.readable(), array['f1.mp3'], 'an enrolled learner reads only the current audio of a published assignment');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
select is(tests.readable(), array['f1.mp3'], 'a COMPLETED enrolment can still listen (D05)');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select is(tests.readable(), '{}'::text[], 'an unenrolled learner is denied at Storage level');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is(tests.readable(), array['f0.mp3', 'f1.mp3', 'f3.mp3'], 'the course lecturer reads validated audio, replaced and draft included, never PENDING');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('assignment-instructions-audio', tests.id('c1') || '/' || tests.id('a1') || '/x.mp3', tests.uid('t1')::text) $$,
  '42501', NULL, 'nobody writes to the bucket directly (the upload pipeline does)');
select tests.reset();
select tests.authenticate_as(tests.uid('t2'));
select is(tests.readable(), '{}'::text[], 'another lecturer is denied at Storage level');
select tests.reset();
select tests.as_anon();
select is(tests.readable(), '{}'::text[], 'a visitor reads nothing');
select tests.reset();

select * from finish();
rollback;
