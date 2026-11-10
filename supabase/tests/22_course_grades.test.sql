-- Phase 10: calculate_course_grades, the one place grade formulas live (D30), with exact numbers for
-- every D13 edge case: released work counts whatever its due date (early work too); future work with
-- no released grade, ungraded work and draft grades are excluded; with missing_as_zero on, overdue
-- missing work counts as 0 and a late submission lifts the zero until its grade is released; an
-- extension moves the effective due date; an assignment unpublished after release still counts and one
-- without released grades does not; Final, Provisional and "Not yet available" (D13). Category % =
-- earned / possible of counted items; overall = weighted average over categories with counted items,
-- one decimal rounded half up. Bands and boundaries (D14, D15). assignment_statistics: released results
-- only; chart counts equal the authorised dataset (exit gate); learners see the chart only from
-- min_class_size released results, managers always. Visibility: the course's lecturers and AAL2
-- administrators see every learner (an administrator's view is audited); a learner sees only their own
-- released results.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(40);

-- ---------------------------------------------------------------- people and the course
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
select set_config('t.l8', tests.create_user('l8@example.test', 'Ato', 'Quaye')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('cB'), 'Band boundaries', 'BND100', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by)
select tests.id(c), tests.uid('t1'), 'OWNER', tests.uid('t1') from unnest(array['c1', 'cB']) c;
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select tests.id('c1'), tests.uid(l), 'ACTIVE', tests.uid('a1') from unnest(array['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8']) l;
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select tests.id('cB'), tests.uid(l), 'ACTIVE', tests.uid('a1') from unnest(array['l1', 'l2', 'l3', 'l4', 'l5']) l;
-- Categories: Assignments 70 (the default, renamed weight) and Practical 30 (D13 worked example).
update public.grade_categories set weight = 70 where course_id = tests.id('c1');
insert into public.grade_categories (id, course_id, name, weight, position) values (tests.id('gP'), tests.id('c1'), 'Practical', 30, 2);

-- A1 (20) and A2 (50) Assignments, due yesterday; P1 (40) Practical, due in 7 days; F1 (10) Assignments,
-- due in 7 days; U1 (10) Assignments, due yesterday (unpublished after release); U2 (10) never published.
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at)
select tests.id(x.id), tests.id('c1'), case when x.cat = 'P' then tests.id('gP') else (select g.id from public.grade_categories g where g.course_id = tests.id('c1') and g.name = 'Assignments') end,
       x.title, 'TEXT', '<p>Respond.</p>', now() + x.due, x.max, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now()
  from (values
    ('A1', 'A', 'Reflection on Genesis 1', interval '-1 day', 20),
    ('A2', 'A', 'Covenant essay', interval '-1 day', 50),
    ('P1', 'P', 'Prayer practice', interval '7 days', 40),
    ('F1', 'A', 'Psalm study', interval '7 days', 10),
    ('U1', 'A', 'Withdrawn exercise', interval '-1 day', 10),
    ('U2', 'A', 'Never published', interval '-1 day', 10)
  ) as x(id, cat, title, due, max);
-- Band boundaries: one 1000-mark assignment.
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at)
select tests.id('B1'), tests.id('cB'), g.id, 'Boundaries', 'TEXT', '<p>Respond.</p>', now() - interval '1 day', 1000, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now()
  from public.grade_categories g where g.course_id = tests.id('cB');
-- l4 has an extension on A1 into the future.
insert into public.submission_extensions (assignment_id, learner_id, extended_due_at, granted_by) values (tests.id('A1'), tests.uid('l4'), now() + interval '2 days', tests.uid('t1'));

/** An answer sent (late when the due date has passed). */
create function tests.sent(p_learner text, p_assignment text) returns void language plpgsql as $$
declare v uuid;
begin
  insert into public.submissions (assignment_id, learner_id, status, current_version, is_late)
  select a.id, tests.uid(p_learner), 'SUBMITTED', 1, now() > a.due_at from public.assignments a where a.id = tests.id(p_assignment) returning id into v;
  insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id) values (v, 1, 'My answer.', false, gen_random_uuid());
end $$;
/** Sent, graded and (unless p_release is false) released, as the trusted functions do. */
create function tests.graded(p_learner text, p_assignment text, p_score numeric, p_release boolean default true) returns void language plpgsql as $$
begin
  perform tests.sent(p_learner, p_assignment);
  perform public.grade_save(tests.uid('t1'), false, tests.id(p_assignment), tests.uid(p_learner), p_score, null, null);
  if p_release then perform public.grade_release(tests.uid('t1'), false, tests.id(p_assignment), tests.uid(p_learner)); end if;
end $$;
select tests.as_service();
-- l1: the D13 worked example (A1 18/20, A2 40/50, P1 26/40 sent early and released); F1 future, nothing.
select tests.graded('l1', 'A1', 18); select tests.graded('l1', 'A2', 40); select tests.graded('l1', 'P1', 26);
-- l2: A1 sent, not graded; A2 a draft grade (never released): nothing counts.
select tests.sent('l2', 'A1'); select tests.graded('l2', 'A2', 45, false);
-- l3: A1 missing (past due); A2 released 25/50.
select tests.graded('l3', 'A2', 25);
-- l4: A1 missing but extended into the future; A2 released 30/50.
select tests.graded('l4', 'A2', 30);
-- l5: everything published is released or past due with nothing sent (P1 and F1 released early): Final.
select tests.graded('l5', 'A1', 10); select tests.graded('l5', 'P1', 20); select tests.graded('l5', 'F1', 5);
-- l6, l7, l8: A1 released (A1 reaches 5 released results; A2 has 3); U1 released for l6 then unpublished.
select tests.graded('l6', 'A1', 20); select tests.graded('l7', 'A1', 9); select tests.graded('l8', 'A1', 12);
select tests.graded('l6', 'U1', 7);
select tests.reset();
update public.assignments set publication_status = 'DRAFT', published_at = null where id = tests.id('U1');
update public.assignments set publication_status = 'DRAFT', published_at = null where id = tests.id('U2');
-- Band course: 499, 500, 899, 1000 and 730 of 1000.
select tests.as_service();
select tests.graded('l1', 'B1', 499); select tests.graded('l2', 'B1', 500); select tests.graded('l3', 'B1', 899);
select tests.graded('l4', 'B1', 1000); select tests.graded('l5', 'B1', 730);
select tests.reset();

create function tests.cell(p_learner text, p_assignment text, p_course text default 'c1') returns jsonb language sql as $$
  select c from public.calculate_course_grades(tests.id(p_course)) g, jsonb_array_elements(g.cells) c
   where g.learner_id = tests.uid(p_learner) and c ->> 'assignment_id' = tests.id(p_assignment)::text
$$;
create function tests.overall(p_learner text, p_course text default 'c1') returns numeric language sql as $$
  select overall_percentage from public.calculate_course_grades(tests.id(p_course)) where learner_id = tests.uid(p_learner)
$$;
create function tests.status(p_learner text) returns text language sql as $$
  select status from public.calculate_course_grades(tests.id('c1')) where learner_id = tests.uid(p_learner)
$$;
grant execute on function tests.cell(text, text, text), tests.overall(text, text), tests.status(text) to authenticated;

-- ---------------------------------------------------------------- D13 (missing_as_zero off, the default)
select tests.authenticate_as(tests.uid('t1'));
select is(tests.overall('l1'), 77.5::numeric, 'the D13 worked example: (82.9 x 70 + 65.0 x 30) / 100 = 77.5');
select is((select letter_grade from public.calculate_course_grades(tests.id('c1')) where learner_id = tests.uid('l1')), 'B', 'which is a B');
select is((select c ->> 'percentage' from public.calculate_course_grades(tests.id('c1')) g, jsonb_array_elements(g.categories) c
            where g.learner_id = tests.uid('l1') and c ->> 'name' = 'Assignments'), '82.9', 'Assignments: 58 of 70 = 82.9% (one decimal, half up)');
select is((tests.cell('l1', 'P1') ->> 'counted')::boolean, true, 'early work counts once released, whatever its due date');
select is(tests.cell('l1', 'F1') ->> 'state', 'NOT_DUE', 'a future assignment with no released grade is not due');
select is((tests.cell('l1', 'F1') ->> 'counted')::boolean, false, 'and excluded');
select is(tests.status('l1'), 'PROVISIONAL', 'with a published assignment still to come the grade is Provisional');
select is(tests.cell('l2', 'A1') ->> 'state', 'UNGRADED', 'sent and not graded: ungraded');
select is(tests.cell('l2', 'A2') ->> 'state', 'DRAFT', 'a draft grade is a draft');
select is(tests.overall('l2'), null, 'nothing counted: no overall');
select is(tests.status('l2'), 'NOT_AVAILABLE', 'shown as Not yet available, never 0%');
select is(tests.cell('l3', 'A1') ->> 'state', 'MISSING', 'overdue and nothing sent: Missing');
select is(tests.overall('l3'), 50.0::numeric, 'missing work is excluded while missing_as_zero is off (25 of 50)');
select is(tests.cell('l4', 'A1') ->> 'state', 'NOT_DUE', 'an extension moves the effective due date: not yet due');
select is(tests.cell('l6', 'U1') ->> 'counted', 'true', 'an assignment unpublished after its grade was released still counts');
select is(tests.overall('l6'), 90.0::numeric, 'l6: A1 20/20 and U1 7/10 = 27 of 30 = 90.0');
select is((select count(*)::int from public.calculate_course_grades(tests.id('c1')) g, jsonb_array_elements(g.cells) c where c ->> 'assignment_id' = tests.id('U2')::text), 0,
  'one never published and without released grades does not appear');
select is(tests.status('l5'), 'FINAL', 'every published assignment released or past due with nothing sent: Final');
select is(tests.overall('l5'), 50.0::numeric, 'l5: A1 10/20 and F1 5/10 = 50.0% (x 70), P1 20/40 = 50.0% (x 30); A2 missing, excluded');

-- ---------------------------------------------------------------- statistics and charts (exit gate)
select is((select array[released, ungraded, missing] from public.assignment_statistics(tests.id('c1')) where assignment_id = tests.id('A1')), array[5, 1, 1],
  'A1: 5 released, 1 ungraded (Abena), 1 missing (Yaw; Esi is extended, so not yet due)');
select is((select array[average, highest, lowest] from public.assignment_statistics(tests.id('c1')) where assignment_id = tests.id('A1')), array[69.0, 100.0, 45.0]::numeric[],
  'average, highest and lowest of the released percentages (90, 50, 100, 45, 60 = 69.0)');
select is((select sum((d ->> 'count')::int)::int from public.assignment_statistics(tests.id('c1')) s, jsonb_array_elements(s.distribution) d where s.assignment_id = tests.id('A1')),
  (select released from public.assignment_statistics(tests.id('c1')) where assignment_id = tests.id('A1')), 'exit gate: the chart counts add up to the released results');
select is((select jsonb_agg(d ->> 'count' order by ord) from public.assignment_statistics(tests.id('c1')) s, jsonb_array_elements(s.distribution) with ordinality x(d, ord) where s.assignment_id = tests.id('A1')),
  '["1", "1", "1", "0", "0", "2"]'::jsonb, 'exit gate: each band counts exactly its released percentages (45; 50; 60; none; none; 90 and 100)');
select ok((select bool_and(chart_visible) from public.assignment_statistics(tests.id('c1'))), 'the course''s lecturer always sees the charts');

-- ---------------------------------------------------------------- D11 and D13 with missing_as_zero on
select tests.reset();
update public.system_settings set value = 'true'::jsonb where key = 'missing_as_zero';
select tests.authenticate_as(tests.uid('t1'));
select is(tests.cell('l3', 'A1') ->> 'state', 'COUNTED_ZERO', 'with missing_as_zero on, overdue missing work is counted as 0');
select is(tests.overall('l3'), 35.7::numeric, 'l3: 25 of (20 + 50) = 35.7');
select is(tests.cell('l4', 'A1') ->> 'state', 'NOT_DUE', 'not before the extended due date');
select tests.as_service();
select tests.sent('l3', 'A1');
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select is(tests.cell('l3', 'A1') ->> 'state', 'UNGRADED', 'a late submission lifts the zero');
select is(tests.overall('l3'), 50.0::numeric, 'and is excluded until its grade is released');
select tests.reset();
update public.system_settings set value = 'false'::jsonb where key = 'missing_as_zero';

-- ---------------------------------------------------------------- bands and boundaries (D14, D15)
select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select c ->> 'percentage', c ->> 'letter_grade', c ->> 'band' from public.calculate_course_grades(tests.id('cB')) g, jsonb_array_elements(g.cells) c order by (c ->> 'score')::numeric $$,
  $$ values ('49.90', 'F', '0-49%'), ('50.00', 'D', '50-59%'), ('73.00', 'B', '70-79%'), ('89.90', 'A', '80-89%'), ('100.00', 'A', '90-100%') $$,
  'boundaries: 49.9 is F (0-49%), 50 is D (50-59%), 73 sits in 70-79%, 89.9 in 80-89%, 100 in 90-100%');

-- ---------------------------------------------------------------- learners: own released results only
select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.calculate_course_grades(tests.id('c1'))), 1, 'a learner gets only their own row');
select is(tests.overall('l1'), 77.5::numeric, 'with their overall grade');
select tests.reset(); select tests.authenticate_as(tests.uid('l2'));
select is(tests.cell('l2', 'A2') ->> 'state', 'UNGRADED', 'a draft grade reaches its learner only as awaiting');
select is(tests.cell('l2', 'A2') ->> 'score', null, 'with no score');
select is((select chart_visible from public.assignment_statistics(tests.id('c1')) where assignment_id = tests.id('A1')), true, 'a learner sees a chart from 5 released results (min_class_size)');
select is((select chart_visible from public.assignment_statistics(tests.id('c1')) where assignment_id = tests.id('A2')), false, 'but not below');
select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select is((select my_band from public.assignment_statistics(tests.id('c1')) where assignment_id = tests.id('A1')), '90-100%', 'and their own band to highlight');

-- ---------------------------------------------------------------- who else
select tests.reset(); select tests.authenticate_as(tests.uid('t2'));
select is((select count(*)::int from public.calculate_course_grades(tests.id('c1'))), 0, 'another course''s lecturer sees nothing');
select tests.reset(); select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is((select count(*)::int from public.calculate_course_grades(tests.id('c1'))), 8, 'an AAL2 administrator sees every learner');
select tests.reset();
select is((select count(*)::int from public.audit_logs where action = 'gradebook.viewed' and entity_id = tests.id('c1')::text), 1, 'and the administrator''s view is audited');

select * from finish();
rollback;
