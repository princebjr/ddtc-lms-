-- Phase 2, migration 1: enums, no default access, the private helper schema, shared triggers.
-- D02 roles, D03 account status, D33 file status. CLAUDE.md section 3: RLS on, no default access.

-- ---------------------------------------------------------------- enums
create type public.user_role as enum ('ADMIN', 'LECTURER', 'LEARNER');
create type public.account_status as enum ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
create type public.file_status as enum ('PENDING', 'VALIDATED', 'REJECTED', 'DELETED', 'DELETE_FAILED');

-- ---------------------------------------------------------------- no default access
-- Supabase grants new public tables, sequences and functions to anon and authenticated by default.
-- Remove that: every table grants exactly what its policies need, in its own migration.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------- private schema
-- Helpers used by policies and triggers. Not exposed through the Data API (only public is).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
alter default privileges for role postgres in schema private revoke execute on functions from public;

-- updated_at maintained by trigger (DATA_MODEL.md section 5)
create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Immutable history: blocks UPDATE, DELETE and TRUNCATE for every role, the owner included.
create function private.prevent_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'P0001';
end;
$$;

-- True when a trusted server path (Edge Function via service_role, or the owner in migrations,
-- seeds and triggers) is acting rather than a signed-in client session.
create function private.is_trusted_session() returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user not in ('authenticated', 'anon');
$$;

grant execute on function private.is_trusted_session() to authenticated, service_role;
