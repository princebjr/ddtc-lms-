-- Phase 7, migration 24 (D42, owner request 2026-11-07): learner branches.
--   * Six branches, seeded exactly as DDTC gave them; the app loads the names from this table.
--   * profiles.branch_id: one branch or none, learners only. A learner sets or changes only their
--     own; a verified administrator (AAL2, is_admin) changes any learner's branch and nothing else of
--     theirs; the branch must exist and be active.
--   * Lecturers read the branch of learners in courses they teach, through course_roster; learners
--     never read another learner's branch (the existing profile rules).
--   * Every change is audited (profile.branch_changed, with who changed it, from and to).
--   * A branch is never deleted: no client may change the table, and a branch in use is protected by
--     ON DELETE RESTRICT.

-- ---------------------------------------------------------------- branches
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 80),
  position integer not null unique check (position > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.branches (name, position) values
  ('Kasoa C.P', 1),
  ('Affumkrom - Nsawam', 2),
  ('Sampa', 3),
  ('Amanfrom', 4),
  ('Kumasi', 5),
  ('Atwitwiriso', 6);

alter table public.branches enable row level security;
revoke all on public.branches from anon, authenticated;
grant select on public.branches to authenticated;
grant select, insert, update on public.branches to service_role;
create policy branches_select on public.branches for select to authenticated using (true);

-- ---------------------------------------------------------------- the learner's branch
alter table public.profiles add column branch_id uuid references public.branches (id) on delete restrict;
create index profiles_branch_idx on public.profiles (branch_id) where branch_id is not null;
grant update (branch_id) on public.profiles to authenticated;

-- A verified administrator may change a learner's branch (the guard below allows nothing else).
create policy profiles_update_admin_branch on public.profiles
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- As migration 14's guard, plus: someone changing another person's profile (an administrator under
-- profiles_update_admin_branch) may change only the branch; and a branch must exist, be active and
-- belong to a learner.
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
    if (select auth.uid()) is distinct from new.id
       and (new.first_name is distinct from old.first_name or new.second_name is distinct from old.second_name
            or new.contact_number is distinct from old.contact_number or new.profile_image_file_id is distinct from old.profile_image_file_id) then
      raise exception 'Only the branch can be changed on another person''s profile' using errcode = '42501';
    end if;
    if new.first_name = '' and old.first_name <> '' or new.second_name = '' and old.second_name <> '' then
      raise exception 'First name and second name cannot be empty' using errcode = '23514';
    end if;
  end if;

  if new.branch_id is distinct from old.branch_id and new.branch_id is not null then
    if not exists (select 1 from public.branches b where b.id = new.branch_id and b.is_active) then
      raise exception 'Choose one of the branches' using errcode = '22023';
    end if;
    if new.role <> 'LEARNER' then
      raise exception 'Only learners have a branch' using errcode = '22023';
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

-- Every change of a learner's branch is audited, with who made it (the learner or an administrator).
create function private.audit_branch_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.write_audit('profile.branch_changed', 'profile', new.id::text, jsonb_build_object(
    'from', (select name from public.branches where id = old.branch_id),
    'to', (select name from public.branches where id = new.branch_id),
    'from_id', old.branch_id,
    'to_id', new.branch_id));
  return null;
end;
$$;
revoke execute on function private.audit_branch_change() from public;

create trigger profiles_audit_branch
  after update of branch_id on public.profiles
  for each row
  when (old.branch_id is distinct from new.branch_id)
  execute function private.audit_branch_change();

-- ---------------------------------------------------------------- lecturers read their learners' branches
-- As migration 21, plus branch_name: a course's lecturers see its learners by name, photo, ID number
-- and branch (SECURITY_AND_ACCESS section 7, ADR-008, D42); still never email or phone.
drop function public.course_roster(uuid);
create function public.course_roster(p_course uuid)
returns table (
  enrolment_id uuid, learner_id uuid, first_name text, second_name text, id_number integer, branch_name text,
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
    select e.id, p.id, p.first_name, p.second_name, p.id_number,
           (select b.name from public.branches b where b.id = p.branch_id),
           (select f.storage_path from public.file_objects f where f.id = p.profile_image_file_id and f.status = 'VALIDATED'),
           e.enrolment_status, e.enrolled_at
      from public.course_enrollments e
      join public.profiles p on p.id = e.learner_id
     where e.course_id = p_course and e.enrolment_status <> 'WITHDRAWN'
     order by p.first_name, p.second_name;
end;
$$;
revoke execute on function public.course_roster(uuid) from public, anon;
grant execute on function public.course_roster(uuid) to authenticated, service_role;
