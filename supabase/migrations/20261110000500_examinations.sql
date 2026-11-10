-- Phase 10.1, migration 34 (ADR-016; owner request and answers of 2026-11-10): end-of-course
-- examinations.
-- - An examination belongs to a course and counts in its Final examinations part. It has an opening and
--   a closing time (enforced here, in database time, never in the browser), a pass mark (%), sections and
--   questions: multiple choice (four options A to D, one correct, marked on submission and final), short
--   answer (with a marking guide) and essay. No countdown timer: the deadline is the only limit.
-- - Learners never read these tables. They use my_exams and my_exam, which carry no correct answer or
--   marking guide (those live in exam_question_keys, for the course's managers only), and their scores
--   only once released. Staff read through RLS and exam_results / exam_script.
-- - Once a learner has started, only the deadline changes. Saved answers outlive the deadline for the
--   lecturer. A retake is a new attempt (the earlier ones stay); the latest released attempt counts.
-- - Nothing is deleted: examinations, sections and questions are archived; attempts, answers and the
--   history are kept for ever.
-- - The course grade: examinations join calculate_course_grades as cells of the Final examinations part
--   (the D13 formula unchanged), and course-wide Review and release includes their marked results.

create type public.exam_question_kind as enum ('MCQ', 'SHORT', 'ESSAY');
create type public.exam_attempt_status as enum ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED');
create type public.exam_event as enum ('SUBMITTED', 'MARKED', 'FEEDBACK', 'RELEASED', 'RETAKE_AUTHORISED');

-- A released examination result is notified like a grade (New grade available, ADR-014), pointing at the examination.
alter table public.notifications drop constraint notifications_related_entity_type_check;
alter table public.notifications add constraint notifications_related_entity_type_check
  check (related_entity_type in ('assignment', 'course', 'submission', 'examination'));

-- ---------------------------------------------------------------- tables
create table public.examinations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  category_id uuid not null references public.grade_categories (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 3 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  instructions text not null default '' check (char_length(instructions) <= 20000),
  pass_mark integer not null default 50 check (pass_mark between 0 and 100),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  closed_at timestamptz,
  publication_status public.publication_status not null default 'DRAFT',
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint examinations_window check (closes_at > opens_at),
  constraint examinations_published_has_time check (publication_status <> 'PUBLISHED' or published_at is not null)
);
create index examinations_course_idx on public.examinations (course_id, opens_at);
comment on column public.examinations.closed_at is 'Set when a lecturer closes the examination early; it then overrides every deadline';

create table public.exam_sections (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.examinations (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  instructions text not null default '' check (char_length(instructions) <= 2000),
  position integer not null check (position > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index exam_sections_exam_idx on public.exam_sections (exam_id, position);

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.examinations (id) on delete restrict,
  section_id uuid not null references public.exam_sections (id) on delete restrict,
  kind public.exam_question_kind not null,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 10000),
  option_a text check (char_length(option_a) <= 1000),
  option_b text check (char_length(option_b) <= 1000),
  option_c text check (char_length(option_c) <= 1000),
  option_d text check (char_length(option_d) <= 1000),
  marks numeric(7, 2) not null check (marks > 0 and marks <= 1000),
  position integer not null check (position > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_questions_mcq_options check (
    kind <> 'MCQ' or (option_a is not null and option_b is not null and option_c is not null and option_d is not null)
  )
);
create index exam_questions_exam_idx on public.exam_questions (exam_id, position);

-- The correct answer and marking guide: the course's managers only (never a learner, D35).
create table public.exam_question_keys (
  question_id uuid primary key references public.exam_questions (id) on delete restrict,
  correct_option text check (correct_option in ('A', 'B', 'C', 'D')),
  marking_guide text not null default '' check (char_length(marking_guide) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exam_extensions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.examinations (id) on delete restrict,
  learner_id uuid not null references public.profiles (id) on delete restrict,
  closes_at timestamptz not null,
  granted_by uuid not null references public.profiles (id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 1000),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_extensions_exam_learner_key unique (exam_id, learner_id)
);

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.examinations (id) on delete restrict,
  learner_id uuid not null references public.profiles (id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  status public.exam_attempt_status not null default 'NOT_STARTED',
  started_at timestamptz,
  submitted_at timestamptz,
  retake_reason text check (retake_reason is null or char_length(retake_reason) <= 1000),
  retake_authorised_by uuid references public.profiles (id) on delete restrict,
  feedback text check (feedback is null or char_length(feedback) <= 10000),
  grade_release_status public.grade_release_status not null default 'DRAFT',
  released_score numeric(7, 2),
  released_feedback text,
  -- what the learner sees per question once released: {question_id: {score, feedback}}
  released_answers jsonb,
  released_at timestamptz,
  released_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_attempts_number_key unique (exam_id, learner_id, attempt_number),
  constraint exam_attempts_submitted_has_time check (status <> 'SUBMITTED' or submitted_at is not null)
);
create index exam_attempts_learner_idx on public.exam_attempts (learner_id);

create table public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts (id) on delete restrict,
  question_id uuid not null references public.exam_questions (id) on delete restrict,
  selected_option text check (selected_option in ('A', 'B', 'C', 'D')),
  text_answer text not null default '' check (char_length(text_answer) <= 50000),
  score numeric(7, 2) check (score is null or score >= 0),
  auto_marked boolean not null default false,
  feedback text check (feedback is null or char_length(feedback) <= 10000),
  marked_by uuid references public.profiles (id) on delete restrict,
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_answers_attempt_question_key unique (attempt_id, question_id)
);

create table public.exam_grade_history (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts (id) on delete restrict,
  question_id uuid references public.exam_questions (id) on delete restrict,
  event public.exam_event not null,
  previous_score numeric(7, 2),
  new_score numeric(7, 2),
  reason text check (reason is null or char_length(reason) between 1 and 1000),
  changed_by uuid not null references public.profiles (id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp()
);
create index exam_grade_history_attempt_idx on public.exam_grade_history (attempt_id, changed_at);
comment on table public.exam_grade_history is 'Every submission, mark, release and retake of an examination: never updated or deleted.';

create trigger exam_grade_history_keep before update or delete on public.exam_grade_history
  for each row execute function private.keep_grade_history();
create trigger exam_grade_history_keep_truncate before truncate on public.exam_grade_history
  for each statement execute function private.keep_grade_history();

create trigger examinations_set_updated_at before update on public.examinations for each row execute function private.set_updated_at();
create trigger exam_sections_set_updated_at before update on public.exam_sections for each row execute function private.set_updated_at();
create trigger exam_questions_set_updated_at before update on public.exam_questions for each row execute function private.set_updated_at();
create trigger exam_question_keys_set_updated_at before update on public.exam_question_keys for each row execute function private.set_updated_at();
create trigger exam_extensions_set_updated_at before update on public.exam_extensions for each row execute function private.set_updated_at();
create trigger exam_attempts_set_updated_at before update on public.exam_attempts for each row execute function private.set_updated_at();
create trigger exam_answers_set_updated_at before update on public.exam_answers for each row execute function private.set_updated_at();

/** An examination sits in its course's Final examinations part and never moves to another course. */
create function private.examinations_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  if tg_op = 'UPDATE' and new.course_id is distinct from old.course_id then
    raise exception 'An examination cannot move to another course' using errcode = '22023';
  end if;
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not exists (select 1 from public.grade_categories g
                      where g.id = new.category_id and g.course_id = new.course_id and g.part = 'EXAMINATIONS' and g.archived_at is null) then
    raise exception 'An examination counts in its course''s Final examinations part' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger examinations_guard before insert or update on public.examinations for each row execute function private.examinations_guard();
revoke execute on function private.examinations_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------- RLS: the course's managers read; nobody writes directly
alter table public.examinations enable row level security;
alter table public.exam_sections enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_question_keys enable row level security;
alter table public.exam_extensions enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_answers enable row level security;
alter table public.exam_grade_history enable row level security;
revoke all on public.examinations, public.exam_sections, public.exam_questions, public.exam_question_keys, public.exam_extensions,
  public.exam_attempts, public.exam_answers, public.exam_grade_history from anon, authenticated, service_role;
grant select on public.examinations, public.exam_sections, public.exam_questions, public.exam_question_keys, public.exam_extensions,
  public.exam_attempts, public.exam_answers, public.exam_grade_history to authenticated, service_role;

create policy examinations_managers_read on public.examinations for select to authenticated using (private.can_manage_course(course_id));
create policy exam_sections_managers_read on public.exam_sections for select to authenticated
  using (exists (select 1 from public.examinations x where x.id = exam_id and private.can_manage_course(x.course_id)));
create policy exam_questions_managers_read on public.exam_questions for select to authenticated
  using (exists (select 1 from public.examinations x where x.id = exam_id and private.can_manage_course(x.course_id)));
create policy exam_question_keys_managers_read on public.exam_question_keys for select to authenticated
  using (exists (select 1 from public.exam_questions q join public.examinations x on x.id = q.exam_id
                  where q.id = question_id and private.can_manage_course(x.course_id)));
create policy exam_extensions_managers_read on public.exam_extensions for select to authenticated
  using (exists (select 1 from public.examinations x where x.id = exam_id and private.can_manage_course(x.course_id)));
create policy exam_attempts_managers_read on public.exam_attempts for select to authenticated
  using (exists (select 1 from public.examinations x where x.id = exam_id and private.can_manage_course(x.course_id)));
create policy exam_answers_managers_read on public.exam_answers for select to authenticated
  using (exists (select 1 from public.exam_attempts a join public.examinations x on x.id = a.exam_id
                  where a.id = attempt_id and private.can_manage_course(x.course_id)));
create policy exam_grade_history_managers_read on public.exam_grade_history for select to authenticated
  using (exists (select 1 from public.exam_attempts a join public.examinations x on x.id = a.exam_id
                  where a.id = attempt_id and private.can_manage_course(x.course_id)));

-- ---------------------------------------------------------------- helpers
/** The examination's total: the sum of its current questions' marks. */
create function private.exam_total(p_exam uuid) returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(q.marks), 0) from public.exam_questions q where q.exam_id = p_exam and q.archived_at is null;
$$;

/** When the examination closes for this learner: an early close overrides everything; else their extension, else the deadline. */
create function private.exam_close_for(p_exam uuid, p_learner uuid) returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(x.closed_at,
                  (select e.closes_at from public.exam_extensions e where e.exam_id = x.id and e.learner_id = p_learner and e.revoked_at is null),
                  x.closes_at)
    from public.examinations x where x.id = p_exam;
$$;

/** Whether any learner has started the examination (then its questions are locked). */
create function private.exam_started(p_exam uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.exam_attempts a where a.exam_id = p_exam and a.status <> 'NOT_STARTED');
$$;

/** The examination, after checking the actor manages its course (and it is not archived read-only). */
create function private.exam_for_manager(p_actor uuid, p_as_admin boolean, p_exam uuid) returns public.examinations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations;
begin
  select * into v from public.examinations where id = p_exam;
  if not found then
    raise exception 'Examination not found' using errcode = 'P0002';
  end if;
  perform private.require_lesson_actor(p_actor, p_as_admin, v.course_id);
  return v;
end;
$$;

/** The learner's latest attempt, if any. */
create function private.exam_latest_attempt(p_exam uuid, p_learner uuid) returns public.exam_attempts
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.exam_attempts a where a.exam_id = p_exam and a.learner_id = p_learner order by a.attempt_number desc limit 1;
$$;

/** The latest attempt the lecturer can mark: submitted, or still open when the examination closed for this learner. */
create function private.exam_markable_attempt(p_exam uuid, p_learner uuid) returns public.exam_attempts
language sql
stable
security definer
set search_path = ''
as $$
  select a.* from public.exam_attempts a
   where a.exam_id = p_exam and a.learner_id = p_learner
     and (a.status = 'SUBMITTED' or (a.status = 'IN_PROGRESS' and now() >= private.exam_close_for(p_exam, p_learner)))
   order by a.attempt_number desc limit 1;
$$;

/**
 * An attempt's scores by kind, from the stored marks; a multiple-choice question not yet marked is
 * worked out from its key (so a script left unsubmitted reads correctly). unmarked counts the short and
 * essay questions still waiting for a mark.
 */
create function private.exam_attempt_scores(p_attempt uuid)
returns table (mcq numeric, short numeric, essay numeric, total numeric, unmarked integer)
language sql
stable
security definer
set search_path = ''
as $$
  with a as (select * from public.exam_attempts where id = p_attempt), qs as (
    select q.id, q.kind, q.marks, k.correct_option, w.selected_option, w.score, w.text_answer
      from a
      join public.exam_questions q on q.exam_id = a.exam_id and q.archived_at is null
      left join public.exam_question_keys k on k.question_id = q.id
      left join public.exam_answers w on w.attempt_id = a.id and w.question_id = q.id
  ), scored as (
    select kind,
           case
             when score is not null then score
             when kind = 'MCQ' then case when selected_option is not null and selected_option = correct_option then marks else 0 end
           end as s
      from qs
  )
  select coalesce(sum(s) filter (where kind = 'MCQ'), 0),
         coalesce(sum(s) filter (where kind = 'SHORT'), 0),
         coalesce(sum(s) filter (where kind = 'ESSAY'), 0),
         coalesce(sum(s), 0),
         (count(*) filter (where s is null))::int
    from scored;
$$;

/**
 * Marks an attempt's multiple-choice answers from the keys (stored, final) and gives 0 to a short or
 * essay question left blank (no text, no recording), so only real answers wait for the lecturer.
 */
create function private.exam_auto_mark(p_attempt uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.exam_attempts;
begin
  select * into v from public.exam_attempts where id = p_attempt;
  insert into public.exam_answers (attempt_id, question_id)
  select v.id, q.id from public.exam_questions q where q.exam_id = v.exam_id and q.archived_at is null
  on conflict on constraint exam_answers_attempt_question_key do nothing;
  update public.exam_answers w
     set score = case when w.selected_option is not null and w.selected_option = k.correct_option then q.marks else 0 end,
         auto_marked = true, marked_at = clock_timestamp()
    from public.exam_questions q
    left join public.exam_question_keys k on k.question_id = q.id
   where w.attempt_id = v.id and w.question_id = q.id and q.kind = 'MCQ' and w.score is null;
  update public.exam_answers w
     set score = 0, auto_marked = true, marked_at = clock_timestamp()
    from public.exam_questions q
   where w.attempt_id = v.id and w.question_id = q.id and q.kind in ('SHORT', 'ESSAY') and w.score is null
     and btrim(w.text_answer) = '';
end;
$$;

revoke execute on function private.exam_total(uuid), private.exam_close_for(uuid, uuid), private.exam_started(uuid),
  private.exam_for_manager(uuid, boolean, uuid), private.exam_latest_attempt(uuid, uuid), private.exam_markable_attempt(uuid, uuid),
  private.exam_attempt_scores(uuid), private.exam_auto_mark(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- setting an examination (the course's lecturers and AAL2 administrators)
/** Creates (p_exam null) or updates an examination's details. Once a learner has started, only the deadline changes. */
create function public.exam_save(p_actor uuid, p_as_admin boolean, p_course uuid, p_exam uuid, p_fields jsonb) returns uuid
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
  perform set_config('app.actor_id', p_actor::text, true);
  if p_exam is null then
    select g.id into v_category from public.grade_categories g where g.course_id = p_course and g.part = 'EXAMINATIONS' and g.archived_at is null;
    if v_category is null then
      raise exception 'Switch this course to the three parts first' using errcode = '22023';
    end if;
    insert into public.examinations (course_id, category_id, title, description, instructions, pass_mark, opens_at, closes_at, created_by)
    values (p_course, v_category, v_title, coalesce(p_fields ->> 'description', ''), coalesce(p_fields ->> 'instructions', ''), v_pass, v_opens, v_closes, p_actor)
    returning id into v_id;
    perform private.write_audit('exam.created', 'examination', v_id::text, jsonb_build_object('course_id', p_course, 'title', v_title));
  else
    update public.examinations
       set title = v_title, description = coalesce(p_fields ->> 'description', ''), instructions = coalesce(p_fields ->> 'instructions', ''),
           pass_mark = v_pass, opens_at = v_opens, closes_at = v_closes
     where id = p_exam
    returning id into v_id;
    perform private.write_audit('exam.updated', 'examination', v_id::text, jsonb_build_object('course_id', p_course, 'title', v_title));
  end if;
  return v_id;
end;
$$;

/**
 * Replaces the examination's sections and questions (before any learner starts): p_sections is a list of
 * {title, instructions?, questions: [{kind, prompt, marks, options {A,B,C,D} and correct (multiple
 * choice), guide (short answer or essay)}]}. Earlier sections and questions are archived, never deleted.
 * Returns how many questions it has.
 */
create function public.exam_structure_save(p_actor uuid, p_as_admin boolean, p_exam uuid, p_sections jsonb) returns integer
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
    insert into public.exam_sections (exam_id, title, instructions, position)
    values (p_exam, btrim(v_section ->> 'title'), coalesce(v_section ->> 'instructions', ''), v_spos)
    returning id into v_section_id;
    if jsonb_typeof(v_section -> 'questions') is distinct from 'array' or jsonb_array_length(v_section -> 'questions') = 0 then
      raise exception 'Give each section at least one question' using errcode = '22023';
    end if;
    for v_q in select value from jsonb_array_elements(v_section -> 'questions') loop
      v_qpos := v_qpos + 1;
      if v_qpos > 200 then
        raise exception 'An examination has at most 200 questions' using errcode = '22023';
      end if;
      begin
        v_kind := (v_q ->> 'kind')::public.exam_question_kind;
        v_marks := (v_q ->> 'marks')::numeric;
      exception when others then
        raise exception 'Give each question a type and its marks' using errcode = '22023';
      end;
      if v_kind is null then
        raise exception 'Give each question a type and its marks' using errcode = '22023';
      end if;
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

/** Publishes (with at least one question, closing in the future) or unpublishes (only before anyone starts). */
create function public.exam_publish(p_actor uuid, p_as_admin boolean, p_exam uuid, p_publish boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations := private.exam_for_manager(p_actor, p_as_admin, p_exam);
begin
  perform set_config('app.actor_id', p_actor::text, true);
  if p_publish then
    if not exists (select 1 from public.exam_questions q where q.exam_id = p_exam and q.archived_at is null) then
      raise exception 'Add at least one question before publishing' using errcode = '22023';
    end if;
    if private.exam_close_for(p_exam, null) <= now() then
      raise exception 'The closing time has passed; set a later one' using errcode = '22023';
    end if;
    update public.examinations set publication_status = 'PUBLISHED', published_at = coalesce(published_at, now()) where id = p_exam;
    perform private.write_audit('exam.published', 'examination', p_exam::text, jsonb_build_object('course_id', v.course_id));
  else
    if private.exam_started(p_exam) then
      raise exception 'Learners have started this examination, so it stays published' using errcode = '22023';
    end if;
    update public.examinations set publication_status = 'DRAFT' where id = p_exam;
    perform private.write_audit('exam.unpublished', 'examination', p_exam::text, jsonb_build_object('course_id', v.course_id));
  end if;
end;
$$;

/** Archives or restores an examination (never deleted; its attempts and released results are kept). */
create function public.exam_set_archived(p_actor uuid, p_as_admin boolean, p_exam uuid, p_archived boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations := private.exam_for_manager(p_actor, p_as_admin, p_exam);
begin
  perform set_config('app.actor_id', p_actor::text, true);
  update public.examinations set archived_at = case when p_archived then now() end where id = p_exam;
  perform private.write_audit(case when p_archived then 'exam.archived' else 'exam.restored' end, 'examination', p_exam::text, jsonb_build_object('course_id', v.course_id));
end;
$$;

/** Sets a new deadline for everyone (later than the opening and in the future); reopens an examination closed early. */
create function public.exam_set_deadline(p_actor uuid, p_as_admin boolean, p_exam uuid, p_closes_at timestamptz, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations := private.exam_for_manager(p_actor, p_as_admin, p_exam);
begin
  if p_closes_at is null or p_closes_at <= v.opens_at or p_closes_at <= now() then
    raise exception 'The new deadline must be after the opening time and in the future' using errcode = '22023';
  end if;
  if char_length(coalesce(p_reason, '')) > 1000 then
    raise exception 'Keep the reason to 1,000 characters' using errcode = '22023';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  update public.examinations set closes_at = p_closes_at, closed_at = null where id = p_exam;
  perform private.write_audit('exam.deadline_changed', 'examination', p_exam::text,
    jsonb_build_object('course_id', v.course_id, 'from', v.closes_at, 'to', p_closes_at, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

/** Closes the examination now for everyone (extensions included). */
create function public.exam_close(p_actor uuid, p_as_admin boolean, p_exam uuid, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations := private.exam_for_manager(p_actor, p_as_admin, p_exam);
begin
  perform set_config('app.actor_id', p_actor::text, true);
  update public.examinations set closed_at = now() where id = p_exam;
  perform private.write_audit('exam.closed', 'examination', p_exam::text,
    jsonb_build_object('course_id', v.course_id, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

/** Gives one learner a later deadline (or changes it). */
create function public.exam_extension_set(p_actor uuid, p_as_admin boolean, p_exam uuid, p_learner uuid, p_closes_at timestamptz, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations := private.exam_for_manager(p_actor, p_as_admin, p_exam);
begin
  if not exists (select 1 from public.course_enrollments e where e.course_id = v.course_id and e.learner_id = p_learner and e.enrolment_status <> 'WITHDRAWN') then
    raise exception 'This learner is not in the course' using errcode = '22023';
  end if;
  if p_closes_at is null or p_closes_at <= now() then
    raise exception 'The new deadline must be in the future' using errcode = '22023';
  end if;
  if char_length(coalesce(p_reason, '')) > 1000 then
    raise exception 'Keep the reason to 1,000 characters' using errcode = '22023';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  insert into public.exam_extensions (exam_id, learner_id, closes_at, granted_by, reason)
  values (p_exam, p_learner, p_closes_at, p_actor, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict on constraint exam_extensions_exam_learner_key
  do update set closes_at = excluded.closes_at, granted_by = excluded.granted_by, reason = excluded.reason, revoked_at = null;
  perform private.write_audit('exam.extension_set', 'examination', p_exam::text,
    jsonb_build_object('course_id', v.course_id, 'learner_id', p_learner, 'to', p_closes_at, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

/** Takes back one learner's extension. */
create function public.exam_extension_remove(p_actor uuid, p_as_admin boolean, p_exam uuid, p_learner uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations := private.exam_for_manager(p_actor, p_as_admin, p_exam);
begin
  perform set_config('app.actor_id', p_actor::text, true);
  update public.exam_extensions set revoked_at = now() where exam_id = p_exam and learner_id = p_learner and revoked_at is null;
  perform private.write_audit('exam.extension_removed', 'examination', p_exam::text, jsonb_build_object('course_id', v.course_id, 'learner_id', p_learner));
end;
$$;

-- ---------------------------------------------------------------- taking an examination (the learner, through exam-attempt)
/** The learner's right to the examination now: enrolled (active), course and examination open. Raises otherwise. */
create function private.exam_for_learner(p_actor uuid, p_exam uuid) returns public.examinations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations;
  v_enrolment public.enrolment_status;
  v_course public.course_status;
begin
  select * into v from public.examinations where id = p_exam;
  if not found or v.publication_status <> 'PUBLISHED' or v.archived_at is not null then
    raise exception 'Examination not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor and role = 'LEARNER' and account_status = 'ACTIVE') then
    raise exception 'Your account cannot take examinations' using errcode = '42501';
  end if;
  select e.enrolment_status into v_enrolment from public.course_enrollments e
   where e.course_id = v.course_id and e.learner_id = p_actor and e.enrolment_status in ('ACTIVE', 'COMPLETED')
   order by e.enrolled_at desc limit 1;
  if v_enrolment is null then
    raise exception 'You are not enrolled in this course' using errcode = '42501';
  end if;
  select c.status into v_course from public.courses c where c.id = v.course_id;
  if v_enrolment = 'COMPLETED' or v_course <> 'PUBLISHED' then
    raise exception 'This course is read-only for you' using errcode = '22023';
  end if;
  return v;
end;
$$;
revoke execute on function private.exam_for_learner(uuid, uuid) from public, anon, authenticated;

/** Starts (or returns) the learner's current attempt, once the examination is open and before their deadline. */
create function public.exam_start(p_actor uuid, p_exam uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations := private.exam_for_learner(p_actor, p_exam);
  a public.exam_attempts;
  v_id uuid;
begin
  if now() < v.opens_at then
    raise exception 'This examination is not open yet' using errcode = '22023';
  end if;
  perform 1 from public.examinations where id = p_exam for update;
  a := private.exam_latest_attempt(p_exam, p_actor);
  if a.id is not null and a.status = 'SUBMITTED' then
    raise exception 'You have already submitted this examination' using errcode = '22023';
  end if;
  if now() >= private.exam_close_for(p_exam, p_actor) then
    raise exception 'The deadline for this examination has passed' using errcode = '22023';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  if a.id is not null and a.status = 'IN_PROGRESS' then
    return a.id;
  end if;
  if a.id is not null then
    update public.exam_attempts set status = 'IN_PROGRESS', started_at = now() where id = a.id returning id into v_id;
  else
    insert into public.exam_attempts (exam_id, learner_id, attempt_number, status, started_at) values (p_exam, p_actor, 1, 'IN_PROGRESS', now())
    returning id into v_id;
  end if;
  perform private.write_audit('exam.started', 'exam_attempt', v_id::text, jsonb_build_object('exam_id', p_exam));
  return v_id;
end;
$$;

/** The open attempt the learner may write to now, or the reason they may not. */
create function private.exam_open_attempt(p_actor uuid, p_exam uuid) returns public.exam_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.exam_attempts;
begin
  perform private.exam_for_learner(p_actor, p_exam);
  select * into a from public.exam_attempts x where x.exam_id = p_exam and x.learner_id = p_actor order by x.attempt_number desc limit 1 for update;
  if a.id is null or a.status = 'NOT_STARTED' then
    raise exception 'Start the examination first' using errcode = '22023';
  end if;
  if a.status = 'SUBMITTED' then
    raise exception 'You have already submitted this examination' using errcode = '22023';
  end if;
  if now() >= private.exam_close_for(p_exam, p_actor) then
    raise exception 'The deadline for this examination has passed' using errcode = '22023';
  end if;
  return a;
end;
$$;
revoke execute on function private.exam_open_attempt(uuid, uuid) from public, anon, authenticated;

/**
 * Saves the learner's answers as they go (autosave): [{question_id, selected_option (A to D, multiple
 * choice), text_answer (short answer or essay)}]. Only this examination's current questions, only
 * before the deadline and before submitting. Returns when it was saved.
 */
create function public.exam_save_answers(p_actor uuid, p_exam uuid, p_answers jsonb) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.exam_attempts := private.exam_open_attempt(p_actor, p_exam);
  v_item jsonb;
  v_q public.exam_questions;
begin
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) > 200 then
    raise exception 'Send the answers as a list' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_answers) loop
    select * into v_q from public.exam_questions q
     where q.id::text = v_item ->> 'question_id' and q.exam_id = p_exam and q.archived_at is null;
    if not found then
      raise exception 'That question is not in this examination' using errcode = '22023';
    end if;
    if v_q.kind = 'MCQ' and nullif(v_item ->> 'selected_option', '') is not null and (v_item ->> 'selected_option') not in ('A', 'B', 'C', 'D') then
      raise exception 'Choose A, B, C or D' using errcode = '22023';
    end if;
    if char_length(coalesce(v_item ->> 'text_answer', '')) > 50000 then
      raise exception 'Keep each answer to 50,000 characters' using errcode = '22023';
    end if;
    insert into public.exam_answers (attempt_id, question_id, selected_option, text_answer)
    values (a.id, v_q.id,
            case when v_q.kind = 'MCQ' then nullif(v_item ->> 'selected_option', '') end,
            case when v_q.kind = 'MCQ' then '' else coalesce(v_item ->> 'text_answer', '') end)
    on conflict on constraint exam_answers_attempt_question_key
    do update set selected_option = excluded.selected_option, text_answer = excluded.text_answer;
  end loop;
  return now();
end;
$$;

/** Submits the learner's examination (once, before the deadline): multiple choice is marked there and then. */
create function public.exam_submit(p_actor uuid, p_exam uuid)
returns table (attempt_id uuid, status public.exam_attempt_status, submitted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.exam_attempts := private.exam_open_attempt(p_actor, p_exam);
begin
  perform set_config('app.actor_id', p_actor::text, true);
  perform private.exam_auto_mark(a.id);
  update public.exam_attempts x set status = 'SUBMITTED', submitted_at = now() where x.id = a.id;
  insert into public.exam_grade_history (attempt_id, event, changed_by) values (a.id, 'SUBMITTED', p_actor);
  perform private.write_audit('exam.submitted', 'exam_attempt', a.id::text, jsonb_build_object('exam_id', p_exam, 'attempt_number', a.attempt_number));
  return query select a.id, 'SUBMITTED'::public.exam_attempt_status, now();
end;
$$;

-- ---------------------------------------------------------------- what the learner reads
/**
 * The signed-in learner's examinations in a course (published, current), each with when it opens and
 * closes for them, its total and pass mark, where they stand (UPCOMING, OPEN, IN_PROGRESS, SUBMITTED,
 * NOT_SUBMITTED, CLOSED) and their latest released result. Nothing for anyone not enrolled.
 */
create function public.my_exams(p_course uuid)
returns table (
  id uuid, title text, description text, opens_at timestamptz, closes_at timestamptz, total_marks numeric, pass_mark integer,
  state text, attempt_number integer, submitted_at timestamptz,
  released boolean, total_score numeric, percentage numeric, passed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select x.id, x.title, x.description, x.opens_at, private.exam_close_for(x.id, me.id), private.exam_total(x.id), x.pass_mark,
         case
           when now() < x.opens_at then 'UPCOMING'
           when cur.status = 'SUBMITTED' then 'SUBMITTED'
           when now() >= private.exam_close_for(x.id, me.id) then case when cur.status = 'IN_PROGRESS' then 'NOT_SUBMITTED' else 'CLOSED' end
           when cur.status = 'IN_PROGRESS' then 'IN_PROGRESS'
           else 'OPEN'
         end,
         cur.attempt_number, cur.submitted_at,
         rel.id is not null, rel.released_score,
         f.percentage, case when f.percentage is not null then f.percentage >= x.pass_mark end
    from (select (select auth.uid()) as id) me
    join public.examinations x on x.course_id = p_course and x.publication_status = 'PUBLISHED' and x.archived_at is null
    left join lateral (select * from public.exam_attempts a where a.exam_id = x.id and a.learner_id = me.id order by a.attempt_number desc limit 1) cur on true
    left join lateral (select * from public.exam_attempts a where a.exam_id = x.id and a.learner_id = me.id and a.released_at is not null
                        order by a.attempt_number desc limit 1) rel on true
    left join lateral private.grade_facts(rel.released_score, private.exam_total(x.id)) f on rel.id is not null
   where (select private.is_active_user())
     and exists (select 1 from public.course_enrollments e where e.course_id = p_course and e.learner_id = me.id and e.enrolment_status in ('ACTIVE', 'COMPLETED'))
   order by x.opens_at, x.title;
$$;

/**
 * One examination for the signed-in learner: its details, where they stand, and, once they have started,
 * its sections and questions with their own saved answers (never a correct answer or marking guide). Once
 * an attempt is released, its marks and feedback per question and its result.
 */
create function public.my_exam(p_exam uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id), x as (
    select e.* from public.examinations e, me
     where e.id = p_exam and e.publication_status = 'PUBLISHED' and e.archived_at is null and (select private.is_active_user())
       and exists (select 1 from public.course_enrollments c where c.course_id = e.course_id and c.learner_id = me.id and c.enrolment_status in ('ACTIVE', 'COMPLETED'))
  ), cur as (
    select a.* from public.exam_attempts a, me, x where a.exam_id = x.id and a.learner_id = me.id order by a.attempt_number desc limit 1
  ), rel as (
    select a.* from public.exam_attempts a, me, x where a.exam_id = x.id and a.learner_id = me.id and a.released_at is not null order by a.attempt_number desc limit 1
  ), shown as (
    -- the attempt whose answers are shown: the current one once started, otherwise the latest released one
    select * from cur where cur.status <> 'NOT_STARTED'
    union all
    select * from rel where not exists (select 1 from cur where cur.status <> 'NOT_STARTED')
  )
  select jsonb_build_object(
    'id', x.id, 'course_id', x.course_id, 'title', x.title, 'description', x.description, 'instructions', x.instructions,
    'opens_at', x.opens_at, 'closes_at', private.exam_close_for(x.id, (select id from me)),
    'total_marks', private.exam_total(x.id), 'pass_mark', x.pass_mark,
    'state', case
      when now() < x.opens_at then 'UPCOMING'
      when (select status from cur) = 'SUBMITTED' then 'SUBMITTED'
      when now() >= private.exam_close_for(x.id, (select id from me)) then case when (select status from cur) = 'IN_PROGRESS' then 'NOT_SUBMITTED' else 'CLOSED' end
      when (select status from cur) = 'IN_PROGRESS' then 'IN_PROGRESS'
      else 'OPEN'
    end,
    'attempt_number', (select attempt_number from cur), 'submitted_at', (select submitted_at from cur),
    'sections', case when exists (select 1 from shown) and now() >= x.opens_at then (
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'title', s.title, 'instructions', s.instructions,
               'questions', (select jsonb_agg(jsonb_build_object(
                                 'id', q.id, 'kind', q.kind, 'prompt', q.prompt, 'marks', q.marks,
                                 'options', case when q.kind = 'MCQ' then jsonb_build_object('A', q.option_a, 'B', q.option_b, 'C', q.option_c, 'D', q.option_d) end,
                                 'answer', jsonb_strip_nulls(jsonb_build_object(
                                   'selected_option', w.selected_option, 'text_answer', w.text_answer,
                                   'score', case when sh.released_at is not null then sh.released_answers -> q.id::text -> 'score' end,
                                   'feedback', case when sh.released_at is not null then sh.released_answers -> q.id::text -> 'feedback' end)))
                               order by q.position)
                               from public.exam_questions q
                               left join public.exam_answers w on w.attempt_id = sh.id and w.question_id = q.id
                              where q.section_id = s.id and q.archived_at is null))
             order by s.position)
        from public.exam_sections s, shown sh
       where s.exam_id = x.id and s.archived_at is null) end,
    'result', (select jsonb_build_object('attempt_number', r.attempt_number, 'total_score', r.released_score, 'total_marks', private.exam_total(x.id),
                                         'percentage', f.percentage, 'letter_grade', f.letter_grade, 'passed', f.percentage >= x.pass_mark,
                                         'feedback', r.released_feedback, 'released_at', r.released_at)
                 from rel r left join lateral private.grade_facts(r.released_score, private.exam_total(x.id)) f on true))
    from x;
$$;

-- ---------------------------------------------------------------- what the course's managers read
/**
 * Every counted learner's standing on the examination: their latest attempt (state NOT_STARTED,
 * IN_PROGRESS, SUBMITTED or NOT_SUBMITTED once their deadline passed), the multiple-choice, short-answer
 * and essay scores, total, percentage and pass or fail, the overall feedback, how far marking has got
 * (UNGRADED, PARTLY, GRADED) and the release. The course's lecturers and AAL2 administrators only.
 */
create function public.exam_results(p_exam uuid)
returns table (
  learner_id uuid, first_name text, second_name text, id_number integer, branch_name text, profile_image_path text,
  attempt_number integer, state text, started_at timestamptz, submitted_at timestamptz, closes_at timestamptz,
  mcq_score numeric, short_score numeric, essay_score numeric, total_score numeric, total_marks numeric, percentage numeric, passed boolean,
  feedback text, grading_state text, grade_release_status public.grade_release_status, released_at timestamptz, released_score numeric,
  changed_since_release boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with x as (
    select e.* from public.examinations e where e.id = p_exam and private.can_manage_course(e.course_id)
  ), learners as (
    select distinct c.learner_id from public.course_enrollments c, x where c.course_id = x.course_id and c.enrolment_status <> 'WITHDRAWN'
  )
  select p.id, p.first_name, p.second_name, p.id_number,
         (select b.name from public.branches b where b.id = p.branch_id),
         (select f.storage_path from public.file_objects f where f.id = p.profile_image_file_id and f.status = 'VALIDATED'),
         a.attempt_number,
         case
           when a.id is null or a.status = 'NOT_STARTED' then 'NOT_STARTED'
           when a.status = 'SUBMITTED' then 'SUBMITTED'
           when now() >= private.exam_close_for(x.id, p.id) then 'NOT_SUBMITTED'
           else 'IN_PROGRESS'
         end,
         a.started_at, a.submitted_at, private.exam_close_for(x.id, p.id),
         sc.mcq, sc.short, sc.essay, sc.total, private.exam_total(x.id),
         f.percentage, case when f.percentage is not null then f.percentage >= x.pass_mark end,
         a.feedback,
         case
           when sc.total is null then null
           when sc.unmarked = 0 then 'GRADED'
           when exists (select 1 from public.exam_answers w join public.exam_questions q on q.id = w.question_id
                         where w.attempt_id = a.id and q.kind <> 'MCQ' and w.score is not null and not w.auto_marked) then 'PARTLY'
           else 'UNGRADED'
         end,
         a.grade_release_status, a.released_at, a.released_score,
         coalesce(a.released_at is not null and (sc.total is distinct from a.released_score or a.feedback is distinct from a.released_feedback), false)
    from x
    cross join learners l
    join public.profiles p on p.id = l.learner_id
    left join lateral (select * from public.exam_attempts t where t.exam_id = x.id and t.learner_id = p.id order by t.attempt_number desc limit 1) a on true
    left join lateral (select * from private.exam_attempt_scores(a.id)) sc
           on a.id is not null and (a.status = 'SUBMITTED' or (a.status = 'IN_PROGRESS' and now() >= private.exam_close_for(x.id, p.id)))
    left join lateral private.grade_facts(sc.total, private.exam_total(x.id)) f on sc.total is not null
   order by p.first_name, p.second_name;
$$;

/**
 * One learner's script for marking: every section and question with its correct answer or marking guide,
 * and the learner's answer with its mark (multiple choice worked out from the key when not yet stored)
 * and feedback, for their latest attempt; plus each attempt's number, state and release. Managers only.
 */
create function public.exam_script(p_exam uuid, p_learner uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with x as (
    select e.* from public.examinations e where e.id = p_exam and private.can_manage_course(e.course_id)
  ), a as (
    select t.* from public.exam_attempts t, x where t.exam_id = x.id and t.learner_id = p_learner order by t.attempt_number desc limit 1
  )
  select jsonb_build_object(
    'exam_id', x.id, 'learner_id', p_learner, 'total_marks', private.exam_total(x.id), 'pass_mark', x.pass_mark,
    'attempt', (select jsonb_build_object('id', a.id, 'attempt_number', a.attempt_number, 'status', a.status, 'started_at', a.started_at,
                                          'submitted_at', a.submitted_at, 'feedback', a.feedback, 'grade_release_status', a.grade_release_status,
                                          'released_at', a.released_at, 'released_score', a.released_score, 'retake_reason', a.retake_reason) from a),
    'attempts', (select jsonb_agg(jsonb_build_object('attempt_number', t.attempt_number, 'status', t.status, 'submitted_at', t.submitted_at,
                                                     'released_score', t.released_score, 'released_at', t.released_at, 'retake_reason', t.retake_reason)
                                  order by t.attempt_number)
                   from public.exam_attempts t where t.exam_id = x.id and t.learner_id = p_learner),
    'sections', (
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'title', s.title, 'instructions', s.instructions,
               'questions', (select jsonb_agg(jsonb_build_object(
                                 'id', q.id, 'kind', q.kind, 'prompt', q.prompt, 'marks', q.marks,
                                 'options', case when q.kind = 'MCQ' then jsonb_build_object('A', q.option_a, 'B', q.option_b, 'C', q.option_c, 'D', q.option_d) end,
                                 'correct_option', k.correct_option, 'marking_guide', k.marking_guide,
                                 'answer', case when (select id from a) is not null then jsonb_build_object(
                                   'selected_option', w.selected_option, 'text_answer', coalesce(w.text_answer, ''),
                                   'score', coalesce(w.score, case when q.kind = 'MCQ' then case when w.selected_option = k.correct_option then q.marks else 0 end end),
                                   'auto_marked', coalesce(w.auto_marked, false) or (q.kind = 'MCQ'),
                                   'feedback', w.feedback) end)
                               order by q.position)
                               from public.exam_questions q
                               left join public.exam_question_keys k on k.question_id = q.id
                               left join public.exam_answers w on w.attempt_id = (select id from a) and w.question_id = q.id
                              where q.section_id = s.id and q.archived_at is null))
             order by s.position)
        from public.exam_sections s where s.exam_id = x.id and s.archived_at is null))
    from x;
$$;

-- ---------------------------------------------------------------- marking and release
/** The attempt to mark, with its multiple choice marked from the keys first. Raises when there is none. */
create function private.exam_attempt_for_marking(p_exam uuid, p_learner uuid) returns public.exam_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.exam_attempts := private.exam_markable_attempt(p_exam, p_learner);
begin
  if a.id is null then
    raise exception 'This learner has no examination to mark yet' using errcode = 'P0002';
  end if;
  perform 1 from public.exam_attempts where id = a.id for update;
  perform private.exam_auto_mark(a.id);
  return a;
end;
$$;
revoke execute on function private.exam_attempt_for_marking(uuid, uuid) from public, anon, authenticated;

/**
 * Marks one short-answer or essay answer (0 to the question's marks, up to two decimals) with optional
 * feedback. Multiple choice is marked automatically and is final. A released result changes only with a
 * reason, and the change waits to be released (the learner keeps seeing the released result).
 */
create function public.exam_answer_grade(
  p_actor uuid, p_as_admin boolean, p_exam uuid, p_learner uuid, p_question uuid, p_score numeric, p_feedback text, p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations := private.exam_for_manager(p_actor, p_as_admin, p_exam);
  q public.exam_questions;
  a public.exam_attempts;
  w public.exam_answers;
  v_feedback text := nullif(btrim(coalesce(p_feedback, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into q from public.exam_questions where id = p_question and exam_id = p_exam and archived_at is null;
  if not found then
    raise exception 'That question is not in this examination' using errcode = '22023';
  end if;
  if q.kind = 'MCQ' then
    raise exception 'Multiple-choice answers are marked automatically' using errcode = '22023';
  end if;
  if p_score is null or p_score < 0 or p_score > q.marks or p_score <> round(p_score, 2) then
    raise exception 'The score must be between 0 and %', trim_scale(q.marks) using errcode = '22023';
  end if;
  if char_length(v_feedback) > 10000 or char_length(v_reason) > 1000 then
    raise exception 'Keep the feedback to 10,000 characters and the reason to 1,000' using errcode = '22023';
  end if;
  a := private.exam_attempt_for_marking(p_exam, p_learner);
  select * into w from public.exam_answers where attempt_id = a.id and question_id = p_question;
  if w.score is not distinct from p_score and w.feedback is not distinct from v_feedback and not w.auto_marked then
    return;
  end if;
  if a.released_at is not null and v_reason is null then
    raise exception 'Give a reason for changing a released result' using errcode = '22023';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  update public.exam_answers
     set score = p_score, feedback = v_feedback, auto_marked = false, marked_by = p_actor, marked_at = clock_timestamp()
   where id = w.id;
  update public.exam_attempts set grade_release_status = 'DRAFT' where id = a.id;
  insert into public.exam_grade_history (attempt_id, question_id, event, previous_score, new_score, reason, changed_by)
  values (a.id, p_question, 'MARKED', w.score, p_score, v_reason, p_actor);
  perform private.write_audit('exam.marked', 'exam_attempt', a.id::text,
    jsonb_build_object('exam_id', p_exam, 'learner_id', p_learner, 'question_id', p_question, 'score', p_score, 'previous_score', w.score, 'reason', v_reason));
end;
$$;

/** The overall feedback on the learner's script (a released result changes only with a reason). */
create function public.exam_feedback_save(p_actor uuid, p_as_admin boolean, p_exam uuid, p_learner uuid, p_feedback text, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations := private.exam_for_manager(p_actor, p_as_admin, p_exam);
  a public.exam_attempts := private.exam_attempt_for_marking(p_exam, p_learner);
  v_feedback text := nullif(btrim(coalesce(p_feedback, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if char_length(v_feedback) > 10000 or char_length(v_reason) > 1000 then
    raise exception 'Keep the feedback to 10,000 characters and the reason to 1,000' using errcode = '22023';
  end if;
  if a.feedback is not distinct from v_feedback then
    return;
  end if;
  if a.released_at is not null and v_reason is null then
    raise exception 'Give a reason for changing a released result' using errcode = '22023';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  update public.exam_attempts set feedback = v_feedback, grade_release_status = 'DRAFT' where id = a.id;
  insert into public.exam_grade_history (attempt_id, event, reason, changed_by) values (a.id, 'FEEDBACK', v_reason, p_actor);
  perform private.write_audit('exam.feedback_saved', 'exam_attempt', a.id::text, jsonb_build_object('exam_id', p_exam, 'learner_id', p_learner, 'reason', v_reason));
end;
$$;

/** The fully marked results waiting to be released (one per learner: their markable attempt). */
create function private.exam_releasable(p_exam uuid)
returns table (attempt_id uuid, learner_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.learner_id
    from public.exam_attempts a
   where a.exam_id = p_exam
     and a.id = (private.exam_markable_attempt(p_exam, a.learner_id)).id
     and a.grade_release_status = 'DRAFT'
     and (select s.unmarked from private.exam_attempt_scores(a.id) s) = 0
     and exists (select 1 from public.exam_answers w where w.attempt_id = a.id);
$$;
revoke execute on function private.exam_releasable(uuid) from public, anon, authenticated;

/**
 * Releases the fully marked results of the examination (p_learner: one learner): the learner then sees
 * their scores, feedback and result, and is told. Refused unless the course's weights total 100. Returns
 * how many results were released.
 */
create function public.exam_release(p_actor uuid, p_as_admin boolean, p_exam uuid, p_learner uuid default null) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations := private.exam_for_manager(p_actor, p_as_admin, p_exam);
  r record;
  a public.exam_attempts;
  v_total numeric;
  v_first boolean;
  v_seq integer;
  v_count integer := 0;
begin
  perform private.require_weights_total_100(v.course_id);
  perform set_config('app.actor_id', p_actor::text, true);
  for r in select * from private.exam_releasable(p_exam) x where p_learner is null or x.learner_id = p_learner loop
    select * into a from public.exam_attempts where id = r.attempt_id for update;
    v_total := (select s.total from private.exam_attempt_scores(a.id) s);
    v_first := not exists (select 1 from public.exam_attempts t where t.exam_id = p_exam and t.learner_id = a.learner_id and t.released_at is not null);
    update public.exam_attempts
       set released_score = v_total, released_feedback = feedback, released_at = clock_timestamp(), released_by = p_actor, grade_release_status = 'RELEASED',
           released_answers = (select jsonb_object_agg(w.question_id, jsonb_build_object('score', w.score, 'feedback', w.feedback))
                                 from public.exam_answers w where w.attempt_id = a.id)
     where id = a.id;
    insert into public.exam_grade_history (attempt_id, event, new_score, changed_by) values (a.id, 'RELEASED', v_total, p_actor);
    select count(*) into v_seq from public.exam_grade_history h where h.attempt_id = a.id and h.event = 'RELEASED';
    insert into public.notifications (recipient_id, notification_type, title, message, related_entity_type, related_entity_id, link_path, deduplication_key)
    values (a.learner_id,
            case when v_first then 'GRADE_RELEASED' else 'GRADE_UPDATED' end::public.notification_type,
            case when v_first then 'New grade available' else 'Grade updated' end,
            case when v_first then 'Your result for ' || v.title || ' is ready.' else 'Your result for ' || v.title || ' was updated.' end,
            'examination', p_exam, '/learner/courses/' || v.course_id || '/exams/' || p_exam,
            'exam-release:' || a.id || ':' || v_seq)
    on conflict (deduplication_key) do nothing;
    perform private.write_audit('exam.released', 'exam_attempt', a.id::text,
      jsonb_build_object('exam_id', p_exam, 'learner_id', a.learner_id, 'score', v_total, 'first_release', v_first));
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'There are no marked results to release' using errcode = '22023';
  end if;
  return v_count;
end;
$$;

/** Authorises a retake (a new attempt; the earlier ones stay) with a reason. The retake counts once released. */
create function public.exam_retake_authorise(p_actor uuid, p_as_admin boolean, p_exam uuid, p_learner uuid, p_reason text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.examinations := private.exam_for_manager(p_actor, p_as_admin, p_exam);
  a public.exam_attempts := private.exam_latest_attempt(p_exam, p_learner);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id uuid;
begin
  if v_reason is null then
    raise exception 'Give a reason for the retake' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'Keep the reason to 1,000 characters' using errcode = '22023';
  end if;
  if a.id is null or not (a.status = 'SUBMITTED' or (a.status = 'IN_PROGRESS' and now() >= private.exam_close_for(p_exam, p_learner))) then
    raise exception 'A retake is for a learner who has finished the examination' using errcode = '22023';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  insert into public.exam_attempts (exam_id, learner_id, attempt_number, status, retake_reason, retake_authorised_by)
  values (p_exam, p_learner, a.attempt_number + 1, 'NOT_STARTED', v_reason, p_actor)
  returning id into v_id;
  insert into public.exam_grade_history (attempt_id, event, reason, changed_by) values (v_id, 'RETAKE_AUTHORISED', v_reason, p_actor);
  perform private.write_audit('exam.retake_authorised', 'exam_attempt', v_id::text,
    jsonb_build_object('exam_id', p_exam, 'learner_id', p_learner, 'attempt_number', a.attempt_number + 1, 'reason', v_reason));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.exam_save(uuid, boolean, uuid, uuid, jsonb), public.exam_structure_save(uuid, boolean, uuid, jsonb),
  public.exam_publish(uuid, boolean, uuid, boolean), public.exam_set_archived(uuid, boolean, uuid, boolean),
  public.exam_set_deadline(uuid, boolean, uuid, timestamptz, text), public.exam_close(uuid, boolean, uuid, text),
  public.exam_extension_set(uuid, boolean, uuid, uuid, timestamptz, text), public.exam_extension_remove(uuid, boolean, uuid, uuid),
  public.exam_start(uuid, uuid), public.exam_save_answers(uuid, uuid, jsonb), public.exam_submit(uuid, uuid),
  public.exam_answer_grade(uuid, boolean, uuid, uuid, uuid, numeric, text, text), public.exam_feedback_save(uuid, boolean, uuid, uuid, text, text),
  public.exam_release(uuid, boolean, uuid, uuid), public.exam_retake_authorise(uuid, boolean, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.exam_save(uuid, boolean, uuid, uuid, jsonb), public.exam_structure_save(uuid, boolean, uuid, jsonb),
  public.exam_publish(uuid, boolean, uuid, boolean), public.exam_set_archived(uuid, boolean, uuid, boolean),
  public.exam_set_deadline(uuid, boolean, uuid, timestamptz, text), public.exam_close(uuid, boolean, uuid, text),
  public.exam_extension_set(uuid, boolean, uuid, uuid, timestamptz, text), public.exam_extension_remove(uuid, boolean, uuid, uuid),
  public.exam_start(uuid, uuid), public.exam_save_answers(uuid, uuid, jsonb), public.exam_submit(uuid, uuid),
  public.exam_answer_grade(uuid, boolean, uuid, uuid, uuid, numeric, text, text), public.exam_feedback_save(uuid, boolean, uuid, uuid, text, text),
  public.exam_release(uuid, boolean, uuid, uuid), public.exam_retake_authorise(uuid, boolean, uuid, uuid, text)
  to service_role;
revoke execute on function public.my_exams(uuid), public.my_exam(uuid), public.exam_results(uuid), public.exam_script(uuid, uuid) from public, anon;
grant execute on function public.my_exams(uuid), public.my_exam(uuid), public.exam_results(uuid), public.exam_script(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- the course grade: examinations as cells of the Final examinations part
create or replace function private.course_grade_cells(p_course uuid, p_reveal boolean)
returns table (
  learner_id uuid, assignment_id uuid, category_id uuid, max_marks numeric, published boolean,
  effective_due_at timestamptz, state text, score numeric, is_late boolean, counted boolean, earned numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with learners as (
    select distinct e.learner_id from public.course_enrollments e where e.course_id = p_course and e.enrolment_status <> 'WITHDRAWN'
  ), zero as (
    select coalesce((select (value)::text::boolean from public.system_settings where key = 'missing_as_zero'), false) as on
  ), base as (
    select l.learner_id, a.id as assignment_id, a.category_id, a.max_marks,
           (a.publication_status = 'PUBLISHED' and a.archived_at is null) as published,
           private.effective_due_at(a.id, l.learner_id) as effective_due_at,
           g.part = 'PRACTICALS' as practical,
           s.status, s.score, s.released_score, s.released_at, s.grade_release_status, s.is_late,
           s.current_version
      from learners l
      cross join public.assignments a
      join public.grade_categories g on g.id = a.category_id
      left join public.submissions s on s.assignment_id = a.id and s.learner_id = l.learner_id and (s.current_version > 0 or s.marked_in_person)
     where a.course_id = p_course
       and ((a.publication_status = 'PUBLISHED' and a.archived_at is null) or s.released_at is not null)
  ), stated as (
    select b.*,
           case
             when b.released_at is not null then 'RELEASED'
             when b.status = 'GRADED' then 'DRAFT'
             when b.status is not null then 'UNGRADED'
             when b.practical then 'UNGRADED'
             when b.published and now() > b.effective_due_at and (select z.on from zero z) then 'COUNTED_ZERO'
             when b.published and now() > b.effective_due_at then 'MISSING'
             else 'NOT_DUE'
           end as raw_state
      from base b
  ), exams as (
    -- the latest released attempt counts (a released retake replaces the earlier result); before any
    -- release the latest markable attempt is a draft once fully marked, otherwise waiting
    select l.learner_id, x.id as exam_id, x.category_id, private.exam_total(x.id) as max_marks,
           (x.publication_status = 'PUBLISHED' and x.archived_at is null) as published,
           private.exam_close_for(x.id, l.learner_id) as close_at,
           rel.released_score, rel.released_at, mk.id as markable, sc.total as current_total, sc.unmarked
      from learners l
      cross join public.examinations x
      left join lateral (select * from public.exam_attempts t where t.exam_id = x.id and t.learner_id = l.learner_id and t.released_at is not null
                          order by t.attempt_number desc limit 1) rel on true
      left join lateral (select (private.exam_markable_attempt(x.id, l.learner_id)).*) mk on true
      left join lateral private.exam_attempt_scores(mk.id) sc on mk.id is not null
     where x.course_id = p_course
       and ((x.publication_status = 'PUBLISHED' and x.archived_at is null) or rel.released_at is not null)
  ), exam_stated as (
    select e.*,
           case
             when e.released_at is not null then 'RELEASED'
             when e.markable is not null and e.unmarked = 0 then 'DRAFT'
             when e.markable is not null and exists (select 1 from public.exam_attempts t where t.id = e.markable and t.status = 'SUBMITTED') then 'UNGRADED'
             when e.published and now() >= e.close_at and (select z.on from zero z) then 'COUNTED_ZERO'
             when e.published and now() >= e.close_at then 'MISSING'
             else 'NOT_DUE'
           end as raw_state
      from exams e
  )
  select x.learner_id, x.assignment_id, x.category_id, x.max_marks, x.published, x.effective_due_at,
         case when x.raw_state = 'DRAFT' and not p_reveal then 'UNGRADED' else x.raw_state end,
         case
           when x.raw_state = 'RELEASED' then x.released_score
           when x.raw_state = 'DRAFT' and p_reveal then x.score
           when x.raw_state = 'COUNTED_ZERO' then 0
         end,
         coalesce(x.is_late, false),
         x.raw_state in ('RELEASED', 'COUNTED_ZERO'),
         case when x.raw_state = 'RELEASED' then x.released_score when x.raw_state = 'COUNTED_ZERO' then 0 end
    from stated x
  union all
  select e.learner_id, e.exam_id, e.category_id, e.max_marks, e.published, e.close_at,
         case when e.raw_state = 'DRAFT' and not p_reveal then 'UNGRADED' else e.raw_state end,
         case
           when e.raw_state = 'RELEASED' then e.released_score
           when e.raw_state = 'DRAFT' and p_reveal then e.current_total
           when e.raw_state = 'COUNTED_ZERO' then 0
         end,
         false,
         e.raw_state in ('RELEASED', 'COUNTED_ZERO'),
         case when e.raw_state = 'RELEASED' then e.released_score when e.raw_state = 'COUNTED_ZERO' then 0 end
    from exam_stated e;
$$;

/** The gradebook columns: the assignments and, since Phase 10.1, the examinations (part EXAMINATIONS; due = their deadline). */
create or replace function public.gradebook_assignments(p_course uuid)
returns table (assignment_id uuid, title text, category_id uuid, category_name text, max_marks numeric, due_at timestamptz, published boolean, part text)
language sql
stable
security definer
set search_path = ''
as $$
  with visible as (
    select distinct c.assignment_id from private.course_grade_cells(p_course, false) c
     where private.can_manage_course(p_course) or c.learner_id = (select auth.uid())
  )
  select * from (
    select a.id, a.title, a.category_id, g.name, a.max_marks, a.due_at, (a.publication_status = 'PUBLISHED' and a.archived_at is null), g.part::text
      from public.assignments a
      join public.grade_categories g on g.id = a.category_id
     where a.course_id = p_course and a.id in (select assignment_id from visible)
    union all
    select x.id, x.title, x.category_id, g.name, private.exam_total(x.id), x.closes_at, (x.publication_status = 'PUBLISHED' and x.archived_at is null), 'EXAMINATIONS'
      from public.examinations x
      join public.grade_categories g on g.id = x.category_id
     where x.course_id = p_course and x.id in (select assignment_id from visible)
  ) cols
   order by 6, 2;
$$;

-- calculate_course_grades orders each learner's cells by the column's date: assignments and examinations.
create or replace function public.calculate_course_grades(p_course uuid)
returns table (
  learner_id uuid, first_name text, second_name text, id_number integer, branch_name text, profile_image_path text,
  enrolment_status public.enrolment_status, overall_percentage numeric, letter_grade text, band text, status text,
  categories jsonb, cells jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_manager boolean := private.can_manage_course(p_course);
  v_me uuid := (select auth.uid());
begin
  if not v_manager and not exists (
    select 1 from public.course_enrollments e
     where e.course_id = p_course and e.learner_id = v_me and e.enrolment_status <> 'WITHDRAWN'
  ) then
    return;
  end if;
  if v_manager and private.is_admin() and not private.is_lecturer_of(p_course) then
    perform private.write_audit('gradebook.viewed', 'course', p_course::text, '{}'::jsonb);
  end if;
  return query
    with cells as (
      select * from private.course_grade_cells(p_course, v_manager) c where v_manager or c.learner_id = v_me
    ), summary as (
      select * from private.course_grade_summary(p_course, v_manager) s where v_manager or s.learner_id = v_me
    ), cols as (
      select a.id, a.due_at as at, a.title from public.assignments a where a.course_id = p_course
      union all
      select x.id, x.closes_at, x.title from public.examinations x where x.course_id = p_course
    )
    select p.id, p.first_name, p.second_name, p.id_number,
           (select b.name from public.branches b where b.id = p.branch_id),
           (select f.storage_path from public.file_objects f where f.id = p.profile_image_file_id and f.status = 'VALIDATED'),
           (select e.enrolment_status from public.course_enrollments e where e.course_id = p_course and e.learner_id = p.id
             order by e.enrolment_status = 'WITHDRAWN', e.enrolled_at desc limit 1),
           s.overall, g.letter_grade, g.band, s.status, s.categories,
           coalesce((select jsonb_agg(jsonb_build_object(
                       'assignment_id', c.assignment_id, 'category_id', c.category_id, 'state', c.state,
                       'score', c.score, 'max_marks', c.max_marks, 'is_late', c.is_late, 'counted', c.counted,
                       'published', c.published, 'effective_due_at', c.effective_due_at,
                       'percentage', f.percentage, 'letter_grade', f.letter_grade, 'band', f.band
                     ) order by k.at, k.title)
                       from cells c
                       join cols k on k.id = c.assignment_id
                       left join lateral private.grade_facts(c.score, c.max_marks) f on c.score is not null
                      where c.learner_id = p.id), '[]'::jsonb)
      from summary s
      join public.profiles p on p.id = s.learner_id
      left join lateral private.grade_facts(s.overall, 100) g on s.overall is not null
     order by p.first_name, p.second_name;
end;
$$;

-- Course-wide Review and release includes the examinations' fully marked results.
create or replace function public.course_release_preview(p_course uuid)
returns table (
  assignment_id uuid, assignment_title text, learner_id uuid, first_name text, second_name text, id_number integer, branch_name text,
  score numeric, max_marks numeric, percentage numeric, letter_grade text, changed boolean, released_score numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.aid, r.atitle, r.pid, r.fname, r.sname, r.idn, r.branch, r.score, r.maxm, r.pct, r.letter, r.changed, r.rscore from (
    select a.id as aid, a.title as atitle, p.id as pid, p.first_name as fname, p.second_name as sname, p.id_number as idn,
           (select b.name from public.branches b where b.id = p.branch_id) as branch,
           s.score, a.max_marks as maxm, f.percentage as pct, f.letter_grade as letter, s.released_at is not null as changed, s.released_score as rscore, a.due_at as at
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      join public.profiles p on p.id = s.learner_id
      left join lateral private.grade_facts(s.score, a.max_marks) f on true
     where a.course_id = p_course and s.status = 'GRADED' and s.grade_release_status = 'DRAFT' and s.score is not null
       and private.can_manage_course(p_course)
    union all
    select x.id, x.title, p.id, p.first_name, p.second_name, p.id_number,
           (select b.name from public.branches b where b.id = p.branch_id),
           sc.total, private.exam_total(x.id), f.percentage, f.letter_grade,
           exists (select 1 from public.exam_attempts t where t.exam_id = x.id and t.learner_id = p.id and t.released_at is not null),
           (select t.released_score from public.exam_attempts t where t.exam_id = x.id and t.learner_id = p.id and t.released_at is not null
             order by t.attempt_number desc limit 1),
           x.closes_at
      from public.examinations x
      join lateral private.exam_releasable(x.id) r on true
      join public.profiles p on p.id = r.learner_id
      join lateral private.exam_attempt_scores(r.attempt_id) sc on true
      left join lateral private.grade_facts(sc.total, private.exam_total(x.id)) f on true
     where x.course_id = p_course and private.can_manage_course(p_course)
  ) r
   order by r.at, r.atitle, r.fname, r.sname;
$$;

create or replace function public.grade_release_course(p_actor uuid, p_as_admin boolean, p_course uuid) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment uuid;
  v_exam uuid;
  v_total integer := 0;
begin
  perform private.require_lesson_actor(p_actor, p_as_admin, p_course);
  perform private.require_weights_total_100(p_course);
  for v_assignment in
    select distinct a.id from public.assignments a join public.submissions s on s.assignment_id = a.id
     where a.course_id = p_course and s.status = 'GRADED' and s.grade_release_status = 'DRAFT' and s.score is not null
  loop
    v_total := v_total + public.grade_release(p_actor, p_as_admin, v_assignment, null);
  end loop;
  for v_exam in
    select x.id from public.examinations x where x.course_id = p_course and exists (select 1 from private.exam_releasable(x.id))
  loop
    v_total := v_total + public.exam_release(p_actor, p_as_admin, v_exam, null);
  end loop;
  if v_total = 0 then
    raise exception 'There are no grades to release' using errcode = '22023';
  end if;
  perform private.write_audit('grades.released_course', 'course', p_course::text, jsonb_build_object('released', v_total));
  return v_total;
end;
$$;
