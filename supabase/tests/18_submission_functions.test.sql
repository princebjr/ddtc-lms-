-- Phase 8: the trusted submission functions. Submitting follows D10 as the owner read it (decision 3,
-- 2026-11-08): before the effective due date (the assignment's, or the learner's extension) a learner
-- submits and resubmits as new versions until the answer is graded; after it, someone who never
-- submitted may still submit, marked late, only when late answers are allowed, and someone who already
-- submitted cannot submit again. Lateness comes from server time. Uploads wait for the next version
-- (at most 5 files, PDF and Word only where allowed, ADR-009); an unsent file can be removed and is
-- otherwise cleaned up after 24 hours (decision 4); extensions are set, changed and taken back by the
-- course's lecturers or an administrator, and are kept when taken back (decision 6). The functions
-- are service-role only: submit-assignment, register-upload and manage-assignments call them after
-- checking the caller.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(59);

-- ---------------------------------------------------------------- people and courses
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Yaw', 'Darko')::text, true);
select set_config('t.l4', tests.create_user('l4@example.test', 'Esi', 'Owusu')::text, true);
select set_config('t.lc', tests.create_user('lc@example.test', 'Efua', 'Sarpong')::text, true);
select set_config('t.ln', tests.create_user('ln@example.test', 'Kofi', 'Asante')::text, true);
select set_config('t.ls', tests.create_user('ls@example.test', 'Sus', 'Learner', 'LEARNER', 'SUSPENDED')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
-- Fixture ids from short names (up to 6 characters, hex-encoded): c = course, a = assignment, r = request.
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;

insert into public.courses (id, title, course_code, created_by, status, published_at, archived_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now(), null),
  (tests.id('c2'), 'Principles of Discipleship', 'DIS201', tests.uid('t2'), 'PUBLISHED', now(), null),
  (tests.id('c9'), 'Old Testament Survey', 'OTS100', tests.uid('t1'), 'ARCHIVED', now(), now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.id('c2'), tests.uid('t2'), 'OWNER', tests.uid('t2')),
  (tests.id('c9'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select tests.id('c1'), tests.uid(l), 'ACTIVE', tests.uid('a1') from unnest(array['l1', 'l2', 'l3', 'l4', 'ls']) l;
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('lc'), 'COMPLETED', tests.uid('a1')),
  (tests.id('c9'), tests.uid('l1'), 'ACTIVE', tests.uid('a1'));

-- aF open (due in 7 days), aD open and taking PDF and Word, aP past due, aL past due with late answers,
-- aX past due (extensions), aU a draft, aA archived, aZ in an archived course.
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, allow_late, max_marks, accepted_formats, publication_status, created_by, published_at, archived_at)
select tests.id(x.id), tests.id(x.course), g.id, x.title, 'TEXT', '<p>Respond in your own words.</p>', now() + x.due, x.late, 20, x.formats,
       x.pub::public.publication_status, tests.uid('t1'), case when x.pub = 'PUBLISHED' then now() end, case when x.archived then now() end
  from (values
    ('aF', 'c1', 'Reflection on Genesis 1', interval '7 days', false, array['TEXT', 'AUDIO'], 'PUBLISHED', false),
    ('aD', 'c1', 'Covenant essay', interval '7 days', false, array['TEXT', 'AUDIO', 'PDF', 'DOCX'], 'PUBLISHED', false),
    ('aP', 'c1', 'Prayer journal', interval '-1 day', false, array['TEXT', 'AUDIO'], 'PUBLISHED', false),
    ('aL', 'c1', 'Psalm study', interval '-1 day', true, array['TEXT', 'AUDIO'], 'PUBLISHED', false),
    ('aX', 'c1', 'Exodus summary', interval '-1 day', false, array['TEXT', 'AUDIO'], 'PUBLISHED', false),
    ('aU', 'c1', 'Not yet published', interval '7 days', false, array['TEXT', 'AUDIO'], 'DRAFT', false),
    ('aA', 'c1', 'Old exercise', interval '7 days', false, array['TEXT', 'AUDIO'], 'PUBLISHED', true),
    ('aZ', 'c9', 'Archived course work', interval '7 days', false, array['TEXT', 'AUDIO'], 'PUBLISHED', false)
  ) as x(id, course, title, due, late, formats, pub, archived)
  join public.grade_categories g on g.course_id = tests.id(x.course);
insert into public.submission_extensions (assignment_id, learner_id, extended_due_at, granted_by) values
  (tests.id('aX'), tests.uid('l1'), now() + interval '2 days', tests.uid('t1')),
  (tests.id('aX'), tests.uid('l3'), now() - interval '1 hour', tests.uid('t1'));

/** Submits as the given learner (call as the service role). */
create function tests.submit(p_learner text, p_assignment text, p_text text default 'My answer.', p_files uuid[] default '{}', p_request uuid default gen_random_uuid())
returns table (submission_id uuid, version_number integer, is_late boolean, resubmitted boolean, replayed boolean)
language sql as $$
  select * from public.submission_submit(tests.uid(p_learner), tests.id(p_assignment), p_text, p_files, p_request)
$$;
/** An upload waiting in a learner's submission, as finalize-upload leaves it. Returns its id. */
create function tests.file(p_learner text, p_assignment text, p_version int, p_mime text, p_status text default 'VALIDATED')
returns uuid language sql as $$
  insert into public.file_objects (bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, validated_at)
  select 'learner-submissions', tests.id(p_assignment) || '/' || tests.uid(p_learner) || '/' || p_version || '/' || gen_random_uuid() || '.bin', 'answer', 'answer',
         tests.uid(p_learner), p_status::public.file_status, 'SUBMISSION_FILE', s.id,
         case when p_status = 'VALIDATED' then p_mime end, case when p_status = 'VALIDATED' then 1000 end, case when p_status = 'VALIDATED' then now() end
    from public.submissions s where s.assignment_id = tests.id(p_assignment) and s.learner_id = tests.uid(p_learner)
  returning id
$$;
grant execute on function tests.uid(text), tests.id(text), tests.submit(text, text, text, uuid[], uuid), tests.file(text, text, int, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------- only the server calls them
select tests.authenticate_as(tests.uid('l1'));
select throws_ok($$ select * from public.submission_submit(tests.uid('l1'), tests.id('aF'), 'x', '{}', gen_random_uuid()) $$,
  '42501', NULL, 'a learner cannot call the submit function directly (submit-assignment does)');
select throws_ok($$ select public.submission_extension_set(tests.uid('t1'), false, tests.id('aF'), tests.uid('l1'), now() + interval '9 days', null) $$,
  '42501', NULL, 'nor the extension function');
select tests.reset();
select tests.as_service();

-- ---------------------------------------------------------------- uploads wait for the next version
select is((select version_number from public.submission_prepare_upload(tests.uid('l1'), tests.id('aF'), 'AUDIO')), 1, 'a first upload goes to version 1');
select is((select status::text || ' ' || current_version from public.submissions where assignment_id = tests.id('aF') and learner_id = tests.uid('l1')), 'DRAFT 0',
  'and starts a draft submission');
select throws_ok($$ select * from public.submission_prepare_upload(tests.uid('l1'), tests.id('aF'), 'PDF') $$,
  '22023', NULL, 'a PDF is refused where the lecturer did not allow PDF answers (ADR-009)');
select is((select version_number from public.submission_prepare_upload(tests.uid('l1'), tests.id('aD'), 'PDF')), 1, 'and taken where they did');

-- ---------------------------------------------------------------- submitting and resubmitting
select is((select version_number || ' ' || is_late::text || ' ' || resubmitted::text || ' ' || replayed::text from tests.submit('l1', 'aF', 'Genesis 1 shows order.', '{}', tests.id('r1'))),
  '1 false false false', 'a first answer before the due date is version 1, on time');
select is((select status::text || ' ' || current_version from public.submissions where assignment_id = tests.id('aF') and learner_id = tests.uid('l1')), 'SUBMITTED 1',
  'the submission is now submitted');
select is((select version_number || ' ' || replayed::text from tests.submit('l1', 'aF', 'Genesis 1 shows order.', '{}', tests.id('r1'))), '1 true',
  'the same request sent twice returns the first result');
select is((select count(*)::int from public.submission_versions v join public.submissions s on s.id = v.submission_id where s.assignment_id = tests.id('aF') and s.learner_id = tests.uid('l1')),
  1, 'and makes no second version');
select is((select version_number || ' ' || is_late::text || ' ' || resubmitted::text from tests.submit('l1', 'aF', 'A fuller answer.', '{}', tests.id('r2'))),
  '2 false true', 'resubmitting before the due date makes version 2');
select ok(exists (select 1 from public.audit_logs where action = 'submission.submitted' and actor_id = tests.uid('l1') and metadata ->> 'version' = '2'),
  'every submission is audited');
select throws_ok($$ select * from tests.submit('l2', 'aF', '   ') $$, '22023', 'Add a text answer, a recording or a file', 'an empty answer is refused');
select throws_ok($$ select * from tests.submit('l2', 'aF', repeat('a', 20001)) $$, '22023', NULL, 'a text answer longer than 20,000 characters is refused');

-- ---------------------------------------------------------------- the due date (D10, decision 3)
select throws_ok($$ select * from tests.submit('l1', 'aP') $$, '22023', 'The due date has passed', 'after the due date a first answer is refused when late answers are not allowed');
select is((select is_late from tests.submit('l1', 'aL')), true, 'where late answers are allowed it is taken and marked late (never penalised)');
select throws_ok($$ select * from tests.submit('l1', 'aL') $$, '22023', 'The due date has passed, so you cannot submit again',
  'but someone who already submitted cannot submit again after the due date');
select is((select is_late from tests.submit('l1', 'aX')), false, 'an extension moves the due date: on time before it (D13)');
select throws_ok($$ select * from tests.submit('l2', 'aX') $$, '22023', NULL, 'a learner without an extension is past the due date');
select throws_ok($$ select * from tests.submit('l3', 'aX') $$, '22023', NULL, 'and so is one whose extension has passed');
update public.submissions set status = 'GRADED' where assignment_id = tests.id('aF') and learner_id = tests.uid('l1');
select throws_ok($$ select * from tests.submit('l1', 'aF') $$, '22023', 'This answer has been graded', 'a graded answer cannot be resubmitted');
select throws_ok($$ select * from tests.submit('lc', 'aF') $$, '22023', 'This course is read-only for you', 'a COMPLETED enrolment cannot submit (D05)');
select throws_ok($$ select * from tests.submit('l1', 'aZ') $$, '22023', 'This course is read-only for you', 'nor can anyone in an archived course (D07)');
select throws_ok($$ select * from tests.submit('l1', 'aU') $$, '22023', 'This assignment is not open for answers', 'a draft assignment takes no answers');
select throws_ok($$ select * from tests.submit('l1', 'aA') $$, '22023', 'This assignment is not open for answers', 'nor does an archived one');
select throws_ok($$ select * from tests.submit('ln', 'aF') $$, '42501', NULL, 'a learner who is not enrolled cannot submit');
select throws_ok($$ select * from tests.submit('ls', 'aF') $$, '42501', NULL, 'nor can a suspended learner');

-- ---------------------------------------------------------------- files in an answer
select * from public.submission_prepare_upload(tests.uid('l3'), tests.id('aD'), 'AUDIO');
select set_config('t.fa', tests.file('l3', 'aD', 1, 'audio/webm')::text, true);
select is((select version_number from tests.submit('l3', 'aD', '', array[current_setting('t.fa')::uuid])), 1, 'a recording alone is an answer');
select is((select string_agg(sf.file_role::text, ',') from public.submission_files sf where sf.file_object_id = current_setting('t.fa')::uuid), 'AUDIO',
  'and its file joins version 1 as an audio answer');
select set_config('t.fb', tests.file('l3', 'aD', 2, 'audio/webm')::text, true);
select * from public.submission_prepare_upload(tests.uid('l4'), tests.id('aD'), 'AUDIO');
select throws_ok($$ select * from tests.submit('l4', 'aD', 'x', array[current_setting('t.fb')::uuid]) $$, '22023', NULL, 'a learner cannot submit another learner''s file');
select throws_ok($$ select * from tests.submit('l4', 'aD', 'x', array[tests.file('l4', 'aD', 1, null, 'PENDING')]) $$, '22023', NULL, 'nor a file still being checked');
select throws_ok($$ select * from tests.submit('l4', 'aD', 'x', array[tests.file('l4', 'aD', 2, 'audio/mpeg')]) $$, '22023', NULL, 'nor a file waiting for another version');
select * from public.submission_prepare_upload(tests.uid('l2'), tests.id('aF'), 'AUDIO');
select throws_ok($$ select * from tests.submit('l2', 'aF', 'x', array[tests.file('l2', 'aF', 1, 'application/pdf')]) $$, '22023', NULL,
  'nor a PDF where PDF answers are not allowed');
select throws_ok($$ select * from tests.submit('l4', 'aD', 'x', (select array_agg(tests.file('l4', 'aD', 1, 'audio/mpeg')) from generate_series(1, 6))) $$,
  '22023', 'You can add at most 5 files', 'at most 5 files go into one version (D10)');
select set_config('t.fw', (select min(tests.file('l4', 'aD', 1, 'audio/mpeg')::text) from generate_series(1, 5)), true);
select throws_ok($$ select * from public.submission_prepare_upload(tests.uid('l4'), tests.id('aD'), 'AUDIO') $$, '22023', NULL,
  'and no upload starts once 5 files are waiting');

-- ---------------------------------------------------------------- removing an unsent file (decision 4)
select is((select storage_path from public.submission_draft_file_remove(tests.uid('l4'), current_setting('t.fw')::uuid)),
  (select storage_path from public.file_objects where id = current_setting('t.fw')::uuid), 'a learner removes a file they have not sent');
select throws_ok($$ select * from public.submission_draft_file_remove(tests.uid('l3'), current_setting('t.fa')::uuid) $$, '22023', NULL,
  'a file that was submitted stays');
select throws_ok($$ select * from public.submission_draft_file_remove(tests.uid('l4'), current_setting('t.fb')::uuid) $$, '42501', NULL,
  'and nobody removes another learner''s file');

-- ---------------------------------------------------------------- extensions (D13, decision 6)
select is(public.submission_extension_set(tests.uid('t1'), false, tests.id('aP'), tests.uid('l2'), now() + interval '3 days', 'Illness'), null,
  'the lecturer gives a learner an extension');
select ok(exists (select 1 from public.audit_logs where action = 'extension.granted' and actor_id = tests.uid('t1') and entity_id = tests.id('aP')::text),
  'and it is audited');
select is((select is_late from tests.submit('l2', 'aP')), false, 'the learner can then answer on time');
select is(public.submission_extension_set(tests.uid('t1'), false, tests.id('aP'), tests.uid('l2'), now() + interval '5 days', null), now() + interval '3 days',
  'changing it returns the previous date (for Undo)');
select ok(exists (select 1 from public.audit_logs where action = 'extension.changed' and entity_id = tests.id('aP')::text), 'and the change is audited');
select throws_ok($$ select public.submission_extension_set(tests.uid('t1'), false, tests.id('aF'), tests.uid('l3'), now() + interval '6 days', null) $$,
  '22023', NULL, 'an extension must be later than the assignment''s due date');
select throws_ok($$ select public.submission_extension_set(tests.uid('t1'), false, tests.id('aP'), tests.uid('l3'), now() - interval '1 hour', null) $$,
  '22023', NULL, 'and in the future');
select throws_ok($$ select public.submission_extension_set(tests.uid('t1'), false, tests.id('aP'), tests.uid('ln'), now() + interval '3 days', null) $$,
  '22023', NULL, 'only for a learner enrolled in the course');
select throws_ok($$ select public.submission_extension_set(tests.uid('t2'), false, tests.id('aP'), tests.uid('l3'), now() + interval '3 days', null) $$,
  '42501', NULL, 'another course''s lecturer cannot give one');
select is(public.submission_extension_set(tests.uid('a1'), true, tests.id('aF'), tests.uid('l4'), now() + interval '10 days', null), null,
  'an administrator can');
select is(public.submission_extension_remove(tests.uid('t1'), false, tests.id('aP'), tests.uid('l2')), now() + interval '5 days',
  'taking an extension back returns its date (for Undo)');
select ok(exists (select 1 from public.submission_extensions where assignment_id = tests.id('aP') and learner_id = tests.uid('l2') and revoked_at is not null and revoked_by = tests.uid('t1')),
  'and keeps it, marked as taken back');
select is(private.effective_due_at(tests.id('aP'), tests.uid('l2')), (select due_at from public.assignments where id = tests.id('aP')), 'the learner''s due date is the assignment''s again');
select ok(exists (select 1 from public.audit_logs where action = 'extension.removed' and entity_id = tests.id('aP')::text), 'and taking it back is audited');
select throws_ok($$ select public.submission_extension_remove(tests.uid('t1'), false, tests.id('aP'), tests.uid('l2')) $$, '22023', NULL,
  'there is nothing to take back twice');
select is(public.submission_extension_set(tests.uid('t1'), false, tests.id('aP'), tests.uid('l2'), now() + interval '4 days', null), null,
  'a new extension can be given after one was taken back');

-- ---------------------------------------------------------------- cleanup of unsent files (decision 4, D18)
select tests.reset();
select set_config('t.fo', tests.file('l4', 'aD', 1, 'audio/mpeg')::text, true);
update public.file_objects set uploaded_at = now() - interval '25 hours' where id = current_setting('t.fo')::uuid;
select is((select reason from public.files_due_for_cleanup(1000) where id = current_setting('t.fo')::uuid), 'expired_draft_file',
  'a file never sent is cleaned up after 24 hours');
select ok(not exists (select 1 from public.files_due_for_cleanup(1000) f join public.file_objects o on o.id = f.id
                       where o.resource_type = 'SUBMISSION_FILE' and o.status = 'VALIDATED' and o.uploaded_at > now() - interval '24 hours'),
  'but not before');
update public.file_objects set uploaded_at = now() - interval '30 days' where id = current_setting('t.fa')::uuid;
select ok(not exists (select 1 from public.files_due_for_cleanup(1000) where id = current_setting('t.fa')::uuid), 'a submitted file is never cleaned up');
update public.file_objects set delete_attempts = 3, last_delete_error = 'Storage unavailable' where id = current_setting('t.fo')::uuid;
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select results_eq($$ select id from public.cleanup_failures() where id = current_setting('t.fo')::uuid $$, $$ values (current_setting('t.fo')::uuid) $$,
  'files that keep failing to be removed are listed for administrators');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.cleanup_failures()), 0, 'and for nobody else');
select tests.reset();

select * from finish();
rollback;
