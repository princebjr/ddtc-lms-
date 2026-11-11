-- Phase 11 (ADR-019): the administrator screens.
-- - Settings: only an AAL2 administrator changes one; each change takes effect and is audited; values
--   outside their rules are refused by the table (pass mark, minimum class size, grade scale, bands,
--   file limits, idle limits).
-- - The audit log viewer is for AAL2 administrators only; its CSV export is itself audited.
-- - Reports by course and branch (D42) are for AAL2 administrators only and count the right learners.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(28);

select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Esi', 'Owusu')::text, true);
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

-- Two branches; Kwame and Esi in Kumasi, Abena in Kasoa.
insert into public.branches (id, name, position) values (tests.id('b1'), 'Kumasi Test', 901), (tests.id('b2'), 'Kasoa Test', 902);
update public.profiles set branch_id = tests.id('b1') where id in (tests.uid('l1'), tests.uid('l3'));
update public.profiles set branch_id = tests.id('b2') where id = tests.uid('l2');
insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values
  (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1')), (tests.id('c1'), tests.uid('l2'), 'ACTIVE', tests.uid('a1')),
  (tests.id('c1'), tests.uid('l3'), 'WITHDRAWN', tests.uid('a1'));
insert into public.lessons (id, course_id, title, position, publication_status, created_by) values
  (tests.id('s1'), tests.id('c1'), 'Lesson 1', 1, 'PUBLISHED', tests.uid('t1')), (tests.id('s2'), tests.id('c1'), 'Lesson 2', 2, 'PUBLISHED', tests.uid('t1'));
insert into public.lesson_progress (learner_id, lesson_id, completion_status, completed_at) values
  (tests.uid('l1'), tests.id('s1'), 'COMPLETED', now()), (tests.uid('l1'), tests.id('s2'), 'COMPLETED', now()),
  (tests.uid('l2'), tests.id('s1'), 'COMPLETED', now());

-- ---------------------------------------------------------------- settings
select tests.authenticate_as(tests.uid('t1'));
update public.system_settings set value = '30' where key = 'idle_timeout_minutes';
select tests.reset();
select is((select value from public.system_settings where key = 'idle_timeout_minutes'), '10'::jsonb, 'a lecturer cannot change a setting');
select tests.authenticate_as(tests.uid('a1'));
update public.system_settings set value = '30' where key = 'idle_timeout_minutes';
select tests.reset();
select is((select value from public.system_settings where key = 'idle_timeout_minutes'), '10'::jsonb, 'nor can an administrator without two-step verification');

select tests.authenticate_as(tests.uid('a1'), 'aal2');
select lives_ok($$ update public.system_settings set value = '30' where key = 'idle_timeout_minutes' $$, 'an AAL2 administrator changes the idle limit');
select is((public.idle_settings() ->> 'timeout_minutes')::int, 30, 'and it takes effect');
select lives_ok($$ update public.system_settings set value = 'true' where key = 'missing_as_zero' $$, 'and turns on counting missing work as 0');
select tests.reset();
select is((select count(*)::int from public.audit_logs where action = 'setting.updated' and entity_id in ('idle_timeout_minutes', 'missing_as_zero')
            and actor_id = tests.uid('a1')), 2, 'each change is audited with who made it');
select ok((select metadata from public.audit_logs where action = 'setting.updated' and entity_id = 'idle_timeout_minutes')
  @> '{"old_value": 10, "new_value": 30}'::jsonb, 'with the old and new values');

select tests.authenticate_as(tests.uid('a1'), 'aal2');
select throws_ok($$ update public.system_settings set value = '150' where key = 'pass_mark' $$, '23514', null, 'a pass mark above 100 is refused');
select throws_ok($$ update public.system_settings set value = '0' where key = 'min_class_size' $$, '23514', null, 'a minimum class size of 0 is refused');
select throws_ok($$ update public.system_settings set value = '90' where key = 'idle_timeout_minutes' $$, '23514', null, 'an idle limit above 60 minutes is refused');
select throws_ok($$ update public.system_settings set value = '[{"grade":"A","min":70,"max":100},{"grade":"F","min":0,"max":60}]' where key = 'grade_scale' $$,
  '23514', null, 'a grade scale with a gap is refused');
select lives_ok($$ update public.system_settings set value = '[{"grade":"A","min":70,"max":100},{"grade":"B","min":50,"max":69},{"grade":"F","min":0,"max":49}]' where key = 'grade_scale' $$,
  'a complete grade scale is accepted');
select throws_ok($$ update public.system_settings set value = '[[0,50],[60,100]]' where key = 'distribution_bands' $$, '23514', null, 'bands with a gap are refused');
select throws_ok($$ update public.system_settings set value = jsonb_set(value, '{submission_document,max_bytes}', '0') where key = 'file_limits' $$,
  '23514', null, 'a file limit of 0 bytes is refused');
select lives_ok($$ update public.system_settings set value = jsonb_set(value, '{submission_document,max_bytes}', '20971520') where key = 'file_limits' $$,
  'a file limit of 20 MB is accepted');
select throws_ok($$ update public.system_settings set value = '"fifty"' where key = 'pass_mark' $$, '22023', null, 'a value of another type is refused');
select tests.reset();

-- ---------------------------------------------------------------- the audit log viewer
select tests.authenticate_as(tests.uid('t1'));
select throws_ok($$ select * from public.audit_log_search() $$, '42501', null, 'a lecturer cannot read the audit log');
select is((select count(*)::int from public.audit_logs), 0, 'not even directly');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'));
select throws_ok($$ select * from public.audit_log_search() $$, '42501', null, 'nor an administrator without two-step verification');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
select ok((select count(*) from public.audit_log_search(p_action => 'setting.updated')) >= 2, 'an AAL2 administrator filters by action');
select is((select actor_name from public.audit_log_search(p_action => 'setting.updated', p_entity_id => 'idle_timeout_minutes')), 'Prince Boateng', 'with who did it');
select is((select count(*)::int from public.audit_log_export(p_action => 'setting.updated', p_entity_id => 'missing_as_zero')), 1, 'and exports the filtered rows');
select tests.reset();
select is((select (metadata ->> 'rows')::int from public.audit_logs where action = 'audit_log.exported' and actor_id = tests.uid('a1')), 1,
  'the export is itself audited, with how many rows');

-- ---------------------------------------------------------------- reports
select tests.authenticate_as(tests.uid('t1'));
select throws_ok($$ select * from public.report_grades() $$, '42501', null, 'a lecturer cannot read the reports');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
select results_eq($$ select branch_name, active, withdrawn from public.report_enrolment(tests.id('c1')) order by branch_name $$,
  $$ values ('Kasoa Test'::text, 1, 0), ('Kumasi Test'::text, 1, 1) $$, 'enrolment by branch counts each status');
select results_eq($$ select branch_name, learners, round(average_progress)::int, completed_all from public.report_completion(tests.id('c1')) order by branch_name $$,
  $$ values ('Kasoa Test'::text, 1, 50, 0), ('Kumasi Test'::text, 1, 100, 1) $$, 'completion leaves the withdrawn learner out');
select results_eq($$ select branch_name, lessons_completed from public.report_activity(tests.id('c1')) order by branch_name $$,
  $$ values ('Kasoa Test'::text, 1), ('Kumasi Test'::text, 2) $$, 'activity counts lessons completed');
select results_eq($$ select learners, graded from public.report_grades(tests.id('c1'), tests.id('b1')) $$,
  $$ values (1, 0) $$, 'grade summaries filter by branch and count only released grades');
select tests.reset();

select * from finish();
rollback;
