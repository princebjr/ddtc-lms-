-- Step 11.1 (owner request of 2026-11-11, ADR-020 item 10): a short-answer or essay examination answer may
-- carry up to three audio answers (recordings or uploaded audio files), kept in order, each removable or
-- replaceable while the attempt is open.
-- - Only the learner's own validated audio for that attempt; at most three; none twice; none for multiple choice.
-- - The first one stays in audio_file_id, so an answer with any recording is never marked 0 as blank, and a
--   screen that still sends the single audio_file_id keeps working.
-- - exam_answer_files lists every recording in order, for the learner and the course's managers only.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(20);

select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
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
  jsonb_build_object('kind', 'ESSAY', 'prompt', 'Speak about covenant', 'marks', 10),
  jsonb_build_object('kind', 'SHORT', 'prompt', 'Name one prophet', 'marks', 2)))));
select public.exam_publish(tests.uid('t1'), false, (select id from ex), true);
select public.exam_start(tests.uid('l1'), (select id from ex));
select public.exam_start(tests.uid('l2'), (select id from ex));
select tests.reset();
grant select on ex to authenticated, service_role;
create function tests.q(p_kind public.exam_question_kind) returns uuid language sql stable as $$
  select q.id from public.exam_questions q where q.exam_id = (select id from ex) and q.kind = p_kind and q.archived_at is null
$$;
grant execute on function tests.q(public.exam_question_kind) to authenticated, service_role;
/** Saves a question's whole list of recordings for a learner. */
create function tests.save(p_learner text, p_kind public.exam_question_kind, p_files text[]) returns timestamptz language sql as $$
  select public.exam_save_answers(tests.uid(p_learner), (select id from ex), jsonb_build_array(jsonb_build_object(
    'question_id', tests.q(p_kind), 'audio_file_ids', (select coalesce(jsonb_agg(tests.id(f)), '[]'::jsonb) from unnest(p_files) f))))
$$;
grant execute on function tests.save(text, public.exam_question_kind, text[]) to service_role;
create function tests.answer(p_learner text, p_kind public.exam_question_kind) returns public.exam_answers language sql stable security definer set search_path = '' as $$
  select w from public.exam_answers w join public.exam_attempts a on a.id = w.attempt_id
   where a.learner_id = tests.uid(p_learner) and w.question_id = tests.q(p_kind)
$$;
grant execute on function tests.answer(text, public.exam_question_kind) to anon, authenticated, service_role;

-- Kwame's four validated recordings and one still being checked; Abena's one; and Kwame's document.
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, validated_at)
select tests.id(x.fid), 'learner-submissions', 'exams/' || (select id from ex) || '/' || tests.uid(x.l) || '/' || a.id || '/' || tests.id(x.fid) || x.ext, 'answer' || x.ext, 'answer' || x.ext,
       tests.uid(x.l), x.status::public.file_status, x.kind, a.id, x.mime, 2000, case when x.status = 'VALIDATED' then now() end
  from (values ('r1', 'l1', '.m4a', 'EXAM_ANSWER_AUDIO', 'audio/mp4', 'VALIDATED'), ('r2', 'l1', '.m4a', 'EXAM_ANSWER_AUDIO', 'audio/mp4', 'VALIDATED'),
               ('r3', 'l1', '.mp3', 'EXAM_ANSWER_AUDIO', 'audio/mpeg', 'VALIDATED'), ('r4', 'l1', '.m4a', 'EXAM_ANSWER_AUDIO', 'audio/mp4', 'VALIDATED'),
               ('r5', 'l1', '.m4a', 'EXAM_ANSWER_AUDIO', 'audio/mp4', 'PENDING'), ('o1', 'l2', '.m4a', 'EXAM_ANSWER_AUDIO', 'audio/mp4', 'VALIDATED'),
               ('d1', 'l1', '.pdf', 'EXAM_ANSWER_DOCUMENT', 'application/pdf', 'VALIDATED')) x(fid, l, ext, kind, mime, status)
  join public.exam_attempts a on a.exam_id = (select id from ex) and a.learner_id = tests.uid(x.l);

select tests.as_service();
-- ---------------------------------------------------------------- what is refused
select throws_ok($$ select tests.save('l1', 'ESSAY', array['r1', 'r2', 'r3', 'r4']) $$, '22023', 'Add up to 3 recordings or audio files to one answer', 'a fourth recording is refused');
select throws_ok($$ select tests.save('l1', 'ESSAY', array['r1', 'r1']) $$, '22023', 'Use a recording you made for this examination', 'the same recording twice is refused');
select throws_ok($$ select tests.save('l1', 'ESSAY', array['r1', 'o1']) $$, '22023', 'Use a recording you made for this examination', 'another learner''s recording is refused');
select throws_ok($$ select tests.save('l1', 'ESSAY', array['r5']) $$, '22023', 'Use a recording you made for this examination', 'a recording not yet checked is refused');
select throws_ok($$ select tests.save('l1', 'ESSAY', array['d1']) $$, '22023', 'Use a recording you made for this examination', 'a document is not a recording');
select throws_ok($$ select tests.save('l1', 'MCQ', array['r1']) $$, '22023', 'Multiple-choice questions are answered by choosing A to D', 'multiple choice takes no recording');

-- ---------------------------------------------------------------- add, replace, remove
select lives_ok($$ select tests.save('l1', 'ESSAY', array['r1', 'r2', 'r3']) $$, 'Kwame answers the essay with three recordings');
select is((tests.answer('l1', 'ESSAY')).audio_file_ids, array[tests.id('r1'), tests.id('r2'), tests.id('r3')], 'kept in his order');
select lives_ok($$ select tests.save('l1', 'ESSAY', array['r1', 'r4', 'r3']) $$, 'he replaces the second');
select is((tests.answer('l1', 'ESSAY')).audio_file_ids, array[tests.id('r1'), tests.id('r4'), tests.id('r3')], 'and it takes the second place');
select lives_ok($$ select tests.save('l1', 'ESSAY', array['r4', 'r3']) $$, 'he removes the first');
select is((tests.answer('l1', 'ESSAY')).audio_file_id, tests.id('r4'), 'the first of those left is the answer''s main recording');
select lives_ok($$ select public.exam_save_answers(tests.uid('l1'), (select id from ex), jsonb_build_array(jsonb_build_object('question_id', tests.q('ESSAY'), 'text_answer', 'Notes'))) $$,
  'saving typed text alone');
select is(cardinality((tests.answer('l1', 'ESSAY')).audio_file_ids), 2, 'leaves the recordings as they were');

-- A screen that still sends one audio_file_id (an installed app not yet updated) keeps working.
select lives_ok($$ select public.exam_save_answers(tests.uid('l1'), (select id from ex), jsonb_build_array(jsonb_build_object('question_id', tests.q('SHORT'), 'audio_file_id', tests.id('r2')))) $$,
  'the single audio_file_id is still accepted');
select is((tests.answer('l1', 'SHORT')).audio_file_ids, array[tests.id('r2')], 'and becomes the one recording');

-- ---------------------------------------------------------------- marking and who sees them
select results_eq($$ select public.exam_submit(tests.uid('l1'), (select id from ex)) is not null $$, $$ values (true) $$, 'Kwame submits');
select is((tests.answer('l1', 'SHORT')).score, null::numeric, 'an answer given only as a recording waits for the lecturer: not marked 0 as blank');
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select file_id from public.exam_answer_files((select id from ex), tests.uid('l1')) where question_id = tests.q('ESSAY') and kind = 'AUDIO' $$,
  $$ values (tests.id('r4')), (tests.id('r3')) $$, 'the lecturer lists both recordings of the essay, in order');
select tests.reset(); select tests.authenticate_as(tests.uid('l2'));
select is((select count(*)::int from public.exam_answer_files((select id from ex), tests.uid('l1'))), 0, 'another learner lists none of them');

select * from finish();
rollback;
