-- Step 11.2 (owner request and answer of 2026-11-11, plan approved the same day, ADR-021): the lecturer
-- chooses an examination's types of question (multiple choice, short answer, essay: one, two or all
-- three) before writing it, and every section has one type, taken from those chosen.
-- - exam_save keeps the chosen types; none, an unknown one or one twice is refused.
-- - exam_structure_save: a section's questions are all of the section's type; a mixed section and a type
--   the examination did not choose are refused. A section sent without a type takes its questions' type.
-- - A type that still has sections cannot be taken off the examination (nothing is deleted).
-- - Once a learner has started, the types cannot change (as the questions cannot).
-- - Examinations set before this step keep their sections until they are next edited.
-- - Only the course's lecturers and AAL2 administrators set any of it (existing rules, checked again).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(22);

select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.t2', tests.create_user('t2@example.test', 'Grace', 'Owusu', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values (tests.id('c1'), 'Introduction to Biblical Studies', 'BIB101', tests.uid('t1'), 'PUBLISHED', now());
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by) values (tests.id('c1'), tests.uid('t1'), 'OWNER', tests.uid('t1'));
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by) values (tests.id('c1'), tests.uid('l1'), 'ACTIVE', tests.uid('a1'));

/** The details of an examination with these types. */
create function tests.fields(p_modes text[]) returns jsonb language sql stable as $$
  select jsonb_build_object('title', 'Final examination', 'opens_at', now() - interval '1 hour', 'closes_at', now() + interval '1 day')
         || case when p_modes is null then '{}'::jsonb else jsonb_build_object('modes', to_jsonb(p_modes)) end
$$;
/** A question of a kind. */
create function tests.question(p_kind text) returns jsonb language sql immutable as $$
  select case p_kind when 'MCQ' then jsonb_build_object('kind', 'MCQ', 'prompt', 'Pick', 'marks', 1, 'correct', 'A', 'options', jsonb_build_object('A', 'w', 'B', 'x', 'C', 'y', 'D', 'z'))
                     else jsonb_build_object('kind', p_kind, 'prompt', 'Write', 'marks', 5) end
$$;
/** A section: its type (null to leave it out) and its questions' kinds. */
create function tests.section(p_mode text, p_kinds text[]) returns jsonb language sql immutable as $$
  select jsonb_build_object('title', 'Section', 'questions', (select jsonb_agg(tests.question(k)) from unnest(p_kinds) k))
         || case when p_mode is null then '{}'::jsonb else jsonb_build_object('mode', p_mode) end
$$;
grant execute on function tests.fields(text[]), tests.question(text), tests.section(text, text[]) to service_role;
create function tests.exam_modes(p_exam uuid) returns text[] language sql stable security definer set search_path = '' as $$
  select modes::text[] from public.examinations where id = p_exam $$;
create function tests.section_modes(p_exam uuid) returns text[] language sql stable security definer set search_path = '' as $$
  select array_agg(mode::text order by position) from public.exam_sections where exam_id = p_exam and archived_at is null $$;
grant execute on function tests.exam_modes(uuid), tests.section_modes(uuid) to anon, authenticated, service_role;

select tests.as_service();

-- ---------------------------------------------------------------- choosing the types
select throws_ok($$ select public.exam_save(tests.uid('t1'), false, tests.id('c1'), null, tests.fields(array[]::text[])) $$, '22023',
  'Choose at least one type of question for the examination', 'an examination with no type is refused');
select throws_ok($$ select public.exam_save(tests.uid('t1'), false, tests.id('c1'), null, tests.fields(array['MCQ', 'ORAL'])) $$, '22023',
  'Choose at least one type of question for the examination', 'an unknown type is refused');
select throws_ok($$ select public.exam_save(tests.uid('t1'), false, tests.id('c1'), null, tests.fields(array['MCQ', 'MCQ'])) $$, '22023',
  'Choose at least one type of question for the examination', 'the same type twice is refused');
create temporary table ex as select public.exam_save(tests.uid('t1'), false, tests.id('c1'), null, tests.fields(array['MCQ', 'ESSAY'])) as id;
grant select on ex to authenticated, service_role;
select is(tests.exam_modes((select id from ex)), array['MCQ', 'ESSAY'], 'the lecturer chooses multiple choice and essay');
select throws_ok($$ select public.exam_save(tests.uid('t2'), false, tests.id('c1'), (select id from ex), tests.fields(array['MCQ'])) $$, '42501', null,
  'a lecturer of another course cannot change the types');
select throws_ok($$ select public.exam_save(tests.uid('l1'), false, tests.id('c1'), (select id from ex), tests.fields(array['MCQ'])) $$, '42501', null,
  'nor a learner');

-- ---------------------------------------------------------------- one type per section
select throws_ok($$ select public.exam_structure_save(tests.uid('t1'), false, (select id from ex), jsonb_build_array(tests.section('MCQ', array['MCQ', 'ESSAY']))) $$, '22023',
  'Give each section one type of question', 'a section that mixes types is refused');
select throws_ok($$ select public.exam_structure_save(tests.uid('t1'), false, (select id from ex), jsonb_build_array(tests.section(null, array['MCQ', 'ESSAY']))) $$, '22023',
  'Give each section one type of question', 'also when the section names no type');
select throws_ok($$ select public.exam_structure_save(tests.uid('t1'), false, (select id from ex), jsonb_build_array(tests.section('SHORT', array['SHORT']))) $$, '22023',
  'This examination does not include short-answer questions', 'a type the examination did not choose is refused');
select throws_ok($$ select public.exam_structure_save(tests.uid('t1'), false, (select id from ex), jsonb_build_array(tests.section('ORAL', array['MCQ']))) $$, '22023',
  'Give each section one type of question', 'an unknown section type is refused');
select lives_ok($$ select public.exam_structure_save(tests.uid('t1'), false, (select id from ex),
    jsonb_build_array(tests.section('MCQ', array['MCQ', 'MCQ']), tests.section('ESSAY', array['ESSAY']))) $$, 'a multiple-choice section and an essay section are saved');
select is(tests.section_modes((select id from ex)), array['MCQ', 'ESSAY'], 'each section keeps its type');
select lives_ok($$ select public.exam_structure_save(tests.uid('t1'), false, (select id from ex),
    jsonb_build_array(tests.section(null, array['MCQ']), tests.section(null, array['ESSAY', 'ESSAY']))) $$, 'a section sent without a type takes its questions'' type');
select is(tests.section_modes((select id from ex)), array['MCQ', 'ESSAY'], 'and keeps it');

-- ---------------------------------------------------------------- changing the types
select throws_ok($$ select public.exam_save(tests.uid('t1'), false, tests.id('c1'), (select id from ex), tests.fields(array['MCQ'])) $$, '22023',
  'Remove the essay sections first', 'a type that still has sections cannot be taken off');
select lives_ok($$ select public.exam_save(tests.uid('t1'), false, tests.id('c1'), (select id from ex), tests.fields(array['ESSAY', 'SHORT', 'MCQ'])) $$, 'a type can be added');
select is(tests.exam_modes((select id from ex)), array['MCQ', 'SHORT', 'ESSAY'], 'kept in the usual order');
select lives_ok($$ select public.exam_save(tests.uid('t1'), false, tests.id('c1'), (select id from ex), tests.fields(null)) $$, 'saving the details without naming types');
select is(tests.exam_modes((select id from ex)), array['MCQ', 'SHORT', 'ESSAY'], 'leaves the types as they were');

-- ---------------------------------------------------------------- an examination set before this step
select tests.reset();
update public.exam_sections set mode = null where exam_id = (select id from ex);
select tests.as_service();
select is((select count(*)::int from public.exam_sections where exam_id = (select id from ex) and archived_at is null and mode is null), 2,
  'sections set before this step have no type recorded and stay as they are');
select throws_ok($$ select public.exam_save(tests.uid('t1'), false, tests.id('c1'), (select id from ex), tests.fields(array['MCQ', 'SHORT'])) $$, '22023',
  'Remove the essay sections first', 'their questions still count when a type is taken off');

-- ---------------------------------------------------------------- once a learner has started
select public.exam_publish(tests.uid('t1'), false, (select id from ex), true);
select public.exam_start(tests.uid('l1'), (select id from ex));
select throws_ok($$ select public.exam_save(tests.uid('t1'), false, tests.id('c1'), (select id from ex), tests.fields(array['MCQ', 'SHORT', 'ESSAY'])) $$, '22023',
  'This examination has started, so only its deadline can change', 'the types cannot change once a learner has started');

select * from finish();
rollback;
