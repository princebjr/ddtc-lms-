-- Phase 10: the gradebook's trusted functions and reads.
-- Weights lock (D12, D13; owner decision 4 of 2026-11-10; since Phase 10.1, ADR-016, only an AAL2
-- administrator changes the three parts' weights, always with a reason): after the first release the
-- change is recorded as changed_after_release, any other write is refused by the table itself, and
-- weights_impact_preview shows each learner's overall before and after.
-- Course-wide review and release (owner request and decision 1 of 2026-11-10): course_release_preview
-- lists every draft grade in the course (a changed released grade marked), and grade_release_course
-- releases them all at once (refused unless weights total 100), one notification per learner and grade.
-- assignment_report_summary: the totals for the assignment performance report (owner request 2026-11-06).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(23);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Yaw', 'Darko')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Principles of Discipleship', 'DIS201', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by)
select tests.id(c), tests.uid('t1'), 'OWNER', tests.uid('t1') from unnest(array['c1', 'c2']) c;
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select tests.id(c), tests.uid(l), 'ACTIVE', tests.uid('a1') from unnest(array['c1', 'c2']) c, unnest(array['l1', 'l2', 'l3']) l;
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at)
select tests.id(x.id), tests.id(x.course), g.id, x.title, 'TEXT', '<p>Respond.</p>', now() + interval '7 days', 20, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now()
  from (values ('A1', 'c1', 'Reflection on Genesis 1'), ('A2', 'c1', 'Covenant essay'), ('B1', 'c2', 'Prayer journal')) as x(id, course, title)
  join public.grade_categories g on g.course_id = tests.id(x.course) and g.part = 'ASSIGNMENTS' and g.archived_at is null;

create function tests.sent(p_learner text, p_assignment text) returns void language plpgsql as $$
declare v uuid;
begin
  insert into public.submissions (assignment_id, learner_id, status, current_version) values (tests.id(p_assignment), tests.uid(p_learner), 'SUBMITTED', 1) returning id into v;
  insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id) values (v, 1, 'My answer.', false, gen_random_uuid());
end $$;
create function tests.cats(p_course text) returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'weight', g.weight) order by g.position) from public.grade_categories g where g.course_id = tests.id(p_course) and g.archived_at is null
$$;
grant execute on function tests.cats(text) to service_role;
select tests.sent(l, a) from (values ('l1', 'A1'), ('l2', 'A1'), ('l3', 'A1'), ('l1', 'A2'), ('l2', 'A2'), ('l1', 'B1')) as x(l, a);

-- ---------------------------------------------------------------- weights before and after the first release
-- Since Phase 10.1 (ADR-016) the three parts' weights change only by an AAL2 administrator, always with a
-- reason; after the first release that change is recorded as grade_categories.changed_after_release.
create function tests.cat(p_course text, p_part public.grade_part) returns uuid language sql stable as $f$
  select g.id from public.grade_categories g where g.course_id = tests.id(p_course) and g.part = p_part and g.archived_at is null
$f$;
create function tests.split(p_course text, w1 int, w2 int, w3 int) returns jsonb language sql stable as $f$
  select jsonb_build_array(jsonb_build_object('id', tests.cat(p_course, 'ASSIGNMENTS'), 'weight', w1),
                           jsonb_build_object('id', tests.cat(p_course, 'PRACTICALS'), 'weight', w2),
                           jsonb_build_object('id', tests.cat(p_course, 'EXAMINATIONS'), 'weight', w3))
$f$;
grant execute on function tests.cat(text, public.grade_part), tests.split(text, int, int, int) to authenticated, service_role;
select tests.as_service();
select lives_ok($$ select public.grade_categories_save(tests.uid('a1'), true, tests.id('c1'), tests.split('c1', 60, 30, 10), 'Setting up the course') $$,
  'before the first release an administrator changes the weights, with a reason');
select is((select course_weights_locked from public.course_weights_locked(tests.id('c1'))), false, 'and they are not locked yet');
select public.grade_save(tests.uid('t1'), false, tests.id('A1'), tests.uid('l1'), 16, null, null);
select public.grade_release(tests.uid('t1'), false, tests.id('A1'), tests.uid('l1'));
select is((select course_weights_locked from public.course_weights_locked(tests.id('c1'))), true, 'after the first release they are locked');
select throws_ok($$ select public.grade_categories_save(tests.uid('t1'), false, tests.id('c1'), tests.split('c1', 60, 30, 10), 'Mine') $$, '42501',
  'Only an administrator can change the grade weights', 'a lecturer cannot change them');
select throws_ok($$ select public.grade_categories_save(tests.uid('a1'), true, tests.id('c1'), tests.split('c1', 60, 30, 10)) $$, '22023',
  'Give a reason for changing the grade weights', 'an administrator needs a reason');
select tests.reset();
select throws_ok($$ update public.grade_categories set weight = 50 where id = tests.cat('c1', 'ASSIGNMENTS') $$, '42501',
  'Category weights are locked after the first grade release', 'any other write is refused by the table itself');
select lives_ok($$ update public.grade_categories set name = 'Essays' where id = tests.cat('c1', 'ASSIGNMENTS') $$, 'renaming a category is not a weight change');
update public.grade_categories set name = 'Weekly assignments' where id = tests.cat('c1', 'ASSIGNMENTS');
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.weights_impact_preview(tests.id('c1'), tests.split('c1', 50, 50, 0))), 3,
  'the impact preview lists every learner');
select is((select array[current_overall, new_overall] from public.weights_impact_preview(tests.id('c1'), tests.split('c1', 50, 50, 0))
  where learner_id = tests.uid('l1')), array[80.0, 80.0]::numeric[], 'with the overall before and after (practicals have nothing counted, so 80.0 either way)');
select tests.reset(); select tests.as_service();
select lives_ok($$ select public.grade_categories_save(tests.uid('a1'), true, tests.id('c1'), tests.split('c1', 70, 20, 10), 'The practical was shortened') $$,
  'an administrator changes locked weights with a reason');
select is((select weight from public.grade_categories where id = tests.cat('c1', 'ASSIGNMENTS')), 70, 'the new weights are saved');
select is((select count(*)::int from public.audit_logs where action = 'grade_categories.changed_after_release' and entity_id = tests.id('c1')::text), 1, 'and the change is audited');
select is((select metadata ->> 'reason' from public.audit_logs where action = 'grade_categories.changed_after_release' and entity_id = tests.id('c1')::text), 'The practical was shortened', 'with its reason');

-- ---------------------------------------------------------------- course-wide review and release (owner request)
select public.grade_save(tests.uid('t1'), false, tests.id('A1'), tests.uid('l2'), 12, null, null);
select public.grade_save(tests.uid('t1'), false, tests.id('A2'), tests.uid('l1'), 18, null, null);
select public.grade_save(tests.uid('t1'), false, tests.id('A2'), tests.uid('l2'), 14, null, null);
select public.grade_save(tests.uid('t1'), false, tests.id('A1'), tests.uid('l1'), 17, null, 'Second part marked again');
select public.grade_save(tests.uid('t1'), false, tests.id('B1'), tests.uid('l1'), 19, null, null);
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select set_eq($$ select assignment_title, first_name, score::numeric, changed from public.course_release_preview(tests.id('c1')) $$,
  $$ values ('Reflection on Genesis 1', 'Abena', 12.00, false), ('Reflection on Genesis 1', 'Kwame', 17.00, true),
            ('Covenant essay', 'Kwame', 18.00, false), ('Covenant essay', 'Abena', 14.00, false) $$,
  'the review lists every draft grade in the course, a changed released grade marked; never another course''s; ungraded answers are not listed');
select is((select released_score from public.course_release_preview(tests.id('c1')) where changed), 16.00, 'with what the learner sees now');
select tests.reset(); select tests.authenticate_as(tests.uid('t2'));
select is((select count(*)::int from public.course_release_preview(tests.id('c1'))), 0, 'another lecturer sees no review');
select tests.reset(); select tests.as_service();
select throws_ok($$ select public.grade_release_course(tests.uid('t2'), false, tests.id('c1')) $$, '42501', 'You do not teach this course', 'only the course''s lecturers release');
select is(public.grade_release_course(tests.uid('t1'), false, tests.id('c1')), 4, 'Release all releases every draft grade of the course at once');
select is((select count(*)::int from public.submissions s join public.assignments a on a.id = s.assignment_id
            where a.course_id = tests.id('c1') and s.status = 'GRADED' and s.grade_release_status = 'DRAFT'), 0, 'leaving no draft behind');
select is((select grade_release_status::text from public.submissions where assignment_id = tests.id('B1') and learner_id = tests.uid('l1')), 'DRAFT', 'and never touching another course');
select is((select count(*)::int from public.notifications where recipient_id in (tests.uid('l1'), tests.uid('l2'))), 5,
  'one notification per learner and grade (Kwame: A1 first release and update, A2; Abena: A1, A2)');
select throws_ok($$ select public.grade_release_course(tests.uid('t1'), false, tests.id('c1')) $$, '22023', 'There are no grades to release', 'with nothing left it says so');

-- ---------------------------------------------------------------- assignment report summary (owner request 2026-11-06)
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select is((select array[enrolled, submitted, not_submitted, graded]::numeric[] || array[average, highest, lowest] from public.assignment_report_summary(tests.id('A1'))),
  array[3, 3, 0, 2, 72.5, 85.0, 60.0]::numeric[], 'A1: 3 enrolled, 3 submitted, 2 graded; average, highest and lowest percentage of the graded (85 and 60)');

select * from finish();
rollback;
