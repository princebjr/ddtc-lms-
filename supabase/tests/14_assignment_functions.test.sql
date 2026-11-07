-- Phase 7: the trusted assignment functions behind manage-assignments and finalize-upload. Only the
-- service role may call them; each re-checks the actor (an AAL2-verified administrator is passed as
-- p_as_admin) and the course rights, refuses archived courses (D07), and audits. D12 (categories),
-- D29 (snapshots of published assignments, deadline changes audited), ADR-009 (answers always accept
-- text and audio), D25 (nothing deleted).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(43);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.t3', tests.create_user('t3@example.test', 'Ruth', 'Tetteh', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at, archived_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now(), null),
  (tests.id('c2'), 'Church History', 'HIS200', tests.uid('t1'), 'PUBLISHED', now(), null),
  (tests.id('c3'), 'Old course', 'OLD100', tests.uid('t1'), 'PUBLISHED', now(), null);
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.id('c1'), tests.uid('t3'), 'CO_LECTURER', tests.uid('t1')),
  (tests.id('c2'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.id('c3'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.lessons (id, course_id, title, content, position, publication_status, created_by, published_at) values
  (tests.id('e1'), tests.id('c1'), 'The Creation Account', '<p>Genesis 1</p>', 1, 'PUBLISHED', tests.uid('t1'), now());
select set_config('t.cat1', (select id::text from public.grade_categories where course_id = tests.id('c1')), true);
select set_config('t.cat2', (select id::text from public.grade_categories where course_id = tests.id('c2')), true);

/** The fields of an assignment, as the server sends them. */
create function tests.fields(p_title text, p_type text, p_text text, p_category uuid, p_formats text[] default array['TEXT', 'AUDIO']) returns jsonb language sql immutable as $$
  select jsonb_build_object('title', p_title, 'description', 'Read and respond.', 'lesson_id', null, 'category_id', p_category,
    'content_type', p_type, 'text_instructions', p_text, 'due_at', '2030-01-20T23:59:00Z', 'allow_late', false,
    'max_marks', 20, 'accepted_formats', to_jsonb(p_formats), 'grading_criteria', 'Clarity and use of Scripture.')
$$;
grant execute on function tests.fields(text, text, text, uuid, text[]) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- who may call
select has_function('public', 'grade_categories_save', array['uuid', 'boolean', 'uuid', 'jsonb'], 'grade_categories_save exists');
select has_function('public', 'assignment_save', array['uuid', 'boolean', 'uuid', 'uuid', 'jsonb', 'text'], 'assignment_save exists');
select has_function('public', 'assignment_set_publication', array['uuid', 'boolean', 'uuid', 'boolean'], 'assignment_set_publication exists');
select has_function('public', 'assignment_set_archived', array['uuid', 'boolean', 'uuid', 'boolean'], 'assignment_set_archived exists');
select has_function('public', 'assignment_audio_activate', array['uuid', 'boolean', 'uuid'], 'assignment_audio_activate exists');
select is(
  (select count(*)::int from unnest(array[
     'public.grade_categories_save(uuid, boolean, uuid, jsonb)',
     'public.assignment_save(uuid, boolean, uuid, uuid, jsonb, text)',
     'public.assignment_set_publication(uuid, boolean, uuid, boolean)',
     'public.assignment_set_archived(uuid, boolean, uuid, boolean)',
     'public.assignment_audio_activate(uuid, boolean, uuid)']) f
    where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')),
  0, 'no signed-in client or visitor can call the trusted assignment functions');

-- ---------------------------------------------------------------- categories (D12)
select tests.as_service();
select is((public.grade_categories_save(tests.uid('t1'), false, tests.id('c1'),
  jsonb_build_array(jsonb_build_object('id', current_setting('t.cat1'), 'name', 'Assignments', 'weight', 60), jsonb_build_object('name', 'Participation', 'weight', 40))) ->> 'total')::int, 100,
  'the owner saves two categories totalling 100');
select throws_ok($$ select public.grade_categories_save(tests.uid('t2'), false, tests.id('c1'), '[{"name": "Mine", "weight": 100}]') $$, '42501', NULL,
  'a lecturer who does not teach the course cannot change its categories');
select throws_ok($$ select public.grade_categories_save(tests.uid('l1'), false, tests.id('c1'), '[{"name": "Mine", "weight": 100}]') $$, '42501', NULL,
  'a learner cannot change categories');
select throws_ok($$ select public.grade_categories_save(tests.uid('t1'), false, tests.id('c1'), '[{"name": "Work", "weight": 50}, {"name": "work", "weight": 50}]') $$, '22023', NULL,
  'two categories cannot share a name');
select throws_ok($$ select public.grade_categories_save(tests.uid('t1'), false, tests.id('c1'), '[{"name": "Work", "weight": 120}]') $$, '22023', NULL,
  'a weight above 100 is refused');
select lives_ok($$ select public.grade_categories_save(tests.uid('t3'), false, tests.id('c1'),
  jsonb_build_array(jsonb_build_object('id', current_setting('t.cat1'), 'name', 'Assignments', 'weight', 70),
                    jsonb_build_object('id', (select id from public.grade_categories where course_id = tests.id('c1') and name = 'Participation'), 'name', 'Participation', 'weight', 30))) $$,
  'a co-lecturer changes the weights');
select tests.reset();
select results_eq($$ select name, weight, position from public.grade_categories where course_id = tests.id('c1') and archived_at is null order by position $$,
  $$ values ('Assignments', 70, 1), ('Participation', 30, 2) $$, 'the categories, weights and order are saved');
select is((select count(*)::int from public.audit_logs where action = 'course.categories_saved' and entity_id = tests.id('c1')::text), 2, 'saving categories is audited');

-- ---------------------------------------------------------------- saving assignments
select tests.as_service();
select set_config('t.g1', public.assignment_save(tests.uid('t1'), false, tests.id('c1'), null,
  tests.fields('Reflection on Genesis 1', 'TEXT', '<p>Read Genesis 1.</p>', current_setting('t.cat1')::uuid, array['PDF']), null)::text, true);
select tests.reset();
select results_eq($$ select publication_status::text, created_by, accepted_formats, max_marks from public.assignments where id = current_setting('t.g1')::uuid $$,
  $$ values ('DRAFT', tests.uid('t1'), array['TEXT', 'AUDIO', 'PDF'], 20.00::numeric) $$,
  'a new assignment is a DRAFT by its creator, and it always accepts text and audio answers (PDF added as asked; ADR-009)');
select tests.as_service();
select lives_ok($$ select public.assignment_save(tests.uid('t3'), false, tests.id('c1'), current_setting('t.g1')::uuid,
  tests.fields('Reflection on Genesis 1 and 2', 'TEXT', '<p>Read Genesis 1 and 2.</p>', current_setting('t.cat1')::uuid), null) $$, 'a co-lecturer edits it');
select lives_ok($$ select public.assignment_save(tests.uid('a1'), true, tests.id('c1'), null,
  tests.fields('Admin task', 'TEXT', '<p>Task.</p>', current_setting('t.cat1')::uuid), null) $$, 'an administrator creates one');
select throws_ok($$ select public.assignment_save(tests.uid('t2'), false, tests.id('c1'), null, tests.fields('Not mine', 'TEXT', '<p>x</p>', current_setting('t.cat1')::uuid), null) $$,
  '42501', NULL, 'a lecturer who does not teach the course cannot create one');
select throws_ok($$ select public.assignment_save(tests.uid('l1'), false, tests.id('c1'), null, tests.fields('Learner', 'TEXT', '<p>x</p>', current_setting('t.cat1')::uuid), null) $$,
  '42501', NULL, 'a learner cannot create one');
select throws_ok($$ select public.assignment_save(tests.uid('t1'), false, tests.id('c1'), null, tests.fields('Wrong category', 'TEXT', '<p>x</p>', current_setting('t.cat2')::uuid), null) $$,
  '22023', NULL, 'the category must belong to the course');
select throws_ok($$ select public.assignment_save(tests.uid('t1'), false, tests.id('c2'), current_setting('t.g1')::uuid, tests.fields('Moved', 'TEXT', '<p>x</p>', current_setting('t.cat2')::uuid), null) $$,
  '22023', NULL, 'an assignment cannot be saved under another course');

-- ---------------------------------------------------------------- publishing and snapshots (D29)
select is(public.assignment_set_publication(tests.uid('t1'), false, current_setting('t.g1')::uuid, true) ->> 'status', 'PUBLISHED', 'the owner publishes a TEXT assignment with text');
select tests.reset();
select is((select count(*)::int from public.assignment_versions where assignment_id = current_setting('t.g1')::uuid), 1, 'publishing keeps a first snapshot');
select tests.as_service();
select set_config('t.g2', public.assignment_save(tests.uid('t1'), false, tests.id('c1'), null, tests.fields('Prayer journal', 'AUDIO', '', current_setting('t.cat1')::uuid), null)::text, true);
select throws_ok($$ select public.assignment_set_publication(tests.uid('t1'), false, current_setting('t.g2')::uuid, true) $$,
  '22023', 'Add the instruction audio before publishing', 'an AUDIO assignment cannot be published without its audio');
select set_config('t.g3', public.assignment_save(tests.uid('t1'), false, tests.id('c1'), null, tests.fields('Empty text', 'TEXT', '<p> </p>', current_setting('t.cat1')::uuid), null)::text, true);
select throws_ok($$ select public.assignment_set_publication(tests.uid('t1'), false, current_setting('t.g3')::uuid, true) $$,
  '22023', 'Write the instructions before publishing', 'a TEXT assignment cannot be published with empty instructions');
select lives_ok($$ select public.assignment_save(tests.uid('t1'), false, tests.id('c1'), current_setting('t.g1')::uuid,
  tests.fields('Reflection on Genesis 1 and 2', 'TEXT', '<p>Read Genesis 1 and 2.</p>', current_setting('t.cat1')::uuid)
    || jsonb_build_object('due_at', '2030-01-27T23:59:00Z'), 'Extra week for the retreat') $$, 'the owner moves the due date of a published assignment, with a reason');
select lives_ok($$ select public.assignment_save(tests.uid('t1'), false, tests.id('c1'), current_setting('t.g1')::uuid,
  tests.fields('Reflection on Genesis 1 and 2', 'TEXT', '<p>Read Genesis 1 and 2.</p>', current_setting('t.cat1')::uuid)
    || jsonb_build_object('due_at', '2030-01-27T23:59:00Z'), null) $$, 'saving it again unchanged');
select tests.reset();
select results_eq($$ select version_number, change_reason from public.assignment_versions where assignment_id = current_setting('t.g1')::uuid order by version_number $$,
  $$ values (1, null::text), (2, 'Extra week for the retreat') $$, 'the change made a second snapshot with its reason; the unchanged save made none');
select is((select count(*)::int from public.audit_logs where action = 'assignment.due_date_changed' and entity_id = current_setting('t.g1')) , 1, 'the deadline change is audited');
select tests.as_service();
select is(public.assignment_set_publication(tests.uid('t1'), false, current_setting('t.g1')::uuid, false) ->> 'status', 'DRAFT', 'and it can be unpublished');

-- ---------------------------------------------------------------- archive and restore
select lives_ok($$ select public.assignment_set_archived(tests.uid('t1'), false, current_setting('t.g3')::uuid, true) $$, 'a mistaken draft is archived (never deleted)');
select throws_ok($$ select public.assignment_save(tests.uid('t1'), false, tests.id('c1'), current_setting('t.g3')::uuid, tests.fields('Edit', 'TEXT', '<p>x</p>', current_setting('t.cat1')::uuid), null) $$,
  '22023', NULL, 'an archived assignment cannot be edited');
select lives_ok($$ select public.assignment_set_archived(tests.uid('t1'), false, current_setting('t.g3')::uuid, false) $$, 'and it can be restored');
select throws_ok($$ select public.grade_categories_save(tests.uid('t1'), false, tests.id('c1'), jsonb_build_array(jsonb_build_object('name', 'Everything', 'weight', 100))) $$,
  '22023', NULL, 'a category that assignments use cannot be removed');

-- ---------------------------------------------------------------- instruction audio
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, duration_seconds, validated_at) values
  (tests.id('f1'), 'assignment-instructions-audio', tests.id('c1') || '/' || current_setting('t.g2') || '/f1.mp3', 'brief.mp3', 'brief.mp3', tests.uid('t1'), 'VALIDATED', 'ASSIGNMENT_INSTRUCTION_AUDIO', current_setting('t.g2')::uuid, 'audio/mpeg', 1000, 60, now()),
  (tests.id('f2'), 'assignment-instructions-audio', tests.id('c1') || '/' || current_setting('t.g2') || '/f2.mp3', 'brief2.mp3', 'brief2.mp3', tests.uid('t1'), 'VALIDATED', 'ASSIGNMENT_INSTRUCTION_AUDIO', current_setting('t.g2')::uuid, 'audio/mpeg', 1000, 60, now()),
  (tests.id('f3'), 'lesson-audio', tests.id('c1') || '/' || tests.id('e1') || '/f3.mp3', 'lesson.mp3', 'lesson.mp3', tests.uid('t1'), 'VALIDATED', 'LESSON_AUDIO', tests.id('e1'), 'audio/mpeg', 1000, 60, now());
select is(public.assignment_audio_activate(tests.uid('t1'), false, tests.id('f1')) ->> 'replaced', 'false', 'the instruction audio is attached');
select throws_ok($$ select public.assignment_audio_activate(tests.uid('t1'), false, tests.id('f3')) $$, '22023', NULL, 'a lesson audio file cannot become instruction audio');
select throws_ok($$ select public.assignment_audio_activate(tests.uid('t2'), false, tests.id('f2')) $$, '42501', NULL, 'another lecturer cannot attach audio');
select is(public.assignment_set_publication(tests.uid('t1'), false, current_setting('t.g2')::uuid, true) ->> 'status', 'PUBLISHED', 'with its audio the AUDIO assignment publishes');
select is(public.assignment_audio_activate(tests.uid('t1'), false, tests.id('f2')) ->> 'replaced', 'true', 'replacing the audio of a published assignment');
select tests.reset();
select is((select max(version_number)::int from public.assignment_versions where assignment_id = current_setting('t.g2')::uuid), 2, 'made a new snapshot');
select is((select status::text from public.file_objects where id = tests.id('f1')), 'VALIDATED', 'and the replaced file is kept (snapshots point at it)');

-- ---------------------------------------------------------------- archived courses are read-only (D07)
update public.courses set status = 'ARCHIVED', archived_at = now() where id = tests.id('c3');
select tests.as_service();
select throws_ok($$ select public.assignment_save(tests.uid('t1'), false, tests.id('c3'), null,
  tests.fields('After archive', 'TEXT', '<p>x</p>', (select id from public.grade_categories where course_id = tests.id('c3'))), null) $$,
  '22023', NULL, 'an archived course gets no new assignments');
select tests.reset();
select is((select count(*)::int from public.assignments where course_id = tests.id('c1')), 4, 'no assignment was deleted');

select * from finish();
rollback;
