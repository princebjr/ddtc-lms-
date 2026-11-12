-- Phase 13 (performance with the same rules, migration 54): who sees an answer and its versions is unchanged
-- now that the policies check "mine" by column and "a course I manage" as one set per query.
--   A learner sees their own answers and versions (drafts included) while their account is active.
--   The course's lecturers and AAL2 administrators see sent answers (never drafts) and their versions.
--   Another course's lecturer, another learner and an administrator without two-step verification see none.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(12);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Church History', 'HIS101', tests.uid('t2'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')), (tests.id('c2'), tests.uid('t2'), 'OWNER', tests.uid('t2'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select tests.id('c1'), tests.uid(l), 'ACTIVE', tests.uid('a1') from unnest(array['l1', 'l2']) l;
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at)
select tests.id('a1'), tests.id('c1'), g.id, 'Reflection', 'TEXT', '<p>x</p>', now() + interval '7 days', 20, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now()
  from public.grade_categories g where g.course_id = tests.id('c1') and g.part = 'ASSIGNMENTS' and g.archived_at is null;
-- Kwame sent his answer (version 1); Abena has only a draft.
insert into public.submissions (id, assignment_id, learner_id, status, current_version) values
  (tests.id('s1'), tests.id('a1'), tests.uid('l1'), 'SUBMITTED', 1),
  (tests.id('s2'), tests.id('a1'), tests.uid('l2'), 'DRAFT', 0);
insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id) values (tests.id('s1'), 1, 'Mine.', false, gen_random_uuid());

/** The answers and versions visible to the current user among this test's own. */
create function tests.seen() returns text language sql stable as $$
  select (select count(*) from public.submissions where id in (tests.id('s1'), tests.id('s2'))) || ' answers, '
      || (select count(*) from public.submission_versions where submission_id in (tests.id('s1'), tests.id('s2'))) || ' versions'
$$;
grant execute on function tests.seen() to authenticated;

select tests.authenticate_as(tests.uid('l1'));
select is(tests.seen(), '1 answers, 1 versions', 'a learner sees their own sent answer and its version');
select tests.reset(); select tests.authenticate_as(tests.uid('l2'));
select is(tests.seen(), '1 answers, 0 versions', 'another learner sees only their own draft');
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select is(tests.seen(), '1 answers, 1 versions', 'the course''s lecturer sees the sent answer and its version');
select is((select count(*)::int from public.submissions where id = tests.id('s2')), 0, 'but never a draft');
select tests.reset(); select tests.authenticate_as(tests.uid('t2'));
select is(tests.seen(), '0 answers, 0 versions', 'another course''s lecturer sees none');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is(tests.seen(), '1 answers, 1 versions', 'an administrator with two-step verification sees the sent answer');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'));
select is(tests.seen(), '0 answers, 0 versions', 'an administrator without it sees none');

-- A deactivated learner no longer sees their answers (as before).
select tests.reset();
update public.profiles set account_status = 'SUSPENDED' where id = tests.uid('l1');
select tests.authenticate_as(tests.uid('l1'));
select is(tests.seen(), '0 answers, 0 versions', 'a suspended learner sees none of their answers');
select tests.reset();
update public.profiles set account_status = 'ACTIVE' where id = tests.uid('l1');
-- A removed lecturer no longer sees the course's answers.
update public.course_lecturers set removed_at = now(), removed_by = tests.uid('a1') where course_id = tests.id('c1') and lecturer_id = tests.uid('t1');
select tests.authenticate_as(tests.uid('t1'));
select is(tests.seen(), '0 answers, 0 versions', 'a lecturer removed from the course sees none');
select tests.reset();

select is((select count(*)::int from pg_policies where tablename = 'submissions' and qual ~ 'can_see_submission\(id\)'), 0, 'the answers policy no longer checks each row with a function');
select is((select count(*)::int from pg_policies where tablename = 'submission_versions' and qual ~ 'can_see_submission\(submission_id\)'), 0, 'nor the versions policy');
select ok(private.can_see_submission(tests.id('s1')) is not null, 'can_see_submission is kept for the functions that use it');

select * from finish();
rollback;
