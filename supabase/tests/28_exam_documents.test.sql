-- Step 10.3 (owner request and approval of 2026-11-10): an examination answer may also carry one PDF or
-- Word document (EXAM_ANSWER_DOCUMENT, through the D18 pipeline with the D17 document limit), as well as
-- typed text and one audio answer (recorded or an uploaded file, both EXAM_ANSWER_AUDIO).
-- - Only the learner's own validated document for that attempt; multiple choice takes none.
-- - An answer given only as a document waits for the lecturer: it is never marked 0 as blank.
-- - Only the learner and the course's managers can open it (Storage policy), and exam_answer_files lists
--   the recordings and documents for them only.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(11);

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
  jsonb_build_object('kind', 'ESSAY', 'prompt', 'Write about covenant', 'marks', 10)))));
select public.exam_publish(tests.uid('t1'), false, (select id from ex), true);
select public.exam_start(tests.uid('l1'), (select id from ex));
select public.exam_start(tests.uid('l2'), (select id from ex));
select tests.reset();
grant select on ex to authenticated, service_role;
create function tests.q(p_kind public.exam_question_kind) returns uuid language sql stable as $$
  select q.id from public.exam_questions q where q.exam_id = (select id from ex) and q.kind = p_kind and q.archived_at is null
$$;
grant execute on function tests.q(public.exam_question_kind) to authenticated, service_role;

-- Kwame's validated Word document, Abena's PDF, and a document registered as an audio answer (wrong type).
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, validated_at)
select tests.id(x.fid), 'learner-submissions', 'exams/' || (select id from ex) || '/' || tests.uid(x.l) || '/' || a.id || '/' || tests.id(x.fid) || x.ext, 'answer' || x.ext, 'answer' || x.ext,
       tests.uid(x.l), 'VALIDATED', x.kind, a.id, x.mime, 2000, now()
  from (values ('d1', 'l1', '.docx', 'EXAM_ANSWER_DOCUMENT', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
               ('d2', 'l2', '.pdf', 'EXAM_ANSWER_DOCUMENT', 'application/pdf')) x(fid, l, ext, kind, mime)
  join public.exam_attempts a on a.exam_id = (select id from ex) and a.learner_id = tests.uid(x.l);

select tests.as_service();
select throws_ok($$ select public.exam_save_answers(tests.uid('l1'), (select id from ex),
    jsonb_build_array(jsonb_build_object('question_id', tests.q('ESSAY'), 'document_file_id', tests.id('d2')))) $$, '22023',
  'Use a document you uploaded for this examination', 'a learner cannot attach someone else''s document');
select throws_ok($$ select public.exam_save_answers(tests.uid('l1'), (select id from ex),
    jsonb_build_array(jsonb_build_object('question_id', tests.q('MCQ'), 'document_file_id', tests.id('d1')))) $$, '22023',
  'Multiple-choice questions are answered by choosing A to D', 'multiple choice takes no document');
select lives_ok($$ select public.exam_save_answers(tests.uid('l1'), (select id from ex),
    jsonb_build_array(jsonb_build_object('question_id', tests.q('ESSAY'), 'document_file_id', tests.id('d1')))) $$,
  'Kwame answers the essay with his Word document only');
select results_eq($$ select public.exam_submit(tests.uid('l1'), (select id from ex)) is not null $$, $$ values (true) $$, 'and submits');
select tests.reset();
select is((select score from public.exam_answers w join public.exam_attempts a on a.id = w.attempt_id
            where a.learner_id = tests.uid('l1') and w.question_id = tests.q('ESSAY')), null::numeric,
  'an answer given only as a document waits for the lecturer: it is not marked 0 as blank');

select set_config('t.path', (select storage_path from public.file_objects where id = tests.id('d1')), true);
select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select kind from public.exam_answer_files((select id from ex), tests.uid('l1')) $$, $$ values ('DOCUMENT') $$,
  'Kwame lists his document');
select ok(private.can_read_exam_audio_object('learner-submissions', current_setting('t.path')), 'and may open it');
select tests.reset(); select tests.authenticate_as(tests.uid('l2'));
select is((select count(*)::int from public.exam_answer_files((select id from ex), tests.uid('l1'))), 0, 'Abena cannot list it');
select ok(not private.can_read_exam_audio_object('learner-submissions', current_setting('t.path')), 'or open it');
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select ok(private.can_read_exam_audio_object('learner-submissions', current_setting('t.path')), 'the course''s lecturer opens it to mark');
select tests.reset(); select tests.authenticate_as(tests.uid('t2'));
select ok(not private.can_read_exam_audio_object('learner-submissions', current_setting('t.path')), 'a lecturer of another course may not');

select * from finish();
rollback;
