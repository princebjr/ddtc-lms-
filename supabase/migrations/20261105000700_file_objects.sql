-- Phase 2, migration 7: the file registry (D18, D33), schema only. Rows are created by
-- register-upload and validated by finalize-upload (Phase 6/8), both using the service role.
-- Clients never write here; they see metadata of their own uploads, administrators (AAL2) all.
-- Resource lifecycle (SUPERSEDED, ARCHIVED) lives on resource tables, never here.

create table public.file_objects (
  id uuid primary key default gen_random_uuid(),
  bucket_name text not null check (bucket_name in (
    'lesson-audio', 'lesson-attachments', 'assignment-instructions-audio',
    'learner-submissions', 'profile-images', 'course-covers')),
  storage_path text not null unique check (char_length(storage_path) between 3 and 512 and storage_path !~ '(^/|\.\.)'),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  safe_download_filename text not null check (safe_download_filename ~ '^[A-Za-z0-9._ -]{1,200}$'),
  detected_mime_type text,
  file_size bigint check (file_size is null or file_size > 0),
  duration_seconds numeric(10, 2) check (duration_seconds is null or duration_seconds >= 0),
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  status public.file_status not null default 'PENDING',
  resource_type text not null check (resource_type in (
    'LESSON_AUDIO', 'LESSON_ATTACHMENT', 'ASSIGNMENT_INSTRUCTION_AUDIO',
    'SUBMISSION_FILE', 'PROFILE_IMAGE', 'COURSE_COVER')),
  resource_id uuid,
  checksum text,
  validation_error text,
  uploaded_at timestamptz not null default now(),
  validated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint file_objects_validated_has_facts check (
    status <> 'VALIDATED' or (validated_at is not null and detected_mime_type is not null and file_size is not null)),
  constraint file_objects_deleted_has_time check (status <> 'DELETED' or deleted_at is not null),
  constraint file_objects_rejected_has_reason check (status <> 'REJECTED' or validation_error is not null)
);

create index file_objects_uploaded_by_idx on public.file_objects (uploaded_by);
create index file_objects_resource_idx on public.file_objects (resource_type, resource_id);
create index file_objects_status_idx on public.file_objects (status, uploaded_at);

create trigger file_objects_set_updated_at
  before update on public.file_objects
  for each row execute function private.set_updated_at();

alter table public.file_objects enable row level security;

revoke all on public.file_objects from anon, authenticated;
grant select on public.file_objects to authenticated;
grant select, insert, update on public.file_objects to service_role;

create policy file_objects_select_own on public.file_objects
  for select to authenticated
  using (uploaded_by = (select auth.uid()) and (select private.is_active_user()));

create policy file_objects_select_admin on public.file_objects
  for select to authenticated
  using ((select private.is_admin()));

-- The profile photo is a registered file (D27 item 6, D33).
alter table public.profiles
  add constraint profiles_profile_image_file_id_fkey
  foreign key (profile_image_file_id) references public.file_objects (id) on delete restrict;
