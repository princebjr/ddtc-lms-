-- Phase 5, migration 14: courses, course_lecturers, course_enrollments, the course access helpers
-- and their policies (DATA_MODEL.md section 5; SECURITY_AND_ACCESS.md section 7; D04 to D07, D25,
-- ADR-005). Clients never insert or change status: create-course, course-lifecycle,
-- course-lecturers and manage-enrolments do that through the trusted functions in migration 15.

create type public.course_status as enum ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'ARCHIVED');
create type public.course_permission as enum ('OWNER', 'CO_LECTURER');
create type public.enrolment_status as enum ('ACTIVE', 'COMPLETED', 'WITHDRAWN', 'SUSPENDED');

-- ---------------------------------------------------------------- direct publishing (ADR-005)
-- An administrator may let a lecturer publish without approval. Changed only through
-- set-user-role (admin_set_direct_publish) or by approving with "let them publish directly".
alter table public.profiles
  add column can_publish_directly boolean not null default false,
  add constraint profiles_direct_publish_lecturers_only check (not can_publish_directly or role = 'LECTURER');

-- ---------------------------------------------------------------- courses
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 150),
  course_code text not null check (course_code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  description text not null default '' check (char_length(description) <= 5000),
  learning_objectives text not null default '' check (char_length(learning_objectives) <= 5000),
  category text not null default '' check (char_length(category) <= 100),
  cover_image_file_id uuid references public.file_objects (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  status public.course_status not null default 'DRAFT',
  submitted_by uuid references public.profiles (id) on delete restrict,
  submitted_at timestamptz,
  return_reason text check (return_reason is null or char_length(return_reason) between 3 and 1000),
  published_at timestamptz,
  missing_as_zero boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_archived_has_time check ((status = 'ARCHIVED') = (archived_at is not null))
);

comment on table public.courses is 'D04 lifecycle; D07: no terms or dates; archiving keeps every record.';
create unique index courses_course_code_key on public.courses (course_code);
create index courses_status_idx on public.courses (status, updated_at desc);
create index courses_created_by_idx on public.courses (created_by);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function private.set_updated_at();

-- Normalises text, keeps the lifecycle columns for trusted paths only, keeps ARCHIVED courses
-- read-only for clients, and checks the cover (second layer behind the column grants).
create function private.courses_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.course_code := upper(btrim(new.course_code));
  new.category := btrim(new.category);

  if tg_op = 'UPDATE' and not private.is_trusted_session() then
    if old.status = 'ARCHIVED' then
      raise exception 'This course is archived and read-only' using errcode = '42501';
    end if;
    if new.id is distinct from old.id or new.status is distinct from old.status
       or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
       or new.submitted_by is distinct from old.submitted_by or new.submitted_at is distinct from old.submitted_at
       or new.published_at is distinct from old.published_at or new.archived_at is distinct from old.archived_at
       or new.return_reason is distinct from old.return_reason
       or new.cover_image_file_id is distinct from old.cover_image_file_id then
      raise exception 'These course fields cannot be changed here' using errcode = '42501';
    end if;
  end if;

  if new.cover_image_file_id is not null
     and (tg_op = 'INSERT' or new.cover_image_file_id is distinct from old.cover_image_file_id)
     and not exists (
       select 1 from public.file_objects f
        where f.id = new.cover_image_file_id and f.resource_type = 'COURSE_COVER'
          and f.resource_id = new.id and f.status = 'VALIDATED'
     ) then
    raise exception 'The cover must be a validated cover image of this course' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger courses_guard
  before insert or update on public.courses
  for each row execute function private.courses_guard();

-- ---------------------------------------------------------------- course_lecturers (D06)
-- Removing a lecturer sets removed_at; adding them again reopens the same row (unique pair).
create table public.course_lecturers (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  lecturer_id uuid not null references public.profiles (id) on delete restrict,
  permission_level public.course_permission not null,
  assigned_by uuid not null references public.profiles (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_lecturers_pair_key unique (course_id, lecturer_id),
  constraint course_lecturers_removed_by check ((removed_at is null) = (removed_by is null))
);

create unique index course_lecturers_one_owner on public.course_lecturers (course_id)
  where permission_level = 'OWNER' and removed_at is null;
create index course_lecturers_lecturer_idx on public.course_lecturers (lecturer_id) where removed_at is null;

create trigger course_lecturers_set_updated_at
  before update on public.course_lecturers
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- course_enrollments (D05)
-- One current enrolment per learner and course. WITHDRAWN rows are history: enrolling again
-- creates a new row.
create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  learner_id uuid not null references public.profiles (id) on delete restrict,
  enrolment_status public.enrolment_status not null default 'ACTIVE',
  enrolled_at timestamptz not null default now(),
  enrolled_by uuid not null references public.profiles (id) on delete restrict,
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index course_enrollments_current_key on public.course_enrollments (course_id, learner_id)
  where enrolment_status <> 'WITHDRAWN';
create index course_enrollments_learner_idx on public.course_enrollments (learner_id, enrolment_status);

create trigger course_enrollments_set_updated_at
  before update on public.course_enrollments
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- access helpers
-- SECURITY DEFINER so policies can read these tables without recursing through their own RLS.

-- An ACTIVE lecturer who currently teaches the course (OWNER or CO_LECTURER).
create function private.is_lecturer_of(p_course uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.course_lecturers cl
      join public.profiles p on p.id = cl.lecturer_id
     where cl.course_id = p_course and cl.lecturer_id = (select auth.uid()) and cl.removed_at is null
       and p.role = 'LECTURER' and p.account_status = 'ACTIVE'
  );
$$;

-- An ACTIVE learner with an ACTIVE or COMPLETED enrolment: read access (D05).
create function private.is_enrolled(p_course uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.course_enrollments e
      join public.profiles p on p.id = e.learner_id
     where e.course_id = p_course and e.learner_id = (select auth.uid())
       and e.enrolment_status in ('ACTIVE', 'COMPLETED') and p.account_status = 'ACTIVE'
  );
$$;

-- ACTIVE enrolment in a PUBLISHED course: the only state in which a learner may write (submit,
-- resubmit) in later phases. COMPLETED enrolments and ARCHIVED courses are read-only (D05, D07).
create function private.is_actively_enrolled(p_course uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.course_enrollments e
      join public.profiles p on p.id = e.learner_id
      join public.courses c on c.id = e.course_id
     where e.course_id = p_course and e.learner_id = (select auth.uid())
       and e.enrolment_status = 'ACTIVE' and p.account_status = 'ACTIVE' and c.status = 'PUBLISHED'
  );
$$;

-- Whoever may see the course: administrators (AAL2), its lecturers, and learners enrolled in it
-- once it is PUBLISHED or ARCHIVED.
create function private.can_see_course(p_course uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
      or private.is_lecturer_of(p_course)
      or (private.is_enrolled(p_course)
          and exists (select 1 from public.courses c where c.id = p_course and c.status in ('PUBLISHED', 'ARCHIVED')));
$$;

revoke execute on function private.is_lecturer_of(uuid), private.is_enrolled(uuid), private.is_actively_enrolled(uuid),
  private.can_see_course(uuid) from public;
grant execute on function private.is_lecturer_of(uuid), private.is_enrolled(uuid), private.is_actively_enrolled(uuid),
  private.can_see_course(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- privileges and policies
alter table public.courses enable row level security;
alter table public.course_lecturers enable row level security;
alter table public.course_enrollments enable row level security;

revoke all on public.courses, public.course_lecturers, public.course_enrollments from anon, authenticated;
grant select on public.courses, public.course_lecturers, public.course_enrollments to authenticated;
grant update (title, course_code, description, learning_objectives, category, missing_as_zero) on public.courses to authenticated;
grant select, insert, update on public.courses, public.course_lecturers, public.course_enrollments to service_role;

create policy courses_select_admin on public.courses
  for select to authenticated using ((select private.is_admin()));
create policy courses_select_lecturer on public.courses
  for select to authenticated using ((select private.is_lecturer_of(id)));
create policy courses_select_learner on public.courses
  for select to authenticated using (status in ('PUBLISHED', 'ARCHIVED') and (select private.is_enrolled(id)));
create policy courses_update_admin on public.courses
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy courses_update_lecturer on public.courses
  for update to authenticated using ((select private.is_lecturer_of(id))) with check ((select private.is_lecturer_of(id)));

create policy course_lecturers_select_admin on public.course_lecturers
  for select to authenticated using ((select private.is_admin()));
create policy course_lecturers_select_lecturer on public.course_lecturers
  for select to authenticated using ((select private.is_lecturer_of(course_id)));

create policy course_enrollments_select_admin on public.course_enrollments
  for select to authenticated using ((select private.is_admin()));
create policy course_enrollments_select_lecturer on public.course_enrollments
  for select to authenticated using ((select private.is_lecturer_of(course_id)));
create policy course_enrollments_select_own on public.course_enrollments
  for select to authenticated using (learner_id = (select auth.uid()) and (select private.is_active_user()));

-- ---------------------------------------------------------------- names for lecturers and learners
-- Lecturers see the learners of their own courses by name and photo only (SECURITY_AND_ACCESS
-- section 7). A row policy on profiles would also expose email and phone, so the roster is a
-- function that returns exactly these columns.
create function public.course_roster(p_course uuid)
returns table (
  enrolment_id uuid, learner_id uuid, first_name text, second_name text,
  profile_image_path text, enrolment_status public.enrolment_status, enrolled_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_admin() or private.is_lecturer_of(p_course)) then
    raise exception 'Only the course''s lecturers can see its learners' using errcode = '42501';
  end if;
  return query
    select e.id, p.id, p.first_name, p.second_name,
           (select f.storage_path from public.file_objects f where f.id = p.profile_image_file_id and f.status = 'VALIDATED'),
           e.enrolment_status, e.enrolled_at
      from public.course_enrollments e
      join public.profiles p on p.id = e.learner_id
     where e.course_id = p_course and e.enrolment_status <> 'WITHDRAWN'
     order by p.first_name, p.second_name;
end;
$$;

-- Who teaches a course, for anyone who may see it (learners see their lecturers' names).
create function public.course_teachers(p_course uuid)
returns table (lecturer_id uuid, first_name text, second_name text, profile_image_path text, permission_level public.course_permission)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.first_name, p.second_name,
         (select f.storage_path from public.file_objects f where f.id = p.profile_image_file_id and f.status = 'VALIDATED'),
         cl.permission_level
    from public.course_lecturers cl
    join public.profiles p on p.id = cl.lecturer_id
   where cl.course_id = p_course and cl.removed_at is null and private.can_see_course(p_course)
   order by cl.permission_level, p.first_name;
$$;

revoke execute on function public.course_roster(uuid), public.course_teachers(uuid) from public, anon;
grant execute on function public.course_roster(uuid), public.course_teachers(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- audit of the new profile flag
create or replace function private.audit_profile_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    perform private.write_audit('profile.role_changed', 'profile', new.id::text,
      jsonb_build_object('old_role', old.role, 'new_role', new.role));
  end if;
  if new.account_status is distinct from old.account_status then
    perform private.write_audit('profile.status_changed', 'profile', new.id::text,
      jsonb_build_object('old_status', old.account_status, 'new_status', new.account_status));
  end if;
  if new.can_create_courses is distinct from old.can_create_courses then
    perform private.write_audit('profile.course_creation_changed', 'profile', new.id::text,
      jsonb_build_object('old_value', old.can_create_courses, 'new_value', new.can_create_courses));
  end if;
  -- ADR-005
  if new.can_publish_directly is distinct from old.can_publish_directly then
    perform private.write_audit('profile.direct_publish_changed', 'profile', new.id::text,
      jsonb_build_object('old_value', old.can_publish_directly, 'new_value', new.can_publish_directly));
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------- column protection for the new flag
-- Same as Phase 2's guard, plus can_publish_directly in the list clients may never change.
create or replace function private.profiles_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.first_name := btrim(new.first_name);
  new.second_name := btrim(new.second_name);

  if not private.is_trusted_session() then
    if new.id is distinct from old.id or new.email is distinct from old.email
       or new.role is distinct from old.role or new.account_status is distinct from old.account_status
       or new.can_create_courses is distinct from old.can_create_courses
       or new.can_publish_directly is distinct from old.can_publish_directly
       or new.created_at is distinct from old.created_at then
      raise exception 'These profile fields cannot be changed here' using errcode = '42501';
    end if;
    if new.first_name = '' and old.first_name <> '' or new.second_name = '' and old.second_name <> '' then
      raise exception 'First name and second name cannot be empty' using errcode = '23514';
    end if;
  end if;

  if new.profile_image_file_id is distinct from old.profile_image_file_id and new.profile_image_file_id is not null then
    if not exists (
      select 1 from public.file_objects f
       where f.id = new.profile_image_file_id
         and f.uploaded_by = new.id
         and f.resource_type = 'PROFILE_IMAGE'
         and f.status = 'VALIDATED'
    ) then
      raise exception 'The profile image must be your own validated upload' using errcode = '42501';
    end if;
  end if;

  new.profile_completed := new.first_name <> '' and new.second_name <> '';
  return new;
end;
$$;
