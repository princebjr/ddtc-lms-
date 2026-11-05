-- Phase 3, migration 8: authentication rules enforced in the database (owner-approved 2026-11-05).
--
-- 1. Google sign-in guard (D27 rules 2, 4, 5). Supabase links an OAuth sign-in to an existing user
--    with the same email automatically and cannot be told not to. This trigger runs inside GoTrue's
--    own transaction when it creates or updates a Google identity, so refusing raises an error,
--    the whole sign-in rolls back and nothing is linked:
--      - the Google email must be verified (rule 2);
--      - the account must not be ADMIN or LECTURER (rule 4), checked on every sign-in, so a later
--        promotion also ends Google access;
--      - linking to an existing account requires that account's email to be verified (rule 5).
-- 2. Administrator session limits (D32). Supabase enforces session limits only on paid plans and
--    only one value for every user. is_admin() therefore also requires the session (from the JWT's
--    session_id) to be younger than the ADMIN absolute limit and active within the ADMIN idle limit,
--    both read from system_settings.session_limits. The app records activity through
--    record_activity() at most once a minute while the user interacts.

-- ---------------------------------------------------------------- 1. Google identity guard
create function private.guard_identity_link() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_confirmed timestamptz;
  v_other_identities int;
begin
  if new.provider <> 'google' then
    return new;
  end if;

  if coalesce((new.identity_data ->> 'email_verified')::boolean, false) is not true then
    raise exception 'google_email_not_verified' using errcode = '42501',
      hint = 'Only Google accounts with a verified email can sign in.';
  end if;

  select p.role, u.email_confirmed_at into v_role, v_confirmed
    from auth.users u left join public.profiles p on p.id = u.id
   where u.id = new.user_id;

  if v_role in ('ADMIN', 'LECTURER') then
    raise exception 'google_not_allowed_for_staff' using errcode = '42501',
      hint = 'Administrators and lecturers sign in with email and password.';
  end if;

  if tg_op = 'INSERT' then
    select count(*) into v_other_identities
      from auth.identities i where i.user_id = new.user_id and i.provider <> 'google';
    -- Linking to an account that already exists (it has another identity) needs a verified email.
    if v_other_identities > 0 and v_confirmed is null then
      raise exception 'verify_email_first' using errcode = '42501',
        hint = 'Verify the email address of the existing account before using Google.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_identity_link() from public, anon, authenticated;

create trigger guard_identity_link
  before insert or update on auth.identities
  for each row execute function private.guard_identity_link();

-- ---------------------------------------------------------------- 2. session activity
create table private.session_activity (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  last_seen_at timestamptz not null default now()
);
create index session_activity_user_idx on private.session_activity (user_id);
alter table private.session_activity enable row level security;
revoke all on private.session_activity from public, anon, authenticated;
comment on table private.session_activity is 'Last user activity per auth session (D32). Written only by record_activity().';

-- Records activity for the caller's current session only. Throttling is done by the app.
create function public.record_activity() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid := nullif((select auth.jwt() ->> 'session_id'), '')::uuid;
  v_user uuid := (select auth.uid());
begin
  if v_user is null or v_session is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.sessions s where s.id = v_session and s.user_id = v_user) then
    raise exception 'Unknown session' using errcode = '42501';
  end if;
  insert into private.session_activity (session_id, user_id, last_seen_at)
  values (v_session, v_user, now())
  on conflict (session_id) do update set last_seen_at = excluded.last_seen_at;
end;
$$;

revoke execute on function public.record_activity() from public, anon;
grant execute on function public.record_activity() to authenticated;

-- ---------------------------------------------------------------- is_admin with session limits
create or replace function private.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with limits as (
    select coalesce((value -> 'ADMIN' ->> 'absolute_hours')::int, 12) as absolute_hours,
           coalesce((value -> 'ADMIN' ->> 'idle_minutes')::int, 30) as idle_minutes
      from public.system_settings where key = 'session_limits'
    union all select 12, 30
    limit 1
  )
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (
       select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.role = 'ADMIN' and p.account_status = 'ACTIVE'
     )
     and exists (
       select 1
         from auth.sessions s
         join private.session_activity a on a.session_id = s.id
         cross join limits l
        where s.id = nullif((select auth.jwt() ->> 'session_id'), '')::uuid
          and s.user_id = (select auth.uid())
          and s.created_at > now() - make_interval(hours => l.absolute_hours)
          and a.last_seen_at > now() - make_interval(mins => l.idle_minutes)
     );
$$;
