-- Step 11.1, migration 45 (owner request of 2026-11-11, ADR-020 item 10): an examination answer carries up
-- to three audio answers (recordings or uploaded audio files) instead of one.
--   * exam_answers.audio_file_ids: the answer's audio in the learner's order, at most three, none twice,
--     each the learner's own validated EXAM_ANSWER_AUDIO for that attempt (checked by the guard trigger).
--   * audio_file_id stays as the first of them, kept by the trigger, so everything that asks "is there a
--     recording?" (auto-marking of blank answers) is unchanged, and a screen that still sends only
--     audio_file_id (an installed app not yet updated) keeps working.
--   * exam_save_answers takes audio_file_ids (the whole list: add, replace in place, remove).
--   * exam_answer_files returns every recording, in order.
-- Nothing is deleted: a recording taken off an answer keeps its file_objects row, as before.

alter table public.exam_answers add column audio_file_ids uuid[] not null default '{}'
  check (cardinality(audio_file_ids) <= 3 and array_position(audio_file_ids, null) is null);
update public.exam_answers set audio_file_ids = array[audio_file_id] where audio_file_id is not null;

/** Keeps audio_file_ids and audio_file_id (its first) together and checks every recording added. */
create or replace function private.exam_answers_audio_guard() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list_changed boolean := tg_op = 'INSERT' or new.audio_file_ids is distinct from old.audio_file_ids;
  v_one_changed boolean := (tg_op = 'INSERT' and new.audio_file_id is not null) or (tg_op = 'UPDATE' and new.audio_file_id is distinct from old.audio_file_id);
begin
  -- Only the single column was set (the earlier screens): it becomes the whole list.
  if v_one_changed and ((tg_op = 'UPDATE' and new.audio_file_ids is not distinct from old.audio_file_ids) or (tg_op = 'INSERT' and cardinality(new.audio_file_ids) = 0)) then
    new.audio_file_ids := case when new.audio_file_id is null then '{}'::uuid[] else array[new.audio_file_id] end;
    v_list_changed := true;
  end if;
  if v_list_changed then
    if cardinality(new.audio_file_ids) > 3 then
      raise exception 'Add up to 3 recordings or audio files to one answer' using errcode = '22023';
    end if;
    if (select count(distinct x) from unnest(new.audio_file_ids) x) <> cardinality(new.audio_file_ids)
       or exists (
         select 1 from unnest(new.audio_file_ids) x
          where (tg_op = 'INSERT' or not (x = any (old.audio_file_ids)))
            and not exists (
              select 1 from public.file_objects f join public.exam_attempts a on a.id = new.attempt_id
               where f.id = x and f.status = 'VALIDATED' and f.resource_type = 'EXAM_ANSWER_AUDIO'
                 and f.resource_id = new.attempt_id and f.uploaded_by = a.learner_id)
       ) then
      raise exception 'Use a recording you made for this examination' using errcode = '22023';
    end if;
  end if;
  new.audio_file_id := new.audio_file_ids[1];
  return new;
end;
$$;

/**
 * Autosave, since migration 45 with up to three recordings: an item may carry audio_file_ids (the whole
 * list in order; an empty list removes them all). audio_file_id alone is still accepted as a list of one.
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
  v_audio uuid[];
  v_has_audio boolean;
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
    v_has_audio := v_item ? 'audio_file_ids' or v_item ? 'audio_file_id';
    v_audio := '{}';
    if v_item ? 'audio_file_ids' then
      if jsonb_typeof(v_item -> 'audio_file_ids') is distinct from 'array' then
        raise exception 'Use a recording you made for this examination' using errcode = '22023';
      end if;
      if jsonb_array_length(v_item -> 'audio_file_ids') > 3 then
        raise exception 'Add up to 3 recordings or audio files to one answer' using errcode = '22023';
      end if;
    end if;
    begin
      if v_item ? 'audio_file_ids' then
        select coalesce(array_agg(e::uuid order by n), '{}') into v_audio
          from jsonb_array_elements_text(v_item -> 'audio_file_ids') with ordinality as t(e, n);
      elsif nullif(v_item ->> 'audio_file_id', '') is not null then
        v_audio := array[(v_item ->> 'audio_file_id')::uuid];
      end if;
    exception when others then
      raise exception 'Use a recording you made for this examination' using errcode = '22023';
    end;
    begin
      v_doc := nullif(v_item ->> 'document_file_id', '')::uuid;
    exception when others then
      raise exception 'Use a document you uploaded for this examination' using errcode = '22023';
    end;
    if v_q.kind = 'MCQ' and (cardinality(v_audio) > 0 or v_doc is not null) then
      raise exception 'Multiple-choice questions are answered by choosing A to D' using errcode = '22023';
    end if;
    insert into public.exam_answers (attempt_id, question_id, selected_option, text_answer, audio_file_ids, document_file_id)
    values (a.id, v_q.id,
            case when v_q.kind = 'MCQ' then nullif(v_item ->> 'selected_option', '') end,
            case when v_q.kind = 'MCQ' then '' else coalesce(v_item ->> 'text_answer', '') end,
            v_audio, v_doc)
    on conflict on constraint exam_answers_attempt_question_key
    do update set selected_option = excluded.selected_option,
                  text_answer = case when v_item ? 'text_answer' or v_q.kind = 'MCQ' then excluded.text_answer else public.exam_answers.text_answer end,
                  audio_file_ids = case when v_has_audio then excluded.audio_file_ids else public.exam_answers.audio_file_ids end,
                  document_file_id = case when v_item ? 'document_file_id' then excluded.document_file_id else public.exam_answers.document_file_id end;
  end loop;
  return now();
end;
$$;

/**
 * The files on a learner's latest attempt, per question: every recording (AUDIO, in the learner's order)
 * and the document (DOCUMENT). The learner themselves or the course's managers only.
 */
create or replace function public.exam_answer_files(p_exam uuid, p_learner uuid)
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
    cross join lateral (
      select 'AUDIO'::text as kind, r.file_id, r.n from unnest(w.audio_file_ids) with ordinality as r(file_id, n)
      union all
      select 'DOCUMENT'::text, w.document_file_id, 9::bigint
    ) k
    join public.file_objects f on f.id = k.file_id and f.status = 'VALIDATED'
   where x.id = p_exam
     and ((p_learner = (select auth.uid()) and (select private.is_active_user())) or private.can_manage_course(x.course_id))
   order by w.question_id, k.n;
$$;
