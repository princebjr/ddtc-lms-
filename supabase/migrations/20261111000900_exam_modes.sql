-- Step 11.2, migration 46 (owner request and answer of 2026-11-11; plan approved the same day; ADR-021):
-- the lecturer chooses an examination's types of question before writing it, and each section has one type.
--   * examinations.modes: the types the examination uses (multiple choice, short answer, essay: one, two
--     or all three), in that order. Examinations set before this step have all three.
--   * exam_sections.mode: the section's one type. Sections set before this step get it where all their
--     questions are of one kind; a mixed section keeps no type and stays as it is until the examination
--     is next edited (no automatic split, owner decision 1).
--   * exam_save takes "modes"; a type that still has sections cannot be taken off (owner decision 3:
--     refused, nothing deleted). Once a learner has started nothing but the deadline changes, as before
--     (owner decision 2).
--   * exam_structure_save: every section has one type from the examination's types and all its questions
--     are of it. A section sent without a type takes its questions' type; a question sent without a kind
--     takes its section's.

alter table public.examinations add column modes public.exam_question_kind[] not null default '{MCQ,SHORT,ESSAY}'
  check (cardinality(modes) between 1 and 3 and array_position(modes, null) is null);
alter table public.exam_sections add column mode public.exam_question_kind;

update public.exam_sections s
   set mode = k.kind
  from (select q.section_id, min(q.kind) as kind from public.exam_questions q where q.archived_at is null group by q.section_id having count(distinct q.kind) = 1) k
 where k.section_id = s.id;

/** A type of question in words, for messages: "multiple-choice", "short-answer", "essay". */
create function private.exam_mode_label(p public.exam_question_kind) returns text
language sql
immutable
set search_path = ''
as $$
  select case p when 'MCQ' then 'multiple-choice' when 'SHORT' then 'short-answer' else 'essay' end;
$$;
revoke execute on function private.exam_mode_label(public.exam_question_kind) from public, anon, authenticated;

/**
 * Creates (p_exam null) or updates an examination's details, since migration 46 with its types of question
 * ("modes": a list of MCQ, SHORT, ESSAY). Once a learner has started, only the deadline changes.
 */
create or replace function public.exam_save(p_actor uuid, p_as_admin boolean, p_course uuid, p_exam uuid, p_fields jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations;
  v_title text := btrim(coalesce(p_fields ->> 'title', ''));
  v_opens timestamptz;
  v_closes timestamptz;
  v_pass integer;
  v_category uuid;
  v_id uuid;
  v_modes public.exam_question_kind[];
  v_used public.exam_question_kind;
begin
  perform private.require_lesson_actor(p_actor, p_as_admin, p_course);
  if p_exam is not null then
    v := private.exam_for_manager(p_actor, p_as_admin, p_exam);
    if v.course_id <> p_course then
      raise exception 'Examination not found' using errcode = 'P0002';
    end if;
    if private.exam_started(p_exam) then
      raise exception 'This examination has started, so only its deadline can change' using errcode = '22023';
    end if;
  end if;
  if char_length(v_title) not between 3 and 200 then
    raise exception 'Give the examination a title of 3 to 200 characters' using errcode = '22023';
  end if;
  begin
    v_opens := (p_fields ->> 'opens_at')::timestamptz;
    v_closes := (p_fields ->> 'closes_at')::timestamptz;
    v_pass := coalesce((p_fields ->> 'pass_mark')::integer, 50);
  exception when others then
    raise exception 'Check the opening time, closing time and pass mark' using errcode = '22023';
  end;
  if v_opens is null or v_closes is null then
    raise exception 'Set the opening and closing time' using errcode = '22023';
  end if;
  if v_closes <= v_opens then
    raise exception 'The closing time must be after the opening time' using errcode = '22023';
  end if;
  if v_pass not between 0 and 100 then
    raise exception 'The pass mark is a whole percentage from 0 to 100' using errcode = '22023';
  end if;
  if char_length(coalesce(p_fields ->> 'description', '')) > 2000 or char_length(coalesce(p_fields ->> 'instructions', '')) > 20000 then
    raise exception 'Keep the description to 2,000 characters and the instructions to 20,000' using errcode = '22023';
  end if;

  -- The types of question: when named, one to three of them, none twice, kept in the usual order.
  if p_fields ? 'modes' then
    begin
      if jsonb_typeof(p_fields -> 'modes') is distinct from 'array' or jsonb_array_length(p_fields -> 'modes') not between 1 and 3 then
        raise exception 'not a list of one to three';
      end if;
      select array_agg(m order by m) into v_modes
        from (select distinct e::public.exam_question_kind as m from jsonb_array_elements_text(p_fields -> 'modes') e) d;
      if cardinality(v_modes) <> jsonb_array_length(p_fields -> 'modes') then
        raise exception 'a type twice';
      end if;
    exception when others then
      raise exception 'Choose at least one type of question for the examination' using errcode = '22023';
    end;
    if p_exam is not null then
      -- A type that still has sections stays (a section set before this step counts by its questions).
      select u.kind into v_used
        from (
          select s.mode as kind from public.exam_sections s where s.exam_id = p_exam and s.archived_at is null and s.mode is not null
          union
          select q.kind from public.exam_questions q join public.exam_sections s on s.id = q.section_id
           where q.exam_id = p_exam and q.archived_at is null and s.archived_at is null and s.mode is null
        ) u
       where not (u.kind = any (v_modes))
       order by u.kind
       limit 1;
      if v_used is not null then
        raise exception 'Remove the % sections first', private.exam_mode_label(v_used) using errcode = '22023';
      end if;
    end if;
  end if;

  perform set_config('app.actor_id', p_actor::text, true);
  if p_exam is null then
    select g.id into v_category from public.grade_categories g where g.course_id = p_course and g.part = 'EXAMINATIONS' and g.archived_at is null;
    if v_category is null then
      raise exception 'Switch this course to the three parts first' using errcode = '22023';
    end if;
    insert into public.examinations (course_id, category_id, title, description, instructions, pass_mark, opens_at, closes_at, created_by, modes)
    values (p_course, v_category, v_title, coalesce(p_fields ->> 'description', ''), coalesce(p_fields ->> 'instructions', ''), v_pass, v_opens, v_closes, p_actor,
            coalesce(v_modes, '{MCQ,SHORT,ESSAY}'))
    returning id into v_id;
    perform private.write_audit('exam.created', 'examination', v_id::text, jsonb_build_object('course_id', p_course, 'title', v_title));
  else
    update public.examinations
       set title = v_title, description = coalesce(p_fields ->> 'description', ''), instructions = coalesce(p_fields ->> 'instructions', ''),
           pass_mark = v_pass, opens_at = v_opens, closes_at = v_closes, modes = coalesce(v_modes, modes)
     where id = p_exam
    returning id into v_id;
    perform private.write_audit('exam.updated', 'examination', v_id::text, jsonb_build_object('course_id', p_course, 'title', v_title));
  end if;
  return v_id;
end;
$$;

/**
 * Replaces the examination's sections and questions (before any learner starts): p_sections is a list of
 * {title, mode, instructions?, questions: [{prompt, marks, options {A,B,C,D} and correct (multiple
 * choice), guide (short answer or essay)}]}. Since migration 46 every section has one type (mode), one of
 * the examination's types, and all its questions are of it. Earlier sections and questions are archived,
 * never deleted. Returns how many questions it has.
 */
create or replace function public.exam_structure_save(p_actor uuid, p_as_admin boolean, p_exam uuid, p_sections jsonb) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations := private.exam_for_manager(p_actor, p_as_admin, p_exam);
  v_section jsonb;
  v_q jsonb;
  v_section_id uuid;
  v_question_id uuid;
  v_spos integer := 0;
  v_qpos integer := 0;
  v_mode public.exam_question_kind;
  v_kind public.exam_question_kind;
  v_marks numeric;
begin
  if private.exam_started(p_exam) then
    raise exception 'This examination has started, so its questions cannot change' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sections) is distinct from 'array' or jsonb_array_length(p_sections) not between 1 and 20 then
    raise exception 'Give the examination 1 to 20 sections' using errcode = '22023';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  update public.exam_questions set archived_at = now() where exam_id = p_exam and archived_at is null;
  update public.exam_sections set archived_at = now() where exam_id = p_exam and archived_at is null;
  for v_section in select value from jsonb_array_elements(p_sections) loop
    v_spos := v_spos + 1;
    if char_length(btrim(coalesce(v_section ->> 'title', ''))) not between 1 and 200 then
      raise exception 'Give each section a title of up to 200 characters' using errcode = '22023';
    end if;
    if jsonb_typeof(v_section -> 'questions') is distinct from 'array' or jsonb_array_length(v_section -> 'questions') = 0 then
      raise exception 'Give each section at least one question' using errcode = '22023';
    end if;
    -- The section's one type: named, or its questions' kind when they all agree.
    begin
      v_mode := nullif(v_section ->> 'mode', '')::public.exam_question_kind;
      if v_mode is null then
        v_mode := nullif(v_section -> 'questions' -> 0 ->> 'kind', '')::public.exam_question_kind;
      end if;
      if v_mode is null or exists (
           select 1 from jsonb_array_elements(v_section -> 'questions') q
            where nullif(q ->> 'kind', '') is not null and (q ->> 'kind')::public.exam_question_kind <> v_mode) then
        raise exception 'mixed';
      end if;
    exception when others then
      raise exception 'Give each section one type of question' using errcode = '22023';
    end;
    if not (v_mode = any (v.modes)) then
      raise exception 'This examination does not include % questions', private.exam_mode_label(v_mode) using errcode = '22023';
    end if;
    insert into public.exam_sections (exam_id, title, instructions, position, mode)
    values (p_exam, btrim(v_section ->> 'title'), coalesce(v_section ->> 'instructions', ''), v_spos, v_mode)
    returning id into v_section_id;
    v_kind := v_mode;
    for v_q in select value from jsonb_array_elements(v_section -> 'questions') loop
      v_qpos := v_qpos + 1;
      if v_qpos > 200 then
        raise exception 'An examination has at most 200 questions' using errcode = '22023';
      end if;
      begin
        v_marks := (v_q ->> 'marks')::numeric;
      exception when others then
        raise exception 'Give each question a type and its marks' using errcode = '22023';
      end;
      if char_length(btrim(coalesce(v_q ->> 'prompt', ''))) = 0 then
        raise exception 'Give each question a prompt' using errcode = '22023';
      end if;
      if v_marks is null or v_marks <= 0 or v_marks > 1000 or v_marks <> round(v_marks, 2) then
        raise exception 'Give each question marks above 0' using errcode = '22023';
      end if;
      if v_kind = 'MCQ' then
        if (select count(*) from unnest(array['A', 'B', 'C', 'D']) o where char_length(btrim(coalesce(v_q -> 'options' ->> o, ''))) > 0) <> 4 then
          raise exception 'Give each multiple-choice question four options, A to D' using errcode = '22023';
        end if;
        if coalesce(v_q ->> 'correct', '') not in ('A', 'B', 'C', 'D') then
          raise exception 'Choose the correct answer for each multiple-choice question' using errcode = '22023';
        end if;
      end if;
      insert into public.exam_questions (exam_id, section_id, kind, prompt, option_a, option_b, option_c, option_d, marks, position)
      values (p_exam, v_section_id, v_kind, btrim(v_q ->> 'prompt'),
              case when v_kind = 'MCQ' then btrim(v_q -> 'options' ->> 'A') end, case when v_kind = 'MCQ' then btrim(v_q -> 'options' ->> 'B') end,
              case when v_kind = 'MCQ' then btrim(v_q -> 'options' ->> 'C') end, case when v_kind = 'MCQ' then btrim(v_q -> 'options' ->> 'D') end,
              v_marks, v_qpos)
      returning id into v_question_id;
      insert into public.exam_question_keys (question_id, correct_option, marking_guide)
      values (v_question_id, case when v_kind = 'MCQ' then v_q ->> 'correct' end, coalesce(v_q ->> 'guide', ''));
    end loop;
  end loop;
  perform private.write_audit('exam.questions_saved', 'examination', p_exam::text,
    jsonb_build_object('questions', v_qpos, 'total', private.exam_total(p_exam)));
  return v_qpos;
end;
$$;
