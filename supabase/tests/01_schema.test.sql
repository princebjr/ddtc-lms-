-- Phase 2 schema and standing guards (CLAUDE.md section 3, DATA_MODEL.md section 5, D25).
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- Tables and enums
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'system_settings', 'system_settings exists');
select has_table('public', 'audit_logs', 'audit_logs exists');
select has_table('public', 'notification_preferences', 'notification_preferences exists');
select has_table('public', 'file_objects', 'file_objects exists');
select enum_has_labels('public', 'user_role', array['ADMIN', 'LECTURER', 'LEARNER'], 'user_role enum (D02)');
select enum_has_labels('public', 'account_status', array['ACTIVE', 'SUSPENDED', 'DEACTIVATED'], 'account_status enum (D03)');
select enum_has_labels('public', 'file_status', array['PENDING', 'VALIDATED', 'REJECTED', 'DELETED', 'DELETE_FAILED'], 'file_status enum (D33)');

-- Key columns
select col_type_is('public', 'profiles', 'role', 'user_role', 'profiles.role is user_role');
select col_default_is('public', 'profiles', 'role', 'LEARNER'::text, 'role defaults to LEARNER');
select col_default_is('public', 'profiles', 'can_create_courses', 'false', 'can_create_courses defaults to false (D02)');
select col_default_is('public', 'profiles', 'account_status', 'ACTIVE'::text, 'status defaults to ACTIVE');
select col_is_unique('public', 'file_objects', 'storage_path', 'file_objects.storage_path is unique');
select col_type_is('public', 'audit_logs', 'metadata', 'jsonb', 'audit metadata is jsonb');

-- Standing guard: every foreign key in public uses ON DELETE RESTRICT (D25)
select is(
  (select coalesce(array_agg(conrelid::regclass::text || '.' || conname order by 1), '{}')
     from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public' and c.contype = 'f' and c.confdeltype <> 'r'),
  '{}'::text[],
  'every foreign key in public is ON DELETE RESTRICT'
);

-- profiles.id references auth.users
select fk_ok('public', 'profiles', 'id', 'auth', 'users', 'id', 'profiles.id references auth.users');

-- Standing guard: anon has no privileges on any public table (no default access)
select is(
  (select coalesce(array_agg(distinct table_name::text), '{}')
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  '{}'::text[],
  'anon has no privileges on any public table'
);

-- Standing guard: authenticated cannot delete from or truncate any public table (archive, never delete)
select is(
  (select coalesce(array_agg(distinct table_name::text), '{}')
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('DELETE', 'TRUNCATE')),
  '{}'::text[],
  'authenticated has no DELETE or TRUNCATE on any public table'
);

-- Standing guard: every SECURITY DEFINER function in public and private has a fixed search_path
select is(
  (select coalesce(array_agg(p.oid::regprocedure::text), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  '{}'::text[],
  'every SECURITY DEFINER function has a fixed search_path'
);

-- Helper functions
select has_function('private', 'is_admin', array[]::text[], 'private.is_admin() exists');
select is((select prosecdef from pg_proc where oid = 'private.is_admin()'::regprocedure), true, 'is_admin is SECURITY DEFINER');
select has_function('private', 'is_active_user', array[]::text[], 'private.is_active_user() exists');
select is(
  has_function_privilege('anon', 'private.is_admin()', 'execute'), false, 'anon cannot execute is_admin'
);

-- updated_at triggers
select has_trigger('public', 'profiles', 'profiles_set_updated_at', 'profiles has an updated_at trigger');
select has_trigger('public', 'system_settings', 'system_settings_set_updated_at', 'system_settings has an updated_at trigger');
select has_trigger('public', 'notification_preferences', 'notification_preferences_set_updated_at', 'notification_preferences has an updated_at trigger');
select has_trigger('public', 'file_objects', 'file_objects_set_updated_at', 'file_objects has an updated_at trigger');

-- The sign-up trigger on auth.users
select has_trigger('auth', 'users', 'on_auth_user_created', 'auth.users has the sign-up trigger');

-- Every default setting is seeded (D04, D14, D15, D17, D20, D31, D32)
select is(
  (select count(*)::int from public.system_settings
    where key in ('require_course_approval', 'grade_scale', 'pass_mark', 'distribution_bands', 'min_class_size',
                  'file_limits', 'retention_enabled', 'retention_days', 'retention_dry_run_days',
                  'notification_retry_minutes', 'session_limits', 'display_timezone',
                  'pending_upload_expiry_hours', 'signed_url_expiry_seconds', 'max_files_per_submission_version')),
  15,
  'all default settings are seeded'
);
select is(
  (select value from public.system_settings where key = 'retention_enabled'), 'false'::jsonb,
  'retention is off at launch (D20)'
);

select * from finish();
rollback;
