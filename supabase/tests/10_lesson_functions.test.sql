-- Phase 6: the trusted lesson functions behind manage-lessons and finalize-upload. Only the service
-- role (Edge Functions) may call them; each re-checks the actor (an AAL2-verified administrator is
-- passed as p_as_admin) and the course rights, and audits. D08 (ordered lessons, atomic reorder),
-- D09 (one ACTIVE audio, replacing keeps the old file as SUPERSEDED), D07 (archived = read-only),
-- D25 (nothing deleted).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(49);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.t3', tests.create_user('t3@example.test', 'Ruth', 'Tetteh', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  ('00000000-0000-4000-8000-0000000000c1', 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  ('00000000-0000-4000-8000-0000000000c2', 'Foundations of Christianity', 'FOU100', tests.uid('t1'), 'PUBLISHED', now());
select set_config('t.c1', '00000000-0000-4000-8000-0000000000c1', true);
select set_config('t.c2', '00000000-0000-4000-8000-0000000000c2', true);
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.uid('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.uid('c1'), tests.uid('t3'), 'CO_LECTURER', tests.uid('t1')),
  (tests.uid('c2'), tests.uid('t1'), 'OWNER', tests.uid('t1'));

-- ---------------------------------------------------------------- who may call
select has_function('public', 'lesson_save', array['uuid', 'boolean', 'uuid', 'uuid', 'text', 'text'], 'lesson_save exists');
select has_function('public', 'lesson_set_publication', array['uuid', 'boolean', 'uuid', 'boolean'], 'lesson_set_publication exists');
select has_function('public', 'lesson_reorder', array['uuid', 'boolean', 'uuid', 'uuid[]'], 'lesson_reorder exists');
select has_function('public', 'lesson_audio_activate', array['uuid', 'boolean', 'uuid'], 'lesson_audio_activate exists');
select has_function('public', 'lesson_attachment_add', array['uuid', 'boolean', 'uuid', 'text'], 'lesson_attachment_add exists');
select has_function('public', 'lesson_attachment_remove', array['uuid', 'boolean', 'uuid'], 'lesson_attachment_remove exists');
select is(
  (select count(*)::int from unnest(array[
     'public.lesson_save(uuid, boolean, uuid, uuid, text, text)',
     'public.lesson_set_publication(uuid, boolean, uuid, boolean)',
     'public.lesson_reorder(uuid, boolean, uuid, uuid[])',
     'public.lesson_audio_activate(uuid, boolean, uuid)',
     'public.lesson_attachment_add(uuid, boolean, uuid, text)',
     'public.lesson_attachment_remove(uuid, boolean, uuid)']) f
    where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')),
  0, 'no signed-in client or visitor can call the trusted lesson functions');
select is(
  (select count(*)::int from unnest(array[
     'public.lesson_save(uuid, boolean, uuid, uuid, text, text)',
     'public.lesson_set_publication(uuid, boolean, uuid, boolean)',
     'public.lesson_reorder(uuid, boolean, uuid, uuid[])',
     'public.lesson_audio_activate(uuid, boolean, uuid)',
     'public.lesson_attachment_add(uuid, boolean, uuid, text)',
     'public.lesson_attachment_remove(uuid, boolean, uuid)']) f
    where has_function_privilege('service_role', f, 'execute')),
  6, 'the service role can call all six');

-- ---------------------------------------------------------------- save
select tests.as_service();
select set_config('t.s1', public.lesson_save(tests.uid('t1'), false, tests.uid('c1'), null, 'Welcome and overview', '<p>Welcome</p>')::text, true);
select set_config('t.s2', public.lesson_save(tests.uid('t3'), false, tests.uid('c1'), null, 'How to study the Bible', '<p>Read slowly</p>')::text, true);
select set_config('t.s3', public.lesson_save(tests.uid('a1'), true, tests.uid('c1'), null, 'The Creation Account', '<p>Genesis 1</p>')::text, true);
select tests.reset();
select results_eq($$ select title, position, publication_status::text from public.lessons where course_id = tests.uid('c1') order by position $$,
  $$ values ('Welcome and overview', 1, 'DRAFT'), ('How to study the Bible', 2, 'DRAFT'), ('The Creation Account', 3, 'DRAFT') $$,
  'new lessons are DRAFT and go to the end, from the owner, a co-lecturer or an administrator');
select is((select count(*)::int from public.audit_logs where action = 'lesson.created' and metadata ->> 'course' = tests.uid('c1')::text), 3, 'each new lesson is audited');
select tests.as_service();
select throws_ok($$ select public.lesson_save(tests.uid('t2'), false, tests.uid('c1'), null, 'Not mine', '<p>x</p>') $$, '42501', NULL,
  'a lecturer who does not teach the course cannot add a lesson');
select throws_ok($$ select public.lesson_save(tests.uid('l1'), false, tests.uid('c1'), null, 'Learner lesson', '<p>x</p>') $$, '42501', NULL,
  'a learner cannot add a lesson');
select throws_ok($$ select public.lesson_save(tests.uid('t1'), false, tests.uid('c2'), tests.uid('s1'), 'Wrong course', '<p>x</p>') $$, '22023', NULL,
  'a lesson cannot be saved under another course');
select lives_ok($$ select public.lesson_save(tests.uid('t1'), false, tests.uid('c1'), tests.uid('s1'), 'Welcome to the course', '<p>Welcome, everyone</p>') $$,
  'the lecturer updates a lesson');
select throws_ok($$ select public.lesson_save(tests.uid('t1'), false, tests.uid('c1'), tests.uid('s1'), 'Unsafe', '<p>hi</p><script>alert(1)</script>') $$, '23514', NULL,
  'a bare script element is refused by the database (second layer behind the server''s cleaning)');
select throws_ok($$ select public.lesson_save(tests.uid('t1'), false, tests.uid('c1'), tests.uid('s1'), 'Unsafe', '<p><a href=" javascript:alert(1)">x</a></p>') $$, '23514', NULL,
  'a script URL in a link is refused by the database');
select lives_ok($$ select public.lesson_save(tests.uid('t1'), false, tests.uid('c1'), tests.uid('s1'), 'Welcome to the course', '<p>Read <a href="https://example.org/metadata:list">the list</a>. JavaScript: a language.</p>') $$,
  'ordinary links and prose that mention "data:" or "JavaScript:" are fine');
select throws_ok($$ select public.lesson_save(tests.uid('t1'), false, tests.uid('c1'), tests.uid('s1'), 'Unsafe', '<p onclick="x()">hi</p><script>alert(1)</script>') $$, '23514', NULL,
  'content with scripts or event handlers is refused by the database too (the server cleans it first)');
select tests.reset();
select is((select title from public.lessons where id = tests.uid('s1')), 'Welcome to the course', 'the update was saved');

-- ---------------------------------------------------------------- publish
select tests.as_service();
select is(public.lesson_set_publication(tests.uid('t3'), false, tests.uid('s1'), true) ->> 'status', 'PUBLISHED', 'a co-lecturer publishes a lesson');
select is(public.lesson_set_publication(tests.uid('t1'), false, tests.uid('s2'), true) ->> 'status', 'PUBLISHED', 'the owner publishes another');
select is(public.lesson_set_publication(tests.uid('t1'), false, tests.uid('s2'), false) ->> 'status', 'DRAFT', 'and unpublishes it (Undo)');
select throws_ok($$ select public.lesson_set_publication(tests.uid('t2'), false, tests.uid('s1'), false) $$, '42501', NULL,
  'another lecturer cannot unpublish');
select tests.reset();
select isnt((select published_at from public.lessons where id = tests.uid('s1')), null, 'published_at is set');
select is((select count(*)::int from public.audit_logs where action in ('lesson.published', 'lesson.unpublished') and entity_id in (tests.uid('s1')::text, tests.uid('s2')::text)), 3,
  'publishing and unpublishing are audited');

-- ---------------------------------------------------------------- reorder (D08)
select tests.as_service();
select lives_ok($$ select public.lesson_reorder(tests.uid('t1'), false, tests.uid('c1'), array[tests.uid('s3'), tests.uid('s1'), tests.uid('s2')]) $$,
  'the lecturer reorders all lessons at once');
select tests.reset();
select results_eq($$ select title from public.lessons where course_id = tests.uid('c1') order by position $$,
  $$ values ('The Creation Account'), ('Welcome to the course'), ('How to study the Bible') $$, 'the new order is saved');
select results_eq($$ select position from public.lessons where course_id = tests.uid('c1') order by position $$,
  $$ values (1), (2), (3) $$, 'positions stay 1, 2, 3 with no gaps');
select tests.as_service();
select throws_ok($$ select public.lesson_reorder(tests.uid('t1'), false, tests.uid('c1'), array[tests.uid('s1'), tests.uid('s2')]) $$, '22023', NULL,
  'a reorder must list every lesson of the course exactly once');
select throws_ok($$ select public.lesson_reorder(tests.uid('t1'), false, tests.uid('c1'), array[tests.uid('s1'), tests.uid('s1'), tests.uid('s2')]) $$, '22023', NULL,
  'a lesson cannot appear twice');
select throws_ok($$ select public.lesson_reorder(tests.uid('t2'), false, tests.uid('c1'), array[tests.uid('s1'), tests.uid('s2'), tests.uid('s3')]) $$, '42501', NULL,
  'another lecturer cannot reorder');
select tests.reset();
select is((select count(*)::int from public.audit_logs where action = 'lesson.reordered' and entity_id = tests.uid('c1')::text), 1, 'the reorder is audited');

-- ---------------------------------------------------------------- audio (D09)
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, duration_seconds, validated_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'lesson-audio', tests.uid('c1') || '/' || tests.uid('s1') || '/a1.mp3', 'one.mp3', 'one.mp3', tests.uid('t1'), 'VALIDATED', 'LESSON_AUDIO', tests.uid('s1'), 'audio/mpeg', 1000, 60, now()),
  ('00000000-0000-4000-8000-0000000000a2', 'lesson-audio', tests.uid('c1') || '/' || tests.uid('s1') || '/a2.mp3', 'two.mp3', 'two.mp3', tests.uid('t3'), 'VALIDATED', 'LESSON_AUDIO', tests.uid('s1'), 'audio/mpeg', 1000, 60, now()),
  ('00000000-0000-4000-8000-0000000000a3', 'lesson-audio', tests.uid('c1') || '/' || tests.uid('s1') || '/a3.mp3', 'three.mp3', 'three.mp3', tests.uid('t1'), 'PENDING', 'LESSON_AUDIO', tests.uid('s1'), null, null, null, null),
  ('00000000-0000-4000-8000-0000000000a4', 'lesson-attachments', tests.uid('c1') || '/' || tests.uid('s1') || '/a4.pdf', 'notes.pdf', 'notes.pdf', tests.uid('t1'), 'VALIDATED', 'LESSON_ATTACHMENT', tests.uid('s1'), 'application/pdf', 1000, null, now()),
  ('00000000-0000-4000-8000-0000000000a5', 'lesson-audio', tests.uid('c1') || '/' || tests.uid('s1') || '/a5.mp3', 'five.mp3', 'five.mp3', tests.uid('t2'), 'VALIDATED', 'LESSON_AUDIO', tests.uid('s1'), 'audio/mpeg', 1000, 60, now());
select tests.as_service();
select is((public.lesson_audio_activate(tests.uid('t1'), false, '00000000-0000-4000-8000-0000000000a1') ->> 'replaced')::boolean, false, 'the first audio becomes ACTIVE');
select is((public.lesson_audio_activate(tests.uid('t3'), false, '00000000-0000-4000-8000-0000000000a2') ->> 'replaced')::boolean, true, 'a second audio replaces it');
select throws_ok($$ select public.lesson_audio_activate(tests.uid('t1'), false, '00000000-0000-4000-8000-0000000000a3') $$, '22023', NULL,
  'only a VALIDATED file can become the lesson audio');
select throws_ok($$ select public.lesson_audio_activate(tests.uid('t1'), false, '00000000-0000-4000-8000-0000000000a4') $$, '22023', NULL,
  'an attachment cannot become the lesson audio');
select throws_ok($$ select public.lesson_audio_activate(tests.uid('t2'), false, '00000000-0000-4000-8000-0000000000a5') $$, '42501', NULL,
  'a lecturer who does not teach the course cannot attach audio');
select tests.reset();
select results_eq($$ select file_object_id::text, lifecycle_status::text from public.lesson_audio_files where lesson_id = tests.uid('s1') order by file_object_id $$,
  $$ values ('00000000-0000-4000-8000-0000000000a1', 'SUPERSEDED'), ('00000000-0000-4000-8000-0000000000a2', 'ACTIVE') $$,
  'replacing keeps the old file as SUPERSEDED history (D09)');
select is((select status::text from public.file_objects where id = '00000000-0000-4000-8000-0000000000a1'), 'VALIDATED', 'the superseded file itself is kept');
select is((select count(*)::int from public.audit_logs where action in ('lesson.audio_added', 'lesson.audio_replaced') and entity_id = tests.uid('s1')::text), 2, 'adding and replacing audio are audited');

-- ---------------------------------------------------------------- attachments
select tests.as_service();
select set_config('t.x1', public.lesson_attachment_add(tests.uid('t1'), false, '00000000-0000-4000-8000-0000000000a4', 'Lesson notes')::text, true);
select throws_ok($$ select public.lesson_attachment_add(tests.uid('t1'), false, '00000000-0000-4000-8000-0000000000a2', 'Audio as attachment') $$, '22023', NULL,
  'an audio file cannot be added as an attachment');
select lives_ok($$ select public.lesson_attachment_remove(tests.uid('t3'), false, tests.uid('x1')) $$, 'a co-lecturer removes an attachment');
select tests.reset();
select isnt((select removed_at from public.lesson_attachments where id = tests.uid('x1')), null, 'removing keeps the row (removed_at set)');
select is((select status::text from public.file_objects where id = '00000000-0000-4000-8000-0000000000a4'), 'VALIDATED', 'and keeps the file');

-- ---------------------------------------------------------------- archived course is read-only (D07)
update public.courses set status = 'ARCHIVED', archived_at = now() where id = tests.uid('c1');
select tests.as_service();
select throws_ok($$ select public.lesson_save(tests.uid('t1'), false, tests.uid('c1'), tests.uid('s1'), 'Edited after archive', '<p>x</p>') $$, '22023', NULL,
  'an archived course''s lessons cannot be edited');
select throws_ok($$ select public.lesson_set_publication(tests.uid('t1'), false, tests.uid('s3'), true) $$, '22023', NULL,
  'or published');
select throws_ok($$ select public.lesson_reorder(tests.uid('t1'), false, tests.uid('c1'), array[tests.uid('s1'), tests.uid('s2'), tests.uid('s3')]) $$, '22023', NULL,
  'or reordered');
select tests.reset();
select is((select count(*)::int from public.lessons where course_id = tests.uid('c1')), 3, 'no lesson was deleted');
select is((select count(*)::int from public.lesson_audio_files where lesson_id = tests.uid('s1')), 2, 'no audio row was deleted');

select * from finish();
rollback;
