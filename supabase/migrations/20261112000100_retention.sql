-- Phase 12, migration 47 (D20; ADR-022: owner decisions of 2026-11-12): learner-audio retention.
--   * retention_holds: an AAL2 administrator protects a course, a learner, one assignment answer
--     (SUBMISSION) or one examination answer (EXAM_ATTEMPT) from retention, with a reason. Holds are
--     released, never deleted; placing and releasing are audited.
--   * retention_runs: one row per run of the retention-runner job (DRY_RUN or LIVE) with its counts and
--     the outcome of each file.
--   * retention_candidates(): D20 exactly, extended to examination recordings (ADR-022 decision 1). Only
--     learner audio on a submitted answer, VALIDATED (or DELETE_FAILED, to retry), whose grade or result
--     is RELEASED and was released at least retention_days ago, with no active hold on the answer, the
--     learner or the course. Never lesson audio, instruction audio, attachments, text, PDF or Word.
--   * retention_run_begin(): LIVE only when retention_enabled is on AND dry runs began at least
--     retention_dry_run_days ago (ADR-022 decision 2); otherwise DRY_RUN.
--   * retention_record(): the outcome of deleting one candidate (DELETED keeps the row with deleted_at;
--     DELETE_FAILED counts the attempt and is retried by the next run). retention_run_finish() closes the
--     run and audits it.
--   * files_due_for_cleanup no longer retries a submitted answer's failed audio: retention-runner retries
--     it, after checking holds again.
--   * Settings: retention_days 0 to 3650, retention_dry_run_days 0 to 365. retention_enabled stays false.
--   * Scheduled daily at 02:40 UTC.

create type public.retention_scope as enum ('SUBMISSION', 'EXAM_ATTEMPT', 'LEARNER', 'COURSE');
create type public.retention_mode as enum ('DRY_RUN', 'LIVE');

-- ---------------------------------------------------------------- holds
create table public.retention_holds (
  id uuid primary key default gen_random_uuid(),
  scope public.retention_scope not null,
  scope_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  placed_by uuid not null references public.profiles (id) on delete restrict,
  placed_at timestamptz not null default now(),
  released_by uuid references public.profiles (id) on delete restrict,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_holds_released_together check ((released_at is null) = (released_by is null))
);
create unique index retention_holds_active_key on public.retention_holds (scope, scope_id) where released_at is null;
create trigger retention_holds_set_updated_at before update on public.retention_holds for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- runs
create table public.retention_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mode public.retention_mode not null,
  eligible_count integer not null default 0 check (eligible_count >= 0),
  deleted_count integer not null default 0 check (deleted_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_runs_dry_deletes_nothing check (mode = 'LIVE' or (deleted_count = 0 and failed_count = 0))
);
create index retention_runs_started_idx on public.retention_runs (started_at desc);
create trigger retention_runs_set_updated_at before update on public.retention_runs for each row execute function private.set_updated_at();

alter table public.retention_holds enable row level security;
alter table public.retention_runs enable row level security;
revoke all on public.retention_holds, public.retention_runs from anon, authenticated;
grant select on public.retention_holds, public.retention_runs to authenticated;
grant select on public.retention_holds, public.retention_runs to service_role;
create policy retention_holds_admin_read on public.retention_holds for select to authenticated using ((select private.is_admin()));
create policy retention_runs_admin_read on public.retention_runs for select to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------- settings bounds
alter table public.system_settings add constraint system_settings_retention_bounds check (
  case key
    when 'retention_days' then private.json_int_between(value, 0, 3650)
    when 'retention_dry_run_days' then private.json_int_between(value, 0, 365)
    else true
  end
);

-- ---------------------------------------------------------------- candidates (D20, ADR-022)
/** Whether an active hold covers this answer, learner or course. */
create function private.retention_held(p_scope public.retention_scope, p_answer uuid, p_learner uuid, p_course uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.retention_holds h
     where h.released_at is null
       and ((h.scope = p_scope and h.scope_id = p_answer) or (h.scope = 'LEARNER' and h.scope_id = p_learner) or (h.scope = 'COURSE' and h.scope_id = p_course))
  );
$$;

/** Every file retention may delete now, without a limit (the runner and retention_record use it). */
create function private.retention_candidate_rows()
returns table (file_id uuid, bucket_name text, storage_path text, status public.file_status, source text, answer_id uuid, learner_id uuid, course_id uuid, released_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select coalesce((select (value #>> '{}')::int from public.system_settings where key = 'retention_days'), 180) as n
  )
  -- Audio on a submitted assignment answer whose grade is released.
  select f.id, f.bucket_name, f.storage_path, f.status, 'ASSIGNMENT', s.id, s.learner_id, a.course_id, s.released_at
    from public.submission_files sf
    join public.file_objects f on f.id = sf.file_object_id
    join public.submission_versions v on v.id = sf.submission_version_id
    join public.submissions s on s.id = v.submission_id
    join public.assignments a on a.id = s.assignment_id
    cross join days d
   where sf.file_role = 'AUDIO'
     and f.resource_type = 'SUBMISSION_FILE' and f.bucket_name = 'learner-submissions'
     and f.status in ('VALIDATED', 'DELETE_FAILED')
     and s.grade_release_status = 'RELEASED' and s.released_at is not null
     and s.released_at <= clock_timestamp() - make_interval(days => d.n)
     and not private.retention_held('SUBMISSION', s.id, s.learner_id, a.course_id)
  union
  -- A recording on an examination answer whose result is released (ADR-022 decision 1).
  select f.id, f.bucket_name, f.storage_path, f.status, 'EXAMINATION', t.id, t.learner_id, x.course_id, t.released_at
    from public.exam_answers w
    cross join lateral unnest(w.audio_file_ids) as r(file_id)
    join public.file_objects f on f.id = r.file_id
    join public.exam_attempts t on t.id = w.attempt_id
    join public.examinations x on x.id = t.exam_id
    cross join days d
   where f.resource_type = 'EXAM_ANSWER_AUDIO' and f.bucket_name = 'learner-submissions'
     and f.status in ('VALIDATED', 'DELETE_FAILED')
     and t.grade_release_status = 'RELEASED' and t.released_at is not null
     and t.released_at <= clock_timestamp() - make_interval(days => d.n)
     and not private.retention_held('EXAM_ATTEMPT', t.id, t.learner_id, x.course_id);
$$;
revoke execute on function private.retention_held(public.retention_scope, uuid, uuid, uuid), private.retention_candidate_rows() from public, anon, authenticated;

/** The files retention may delete now, oldest release first (the scheduled job only). */
create function public.retention_candidates(p_limit integer default 200)
returns table (file_id uuid, bucket_name text, storage_path text, status public.file_status, source text, answer_id uuid, learner_id uuid, course_id uuid, released_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.retention_candidate_rows() c order by c.released_at, c.file_id limit greatest(1, least(p_limit, 500));
$$;
revoke execute on function public.retention_candidates(integer) from public, anon, authenticated;
grant execute on function public.retention_candidates(integer) to service_role;

-- ---------------------------------------------------------------- holds: place and release (AAL2 administrators)
/** Places a hold on a course, a learner, an assignment answer or an examination answer. Returns its id. */
create function public.retention_hold_place(p_scope public.retention_scope, p_scope_id uuid, p_reason text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Only administrators place retention holds' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Give a reason of 3 to 500 characters' using errcode = '22023';
  end if;
  if p_scope = 'COURSE' and not exists (select 1 from public.courses where id = p_scope_id) then
    raise exception 'That course was not found' using errcode = '22023';
  elsif p_scope = 'LEARNER' and not exists (select 1 from public.profiles where id = p_scope_id and role = 'LEARNER') then
    raise exception 'That learner was not found' using errcode = '22023';
  elsif p_scope = 'SUBMISSION' and not exists (select 1 from public.submissions where id = p_scope_id) then
    raise exception 'That answer was not found' using errcode = '22023';
  elsif p_scope = 'EXAM_ATTEMPT' and not exists (select 1 from public.exam_attempts where id = p_scope_id) then
    raise exception 'That examination answer was not found' using errcode = '22023';
  end if;
  if exists (select 1 from public.retention_holds where scope = p_scope and scope_id = p_scope_id and released_at is null) then
    raise exception 'That is already held' using errcode = '23505';
  end if;
  insert into public.retention_holds (scope, scope_id, reason, placed_by)
  values (p_scope, p_scope_id, btrim(p_reason), (select auth.uid()))
  returning id into v_id;
  perform private.write_audit('retention.hold_placed', 'retention_hold', v_id::text,
    jsonb_build_object('scope', p_scope, 'scope_id', p_scope_id, 'reason', btrim(p_reason)));
  return v_id;
end;
$$;

/** Releases an active hold (it is kept, marked released). */
create function public.retention_hold_release(p_hold uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.retention_holds;
begin
  if not private.is_admin() then
    raise exception 'Only administrators release retention holds' using errcode = '42501';
  end if;
  update public.retention_holds set released_at = now(), released_by = (select auth.uid())
   where id = p_hold and released_at is null
  returning * into h;
  if h.id is null then
    raise exception 'That hold was not found or is already released' using errcode = 'P0002';
  end if;
  perform private.write_audit('retention.hold_released', 'retention_hold', h.id::text,
    jsonb_build_object('scope', h.scope, 'scope_id', h.scope_id));
end;
$$;
revoke execute on function public.retention_hold_place(public.retention_scope, uuid, text), public.retention_hold_release(uuid) from public, anon;
grant execute on function public.retention_hold_place(public.retention_scope, uuid, text), public.retention_hold_release(uuid) to authenticated;

/**
 * What the administrator's Retention page shows about a hold's subject: a course title, a learner's name,
 * or the answer's assignment or examination with its learner. AAL2 administrators only.
 */
create function public.retention_hold_list()
returns table (id uuid, scope public.retention_scope, scope_id uuid, subject text, detail text, reason text, placed_at timestamptz, placed_by_name text,
               released_at timestamptz, released_by_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only administrators read retention holds' using errcode = '42501';
  end if;
  return query
  select h.id, h.scope, h.scope_id,
         case h.scope
           when 'COURSE' then (select c.course_code || ' ' || c.title from public.courses c where c.id = h.scope_id)
           when 'LEARNER' then (select p.first_name || ' ' || p.second_name from public.profiles p where p.id = h.scope_id)
           when 'SUBMISSION' then (select a.title from public.submissions s join public.assignments a on a.id = s.assignment_id where s.id = h.scope_id)
           else (select x.title from public.exam_attempts t join public.examinations x on x.id = t.exam_id where t.id = h.scope_id)
         end,
         case h.scope
           when 'SUBMISSION' then (select p.first_name || ' ' || p.second_name from public.submissions s join public.profiles p on p.id = s.learner_id where s.id = h.scope_id)
           when 'EXAM_ATTEMPT' then (select p.first_name || ' ' || p.second_name from public.exam_attempts t join public.profiles p on p.id = t.learner_id where t.id = h.scope_id)
           else null
         end,
         h.reason, h.placed_at, pb.first_name || ' ' || pb.second_name, h.released_at,
         case when rb.id is null then null else rb.first_name || ' ' || rb.second_name end
    from public.retention_holds h
    join public.profiles pb on pb.id = h.placed_by
    left join public.profiles rb on rb.id = h.released_by
   order by h.released_at is not null, coalesce(h.released_at, h.placed_at) desc;
end;
$$;
revoke execute on function public.retention_hold_list() from public, anon;
grant execute on function public.retention_hold_list() to authenticated;

-- ---------------------------------------------------------------- runs (the scheduled job only)
/** Starts a run: LIVE only when switched on and dry runs began at least retention_dry_run_days ago. */
create function public.retention_run_begin() returns table (run_id uuid, mode public.retention_mode)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := coalesce((select value = 'true'::jsonb from public.system_settings where key = 'retention_enabled'), false);
  v_dry_days integer := coalesce((select (value #>> '{}')::int from public.system_settings where key = 'retention_dry_run_days'), 30);
  v_first timestamptz := (select min(r.started_at) from public.retention_runs r where r.mode = 'DRY_RUN');
  v_mode public.retention_mode;
  v_id uuid;
begin
  v_mode := case when v_enabled and v_first is not null and v_first <= now() - make_interval(days => v_dry_days) then 'LIVE' else 'DRY_RUN' end;
  insert into public.retention_runs (mode) values (v_mode) returning id into v_id;
  return query select v_id, v_mode;
end;
$$;

/** Records deleting one candidate in a live run: DELETED (row kept, with deleted_at) or DELETE_FAILED (retried). */
create function public.retention_record(p_run uuid, p_file uuid, p_deleted boolean, p_error text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.retention_runs where id = p_run and mode = 'LIVE' and finished_at is null) then
    raise exception 'Only an open live run deletes files' using errcode = '22023';
  end if;
  if not exists (select 1 from private.retention_candidate_rows() c where c.file_id = p_file) then
    raise exception 'That file is not a retention candidate' using errcode = '22023';
  end if;
  if p_deleted then
    update public.file_objects set status = 'DELETED', deleted_at = now() where id = p_file;
    update public.retention_runs set deleted_count = deleted_count + 1 where id = p_run;
  else
    update public.file_objects
       set status = 'DELETE_FAILED', delete_attempts = delete_attempts + 1, last_delete_error = left(coalesce(p_error, 'Unknown error'), 1000)
     where id = p_file;
    update public.retention_runs set failed_count = failed_count + 1 where id = p_run;
  end if;
end;
$$;

/** Whether a file is still a candidate, asked just before deleting it (a hold may have been placed since the list was read). */
create function public.retention_still_candidate(p_file uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.retention_candidate_rows() c where c.file_id = p_file);
$$;

/** Closes a run with its candidate count and per-file details, and audits it. */
create function public.retention_run_finish(p_run uuid, p_eligible integer, p_details jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.retention_runs;
begin
  update public.retention_runs set finished_at = now(), eligible_count = greatest(0, coalesce(p_eligible, 0)), details = coalesce(p_details, '{}'::jsonb)
   where id = p_run and finished_at is null
  returning * into r;
  if r.id is null then
    raise exception 'That run was not found or is already finished' using errcode = 'P0002';
  end if;
  perform private.write_audit(case when r.failed_count > 0 then 'retention.run_failed' else 'retention.run' end, 'retention_run', r.id::text,
    jsonb_build_object('mode', r.mode, 'eligible', r.eligible_count, 'deleted', r.deleted_count, 'failed', r.failed_count));
end;
$$;
revoke execute on function public.retention_run_begin(), public.retention_record(uuid, uuid, boolean, text), public.retention_still_candidate(uuid), public.retention_run_finish(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.retention_run_begin(), public.retention_record(uuid, uuid, boolean, text), public.retention_still_candidate(uuid), public.retention_run_finish(uuid, integer, jsonb) to service_role;

-- ---------------------------------------------------------------- the hourly cleanup leaves answer audio to retention
create or replace function public.files_due_for_cleanup(p_limit integer default 100)
returns table (id uuid, bucket_name text, storage_path text, status public.file_status, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  with expiry as (
    select coalesce((select (value)::text::int from public.system_settings where key = 'pending_upload_expiry_hours'), 24) as hours
  )
  select f.id, f.bucket_name, f.storage_path, f.status,
         case
           when f.status = 'PENDING' then 'expired_pending'
           when f.status = 'REJECTED' then 'rejected'
           when f.status = 'DELETE_FAILED' then 'retry'
           when f.resource_type = 'SUBMISSION_FILE' then 'expired_draft_file'
           when f.resource_type = 'COURSE_COVER' then 'replaced_course_cover'
           when f.resource_type = 'LESSON_AUDIO' then 'deleted_lesson_audio'
           when f.resource_type = 'LESSON_ATTACHMENT' then 'deleted_lesson_attachment'
           else 'replaced_profile_image'
         end
    from public.file_objects f, expiry e
   where (f.status = 'PENDING' and f.uploaded_at < now() - make_interval(hours => e.hours))
      or f.status = 'REJECTED'
      -- A failed removal is retried here, except a submitted answer's audio: retention-runner retries
      -- that one after checking its holds again (Phase 12, ADR-022).
      or (f.status = 'DELETE_FAILED'
          and not exists (select 1 from public.submission_files sf where sf.file_object_id = f.id)
          and not exists (select 1 from public.exam_answers w where f.id = any (w.audio_file_ids)))
      -- The only VALIDATED files ever removed here: profile images and course covers nobody uses any
      -- more, the files of deleted lesson audio and attachments (ADR-007), and answers' files that
      -- were never sent (decision 4).
      or (f.status = 'VALIDATED' and f.resource_type = 'PROFILE_IMAGE'
          and not exists (select 1 from public.profiles p where p.profile_image_file_id = f.id))
      or (f.status = 'VALIDATED' and f.resource_type = 'COURSE_COVER'
          and not exists (select 1 from public.courses c where c.cover_image_file_id = f.id))
      or (f.status = 'VALIDATED' and f.resource_type = 'LESSON_AUDIO'
          and exists (select 1 from public.lesson_audio_files a where a.file_object_id = f.id and a.lifecycle_status = 'DELETED'))
      or (f.status = 'VALIDATED' and f.resource_type = 'LESSON_ATTACHMENT'
          and exists (select 1 from public.lesson_attachments x where x.file_object_id = f.id and x.removed_at is not null))
      or (f.status = 'VALIDATED' and f.resource_type = 'SUBMISSION_FILE' and f.uploaded_at < now() - make_interval(hours => e.hours)
          and not exists (select 1 from public.submission_files sf where sf.file_object_id = f.id))
   order by f.uploaded_at
   limit greatest(1, least(p_limit, 500));
$$;

-- ---------------------------------------------------------------- schedule
select cron.schedule('retention-runner-daily', '40 2 * * *', $$select private.call_edge_function('retention-runner')$$);
