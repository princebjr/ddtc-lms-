-- Phase 9: what the database itself holds for grading, whatever calls it. A score stays between 0 and
-- the assignment's maximum marks (and maximum marks cannot drop below a score already given); every
-- change to a grade is recorded in grade_change_history, which nobody can change or delete; the grading
-- columns stay closed to clients, so grades are read only through functions that check who asks:
-- the course's lecturers and AAL2 administrators see every grade (assignment_results,
-- assignment_result_counts, submission_review with the history); a learner sees only their own grade
-- and only once released (my_grade, D16), and keeps seeing the released grade while a change waits to
-- be released (owner decision 2, 2026-11-09). Notifications are read and marked read by their
-- recipient only. Percentage, letter grade and band come from one database helper (D14, D15, D30).
-- Tests required (phase file): out-of-range scores rejected; learners see nothing before release and
-- never another learner's grade. The grading functions themselves are tested in 20_grading_functions.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(52);

-- ---------------------------------------------------------------- people, course, assignment
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Yaw', 'Darko')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
-- Fixture ids from short names (hex-encoded): c = course, a = assignment, s = submission, n = notification.
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Principles of Discipleship', 'DIS201', tests.uid('t2'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.id('c2'), tests.uid('t2'), 'OWNER', tests.uid('t2'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select tests.id('c1'), tests.uid(l), 'ACTIVE', tests.uid('a1') from unnest(array['l1', 'l2', 'l3']) l;
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at)
select tests.id('a1'), tests.id('c1'), g.id, 'Reflection on Genesis 1', 'TEXT', '<p>Read Genesis 1 and reflect.</p>', now() + interval '7 days', 20,
       array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now()
  from public.grade_categories g where g.course_id = tests.id('c1');

-- s1: Kwame's answer, graded 16 and released. s2: Abena's answer, graded 12 as a draft (not released).
-- Yaw has sent nothing. The grades are written here directly (as the trusted functions would).
insert into public.submissions (id, assignment_id, learner_id, status, current_version) values
  (tests.id('s1'), tests.id('a1'), tests.uid('l1'), 'SUBMITTED', 1),
  (tests.id('s2'), tests.id('a1'), tests.uid('l2'), 'SUBMITTED', 1);
insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id)
values (tests.id('s1'), 1, 'God creates with purpose.', false, gen_random_uuid()), (tests.id('s2'), 1, 'Order out of chaos.', false, gen_random_uuid());
select set_config('app.actor_id', tests.uid('t1')::text, true);
update public.submissions set status = 'GRADED', score = 16, feedback = 'Good reading of the text.', graded_by = tests.uid('t1'), graded_at = now()
 where id in (tests.id('s1'));
update public.submissions set released_score = score, released_feedback = feedback, released_by = tests.uid('t1'), released_at = now(), grade_release_status = 'RELEASED'
 where id = tests.id('s1');
update public.submissions set status = 'GRADED', score = 12, feedback = 'Develop the second part.', graded_by = tests.uid('t1'), graded_at = now()
 where id = tests.id('s2');
insert into public.notifications (id, recipient_id, notification_type, title, message, related_entity_type, related_entity_id, link_path, deduplication_key) values
  (tests.id('n1'), tests.uid('l1'), 'GRADE_RELEASED', 'New grade available', 'Your grade for Reflection on Genesis 1 is ready.', 'assignment', tests.id('a1'),
   '/learner/courses/' || tests.id('c1') || '/assignments/' || tests.id('a1'), 'grade-release:' || tests.id('s1') || ':1');

-- ---------------------------------------------------------------- structure
select has_table('public', 'grade_change_history', 'grade_change_history exists');
select has_table('public', 'notifications', 'notifications exists');
select ok((select relrowsecurity from pg_class where oid = 'public.grade_change_history'::regclass), 'grade history has row level security on');
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'notifications have row level security on');
select has_column('public', 'submissions', 'released_score', 'the score the learner sees is kept apart (owner decision 2)');
select has_column('public', 'submissions', 'released_feedback', 'and so is the feedback the learner sees');

-- ---------------------------------------------------------------- scores between 0 and maximum marks
select throws_ok($$ update public.submissions set score = 21 where id = tests.id('s2') $$, '22023', 'The score must be between 0 and 20',
  'a score above the maximum marks is refused, whoever writes it');
select throws_ok($$ update public.submissions set score = -1 where id = tests.id('s2') $$, '22023', 'The score must be between 0 and 20',
  'and so is a score below 0');
select lives_ok($$ update public.submissions set score = 20 where id = tests.id('s2') $$, 'the maximum itself is allowed');
select lives_ok($$ update public.submissions set score = 12.5 where id = tests.id('s2') $$, 'and so are two decimals (owner decision 6)');
select throws_ok($$ update public.assignments set max_marks = 10 where id = tests.id('a1') $$, '22023', 'Some answers already have more marks than that',
  'maximum marks cannot drop below a score already given');
select lives_ok($$ update public.assignments set max_marks = 25 where id = tests.id('a1') $$, 'raising maximum marks is fine');
update public.assignments set max_marks = 20 where id = tests.id('a1');

-- ---------------------------------------------------------------- the history records every change
select is((select count(*)::int from public.grade_change_history where submission_id = tests.id('s2') and event = 'SAVED'), 3,
  'every change to a score or feedback is recorded (graded 12, then 20, then 12.5; the refused ones leave nothing)');
select is((select array[previous_score, new_score] from public.grade_change_history where submission_id = tests.id('s2') order by changed_at desc, id desc limit 1),
  array[20, 12.5]::numeric[], 'with the previous and the new score');
select is((select changed_by from public.grade_change_history where submission_id = tests.id('s2') order by changed_at desc, id desc limit 1), tests.uid('t1'),
  'and who changed it');
select is((select count(*)::int from public.grade_change_history where submission_id = tests.id('s1') and event = 'RELEASED'), 1, 'a release is recorded too');
select throws_ok($$ update public.submissions set score = 15 where id = tests.id('s1') $$, '22023', 'Give a reason for changing a released grade',
  'a released grade changes only with a reason');
select set_config('app.grade_reason', 'Marked the second part again', true);
update public.submissions set score = 15, grade_release_status = 'DRAFT' where id = tests.id('s1');
select set_config('app.grade_reason', '', true);
select is((select reason from public.grade_change_history where submission_id = tests.id('s1') and event = 'SAVED' order by changed_at desc, id desc limit 1),
  'Marked the second part again', 'and the reason is kept with the change');

select tests.as_service();
select throws_ok($$ update public.grade_change_history set reason = 'x' $$, '42501', 'Grade history cannot be changed', 'nobody changes the history, not even the server');
select throws_ok($$ delete from public.grade_change_history $$, '42501', 'Grade history cannot be changed', 'or deletes it');
select tests.reset();
select throws_ok($$ truncate public.grade_change_history $$, '42501', 'Grade history cannot be changed', 'or empties it');

-- ---------------------------------------------------------------- grading columns stay closed to clients
select tests.authenticate_as(tests.uid('l1'));
select throws_ok($$ select score from public.submissions where id = tests.id('s1') $$, '42501', null, 'a learner cannot read the grading columns directly');
select throws_ok($$ select * from public.grade_change_history $$, '42501', null, 'or the grade history');
select tests.authenticate_as(tests.uid('t1'));
select throws_ok($$ select score, feedback from public.submissions where id = tests.id('s2') $$, '42501', null, 'nor can a lecturer: grades go through the functions');
select throws_ok($$ insert into public.grade_change_history (submission_id, event, changed_by) values (tests.id('s2'), 'SAVED', tests.uid('t1')) $$, '42501', null,
  'and nobody writes history by hand');
select throws_ok($$ select public.grade_save(tests.uid('t1'), false, tests.id('a1'), tests.uid('l2'), 10, null, null) $$, '42501', null,
  'the trusted grading functions are for the server only');

-- ---------------------------------------------------------------- the learner's own grade, released only (D16)
select tests.authenticate_as(tests.uid('l1'));
select is((public.my_grade(tests.id('a1')) ->> 'score')::numeric, 16::numeric, 'a learner sees their released score');
select is(public.my_grade(tests.id('a1')) ->> 'feedback', 'Good reading of the text.', 'and the released feedback');
select is((public.my_grade(tests.id('a1')) ->> 'percentage')::numeric, 80::numeric, 'with the percentage from the database');
select is(public.my_grade(tests.id('a1')) ->> 'letter_grade', 'A', 'the letter grade (D14)');
select is(public.my_grade(tests.id('a1')) ->> 'band', '80-89%', 'and the band (D15)');
select is((public.my_grade(tests.id('a1')) ->> 'score')::numeric, 16::numeric,
  'a change waiting to be released does not reach the learner (15 is a draft; owner decision 2)');
select tests.authenticate_as(tests.uid('l2'));
select is(public.my_grade(tests.id('a1')), null, 'a draft grade is invisible to its learner');
select tests.authenticate_as(tests.uid('l3'));
select is(public.my_grade(tests.id('a1')), null, 'and a learner who sent nothing has no grade');
select tests.authenticate_as(tests.uid('t1'));
select is(public.my_grade(tests.id('a1')), null, 'my_grade is only ever the caller''s own grade');

-- ---------------------------------------------------------------- the lecturer's results
select tests.authenticate_as(tests.uid('t1'));
select set_eq($$ select first_name, result, coalesce(score::text, '-') from public.assignment_results(tests.id('a1')) $$,
  $$ values ('Kwame', 'GRADED', '15.00'), ('Abena', 'GRADED', '12.50'), ('Yaw', 'NOT_YET_DUE', '-') $$,
  'the course''s lecturer sees every enrolled learner with their result, those who sent nothing included');
select is((select array[enrolled, submitted, graded, ungraded, not_yet_due, missing, released] from public.assignment_result_counts(tests.id('a1'))),
  array[3, 2, 2, 0, 1, 0, 0], 'and counts that add up (Kwame''s change waits to be released again)');
select is((select public.submission_review(tests.id('a1'), tests.uid('l1')) -> 'grade' ->> 'released_score')::numeric, 16::numeric,
  'the answer view shows the released score');
select is((select public.submission_review(tests.id('a1'), tests.uid('l1')) -> 'grade' ->> 'score')::numeric, 15::numeric, 'beside the changed one');
select ok((select jsonb_array_length(public.submission_review(tests.id('a1'), tests.uid('l1')) -> 'history') >= 3), 'with the grade history');
select tests.authenticate_as(tests.uid('t2'));
select is((select count(*)::int from public.assignment_results(tests.id('a1'))), 0, 'another course''s lecturer sees no results');
select is((select count(*)::int from public.assignment_result_counts(tests.id('a1'))), 0, 'and no counts');
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.assignment_results(tests.id('a1'))), 0, 'a learner never sees the class''s results');
select is(public.submission_review(tests.id('a1'), tests.uid('l2')), null, 'or another learner''s grade');
select tests.authenticate_as(tests.uid('a1'), 'aal1');
select is((select count(*)::int from public.assignment_results(tests.id('a1'))), 0, 'an administrator without two-step verification sees nothing');
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is((select count(*)::int from public.assignment_results(tests.id('a1'))), 3, 'an AAL2 administrator sees the results');

-- ---------------------------------------------------------------- notifications: the recipient only
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.notifications where id = tests.id('n1')), 1, 'a learner reads their own notification');
select lives_ok($$ update public.notifications set read_at = now() where id = tests.id('n1') $$, 'and marks it read');
select throws_ok($$ update public.notifications set title = 'x' where id = tests.id('n1') $$, '42501', null, 'but changes nothing else');
select tests.authenticate_as(tests.uid('l2'));
select is((select count(*)::int from public.notifications where id = tests.id('n1')), 0, 'another learner never sees it');

-- ---------------------------------------------------------------- one helper for percentage, letter grade and band
select tests.reset();
select results_eq($$ select percentage, letter_grade, band, passed from private.grade_facts(15.9, 20) $$,
  $$ values (79.5::numeric, 'B', '70-79%', true) $$, '79.5% is a B in the 70-79% band (lower bounds decide)');
select results_eq($$ select percentage, letter_grade, band, passed from private.grade_facts(9.9, 20) $$,
  $$ values (49.5::numeric, 'F', '0-49%', false) $$, 'below the pass mark of 50 is an F and not passed');

select * from finish();
rollback;
