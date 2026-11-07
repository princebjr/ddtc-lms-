-- Phase 6, ADR-007 (owner decisions 2026-11-07): lesson media management.
-- Up to 10 titled, ordered audio files per lesson; Delete for lesson audio (current or history),
-- attachments and course covers: the item leaves the lesson or course at once, the record is kept
-- (who deleted it and when) and the file is left for the server to remove from Storage (the
-- cleanup job retries). Only administrators and the course's lecturers may do it, only through the
-- trusted functions (service role); nobody may delete or change these rows or files directly.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(72);

-- ---------------------------------------------------------------- people, course, lesson
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.t3', tests.create_user('t3@example.test', 'Ruth', 'Tetteh', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
-- Fixture ids from short hex names: c = course, e = lesson, b = audio file, d = document, ae = attachment, cf = cover.
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;
/** The newest lesson_audio_files row for a file. */
create function tests.item(p text) returns uuid language sql stable as $$
  select id from public.lesson_audio_files where file_object_id = tests.id(p) order by created_at desc limit 1
$$;
/** A direct delete from Storage as the current role; how many objects went (0 when refused). */
create function tests.try_delete(p_bucket text) returns integer language plpgsql as $$
declare
  n integer;
begin
  delete from storage.objects where bucket_id = p_bucket;
  get diagnostics n = row_count;
  return n;
exception when others then
  return 0;
end;
$$;
/** Object names the current role can read in a bucket (last path segment), sorted. */
create function tests.readable(p_bucket text) returns text[] language sql stable as $$
  select coalesce(array_agg(split_part(name, '/', 3) order by name), '{}') from storage.objects where bucket_id = p_bucket and name like '00000000-0000-4000-8000-%'
$$;
grant execute on function tests.uid(text), tests.id(text), tests.item(text), tests.try_delete(text), tests.readable(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Foundations of Christianity', 'FOU100', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c3'), 'Church History', 'HIS200', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.id('c1'), tests.uid('t3'), 'CO_LECTURER', tests.uid('t1')),
  (tests.id('c2'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.id('c3'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1'));
insert into public.lessons (id, course_id, title, content, position, publication_status, created_by, published_at) values
  (tests.id('e1'), tests.id('c1'), 'Welcome and overview', '<p>Welcome</p>', 1, 'PUBLISHED', tests.uid('t1'), now()),
  (tests.id('e2'), tests.id('c1'), 'How to study the Bible', '<p>Read slowly</p>', 2, 'PUBLISHED', tests.uid('t1'), now()),
  (tests.id('e3'), tests.id('c3'), 'The early church', '<p>Acts</p>', 1, 'PUBLISHED', tests.uid('t1'), now());

-- Eleven VALIDATED audio files for lesson e1 (b01 to b11), one for e2 (b20), one for e3 (b30);
-- two attachments of e1 (d1, d2); covers for c1 and c2 (cf1, cf2).
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, duration_seconds, validated_at)
select tests.id(n), 'lesson-audio', tests.id('c1') || '/' || tests.id('e1') || '/' || n || '.mp3', 'part ' || n || '.mp3', n || '.mp3', tests.uid('t1'),
       'VALIDATED', 'LESSON_AUDIO', tests.id('e1'), 'audio/mpeg', 1000, 60, now()
  from unnest(array['b01', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07', 'b08', 'b09', 'b10', 'b11']) n;
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, duration_seconds, validated_at) values
  (tests.id('b20'), 'lesson-audio', tests.id('c1') || '/' || tests.id('e2') || '/b20.mp3', 'other.mp3', 'other.mp3', tests.uid('t1'), 'VALIDATED', 'LESSON_AUDIO', tests.id('e2'), 'audio/mpeg', 1000, 60, now()),
  (tests.id('b30'), 'lesson-audio', tests.id('c3') || '/' || tests.id('e3') || '/b30.mp3', 'acts.mp3', 'acts.mp3', tests.uid('t1'), 'VALIDATED', 'LESSON_AUDIO', tests.id('e3'), 'audio/mpeg', 1000, 60, now()),
  (tests.id('d1'), 'lesson-attachments', tests.id('c1') || '/' || tests.id('e1') || '/d1.pdf', 'notes.pdf', 'notes.pdf', tests.uid('t1'), 'VALIDATED', 'LESSON_ATTACHMENT', tests.id('e1'), 'application/pdf', 1000, null, now()),
  (tests.id('d2'), 'lesson-attachments', tests.id('c1') || '/' || tests.id('e1') || '/d2.pdf', 'slides.pdf', 'slides.pdf', tests.uid('t1'), 'VALIDATED', 'LESSON_ATTACHMENT', tests.id('e1'), 'application/pdf', 1000, null, now()),
  (tests.id('cf1'), 'course-covers', tests.id('c1') || '/cf1.png', 'cover.png', 'cover.png', tests.uid('t1'), 'VALIDATED', 'COURSE_COVER', tests.id('c1'), 'image/png', 1000, null, now()),
  (tests.id('cf2'), 'course-covers', tests.id('c2') || '/cf2.png', 'cover.png', 'cover.png', tests.uid('t1'), 'VALIDATED', 'COURSE_COVER', tests.id('c2'), 'image/png', 1000, null, now());
update public.courses set cover_image_file_id = tests.id('cf1') where id = tests.id('c1');
update public.courses set cover_image_file_id = tests.id('cf2') where id = tests.id('c2');
insert into storage.objects (bucket_id, name, owner_id, metadata)
select f.bucket_name, f.storage_path, tests.uid('t1')::text, '{"mimetype":"audio/mpeg","size":1000}'
  from public.file_objects f where f.id in (tests.id('b01'), tests.id('b02'), tests.id('b03'), tests.id('b04'), tests.id('d1'), tests.id('d2'), tests.id('cf1'));

-- ---------------------------------------------------------------- who may call
select has_function('public', 'lesson_audio_activate', array['uuid', 'boolean', 'uuid', 'uuid', 'text'], 'lesson_audio_activate takes the audio it replaces and a title');
select has_function('public', 'lesson_audio_delete', array['uuid', 'boolean', 'uuid'], 'lesson_audio_delete exists');
select has_function('public', 'lesson_audio_rename', array['uuid', 'boolean', 'uuid', 'text'], 'lesson_audio_rename exists');
select has_function('public', 'lesson_audio_reorder', array['uuid', 'boolean', 'uuid', 'uuid[]'], 'lesson_audio_reorder exists');
select has_function('public', 'lesson_attachment_delete', array['uuid', 'boolean', 'uuid'], 'lesson_attachment_delete exists');
select has_function('public', 'course_cover_remove', array['uuid', 'boolean', 'uuid'], 'course_cover_remove exists');
select hasnt_function('public', 'lesson_attachment_remove', array['uuid', 'boolean', 'uuid'], 'the old remove-but-keep-the-file function is gone');
select is(
  (select count(*)::int from unnest(array[
     'public.lesson_audio_activate(uuid, boolean, uuid, uuid, text)',
     'public.lesson_audio_delete(uuid, boolean, uuid)',
     'public.lesson_audio_rename(uuid, boolean, uuid, text)',
     'public.lesson_audio_reorder(uuid, boolean, uuid, uuid[])',
     'public.lesson_attachment_delete(uuid, boolean, uuid)',
     'public.course_cover_remove(uuid, boolean, uuid)']) f
    where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')),
  0, 'no signed-in client or visitor can call the media functions');
select is(
  (select count(*)::int from unnest(array[
     'public.lesson_audio_activate(uuid, boolean, uuid, uuid, text)',
     'public.lesson_audio_delete(uuid, boolean, uuid)',
     'public.lesson_audio_rename(uuid, boolean, uuid, text)',
     'public.lesson_audio_reorder(uuid, boolean, uuid, uuid[])',
     'public.lesson_attachment_delete(uuid, boolean, uuid)',
     'public.course_cover_remove(uuid, boolean, uuid)']) f
    where has_function_privilege('service_role', f, 'execute')),
  6, 'the service role (Edge Functions) can call all six');
select is(
  (select count(*)::int from unnest(array['public.lesson_audio_files', 'public.lesson_attachments', 'public.file_objects', 'public.courses']) t,
                              unnest(array['anon', 'authenticated']) r
    where has_table_privilege(r, t, 'delete')),
  0, 'no client role has DELETE on lesson audio, attachments, file records or courses');

-- ---------------------------------------------------------------- adding audio: up to 10, titled and ordered
select tests.as_service();
select is(public.lesson_audio_activate(tests.uid('t1'), false, tests.id('b01'), null, 'Part 1') ->> 'replaced', 'false', 'the first audio is added');
select lives_ok($$ select public.lesson_audio_activate(tests.uid('t3'), false, tests.id('b02'), null, null) $$, 'a co-lecturer adds a second audio');
select lives_ok($$ select public.lesson_audio_activate(tests.uid('t1'), false, tests.id(n), null, null) from unnest(array['b03', 'b04', 'b05', 'b06', 'b07', 'b08', 'b09', 'b10']) n $$,
  'and more, up to ten');
select throws_ok($$ select public.lesson_audio_activate(tests.uid('t1'), false, tests.id('b11'), null, null) $$, 'P0413', NULL,
  'an eleventh audio is refused (at most 10 per lesson)');
select tests.reset();
select results_eq($$ select title, position from public.lesson_audio_files where lesson_id = tests.id('e1') and position <= 2 order by position $$,
  $$ values ('Part 1', 1), ('part b02', 2) $$, 'each audio has a title (the file name when none is given) and a position in order');
select is((select count(*)::int from public.lesson_audio_files where lesson_id = tests.id('e1') and lifecycle_status = 'ACTIVE'), 10, 'the lesson has ten audio files');
select throws_ok($$ insert into public.lesson_audio_files (lesson_id, file_object_id, uploaded_by, title, position) values (tests.id('e1'), tests.id('b11'), tests.uid('t1'), 'Extra', 11) $$,
  '23514', NULL, 'the table itself refuses an eleventh position');
select throws_ok($$ insert into public.lesson_audio_files (lesson_id, file_object_id, uploaded_by, title, position) values (tests.id('e1'), tests.id('b11'), tests.uid('t1'), 'Clash', 1) $$,
  '23P01', NULL, 'two audio files of a lesson cannot share a position');

-- ---------------------------------------------------------------- replacing one audio keeps its place and history
select tests.as_service();
select is(public.lesson_audio_activate(tests.uid('t1'), false, tests.id('b11'), tests.item('b02'), null) ->> 'replaced', 'true',
  'replacing an audio works even with ten (it does not add one)');
select throws_ok($$ select public.lesson_audio_activate(tests.uid('t1'), false, tests.id('b20'), tests.item('b03'), null) $$, '22023', NULL,
  'an audio of one lesson cannot replace an audio of another');
select tests.reset();
select results_eq($$ select lifecycle_status::text, position, title from public.lesson_audio_files where file_object_id in (tests.id('b02'), tests.id('b11')) order by file_object_id $$,
  $$ values ('SUPERSEDED', null::int, 'part b02'), ('ACTIVE', 2, 'part b02') $$,
  'the new file takes the old one''s place and title; the old one is kept as history (D09)');

-- ---------------------------------------------------------------- learners get every audio, in order
select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select sort_order from public.lesson_media(tests.id('e1')) where kind = 'AUDIO' $$,
  $$ select generate_series(1, 10) $$, 'an enrolled learner gets the ten audio files in the lecturer''s order');
select is((select title from public.lesson_media(tests.id('e1')) where kind = 'AUDIO' and sort_order = 1), 'Part 1', 'with their titles');
select tests.reset();

-- ---------------------------------------------------------------- rename and reorder
select tests.as_service();
select lives_ok($$ select public.lesson_audio_rename(tests.uid('t3'), false, tests.item('b01'), '  Introduction  ') $$, 'a co-lecturer renames an audio');
select throws_ok($$ select public.lesson_audio_rename(tests.uid('t1'), false, tests.item('b01'), '   ') $$, '22023', NULL, 'a title cannot be empty');
select throws_ok($$ select public.lesson_audio_rename(tests.uid('t2'), false, tests.item('b01'), 'Mine now') $$, '42501', NULL, 'another lecturer cannot rename');
select throws_ok($$ select public.lesson_audio_rename(tests.uid('t1'), false, tests.item('b02'), 'Old version') $$, '22023', NULL, 'only an audio in use can be renamed');
select lives_ok($$ select public.lesson_audio_reorder(tests.uid('t1'), false, tests.id('e1'),
  array(select id from public.lesson_audio_files where lesson_id = tests.id('e1') and lifecycle_status = 'ACTIVE' order by position desc)) $$,
  'the lecturer reorders all the audio at once');
select throws_ok($$ select public.lesson_audio_reorder(tests.uid('t1'), false, tests.id('e1'), array[tests.item('b01')]) $$, '22023', NULL,
  'a reorder must list every audio of the lesson exactly once');
select throws_ok($$ select public.lesson_audio_reorder(tests.uid('l1'), false, tests.id('e1'),
  array(select id from public.lesson_audio_files where lesson_id = tests.id('e1') and lifecycle_status = 'ACTIVE' order by position)) $$, '42501', NULL,
  'a learner cannot reorder');
select tests.reset();
select results_eq($$ select title, position from public.lesson_audio_files where file_object_id in (tests.id('b01'), tests.id('b10')) order by position $$,
  $$ values ('part b10', 1), ('Introduction', 10) $$, 'the rename (trimmed) and the new order are saved');
select is((select count(*)::int from public.audit_logs where action in ('lesson.audio_renamed', 'lesson.audio_reordered') and entity_id = tests.id('e1')::text), 2,
  'renaming and reordering are audited');

-- ---------------------------------------------------------------- deleting audio
select tests.as_service();
select throws_ok($$ select public.lesson_audio_delete(tests.uid('l1'), false, tests.item('b04')) $$, '42501', NULL, 'a learner cannot delete audio');
select throws_ok($$ select public.lesson_audio_delete(tests.uid('t2'), false, tests.item('b04')) $$, '42501', NULL, 'a lecturer who does not teach the course cannot delete audio');
select throws_ok($$ select public.lesson_audio_delete(tests.uid('t1'), false, '00000000-0000-4000-8000-00000000dead') $$, 'P0002', NULL, 'an unknown audio is reported as not found');
select is(public.lesson_audio_delete(tests.uid('t3'), false, tests.item('b04')) ->> 'path', tests.id('c1') || '/' || tests.id('e1') || '/b04.mp3',
  'a co-lecturer deletes an audio in the middle of the list; the answer names the file for the server to remove from Storage');
select tests.reset();
select results_eq($$ select lifecycle_status::text, position, deleted_by from public.lesson_audio_files where file_object_id = tests.id('b04') $$,
  $$ values ('DELETED', null::int, tests.uid('t3')) $$, 'the record is kept, marked DELETED with who deleted it');
select isnt((select deleted_at from public.lesson_audio_files where file_object_id = tests.id('b04')), null, 'and when');
select results_eq($$ select position from public.lesson_audio_files where lesson_id = tests.id('e1') and lifecycle_status = 'ACTIVE' order by position $$,
  $$ select generate_series(1, 9) $$, 'the other audio files close the gap (positions 1 to 9)');
select tests.as_service();
select is(public.lesson_audio_delete(tests.uid('t1'), false, tests.item('b04')) ->> 'already', 'true', 'deleting it again is harmless (a double tap)');
select lives_ok($$ select public.lesson_audio_delete(tests.uid('a1'), true, tests.item('b02')) $$, 'an administrator deletes an old version from the history');
select tests.reset();
select is((select lifecycle_status::text from public.lesson_audio_files where file_object_id = tests.id('b02')), 'DELETED', 'the history version is marked DELETED too');
select is((select count(*)::int from public.audit_logs where action = 'lesson.audio_deleted' and entity_id = tests.id('e1')::text and actor_id in (tests.uid('t3'), tests.uid('a1'))), 2,
  'each deletion is audited once, with the person who did it');

-- Learners and lecturers lose the deleted files at once, before Storage removes them.
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.lesson_media(tests.id('e1')) where kind = 'AUDIO'), 9, 'learners get the nine remaining audio files');
select is(tests.readable('lesson-audio'), array['b01.mp3', 'b03.mp3'], 'a learner can no longer read a deleted file at Storage level');
select is(tests.try_delete('lesson-audio'), 0, 'a learner cannot delete a lesson file from Storage directly');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is(tests.readable('lesson-audio'), array['b01.mp3', 'b03.mp3'], 'the lecturer cannot read a deleted file either');
select is(tests.try_delete('lesson-audio'), 0, 'a lecturer cannot delete from Storage directly (only the server function can)');
select throws_ok($$ delete from public.lesson_audio_files where file_object_id = tests.id('b03') $$, '42501', NULL, 'nor delete an audio record directly');
select throws_ok($$ update public.lesson_audio_files set lifecycle_status = 'DELETED' where file_object_id = tests.id('b03') $$, '42501', NULL, 'nor mark one deleted directly');
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is(tests.try_delete('lesson-audio'), 0, 'even an administrator cannot delete from Storage directly');
select tests.reset();
select is((select count(*)::int from storage.objects where bucket_id = 'lesson-audio' and name like tests.id('c1') || '/%'), 4, 'every object is still there after those attempts');

-- The cleanup job removes deleted items' files (the server removes them at once; this is the retry).
select results_eq($$ select id, reason from public.files_due_for_cleanup(500) where id in (select f.id from public.file_objects f where f.resource_id = tests.id('e1')) order by id $$,
  $$ values (tests.id('b02'), 'deleted_lesson_audio'), (tests.id('b04'), 'deleted_lesson_audio') $$,
  'the cleanup job lists the deleted audio files and never the ones in use');
update public.file_objects set status = 'DELETED', deleted_at = now() where id = tests.id('b04');
select is((select count(*)::int from public.files_due_for_cleanup(500) where id = tests.id('b04')), 0, 'once removed from Storage it is not listed again');

-- ---------------------------------------------------------------- deleting attachments
insert into public.lesson_attachments (id, lesson_id, file_object_id, uploaded_by, title, position) values
  (tests.id('ae1'), tests.id('e1'), tests.id('d1'), tests.uid('t1'), 'Lesson notes', 1),
  (tests.id('ae2'), tests.id('e1'), tests.id('d2'), tests.uid('t1'), 'Slides', 2);
select tests.as_service();
select throws_ok($$ select public.lesson_attachment_delete(tests.uid('l1'), false, tests.id('ae1')) $$, '42501', NULL, 'a learner cannot delete an attachment');
select throws_ok($$ select public.lesson_attachment_delete(tests.uid('t2'), false, tests.id('ae1')) $$, '42501', NULL, 'another lecturer cannot delete an attachment');
select is(public.lesson_attachment_delete(tests.uid('t1'), false, tests.id('ae1')) ->> 'path', tests.id('c1') || '/' || tests.id('e1') || '/d1.pdf',
  'the lecturer deletes an attachment; the answer names the file to remove');
select tests.reset();
select results_eq($$ select removed_by from public.lesson_attachments where id = tests.id('ae1') and removed_at is not null $$,
  $$ values (tests.uid('t1')) $$, 'the attachment record is kept with who deleted it');
select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select title from public.lesson_media(tests.id('e1')) where kind = 'ATTACHMENT' $$, $$ values ('Slides') $$, 'learners no longer get the deleted attachment');
select is(tests.readable('lesson-attachments'), array['d2.pdf'], 'nor read its file');
select tests.reset();
select is((select reason from public.files_due_for_cleanup(500) where id = tests.id('d1')), 'deleted_lesson_attachment', 'the cleanup job lists the deleted attachment''s file');
select is((select count(*)::int from public.audit_logs where action = 'lesson.attachment_deleted' and actor_id = tests.uid('t1')), 1, 'the deletion is audited');

-- ---------------------------------------------------------------- removing a course cover
select tests.as_service();
select throws_ok($$ select public.course_cover_remove(tests.uid('l1'), false, tests.id('c1')) $$, '42501', NULL, 'a learner cannot remove a cover');
select throws_ok($$ select public.course_cover_remove(tests.uid('t2'), false, tests.id('c1')) $$, '42501', NULL, 'a lecturer who does not teach the course cannot remove its cover');
select is(public.course_cover_remove(tests.uid('t3'), false, tests.id('c1')) ->> 'path', tests.id('c1') || '/cf1.png', 'a co-lecturer removes the cover; the answer names the file');
select is(public.course_cover_remove(tests.uid('a1'), true, tests.id('c2')) ->> 'path', tests.id('c2') || '/cf2.png', 'an administrator removes any course''s cover');
select is(public.course_cover_remove(tests.uid('t1'), false, tests.id('c1')) -> 'file', 'null'::jsonb, 'removing when there is no cover is harmless');
select tests.reset();
select is((select count(*)::int from public.courses where id in (tests.id('c1'), tests.id('c2')) and cover_image_file_id is null), 2, 'both courses fall back to the placeholder');
select is((select count(*)::int from public.audit_logs where action = 'course.cover_removed'), 2, 'each removal is audited');
select tests.authenticate_as(tests.uid('t1'));
select throws_ok($$ update public.courses set cover_image_file_id = null where id = tests.id('c3') $$, '42501', NULL, 'a lecturer cannot change a cover directly');
select tests.reset();

-- ---------------------------------------------------------------- archived courses are read-only (D07)
select tests.as_service();
select public.lesson_audio_activate(tests.uid('t1'), false, tests.id('b30'), null, null);
select tests.reset();
update public.courses set status = 'ARCHIVED', archived_at = now() where id = tests.id('c3');
select tests.as_service();
select throws_ok($$ select public.lesson_audio_delete(tests.uid('t1'), false, tests.item('b30')) $$, '22023', NULL, 'an archived course''s audio cannot be deleted');
select tests.reset();
select is((select count(*)::int from public.lesson_audio_files where lesson_id = tests.id('e1')), 11, 'no audio record was ever deleted (ADR-007: the record is kept)');

select * from finish();
rollback;
