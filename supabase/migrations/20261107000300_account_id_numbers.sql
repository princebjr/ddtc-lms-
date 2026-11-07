-- Step 6.1, migration 21 (ADR-008, owner decision 2026-11-06): every account (administrator,
-- lecturer, learner) has a unique ID number of exactly six digits.
--   * Assigned by the database when the profile is created (sign-up, CSV import, provisioning a
--     lecturer, inviting an administrator all create the profile through the sign-up trigger), and
--     given now to every existing account in the order they joined.
--   * 100000 to 999999, so none starts with 0. A sequence numbers the accounts and a fixed
--     one-to-one shuffle turns that count into the ID, so numbers never repeat and do not reveal how
--     many accounts exist or who joined first. No retries are needed.
--   * Never changes and is never reused: a trigger refuses any change (administrators and the
--     server included), clients have no update right on the column, and accounts are never deleted.
--   * Seen by the person (own profile) and administrators (existing profile rules), and by the
--     lecturers of a learner's courses through course_roster (for teaching and the Phase 10 reports).
--     Learners never see other people's numbers.

-- ---------------------------------------------------------------- the numbering
create sequence private.id_number_seq as bigint minvalue 1 maxvalue 900000 no cycle;
revoke all on sequence private.id_number_seq from public;

/**
 * The ID number for the n-th account (1 to 900000): a fixed one-to-one shuffle onto 100000..999999.
 * 556231 shares no factor with 900000 (2^5 x 3^2 x 5^5), so no two accounts get the same number and
 * neighbours land far apart. Beyond 900000 accounts it refuses rather than repeat a number.
 */
create function private.id_number_for(p_n bigint) returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_n is null or p_n < 1 or p_n > 900000 then
    raise exception 'No ID numbers are left' using errcode = 'P0413';
  end if;
  return (100000 + ((p_n * 556231 + 271828) % 900000))::integer;
end;
$$;
revoke execute on function private.id_number_for(bigint) from public;

-- ---------------------------------------------------------------- existing accounts, in the order they joined
alter table public.profiles add column id_number integer;

-- updated_at records the person's own changes; giving everyone a number is not one of them.
alter table public.profiles disable trigger profiles_set_updated_at;
update public.profiles p
   set id_number = private.id_number_for(o.n)
  from (select id, row_number() over (order by created_at, id) as n from public.profiles) o
 where o.id = p.id;
alter table public.profiles enable trigger profiles_set_updated_at;
select setval('private.id_number_seq', greatest((select count(*) from public.profiles), 1), (select count(*) from public.profiles) > 0);

alter table public.profiles
  alter column id_number set not null,
  add constraint profiles_id_number_key unique (id_number),
  add constraint profiles_id_number_six_digits check (id_number between 100000 and 999999);

comment on column public.profiles.id_number is 'The person''s six-digit DDTC ID number (ADR-008): assigned by the database, unique, never changed or reused.';

-- ---------------------------------------------------------------- new accounts get one; nobody changes it
create function private.assign_id_number() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.id_number := private.id_number_for(nextval('private.id_number_seq'));
  return new;
end;
$$;

create function private.keep_id_number() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id_number is distinct from old.id_number then
    raise exception 'An ID number never changes' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.assign_id_number(), private.keep_id_number() from public;

create trigger profiles_assign_id_number
  before insert on public.profiles
  for each row execute function private.assign_id_number();

create trigger profiles_keep_id_number
  before update on public.profiles
  for each row execute function private.keep_id_number();

-- ---------------------------------------------------------------- lecturers see their learners' numbers
-- As migration 14, plus id_number: the lecturers of a course see its learners by name, photo and ID
-- number (SECURITY_AND_ACCESS section 7, ADR-008); still never email or phone.
drop function public.course_roster(uuid);
create function public.course_roster(p_course uuid)
returns table (
  enrolment_id uuid, learner_id uuid, first_name text, second_name text, id_number integer,
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
