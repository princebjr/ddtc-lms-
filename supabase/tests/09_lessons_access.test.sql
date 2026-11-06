-- Phase 6: lessons, lesson_audio_files, lesson_attachments, lesson_progress under RLS; the
-- lesson-audio and lesson-attachments buckets; lesson_media() and mark_lesson().
-- Tests required (phase file): an enrolled learner streams and downloads; an unenrolled learner, a
-- draft lesson, a REJECTED or PENDING file and other lecturers are all denied at Storage level;
-- archiving a course leaves audio intact. Plus D05/D07 read-only (no progress changes for a
-- COMPLETED enrolment or an ARCHIVED course) and D09 (one ACTIVE audio, history kept).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(60);

-- ---------------------------------------------------------------- people and courses
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Yaw', 'Darko')::text, true);
select set_config('t.ls', tests.create_user('ls@example.test', 'Sus', 'Learner', 'LEARNER', 'SUSPENDED')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
-- c = course, l = lesson, f = file, x = attachment (l and x are mapped to hex digits)
create function tests.id(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-' || lpad(translate(p, 'lx', 'be'), 12, '0'))::uuid
$$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Principles of Discipleship', 'DIS201', tests.uid('t2'), 'PUBLISHED', now()),
  (tests.id('c3'), 'Prayer and Spiritual Growth', 'PRA110', tests.uid('t1'), 'DRAFT', null);
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.id('c2'), tests.uid('t2'), 'OWNER', tests.uid('t2')),
  (tests.id('c3'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c3'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c1'), tests.uid('l2'), 'COMPLETED', tests.uid('a1')),
  (tests.id('c1'), tests.uid('ls'), 'ACTIVE', tests.uid('a1'));

-- l1 published, l2 draft (course 1); l3 published (course 2); l4 published in a draft course
insert into public.lessons (id, course_id, title, content, position, publication_status, created_by, published_at) values
  (tests.id('l1'), tests.id('c1'), 'Welcome and overview', '<p>Welcome</p>', 1, 'PUBLISHED', tests.uid('t1'), now()),
  (tests.id('l2'), tests.id('c1'), 'How to study the Bible', '<p>Draft</p>', 2, 'DRAFT', tests.uid('t1'), null),
  (tests.id('l3'), tests.id('c2'), 'What a disciple is', '<p>Other course</p>', 1, 'PUBLISHED', tests.uid('t2'), now()),
  (tests.id('l4'), tests.id('c3'), 'Why we pray', '<p>Draft course</p>', 1, 'PUBLISHED', tests.uid('t1'), now());

-- Files: f1 ACTIVE audio of l1, f0 its SUPERSEDED history, f2 PENDING, f3 REJECTED, f4 audio of the
-- draft lesson l2, f5 attachment of l1, f6 removed attachment of l1.
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, duration_seconds, validated_at, validation_error, waveform_peaks) values
  (tests.id('f1'), 'lesson-audio', tests.id('c1') || '/' || tests.id('l1') || '/f1.mp3', 'welcome.mp3', 'welcome.mp3', tests.uid('t1'), 'VALIDATED', 'LESSON_AUDIO', tests.id('l1'), 'audio/mpeg', 1000, 300, now(), null, array_fill(0.5::real, array[128])),
  (tests.id('f0'), 'lesson-audio', tests.id('c1') || '/' || tests.id('l1') || '/f0.mp3', 'old.mp3', 'old.mp3', tests.uid('t1'), 'VALIDATED', 'LESSON_AUDIO', tests.id('l1'), 'audio/mpeg', 1000, 200, now(), null, null),
  (tests.id('f2'), 'lesson-audio', tests.id('c1') || '/' || tests.id('l1') || '/f2.mp3', 'pending.mp3', 'pending.mp3', tests.uid('t1'), 'PENDING', 'LESSON_AUDIO', tests.id('l1'), null, null, null, null, null, null),
  (tests.id('f3'), 'lesson-audio', tests.id('c1') || '/' || tests.id('l1') || '/f3.mp3', 'fake.mp3', 'fake.mp3', tests.uid('t1'), 'REJECTED', 'LESSON_AUDIO', tests.id('l1'), null, null, null, null, 'not audio', null),
  (tests.id('f4'), 'lesson-audio', tests.id('c1') || '/' || tests.id('l2') || '/f4.mp3', 'draft.mp3', 'draft.mp3', tests.uid('t1'), 'VALIDATED', 'LESSON_AUDIO', tests.id('l2'), 'audio/mpeg', 1000, 100, now(), null, null),
  (tests.id('f5'), 'lesson-attachments', tests.id('c1') || '/' || tests.id('l1') || '/f5.pdf', 'notes.pdf', 'notes.pdf', tests.uid('t1'), 'VALIDATED', 'LESSON_ATTACHMENT', tests.id('l1'), 'application/pdf', 1000, null, now(), null, null),
  (tests.id('f6'), 'lesson-attachments', tests.id('c1') || '/' || tests.id('l1') || '/f6.pdf', 'old-notes.pdf', 'old-notes.pdf', tests.uid('t1'), 'VALIDATED', 'LESSON_ATTACHMENT', tests.id('l1'), 'application/pdf', 1000, null, now(), null, null);
insert into public.lesson_audio_files (lesson_id, file_object_id, uploaded_by, lifecycle_status) values
  (tests.id('l1'), tests.id('f0'), tests.uid('t1'), 'SUPERSEDED'),
  (tests.id('l1'), tests.id('f1'), tests.uid('t1'), 'ACTIVE'),
  (tests.id('l2'), tests.id('f4'), tests.uid('t1'), 'ACTIVE');
insert into public.lesson_attachments (id, lesson_id, file_object_id, uploaded_by, title, position, removed_at, removed_by) values
  (tests.id('x5'), tests.id('l1'), tests.id('f5'), tests.uid('t1'), 'Lesson notes', 1, null, null),
  (tests.id('x6'), tests.id('l1'), tests.id('f6'), tests.uid('t1'), 'Old notes', 2, now(), tests.uid('t1'));
insert into storage.objects (bucket_id, name, owner_id, metadata)
select f.bucket_name, f.storage_path, tests.uid('t1')::text, '{"mimetype":"audio/mpeg","size":1000}'
  from public.file_objects f where f.id in (tests.id('f0'), tests.id('f1'), tests.id('f2'), tests.id('f3'), tests.id('f4'), tests.id('f5'), tests.id('f6'));

/** Object names a role can read in a bucket, sorted. */
create function tests.readable(p_bucket text) returns text[] language sql stable as $$
  select coalesce(array_agg(split_part(name, '/', 3) order by name), '{}') from storage.objects where bucket_id = p_bucket
$$;
grant execute on function tests.readable(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- schema
select has_table('public', 'lessons', 'lessons exists');
select has_table('public', 'lesson_audio_files', 'lesson_audio_files exists');
select has_table('public', 'lesson_attachments', 'lesson_attachments exists');
select has_table('public', 'lesson_progress', 'lesson_progress exists');
select has_column('public', 'file_objects', 'waveform_peaks', 'file_objects.waveform_peaks exists (ADR-006)');
select is(
  (select count(*)::int from pg_constraint
    where contype = 'f' and confdeltype <> 'r'
      and conrelid in ('public.lessons'::regclass, 'public.lesson_audio_files'::regclass, 'public.lesson_attachments'::regclass, 'public.lesson_progress'::regclass)),
  0, 'every foreign key on the lesson tables is ON DELETE RESTRICT (D25)');
select throws_ok($$ insert into public.lessons (course_id, title, position, created_by) values (tests.id('c1'), 'Clash', 1, tests.uid('t1')) $$,
  '23505', NULL, 'two lessons cannot share a position in a course (D08)');
select throws_ok($$ insert into public.lesson_audio_files (lesson_id, file_object_id, uploaded_by) values (tests.id('l1'), tests.id('f2'), tests.uid('t1')) $$,
  '23505', NULL, 'a lesson has exactly one ACTIVE audio file (D09)');
select throws_ok($$ update public.file_objects set waveform_peaks = array_fill(0.5::real, array[10]) where id = tests.id('f1') $$,
  '23514', NULL, 'waveform peaks are exactly 128 values');
select throws_ok($$ update public.file_objects set waveform_peaks = array_fill(1.5::real, array[128]) where id = tests.id('f1') $$,
  '23514', NULL, 'waveform peaks lie between 0 and 1');
select throws_ok($$ insert into public.lessons (course_id, title, position, created_by) values (tests.id('c1'), 'x', 9, tests.uid('t1')) $$,
  '23514', NULL, 'a lesson title has at least 3 characters');

-- ---------------------------------------------------------------- lessons: who sees what
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is((select count(*)::int from public.lessons where id in (tests.id('l1'), tests.id('l2'), tests.id('l3'), tests.id('l4'))), 4, 'an administrator (AAL2) sees every lesson');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.lessons where course_id in (tests.id('c1'), tests.id('c3'))), 3, 'a lecturer sees every lesson of their courses, drafts included');
select is((select count(*)::int from public.lessons where id = tests.id('l3')), 0, 'a lecturer cannot see another lecturer''s lessons');
select throws_ok($$ insert into public.lessons (course_id, title, position, created_by) values (tests.id('c1'), 'Direct', 7, tests.uid('t1')) $$,
  '42501', NULL, 'a lecturer cannot insert a lesson directly (save goes through the server, which cleans the HTML)');
select throws_ok($$ update public.lessons set content = '<script>alert(1)</script>' where id = tests.id('l1') $$,
  '42501', NULL, 'a lecturer cannot write lesson content directly');
select tests.reset();
select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select title from public.lessons order by title $$, $$ values ('Welcome and overview') $$,
  'an enrolled learner sees only published lessons of published courses they are enrolled in');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
select is((select count(*)::int from public.lessons where id = tests.id('l1')), 1, 'a COMPLETED enrolment keeps reading lessons (D05)');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select is((select count(*)::int from public.lessons), 0, 'a learner without enrolment sees no lesson');
select tests.reset();
select tests.authenticate_as(tests.uid('ls'));
select is((select count(*)::int from public.lessons), 0, 'a suspended learner sees no lesson');
select tests.reset();
select tests.as_anon();
select throws_ok($$ select count(*) from public.lessons $$, '42501', NULL, 'a visitor cannot read lessons');
select tests.reset();

-- ---------------------------------------------------------------- lesson_media(): the player's facts
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.lesson_media(tests.id('l1')) where kind = 'AUDIO'), 1, 'lesson_media: an enrolled learner gets the one ACTIVE audio file');
select is((select storage_path from public.lesson_media(tests.id('l1')) where kind = 'AUDIO'), tests.id('c1') || '/' || tests.id('l1') || '/f1.mp3',
  'lesson_media: the ACTIVE file, not the superseded one');
select is((select array_length(waveform_peaks, 1) from public.lesson_media(tests.id('l1')) where kind = 'AUDIO'), 128, 'lesson_media: with its 128 waveform peaks');
select results_eq($$ select title from public.lesson_media(tests.id('l1')) where kind = 'ATTACHMENT' $$, $$ values ('Lesson notes') $$,
  'lesson_media: attachments that were not removed');
select is((select count(*)::int from public.lesson_media(tests.id('l2'))), 0, 'lesson_media: nothing for a draft lesson');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select is((select count(*)::int from public.lesson_media(tests.id('l1'))), 0, 'lesson_media: nothing for a learner who is not enrolled');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.lesson_media(tests.id('l1')) where kind = 'AUDIO'), 1, 'lesson_media: the lecturer gets the ACTIVE audio');
select is((select count(*)::int from public.lesson_audio_files where lesson_id = tests.id('l1')), 2, 'the lecturer sees the audio history (ACTIVE and SUPERSEDED)');
select tests.reset();
select tests.authenticate_as(tests.uid('t2'));
select is((select count(*)::int from public.lesson_media(tests.id('l1'))), 0, 'lesson_media: nothing for another lecturer');
select tests.reset();

-- ---------------------------------------------------------------- Storage: lesson-audio
select ok(exists (select 1 from storage.buckets where id = 'lesson-audio' and not public and file_size_limit = 104857600), 'lesson-audio is private and capped at 100 MB (D17)');
select ok(exists (select 1 from storage.buckets where id = 'lesson-attachments' and not public and file_size_limit = 26214400), 'lesson-attachments is private and capped at 25 MB (D17)');
select tests.authenticate_as(tests.uid('l1'));
select is(tests.readable('lesson-audio'), array['f1.mp3'], 'an enrolled learner streams and downloads only the ACTIVE, VALIDATED audio of a published lesson');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
select is(tests.readable('lesson-audio'), array['f1.mp3'], 'a learner with a COMPLETED enrolment can still play the audio (D05)');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select is(tests.readable('lesson-audio'), '{}'::text[], 'an unenrolled learner is denied at Storage level');
select tests.reset();
select tests.authenticate_as(tests.uid('ls'));
select is(tests.readable('lesson-audio'), '{}'::text[], 'a suspended learner is denied at Storage level');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is(tests.readable('lesson-audio'), array['f0.mp3', 'f1.mp3', 'f4.mp3'], 'the course lecturer reads VALIDATED audio, history and drafts included, never PENDING or REJECTED');
select tests.reset();
select tests.authenticate_as(tests.uid('t2'));
select is(tests.readable('lesson-audio'), '{}'::text[], 'another lecturer is denied at Storage level');
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is(tests.readable('lesson-audio'), array['f0.mp3', 'f1.mp3', 'f4.mp3'], 'an administrator reads VALIDATED audio only');
select tests.reset();
select tests.as_anon();
select is(tests.readable('lesson-audio'), '{}'::text[], 'a visitor reads nothing');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('lesson-audio', tests.id('c1') || '/' || tests.id('l1') || '/x.mp3', tests.uid('t1')::text) $$,
  '42501', NULL, 'nobody writes to lesson-audio directly (the upload pipeline does)');
select tests.reset();

-- ---------------------------------------------------------------- Storage: lesson-attachments
select tests.authenticate_as(tests.uid('l1'));
select is(tests.readable('lesson-attachments'), array['f5.pdf'], 'an enrolled learner reads attachments that were not removed');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select is(tests.readable('lesson-attachments'), '{}'::text[], 'an unenrolled learner reads no attachment');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is(tests.readable('lesson-attachments'), array['f5.pdf', 'f6.pdf'], 'the lecturer reads every attachment of their lessons');
select tests.reset();

-- ---------------------------------------------------------------- progress
select has_function('public', 'mark_lesson', array['uuid', 'boolean'], 'mark_lesson exists');
select tests.authenticate_as(tests.uid('l1'));
select lives_ok($$ select public.mark_lesson(tests.id('l1'), true) $$, 'an ACTIVE learner marks a published lesson complete');
select is((select completion_status::text from public.lesson_progress where lesson_id = tests.id('l1')), 'COMPLETED', 'the lesson is recorded as completed');
select lives_ok($$ select public.mark_lesson(tests.id('l1'), false) $$, 'and can mark it not complete again (Undo)');
select throws_ok($$ select public.mark_lesson(tests.id('l2'), true) $$, '42501', NULL, 'a draft lesson cannot be marked');
select throws_ok($$ insert into public.lesson_progress (learner_id, lesson_id, completion_status) values (tests.uid('l1'), tests.id('l1'), 'COMPLETED') $$,
  '42501', NULL, 'progress is written only through mark_lesson');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
select throws_ok($$ select public.mark_lesson(tests.id('l1'), true) $$, '42501', NULL, 'a COMPLETED enrolment is read-only: no progress changes (D05)');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select throws_ok($$ select public.mark_lesson(tests.id('l1'), true) $$, '42501', NULL, 'a learner who is not enrolled cannot mark a lesson');
select is((select count(*)::int from public.lesson_progress), 0, 'a learner sees only their own progress');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.lesson_progress where lesson_id = tests.id('l1')), 1, 'the course lecturer sees progress on their lessons');
select tests.reset();
select tests.authenticate_as(tests.uid('t2'));
select is((select count(*)::int from public.lesson_progress where lesson_id = tests.id('l1')), 0, 'another lecturer does not');
select tests.reset();

-- ---------------------------------------------------------------- archiving keeps audio (D07, D09)
update public.courses set status = 'ARCHIVED', archived_at = now() where id = tests.id('c1');
select is((select status::text from public.file_objects where id = tests.id('f1')), 'VALIDATED', 'archiving a course leaves its audio file intact');
select is((select lifecycle_status::text from public.lesson_audio_files where file_object_id = tests.id('f1')), 'ACTIVE', 'and the ACTIVE audio stays ACTIVE');
select tests.authenticate_as(tests.uid('l1'));
select is(tests.readable('lesson-audio'), array['f1.mp3'], 'an enrolled learner can still play the audio of an archived course (D07)');
select throws_ok($$ select public.mark_lesson(tests.id('l1'), true) $$, '42501', NULL, 'but an ARCHIVED course is read-only: no progress changes (D07)');
select tests.reset();
select is((select count(*)::int from public.files_due_for_cleanup(500) f where f.id in (tests.id('f0'), tests.id('f1'), tests.id('f4'), tests.id('f5'), tests.id('f6'))), 0,
  'the cleanup job never removes lesson audio or attachments, superseded or removed ones included');

select * from finish();
rollback;
