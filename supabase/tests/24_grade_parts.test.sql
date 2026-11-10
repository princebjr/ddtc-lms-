-- Phase 10.1, step A (ADR-016; owner decisions of 2026-11-10): the course grade has three fixed parts,
-- Weekly assignments 40, Local Assembly practicals 30 and Final examinations 30.
-- - Every new course starts with them.
-- - Only an AAL2 administrator changes a split, always with a reason, audited.
-- - An existing course is switched with apply_standard_parts: assignments in a category whose name
--   says "practical" go to the practicals part, every other assignment to weekly assignments. A
--   course with released grades is switched only by an AAL2 administrator, with a reason, after a
--   preview of each learner's overall grade.
-- - An assignment in the practicals part is marked in person: learners cannot send an answer; the
--   course's lecturers type the marks for many learners at once (practical_marks_save, through the same
--   grading records, history and release as any grade). An unmarked practical is Not marked (UNGRADED),
--   never Missing, and is not counted.
-- - The course grade: the D13 formula unchanged over the three parts (a part with nothing counted is
--   left out).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(37);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.l3', tests.create_user('l3@example.test', 'Yaw', 'Darko')::text, true);
select set_config('t.l9', tests.create_user('l9@example.test', 'Esi', 'Owusu')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;
create function tests.part(p_course text, p_part public.grade_part) returns uuid language sql stable as $$
  select g.id from public.grade_categories g where g.course_id = tests.id(p_course) and g.part = p_part and g.archived_at is null
$$;
create function tests.parts(p_course text) returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'weight', g.weight) order by g.position)
    from public.grade_categories g where g.course_id = tests.id(p_course) and g.archived_at is null
$$;
grant execute on function tests.part(text, public.grade_part), tests.parts(text) to authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select tests.id('c1'), tests.uid(l), 'ACTIVE', tests.uid('a1') from unnest(array['l1', 'l2', 'l3']) l;

-- ---------------------------------------------------------------- the three parts of a new course
select results_eq(
  $$ select name, weight, part::text from public.grade_categories where course_id = tests.id('c1') and archived_at is null order by position $$,
  $$ values ('Weekly assignments', 40, 'ASSIGNMENTS'), ('Local Assembly practicals', 30, 'PRACTICALS'), ('Final examinations', 30, 'EXAMINATIONS') $$,
  'a new course starts with Weekly assignments 40, Local Assembly practicals 30 and Final examinations 30');
select is(public.course_uses_standard_parts(tests.id('c1')), true, 'and it uses the standard parts');

-- ---------------------------------------------------------------- only an administrator changes a split, with a reason
select tests.as_service();
select throws_ok($$ select public.grade_categories_save(tests.uid('t1'), false, tests.id('c1'), tests.parts('c1')) $$, '42501',
  'Only an administrator can change the grade weights', 'a lecturer cannot change the weights, even before any release');
select throws_ok($$ select public.grade_categories_save(tests.uid('a1'), true, tests.id('c1'), tests.parts('c1')) $$, '22023',
  'Give a reason for changing the grade weights', 'an administrator gives a reason');
select throws_ok($$ select public.grade_categories_save(tests.uid('a1'), true, tests.id('c1'),
    jsonb_build_array(tests.parts('c1') -> 0, tests.parts('c1') -> 1), 'Two parts only') $$, '22023',
  'A course has exactly three parts: weekly assignments, practicals and examinations', 'the three parts stay');
select throws_ok($$ select public.grade_categories_save(tests.uid('a1'), true, tests.id('c1'),
    jsonb_build_array(jsonb_set(tests.parts('c1') -> 0, '{weight}', '50'), tests.parts('c1') -> 1, tests.parts('c1') -> 2), 'Too much') $$, '22023',
  'The weights must total 100', 'and they total 100');
select lives_ok($$ select public.grade_categories_save(tests.uid('a1'), true, tests.id('c1'),
    jsonb_build_array(jsonb_set(tests.parts('c1') -> 0, '{weight}', '50'), jsonb_set(tests.parts('c1') -> 1, '{weight}', '20'), tests.parts('c1') -> 2),
    'Board decision for this course') $$, 'an administrator changes the split with a reason');
select results_eq($$ select weight from public.grade_categories where course_id = tests.id('c1') and archived_at is null order by position $$,
  $$ values (50), (20), (30) $$, 'the new weights are saved; names and parts stay');
select is((select a.metadata ->> 'reason' from public.audit_logs a where a.action = 'grade_categories.weights_changed' and a.entity_id = tests.id('c1')::text),
  'Board decision for this course', 'and the change is audited with its reason');
-- back to the standard split for the rest of the test
select public.grade_categories_save(tests.uid('a1'), true, tests.id('c1'),
  jsonb_build_array(jsonb_set(tests.parts('c1') -> 0, '{weight}', '40'), jsonb_set(tests.parts('c1') -> 1, '{weight}', '30'), tests.parts('c1') -> 2), 'Back to the standard split');
select tests.reset();

-- ---------------------------------------------------------------- assignments, practicals and examinations
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at) values
  (tests.id('W1'), tests.id('c1'), tests.part('c1', 'ASSIGNMENTS'), 'Reflection on Genesis 1', 'TEXT', '<p>Respond.</p>', now() + interval '7 days', 20, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now()),
  (tests.id('P1'), tests.id('c1'), tests.part('c1', 'PRACTICALS'), 'Leading prayer meeting', 'TEXT', '<p>Lead the meeting.</p>', now() - interval '1 day', 30, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now());
select throws_ok($$ insert into public.assignments (course_id, category_id, title, content_type, text_instructions, due_at, max_marks, created_by)
    values (tests.id('c1'), tests.part('c1', 'EXAMINATIONS'), 'Not an exam', 'TEXT', '<p>x</p>', now(), 10, tests.uid('t1')) $$, '22023',
  'Examinations are set in the Examinations tab, not as assignments', 'an assignment cannot sit in the examinations part');

-- A learner cannot send an answer to a practical: it is marked in person.
select tests.as_service();
select throws_ok($$ select public.submission_submit(tests.uid('l1'), tests.id('P1'), 'My answer.', array[]::uuid[], gen_random_uuid()) $$, '22023',
  'This practical is marked in person by your lecturer', 'a learner cannot answer a practical');

-- The mark sheet: the course's lecturers type many learners' marks at once.
select throws_ok($$ select public.practical_marks_save(tests.uid('t2'), false, tests.id('P1'),
    jsonb_build_array(jsonb_build_object('learner_id', tests.uid('l1'), 'score', 25))) $$, '42501', 'You do not teach this course',
  'a lecturer of another course cannot enter practical marks');
select throws_ok($$ select public.practical_marks_save(tests.uid('t1'), false, tests.id('W1'),
    jsonb_build_array(jsonb_build_object('learner_id', tests.uid('l1'), 'score', 15))) $$, '22023', 'Only practicals are marked on the mark sheet',
  'the mark sheet is for practicals only');
select throws_ok($$ select public.practical_marks_save(tests.uid('t1'), false, tests.id('P1'),
    jsonb_build_array(jsonb_build_object('learner_id', tests.uid('l1'), 'score', 31))) $$, '22023', 'The score must be between 0 and 30',
  'a mark above the maximum is refused');
select throws_ok($$ select public.practical_marks_save(tests.uid('t1'), false, tests.id('P1'),
    jsonb_build_array(jsonb_build_object('learner_id', tests.uid('l9'), 'score', 20))) $$, '22023', 'Esi Owusu is not a learner of this course',
  'a learner who is not in the course cannot be marked');
select is((select public.practical_marks_save(tests.uid('t1'), false, tests.id('P1'),
    jsonb_build_array(jsonb_build_object('learner_id', tests.uid('l1'), 'score', 25, 'feedback', 'Led with confidence.'),
                      jsonb_build_object('learner_id', tests.uid('l2'), 'score', 18),
                      jsonb_build_object('learner_id', tests.uid('l3'), 'score', null)))), 2,
  'the lecturer saves two marks in one go (an empty mark is skipped)');
select tests.reset();
select results_eq($$ select s.status::text, s.score, s.marked_in_person, s.grade_release_status::text, s.current_version
                       from public.submissions s where s.assignment_id = tests.id('P1') order by s.score desc $$,
  $$ values ('GRADED', 25.00::numeric, true, 'DRAFT', 0), ('GRADED', 18.00::numeric, true, 'DRAFT', 0) $$,
  'each mark is a draft grade marked in person, with no answer sent');
select is((select count(*)::int from public.grade_change_history h join public.submissions s on s.id = h.submission_id
            where s.assignment_id = tests.id('P1') and h.event = 'SAVED'), 2, 'each mark is in the grade history');
select is((select count(*)::int from public.audit_logs where action = 'grade.saved' and metadata ->> 'assignment_id' = tests.id('P1')::text), 2,
  'and audited');

-- Results: an unmarked practical is Not marked (UNGRADED), never Missing, even after its date.
select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select first_name, result from public.assignment_results(tests.id('P1')) order by first_name $$,
  $$ values ('Abena', 'GRADED'), ('Kwame', 'GRADED'), ('Yaw', 'UNGRADED') $$, 'Yaw, not marked yet, is UNGRADED and not Missing');
select results_eq($$ select enrolled, submitted, graded, ungraded, missing, not_yet_due from public.assignment_result_counts(tests.id('P1')) $$,
  $$ values (3, 3, 2, 1, 0, 0) $$, 'and the counts still add up, with nobody Missing');
select is((select c ->> 'state' from public.calculate_course_grades(tests.id('c1')) g, jsonb_array_elements(g.cells) c
            where g.first_name = 'Yaw' and (c ->> 'assignment_id')::uuid = tests.id('P1')), 'UNGRADED', 'the gradebook shows it as not marked');
select is((select (c ->> 'counted')::boolean from public.calculate_course_grades(tests.id('c1')) g, jsonb_array_elements(g.cells) c
            where g.first_name = 'Yaw' and (c ->> 'assignment_id')::uuid = tests.id('P1')), false, 'and it is not counted');
select is((select part from public.gradebook_assignments(tests.id('c1')) where assignment_id = tests.id('P1')), 'PRACTICALS',
  'gradebook columns say which part they belong to');

-- A changed released mark needs a reason, as for any grade.
select tests.as_service();
select public.grade_release(tests.uid('t1'), false, tests.id('P1'));
select throws_ok($$ select public.practical_marks_save(tests.uid('t1'), false, tests.id('P1'),
    jsonb_build_array(jsonb_build_object('learner_id', tests.uid('l2'), 'score', 20))) $$, '22023', 'Give a reason for changing a released grade',
  'a released practical mark changes only with a reason');
select is((select public.practical_marks_save(tests.uid('t1'), false, tests.id('P1'),
    jsonb_build_array(jsonb_build_object('learner_id', tests.uid('l2'), 'score', 20)), 'Marked again after the review')), 1,
  'with the reason it is saved, waiting to be released');

-- ---------------------------------------------------------------- the course grade over the parts (D13)
-- Kwame: weekly 16/20 = 80% (released); practical 25/30 (released). Overall (80 x 40 + 83.33 x 30) / 70
-- = 81.4 (examinations: nothing yet, left out).
select tests.reset();
create function tests.sent(p_learner text, p_assignment text) returns void language plpgsql as $$
declare v uuid;
begin
  insert into public.submissions (assignment_id, learner_id, status, current_version) values (tests.id(p_assignment), tests.uid(p_learner), 'SUBMITTED', 1) returning id into v;
  insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id) values (v, 1, 'My answer.', false, gen_random_uuid());
end $$;
select tests.sent('l1', 'W1');
select tests.as_service();
select public.grade_save(tests.uid('t1'), false, tests.id('W1'), tests.uid('l1'), 16, null, null);
select public.grade_release(tests.uid('t1'), false, tests.id('W1'), tests.uid('l1'));
select tests.reset();
select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select overall_percentage, letter_grade from public.calculate_course_grades(tests.id('c1')) $$,
  $$ values (81.4::numeric, 'A') $$, 'Kwame''s course grade: 81.4%, A, from weekly assignments 40 and practicals 30');
select is((select jsonb_agg(c.value ->> 'percentage' order by c.n) from public.calculate_course_grades(tests.id('c1')) g, jsonb_array_elements(g.categories) with ordinality c(value, n)),
  '["80.0", "83.3", null]'::jsonb, 'the parts: weekly 80.0, practicals 83.3, examinations not yet');
select is((select count(*)::int from public.my_grades() where assignment_id = tests.id('P1') and state = 'RELEASED'), 1,
  'the learner sees the released practical mark in Grades and feedback');
select tests.reset();

-- ---------------------------------------------------------------- switching an existing course to the parts
-- c9 as it was before Phase 10.1: Assignments 60 and Practical work 40, a released grade.
insert into public.courses (id, title, course_code, created_by, status, published_at) values (tests.id('c9'), 'Church History', 'HIS110', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values (tests.id('c9'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values (tests.id('c9'), tests.uid('l1'), 'ACTIVE', tests.uid('a1'));
select set_config('app.weights_unlocked', 'on', true);
update public.grade_categories set archived_at = now() where course_id = tests.id('c9');
insert into public.grade_categories (id, course_id, name, weight, position, part) values
  (tests.id('k1'), tests.id('c9'), 'Assignments', 60, 1, 'ASSIGNMENTS'), (tests.id('k2'), tests.id('c9'), 'Practical work', 40, 2, 'ASSIGNMENTS');
select set_config('app.weights_unlocked', '', true);
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at) values
  (tests.id('H1'), tests.id('c9'), tests.id('k1'), 'Reformation essay', 'TEXT', '<p>Write.</p>', now() + interval '7 days', 20, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now()),
  (tests.id('H2'), tests.id('c9'), tests.id('k2'), 'Visit report', 'TEXT', '<p>Report.</p>', now() + interval '7 days', 10, array['TEXT', 'AUDIO'], 'PUBLISHED', tests.uid('t1'), now());
select tests.sent('l1', 'H1');
select tests.as_service();
select public.grade_save(tests.uid('t1'), false, tests.id('H1'), tests.uid('l1'), 15, null, null);
select public.grade_release(tests.uid('t1'), false, tests.id('H1'), tests.uid('l1'));
select is(public.course_uses_standard_parts(tests.id('c9')), false, 'Church History does not use the parts yet');
select throws_ok($$ select public.apply_standard_parts(tests.uid('t1'), false, tests.id('c9'), 'Switching') $$, '42501',
  'Only an administrator can change the grade weights', 'a lecturer cannot switch a course with released grades');
select throws_ok($$ select public.apply_standard_parts(tests.uid('a1'), true, tests.id('c9'), '') $$, '22023',
  'Give a reason for changing the grade weights', 'the administrator gives a reason');
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select results_eq($$ select first_name, current_overall, new_overall from public.standard_parts_preview(tests.id('c9')) $$,
  $$ values ('Kwame', 75.0::numeric, 75.0::numeric) $$, 'the preview shows each learner''s overall before and after (nothing changes)');
select tests.reset();
select tests.as_service();
select is(public.course_uses_standard_parts(tests.id('c9')), false, 'and the preview changes nothing');
select lives_ok($$ select public.apply_standard_parts(tests.uid('a1'), true, tests.id('c9'), 'Moving to the DDTC standard') $$,
  'the administrator switches the course');
select tests.reset();
select results_eq(
  $$ select a.title, g.part::text from public.assignments a join public.grade_categories g on g.id = a.category_id where a.course_id = tests.id('c9') order by a.title $$,
  $$ values ('Reformation essay', 'ASSIGNMENTS'), ('Visit report', 'PRACTICALS') $$,
  'the practical category''s work moves to practicals, the rest to weekly assignments');
select is(public.course_uses_standard_parts(tests.id('c9')), true, 'and the course now uses the parts, audited');

select * from finish();
rollback;
