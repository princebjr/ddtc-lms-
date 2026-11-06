-- Phase 4, migration 9: trusted administrator operations (SECURITY_AND_ACCESS.md section 8; D02,
-- D03, D27, D28, D32). Edge Functions verify the caller (JWT, AAL2, session limits) and then call
-- these functions with the service role. Each function re-checks that the acting user is an ACTIVE
-- administrator, makes the change and writes the audit record in one transaction, with the acting
-- administrator recorded as the actor. Clients cannot call them.

-- ---------------------------------------------------------------- actor for audit records
-- Edge Functions act with the service role, so auth.uid() is empty; the acting administrator is
-- passed explicitly and recorded through a transaction-local setting.
create or replace function private.write_audit(p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    coalesce((select auth.uid()), nullif(current_setting('app.actor_id', true), '')::uuid),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}') || jsonb_build_object('db_role', current_setting('role', true))
  );
end;
$$;

/** Raises unless p_actor is an ACTIVE administrator; records them as the actor for audit rows. */
create function private.require_admin_actor(p_actor uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'ADMIN' and account_status = 'ACTIVE') then
    raise exception 'The acting user is not an active administrator' using errcode = '42501';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
end;
$$;

-- ---------------------------------------------------------------- am_i_admin (caller check)
-- Called by Edge Functions with the caller's own token: true only for an ACTIVE administrator
-- with an AAL2 session inside the D32 limits (private.is_admin).
create function public.am_i_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin();
$$;
revoke execute on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;

-- ---------------------------------------------------------------- set-user-role
create function public.admin_set_user(
  p_actor uuid,
  p_target uuid,
  p_role public.user_role default null,
  p_status public.account_status default null,
  p_can_create boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.profiles;
  v_role public.user_role;
  v_status public.account_status;
  v_can_create boolean;
  v_revoked int := 0;
begin
  perform private.require_admin_actor(p_actor);
  if p_actor = p_target and (p_role is not null or p_status is not null) then
    -- No self-change: an administrator cannot lock themselves out, and since the actor is an
    -- active administrator, the target can never be the last one.
    raise exception 'Administrators cannot change their own role or status' using errcode = '42501';
  end if;

  select * into v_old from public.profiles where id = p_target for update;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  v_role := coalesce(p_role, v_old.role);
  v_status := coalesce(p_status, v_old.account_status);
  v_can_create := case when v_role = 'LECTURER' then coalesce(p_can_create, v_old.can_create_courses) else false end;
  if p_can_create is true and v_role <> 'LECTURER' then
    raise exception 'Only lecturers can be allowed to create courses' using errcode = '22023';
  end if;

  update public.profiles
     set role = v_role, account_status = v_status, can_create_courses = v_can_create
   where id = p_target;

  -- Suspension and deactivation revoke every session at once (D32). Existing access tokens expire
  -- within an hour; RLS already refuses them because the account is no longer ACTIVE.
  if v_status <> 'ACTIVE' and v_old.account_status = 'ACTIVE' then
    delete from auth.sessions where user_id = p_target;
    get diagnostics v_revoked = row_count;
    perform private.write_audit('admin.sessions_revoked', 'profile', p_target::text, jsonb_build_object('sessions', v_revoked));
  end if;

  -- Staff sign in with email and password only (D27): promotion removes any Google identity.
  if v_role in ('ADMIN', 'LECTURER') and v_old.role = 'LEARNER' then
    delete from auth.identities where user_id = p_target and provider = 'google';
  end if;

  return jsonb_build_object('id', p_target, 'role', v_role, 'account_status', v_status, 'can_create_courses', v_can_create);
end;
$$;

-- ---------------------------------------------------------------- reset-admin-mfa bookkeeping
create table private.mfa_reset_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_id uuid not null,
  created_at timestamptz not null default now()
);
alter table private.mfa_reset_log enable row level security;
revoke all on private.mfa_reset_log from public, anon, authenticated;

-- Checks the rule (another ACTIVE administrator, at most 3 resets per actor per hour) and audits.
-- The Edge Function removes the factors through the Auth admin API only after this succeeds.
create function public.admin_record_mfa_reset(p_actor uuid, p_target uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_actor(p_actor);
  if p_actor = p_target then
    raise exception 'Administrators cannot reset their own MFA' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_target and role = 'ADMIN') then
    raise exception 'MFA reset applies to administrators only' using errcode = '22023';
  end if;
  if (select count(*) from private.mfa_reset_log where actor_id = p_actor and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Too many MFA resets in the last hour' using errcode = 'P0429';
  end if;
  insert into private.mfa_reset_log (actor_id, target_id) values (p_actor, p_target);
  -- The target signs in again and enrols a new authenticator.
  delete from auth.sessions where user_id = p_target;
  perform private.write_audit('admin.mfa_reset', 'profile', p_target::text, '{}');
end;
$$;

-- ---------------------------------------------------------------- bootstrap and launch check
insert into public.system_settings (key, value, is_sensitive, description)
values ('bootstrap_completed', 'false', true, 'D32: the one-time first-administrator bootstrap has run');

-- One-time: makes the first administrator when there is none, then switches itself off.
create function public.bootstrap_first_admin(p_user uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select value from public.system_settings where key = 'bootstrap_completed') = 'true'::jsonb
     or exists (select 1 from public.profiles where role = 'ADMIN') then
    raise exception 'Bootstrap is disabled: an administrator already exists' using errcode = '42501';
  end if;
  perform set_config('app.actor_id', p_user::text, true);
  update public.profiles set role = 'ADMIN', can_create_courses = false, account_status = 'ACTIVE' where id = p_user;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  update public.system_settings set value = 'true' where key = 'bootstrap_completed';
  perform private.write_audit('admin.bootstrap', 'profile', p_user::text, '{}');
end;
$$;

-- D32: production must have at least two active administrators.
create function public.launch_readiness() returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('active_admins', n, 'ok', n >= 2)
    from (select count(*)::int as n from public.profiles where role = 'ADMIN' and account_status = 'ACTIVE') s;
$$;

revoke execute on function public.admin_set_user(uuid, uuid, public.user_role, public.account_status, boolean),
  public.admin_record_mfa_reset(uuid, uuid), public.bootstrap_first_admin(uuid), public.launch_readiness()
  from public, anon, authenticated;
grant execute on function public.admin_set_user(uuid, uuid, public.user_role, public.account_status, boolean),
  public.admin_record_mfa_reset(uuid, uuid), public.bootstrap_first_admin(uuid), public.launch_readiness()
  to service_role;
revoke execute on function private.require_admin_actor(uuid) from public, anon, authenticated;
