-- Phase 11 (D21, D31, ADR-019; owner answers of 2026-11-10): notifications, email deliveries and reminders.
-- - Each D21 event (and the examination events) notifies only its recipients, once (deduplication).
-- - An email event queues one delivery, SUPPRESSED when the person turned email off; in-app only events
--   (extensions, alerts) queue none.
-- - The retry schedule: after transient failures wait 1, 5, 15, 60 and 240 minutes, then FAILED with an
--   alert to administrators; a permanent failure is FAILED at once.
-- - Reminders: only for unsubmitted work, 24 hours before each learner's own deadline, fired once; a
--   deadline or extension change replaces the pending reminder.
-- - Only the recipient reads a notification and may set read_at only; deliveries, reminders and the
--   worker functions are closed to clients.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(48);

select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Esi', 'Owusu')::text, true);
select set_config('t.l4', tests.create_user('l4@example.test', 'Yaw', 'Darko')::text, true);
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;
create function tests.n(p_user text, p_type text) returns int language sql stable as $$
  select count(*)::int from public.notifications where recipient_id = tests.uid(p_user) and notification_type::text = p_type
$$;
create function tests.part(p_course text) returns uuid language sql stable as $$
  select g.id from public.grade_categories g where g.course_id = tests.id(p_course) and g.part = 'ASSIGNMENTS' and g.archived_at is null
$$;

-- Course c1 (published): Kwame and Abena active, Esi withdrawn. Course c2: Yaw only.
insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Church History', 'HIS101', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')), (tests.id('c2'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (id, course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('e1'), tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')),
  (tests.id('e2'), tests.id('c1'), tests.uid('l2'), 'ACTIVE', tests.uid('a1')),
  (tests.id('e3'), tests.id('c1'), tests.uid('l3'), 'WITHDRAWN', tests.uid('a1')),
  (tests.id('e4'), tests.id('c2'), tests.uid('l4'), 'ACTIVE', tests.uid('a1'));

-- ---------------------------------------------------------------- enrolment added
select is(tests.n('l1', 'ENROLMENT_ADDED'), 1, 'an active enrolment in a published course notifies the learner');
select is(tests.n('l3', 'ENROLMENT_ADDED'), 0, 'a withdrawn enrolment notifies nobody');

-- Abena turns email off before anything else is sent to her.
update public.notification_preferences set email_enabled = false where user_id = tests.uid('l2');

-- ---------------------------------------------------------------- assignment published
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by)
values (tests.id('A1'), tests.id('c1'), tests.part('c1'), 'Reflection on Genesis 1', 'TEXT', '<p>Respond.</p>', now() + interval '30 hours', 20, array['TEXT', 'AUDIO'], 'DRAFT', tests.uid('t1'));
select is(tests.n('l1', 'ASSIGNMENT_PUBLISHED'), 0, 'a draft assignment notifies nobody');
update public.assignments set publication_status = 'PUBLISHED', published_at = now() where id = tests.id('A1');
select is(tests.n('l1', 'ASSIGNMENT_PUBLISHED'), 1, 'publishing notifies an active learner');
select is(tests.n('l2', 'ASSIGNMENT_PUBLISHED'), 1, 'and the other active learner');
select is(tests.n('l3', 'ASSIGNMENT_PUBLISHED'), 0, 'not a withdrawn learner');
select is(tests.n('l4', 'ASSIGNMENT_PUBLISHED'), 0, 'not a learner of another course');
select is(tests.n('t1', 'ASSIGNMENT_PUBLISHED'), 0, 'not the lecturer');
update public.assignments set publication_status = 'DRAFT' where id = tests.id('A1');
update public.assignments set publication_status = 'PUBLISHED' where id = tests.id('A1');
select is(tests.n('l1', 'ASSIGNMENT_PUBLISHED'), 1, 'publishing again does not notify twice (one per event)');
select is((select link_path from public.notifications where recipient_id = tests.uid('l1') and notification_type = 'ASSIGNMENT_PUBLISHED'),
  '/learner/courses/' || tests.id('c1') || '/assignments/' || tests.id('A1'), 'View opens the assignment');

-- ---------------------------------------------------------------- email deliveries
select is((select d.status from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
            where n.recipient_id = tests.uid('l1') and n.notification_type = 'ASSIGNMENT_PUBLISHED'), 'QUEUED', 'an email is queued for Kwame');
select is((select d.status from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
            where n.recipient_id = tests.uid('l2') and n.notification_type = 'ASSIGNMENT_PUBLISHED'), 'SUPPRESSED', 'Abena turned email off: suppressed');

-- ---------------------------------------------------------------- reminders (24 hours before, unsubmitted only)
-- A1 is due in 30 hours: the reminder waits. Kwame has nothing sent; Abena sends her answer.
insert into public.submissions (assignment_id, learner_id, status, current_version) values (tests.id('A1'), tests.uid('l2'), 'SUBMITTED', 1);
select private.schedule_reminders();
select is((select count(*)::int from public.notification_reminders where item_id = tests.id('A1') and status = 'PENDING'), 1,
  'one pending reminder: Kwame only (Abena has sent hers; Esi is withdrawn)');
select is((select fire_at from public.notification_reminders where item_id = tests.id('A1') and learner_id = tests.uid('l1') and status = 'PENDING'),
  now() + interval '6 hours', 'it fires 24 hours before the deadline');
select is(tests.n('l1', 'DUE_REMINDER'), 0, 'not yet fired');
-- The deadline moves later: the pending reminder is replaced.
update public.assignments set due_at = now() + interval '50 hours' where id = tests.id('A1');
select private.schedule_reminders();
select results_eq($$ select status, fire_at from public.notification_reminders where item_id = tests.id('A1') and learner_id = tests.uid('l1') order by created_at, status $$,
  $$ values ('CANCELLED'::text, now() + interval '6 hours'), ('PENDING'::text, now() + interval '26 hours') $$, 'a deadline change cancels the old reminder and makes a new one');
-- Kwame is given an extension: replaced again, with his own deadline.
insert into public.submission_extensions (assignment_id, learner_id, extended_due_at, granted_by) values (tests.id('A1'), tests.uid('l1'), now() + interval '20 hours', tests.uid('t1'));
select private.schedule_reminders();
select is((select deduplication_key from public.notification_reminders where item_id = tests.id('A1') and learner_id = tests.uid('l1') and status <> 'CANCELLED'),
  'reminder:' || tests.id('A1') || ':' || tests.uid('l1') || ':' || (now() + interval '20 hours')::text, 'the key carries his effective deadline (D31)');
select is(tests.n('l1', 'DUE_REMINDER'), 1, 'within 24 hours of his deadline it fires');
select private.schedule_reminders();
select private.schedule_reminders();
select is(tests.n('l1', 'DUE_REMINDER'), 1, 'and fires only once');
select is(tests.n('l2', 'DUE_REMINDER'), 0, 'no reminder for work already sent');
select is(tests.n('l1', 'EXTENSION_CHANGED'), 1, 'the extension itself notified Kwame');
select is((select count(*)::int from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
            where n.notification_type = 'EXTENSION_CHANGED'), 0, 'extensions are in the app only (no email)');

-- ---------------------------------------------------------------- examinations
select tests.as_service();
create temporary table ex as select public.exam_save(tests.uid('t1'), false, tests.id('c1'), null,
  jsonb_build_object('title', 'Final examination', 'opens_at', now() - interval '1 hour', 'closes_at', now() + interval '10 hours')) as id;
select public.exam_structure_save(tests.uid('t1'), false, (select id from ex), jsonb_build_array(jsonb_build_object('title', 'A', 'questions', jsonb_build_array(
  jsonb_build_object('kind', 'ESSAY', 'prompt', 'Write about covenant', 'marks', 10)))));
select public.exam_publish(tests.uid('t1'), false, (select id from ex), true);
select tests.reset();
select is(tests.n('l1', 'EXAM_PUBLISHED'), 1, 'publishing an examination notifies the course''s learners');
select is(tests.n('l4', 'EXAM_PUBLISHED'), 0, 'and nobody else');
select private.schedule_reminders();
select is(tests.n('l2', 'DUE_REMINDER'), 1, 'an examination closing within 24 hours reminds a learner who has not submitted');

-- ---------------------------------------------------------------- course approved or returned
insert into public.courses (id, title, course_code, created_by, status, submitted_by, submitted_at) values
  (tests.id('c3'), 'Pastoral Care', 'PAS101', tests.uid('t1'), 'PENDING_APPROVAL', tests.uid('t1'), now()),
  (tests.id('c4'), 'Missions', 'MIS101', tests.uid('t1'), 'PENDING_APPROVAL', tests.uid('t1'), now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c3'), tests.uid('t1'), 'OWNER', tests.uid('t1')), (tests.id('c4'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
update public.courses set status = 'PUBLISHED', published_at = now() where id = tests.id('c3');
update public.courses set status = 'DRAFT', return_reason = 'Add the lesson outlines.' where id = tests.id('c4');
select is(tests.n('t1', 'COURSE_APPROVED'), 1, 'approval notifies the lecturer');
select is(tests.n('t1', 'COURSE_RETURNED'), 1, 'so does a return');
select ok((select message from public.notifications where recipient_id = tests.uid('t1') and notification_type = 'COURSE_RETURNED') like '%Add the lesson outlines.%',
  'with the reason');

-- ---------------------------------------------------------------- the retry schedule (D31)
select set_config('t.d', (select d.id::text from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
                          where n.recipient_id = tests.uid('l1') and n.notification_type = 'ASSIGNMENT_PUBLISHED'), true);
create function tests.fail(p_permanent boolean) returns void language sql as $$
  select public.notification_delivery_result(current_setting('t.d')::uuid, false, null, 'Provider unavailable', p_permanent)
$$;
create function tests.wait() returns int language sql stable as $$
  select (extract(epoch from next_attempt_at - now()) / 60)::int from public.notification_deliveries where id = current_setting('t.d')::uuid
$$;
grant execute on function tests.fail(boolean), tests.wait() to service_role;
select tests.as_service();
select tests.fail(false);
select is(tests.wait(), 1, 'after the first failure it waits 1 minute');
select tests.fail(false);
select is(tests.wait(), 5, 'then 5');
select tests.fail(false);
select is(tests.wait(), 15, 'then 15');
select tests.fail(false);
select is(tests.wait(), 60, 'then 60');
select tests.fail(false);
select results_eq($$ select status, attempts, (extract(epoch from next_attempt_at - now()) / 60)::int from public.notification_deliveries where id = current_setting('t.d')::uuid $$,
  $$ values ('RETRYING'::text, 5, 240) $$, 'then 240, still retrying after five failures');
select tests.fail(false);
select is((select status from public.notification_deliveries where id = current_setting('t.d')::uuid), 'FAILED', 'after the last retry it is FAILED');
select tests.reset();
select is(tests.n('a1', 'SYSTEM_ALERT'), 1, 'and administrators are alerted');
select is(tests.n('l1', 'SYSTEM_ALERT'), 0, 'nobody else');

-- A permanent failure (an invalid address) is FAILED at once.
select set_config('t.d', (select d.id::text from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
                          where n.recipient_id = tests.uid('l1') and n.notification_type = 'ENROLMENT_ADDED'), true);
select tests.as_service();
select tests.fail(true);
select results_eq($$ select status, attempts from public.notification_deliveries where id = current_setting('t.d')::uuid $$,
  $$ values ('FAILED'::text, 1) $$, 'a permanent failure is FAILED at once, never retried');
select tests.reset();

-- ---------------------------------------------------------------- access
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.notifications where recipient_id <> tests.uid('l1')), 0, 'a learner reads only their own notifications');
select lives_ok($$ update public.notifications set read_at = now() where recipient_id = tests.uid('l1') $$, 'and marks them read');
select throws_ok($$ update public.notifications set title = 'Changed' $$, '42501', null, 'but changes nothing else');
select is((select count(*)::int from public.notification_deliveries), 0, 'deliveries are closed to learners');
select is((select count(*)::int from public.notification_reminders), 0, 'so are reminders');
select throws_ok($$ select private.schedule_reminders() $$, '42501', null, 'the scheduler is not callable by clients');
select throws_ok($$ select public.notification_delivery_result(current_setting('t.d')::uuid, true, 'x', null, false) $$, '42501', null,
  'nor are the worker functions');
select throws_ok($$ select * from public.notification_deliveries_claim(10) $$, '42501', null, 'claiming either');
select tests.reset();

-- The worker claims due deliveries with the address, and skips anyone who turned email off.
-- Only this test's emails are due here (a local database may hold queued emails from other runs).
update public.notification_deliveries d set next_attempt_at = now() + interval '1 day'
  from public.notifications n
 where n.id = d.notification_id and d.status in ('QUEUED', 'RETRYING')
   and n.recipient_id not in (tests.uid('t1'), tests.uid('l1'), tests.uid('l2'), tests.uid('l3'), tests.uid('l4'), tests.uid('a1'));
select tests.as_service();
create temporary table claimed as select * from public.notification_deliveries_claim(50);
select ok((select count(*) from claimed where email = 'l1@example.test') > 0, 'the worker claims due emails with the address');
select is((select count(*)::int from claimed where email = 'l2@example.test'), 0, 'Abena''s emails are never claimed');
select is((select count(*)::int from public.notification_deliveries_claim(50)), 0, 'claimed emails are leased: a second claim takes none');
select tests.reset();

select * from finish();
rollback;
