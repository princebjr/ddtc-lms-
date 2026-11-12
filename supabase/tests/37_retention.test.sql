-- Phase 12 (D20; ADR-022, owner decisions of 2026-11-12): learner-audio retention.
-- - retention_candidates lists only learner audio: AUDIO on a submitted assignment answer, or a recording
--   on an examination answer; VALIDATED (or DELETE_FAILED, to retry); grade or result RELEASED at least
--   retention_days ago; no active hold on the submission or attempt, the learner or the course.
--   Never lesson audio, instruction audio, attachments, PDF or Word, draft files, unreleased, held or
--   too-recent files.
-- - Holds: AAL2 administrators place and release them (audited); nobody else reads or writes them.
-- - Runs: mode is DRY_RUN unless retention_enabled AND dry runs began at least retention_dry_run_days ago.
-- - Outcomes: DELETED keeps the file_objects row (with deleted_at); DELETE_FAILED counts the attempt and is
--   retried. Answer, version, file link and grade rows survive. Only the scheduled job (service role)
--   lists candidates, starts runs and records outcomes.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(36);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Church History', 'HIS101', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by)
select tests.id(c), tests.uid('t1'), 'OWNER', tests.uid('t1') from unnest(array['c1', 'c2']) c;
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select tests.id(c), tests.uid(l), 'ACTIVE', tests.uid('a1') from unnest(array['c1', 'c2']) c, unnest(array['l1', 'l2']) l;
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at)
select tests.id(x.id), tests.id(x.course), g.id, x.title, 'TEXT', '<p>Answer.</p>', now() + interval '7 days', 20, array['TEXT', 'AUDIO', 'PDF'], 'PUBLISHED', tests.uid('t1'), now()
  from (values ('aA', 'c1', 'Reflection on Genesis 1'), ('aB', 'c2', 'Reformation essay')) as x(id, course, title)
  join public.grade_categories g on g.course_id = tests.id(x.course) and g.part = 'ASSIGNMENTS' and g.archived_at is null;

/** A validated file. */
create function tests.file(p_id text, p_owner text, p_bucket text, p_type text, p_resource uuid, p_ext text, p_mime text) returns void language sql as $$
  insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, validated_at)
  values (tests.id(p_id), p_bucket, 'fixtures/' || p_id || p_ext, p_id || p_ext, p_id || p_ext, tests.uid(p_owner), 'VALIDATED', p_type, p_resource, p_mime, 2000, now())
$$;
/** An answer sent with its files (as submit-assignment leaves it). */
create function tests.sent(p_sub text, p_learner text, p_assignment text, p_files text[], p_roles public.submission_file_role[]) returns void language plpgsql as $$
declare v uuid;
begin
  insert into public.submissions (id, assignment_id, learner_id, status, current_version) values (tests.id(p_sub), tests.id(p_assignment), tests.uid(p_learner), 'SUBMITTED', 1);
  for i in 1 .. coalesce(array_length(p_files, 1), 0) loop
    perform tests.file(p_files[i], p_learner, 'learner-submissions', 'SUBMISSION_FILE', tests.id(p_sub),
      case p_roles[i] when 'AUDIO' then '.m4a' when 'PDF' then '.pdf' else '.docx' end,
      case p_roles[i] when 'AUDIO' then 'audio/mp4' when 'PDF' then 'application/pdf' else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' end);
  end loop;
  insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id) values (tests.id(p_sub), 1, 'My answer.', false, gen_random_uuid()) returning id into v;
  for i in 1 .. coalesce(array_length(p_files, 1), 0) loop
    insert into public.submission_files (submission_version_id, file_object_id, file_role) values (v, tests.id(p_files[i]), p_roles[i]);
  end loop;
end $$;

-- s1 Kwame aA: audio f1 and a PDF f2, released.   s2 Abena aA: audio f3, graded, not released.
-- s3 Kwame aB (c2): audio f4 and a Word file f6, released.   s4 Abena aB: audio f5, not graded.
select tests.sent('s1', 'l1', 'aA', array['f1', 'f2'], array['AUDIO', 'PDF']::public.submission_file_role[]);
select tests.sent('s2', 'l2', 'aA', array['f3'], array['AUDIO']::public.submission_file_role[]);
select tests.sent('s3', 'l1', 'aB', array['f4', 'f6'], array['AUDIO', 'DOCX']::public.submission_file_role[]);
select tests.sent('s4', 'l2', 'aB', array['f5'], array['AUDIO']::public.submission_file_role[]);
-- Files that are never learner audio on an answer: lesson audio, an attachment, instruction audio, and a
-- learner's audio uploaded but never sent (a draft).
select tests.file('la', 't1', 'lesson-audio', 'LESSON_AUDIO', tests.id('c1'), '.mp3', 'audio/mpeg');
select tests.file('lx', 't1', 'lesson-attachments', 'LESSON_ATTACHMENT', tests.id('c1'), '.pdf', 'application/pdf');
select tests.file('ia', 't1', 'assignment-instructions-audio', 'ASSIGNMENT_INSTRUCTION_AUDIO', tests.id('aA'), '.mp3', 'audio/mpeg');
select tests.file('dr', 'l2', 'learner-submissions', 'SUBMISSION_FILE', tests.id('s2'), '.m4a', 'audio/mp4');

select tests.as_service();
select public.grade_save(tests.uid('t1'), false, tests.id('aA'), tests.uid('l1'), 15, null, null);
select public.grade_save(tests.uid('t1'), false, tests.id('aA'), tests.uid('l2'), 12, null, null);
select public.grade_save(tests.uid('t1'), false, tests.id('aB'), tests.uid('l1'), 16, null, null);
select public.grade_release(tests.uid('t1'), false, tests.id('aA'), tests.uid('l1'));
select public.grade_release(tests.uid('t1'), false, tests.id('aB'), tests.uid('l1'));
select tests.reset();

-- An examination in c1 with an essay: Kwame's result is released, Abena's is not.
select tests.as_service();
create temporary table ex as select public.exam_save(tests.uid('t1'), false, tests.id('c1'), null,
  jsonb_build_object('title', 'Final examination', 'opens_at', now() - interval '1 hour', 'closes_at', now() + interval '1 day', 'modes', jsonb_build_array('ESSAY'))) as id;
grant select on ex to authenticated, service_role;
select public.exam_structure_save(tests.uid('t1'), false, (select id from ex), jsonb_build_array(jsonb_build_object('title', 'A', 'mode', 'ESSAY', 'questions', jsonb_build_array(
  jsonb_build_object('kind', 'ESSAY', 'prompt', 'Speak about covenant', 'marks', 10)))));
select public.exam_publish(tests.uid('t1'), false, (select id from ex), true);
select public.exam_start(tests.uid('l1'), (select id from ex));
select public.exam_start(tests.uid('l2'), (select id from ex));
select tests.reset();
select tests.file(x.f, x.l, 'learner-submissions', 'EXAM_ANSWER_AUDIO', a.id, '.m4a', 'audio/mp4')
  from (values ('e1', 'l1'), ('e2', 'l2')) x(f, l)
  join public.exam_attempts a on a.exam_id = (select id from ex) and a.learner_id = tests.uid(x.l);
select tests.as_service();
select public.exam_save_answers(tests.uid(x.l), (select id from ex), jsonb_build_array(jsonb_build_object(
  'question_id', (select q.id from public.exam_questions q where q.exam_id = (select id from ex) and q.archived_at is null), 'audio_file_ids', jsonb_build_array(tests.id(x.f)))))
  from (values ('l1', 'e1'), ('l2', 'e2')) x(l, f);
select public.exam_submit(tests.uid(l), (select id from ex)) from unnest(array['l1', 'l2']) l;
select tests.reset();
update public.exam_attempts set grade_release_status = 'RELEASED', released_at = now(), released_score = 8, released_by = tests.uid('t1')
 where exam_id = (select id from ex) and learner_id = tests.uid('l1');

create function tests.candidates() returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(f.original_filename order by f.original_filename), '{}')
    from public.retention_candidates(500) c join public.file_objects f on f.id = c.file_id
$$;
grant execute on function tests.candidates() to service_role;

-- ---------------------------------------------------------------- which files are candidates
update public.system_settings set value = '0' where key = 'retention_days';
select tests.as_service();
select is(tests.candidates(), array['e1.m4a', 'f1.m4a', 'f4.m4a'],
  'with retention_days 0, only released learner audio: two assignment answers and one examination answer');
select ok(not ('f2.pdf' = any (tests.candidates()) or 'f6.docx' = any (tests.candidates())), 'never a PDF or Word answer');
select ok(not ('f3.m4a' = any (tests.candidates())), 'never audio whose grade is not released');
select ok(not ('f5.m4a' = any (tests.candidates())), 'never audio that is not graded');
select ok(not ('e2.m4a' = any (tests.candidates())), 'never an examination recording whose result is not released');
select ok(not ('la.mp3' = any (tests.candidates()) or 'lx.pdf' = any (tests.candidates()) or 'ia.mp3' = any (tests.candidates())),
  'never lesson audio, an attachment or instruction audio');
select ok(not ('dr.m4a' = any (tests.candidates())), 'never audio that was never sent');
select tests.reset();
update public.system_settings set value = '180' where key = 'retention_days';
select tests.as_service();
select is(tests.candidates(), '{}'::text[], 'with retention_days 180, nothing released today is a candidate');
select tests.reset();
update public.system_settings set value = '0' where key = 'retention_days';

-- ---------------------------------------------------------------- holds
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select lives_ok($$ select public.retention_hold_place('COURSE', tests.id('c2'), 'Appeal under review') $$, 'an administrator holds a course');
select throws_ok($$ select public.retention_hold_place('COURSE', tests.id('c2'), 'Again') $$, '23505', 'That is already held', 'the same thing cannot be held twice');
select throws_ok($$ select public.retention_hold_place('LEARNER', tests.uid('t1'), 'Not a learner') $$, '22023', 'That learner was not found', 'a learner hold names a learner');
select throws_ok($$ select public.retention_hold_place('SUBMISSION', tests.id('nope'), 'Missing') $$, '22023', 'That answer was not found', 'a submission hold names an answer');
select throws_ok($$ select public.retention_hold_place('COURSE', tests.id('c1'), 'x') $$, '22023', 'Give a reason of 3 to 500 characters', 'a hold needs a reason');
select lives_ok($$ select public.retention_hold_place('EXAM_ATTEMPT', (select id from public.exam_attempts where exam_id = (select id from ex) and learner_id = tests.uid('l1')), 'Result queried') $$,
  'an administrator holds one examination answer');
select tests.reset(); select tests.as_service();
select is(tests.candidates(), array['f1.m4a'], 'held files are not candidates: the course hold covers f4, the attempt hold covers e1');
select tests.reset(); select tests.as_service();
select ok(public.retention_still_candidate(tests.id('f1')) and not public.retention_still_candidate(tests.id('f4')), 'the runner''s check just before deleting sees a new hold');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
select lives_ok($$ select public.retention_hold_place('LEARNER', tests.uid('l1'), 'Learner asked to keep their recordings') $$, 'an administrator holds a learner');
select tests.reset(); select tests.as_service();
select is(tests.candidates(), '{}'::text[], 'the learner hold covers all of Kwame''s audio');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
select lives_ok($$ select public.retention_hold_release((select id from public.retention_holds where scope = 'LEARNER' and released_at is null)) $$, 'releasing the learner hold');
select lives_ok($$ select public.retention_hold_release((select id from public.retention_holds where scope = 'COURSE' and released_at is null)) $$, 'and the course hold');
select is((select count(*)::int from public.retention_holds), 3, 'released holds are kept, marked released');
select ok(exists (select 1 from public.audit_logs where action = 'retention.hold_placed') and exists (select 1 from public.audit_logs where action = 'retention.hold_released'),
  'placing and releasing are audited');
select tests.reset(); select tests.as_service();
select is(tests.candidates(), array['f1.m4a', 'f4.m4a'], 'released holds no longer protect; the examination answer is still held');

-- ---------------------------------------------------------------- who may see or change holds and runs
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select throws_ok($$ select public.retention_hold_place('COURSE', tests.id('c1'), 'Lecturer try') $$, '42501', null, 'a lecturer cannot place a hold');
select is((select count(*)::int from public.retention_holds), 0, 'nor read holds');
select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select throws_ok($$ select public.retention_candidates(10) $$, '42501', null, 'a learner cannot list candidates');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'));
select throws_ok($$ select public.retention_hold_place('COURSE', tests.id('c1'), 'No two-step') $$, '42501', null, 'nor an administrator without two-step verification');

-- ---------------------------------------------------------------- runs: dry run first
select tests.reset(); select tests.as_service();
select is((select mode::text from public.retention_run_begin()), 'DRY_RUN', 'retention off: a dry run');
select tests.reset();
update public.system_settings set value = 'true' where key = 'retention_enabled';
select tests.as_service();
select is((select mode::text from public.retention_run_begin()), 'DRY_RUN', 'switched on, but dry runs began today: still a dry run');
select tests.reset();
update public.retention_runs set started_at = now() - interval '31 days' where started_at = (select min(started_at) from public.retention_runs);
select tests.as_service();
select is((select mode::text from public.retention_run_begin()), 'LIVE', 'switched on after 30 days of dry runs: live');

-- ---------------------------------------------------------------- outcomes
select set_config('t.run', (select id::text from public.retention_runs where mode = 'LIVE'), true);
select public.retention_record(current_setting('t.run')::uuid, tests.id('f1'), true, null);
select public.retention_record(current_setting('t.run')::uuid, tests.id('f4'), false, 'Storage timed out');
select tests.reset();
select results_eq($$ select status::text, deleted_at is not null from public.file_objects where id = tests.id('f1') $$, $$ values ('DELETED', true) $$,
  'a deleted file keeps its row, marked DELETED with the time');
select results_eq($$ select status::text, delete_attempts, last_delete_error from public.file_objects where id = tests.id('f4') $$, $$ values ('DELETE_FAILED', 1, 'Storage timed out') $$,
  'a failed deletion is marked and counted');
select tests.as_service();
select is(tests.candidates(), array['f4.m4a'], 'the failed one is retried by the next run; the deleted one is gone from the list');
select tests.reset();
select ok(exists (select 1 from public.submission_files where file_object_id = tests.id('f1'))
          and exists (select 1 from public.submissions where id = tests.id('s1') and released_score = 15),
  'the answer, its file link and its grade survive');
select ok(not exists (select 1 from public.files_due_for_cleanup(500) where id = tests.id('f4')),
  'the hourly cleanup does not retry a submitted answer''s failed audio (retention re-checks holds first)');
select tests.as_service();
select throws_ok($$ select public.retention_record(current_setting('t.run')::uuid, tests.id('f2'), true, null) $$, '22023', 'That file is not a retention candidate',
  'a file that is not a candidate cannot be recorded as deleted');

select * from finish();
rollback;
