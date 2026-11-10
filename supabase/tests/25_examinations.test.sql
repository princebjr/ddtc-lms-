-- Phase 10.1, step B (ADR-016; owner request and answers of 2026-11-10): end-of-course examinations.
-- - Access: learners never read the examination tables directly (above all the answer keys); they use
--   my_exams and my_exam, which never contain a correct answer or marking guide.
-- - Setting: the course's lecturers and AAL2 administrators create an examination (opening and closing
--   time, pass mark), its sections and questions (multiple choice with four options A to D and one
--   correct answer, short answer with a marking guide, essay), and publish it; the total is the sum
--   of the questions' marks. Once a learner has started, only the deadline changes.
-- - Taking: an enrolled learner starts once it is open, saves answers as they go, and submits once,
--   before their deadline (database time; an extension or a reopened deadline gives more time; no
--   countdown). After the deadline nothing more is saved or sent; saved answers stay for the lecturer.
-- - Marking: multiple choice is marked on submission and is final; short answers and essays are marked
--   one by one (0 to the question's marks) with feedback; results show the multiple-choice, short-answer
--   and essay scores, total, percentage and pass or fail; released results reach the learner, with a
--   notification; a changed released mark needs a reason; a retake is authorised with a reason and counts
--   once released; every step is in the history and the audit log.
-- - The course grade: the latest released attempt counts in the Final examinations part (D13, D30).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(63);

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

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select tests.id('c1'), tests.uid(l), 'ACTIVE', tests.uid('a1') from unnest(array['l1', 'l2', 'l3']) l;

/** The questions of the test examination: two multiple choice (B and D correct), a short answer, an essay. */
create function tests.structure() returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('title', 'Section A: Multiple choice', 'questions', jsonb_build_array(
      jsonb_build_object('kind', 'MCQ', 'prompt', 'Who led Israel out of Egypt?', 'marks', 2, 'correct', 'B',
                         'options', jsonb_build_object('A', 'Aaron', 'B', 'Moses', 'C', 'Joshua', 'D', 'Samuel')),
      jsonb_build_object('kind', 'MCQ', 'prompt', 'How many books are in the Pentateuch?', 'marks', 2, 'correct', 'D',
                         'options', jsonb_build_object('A', 'Three', 'B', 'Four', 'C', 'Six', 'D', 'Five')))),
    jsonb_build_object('title', 'Section B: Short answer', 'questions', jsonb_build_array(
      jsonb_build_object('kind', 'SHORT', 'prompt', 'Name the covenant made with Abraham.', 'marks', 5, 'guide', 'The Abrahamic covenant: land, descendants, blessing.'))),
    jsonb_build_object('title', 'Section C: Essay', 'questions', jsonb_build_array(
      jsonb_build_object('kind', 'ESSAY', 'prompt', 'Discuss the theme of covenant in Genesis.', 'marks', 11))))
$$;
grant execute on function tests.structure() to service_role;
create function tests.q(p_position int) returns uuid language sql stable as $$
  select q.id from public.exam_questions q where q.exam_id = tests.id('E1') and q.archived_at is null order by q.position limit 1 offset p_position - 1
$$;
grant execute on function tests.q(int) to authenticated, service_role;

-- ---------------------------------------------------------------- the tables are closed to clients
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.examinations), 0, 'nothing yet');
select tests.reset();

-- ---------------------------------------------------------------- setting an examination
select tests.as_service();
select throws_ok($$ select public.exam_save(tests.uid('t2'), false, tests.id('c1'), null, jsonb_build_object('title', 'Mine', 'opens_at', now(), 'closes_at', now() + interval '1 day')) $$,
  '42501', 'You do not teach this course', 'a lecturer of another course cannot set an examination');
select throws_ok($$ select public.exam_save(tests.uid('l1'), false, tests.id('c1'), null, jsonb_build_object('title', 'Mine', 'opens_at', now(), 'closes_at', now() + interval '1 day')) $$,
  '42501', NULL, 'a learner cannot set an examination');
select throws_ok($$ select public.exam_save(tests.uid('t1'), false, tests.id('c1'), null,
    jsonb_build_object('title', 'Final examination', 'opens_at', now() + interval '1 day', 'closes_at', now())) $$,
  '22023', 'The closing time must be after the opening time', 'it closes after it opens');
select throws_ok($$ select public.exam_save(tests.uid('t1'), false, tests.id('c1'), null,
    jsonb_build_object('title', 'Final examination', 'opens_at', now(), 'closes_at', now() + interval '1 day', 'pass_mark', 120)) $$,
  '22023', 'The pass mark is a whole percentage from 0 to 100', 'the pass mark is a percentage');
create temporary table e1 as select public.exam_save(tests.uid('t1'), false, tests.id('c1'), null,
  jsonb_build_object('title', 'Final examination', 'description', 'End of course.', 'instructions', 'Answer every question.',
                     'opens_at', now() - interval '1 hour', 'closes_at', now() + interval '2 days', 'pass_mark', 50)) as id;
grant select on e1 to authenticated, service_role;
select tests.reset();
update public.examinations set id = tests.id('E1') where id = (select id from e1);
select results_eq($$ select g.part::text, x.pass_mark, x.publication_status::text from public.examinations x join public.grade_categories g on g.id = x.category_id where x.id = tests.id('E1') $$,
  $$ values ('EXAMINATIONS', 50, 'DRAFT') $$, 'the examination belongs to the Final examinations part, as a draft');
select tests.as_service();
select throws_ok($$ select public.exam_publish(tests.uid('t1'), false, tests.id('E1'), true) $$, '22023', 'Add at least one question before publishing',
  'an examination without questions cannot be published');
select throws_ok($$ select public.exam_structure_save(tests.uid('t1'), false, tests.id('E1'), jsonb_build_array(jsonb_build_object('title', 'A', 'questions',
    jsonb_build_array(jsonb_build_object('kind', 'MCQ', 'prompt', 'Pick one', 'marks', 1, 'correct', 'A', 'options', jsonb_build_object('A', 'x', 'B', 'y', 'C', 'z')))))) $$,
  '22023', 'Give each multiple-choice question four options, A to D', 'a multiple-choice question has four options');
select throws_ok($$ select public.exam_structure_save(tests.uid('t1'), false, tests.id('E1'), jsonb_build_array(jsonb_build_object('title', 'A', 'questions',
    jsonb_build_array(jsonb_build_object('kind', 'MCQ', 'prompt', 'Pick one', 'marks', 1, 'options', jsonb_build_object('A', 'w', 'B', 'x', 'C', 'y', 'D', 'z')))))) $$,
  '22023', 'Choose the correct answer for each multiple-choice question', 'and one correct answer');
select throws_ok($$ select public.exam_structure_save(tests.uid('t1'), false, tests.id('E1'), jsonb_build_array(jsonb_build_object('title', 'A', 'questions',
    jsonb_build_array(jsonb_build_object('kind', 'ESSAY', 'prompt', 'Write', 'marks', 0))))) $$,
  '22023', 'Give each question marks above 0', 'every question carries marks');
select is(public.exam_structure_save(tests.uid('t1'), false, tests.id('E1'), tests.structure()), 4, 'three sections with four questions are saved');
select tests.reset();
select results_eq($$ select q.kind::text, q.marks, s.title from public.exam_questions q join public.exam_sections s on s.id = q.section_id
                     where q.exam_id = tests.id('E1') and q.archived_at is null order by q.position $$,
  $$ values ('MCQ', 2.00::numeric, 'Section A: Multiple choice'), ('MCQ', 2.00::numeric, 'Section A: Multiple choice'),
            ('SHORT', 5.00::numeric, 'Section B: Short answer'), ('ESSAY', 11.00::numeric, 'Section C: Essay') $$,
  'in order, each in its section with its marks');
select is(private.exam_total(tests.id('E1')), 20.00::numeric, 'the total is the sum of the questions'' marks: 20');
select tests.as_service();
select lives_ok($$ select public.exam_publish(tests.uid('t1'), false, tests.id('E1'), true) $$, 'the lecturer publishes it');
-- E3 opens tomorrow.
create temporary table e3 as select public.exam_save(tests.uid('t1'), false, tests.id('c1'), null,
  jsonb_build_object('title', 'Mid-course test', 'opens_at', now() + interval '1 day', 'closes_at', now() + interval '3 days')) as id;
select public.exam_structure_save(tests.uid('t1'), false, (select id from e3), tests.structure());
select public.exam_publish(tests.uid('t1'), false, (select id from e3), true);
select tests.reset();

-- ---------------------------------------------------------------- what learners see
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.examinations) + (select count(*)::int from public.exam_questions)
          + (select count(*)::int from public.exam_question_keys) + (select count(*)::int from public.exam_attempts), 0,
  'a learner reads none of the examination tables directly');
select results_eq($$ select title, state, total_marks, pass_mark from public.my_exams(tests.id('c1')) order by opens_at $$,
  $$ values ('Final examination', 'OPEN', 20.00::numeric, 50), ('Mid-course test', 'UPCOMING', 20.00::numeric, 50) $$,
  'my_exams lists both with their state, total and pass mark');
select is(jsonb_typeof(public.my_exam(tests.id('E1')) -> 'sections'), 'null', 'before starting, the questions are not shown');
select tests.reset(); select tests.authenticate_as(tests.uid('l9'));
select is((select count(*)::int from public.my_exams(tests.id('c1'))), 0, 'a learner of another course sees nothing');
select tests.reset();

-- ---------------------------------------------------------------- taking it
select tests.as_service();
select throws_ok($$ select public.exam_start(tests.uid('l9'), tests.id('E1')) $$, '42501', 'You are not enrolled in this course',
  'a learner not in the course cannot start it');
select throws_ok($$ select public.exam_start(tests.uid('l1'), (select id from e3)) $$, '22023', 'This examination is not open yet',
  'nobody starts before the opening time');
select throws_ok($$ select public.exam_save_answers(tests.uid('l1'), tests.id('E1'), '[]') $$, '22023', 'Start the examination first',
  'answers are saved only after starting');
select isnt(public.exam_start(tests.uid('l1'), tests.id('E1')), null, 'Kwame starts');
select is((select count(*)::int from public.exam_attempts where exam_id = tests.id('E1') and learner_id = tests.uid('l1')), 1, 'once: starting again changes nothing');
select public.exam_start(tests.uid('l1'), tests.id('E1'));
select throws_ok($$ select public.exam_save_answers(tests.uid('l1'), tests.id('E1'), jsonb_build_array(jsonb_build_object('question_id', tests.q(1), 'selected_option', 'E'))) $$,
  '22023', 'Choose A, B, C or D', 'only A to D');
select throws_ok($$ select public.exam_save_answers(tests.uid('l1'), tests.id('E1'), jsonb_build_array(jsonb_build_object('question_id', gen_random_uuid(), 'text_answer', 'x'))) $$,
  '22023', 'That question is not in this examination', 'only this examination''s questions');
select lives_ok($$ select public.exam_save_answers(tests.uid('l1'), tests.id('E1'), jsonb_build_array(
    jsonb_build_object('question_id', tests.q(1), 'selected_option', 'B'), jsonb_build_object('question_id', tests.q(2), 'selected_option', 'A'),
    jsonb_build_object('question_id', tests.q(3), 'text_answer', 'The covenant with Abraham.'))) $$, 'answers are saved as the learner goes');
select lives_ok($$ select public.exam_save_answers(tests.uid('l1'), tests.id('E1'), jsonb_build_array(
    jsonb_build_object('question_id', tests.q(4), 'text_answer', repeat('Covenant runs through Genesis. ', 100)))) $$, 'a long essay is saved too');
select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select is((select jsonb_path_query_first(public.my_exam(tests.id('E1')), '$.sections[0].questions[0].answer.selected_option') #>> '{}'), 'B',
  'reopening shows the saved answer');
select is((public.my_exam(tests.id('E1'))::text ~* 'correct|guide|Abrahamic covenant: land'), false, 'and never a correct answer or marking guide');
select tests.reset(); select tests.as_service();
select results_eq($$ select status::text from public.exam_submit(tests.uid('l1'), tests.id('E1')) $$, $$ values ('SUBMITTED') $$, 'Kwame submits');
select throws_ok($$ select public.exam_submit(tests.uid('l1'), tests.id('E1')) $$, '22023', 'You have already submitted this examination', 'only once');
select throws_ok($$ select public.exam_save_answers(tests.uid('l1'), tests.id('E1'), jsonb_build_array(jsonb_build_object('question_id', tests.q(3), 'text_answer', 'Changed'))) $$,
  '22023', 'You have already submitted this examination', 'a submitted examination cannot be changed');
-- Abena starts and saves, but the deadline passes before she submits.
select public.exam_start(tests.uid('l2'), tests.id('E1'));
select public.exam_save_answers(tests.uid('l2'), tests.id('E1'), jsonb_build_array(jsonb_build_object('question_id', tests.q(3), 'text_answer', 'Abraham''s covenant.')));
select tests.reset();
update public.examinations set closes_at = now() - interval '1 minute', opens_at = now() - interval '2 hours' where id = tests.id('E1');
select tests.as_service();
select throws_ok($$ select public.exam_save_answers(tests.uid('l2'), tests.id('E1'), jsonb_build_array(jsonb_build_object('question_id', tests.q(3), 'text_answer', 'More'))) $$,
  '22023', 'The deadline for this examination has passed', 'after the deadline nothing more is saved');
select throws_ok($$ select public.exam_submit(tests.uid('l2'), tests.id('E1')) $$, '22023', 'The deadline for this examination has passed', 'or sent');

-- ---------------------------------------------------------------- marking
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select first_name, state from public.exam_results(tests.id('E1')) order by first_name $$,
  $$ values ('Abena', 'NOT_SUBMITTED'), ('Kwame', 'SUBMITTED'), ('Yaw', 'NOT_STARTED') $$, 'the lecturer sees who submitted, who did not, and who never started');
select results_eq($$ select q ->> 'kind', (q -> 'answer' ->> 'score')::numeric, (q -> 'answer' ->> 'auto_marked')::boolean
                     from jsonb_array_elements(jsonb_path_query_array(public.exam_script(tests.id('E1'), tests.uid('l1')), '$.sections[*].questions[*]')) q
                    where q ->> 'kind' = 'MCQ' $$,
  $$ values ('MCQ', 2::numeric, true), ('MCQ', 0::numeric, true) $$, 'multiple choice was marked on submission: B right (2), A wrong (0)');
select is((jsonb_path_query_first(public.exam_script(tests.id('E1'), tests.uid('l2')), '$.sections[1].questions[0].answer.text_answer') #>> '{}'),
  'Abraham''s covenant.', 'Abena''s saved answer is kept for the lecturer');
select tests.reset(); select tests.as_service();
select throws_ok($$ select public.exam_answer_grade(tests.uid('t1'), false, tests.id('E1'), tests.uid('l1'), tests.q(1), 1, null, null) $$, '22023',
  'Multiple-choice answers are marked automatically', 'multiple-choice marks are final');
select throws_ok($$ select public.exam_answer_grade(tests.uid('t1'), false, tests.id('E1'), tests.uid('l1'), tests.q(3), 6, null, null) $$, '22023',
  'The score must be between 0 and 5', 'a mark never exceeds the question''s marks');
select throws_ok($$ select public.exam_answer_grade(tests.uid('t2'), false, tests.id('E1'), tests.uid('l1'), tests.q(3), 4, null, null) $$, '42501',
  'You do not teach this course', 'only the course''s lecturers mark');
select lives_ok($$ select public.exam_answer_grade(tests.uid('t1'), false, tests.id('E1'), tests.uid('l1'), tests.q(3), 4, 'Name the blessings too.', null) $$,
  'the short answer is marked with feedback');
select lives_ok($$ select public.exam_answer_grade(tests.uid('t1'), false, tests.id('E1'), tests.uid('l1'), tests.q(4), 9, 'A thoughtful essay.', null) $$,
  'the essay is marked');
select lives_ok($$ select public.exam_feedback_save(tests.uid('t1'), false, tests.id('E1'), tests.uid('l1'), 'Well done overall.', null) $$, 'with overall feedback');
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select mcq_score, short_score, essay_score, total_score, total_marks, percentage, passed, grading_state
                     from public.exam_results(tests.id('E1')) where first_name = 'Kwame' $$,
  $$ values (2::numeric, 4::numeric, 9::numeric, 15::numeric, 20.00::numeric, 75.0::numeric, true, 'GRADED') $$,
  'Kwame: MCQ 2, short 4, essay 9, total 15 of 20, 75.0%, passed (pass mark 50%)');
select results_eq($$ select grading_state, percentage, passed from public.exam_results(tests.id('E1')) where first_name = 'Abena' $$,
  $$ values ('UNGRADED', null::numeric, null::boolean) $$, 'a script not fully marked shows no percentage and no pass or fail');

-- ---------------------------------------------------------------- release
select tests.reset(); select tests.as_service();
select throws_ok($$ select public.exam_release(tests.uid('t2'), false, tests.id('E1')) $$, '42501', NULL, 'another course''s lecturer cannot release');
select is(public.exam_release(tests.uid('t1'), false, tests.id('E1')), 1, 'releasing the examination releases every fully marked script: Kwame''s');
select tests.reset();
select is((select count(*)::int from public.notifications where recipient_id = tests.uid('l1') and related_entity_id = tests.id('E1')
            and link_path = '/learner/courses/' || tests.id('c1') || '/exams/' || tests.id('E1')), 1, 'Kwame is told his result is ready');
select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select (r ->> 'total_score')::numeric, (r ->> 'percentage')::numeric, (r ->> 'passed')::boolean, r ->> 'feedback'
                     from (select public.my_exam(tests.id('E1')) -> 'result' as r) x $$,
  $$ values (15::numeric, 75.0::numeric, true, 'Well done overall.') $$, 'Kwame sees his released result and feedback');
select is((jsonb_path_query_first(public.my_exam(tests.id('E1')), '$.sections[1].questions[0].answer.feedback') #>> '{}'), 'Name the blessings too.',
  'and the feedback on each answer');
select tests.reset(); select tests.as_service();
select throws_ok($$ select public.exam_answer_grade(tests.uid('t1'), false, tests.id('E1'), tests.uid('l1'), tests.q(4), 10, null, null) $$, '22023',
  'Give a reason for changing a released result', 'a released mark changes only with a reason');
select lives_ok($$ select public.exam_answer_grade(tests.uid('t1'), false, tests.id('E1'), tests.uid('l1'), tests.q(4), 10, 'A thoughtful essay.', 'Second marker agreed 10') $$,
  'with a reason it changes, waiting to be released');
select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select is(((public.my_exam(tests.id('E1')) -> 'result' ->> 'total_score')::numeric), 15::numeric, 'Kwame still sees the released 15 until the change is released');

-- ---------------------------------------------------------------- the course grade
select results_eq($$ select c ->> 'state', (c ->> 'score')::numeric from public.calculate_course_grades(tests.id('c1')) g, jsonb_array_elements(g.cells) c
                     where (c ->> 'assignment_id')::uuid = tests.id('E1') $$,
  $$ values ('RELEASED', 15::numeric) $$, 'the released result counts in the course grade');
select is((select c ->> 'percentage' from public.calculate_course_grades(tests.id('c1')) g, jsonb_array_elements(g.categories) c where c ->> 'name' = 'Final examinations'),
  '75.0', 'in the Final examinations part: 75.0%');

-- ---------------------------------------------------------------- retakes, locks and records
select tests.reset(); select tests.as_service();
select throws_ok($$ select public.exam_retake_authorise(tests.uid('t1'), false, tests.id('E1'), tests.uid('l1'), '') $$, '22023',
  'Give a reason for the retake', 'a retake needs a reason');
select lives_ok($$ select public.exam_retake_authorise(tests.uid('t1'), false, tests.id('E1'), tests.uid('l1'), 'Unwell on the day') $$, 'a retake is authorised');
select lives_ok($$ select public.exam_extension_set(tests.uid('t1'), false, tests.id('E1'), tests.uid('l1'), now() + interval '1 day', 'For the retake') $$,
  'and Kwame is given until tomorrow');
select is(public.exam_start(tests.uid('l1'), tests.id('E1')) = (select id from public.exam_attempts where exam_id = tests.id('E1') and learner_id = tests.uid('l1') and attempt_number = 2),
  true, 'he starts his second attempt; the first is kept');
select throws_ok($$ select public.exam_structure_save(tests.uid('t1'), false, tests.id('E1'), tests.structure()) $$, '22023',
  'This examination has started, so its questions cannot change', 'questions are locked once a learner has started');
select throws_ok($$ select public.exam_publish(tests.uid('t1'), false, tests.id('E1'), false) $$, '22023',
  'Learners have started this examination, so it stays published', 'and it cannot be unpublished');
select tests.reset();
select ok((select count(*) from public.exam_grade_history h join public.exam_attempts a on a.id = h.attempt_id where a.exam_id = tests.id('E1')) >= 5,
  'every mark, release and retake is in the examination history');
select ok((select count(distinct action) from public.audit_logs where entity_id in (tests.id('E1')::text) or metadata ->> 'exam_id' = tests.id('E1')::text) >= 4,
  'and in the audit log');

select * from finish();
rollback;
