-- Phase 2, migration 2: profiles, the access helpers and column protection.
-- D02: role and can_create_courses change only through set-user-role (service role).
-- D03: only ACTIVE users can use the system. D22/D32: every ADMIN policy requires AAL2.
-- D25: ON DELETE RESTRICT; accounts are deactivated, never deleted.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  first_name text not null default '' check (char_length(first_name) <= 100),
  second_name text not null default '' check (char_length(second_name) <= 100),
  email text not null check (char_length(email) between 3 and 320),
  contact_number text check (contact_number is null or contact_number ~ '^\+?[0-9][0-9 ()-]{5,19}$'),
  role public.user_role not null default 'LEARNER',
  can_create_courses boolean not null default false,
  account_status public.account_status not null default 'ACTIVE',
  profile_completed boolean not null default false,
  profile_image_file_id uuid, -- foreign key added with file_objects
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_course_creation_lecturers_only check (not can_create_courses or role = 'LECTURER')
);

comment on table public.profiles is 'One row per auth user. Role, status and can_create_courses are not user-editable (D02, D03).';
create unique index profiles_email_key on public.profiles (lower(email));
create index profiles_role_status_idx on public.profiles (role, account_status);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- access helpers
-- SECURITY DEFINER so policies can read profiles without recursing through profiles' own RLS.

create function private.is_active_user() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.account_status = 'ACTIVE'
  );
$$;

-- Administrator: role ADMIN, ACTIVE, and an AAL2 (MFA-verified) session (D22, D32).
create function private.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (
       select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.role = 'ADMIN' and p.account_status = 'ACTIVE'
     );
$$;

create function private.is_active_lecturer() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.role = 'LECTURER' and p.account_status = 'ACTIVE'
  );
$$;

revoke execute on function private.is_active_user(), private.is_admin(), private.is_active_lecturer() from public;
grant execute on function private.is_active_user(), private.is_admin(), private.is_active_lecturer() to authenticated, service_role;

-- ---------------------------------------------------------------- column protection (second layer)
-- The first layer is the column-level UPDATE grant below. This trigger also covers trusted paths
-- for derived values and validates the profile image reference.
create function private.profiles_guard() returns trigger
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

-- ---------------------------------------------------------------- privileges and policies
alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, second_name, contact_number, profile_image_file_id) on public.profiles to authenticated;
grant select, insert, update on public.profiles to service_role;

-- Own row is readable in any status, so the app can show the suspended or deactivated state.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using ((select private.is_admin()));

create policy profiles_update_own_active on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select private.is_active_user()))
  with check (id = (select auth.uid()));

create trigger profiles_guard
  before update on public.profiles
  for each row execute function private.profiles_guard();
