-- Phase 10.1, step D (ADR-016; owner request of 2026-11-10: "the examination deadline must be clearly
-- displayed on the learner's dashboard"; integrated into the lecturer dashboard and To grade):
-- - my_exam_deadlines: the signed-in learner's examinations still to do (upcoming or open, not yet
--   submitted), across their courses, soonest deadline first, with their own deadline; nobody else's;
-- - exam_marking_queue: per examination of the courses the caller manages, how many scripts wait for
--   marking and how many marked results wait for release; nothing for anyone else.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(7);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values
  (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now()),
  (tests.id('c2'), 'Prayer and Worship', 'PRW110', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by)
select tests.id(c), tests.uid('t1'), 'OWNER', tests.uid('t1') from unnest(array['c1', 'c2']) c;
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select tests.id(c), tests.uid('l1'), 'ACTIVE', tests.uid('a1') from unnest(array['c1', 'c2']) c;
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values (tests.id('c1'), tests.uid('l2'), 'ACTIVE', tests.uid('a1'));

create function tests.exam(p_course text, p_title text, p_opens interval, p_closes interval) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := public.exam_save(tests.uid('t1'), false, tests.id(p_course), null, jsonb_build_object('title', p_title, 'opens_at', now() + p_opens, 'closes_at', now() + p_closes));
  perform public.exam_structure_save(tests.uid('t1'), false, v, jsonb_build_array(jsonb_build_object('title', 'A', 'questions', jsonb_build_array(
    jsonb_build_object('kind', 'MCQ', 'prompt', 'Pick', 'marks', 1, 'correct', 'A', 'options', jsonb_build_object('A', 'w', 'B', 'x', 'C', 'y', 'D', 'z')),
    jsonb_build_object('kind', 'ESSAY', 'prompt', 'Write', 'marks', 9)))));
  perform public.exam_publish(tests.uid('t1'), false, v, true);
  return v;
end $$;
select set_config('t.e1', tests.exam('c1', 'Final examination', interval '-1 hour', interval '3 days')::text, true);
select set_config('t.e2', tests.exam('c2', 'Worship test', interval '-1 hour', interval '1 day')::text, true);
select set_config('t.e3', tests.exam('c1', 'Mid-course test', interval '2 days', interval '5 days')::text, true);
-- Abena submits the final with an essay answer (to mark).
select public.exam_start(tests.uid('l2'), current_setting('t.e1')::uuid);
select public.exam_save_answers(tests.uid('l2'), current_setting('t.e1')::uuid,
  (select jsonb_agg(jsonb_build_object('question_id', q.id, 'text_answer', 'My essay.')) from public.exam_questions q where q.exam_id = current_setting('t.e1')::uuid and q.kind = 'ESSAY'));
select public.exam_submit(tests.uid('l2'), current_setting('t.e1')::uuid);

select tests.authenticate_as(tests.uid('l1'));
select results_eq($$ select title, state from public.my_exam_deadlines() $$,
  $$ values ('Worship test', 'OPEN'), ('Final examination', 'OPEN'), ('Mid-course test', 'UPCOMING') $$,
  'Kwame''s examinations to do across his courses, soonest deadline first');
select is((select course_code from public.my_exam_deadlines() where title = 'Worship test'), 'PRW110', 'each with its course');
select tests.reset(); select tests.authenticate_as(tests.uid('l2'));
select results_eq($$ select title from public.my_exam_deadlines() $$, $$ values ('Mid-course test') $$,
  'Abena''s submitted examination is no longer listed; her other course is not hers');

select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select title, to_mark, to_release from public.exam_marking_queue() where to_mark + to_release > 0 $$,
  $$ values ('Final examination', 1, 0) $$, 'the lecturer sees one script to mark');
select tests.reset(); select tests.as_service();
select public.exam_answer_grade(tests.uid('t1'), false, current_setting('t.e1')::uuid, tests.uid('l2'),
  (select q.id from public.exam_questions q where q.exam_id = current_setting('t.e1')::uuid and q.kind = 'ESSAY'), 7, null, null);
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select results_eq($$ select title, to_mark, to_release from public.exam_marking_queue() where to_mark + to_release > 0 $$,
  $$ values ('Final examination', 0, 1) $$, 'once marked, it waits for release');
select tests.reset(); select tests.authenticate_as(tests.uid('t2'));
select is((select count(*)::int from public.exam_marking_queue()), 0, 'another lecturer sees nothing');
select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.exam_marking_queue()), 0, 'nor does a learner');

select * from finish();
rollback;
