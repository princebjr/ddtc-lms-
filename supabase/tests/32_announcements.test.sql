-- Phase 11 (owner request and answers of 2026-11-11, ADR-019): announcements to learners.
-- - A lecturer sends to the learners of a course they teach, and nowhere else.
-- - An AAL2 administrator sends to everyone, one course or one branch; a learner sends nothing.
-- - Each active learner in the audience gets one notification (and an email unless they turned email off);
--   withdrawn learners and other courses' learners get none.
-- - Learners read only the announcements meant for them; sending and archiving are audited; archived
--   announcements are kept, not deleted.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(20);

select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Esi', 'Owusu')::text, true);
select set_config('t.l4', tests.create_user('l4@example.test', 'Yaw', 'Darko')::text, true);
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;
create function tests.n(p_user text) returns int language sql stable as $$
  select count(*)::int from public.notifications where recipient_id = tests.uid(p_user) and notification_type::text = 'ANNOUNCEMENT'
$$;

insert into public.branches (id, name, position) values (tests.id('b1'), 'Kumasi Test', 901);
update public.profiles set branch_id = tests.id('b1') where id = tests.uid('l4');
insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Church History', 'HIS101', tests.uid('t2'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values
  (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1')), (tests.id('c2'), tests.uid('t2'), 'OWNER', tests.uid('t2'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')), (tests.id('c1'), tests.uid('l2'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c1'), tests.uid('l3'), 'WITHDRAWN', tests.uid('a1')), (tests.id('c2'), tests.uid('l4'), 'ACTIVE', tests.uid('a1'));
update public.notification_preferences set email_enabled = false where user_id = tests.uid('l2');

-- ---------------------------------------------------------------- lecturers
select tests.authenticate_as(tests.uid('t1'));
select throws_ok($$ select public.announcement_send(tests.id('c2'), null, false, 'Hello', 'Not my course.') $$, '42501', null,
  'a lecturer cannot announce to a course they do not teach');
select throws_ok($$ select public.announcement_send(null, null, true, 'Hello', 'Everyone.') $$, '42501', null, 'or to everyone');
select throws_ok($$ select public.announcement_send(tests.id('c1'), null, false, '', 'No title.') $$, '22023', null, 'a title is needed');
select set_config('t.ann', public.announcement_send(tests.id('c1'), null, false, 'Class moved', 'Saturday''s class starts at 10:00.')::text, true);
select tests.reset();
select is(tests.n('l1'), 1, 'the course''s active learners are told');
select is(tests.n('l3'), 0, 'not a withdrawn learner');
select is(tests.n('l4'), 0, 'not another course''s learner');
select is((select d.status from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
            where n.recipient_id = tests.uid('l1') and n.notification_type::text = 'ANNOUNCEMENT'), 'QUEUED', 'and emailed');
select is((select d.status from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
            where n.recipient_id = tests.uid('l2') and n.notification_type::text = 'ANNOUNCEMENT'), 'SUPPRESSED', 'unless they turned email off');
select is((select count(*)::int from public.audit_logs where action = 'announcement.sent' and entity_id = current_setting('t.ann')), 1, 'sending is audited');

-- ---------------------------------------------------------------- reading
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.announcements), 1, 'a learner reads their course''s announcement');
select tests.reset(); select tests.authenticate_as(tests.uid('l4'));
select is((select count(*)::int from public.announcements), 0, 'another course''s learner does not');
select throws_ok($$ select public.announcement_send(tests.id('c2'), null, false, 'Hi', 'From a learner.') $$, '42501', null, 'a learner cannot send');
select tests.reset(); select tests.authenticate_as(tests.uid('t2'));
select is((select count(*)::int from public.announcements), 0, 'another course''s lecturer does not read it either');

-- ---------------------------------------------------------------- administrators
select tests.reset(); select tests.authenticate_as(tests.uid('a1'));
select throws_ok($$ select public.announcement_send(null, null, true, 'Hello', 'Everyone.') $$, '42501', null, 'an administrator needs two-step verification');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
select lives_ok($$ select public.announcement_send(null, tests.id('b1'), false, 'Branch meeting', 'Kumasi learners meet on Friday.') $$, 'an administrator announces to one branch');
select lives_ok($$ select public.announcement_send(null, null, true, 'Holiday', 'The centre is closed on Monday.') $$, 'and to everyone');
select tests.reset();
select is(tests.n('l4'), 2, 'the branch learner gets the branch and the all-learner announcements');
select is(tests.n('l1'), 2, 'Kwame gets his course''s and the all-learner one');

-- ---------------------------------------------------------------- archiving
select tests.authenticate_as(tests.uid('t1'));
select lives_ok($$ select public.announcement_archive(current_setting('t.ann')::uuid) $$, 'the author archives it');
select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.announcements where id = current_setting('t.ann')::uuid), 0, 'learners no longer see it (kept, not deleted)');
select tests.reset();

select * from finish();
rollback;
