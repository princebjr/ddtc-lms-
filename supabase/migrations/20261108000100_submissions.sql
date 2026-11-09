-- Phase 8, migration 26: submissions, their versions and files, the learner-submissions bucket and
-- their access rules (DATA_MODEL.md sections 5 and 6; D10, D17, D18, D19, D25, D33; ADR-009; owner
-- decisions of 2026-11-08). Clients never write these tables: submit-assignment, register-upload and
-- finalize-upload do, through the trusted functions in migration 27, with lateness from server time.
-- Also here: an extension that is taken back is kept and marked (decision 6); lesson audio accepts
-- in-app recordings in WebM and Ogg (decision 5, ADR-007); failed file removals are counted for the
-- cleanup alert list (D18); answers' files never sent are cleaned up after 24 hours (decision 4).

create type public.submission_status as enum ('DRAFT', 'SUBMITTED', 'GRADED', 'REOPENED');
create type public.grade_release_status as enum ('DRAFT', 'RELEASED');
create type public.submission_file_role as enum ('AUDIO', 'PDF', 'DOCX', 'OTHER');

-- ---------------------------------------------------------------- submissions (one per learner and assignment)
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete restrict,
  learner_id uuid not null references public.profiles (id) on delete restrict,
  status public.submission_status not null default 'DRAFT',
  current_version integer not null default 0 check (current_version >= 0),
  is_late boolean not null default false,
  -- Grading: written in Phase 9 (which adds the 0 to max_marks trigger and the release rules).
  score numeric(7, 2) check (score is null or score >= 0),
  feedback text check (feedback is null or char_length(feedback) <= 10000),
  graded_by uuid references public.profiles (id) on delete restrict,
  graded_at timestamptz,
  grade_release_status public.grade_release_status not null default 'DRAFT',
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submissions_assignment_learner_key unique (assignment_id, learner_id),
  -- Only a draft (uploads waiting, nothing sent yet) has no version (D10).
  constraint submissions_version_matches_status check ((status = 'DRAFT') = (current_version = 0))
);
create index submissions_learner_idx on public.submissions (learner_id);

create trigger submissions_set_updated_at
  before update on public.submissions
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- versions (kept for ever)
create table public.submission_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  -- Plain text (owner decision 2): always shown as text, never as HTML, so there is nothing to clean.
  text_answer text not null default '' check (char_length(text_answer) <= 20000),
  submitted_at timestamptz not null default now(),
  is_late boolean not null,
  -- The request that made this version: the same request sent twice returns it instead of a second one.
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submission_versions_number_key unique (submission_id, version_number),
  constraint submission_versions_request_key unique (submission_id, client_request_id)
);

create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_version_id uuid not null references public.submission_versions (id) on delete restrict,
  file_object_id uuid not null references public.file_objects (id) on delete restrict,
  file_role public.submission_file_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submission_files_file_key unique (file_object_id)
);
create index submission_files_version_idx on public.submission_files (submission_version_id);

/** Submitted answers are records (D10, D25): a version and its files never change and are never deleted. */
create function private.keep_submitted_answers() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Submitted answers are never changed or deleted' using errcode = '42501';
end;
$$;
create trigger submission_versions_keep before update or delete on public.submission_versions
  for each row execute function private.keep_submitted_answers();
create trigger submission_versions_keep_truncate before truncate on public.submission_versions
  for each statement execute function private.keep_submitted_answers();
create trigger submission_files_keep before update or delete on public.submission_files
  for each row execute function private.keep_submitted_answers();
create trigger submission_files_keep_truncate before truncate on public.submission_files
  for each statement execute function private.keep_submitted_answers();

/**
 * A file joins a version only in the transaction that submits it (never later), only when it is a
 * validated file of that version's own submission, and at most max_files_per_submission_version
 * (5, D10) files go into one version.
 */
create function private.submission_files_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_version public.submission_versions;
  v_max integer := coalesce((select (value)::text::int from public.system_settings where key = 'max_files_per_submission_version'), 5);
begin
  select * into v_version from public.submission_versions where id = new.submission_version_id;
  if v_version.created_at is distinct from now() then
    raise exception 'Files join an answer only when it is submitted' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.file_objects f
     where f.id = new.file_object_id and f.status = 'VALIDATED'
       and f.resource_type = 'SUBMISSION_FILE' and f.resource_id = v_version.submission_id
  ) then
    raise exception 'A version takes only validated files of its own submission' using errcode = '22023';
  end if;
  if (select count(*) from public.submission_files where submission_version_id = new.submission_version_id) >= v_max then
    raise exception 'You can add at most % files', v_max using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger submission_files_guard before insert on public.submission_files
  for each row execute function private.submission_files_guard();

-- ---------------------------------------------------------------- extensions are taken back, never deleted (decision 6)
alter table public.submission_extensions
  add column revoked_at timestamptz,
  add column revoked_by uuid references public.profiles (id) on delete restrict,
  add constraint submission_extensions_revoked_together check ((revoked_at is null) = (revoked_by is null));
alter table public.submission_extensions drop constraint submission_extensions_assignment_learner_key;
create unique index submission_extensions_current_key on public.submission_extensions (assignment_id, learner_id) where revoked_at is null;

/** D13: the learner's standing extension when they have one, otherwise the assignment's due date. */
create or replace function private.effective_due_at(p_assignment uuid, p_learner uuid) returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select x.extended_due_at from public.submission_extensions x
      where x.assignment_id = p_assignment and x.learner_id = p_learner and x.revoked_at is null),
    (select a.due_at from public.assignments a where a.id = p_assignment));
$$;

-- A learner sees only the extension that stands; the course's managers see the history too.
drop policy submission_extensions_select_own on public.submission_extensions;
create policy submission_extensions_select_own on public.submission_extensions
  for select to authenticated
  using (learner_id = (select auth.uid()) and revoked_at is null and (select private.is_active_user()));

-- ---------------------------------------------------------------- failed removals are counted (D18)
alter table public.file_objects
  add column delete_attempts integer not null default 0 check (delete_attempts >= 0),
  add column last_delete_error text check (last_delete_error is null or char_length(last_delete_error) <= 1000);

-- ---------------------------------------------------------------- who may see a submission
/**
 * The learner (their own, drafts included, while their account is active), and the course's
 * lecturers and AAL2 administrators for submitted answers only (a draft is not an answer yet).
 */
create function private.can_see_submission(p_submission uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.submissions s
      join public.assignments a on a.id = s.assignment_id
     where s.id = p_submission
       and ((s.learner_id = (select auth.uid()) and private.is_active_user())
            or (s.status <> 'DRAFT' and private.can_manage_course(a.course_id)))
  );
$$;

/**
 * Storage rule for learner-submissions (D19): a VALIDATED submission file, read by the learner who
 * uploaded it (sent or still waiting), or by the course's lecturers and AAL2 administrators once it
 * is part of a submitted version.
 */
create function private.can_read_submission_object(p_bucket text, p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.file_objects f
      join public.submissions s on s.id = f.resource_id
      join public.assignments a on a.id = s.assignment_id
     where f.bucket_name = p_bucket and f.storage_path = p_name and f.status = 'VALIDATED'
       and f.resource_type = 'SUBMISSION_FILE'
       and ((s.learner_id = (select auth.uid()) and f.uploaded_by = s.learner_id)
            or (private.can_manage_course(a.course_id)
                and exists (select 1 from public.submission_files sf where sf.file_object_id = f.id)))
  );
$$;

revoke execute on function private.can_see_submission(uuid), private.can_read_submission_object(text, text) from public;
grant execute on function private.can_see_submission(uuid), private.can_read_submission_object(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------- privileges and policies
alter table public.submissions enable row level security;
alter table public.submission_versions enable row level security;
alter table public.submission_files enable row level security;

revoke all on public.submissions, public.submission_versions, public.submission_files from anon, authenticated;
-- Grading columns stay closed until Phase 9 opens them (learners see released grades only, D16).
grant select (id, assignment_id, learner_id, status, current_version, is_late, grade_release_status, released_at, created_at, updated_at)
  on public.submissions to authenticated;
grant select on public.submission_versions, public.submission_files to authenticated;
grant select, insert, update on public.submissions to service_role;
grant select, insert on public.submission_versions, public.submission_files to service_role;

create policy submissions_select on public.submissions
  for select to authenticated using (private.can_see_submission(id));
create policy submission_versions_select on public.submission_versions
  for select to authenticated using (private.can_see_submission(submission_id));
create policy submission_files_select on public.submission_files
  for select to authenticated
  using (exists (select 1 from public.submission_versions v where v.id = submission_version_id and private.can_see_submission(v.submission_id)));

-- ---------------------------------------------------------------- bucket (D17)
-- Audio up to 25 MB and 10 minutes, PDF and Word up to 10 MB (finalize-upload checks each kind).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('learner-submissions', 'learner-submissions', false, 26214400,
   array['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'application/pdf',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

create policy learner_submissions_read on storage.objects
  for select to authenticated
  using (bucket_id = 'learner-submissions' and (select private.is_active_user()) and private.can_read_submission_object(bucket_id, name));

-- ---------------------------------------------------------------- lesson audio recorded in the app (decision 5)
-- Chrome, Android and Firefox record in WebM or Ogg (Opus); Safari in MP4. Limits are unchanged.
update storage.buckets set allowed_mime_types = array['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg']
 where id = 'lesson-audio';
update public.system_settings
   set value = jsonb_set(value, '{lesson_audio,extensions}', '["mp3", "m4a", "wav", "webm", "ogg"]'::jsonb)
 where key = 'file_limits';

-- ---------------------------------------------------------------- shared shapes for the read functions
/** The answer kind of a validated file, from its real type (never the name). */
create function private.submission_role_for(p_mime text) returns public.submission_file_role
language sql
immutable
set search_path = ''
as $$
  select case
    when p_mime in ('audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg') then 'AUDIO'::public.submission_file_role
    when p_mime = 'application/pdf' then 'PDF'::public.submission_file_role
    when p_mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'DOCX'::public.submission_file_role
  end;
$$;

/** A file's facts for playing, opening and listing (callers check access first). */
create function private.submission_file_json(p_file uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', f.id, 'original_filename', f.original_filename, 'safe_download_filename', f.safe_download_filename,
    'mime_type', f.detected_mime_type, 'file_size', f.file_size, 'duration_seconds', f.duration_seconds,
    'waveform_peaks', f.waveform_peaks, 'status', f.status, 'validation_error', f.validation_error,
    'bucket_name', f.bucket_name, 'storage_path', f.storage_path,
    'file_role', coalesce((select sf.file_role from public.submission_files sf where sf.file_object_id = f.id), private.submission_role_for(f.detected_mime_type)),
    'uploaded_at', f.uploaded_at)
    from public.file_objects f where f.id = p_file;
$$;

/** A submitted version with its files, in the order they were added (callers check access first). */
create function private.submission_version_json(p_version uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', v.id, 'version_number', v.version_number, 'submitted_at', v.submitted_at, 'is_late', v.is_late,
    'text_answer', v.text_answer,
    'files', coalesce((select jsonb_agg(private.submission_file_json(sf.file_object_id) order by sf.created_at, sf.id)
                         from public.submission_files sf where sf.submission_version_id = v.id), '[]'::jsonb))
    from public.submission_versions v where v.id = p_version;
$$;

revoke execute on function private.submission_role_for(text), private.submission_file_json(uuid), private.submission_version_json(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- the lecturer's list and one answer
/**
 * Every learner of the assignment's course (any enrolment but WITHDRAWN, and anyone who has sent an
 * answer) with their branch (D42), submission status, version, time, lateness and effective due
 * date (D13). Drafts show as not submitted. Only the course's lecturers and AAL2 administrators get
 * rows.
 */
create function public.assignment_submissions(p_assignment uuid)
returns table (
  learner_id uuid, first_name text, second_name text, id_number integer, branch_name text, profile_image_path text,
  enrolment_status public.enrolment_status, submission_id uuid, status public.submission_status, current_version integer,
  submitted_at timestamptz, is_late boolean, extended_due_at timestamptz, effective_due_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select x.id, x.course_id, x.due_at from public.assignments x
     where x.id = p_assignment and private.can_manage_course(x.course_id)
  ), ids as (
    select e.learner_id from public.course_enrollments e join a on a.course_id = e.course_id where e.enrolment_status <> 'WITHDRAWN'
    union
    select s.learner_id from public.submissions s join a on a.id = s.assignment_id where s.status <> 'DRAFT'
  )
  select p.id, p.first_name, p.second_name, p.id_number,
         (select b.name from public.branches b where b.id = p.branch_id),
         (select f.storage_path from public.file_objects f where f.id = p.profile_image_file_id and f.status = 'VALIDATED'),
         coalesce((select e.enrolment_status from public.course_enrollments e
                    where e.course_id = a.course_id and e.learner_id = p.id and e.enrolment_status <> 'WITHDRAWN'
                    order by e.enrolled_at desc limit 1), 'WITHDRAWN'::public.enrolment_status),
         s.id, s.status, s.current_version,
         (select v.submitted_at from public.submission_versions v where v.submission_id = s.id and v.version_number = s.current_version),
         s.is_late, x.extended_due_at, coalesce(x.extended_due_at, a.due_at)
    from ids
    cross join a
    join public.profiles p on p.id = ids.learner_id
    left join public.submissions s on s.assignment_id = a.id and s.learner_id = p.id and s.status <> 'DRAFT'
    left join public.submission_extensions x on x.assignment_id = a.id and x.learner_id = p.id and x.revoked_at is null
   order by p.first_name, p.second_name;
$$;

/**
 * One learner's answer for the course's lecturers and AAL2 administrators: the learner, the due
 * dates, the status and every submitted version with its files (newest first). Null for anyone else.
 */
create function public.submission_review(p_assignment uuid, p_learner uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'learner', jsonb_build_object(
      'id', p.id, 'first_name', p.first_name, 'second_name', p.second_name, 'id_number', p.id_number,
      'branch_name', (select b.name from public.branches b where b.id = p.branch_id),
      'profile_image_path', (select f.storage_path from public.file_objects f where f.id = p.profile_image_file_id and f.status = 'VALIDATED')),
    'due_at', a.due_at,
    'extended_due_at', x.extended_due_at,
    'extension_reason', x.reason,
    'effective_due_at', coalesce(x.extended_due_at, a.due_at),
    'status', s.status,
    'current_version', coalesce(s.current_version, 0),
    'is_late', coalesce(s.is_late, false),
    'versions', coalesce((select jsonb_agg(private.submission_version_json(v.id) order by v.version_number desc)
                            from public.submission_versions v where v.submission_id = s.id), '[]'::jsonb))
    from public.assignments a
    join public.profiles p on p.id = p_learner and p.role = 'LEARNER'
    left join public.submissions s on s.assignment_id = a.id and s.learner_id = p.id and s.status <> 'DRAFT'
    left join public.submission_extensions x on x.assignment_id = a.id and x.learner_id = p.id and x.revoked_at is null
   where a.id = p_assignment and private.can_manage_course(a.course_id);
$$;

revoke execute on function public.assignment_submissions(uuid), public.submission_review(uuid, uuid) from public, anon;
grant execute on function public.assignment_submissions(uuid), public.submission_review(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- cleanup-files: answers' files never sent (decision 4)
-- As migration 21, plus validated submission files that never joined a version and have waited
-- longer than pending uploads may (24 hours). A file in a submitted version is never listed.
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
      or f.status in ('REJECTED', 'DELETE_FAILED')
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

/**
 * Files that have failed to be removed three times or more, for administrators (AAL2). Phase 11 turns
 * this list into an administrator alert; until then the runbook shows how to read it.
 */
create function public.cleanup_failures()
returns table (id uuid, bucket_name text, storage_path text, resource_type text, status public.file_status,
               delete_attempts integer, last_delete_error text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.bucket_name, f.storage_path, f.resource_type, f.status, f.delete_attempts, f.last_delete_error, f.updated_at
    from public.file_objects f
   where private.is_admin() and f.delete_attempts >= 3 and f.status <> 'DELETED'
   order by f.updated_at desc
   limit 200;
$$;
revoke execute on function public.cleanup_failures() from public, anon;
grant execute on function public.cleanup_failures() to authenticated, service_role;
