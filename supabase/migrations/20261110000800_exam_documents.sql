-- Step 10.3, migration 37 (owner request and approval of 2026-11-10): an examination answer may also
-- carry one PDF or Word document, through register-upload, upload and finalize-upload (D18) with the
-- learner submission document limit (D17, 10 MB), in the learner-submissions bucket. An uploaded audio
-- file uses the existing EXAM_ANSWER_AUDIO path (migration 35). Only the learner and the course's
-- managers can open the document. An answer given only as a document waits for the lecturer.

alter table public.file_objects drop constraint file_objects_resource_type_check;
alter table public.file_objects add constraint file_objects_resource_type_check check (resource_type in (
  'LESSON_AUDIO', 'LESSON_ATTACHMENT', 'ASSIGNMENT_INSTRUCTION_AUDIO',
  'SUBMISSION_FILE', 'PROFILE_IMAGE', 'COURSE_COVER', 'EXAM_ANSWER_AUDIO', 'EXAM_ANSWER_DOCUMENT'));

alter table public.exam_answers add column document_file_id uuid references public.file_objects (id) on delete restrict;

/** An answer's document is a validated examination document of this attempt, uploaded by its learner. */
create function private.exam_answers_document_guard() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.document_file_id is not null and (tg_op = 'INSERT' or new.document_file_id is distinct from old.document_file_id)
     and not exists (
       select 1 from public.file_objects f join public.exam_attempts a on a.id = new.attempt_id
        where f.id = new.document_file_id and f.status = 'VALIDATED' and f.resource_type = 'EXAM_ANSWER_DOCUMENT'
          and f.resource_id = new.attempt_id and f.uploaded_by = a.learner_id
     ) then
    raise exception 'Use a document you uploaded for this examination' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger exam_answers_document_guard before insert or update on public.exam_answers
  for each row execute function private.exam_answers_document_guard();
revoke execute on function private.exam_answers_document_guard() from public, anon, authenticated;

/**
 * Autosave, since Step 10.3 with a document too: each item may carry document_file_id (the learner's own
 * validated document for this attempt, or null to remove it), as it may carry audio_file_id.
 */
create or replace function public.exam_save_answers(p_actor uuid, p_exam uuid, p_answers jsonb) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.exam_attempts := private.exam_open_attempt(p_actor, p_exam);
  v_item jsonb;
  v_q public.exam_questions;
  v_audio uuid;
  v_doc uuid;
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
    begin
      v_audio := nullif(v_item ->> 'audio_file_id', '')::uuid;
    exception when others then
      raise exception 'Use a recording you made for this examination' using errcode = '22023';
    end;
    begin
      v_doc := nullif(v_item ->> 'document_file_id', '')::uuid;
    exception when others then
      raise exception 'Use a document you uploaded for this examination' using errcode = '22023';
    end;
    if v_q.kind = 'MCQ' and (v_audio is not null or v_doc is not null) then
      raise exception 'Multiple-choice questions are answered by choosing A to D' using errcode = '22023';
    end if;
    insert into public.exam_answers (attempt_id, question_id, selected_option, text_answer, audio_file_id, document_file_id)
    values (a.id, v_q.id,
            case when v_q.kind = 'MCQ' then nullif(v_item ->> 'selected_option', '') end,
            case when v_q.kind = 'MCQ' then '' else coalesce(v_item ->> 'text_answer', '') end,
            v_audio, v_doc)
    on conflict on constraint exam_answers_attempt_question_key
    do update set selected_option = excluded.selected_option,
                  text_answer = case when v_item ? 'text_answer' or v_q.kind = 'MCQ' then excluded.text_answer else public.exam_answers.text_answer end,
                  audio_file_id = case when v_item ? 'audio_file_id' then excluded.audio_file_id else public.exam_answers.audio_file_id end,
                  document_file_id = case when v_item ? 'document_file_id' then excluded.document_file_id else public.exam_answers.document_file_id end;
  end loop;
  return now();
end;
$$;

/** Auto-marking, since Step 10.3: a short or essay answer with a recording or a document is not blank. */
create or replace function private.exam_auto_mark(p_attempt uuid) returns void
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
     and btrim(w.text_answer) = '' and w.audio_file_id is null and w.document_file_id is null;
end;
$$;

/** Whether the caller may read this stored examination file (a recording or, since Step 10.3, a document). */
create or replace function private.can_read_exam_audio_object(p_bucket text, p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.file_objects f
      join public.exam_attempts a on a.id = f.resource_id
      join public.examinations x on x.id = a.exam_id
     where f.bucket_name = p_bucket and f.storage_path = p_name and f.status = 'VALIDATED'
       and f.resource_type in ('EXAM_ANSWER_AUDIO', 'EXAM_ANSWER_DOCUMENT')
       and ((a.learner_id = (select auth.uid()) and f.uploaded_by = a.learner_id) or private.can_manage_course(x.course_id))
  );
$$;

/**
 * The files on a learner's latest attempt, per question: their recording (AUDIO) and document (DOCUMENT),
 * for the player and the Open link. The learner themselves or the course's managers only.
 */
create function public.exam_answer_files(p_exam uuid, p_learner uuid)
returns table (question_id uuid, kind text, file_id uuid, bucket text, storage_path text, original_filename text, safe_download_filename text,
               duration_seconds numeric, mime_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.question_id, k.kind, f.id, f.bucket_name, f.storage_path, f.original_filename, f.safe_download_filename, f.duration_seconds, f.detected_mime_type
    from public.examinations x
    join lateral (select * from public.exam_attempts t where t.exam_id = x.id and t.learner_id = p_learner order by t.attempt_number desc limit 1) a on true
    join public.exam_answers w on w.attempt_id = a.id
    cross join lateral (values ('AUDIO', w.audio_file_id), ('DOCUMENT', w.document_file_id)) as k(kind, file_id)
    join public.file_objects f on f.id = k.file_id and f.status = 'VALIDATED'
   where x.id = p_exam
     and ((p_learner = (select auth.uid()) and (select private.is_active_user())) or private.can_manage_course(x.course_id));
$$;
revoke execute on function public.exam_answer_files(uuid, uuid) from public, anon;
grant execute on function public.exam_answer_files(uuid, uuid) to authenticated, service_role;
