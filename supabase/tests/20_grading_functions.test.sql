-- Phase 9: the trusted grading functions, called by grade-submission and release-grades after they
-- check the caller. grade_save grades an answer that was sent (0 to maximum marks, plain-text feedback;
-- saving the same thing twice changes nothing); a released grade changes only with a reason, and the
-- learner keeps seeing the released grade until the change is released (owner decision 2). grade_release
-- releases one learner's grade or every draft grade of an assignment, refuses while the course's
-- category weights do not total 100 (D12), and writes one notification per learner and event (D16, D31;
-- owner decision 1). grade_reopen needs a reason; a reopened answer may be sent again only before the
-- learner's effective due date (owner decision 3, ADR-013). Everything is audited. The results count
-- every enrolment except WITHDRAWN (owner decision 4); a learner who sent nothing is Missing only after
-- their effective due date, "not yet due" before it (owner decision 5). Exit gate: the counts always
-- add up to the enrolled total.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(52);

-- ---------------------------------------------------------------- people and courses
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Yaw', 'Darko')::text, true);
select set_config('t.l4', tests.create_user('l4@example.test', 'Esi', 'Owusu')::text, true);
select set_config('t.l5', tests.create_user('l5@example.test', 'Kofi', 'Asante')::text, true);
select set_config('t.l6', tests.create_user('l6@example.test', 'Akua', 'Boakye')::text, true);
select set_config('t.l7', tests.create_user('l7@example.test', 'Kojo', 'Appiah')::text, true);
select set_config('t.l8', tests.create_user('l8@example.test', 'Efua', 'Sarpong')::text, true);
select set_config('t.l9', tests.create_user('l9@example.test', 'Ato', 'Quaye')::text, true);
select set_config('t.lx', tests.create_user('lx@example.test', 'Adwoa', 'Nyarko')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
-- Fixture ids from short names (hex-encoded): c = course, a = assignment.
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;

-- c1: the main course. c3: weights total 90 (release refused). c9: archived.
insert into public.courses (id, title, course_code, created_by, status, published_at, archived_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now(), null),
  (tests.id('c3'), 'Church History', 'CHH110', tests.uid('t1'), 'PUBLISHED', now(), null),
  (tests.id('c9'), 'Old Testament Survey', 'OTS100', tests.uid('t1'), 'ARCHIVED', now(), now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by)
select tests.id(c), tests.uid('t1'), 'OWNER', tests.uid('t1') from unnest(array['c1', 'c3', 'c9']) c;
update public.grade_categories set weight = 90 where course_id = tests.id('c3');
-- c1 learners: l1 to l6 active, l7 suspended, l8 completed (all counted); l9 withdrawn after sending an
-- answer and lx withdrawn without one (never counted).
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select tests.id('c1'), tests.uid(l), 'ACTIVE', tests.uid('a1') from unnest(array['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l9']) l;
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('l7'), 'SUSPENDED', tests.uid('a1')),
  (tests.id('c1'), tests.uid('l8'), 'COMPLETED', tests.uid('a1')),
  (tests.id('c1'), tests.uid('lx'), 'WITHDRAWN', tests.uid('a1')),
  (tests.id('c3'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c9'), tests.uid('l1'), 'ACTIVE', tests.uid('a1'));
-- aG due in 7 days; aP past due (with a future extension for l6); aC in c3; aZ in the archived c9.
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at)
select tests.id(x.id), tests.id(x.course), g.id, x.title, 'TEXT', '<p>Respond in your own words.</p>', now() + x.due, 20, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now()
  from (values
    ('aG', 'c1', 'Reflection on Genesis 1', interval '7 days'),
    ('aP', 'c1', 'Prayer journal', interval '-1 day'),
    ('aC', 'c3', 'Reformation essay', interval '7 days'),
    ('aZ', 'c9', 'Archived course work', interval '7 days')
  ) as x(id, course, title, due)
  join public.grade_categories g on g.course_id = tests.id(x.course);
insert into public.submission_extensions (assignment_id, learner_id, extended_due_at, granted_by)
values (tests.id('aP'), tests.uid('l6'), now() + interval '2 days', tests.uid('t1'));

/** An answer sent as version n (as submit-assignment leaves it), written directly for the fixture. */
create function tests.sent(p_learner text, p_assignment text, p_late boolean default false) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.submissions (assignment_id, learner_id, status, current_version, is_late)
  values (tests.id(p_assignment), tests.uid(p_learner), 'SUBMITTED', 1, p_late) returning id into v;
  insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id) values (v, 1, 'My answer.', p_late, gen_random_uuid());
  return v;
end $$;
-- aG: l1, l2, l3, l4 sent. aP: l1, l2, l3 and the withdrawn l9 sent (late). aC and aZ: l1 sent.
select tests.sent(l, 'aG') from unnest(array['l1', 'l2', 'l3', 'l4']) l;
select tests.sent(l, 'aP', true) from unnest(array['l1', 'l2', 'l3', 'l9']) l;
select tests.sent('l1', 'aC');
select tests.sent('l1', 'aZ');
-- l5 has uploads waiting for aG but has sent nothing (a DRAFT submission).
insert into public.submissions (assignment_id, learner_id, status, current_version) values (tests.id('aG'), tests.uid('l5'), 'DRAFT', 0);

/** Calls as the service role, as the Edge Functions do. */
create function tests.save(p_learner text, p_assignment text, p_score numeric, p_feedback text default null, p_reason text default null, p_actor text default 't1', p_admin boolean default false)
returns table (submission_id uuid, changed boolean, grade_release_status public.grade_release_status) language sql as $$
  select * from public.grade_save(tests.uid(p_actor), p_admin, tests.id(p_assignment), tests.uid(p_learner), p_score, p_feedback, p_reason)
$$;
create function tests.sub(p_learner text, p_assignment text) returns public.submissions language sql stable as $$
  select * from public.submissions where learner_id = tests.uid(p_learner) and assignment_id = tests.id(p_assignment)
$$;
create function tests.counts(p_assignment text) returns int[] language sql stable as $$
  select array[enrolled, submitted, graded, ungraded, not_yet_due, missing, released, withdrawn_submitted]
    from public.assignment_result_counts(tests.id(p_assignment))
$$;
grant execute on function tests.uid(text), tests.id(text), tests.counts(text), tests.sub(text, text) to authenticated, service_role;
grant execute on function tests.save(text, text, numeric, text, text, text, boolean) to service_role;

-- ---------------------------------------------------------------- who may grade
select tests.as_service();
select throws_ok($$ select * from tests.save('l1', 'aG', 15, null, null, 't2') $$, '42501', 'You do not teach this course',
  'a lecturer who does not teach the course cannot grade');
select throws_ok($$ select * from tests.save('l1', 'aZ', 15) $$, '22023', 'This course is archived and read-only', 'nothing is graded in an archived course');
select throws_ok($$ select * from tests.save('l6', 'aG', 15) $$, 'P0002', 'This learner has not sent an answer', 'there is nothing to grade before an answer is sent');
select throws_ok($$ select * from tests.save('l5', 'aG', 15) $$, 'P0002', 'This learner has not sent an answer', 'uploads waiting to be sent are not an answer');
select throws_ok($$ select * from tests.save('l1', 'aG', null) $$, '22023', 'Enter a score', 'a grade needs a score');
select throws_ok($$ select * from tests.save('l1', 'aG', 20.01) $$, '22023', 'The score must be between 0 and 20', 'within the maximum marks');

-- ---------------------------------------------------------------- saving a draft grade
select is((select changed from tests.save('l1', 'aG', 15, '  Good reading of the text.  ')), true, 'the course''s lecturer saves a grade');
select is((select array[status::text, grade_release_status::text, trim_scale(score)::text, feedback] from tests.sub('l1', 'aG')),
  array['GRADED', 'DRAFT', '15', 'Good reading of the text.'], 'graded as a draft, the feedback trimmed');
select is((select graded_by from tests.sub('l1', 'aG')), tests.uid('t1'), 'with who graded it');
select is((select changed from tests.save('l1', 'aG', 15, 'Good reading of the text.')), false, 'saving the same grade again changes nothing');
select is((select count(*)::int from public.grade_change_history h join public.submissions s on s.id = h.submission_id
            where s.learner_id = tests.uid('l1') and s.assignment_id = tests.id('aG')), 1, 'so the history has one entry');
select is((select count(*)::int from public.audit_logs where action = 'grade.saved' and entity_id = (tests.sub('l1', 'aG')).id::text), 1, 'and the grade is audited');
select throws_ok($$ select public.submission_submit(tests.uid('l1'), tests.id('aG'), 'Second thoughts.', '{}', gen_random_uuid()) $$, '22023', 'This answer has been graded',
  'a graded answer cannot be sent again (D10)');
select is((select changed from tests.save('l2', 'aG', 18, null, null, 'a1', true)), true, 'an administrator can grade too');

-- ---------------------------------------------------------------- release (D12, D16)
select public.grade_save(tests.uid('t1'), false, tests.id('aC'), tests.uid('l1'), 10, null, null);
select throws_ok($$ select public.grade_release(tests.uid('t1'), false, tests.id('aC'), tests.uid('l1')) $$, '22023',
  'Category weights must total 100 before grades can be released', 'no release while the category weights do not total 100');
select is(public.grade_release(tests.uid('t1'), false, tests.id('aG'), tests.uid('l1')), 1, 'one learner''s grade is released');
select is((select array[grade_release_status::text, trim_scale(released_score)::text, released_feedback] from tests.sub('l1', 'aG')),
  array['RELEASED', '15', 'Good reading of the text.'], 'what the learner sees is now the grade');
select is((select released_by from tests.sub('l1', 'aG')), tests.uid('t1'), 'with who released it');
select is((select array[notification_type::text, title, link_path] from public.notifications where recipient_id = tests.uid('l1')),
  array['GRADE_RELEASED', 'New grade available', '/learner/courses/' || tests.id('c1') || '/assignments/' || tests.id('aG')],
  'the learner gets a notification that opens the assignment (owner decision 1)');
select is((select count(*)::int from public.audit_logs where action = 'grade.released' and entity_id = (tests.sub('l1', 'aG')).id::text), 1, 'the release is audited');
select throws_ok($$ select public.grade_release(tests.uid('t1'), false, tests.id('aG'), tests.uid('l1')) $$, '22023', 'There is no grade to release for this learner',
  'releasing it again does nothing');
select throws_ok($$ select public.grade_release(tests.uid('t1'), false, tests.id('aG'), tests.uid('l3')) $$, '22023', 'There is no grade to release for this learner',
  'and an ungraded answer has nothing to release');

-- ---------------------------------------------------------------- changing a released grade (D30, owner decision 2)
select throws_ok($$ select * from tests.save('l1', 'aG', 17) $$, '22023', 'Give a reason for changing a released grade', 'a released grade changes only with a reason');
select is((select grade_release_status::text from tests.save('l1', 'aG', 17, 'Good reading of the text.', '  Marked the second part again  ')), 'DRAFT',
  'with a reason the change is saved, waiting to be released');
select is((select array[trim_scale(score)::text, trim_scale(released_score)::text] from tests.sub('l1', 'aG')), array['17', '15'],
  'the learner still sees the released 15 until the 17 is released');
select is((select array[trim_scale(previous_score)::text, trim_scale(new_score)::text, reason] from public.grade_change_history
            where submission_id = (tests.sub('l1', 'aG')).id and event = 'SAVED' order by changed_at desc, id desc limit 1),
  array['15', '17', 'Marked the second part again'], 'the history keeps the previous and new score and the reason');
select is((select count(*)::int from public.audit_logs where action = 'grade.changed' and entity_id = (tests.sub('l1', 'aG')).id::text), 1, 'the change is audited');
select is((select count(*)::int from public.notifications where recipient_id = tests.uid('l1')), 1, 'nothing reaches the learner before the change is released');
select is(public.grade_release(tests.uid('t1'), false, tests.id('aG'), tests.uid('l1')), 1, 'releasing the change');
select is((select trim_scale(released_score)::text from tests.sub('l1', 'aG')), '17', 'shows the learner the new grade');
select is((select array_agg(notification_type::text order by created_at, notification_type) from public.notifications where recipient_id = tests.uid('l1')),
  array['GRADE_RELEASED', 'GRADE_UPDATED'], 'with one more notification saying the grade was updated');
select is((select count(distinct deduplication_key)::int from public.notifications where recipient_id = tests.uid('l1')), 2, 'one per event (D31)');

-- ---------------------------------------------------------------- releasing a whole assignment
select public.grade_save(tests.uid('t1'), false, tests.id('aG'), tests.uid('l3'), 11, null, null);
select is(public.grade_release(tests.uid('t1'), false, tests.id('aG')), 2, 'releasing the assignment releases every draft grade (Abena''s and Yaw''s)');
select is((select array_agg(grade_release_status::text order by l.first_name) from public.submissions s join public.profiles l on l.id = s.learner_id
            where s.assignment_id = tests.id('aG') and s.status <> 'DRAFT'), array['RELEASED', 'DRAFT', 'RELEASED', 'RELEASED'],
  'and leaves an ungraded answer (Esi''s) alone');
select throws_ok($$ select public.grade_release(tests.uid('t1'), false, tests.id('aG')) $$, '22023', 'There are no grades to release', 'with nothing left to release it says so');

-- ---------------------------------------------------------------- reopening (owner decision 3)
select throws_ok($$ select public.grade_reopen(tests.uid('t1'), false, tests.id('aG'), tests.uid('l1'), '   ') $$, '22023', 'Give a reason for reopening',
  'reopening needs a reason');
select throws_ok($$ select public.grade_reopen(tests.uid('t1'), false, tests.id('aG'), tests.uid('l4'), 'Look again') $$, '22023', 'Only a graded answer can be reopened',
  'only a graded answer can be reopened');
select lives_ok($$ select public.grade_reopen(tests.uid('t1'), false, tests.id('aG'), tests.uid('l1'), 'The recording did not play') $$, 'a graded answer is reopened');
select is((select array[status::text, trim_scale(released_score)::text] from tests.sub('l1', 'aG')), array['REOPENED', '17'],
  'it is reopened and the learner keeps seeing the released grade');
select is((select reason from public.grade_change_history where submission_id = (tests.sub('l1', 'aG')).id and event = 'REOPENED'), 'The recording did not play',
  'the reason is in the history');
select is((select count(*)::int from public.audit_logs where action = 'grade.reopened' and entity_id = (tests.sub('l1', 'aG')).id::text), 1, 'and reopening is audited');
select is((select version_number from public.submission_submit(tests.uid('l1'), tests.id('aG'), 'Here is the recording again.', '{}', gen_random_uuid())), 2,
  'before the due date the learner may send the answer again');
select is((select status::text from tests.sub('l1', 'aG')), 'SUBMITTED', 'which waits to be graded again');
select public.grade_save(tests.uid('t1'), false, tests.id('aP'), tests.uid('l2'), 14, null, null);
select public.grade_reopen(tests.uid('t1'), false, tests.id('aP'), tests.uid('l2'), 'Check the second page');
select throws_ok($$ select public.submission_submit(tests.uid('l2'), tests.id('aP'), 'Again.', '{}', gen_random_uuid()) $$, '22023',
  'The due date has passed, so you cannot submit again', 'after the due date a reopened answer cannot be sent again: only the grade changes');
select * from tests.save('l2', 'aP', 16, null, 'Second page counted');
select is((select status::text from tests.sub('l2', 'aP')), 'GRADED', 'the lecturer grades the reopened answer again');

-- ---------------------------------------------------------------- results and counts (owner decisions 4 and 5; exit gate)
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select set_eq($$ select first_name, result, counted from public.assignment_results(tests.id('aP')) $$,
  $$ values ('Kwame', 'UNGRADED', true), ('Abena', 'GRADED', true), ('Yaw', 'UNGRADED', true), ('Esi', 'MISSING', true), ('Kofi', 'MISSING', true),
            ('Akua', 'NOT_YET_DUE', true), ('Kojo', 'MISSING', true), ('Efua', 'MISSING', true), ('Ato', 'UNGRADED', false) $$,
  'past the due date every counted learner who sent nothing is Missing, except one whose extension is still open; the withdrawn learner who sent an answer is listed but not counted');
select is(tests.counts('aP'), array[8, 3, 1, 2, 1, 4, 0, 1], 'enrolled 8 = submitted 3 + not yet due 1 + missing 4; submitted 3 = graded 1 + ungraded 2');
select is(tests.counts('aG'), array[8, 4, 2, 2, 4, 0, 2, 0],
  'before the due date nobody is missing: enrolled 8 = submitted 4 + not yet due 4 (Kwame''s answer, sent again, waits to be graded)');
select ok((select bool_and(c.enrolled = c.submitted + c.not_yet_due + c.missing and c.submitted = c.graded + c.ungraded and c.released <= c.graded)
             from public.assignments a cross join lateral public.assignment_result_counts(a.id) c where a.course_id = tests.id('c1')),
  'exit gate: for every assignment the counts add up to the enrolled total');
select is((select count(*)::int from public.assignment_results(tests.id('aG')) where first_name = 'Adwoa'), 0, 'a withdrawn learner who sent nothing is not listed');
select is((select result from public.assignment_results(tests.id('aG')) where first_name = 'Kofi'), 'NOT_YET_DUE',
  'uploads waiting to be sent count as nothing sent');
select is((select array[trim_scale(score)::text, letter_grade, band] from public.assignment_results(tests.id('aG')) where first_name = 'Abena'),
  array['18', 'A', '90-100%'], 'each result carries the percentage, letter grade and band from the database');

select * from finish();
rollback;
