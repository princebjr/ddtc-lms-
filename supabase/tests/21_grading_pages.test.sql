-- Step 9.1: the lecturer's "To grade" and the learner's "Grades and feedback" (navigation pages promised
-- for Phase 9). grading_queue() lists, for the courses the caller manages (their active lecturer
-- courses; every course for an AAL2 administrator), each answer waiting to be graded (sent or reopened)
-- and each draft grade not yet released (including a released grade changed since), never in an
-- archived course. my_grades() lists the signed-in learner's own answered assignments in courses they
-- are enrolled in (active or completed): the released grade (score, percentage, letter grade, band,
-- feedback, when, whether updated) or "awaiting" with no score at all: a draft never reaches the
-- learner (D16; owner decision 2 of 2026-11-09).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(19);

-- ---------------------------------------------------------------- people, courses, assignments
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Yaw', 'Darko')::text, true);
select set_config('t.lw', tests.create_user('lw@example.test', 'Ato', 'Quaye')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
-- Fixture ids from short names (hex-encoded): c = course, a = assignment.
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at, archived_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now(), null),
  (tests.id('c2'), 'Principles of Discipleship', 'DIS201', tests.uid('t2'), 'PUBLISHED', now(), null),
  (tests.id('c9'), 'Old Testament Survey', 'OTS100', tests.uid('t1'), 'ARCHIVED', now(), now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')),
  (tests.id('c2'), tests.uid('t2'), 'OWNER', tests.uid('t2')),
  (tests.id('c9'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c1'), tests.uid('l2'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c1'), tests.uid('l3'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c1'), tests.uid('lw'), 'WITHDRAWN', tests.uid('a1')),
  (tests.id('c2'), tests.uid('l1'), 'COMPLETED', tests.uid('a1')),
  (tests.id('c9'), tests.uid('l1'), 'ACTIVE', tests.uid('a1'));
-- aA, aB, aR in c1; aC in c2; aZ in the archived c9.
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at)
select tests.id(x.id), tests.id(x.course), g.id, x.title, 'TEXT', '<p>Respond in your own words.</p>', now() + interval '7 days', 20, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now()
  from (values
    ('aA', 'c1', 'Reflection on Genesis 1'),
    ('aB', 'c1', 'Covenant essay'),
    ('aR', 'c1', 'Psalm study'),
    ('aC', 'c2', 'Prayer journal'),
    ('aZ', 'c9', 'Archived course work')
  ) as x(id, course, title)
  join public.grade_categories g on g.course_id = tests.id(x.course) and g.part = 'ASSIGNMENTS' and g.archived_at is null;

/** An answer sent (as submit-assignment leaves it). */
create function tests.sent(p_learner text, p_assignment text) returns void language plpgsql as $$
declare v uuid;
begin
  insert into public.submissions (assignment_id, learner_id, status, current_version) values (tests.id(p_assignment), tests.uid(p_learner), 'SUBMITTED', 1) returning id into v;
  insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id) values (v, 1, 'My answer.', false, gen_random_uuid());
end $$;
select tests.sent(l, a) from (values ('l1', 'aA'), ('l2', 'aA'), ('l1', 'aB'), ('l2', 'aB'), ('l3', 'aR'), ('l1', 'aC'), ('l1', 'aZ'), ('lw', 'aB')) as x(l, a);
-- l1 aA: draft 15 (not released). l1 aB: released 16, then changed to 18 (waiting). l2 aB: released 12.
-- l3 aR: graded 10, released, then reopened. lw aB: released 14 (now withdrawn). l2 aA, l1 aC, l1 aZ: waiting.
select tests.as_service();
select public.grade_save(tests.uid('t1'), false, tests.id('aA'), tests.uid('l1'), 15, 'Promising.', null);
select public.grade_save(tests.uid('t1'), false, tests.id('aB'), tests.uid('l1'), 16, 'Well argued.', null);
select public.grade_save(tests.uid('t1'), false, tests.id('aB'), tests.uid('l2'), 12, null, null);
select public.grade_save(tests.uid('t1'), false, tests.id('aB'), tests.uid('lw'), 14, null, null);
select public.grade_save(tests.uid('t1'), false, tests.id('aR'), tests.uid('l3'), 10, null, null);
select public.grade_release(tests.uid('t1'), false, tests.id('aB'));
select public.grade_release(tests.uid('t1'), false, tests.id('aR'));
select public.grade_save(tests.uid('t1'), false, tests.id('aB'), tests.uid('l1'), 18, 'Well argued, with a strong conclusion.', 'Marked the conclusion again');
select public.grade_reopen(tests.uid('t1'), false, tests.id('aR'), tests.uid('l3'), 'The recording did not play');
select tests.reset();

-- ---------------------------------------------------------------- grading_queue(): the lecturer's To grade
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select set_eq($$ select assignment_title, first_name, state from public.grading_queue() $$,
  $$ values ('Reflection on Genesis 1', 'Abena', 'UNGRADED'), ('Reflection on Genesis 1', 'Kwame', 'DRAFT'),
            ('Covenant essay', 'Kwame', 'DRAFT'), ('Psalm study', 'Yaw', 'UNGRADED') $$,
  'the lecturer sees the answers waiting and the draft grades of their courses (a reopened answer waits; a released grade changed since is a draft); never an archived course, never another lecturer''s course');
select is((select course_code from public.grading_queue() where first_name = 'Abena'), 'BIB101', 'each row names its course');
select ok((select bool_and(submitted_at is not null) from public.grading_queue()), 'and when the answer was sent');
select tests.reset(); select tests.authenticate_as(tests.uid('t2'));
select set_eq($$ select assignment_title, first_name, state from public.grading_queue() $$, $$ values ('Prayer journal', 'Kwame', 'UNGRADED') $$,
  'another lecturer sees only their own course');
select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.grading_queue()), 0, 'a learner sees nothing');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal1');
select is((select count(*)::int from public.grading_queue()), 0, 'an administrator without two-step verification sees nothing');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
-- Counted on this test's courses only: a local database may hold other courses from earlier runs.
select is((select count(*)::int from public.grading_queue() where course_id in (tests.id('c1'), tests.id('c2'), tests.id('c9'))), 5,
  'an AAL2 administrator sees every course''s queue (archived courses aside)');
select tests.reset(); select tests.as_anon();
select throws_ok($$ select * from public.grading_queue() $$, '42501', null, 'someone signed out cannot call it');

-- ---------------------------------------------------------------- my_grades(): the learner's Grades and feedback
select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select set_eq($$ select assignment_title, state from public.my_grades() $$,
  $$ values ('Reflection on Genesis 1', 'AWAITING'), ('Covenant essay', 'RELEASED'), ('Prayer journal', 'AWAITING'), ('Archived course work', 'AWAITING') $$,
  'the learner sees each assignment they answered in their courses (a completed course too), released or awaiting');
select is((select score from public.my_grades() where assignment_title = 'Reflection on Genesis 1'), null, 'a draft grade never reaches the learner: no score');
select is((select feedback from public.my_grades() where assignment_title = 'Reflection on Genesis 1'), null, 'and no feedback');
select is((select score from public.my_grades() where assignment_title = 'Covenant essay'), 16::numeric,
  'a released grade changed since shows the released score until the change is released (owner decision 2)');
select is((select feedback from public.my_grades() where assignment_title = 'Covenant essay'), 'Well argued.', 'and the released feedback');
select is((select array[percentage::text, letter_grade, band] from public.my_grades() where assignment_title = 'Covenant essay'), array['80.00', 'A', '80-89%'],
  'with the percentage, letter grade and band from the database');
select tests.reset(); select tests.authenticate_as(tests.uid('l2'));
select set_eq($$ select assignment_title, state, coalesce(score::text, '-') from public.my_grades() $$,
  $$ values ('Reflection on Genesis 1', 'AWAITING', '-'), ('Covenant essay', 'RELEASED', '12.00') $$, 'another learner sees only their own');
select tests.reset(); select tests.authenticate_as(tests.uid('l3'));
select is((select array[state, score::text] from public.my_grades()), array['RELEASED', '10.00'], 'a reopened answer still shows its released grade');
select tests.reset(); select tests.authenticate_as(tests.uid('lw'));
select is((select count(*)::int from public.my_grades()), 0, 'a learner withdrawn from the course no longer sees it');
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.my_grades()), 0, 'my_grades is only ever the caller''s own');
select tests.reset(); select tests.as_anon();
select throws_ok($$ select * from public.my_grades() $$, '42501', null, 'someone signed out cannot call it');

select * from finish();
rollback;
