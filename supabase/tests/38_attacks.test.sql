-- Phase 13: the policy review's attack suite (BUILD_PLAN Phase 13: direct-ID tampering, cross-course
-- access, unpublished resources, invalid file states, and attempts to alter role, score or deadline
-- through direct API calls). Each attack runs as a real client role would, through the tables and
-- functions the API exposes, and must change nothing and read nothing it should not.
-- - A learner (l1 in c1) attacks another learner (l2 in c2) and the system.
-- - A lecturer of another course (t2, c2) attacks course c1.
-- - An administrator without two-step verification (aal1) tries administrator reads and writes.
-- - Nobody but the service role may run any function that takes a p_actor (it would let a caller act as
--   someone else), and nothing at all is open to anonymous visitors.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(51);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

/** Runs an attack and says what happened: 'denied' (refused) or 'rows:N' (rows it touched or saw). */
create function tests.attempt(p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  execute 'with t as (' || p_sql || ') select count(*) from t' into n;
  return 'rows:' || n;
exception when others then
  return 'denied';
end $$;
grant execute on function tests.attempt(text) to anon, authenticated, service_role;
/** An attack is blocked when it was refused or touched nothing. */
create function tests.blocked(p_sql text) returns boolean language sql as $$ select tests.attempt(p_sql) in ('denied', 'rows:0') $$;
grant execute on function tests.blocked(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Church History', 'HIS101', tests.uid('t2'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')), (tests.id('c2'), tests.uid('t2'), 'OWNER', tests.uid('t2'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')), (tests.id('c2'), tests.uid('l2'), 'ACTIVE', tests.uid('a1'));
-- A published and a draft lesson in c1.
insert into public.lessons (id, course_id, title, content, position, publication_status, created_by, published_at) values
  (tests.id('pl'), tests.id('c1'), 'Published lesson', '<p>Open.</p>', 1, 'PUBLISHED', tests.uid('t1'), now()),
  (tests.id('dl'), tests.id('c1'), 'Draft lesson', '<p>Not yet.</p>', 2, 'DRAFT', tests.uid('t1'), null);
-- A published and a draft assignment in c1, and one in c2.
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at)
select tests.id(x.id), tests.id(x.course), g.id, x.title, 'TEXT', '<p>Answer.</p>', now() + interval '7 days', 20, array['TEXT', 'AUDIO'], x.status::public.publication_status, tests.uid(x.owner),
       case when x.status = 'PUBLISHED' then now() end
  from (values ('a1', 'c1', 'Published work', 'PUBLISHED', 't1'), ('ad', 'c1', 'Draft work', 'DRAFT', 't1'), ('a2', 'c2', 'Other course work', 'PUBLISHED', 't2')) as x(id, course, title, status, owner)
  join public.grade_categories g on g.course_id = tests.id(x.course) and g.part = 'ASSIGNMENTS' and g.archived_at is null;
-- Abena's answer in c2, with a validated audio file, graded and released; a pending file of Kwame's.
insert into public.submissions (id, assignment_id, learner_id, status, current_version) values (tests.id('s2'), tests.id('a2'), tests.uid('l2'), 'SUBMITTED', 1);
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id, detected_mime_type, file_size, validated_at) values
  (tests.id('f2'), 'learner-submissions', 'attack/f2.m4a', 'f2.m4a', 'f2.m4a', tests.uid('l2'), 'VALIDATED', 'SUBMISSION_FILE', tests.id('s2'), 'audio/mp4', 2000, now());
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, resource_id) values
  (tests.id('fp'), 'learner-submissions', 'attack/fp.m4a', 'fp.m4a', 'fp.m4a', tests.uid('l1'), 'PENDING', 'SUBMISSION_FILE', null);
insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id) values (tests.id('s2'), 1, 'Abena''s answer.', false, gen_random_uuid());
insert into public.submission_files (submission_version_id, file_object_id, file_role)
select v.id, tests.id('f2'), 'AUDIO' from public.submission_versions v where v.submission_id = tests.id('s2');
insert into storage.objects (bucket_id, name, owner_id) values ('learner-submissions', 'attack/f2.m4a', tests.uid('l2')::text), ('learner-submissions', 'attack/fp.m4a', tests.uid('l1')::text);
select tests.as_service();
select public.grade_save(tests.uid('t2'), false, tests.id('a2'), tests.uid('l2'), 14, 'Good.', null);
select public.grade_release(tests.uid('t2'), false, tests.id('a2'), tests.uid('l2'));
select tests.reset();
insert into public.notifications (recipient_id, notification_type, title, message) values (tests.uid('l2'), 'ANNOUNCEMENT', 'For Abena', 'Private.');

-- ---------------------------------------------------------------- a learner against another learner
select tests.authenticate_as(tests.uid('l1'));
select ok(tests.blocked($$ select id from public.submissions where learner_id = tests.uid('l2') $$), 'learner: cannot read another learner''s answer by id');
select ok(tests.blocked($$ select id from public.submission_versions where submission_id = tests.id('s2') $$), 'learner: nor its versions');
select ok(tests.blocked($$ select id from public.submission_files where file_object_id = tests.id('f2') $$), 'learner: nor its files');
select ok(tests.blocked($$ select id from public.file_objects where id = tests.id('f2') $$), 'learner: nor the file record');
select ok(tests.blocked($$ select id from storage.objects where name = 'attack/f2.m4a' $$), 'learner: nor the stored object');
select ok(tests.blocked($$ select id from public.notifications where recipient_id = tests.uid('l2') $$), 'learner: nor another learner''s notifications');
select ok(tests.blocked($$ update public.notifications set read_at = now() where recipient_id = tests.uid('l2') returning id $$), 'learner: nor mark them read');
select ok(tests.blocked($$ select email from public.profiles where id = tests.uid('l2') $$), 'learner: nor another learner''s email');
select ok(tests.blocked($$ update public.profiles set first_name = 'Changed' where id = tests.uid('l2') returning id $$), 'learner: nor change another learner''s name');
select ok(tests.blocked($$ update public.profiles set profile_image_file_id = tests.id('f2') where id = tests.uid('l1') returning id $$),
  'learner: nor use another learner''s file as their own photo');

-- ---------------------------------------------------------------- a learner against role, score, deadline and enrolment
select ok(tests.blocked($$ update public.profiles set role = 'ADMIN' where id = tests.uid('l1') returning id $$), 'learner: cannot make themselves an administrator');
select ok(tests.blocked($$ update public.profiles set account_status = 'ACTIVE', can_publish_directly = true where id = tests.uid('l1') returning id $$), 'learner: nor change their status or permissions');
select ok(tests.blocked($$ update public.submissions set score = 20, released_score = 20 where learner_id = tests.uid('l1') returning id $$), 'learner: nor set a score');
select ok(tests.blocked($$ update public.assignments set due_at = now() + interval '1 year' where id = tests.id('a1') returning id $$), 'learner: nor move a deadline');
select ok(tests.blocked($$ insert into public.submission_extensions (assignment_id, learner_id, extended_due_at, granted_by) values (tests.id('a1'), tests.uid('l1'), now() + interval '30 days', tests.uid('l1')) returning id $$),
  'learner: nor give themselves an extension');
select ok(tests.blocked($$ insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values (tests.id('c2'), tests.uid('l1'), 'ACTIVE', tests.uid('l1')) returning id $$),
  'learner: nor enrol themselves in another course');
select ok(tests.blocked($$ insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values (tests.id('c1'), tests.uid('l1'), 'OWNER', tests.uid('l1')) returning id $$),
  'learner: nor make themselves a lecturer of a course');
select ok(tests.blocked($$ update public.system_settings set value = '0' where key = 'pass_mark' returning key $$), 'learner: nor change a setting');
select ok(tests.blocked($$ insert into public.retention_holds (scope, scope_id, reason, placed_by) values ('LEARNER', tests.uid('l1'), 'mine', tests.uid('l1')) returning id $$), 'learner: nor place a retention hold');
select ok(tests.blocked($$ insert into public.audit_logs (action, entity_type, metadata) values ('fake', 'x', '{}') returning id $$), 'learner: nor write the audit log');

-- ---------------------------------------------------------------- unpublished resources and invalid file states
select ok(tests.blocked($$ select id from public.lessons where id = tests.id('dl') $$), 'learner: cannot open a draft lesson by id');
select is(tests.attempt($$ select id from public.lessons where id = tests.id('pl') $$), 'rows:1', 'learner: but opens the published one');
select ok(tests.blocked($$ select id from public.assignments where id = tests.id('ad') $$), 'learner: cannot open a draft assignment by id');
select ok(tests.blocked($$ select id from public.assignments where id = tests.id('a2') $$), 'learner: nor an assignment of a course they are not in');
select ok(tests.blocked($$ select id from storage.objects where name = 'attack/fp.m4a' $$), 'learner: cannot open even their own file before it is validated');

-- ---------------------------------------------------------------- nothing is deleted by a client (D25)
select ok(tests.blocked($$ delete from public.submissions returning id $$), 'learner: deletes no answers');
select ok(tests.blocked($$ delete from public.notifications returning id $$), 'learner: deletes no notifications');
select ok(tests.blocked($$ delete from storage.objects where bucket_id = 'learner-submissions' returning id $$), 'learner: deletes no stored files');
select ok(tests.blocked($$ delete from public.profiles where id = tests.uid('l1') returning id $$), 'learner: cannot delete their own account row');

-- Positive controls: the same learner reaches what is theirs, so the refusals above are real.
select is(tests.attempt($$ select email from public.profiles where id = tests.uid('l1') $$), 'rows:1', 'control: a learner reads their own email');
select is(tests.attempt($$ update public.profiles set contact_number = '+233 20 000 0000' where id = tests.uid('l1') returning id $$), 'rows:1', 'control: and changes their own phone number');

-- ---------------------------------------------------------------- a lecturer against another course
select tests.reset(); select tests.authenticate_as(tests.uid('t2'));
select is(tests.attempt($$ select id from public.submissions where id = tests.id('s2') $$), 'rows:1', 'control: the course''s own lecturer reads the answer');
select is(tests.attempt($$ select id from storage.objects where name = 'attack/f2.m4a' $$), 'rows:1', 'control: and its stored file');
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select ok(tests.blocked($$ select id from public.submissions where id = tests.id('s2') $$), 'lecturer: cannot read an answer in a course they do not teach');
select ok(tests.blocked($$ select id from storage.objects where name = 'attack/f2.m4a' $$), 'lecturer: nor its stored file');
select ok(tests.blocked($$ update public.courses set title = 'Taken over' where id = tests.id('c2') returning id $$), 'lecturer: nor rename another lecturer''s course');
select ok(tests.blocked($$ update public.submissions set released_score = 0 where id = tests.id('s2') returning id $$), 'lecturer: nor change its grade');
select ok(tests.blocked($$ update public.submissions set score = 19 where assignment_id = tests.id('a1') returning id $$), 'lecturer: nor write a score directly even in their own course (grades go through the grading functions)');
select ok(tests.blocked($$ update public.lessons set publication_status = 'PUBLISHED' where id = tests.id('dl') returning id $$), 'lecturer: nor publish a lesson by writing the table');
select ok(tests.blocked($$ select id from public.audit_logs $$), 'lecturer: cannot read the audit log');
select ok(tests.blocked($$ select key from public.system_settings where is_sensitive $$), 'lecturer: nor sensitive settings');

-- ---------------------------------------------------------------- an administrator without two-step verification
select tests.reset(); select tests.authenticate_as(tests.uid('a1'));
select ok(tests.blocked($$ select id from public.audit_logs $$), 'admin aal1: cannot read the audit log');
select ok(tests.blocked($$ update public.system_settings set value = '0' where key = 'pass_mark' returning key $$), 'admin aal1: nor change a setting');
select ok(tests.blocked($$ select id from public.submissions where id = tests.id('s2') $$), 'admin aal1: nor read answers');
select ok(tests.blocked($$ select public.retention_hold_place('COURSE', tests.id('c1'), 'No two-step') $$), 'admin aal1: nor place a hold');

-- ---------------------------------------------------------------- what the API exposes
select tests.reset();
select is((select count(*)::int from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'), 0, 'anonymous visitors have no table privileges');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 0,
  'and can run no function');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
              and pg_get_function_identity_arguments(p.oid) ~ '(^|, )p_actor uuid' and p.proname not in ('audit_log_search', 'audit_log_export')), 0,
  'no function that takes a caller''s id (p_actor) is open to signed-in users; the audit log''s p_actor is only a filter');
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0, 'every table has row-level security on');
select is((select count(*)::int from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT', 'DELETE', 'TRUNCATE')), 0,
  'signed-in users can insert into or delete from no table directly');
select is((select count(*)::int from storage.buckets where public), 0, 'no storage bucket is public');

select * from finish();
rollback;
