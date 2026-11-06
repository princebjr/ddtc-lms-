-- Phase 5: the trusted course functions behind create-course, course-lifecycle, course-lecturers,
-- manage-enrolments and set-user-role. Only the service role (Edge Functions) may call them; each
-- re-checks the acting user (an AAL2-verified administrator is passed as p_as_admin by the Edge
-- Function) and audits with them as the actor.
-- Covers D04 (approval lifecycle, ADR-005 direct publishing), D05 (enrolment, administrator only),
-- D06 (OWNER and CO_LECTURER), D07 (archive keeps everything), D25 (nothing deleted) and the
-- reassignment rule when a lecturer who owns courses is deactivated.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(78);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.t3', tests.create_user('t3@example.test', 'Ruth', 'Tetteh', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;
update public.profiles set can_create_courses = false where id = tests.uid('t2');

-- ---------------------------------------------------------------- who may call
select has_function('public', 'course_create', array['uuid', 'boolean', 'uuid', 'text', 'text', 'text', 'text', 'text'], 'course_create exists');
select has_function('public', 'course_transition', array['uuid', 'boolean', 'uuid', 'text', 'text', 'boolean'], 'course_transition exists');
select has_function('public', 'course_lecturer_change', array['uuid', 'boolean', 'uuid', 'uuid', 'text'], 'course_lecturer_change exists');
select has_function('public', 'enrolment_add', array['uuid', 'uuid', 'uuid[]'], 'enrolment_add exists');
select has_function('public', 'enrolment_set_status', array['uuid', 'uuid[]', 'enrolment_status'], 'enrolment_set_status exists');
select has_function('public', 'admin_set_direct_publish', array['uuid', 'uuid', 'boolean'], 'admin_set_direct_publish exists');
select is(
  (select count(*)::int from unnest(array[
     'public.course_create(uuid, boolean, uuid, text, text, text, text, text)',
     'public.course_transition(uuid, boolean, uuid, text, text, boolean)',
     'public.course_lecturer_change(uuid, boolean, uuid, uuid, text)',
     'public.enrolment_add(uuid, uuid, uuid[])',
     'public.enrolment_set_status(uuid, uuid[], enrolment_status)',
     'public.admin_set_direct_publish(uuid, uuid, boolean)']) f
    where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')),
  0, 'no signed-in client or visitor can call the trusted course functions (only Edge Functions)');
select is(
  (select count(*)::int from unnest(array[
     'public.course_create(uuid, boolean, uuid, text, text, text, text, text)',
     'public.course_transition(uuid, boolean, uuid, text, text, boolean)',
     'public.course_lecturer_change(uuid, boolean, uuid, uuid, text)',
     'public.enrolment_add(uuid, uuid, uuid[])',
     'public.enrolment_set_status(uuid, uuid[], enrolment_status)',
     'public.admin_set_direct_publish(uuid, uuid, boolean)']) f
    where has_function_privilege('service_role', f, 'execute')),
  6, 'the service role can call all six');
select tests.authenticate_as(tests.uid('t1'));
select throws_ok($$ select public.course_create(tests.uid('t1'), false, tests.uid('t1'), 'Mine', 'MIN100') $$, '42501', NULL,
  'a lecturer calling course_create directly through the API is refused');
select tests.reset();

-- ---------------------------------------------------------------- create
select tests.as_service();
select set_config('t.c1', public.course_create(tests.uid('t1'), false, tests.uid('t1'), 'Introduction to Biblical Studies', 'bib101', 'An overview', 'Read well', 'Biblical Studies')::text, true);
select tests.reset();
select is((select status::text from public.courses where id = tests.uid('c1')), 'DRAFT', 'a new course starts as DRAFT');
select is((select course_code from public.courses where id = tests.uid('c1')), 'BIB101', 'the code is stored in capitals');
select is((select created_by from public.courses where id = tests.uid('c1')), tests.uid('t1'), 'created_by is the acting lecturer');
select results_eq($$ select lecturer_id, permission_level::text from public.course_lecturers where course_id = tests.uid('c1') $$,
  $$ values (tests.uid('t1'), 'OWNER') $$, 'the creator becomes the OWNER (D06)');
select is((select actor_id from public.audit_logs where action = 'course.created' and entity_id = tests.uid('c1')::text), tests.uid('t1'),
  'course creation is audited with the lecturer as the actor');

select tests.as_service();
select throws_ok($$ select public.course_create(tests.uid('t2'), false, tests.uid('t2'), 'Not allowed', 'NOP100') $$, '42501', NULL,
  'a lecturer without can_create_courses cannot create a course');
select throws_ok($$ select public.course_create(tests.uid('t1'), false, tests.uid('t3'), 'For someone else', 'ELS100') $$, '42501', NULL,
  'a lecturer can only create a course they own');
select throws_ok($$ select public.course_create(tests.uid('t1'), true, tests.uid('t1'), 'Pretend admin', 'PRE100') $$, '42501', NULL,
  'a lecturer cannot act as an administrator');
select throws_ok($$ select public.course_create(tests.uid('a1'), false, tests.uid('a1'), 'Admin as lecturer', 'ADL100') $$, '42501', NULL,
  'an administrator must use the administrator path (with two-step verification checked by the Edge Function)');
select throws_ok($$ select public.course_create(tests.uid('l1'), false, tests.uid('l1'), 'Learner course', 'LRN100') $$, '42501', NULL,
  'a learner cannot create a course');
select throws_ok($$ select public.course_create(tests.uid('t1'), false, tests.uid('t1'), 'Duplicate', 'BIB101') $$, '23505', NULL,
  'a duplicate course code is rejected');
select set_config('t.c2', public.course_create(tests.uid('a1'), true, tests.uid('t2'), 'Principles of Discipleship', 'DIS201')::text, true);
select throws_ok($$ select public.course_create(tests.uid('a1'), true, tests.uid('l1'), 'Owned by a learner', 'OWN100') $$, '22023', NULL,
  'an administrator must choose an active lecturer as OWNER');
select tests.reset();
select results_eq($$ select lecturer_id, permission_level::text from public.course_lecturers where course_id = tests.uid('c2') $$,
  $$ values (tests.uid('t2'), 'OWNER') $$, 'an administrator can create a course for a lecturer, who becomes OWNER (even without can_create_courses)');
select is((select actor_id from public.audit_logs where action = 'course.created' and entity_id = tests.uid('c2')::text), tests.uid('a1'),
  'an administrator''s course creation is audited with them as the actor');

-- ---------------------------------------------------------------- lecturers (D06)
select tests.as_service();
select lives_ok($$ select public.course_lecturer_change(tests.uid('t1'), false, tests.uid('c1'), tests.uid('t3'), 'add') $$,
  'the OWNER adds a co-lecturer');
select throws_ok($$ select public.course_lecturer_change(tests.uid('t3'), false, tests.uid('c1'), tests.uid('t2'), 'add') $$, '42501', NULL,
  'a CO_LECTURER cannot manage other lecturers (D06)');
select throws_ok($$ select public.course_lecturer_change(tests.uid('t2'), false, tests.uid('c1'), tests.uid('t2'), 'add') $$, '42501', NULL,
  'a lecturer from another course cannot add themself');
select throws_ok($$ select public.course_lecturer_change(tests.uid('t1'), false, tests.uid('c1'), tests.uid('l1'), 'add') $$, '22023', NULL,
  'only lecturers can teach a course');
select throws_ok($$ select public.course_lecturer_change(tests.uid('t1'), false, tests.uid('c1'), tests.uid('t1'), 'remove') $$, '22023', NULL,
  'the OWNER cannot be removed (transfer ownership instead)');
select throws_ok($$ select public.course_lecturer_change(tests.uid('t1'), false, tests.uid('c1'), tests.uid('t2'), 'transfer') $$, '42501', NULL,
  'only an administrator transfers ownership');
select lives_ok($$ select public.course_lecturer_change(tests.uid('t1'), false, tests.uid('c1'), tests.uid('t3'), 'remove') $$,
  'the OWNER removes a co-lecturer');
select tests.reset();
select isnt((select removed_at from public.course_lecturers where course_id = tests.uid('c1') and lecturer_id = tests.uid('t3')), null,
  'removing a co-lecturer keeps the row (removed_at set), so history is kept');
select tests.as_service();
select lives_ok($$ select public.course_lecturer_change(tests.uid('t1'), false, tests.uid('c1'), tests.uid('t3'), 'add') $$,
  'a removed co-lecturer can be added again (Undo)');
select tests.reset();
select is((select count(*)::int from public.course_lecturers where course_id = tests.uid('c1') and removed_at is null), 2,
  'the course now has its OWNER and one co-lecturer');
select is((select count(*)::int from public.audit_logs where action in ('course.lecturer_added', 'course.lecturer_removed') and entity_id = tests.uid('c1')::text), 3,
  'every lecturer change is audited');

-- ---------------------------------------------------------------- lifecycle (D04, ADR-005)
select tests.as_service();
select throws_ok($$ select public.course_transition(tests.uid('t2'), false, tests.uid('c1'), 'submit') $$, '42501', NULL,
  'a lecturer cannot submit another lecturer''s course');
select throws_ok($$ select public.course_transition(tests.uid('t1'), false, tests.uid('c1'), 'approve') $$, '42501', NULL,
  'a lecturer cannot approve');
select is(public.course_transition(tests.uid('t3'), false, tests.uid('c1'), 'submit') ->> 'status', 'PENDING_APPROVAL',
  'a co-lecturer can submit; with approval required the course waits for an administrator');
select throws_ok($$ select public.course_transition(tests.uid('t1'), false, tests.uid('c1'), 'submit') $$, '22023', NULL,
  'a course already waiting cannot be submitted again');
select throws_ok($$ select public.course_transition(tests.uid('a1'), true, tests.uid('c1'), 'return') $$, '22023', NULL,
  'returning a course needs a reason');
select is(public.course_transition(tests.uid('a1'), true, tests.uid('c1'), 'return', 'Add learning objectives') ->> 'status', 'DRAFT',
  'the administrator returns it to DRAFT with a reason');
select tests.reset();
select is((select return_reason from public.courses where id = tests.uid('c1')), 'Add learning objectives', 'the reason is kept on the course');
select tests.as_service();
select is(public.course_transition(tests.uid('t1'), false, tests.uid('c1'), 'submit') ->> 'status', 'PENDING_APPROVAL', 'the lecturer submits again');
select is(public.course_transition(tests.uid('a1'), true, tests.uid('c1'), 'approve', null, true) ->> 'status', 'PUBLISHED',
  'the administrator approves: the course is PUBLISHED');
select tests.reset();
select isnt((select published_at from public.courses where id = tests.uid('c1')), null, 'published_at is set');
select is((select return_reason from public.courses where id = tests.uid('c1')), null, 'the old return reason is cleared on approval');
select is((select can_publish_directly from public.profiles where id = tests.uid('t1')), true,
  'approving with "let them publish directly" grants the lecturer who submitted it direct publishing (ADR-005)');
select is((select count(*)::int from public.audit_logs where action = 'profile.direct_publish_changed' and entity_id = tests.uid('t1')::text), 1,
  'granting direct publishing is audited');

-- Direct publishing: the lecturer's next course goes straight to PUBLISHED
select tests.as_service();
select set_config('t.c3', public.course_create(tests.uid('t1'), false, tests.uid('t1'), 'Prayer and Spiritual Growth', 'PRA110')::text, true);
select is(public.course_transition(tests.uid('t1'), false, tests.uid('c3'), 'submit') ->> 'status', 'PUBLISHED',
  'a lecturer allowed to publish directly publishes without approval');
select lives_ok($$ select public.admin_set_direct_publish(tests.uid('a1'), tests.uid('t1'), false) $$, 'the administrator can take direct publishing away');
select throws_ok($$ select public.admin_set_direct_publish(tests.uid('a1'), tests.uid('l1'), true) $$, '22023', NULL, 'direct publishing is for lecturers only');
select throws_ok($$ select public.admin_set_direct_publish(tests.uid('t1'), tests.uid('t1'), true) $$, '42501', NULL, 'a lecturer cannot grant themself direct publishing');
select tests.reset();
select throws_ok($$ update public.profiles set can_publish_directly = true where id = tests.uid('l1') $$, '23514', NULL,
  'can_publish_directly can only be true for a lecturer');

-- The global setting: with approval switched off, lecturers publish directly (D04)
update public.system_settings set value = 'false' where key = 'require_course_approval';
select tests.as_service();
select set_config('t.c4', public.course_create(tests.uid('t1'), false, tests.uid('t1'), 'Christian Leadership', 'LEA301')::text, true);
select is(public.course_transition(tests.uid('t1'), false, tests.uid('c4'), 'submit') ->> 'status', 'PUBLISHED',
  'with require_course_approval off, a lecturer publishes directly');
select tests.reset();
update public.system_settings set value = 'true' where key = 'require_course_approval';

-- Archive (D06, D07)
select tests.as_service();
select throws_ok($$ select public.course_transition(tests.uid('t3'), false, tests.uid('c1'), 'archive') $$, '42501', NULL,
  'a CO_LECTURER cannot archive (D06)');
select is(public.course_transition(tests.uid('t1'), false, tests.uid('c1'), 'archive') ->> 'status', 'ARCHIVED', 'the OWNER archives the course');
select throws_ok($$ select public.course_lecturer_change(tests.uid('t1'), false, tests.uid('c1'), tests.uid('t2'), 'add') $$, '22023', NULL,
  'an ARCHIVED course cannot gain lecturers');
select is(public.course_transition(tests.uid('a1'), true, tests.uid('c1'), 'unarchive') ->> 'status', 'PUBLISHED',
  'Undo: unarchiving brings a published course back to PUBLISHED');
select tests.reset();
select is((select count(*)::int from public.audit_logs where entity_type = 'course' and entity_id = tests.uid('c1')::text
            and action in ('course.submitted', 'course.returned', 'course.approved', 'course.archived', 'course.unarchived')), 6,
  'every lifecycle step is audited');

-- ---------------------------------------------------------------- enrolments (D05)
select tests.as_service();
select throws_ok($$ select public.enrolment_add(tests.uid('t1'), tests.uid('c1'), array[tests.uid('l1')]) $$, '42501', NULL,
  'a lecturer cannot enrol learners (administrator only)');
select is(jsonb_array_length(public.enrolment_add(tests.uid('a1'), tests.uid('c1'), array[tests.uid('l1'), tests.uid('l2')]) -> 'enrolled'), 2,
  'the administrator enrols two learners');
select is((public.enrolment_add(tests.uid('a1'), tests.uid('c1'), array[tests.uid('l1')]) ->> 'skipped')::int, 1,
  'enrolling someone already enrolled is skipped, not duplicated');
select throws_ok($$ select public.enrolment_add(tests.uid('a1'), tests.uid('c1'), array[tests.uid('t2')]) $$, '22023', NULL,
  'only learners can be enrolled');
select tests.reset();
select is((select count(*)::int from public.course_enrollments where course_id = tests.uid('c1') and enrolment_status = 'ACTIVE'), 2,
  'two ACTIVE enrolments exist');
select is((select enrolled_by from public.course_enrollments where course_id = tests.uid('c1') and learner_id = tests.uid('l1')), tests.uid('a1'),
  'enrolled_by is the administrator');

select set_config('t.e1', (select id::text from public.course_enrollments where course_id = tests.uid('c1') and learner_id = tests.uid('l1')), true);
select tests.as_service();
select is(public.enrolment_set_status(tests.uid('a1'), array[tests.uid('e1')], 'COMPLETED') -> 0 ->> 'previous', 'ACTIVE',
  'the administrator marks an enrolment COMPLETED; the previous status is returned for Undo');
select throws_ok($$ select public.enrolment_set_status(tests.uid('t1'), array[tests.uid('e1')], 'ACTIVE') $$, '42501', NULL,
  'a lecturer cannot change enrolment status');
select lives_ok($$ select public.enrolment_set_status(tests.uid('a1'), array[tests.uid('e1')], 'ACTIVE') $$, 'Undo restores ACTIVE');
select tests.reset();
select is((select count(*)::int from public.audit_logs where action = 'enrolment.added'), 2, 'each new enrolment is audited');
select is((select count(*)::int from public.audit_logs where action = 'enrolment.status_changed' and entity_id = tests.uid('e1')::text), 2,
  'each status change is audited');

-- Archived courses take no new enrolments
select tests.as_service();
select public.course_transition(tests.uid('a1'), true, tests.uid('c3'), 'archive');
select throws_ok($$ select public.enrolment_add(tests.uid('a1'), tests.uid('c3'), array[tests.uid('l1')]) $$, '22023', NULL,
  'an ARCHIVED course takes no new enrolments');

-- ---------------------------------------------------------------- deactivating a lecturer who owns courses
select throws_ok($$ select public.admin_set_user(tests.uid('a1'), tests.uid('t1'), null, 'DEACTIVATED', null) $$, 'P0409', NULL,
  'a lecturer who owns active courses cannot be deactivated until ownership is transferred');
select lives_ok($$ select public.course_lecturer_change(tests.uid('a1'), true, tests.uid('c1'), tests.uid('t3'), 'transfer') $$,
  'the administrator transfers ownership of the first course');
select lives_ok($$ select public.course_lecturer_change(tests.uid('a1'), true, tests.uid('c4'), tests.uid('t2'), 'transfer') $$,
  'and of the second (archived courses keep their owner as history)');
select tests.reset();
select results_eq($$ select lecturer_id, permission_level::text from public.course_lecturers where course_id = tests.uid('c1') and removed_at is null order by 2 desc $$,
  $$ values (tests.uid('t3'), 'OWNER'), (tests.uid('t1'), 'CO_LECTURER') $$, 'after a transfer the old owner stays as a co-lecturer');
select tests.as_service();
select lives_ok($$ select public.admin_set_user(tests.uid('a1'), tests.uid('t1'), null, 'DEACTIVATED', null) $$,
  'with ownership handed over, the lecturer can be deactivated');
select tests.reset();
select is((select count(*)::int from public.course_lecturers where lecturer_id = tests.uid('t1') and removed_at is null and permission_level = 'CO_LECTURER'), 0,
  'the deactivated lecturer''s co-lecturer places are closed (rows kept)');
select is((select count(*)::int from public.course_lecturers where lecturer_id = tests.uid('t1')), 3, 'no teaching row was deleted');
select is((select count(*)::int from public.courses), 4, 'no course was deleted');

select * from finish();
rollback;
