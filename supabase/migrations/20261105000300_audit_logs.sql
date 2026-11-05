-- Phase 2, migration 3: append-only audit log (DATA_MODEL.md: insert by triggers and Edge Functions
-- only; no UPDATE or DELETE for anyone). Readable by administrators with an AAL2 session.

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete restrict,
  action text not null check (action ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  entity_type text not null check (char_length(entity_type) between 1 and 64),
  entity_id text check (entity_id is null or char_length(entity_id) <= 128),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is 'Append-only. No updated_at: rows never change.';
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function private.prevent_change();
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function private.prevent_change();

alter table public.audit_logs enable row level security;

revoke all on public.audit_logs from anon, authenticated, service_role;
grant select on public.audit_logs to authenticated;
grant select, insert on public.audit_logs to service_role;

create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using ((select private.is_admin()));

-- Trusted writer used by database triggers. The actor is the signed-in user when there is one;
-- Edge Functions insert directly with the service role and set actor_id themselves.
create function private.write_audit(p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}') || jsonb_build_object('db_role', current_setting('role', true))
  );
end;
$$;

revoke execute on function private.write_audit(text, text, text, jsonb) from public, anon, authenticated;

-- Profile changes that matter for access: role, status, course-creation right (D02, D03, D28).
create function private.audit_profile_change() returns trigger
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
  return null;
end;
$$;

create trigger profiles_audit
  after update on public.profiles
  for each row execute function private.audit_profile_change();
