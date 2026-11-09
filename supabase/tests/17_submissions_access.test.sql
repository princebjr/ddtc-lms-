-- Phase 8: submissions, submission_versions and submission_files under RLS; the learner-submissions
-- bucket; my_submission(), assignment_submissions() and submission_review(); what the database
-- itself holds for D10 (one submission per learner and assignment, at most 5 files per version,
-- submitted versions never change, files join a version only when it is submitted); D25 (ON DELETE
-- RESTRICT); revoked extensions (owner decision 6). Tests required (phase file): a learner cannot
-- read, write or overwrite another learner's submission or files. Submitting itself (the D10 timing
-- rules) is tested in 18_submission_functions.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(61);

-- ---------------------------------------------------------------- people, course, assignment
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.t3', tests.create_user('t3@example.test', 'Ruth', 'Tetteh', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.lc', tests.create_user('lc@example.test', 'Efua', 'Sarpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Yaw', 'Darko')::text, true);
select set_config('t.ls', tests.create_user('ls@example.test', 'Sus', 'Learner', 'LEARNER', 'SUSPENDED')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
-- Fixture ids from short names (up to 6 characters, hex-encoded): c = course, a = assignment,
-- s = submission, v = version, f = file, e = extension.
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
/** learner-submissions objects the current role can read (this test's files only), by file name. */
create function tests.readable() returns text[] language sql stable as $$
  select coalesce(array_agg(split_part(name, '/', 4) order by split_part(name, '/', 4)), '{}') from storage.objects
   where bucket_id = 'learner-submissions' and name like '00000000-0000-4000-8000-%'
$$;
/** The path of a submission file: {assignment}/{learner}/{version}/{file}.{ext}. */
create function tests.path(p_learner text, p_version int, p_file text, p_ext text) returns text language sql stable as $$
  select tests.id('a1') || '/' || tests.uid(p_learner) || '/' || p_version || '/' || p_file || '.' || p_ext
$$;
grant execute on function tests.uid(text), tests.id(text), tests.readable(), tests.path(text, int, text, text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Principles of Discipleship', 'DIS201', tests.uid('t2'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.id('c1'), tests.uid('t3'), 'CO_LECTURER', tests.uid('t1')),
  (tests.id('c2'), tests.uid('t2'), 'OWNER', tests.uid('t2'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c1'), tests.uid('l2'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c1'), tests.uid('lc'), 'COMPLETED', tests.uid('a1')),
  (tests.id('c1'), tests.uid('ls'), 'ACTIVE', tests.uid('a1'));
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at)
select tests.id('a1'), tests.id('c1'), g.id, 'Reflection on Genesis 1', 'TEXT', '<p>Read Genesis 1 and reflect.</p>', now() + interval '7 days', 20,
       array['TEXT', 'AUDIO', 'PDF'], 'PUBLISHED', tests.uid('t1'), now()
  from public.grade_categories g where g.course_id = tests.id('c1');

-- s1: Kwame submitted version 1 (audio f1) and is preparing version 2 (PDF f2 validated, f3 pending).
-- s2: Abena has only a draft (f4). s4: the suspended learner submitted version 1 (f5).
insert into public.submissions (id, assignment_id, learner_id, status, current_version) values
  (tests.id('s1'), tests.id('a1'), tests.uid('l1'), 'SUBMITTED', 1),
  (tests.id('s2'), tests.id('a1'), tests.uid('l2'), 'DRAFT', 0),
  (tests.id('s4'), tests.id('a1'), tests.uid('ls'), 'SUBMITTED', 1);
insert into public.submission_versions (id, submission_id, version_number, text_answer, is_late, client_request_id) values
  (tests.id('v1'), tests.id('s1'), 1, 'Genesis 1 shows a God who creates with order and purpose.', false, gen_random_uuid()),
  (tests.id('v4'), tests.id('s4'), 1, 'My answer.', false, gen_random_uuid());
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, duration_seconds, validated_at) values
  (tests.id('f1'), 'learner-submissions', tests.path('l1', 1, 'f1', 'webm'), 'answer.webm', 'answer.webm', tests.uid('l1'), 'VALIDATED', 'SUBMISSION_FILE', tests.id('s1'), 'audio/webm', 1000, 60, now()),
  (tests.id('f2'), 'learner-submissions', tests.path('l1', 2, 'f2', 'pdf'), 'notes.pdf', 'notes.pdf', tests.uid('l1'), 'VALIDATED', 'SUBMISSION_FILE', tests.id('s1'), 'application/pdf', 1000, null, now()),
  (tests.id('f3'), 'learner-submissions', tests.path('l1', 2, 'f3', 'mp3'), 'take2.mp3', 'take2.mp3', tests.uid('l1'), 'PENDING', 'SUBMISSION_FILE', tests.id('s1'), null, null, null, null),
  (tests.id('f4'), 'learner-submissions', tests.path('l2', 1, 'f4', 'm4a'), 'reply.m4a', 'reply.m4a', tests.uid('l2'), 'VALIDATED', 'SUBMISSION_FILE', tests.id('s2'), 'audio/mp4', 1000, 30, now()),
  (tests.id('f5'), 'learner-submissions', tests.path('ls', 1, 'f5', 'mp3'), 'mine.mp3', 'mine.mp3', tests.uid('ls'), 'VALIDATED', 'SUBMISSION_FILE', tests.id('s4'), 'audio/mpeg', 1000, 45, now()),
  (tests.id('f6'), 'learner-submissions', tests.path('ls', 2, 'f6', 'pdf'), 'later.pdf', 'later.pdf', tests.uid('ls'), 'VALIDATED', 'SUBMISSION_FILE', tests.id('s4'), 'application/pdf', 1000, null, now());
insert into public.submission_files (submission_version_id, file_object_id, file_role) values
  (tests.id('v1'), tests.id('f1'), 'AUDIO'),
  (tests.id('v4'), tests.id('f5'), 'AUDIO');
insert into storage.objects (bucket_id, name, owner_id, metadata)
select f.bucket_name, f.storage_path, f.uploaded_by::text, '{"size":1000}'
  from public.file_objects f where f.id in (tests.id('f1'), tests.id('f2'), tests.id('f3'), tests.id('f4'), tests.id('f5'), tests.id('f6'));
-- Abena has an extension; Kwame's was taken back (owner decision 6: kept, marked revoked).
insert into public.submission_extensions (id, assignment_id, learner_id, extended_due_at, granted_by) values
  (tests.id('e1'), tests.id('a1'), tests.uid('l2'), now() + interval '10 days', tests.uid('t1'));
insert into public.submission_extensions (id, assignment_id, learner_id, extended_due_at, granted_by, revoked_at, revoked_by) values
  (tests.id('e2'), tests.id('a1'), tests.uid('l1'), now() + interval '9 days', tests.uid('t1'), now(), tests.uid('t1'));

-- ---------------------------------------------------------------- schema
select has_table('public', 'submissions', 'submissions exists');
select has_table('public', 'submission_versions', 'submission_versions exists');
select has_table('public', 'submission_files', 'submission_files exists');
select is(
  (select count(*)::int from pg_constraint
    where contype = 'f' and confdeltype <> 'r'
      and conrelid in ('public.submissions'::regclass, 'public.submission_versions'::regclass, 'public.submission_files'::regclass)),
  0, 'every foreign key on the submission tables is ON DELETE RESTRICT (D25)');
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'submissions'
      and column_name in ('assignment_id', 'learner_id', 'status', 'current_version', 'is_late', 'score', 'feedback', 'graded_by',
                          'graded_at', 'grade_release_status', 'released_at')),
  11, 'submissions has the data model''s columns');
select ok(exists (select 1 from storage.buckets where id = 'learner-submissions' and not public and file_size_limit = 26214400),
  'learner-submissions is private and capped at 25 MB (D17)');

-- ---------------------------------------------------------------- what the database holds
select throws_ok($$ insert into public.submissions (assignment_id, learner_id) values (tests.id('a1'), tests.uid('l1')) $$,
  '23505', NULL, 'one submission per learner and assignment (D10)');
select throws_ok($$ insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id)
                    values (tests.id('s1'), 2, repeat('a', 20001), false, gen_random_uuid()) $$,
  '23514', NULL, 'a text answer is at most 20,000 characters (owner decision 2)');
select throws_ok($$ insert into public.submissions (assignment_id, learner_id, status, current_version) values (tests.id('a1'), tests.uid('lc'), 'SUBMITTED', 0) $$,
  '23514', NULL, 'a submitted answer has a version, and only a draft has none');
select throws_ok($$ update public.submission_versions set text_answer = 'Changed' where id = tests.id('v1') $$,
  '42501', NULL, 'a submitted version is never changed, by anyone');
select throws_ok($$ delete from public.submission_versions where id = tests.id('v1') $$,
  '42501', NULL, 'nor deleted');
select throws_ok($$ update public.submission_files set file_role = 'PDF' where file_object_id = tests.id('f1') $$,
  '42501', NULL, 'nor are the files of a submitted version');
insert into public.submission_versions (id, submission_id, version_number, text_answer, is_late, client_request_id, submitted_at, created_at)
values (tests.id('v9'), tests.id('s4'), 2, 'Earlier.', false, gen_random_uuid(), now() - interval '1 hour', now() - interval '1 hour');
select throws_ok($$ insert into public.submission_files (submission_version_id, file_object_id, file_role) values (tests.id('v9'), tests.id('f6'), 'PDF') $$,
  '42501', NULL, 'files join a version only when it is submitted, never later');
select throws_ok($$ insert into public.submission_files (submission_version_id, file_object_id, file_role) values (tests.id('v1'), tests.id('f4'), 'AUDIO') $$,
  '22023', NULL, 'a version takes only validated files of its own submission (never another learner''s)');

-- ---------------------------------------------------------------- submissions: who sees what
select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select id from public.submissions $$, $$ values (tests.id('s1')) $$, 'a learner sees their own submission and nobody else''s');
select is((select count(*)::int from public.submission_versions), 1, 'and their own versions');
select is((select count(*)::int from public.submission_files), 1, 'and the files of their own versions');
select throws_ok($$ select score from public.submissions $$, '42501', NULL, 'grading columns are not readable yet (Phase 9 opens them, released grades only for learners)');
select throws_ok($$ insert into public.submissions (assignment_id, learner_id) values (tests.id('a1'), tests.uid('l1')) $$, '42501', NULL, 'a learner cannot create a submission directly');
select throws_ok($$ update public.submissions set status = 'GRADED' where id = tests.id('s1') $$, '42501', NULL, 'nor change their own');
select throws_ok($$ insert into public.submission_versions (submission_id, version_number, is_late, client_request_id) values (tests.id('s1'), 2, false, gen_random_uuid()) $$,
  '42501', NULL, 'nor add a version (submit-assignment does, with server time)');
select throws_ok($$ delete from public.submissions where id = tests.id('s1') $$, '42501', NULL, 'nor delete one');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
select results_eq($$ select id from public.submissions $$, $$ values (tests.id('s2')) $$, 'a learner sees their own draft');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select set_eq($$ select id from public.submissions $$, $$ values (tests.id('s1')), (tests.id('s4')) $$, 'the course lecturer sees submitted answers, never a learner''s draft');
select is((select count(*)::int from public.submission_versions), 3, 'and their versions');
select throws_ok($$ update public.submissions set status = 'GRADED' where id = tests.id('s1') $$, '42501', NULL, 'a lecturer cannot change a submission directly');
select tests.reset();
select tests.authenticate_as(tests.uid('t3'));
select is((select count(*)::int from public.submissions), 2, 'a co-lecturer sees them too');
select tests.reset();
select tests.authenticate_as(tests.uid('t2'));
select is((select count(*)::int from public.submissions) + (select count(*)::int from public.submission_versions), 0, 'another lecturer sees none');
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is((select count(*)::int from public.submissions), 2, 'an administrator sees submitted answers');
select throws_ok($$ update public.submissions set status = 'GRADED' where id = tests.id('s1') $$, '42501', NULL, 'and cannot change them directly either');
select tests.reset();
select tests.authenticate_as(tests.uid('a1'));
select is((select count(*)::int from public.submissions), 0, 'but only with two-step verification (AAL2)');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select is((select count(*)::int from public.submissions), 0, 'a learner who is not enrolled sees none');
select tests.reset();
select tests.authenticate_as(tests.uid('ls'));
select is((select count(*)::int from public.submissions), 0, 'a suspended learner sees none, not even their own');
select tests.reset();
select tests.as_anon();
select throws_ok($$ select count(*) from public.submissions $$, '42501', NULL, 'a visitor cannot read submissions');
select tests.reset();

-- ---------------------------------------------------------------- Storage: learner-submissions
select tests.authenticate_as(tests.uid('l1'));
select is(tests.readable(), array['f1.webm', 'f2.pdf'], 'a learner reads their own submitted and draft files once validated, never a pending one');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('learner-submissions', tests.path('l1', 2, 'x', 'mp3'), tests.uid('l1')::text) $$,
  '42501', NULL, 'nobody writes to the bucket directly, not even into their own folder (the upload pipeline does)');
select lives_ok($$ update storage.objects set metadata = '{"size":1}' where bucket_id = 'learner-submissions' and name = tests.path('l2', 1, 'f4', 'm4a') $$,
  'an attempt to change another learner''s object finds nothing to change');
select tests.reset();
select is((select metadata ->> 'size' from storage.objects where name = tests.path('l2', 1, 'f4', 'm4a')), '1000', 'a learner cannot overwrite another learner''s file');
select tests.authenticate_as(tests.uid('l2'));
select is(tests.readable(), array['f4.m4a'], 'another learner reads only their own draft');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is(tests.readable(), array['f1.webm', 'f5.mp3'], 'the course lecturer reads only files of submitted versions');
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is(tests.readable(), array['f1.webm', 'f5.mp3'], 'and so does an administrator');
select tests.reset();
select tests.authenticate_as(tests.uid('t2'));
select is(tests.readable(), '{}'::text[], 'another lecturer is denied at Storage level');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select is(tests.readable(), '{}'::text[], 'so is a learner who is not enrolled');
select tests.reset();
select tests.authenticate_as(tests.uid('ls'));
select is(tests.readable(), '{}'::text[], 'and a suspended learner, even for their own file');
select tests.reset();

-- ---------------------------------------------------------------- extensions taken back (owner decision 6)
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.submission_extensions), 0, 'a learner no longer sees an extension that was taken back');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
select is((select count(*)::int from public.submission_extensions), 1, 'but sees one that stands');
select tests.reset();
select is(private.effective_due_at(tests.id('a1'), tests.uid('l1')), (select due_at from public.assignments where id = tests.id('a1')),
  'an extension taken back no longer moves the due date (D13)');

-- ---------------------------------------------------------------- my_submission(): the learner's own view
select tests.authenticate_as(tests.uid('l1'));
select is((select concat_ws(' ', j ->> 'status', j ->> 'current_version', j ->> 'next_version', j ->> 'can_submit', j ->> 'will_be_late') from (select public.my_submission(tests.id('a1')) j) x),
  'SUBMITTED 1 2 true false', 'a learner sees their status, the next version and that they may still resubmit (before the due date)');
select is((select array_agg(d ->> 'original_filename' order by d ->> 'original_filename') from jsonb_array_elements(public.my_submission(tests.id('a1')) -> 'draft_files') d),
  array['notes.pdf', 'take2.mp3'], 'and the files waiting for the next version, a pending upload included');
select is((select jsonb_array_length(j -> 'versions') || ' ' || jsonb_array_length(j -> 'versions' -> 0 -> 'files') from (select public.my_submission(tests.id('a1')) j) x),
  '1 1', 'and each submitted version with its files');
select tests.reset();
select tests.authenticate_as(tests.uid('lc'));
select is((select concat_ws(' ', j ->> 'can_submit', j ->> 'blocked_reason') from (select public.my_submission(tests.id('a1')) j) x),
  'false read_only', 'a COMPLETED enrolment is read-only (D05)');
select tests.reset();
select tests.authenticate_as(tests.uid('l3'));
select is(public.my_submission(tests.id('a1')), null, 'a learner who is not enrolled gets nothing');
select tests.reset();

-- ---------------------------------------------------------------- assignment_submissions() and submission_review()
select tests.authenticate_as(tests.uid('t1'));
select set_eq($$ select first_name, coalesce(status::text, '-') from public.assignment_submissions(tests.id('a1')) $$,
  $$ values ('Kwame', 'SUBMITTED'), ('Abena', '-'), ('Efua', '-'), ('Sus', 'SUBMITTED') $$,
  'the lecturer''s list has every enrolled learner; a draft shows as not submitted');
select is((select jsonb_array_length(j -> 'versions') || ' ' || (j -> 'versions' -> 0 -> 'files' -> 0 ->> 'storage_path')
             from (select public.submission_review(tests.id('a1'), tests.uid('l1')) j) x),
  '1 ' || tests.path('l1', 1, 'f1', 'webm'), 'the lecturer opens an answer with its versions and files');
select is((select jsonb_array_length(public.submission_review(tests.id('a1'), tests.uid('l2')) -> 'versions')), 0, 'but never a learner''s draft');
select tests.reset();
select tests.authenticate_as(tests.uid('t2'));
select is((select count(*)::int from public.assignment_submissions(tests.id('a1'))), 0, 'another lecturer gets no list');
select is(public.submission_review(tests.id('a1'), tests.uid('l1')), null, 'and no answer');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
select is((select count(*)::int from public.assignment_submissions(tests.id('a1'))), 0, 'a learner gets no list');
select is(public.submission_review(tests.id('a1'), tests.uid('l1')), null, 'and cannot open another learner''s answer');
select tests.reset();

-- ---------------------------------------------------------------- at most 5 files per version (D10)
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, validated_at)
select tests.id('f1' || n), 'learner-submissions', tests.path('l1', 1, 'f1' || n, 'pdf'), 'extra.pdf', 'extra.pdf', tests.uid('l1'), 'VALIDATED', 'SUBMISSION_FILE', tests.id('s1'), 'application/pdf', 1000, now()
  from generate_series(1, 5) n;
select lives_ok($$ insert into public.submission_files (submission_version_id, file_object_id, file_role) select tests.id('v1'), tests.id('f1' || n), 'PDF' from generate_series(1, 4) n $$,
  'a version holds up to 5 files');
select throws_ok($$ insert into public.submission_files (submission_version_id, file_object_id, file_role) values (tests.id('v1'), tests.id('f15'), 'PDF') $$,
  '22023', NULL, 'but not a sixth');

select * from finish();
rollback;
