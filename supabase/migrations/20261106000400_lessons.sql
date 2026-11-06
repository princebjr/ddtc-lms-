-- Phase 6, migration 17: lessons, lesson audio, lesson attachments and lesson progress, their access
-- rules, the lesson-audio and lesson-attachments buckets, and waveform peaks on file_objects
-- (DATA_MODEL.md sections 5 and 6; D05, D07, D08, D09, D17, D18, D19, D25, D33; ADR-006).
-- Clients never write lessons or lesson files: manage-lessons (which cleans the HTML) and
-- finalize-upload do that through the trusted functions in migration 18. Learners record their own
-- progress through mark_lesson(), which checks the D05/D07 read-only rules.

create type public.publication_status as enum ('DRAFT', 'PUBLISHED');
create type public.audio_lifecycle as enum ('ACTIVE', 'SUPERSEDED', 'ARCHIVED');
create type public.completion_status as enum ('IN_PROGRESS', 'COMPLETED');

-- ---------------------------------------------------------------- waveform peaks (ADR-006)
-- 128 values from 0 to 1, computed in the uploader's browser and checked by finalize-upload.
create function private.valid_peaks(p real[]) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null
      or (array_ndims(p) = 1 and array_length(p, 1) = 128
          and not exists (select 1 from unnest(p) v where v is null or v = 'NaN'::real or v < 0 or v > 1));
$$;
revoke execute on function private.valid_peaks(real[]) from public;
grant execute on function private.valid_peaks(real[]) to authenticated, service_role;

alter table public.file_objects
  add column waveform_peaks real[],
  add constraint file_objects_peaks_valid check (private.valid_peaks(waveform_peaks));

-- ---------------------------------------------------------------- lessons (D08)
-- Content is HTML already cleaned by manage-lessons against an allow-list. The check below is a
-- second layer: no script-like elements, no event handlers or script URLs inside tags.
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  title text not null check (char_length(title) between 3 and 200),
  content text not null default '' check (
    char_length(content) <= 200000
    and content !~* '<\s*/?\s*(script|iframe|frame|object|embed|style|form|input|button|textarea|select|link|meta|base|svg|math)\b'
    and content !~* '<[^>]*\son[a-z]+\s*='
    and content !~* '<[^>]*(javascript|vbscript|data)\s*:'
  ),
  position integer not null check (position > 0),
  publication_status public.publication_status not null default 'DRAFT',
  created_by uuid not null references public.profiles (id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferrable so a reorder can move every lesson in one transaction (D08).
  constraint lessons_course_position_key unique (course_id, position) deferrable initially immediate
);
create index lessons_course_idx on public.lessons (course_id, position);

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- lesson audio (D09)
create table public.lesson_audio_files (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  file_object_id uuid not null unique references public.file_objects (id) on delete restrict,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  lifecycle_status public.audio_lifecycle not null default 'ACTIVE',
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index lesson_audio_files_one_active on public.lesson_audio_files (lesson_id) where lifecycle_status = 'ACTIVE';

create trigger lesson_audio_files_set_updated_at
  before update on public.lesson_audio_files
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- lesson attachments
-- Removing an attachment sets removed_at; the row and the file are kept (D25).
create table public.lesson_attachments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  file_object_id uuid not null unique references public.file_objects (id) on delete restrict,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 200),
  position integer not null check (position > 0),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_attachments_removed_by check ((removed_at is null) = (removed_by is null))
);
create index lesson_attachments_lesson_idx on public.lesson_attachments (lesson_id, position) where removed_at is null;

create trigger lesson_attachments_set_updated_at
  before update on public.lesson_attachments
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- lesson progress
create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles (id) on delete restrict,
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  completion_status public.completion_status not null default 'IN_PROGRESS',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_progress_learner_lesson_key unique (learner_id, lesson_id),
  constraint lesson_progress_completed_has_time check ((completion_status = 'COMPLETED') = (completed_at is not null))
);
create index lesson_progress_lesson_idx on public.lesson_progress (lesson_id);

create trigger lesson_progress_set_updated_at
  before update on public.lesson_progress
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- access helpers
-- Administrators (AAL2) and the course's active lecturers manage a lesson and its files.
create function private.can_manage_lesson(p_lesson uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lessons l
     where l.id = p_lesson and (private.is_admin() or private.is_lecturer_of(l.course_id))
  );
$$;

-- Whoever may see a lesson: its managers, and learners enrolled (ACTIVE or COMPLETED) in its
-- PUBLISHED or ARCHIVED course once the lesson is PUBLISHED.
create function private.can_see_lesson(p_lesson uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lessons l
     where l.id = p_lesson
       and private.can_see_course(l.course_id)
       and (l.publication_status = 'PUBLISHED' or private.is_admin() or private.is_lecturer_of(l.course_id))
  );
$$;

-- Storage rule for lesson-audio and lesson-attachments (D19): a VALIDATED file of a lesson, read by
-- the lesson's managers (history included), or by a learner who may see the lesson when the file is
-- the ACTIVE audio or an attachment that was not removed.
create function private.can_read_lesson_object(p_bucket text, p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.file_objects f
     where f.bucket_name = p_bucket and f.storage_path = p_name and f.status = 'VALIDATED'
       and f.resource_type in ('LESSON_AUDIO', 'LESSON_ATTACHMENT')
       and (
         private.can_manage_lesson(f.resource_id)
         or (p_bucket = 'lesson-audio' and exists (
               select 1 from public.lesson_audio_files a
                where a.file_object_id = f.id and a.lifecycle_status = 'ACTIVE' and private.can_see_lesson(a.lesson_id)))
         or (p_bucket = 'lesson-attachments' and exists (
               select 1 from public.lesson_attachments x
                where x.file_object_id = f.id and x.removed_at is null and private.can_see_lesson(x.lesson_id)))
       )
  );
$$;

revoke execute on function private.can_manage_lesson(uuid), private.can_see_lesson(uuid), private.can_read_lesson_object(text, text) from public;
grant execute on function private.can_manage_lesson(uuid), private.can_see_lesson(uuid), private.can_read_lesson_object(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------- privileges and policies
alter table public.lessons enable row level security;
alter table public.lesson_audio_files enable row level security;
alter table public.lesson_attachments enable row level security;
alter table public.lesson_progress enable row level security;

revoke all on public.lessons, public.lesson_audio_files, public.lesson_attachments, public.lesson_progress from anon, authenticated;
grant select on public.lessons, public.lesson_audio_files, public.lesson_attachments, public.lesson_progress to authenticated;
grant select, insert, update on public.lessons, public.lesson_audio_files, public.lesson_attachments, public.lesson_progress to service_role;

create policy lessons_select on public.lessons
  for select to authenticated
  using (
    (select private.can_see_course(course_id))
    and (publication_status = 'PUBLISHED' or (select private.is_admin()) or (select private.is_lecturer_of(course_id)))
  );

create policy lesson_audio_files_select_managers on public.lesson_audio_files
  for select to authenticated using ((select private.can_manage_lesson(lesson_id)));

create policy lesson_attachments_select_managers on public.lesson_attachments
  for select to authenticated using ((select private.can_manage_lesson(lesson_id)));

create policy lesson_progress_select_own on public.lesson_progress
  for select to authenticated using (learner_id = (select auth.uid()) and (select private.is_active_user()));
create policy lesson_progress_select_managers on public.lesson_progress
  for select to authenticated using ((select private.can_manage_lesson(lesson_id)));

-- ---------------------------------------------------------------- the player's facts
-- file_objects shows people only their own uploads, so learners get a lesson's ACTIVE audio and its
-- attachments here, and only for lessons they may see. Paths are then signed with the user's own
-- session (D19); Storage checks again.
create function public.lesson_media(p_lesson uuid)
returns table (
  kind text, item_id uuid, file_object_id uuid, title text, bucket_name text, storage_path text,
  safe_download_filename text, mime_type text, file_size bigint, duration_seconds numeric,
  waveform_peaks real[], sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'AUDIO', a.id, f.id, f.original_filename, f.bucket_name, f.storage_path, f.safe_download_filename,
         f.detected_mime_type, f.file_size, f.duration_seconds, f.waveform_peaks, 0
    from public.lesson_audio_files a
    join public.file_objects f on f.id = a.file_object_id and f.status = 'VALIDATED'
   where a.lesson_id = p_lesson and a.lifecycle_status = 'ACTIVE' and private.can_see_lesson(p_lesson)
  union all
  select 'ATTACHMENT', x.id, f.id, x.title, f.bucket_name, f.storage_path, f.safe_download_filename,
         f.detected_mime_type, f.file_size, null, null, x.position
    from public.lesson_attachments x
    join public.file_objects f on f.id = x.file_object_id and f.status = 'VALIDATED'
   where x.lesson_id = p_lesson and x.removed_at is null and private.can_see_lesson(p_lesson)
   order by 1, 12;
$$;
revoke execute on function public.lesson_media(uuid) from public, anon;
grant execute on function public.lesson_media(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- learner progress
-- Only an ACTIVE learner in a PUBLISHED course may change progress on a PUBLISHED lesson: a
-- COMPLETED enrolment (D05) and an ARCHIVED course (D07) are read-only.
create function public.mark_lesson(p_lesson uuid, p_completed boolean) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course uuid;
  v_status public.completion_status := case when p_completed then 'COMPLETED' else 'IN_PROGRESS' end;
begin
  select course_id into v_course from public.lessons where id = p_lesson and publication_status = 'PUBLISHED';
  if v_course is null or not private.is_actively_enrolled(v_course) then
    raise exception 'You cannot change progress on this lesson' using errcode = '42501';
  end if;
  insert into public.lesson_progress (learner_id, lesson_id, completion_status, completed_at)
  values ((select auth.uid()), p_lesson, v_status, case when p_completed then now() end)
  on conflict (learner_id, lesson_id) do update
    set completion_status = excluded.completion_status, completed_at = excluded.completed_at;
  return v_status::text;
end;
$$;
revoke execute on function public.mark_lesson(uuid, boolean) from public, anon;
grant execute on function public.mark_lesson(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- buckets (D17)
-- The browser always sends one of these types (chosen from the extension); finalize-upload checks
-- the real bytes, size and duration and validates or rejects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('lesson-audio', 'lesson-audio', false, 104857600, array['audio/mpeg', 'audio/mp4', 'audio/wav']),
  ('lesson-attachments', 'lesson-attachments', false, 26214400, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation']);

create policy lesson_audio_read on storage.objects
  for select to authenticated
  using (bucket_id = 'lesson-audio' and (select private.is_active_user()) and private.can_read_lesson_object(bucket_id, name));

create policy lesson_attachments_read on storage.objects
  for select to authenticated
  using (bucket_id = 'lesson-attachments' and (select private.is_active_user()) and private.can_read_lesson_object(bucket_id, name));
