-- Phase 10.1, step C (ADR-016; owner answer 8 of 2026-11-10: examinations take text and audio answers):
-- - a recording for a short-answer or essay question goes through the upload pipeline (D18):
--   exam_prepare_upload checks the learner's open attempt and the question first; multiple choice takes
--   no recording;
-- - an answer can carry only the learner's own validated recording for that attempt;
-- - only the learner and the course's managers can play it (Storage policy), and exam_answer_audio lists
--   the recordings for them only;
-- - an answer given only as a recording is not marked 0 as blank on submission.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(14);

select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select tests.id('c1'), tests.uid(l), 'ACTIVE', tests.uid('a1') from unnest(array['l1', 'l2']) l;

select tests.as_service();
create temporary table ex as select public.exam_save(tests.uid('t1'), false, tests.id('c1'), null,
  jsonb_build_object('title', 'Final examination', 'opens_at', now() - interval '1 hour', 'closes_at', now() + interval '1 day')) as id;
select public.exam_structure_save(tests.uid('t1'), false, (select id from ex), jsonb_build_array(jsonb_build_object('title', 'A', 'questions', jsonb_build_array(
  jsonb_build_object('kind', 'MCQ', 'prompt', 'Pick', 'marks', 1, 'correct', 'A', 'options', jsonb_build_object('A', 'w', 'B', 'x', 'C', 'y', 'D', 'z')),
  jsonb_build_object('kind', 'ESSAY', 'prompt', 'Speak about covenant', 'marks', 10)))));
select public.exam_publish(tests.uid('t1'), false, (select id from ex), true);
select tests.reset();
create function tests.q(p_kind public.exam_question_kind) returns uuid language sql stable as $$
  select q.id from public.exam_questions q where q.exam_id = (select id from ex) and q.kind = p_kind and q.archived_at is null
$$;
grant select on ex to authenticated, service_role;
grant execute on function tests.q(public.exam_question_kind) to authenticated, service_role;

-- ---------------------------------------------------------------- before the upload
select tests.as_service();
select throws_ok($$ select public.exam_prepare_upload(tests.uid('l1'), (select id from ex), tests.q('ESSAY')) $$, '22023', 'Start the examination first',
  'a recording is only for a started examination');
select public.exam_start(tests.uid('l1'), (select id from ex));
select public.exam_start(tests.uid('l2'), (select id from ex));
select throws_ok($$ select public.exam_prepare_upload(tests.uid('l1'), (select id from ex), tests.q('MCQ')) $$, '22023',
  'Multiple-choice questions are answered by choosing A to D', 'multiple choice takes no recording');
select is(public.exam_prepare_upload(tests.uid('l1'), (select id from ex), tests.q('ESSAY')),
  (select id from public.exam_attempts where exam_id = (select id from ex) and learner_id = tests.uid('l1')), 'it returns the learner''s attempt, the file''s owner');
select tests.reset();

-- Kwame's validated recording, and one of Abena's.
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, duration_seconds, validated_at)
select tests.id(x.fid), 'learner-submissions', 'exams/' || (select id from ex) || '/' || tests.uid(x.l) || '/' || a.id || '/' || tests.id(x.fid) || '.webm', 'answer.webm', 'answer.webm',
       tests.uid(x.l), 'VALIDATED', 'EXAM_ANSWER_AUDIO', a.id, 'audio/webm', 1000, 30, now()
  from (values ('f1', 'l1'), ('f2', 'l2')) x(fid, l)
  join public.exam_attempts a on a.exam_id = (select id from ex) and a.learner_id = tests.uid(x.l);

-- ---------------------------------------------------------------- the answer and its recording
select tests.as_service();
select throws_ok($$ select public.exam_save_answers(tests.uid('l1'), (select id from ex),
    jsonb_build_array(jsonb_build_object('question_id', tests.q('ESSAY'), 'audio_file_id', tests.id('f2')))) $$, '22023',
  'Use a recording you made for this examination', 'a learner cannot attach someone else''s recording');
select lives_ok($$ select public.exam_save_answers(tests.uid('l1'), (select id from ex),
    jsonb_build_array(jsonb_build_object('question_id', tests.q('ESSAY'), 'audio_file_id', tests.id('f1')))) $$,
  'Kwame answers the essay with his recording only');
select results_eq($$ select public.exam_submit(tests.uid('l1'), (select id from ex)) is not null $$, $$ values (true) $$, 'and submits');
select tests.reset();
select is((select score from public.exam_answers w join public.exam_attempts a on a.id = w.attempt_id
            where a.learner_id = tests.uid('l1') and w.question_id = tests.q('ESSAY')), null::numeric,
  'an answer given only as a recording waits for the lecturer: it is not marked 0 as blank');

-- ---------------------------------------------------------------- who can play it
select set_config('t.path', (select storage_path from public.file_objects where id = tests.id('f1')), true);
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.exam_answer_audio((select id from ex), tests.uid('l1'))), 1, 'Kwame lists his recording');
select ok(private.can_read_exam_audio_object('learner-submissions', current_setting('t.path')),
  'and may play it');
select tests.reset(); select tests.authenticate_as(tests.uid('l2'));
select is((select count(*)::int from public.exam_answer_audio((select id from ex), tests.uid('l1'))), 0, 'Abena cannot list Kwame''s recording');
select ok(not private.can_read_exam_audio_object('learner-submissions', current_setting('t.path')),
  'or play it');
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.exam_answer_audio((select id from ex), tests.uid('l1'))), 1, 'the course''s lecturer lists it');
select ok(private.can_read_exam_audio_object('learner-submissions', current_setting('t.path')),
  'and may play it to mark it');
select tests.reset(); select tests.authenticate_as(tests.uid('t2'));
select ok(not private.can_read_exam_audio_object('learner-submissions', current_setting('t.path')),
  'a lecturer of another course may not');

select * from finish();
rollback;
