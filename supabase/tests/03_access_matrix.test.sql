-- Phase 2 allow/deny matrix (TESTING.md section 6, SECURITY_AND_ACCESS.md section 7): every Phase 2
-- table, every role, AAL1 versus AAL2. Tests required: a learner cannot change own role or status;
-- cannot read other profiles; cannot write or read audit logs; every ADMIN policy denies AAL1.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(80);

-- Cast: ids kept in transaction settings so they survive role switches
select set_config('t.l1', tests.create_user('l1@example.test', 'Ama', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Kwame', 'Asante')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Sarah', 'Ofori', 'LECTURER')::text, true);
select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.s1', tests.create_user('s1@example.test', 'Sus', 'Pended', 'LEARNER', 'SUSPENDED')::text, true);
select set_config('t.sa', tests.create_user('sa@example.test', 'Sus', 'Admin', 'ADMIN', 'SUSPENDED')::text, true);
select set_config('t.g1', tests.create_user('g1@gmail.test', p_provider => 'google',
  p_user_meta => '{"given_name":"Esi","email":"g1@gmail.test"}'::jsonb)::text, true);

create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;

-- Files for file_objects and profile-image checks (created by the trusted path)
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, detected_mime_type, file_size, validated_at)
values
  ('00000000-0000-4000-8000-000000000f01', 'profile-images', tests.uid('l1') || '/f01.png', 'me.png', 'me.png', tests.uid('l1'), 'VALIDATED', 'PROFILE_IMAGE', 'image/png', 1000, now()),
  ('00000000-0000-4000-8000-000000000f02', 'profile-images', tests.uid('l2') || '/f02.png', 'me.png', 'me.png', tests.uid('l2'), 'VALIDATED', 'PROFILE_IMAGE', 'image/png', 1000, now()),
  ('00000000-0000-4000-8000-000000000f03', 'profile-images', tests.uid('l1') || '/f03.png', 'new.png', 'new.png', tests.uid('l1'), 'PENDING', 'PROFILE_IMAGE', null, null, null);

-- ============================== anon ==============================
select tests.as_anon();
select throws_ok('select * from public.profiles', '42501', NULL, 'anon: profiles denied');
select throws_ok('select * from public.system_settings', '42501', NULL, 'anon: system_settings denied');
select throws_ok('select * from public.audit_logs', '42501', NULL, 'anon: audit_logs denied');
select throws_ok('select * from public.notification_preferences', '42501', NULL, 'anon: notification_preferences denied');
select throws_ok('select * from public.file_objects', '42501', NULL, 'anon: file_objects denied');
select tests.reset();

-- ============================== learner ==============================
select tests.authenticate_as(tests.uid('l1'));
select results_eq('select id from public.profiles', $$ select tests.uid('l1') $$, 'learner: reads own profile only');
select is((select count(*)::int from public.profiles where id = tests.uid('l2')), 0, 'learner: cannot read another profile');
select lives_ok($$ update public.profiles set first_name = 'Amma', contact_number = '+233 20 000 0000' where id = tests.uid('l1') $$,
  'learner: can edit own permitted fields');
select throws_ok($$ update public.profiles set role = 'ADMIN' where id = tests.uid('l1') $$, '42501', NULL, 'learner: cannot change own role');
select throws_ok($$ update public.profiles set account_status = 'ACTIVE' where id = tests.uid('l1') $$, '42501', NULL, 'learner: cannot change own status');
select throws_ok($$ update public.profiles set can_create_courses = true where id = tests.uid('l1') $$, '42501', NULL, 'learner: cannot grant itself course creation');
select throws_ok($$ update public.profiles set email = 'x@example.test' where id = tests.uid('l1') $$, '42501', NULL, 'learner: cannot change profile email directly');
select throws_ok($$ update public.profiles set profile_completed = true where id = tests.uid('l1') $$, '42501', NULL, 'learner: cannot set profile_completed directly');
select throws_ok($$ update public.profiles set first_name = '  ' where id = tests.uid('l1') $$, '23514', NULL, 'learner: cannot blank own first name');
update public.profiles set first_name = 'Hacked' where id = tests.uid('l2');
select throws_ok($$ insert into public.profiles (id, first_name, second_name, email) values (gen_random_uuid(), 'a', 'b', 'c@d.e') $$, '42501', NULL, 'learner: cannot insert a profile');
select throws_ok($$ delete from public.profiles where id = tests.uid('l1') $$, '42501', NULL, 'learner: cannot delete a profile');
select throws_ok($$ update public.profiles set profile_image_file_id = '00000000-0000-4000-8000-000000000f02' where id = tests.uid('l1') $$,
  '42501', NULL, 'learner: cannot use another user''s file as profile image');
select throws_ok($$ update public.profiles set profile_image_file_id = '00000000-0000-4000-8000-000000000f03' where id = tests.uid('l1') $$,
  '42501', NULL, 'learner: cannot use a file that is not VALIDATED as profile image');
select lives_ok($$ update public.profiles set profile_image_file_id = '00000000-0000-4000-8000-000000000f01' where id = tests.uid('l1') $$,
  'learner: can use own VALIDATED profile image');

select is((select count(*)::int from public.system_settings), 0, 'learner: reads no system settings');
select throws_ok($$ insert into public.system_settings (key, value) values ('x', '1') $$, '42501', NULL, 'learner: cannot insert settings');
update public.system_settings set value = 'false' where key = 'require_course_approval';

select is((select count(*)::int from public.audit_logs), 0, 'learner: cannot read audit logs');
select throws_ok($$ insert into public.audit_logs (action, entity_type) values ('x.y', 'z') $$, '42501', NULL, 'learner: cannot write audit logs');
select throws_ok($$ select private.write_audit('x.y', 'z', null, '{}') $$, '42501', NULL, 'learner: cannot call the audit writer');

select results_eq('select user_id from public.notification_preferences', $$ select tests.uid('l1') $$, 'learner: reads own notification preferences only');
select lives_ok($$ update public.notification_preferences set email_enabled = false where user_id = tests.uid('l1') $$, 'learner: can turn own emails off');
update public.notification_preferences set email_enabled = false where user_id = tests.uid('l2');
select throws_ok($$ update public.notification_preferences set user_id = tests.uid('l2') where user_id = tests.uid('l1') $$, '42501', NULL, 'learner: cannot move own preferences row');
select throws_ok($$ insert into public.notification_preferences (user_id) values (tests.uid('l1')) $$, '42501', NULL, 'learner: cannot insert preferences');

select results_eq('select id from public.file_objects order by id',
  $$ values ('00000000-0000-4000-8000-000000000f01'::uuid), ('00000000-0000-4000-8000-000000000f03'::uuid) $$,
  'learner: sees metadata of own uploads only');
select throws_ok($$ insert into public.file_objects (bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, resource_type)
  values ('profile-images', 'x/y.png', 'y.png', 'y.png', tests.uid('l1'), 'PROFILE_IMAGE') $$, '42501', NULL, 'learner: cannot register a file directly');
select throws_ok($$ update public.file_objects set status = 'VALIDATED' where id = '00000000-0000-4000-8000-000000000f03' $$, '42501', NULL, 'learner: cannot change file status');
select tests.reset();

-- Learner checks that need the trusted view
select is((select first_name from public.profiles where id = tests.uid('l2')), 'Kwame', 'learner: an update to another profile changes nothing');
select is((select first_name from public.profiles where id = tests.uid('l1')), 'Amma', 'learner: own permitted edit was saved');
select is((select value from public.system_settings where key = 'require_course_approval'), 'true'::jsonb, 'learner: a settings update changes nothing');
select is((select email_enabled from public.notification_preferences where user_id = tests.uid('l2')), true, 'learner: cannot change another user''s preferences');
select is((select email_enabled from public.notification_preferences where user_id = tests.uid('l1')), false, 'learner: own preference saved');

-- Google learner with no family name completes the profile
select tests.authenticate_as(tests.uid('g1'));
select lives_ok($$ update public.profiles set second_name = 'Addo' where id = tests.uid('g1') $$, 'Google learner: can supply the missing name');
select tests.reset();
select is((select profile_completed from public.profiles where id = tests.uid('g1')), true, 'Google learner: profile_completed becomes true once both names exist');

-- ============================== suspended learner ==============================
select tests.authenticate_as(tests.uid('s1'));
select results_eq('select id from public.profiles', $$ select tests.uid('s1') $$, 'suspended: can read own profile (to show the suspended state)');
update public.profiles set first_name = 'Changed' where id = tests.uid('s1');
select is((select count(*)::int from public.notification_preferences), 0, 'suspended: reads no notification preferences');
select is((select count(*)::int from public.file_objects), 0, 'suspended: reads no file metadata');
select tests.reset();
select is((select first_name from public.profiles where id = tests.uid('s1')), 'Sus', 'suspended: cannot edit own profile');

-- ============================== lecturer ==============================
select tests.authenticate_as(tests.uid('t1'));
select results_eq('select id from public.profiles', $$ select tests.uid('t1') $$, 'lecturer: reads own profile only (course learners arrive in Phase 5)');
select throws_ok($$ update public.profiles set can_create_courses = false where id = tests.uid('t1') $$, '42501', NULL, 'lecturer: cannot change own course-creation right');
select ok((select count(*) from public.system_settings) > 0, 'lecturer: reads non-sensitive settings');
select is((select count(*)::int from public.system_settings where is_sensitive), 0, 'lecturer: reads no sensitive settings');
update public.system_settings set value = 'false' where key = 'require_course_approval';
select is((select count(*)::int from public.audit_logs), 0, 'lecturer: cannot read audit logs');
select is((select count(*)::int from public.file_objects), 0, 'lecturer: sees no other users'' file metadata');
select tests.reset();
select is((select value from public.system_settings where key = 'require_course_approval'), 'true'::jsonb, 'lecturer: cannot change settings');

-- ============================== admin, AAL1 (every ADMIN policy denies) ==============================
select tests.authenticate_as(tests.uid('a1'), 'aal1');
select results_eq('select id from public.profiles', $$ select tests.uid('a1') $$, 'admin AAL1: reads own profile only');
select is((select count(*)::int from public.system_settings), 0, 'admin AAL1: reads no settings');
update public.system_settings set value = 'false' where key = 'require_course_approval';
select is((select count(*)::int from public.audit_logs), 0, 'admin AAL1: reads no audit logs');
select is((select count(*)::int from public.notification_preferences), 1, 'admin AAL1: reads own preferences only');
select is((select count(*)::int from public.file_objects), 0, 'admin AAL1: reads no file metadata');
select tests.reset();
select is((select value from public.system_settings where key = 'require_course_approval'), 'true'::jsonb, 'admin AAL1: cannot change settings');

-- ============================== admin, AAL2 ==============================
select set_config('t.user_count', (select count(*) from auth.users)::text, true);
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is((select count(*)::int from public.profiles), current_setting('t.user_count')::int, 'admin AAL2: reads all profiles');
select throws_ok($$ update public.profiles set role = 'LECTURER' where id = tests.uid('l1') $$, '42501', NULL, 'admin AAL2: cannot change a role directly (Edge Function only)');
select throws_ok($$ update public.profiles set account_status = 'SUSPENDED' where id = tests.uid('l1') $$, '42501', NULL, 'admin AAL2: cannot change a status directly (Edge Function only)');
select is((select count(*)::int from public.system_settings), 15, 'admin AAL2: reads all settings');
select lives_ok($$ update public.system_settings set value = 'false' where key = 'require_course_approval' $$, 'admin AAL2: can change a setting');
select throws_ok($$ update public.system_settings set value = '"no"' where key = 'require_course_approval' $$, '22023', NULL, 'admin AAL2: a setting keeps its JSON type');
select throws_ok($$ insert into public.system_settings (key, value) values ('new_key', '1') $$, '42501', NULL, 'admin AAL2: cannot add settings (migrations only)');
select throws_ok($$ delete from public.system_settings where key = 'pass_mark' $$, '42501', NULL, 'admin AAL2: cannot delete settings');
select ok((select count(*) from public.audit_logs) > 0, 'admin AAL2: reads audit logs');
select throws_ok($$ update public.audit_logs set action = 'x.y' $$, '42501', NULL, 'admin AAL2: cannot update audit logs');
select throws_ok($$ delete from public.audit_logs $$, '42501', NULL, 'admin AAL2: cannot delete audit logs');
select is((select count(*)::int from public.notification_preferences), current_setting('t.user_count')::int, 'admin AAL2: reads all preferences');
select is((select count(*)::int from public.file_objects), 3, 'admin AAL2: reads all file metadata');
select throws_ok($$ update public.file_objects set status = 'REJECTED' $$, '42501', NULL, 'admin AAL2: cannot change file status (finalize-upload only)');
select tests.reset();
select results_eq(
  $$ select value, updated_by from public.system_settings where key = 'require_course_approval' $$,
  $$ select 'false'::jsonb, tests.uid('a1') $$,
  'admin AAL2: setting saved with updated_by'
);
select ok(exists(select 1 from public.audit_logs where action = 'setting.updated' and entity_id = 'require_course_approval' and actor_id = tests.uid('a1')),
  'a setting change writes an audit record with the actor');

-- ============================== suspended admin with AAL2 ==============================
select tests.authenticate_as(tests.uid('sa'), 'aal2');
select results_eq('select id from public.profiles', $$ select tests.uid('sa') $$, 'suspended admin AAL2: reads own profile only');
select is((select count(*)::int from public.audit_logs), 0, 'suspended admin AAL2: reads no audit logs');
select tests.reset();

-- ============================== service role (trusted Edge Function path) ==============================
select tests.as_service();
select lives_ok($$ update public.profiles set role = 'LECTURER', can_create_courses = true where id = tests.uid('l2') $$, 'service role: can change role');
select throws_ok($$ update public.audit_logs set action = 'x.y' $$, '42501', NULL, 'service role: cannot update audit logs');
select throws_ok($$ delete from public.audit_logs $$, '42501', NULL, 'service role: cannot delete audit logs');
select tests.reset();
select ok(exists(select 1 from public.audit_logs where action = 'profile.role_changed' and entity_id = tests.uid('l2')::text
  and metadata->>'old_role' = 'LEARNER' and metadata->>'new_role' = 'LECTURER'),
  'a role change writes an audit record with old and new values');

-- Even the owner role cannot rewrite history
select throws_ok($$ update public.audit_logs set action = 'x.y' $$, 'P0001', NULL, 'postgres: audit logs cannot be updated');
select throws_ok($$ delete from public.audit_logs $$, 'P0001', NULL, 'postgres: audit logs cannot be deleted');
select throws_ok($$ truncate public.audit_logs $$, 'P0001', NULL, 'postgres: audit logs cannot be truncated');

select * from finish();
rollback;
