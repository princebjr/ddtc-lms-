-- Phase 4: the trusted database functions behind the admin Edge Functions (set-user-role,
-- reset-admin-mfa, bootstrap, launch check). Only the service role (Edge Functions) may call them;
-- each re-checks that the acting user is an ACTIVE administrator, and every change is audited with
-- that administrator as the actor. Tests required: a non-administrator cannot change any role (at
-- the database level); every administrator action produces an audit record; suspension revokes
-- sessions; reset-admin-mfa is rate-limited and audited; the bootstrap is one-time.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(47);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.a2', tests.create_user('a2@example.test', 'Solomon', 'Nyamekye', 'ADMIN')::text, true);
select set_config('t.sa', tests.create_user('sa@example.test', 'Sus', 'Admin', 'ADMIN', 'SUSPENDED')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Ama', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Kofi', 'Owusu')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Sarah', 'Ofori', 'LECTURER')::text, true);

create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- who may call
select has_function('public', 'admin_set_user', array['uuid', 'uuid', 'user_role', 'account_status', 'boolean'], 'admin_set_user exists');
select has_function('public', 'admin_record_mfa_reset', array['uuid', 'uuid'], 'admin_record_mfa_reset exists');
select has_function('public', 'bootstrap_first_admin', array['uuid'], 'bootstrap_first_admin exists');
select has_function('public', 'launch_readiness', array[]::text[], 'launch_readiness exists');
select has_function('public', 'am_i_admin', array[]::text[], 'am_i_admin exists');

select is(has_function_privilege('authenticated', 'public.admin_set_user(uuid, uuid, user_role, account_status, boolean)', 'execute'), false,
  'a signed-in client cannot call admin_set_user (only Edge Functions can)');
select is(has_function_privilege('anon', 'public.admin_set_user(uuid, uuid, user_role, account_status, boolean)', 'execute'), false, 'anon cannot call admin_set_user');
select is(has_function_privilege('authenticated', 'public.admin_record_mfa_reset(uuid, uuid)', 'execute'), false, 'a signed-in client cannot call admin_record_mfa_reset');
select is(has_function_privilege('authenticated', 'public.bootstrap_first_admin(uuid)', 'execute'), false, 'a signed-in client cannot call bootstrap_first_admin');
select is(has_function_privilege('authenticated', 'public.launch_readiness()', 'execute'), false, 'a signed-in client cannot call launch_readiness');
select is(has_function_privilege('service_role', 'public.admin_set_user(uuid, uuid, user_role, account_status, boolean)', 'execute'), true, 'the service role can call admin_set_user');

-- A learner calling it directly through the API is refused.
select tests.authenticate_as(tests.uid('l1'));
select throws_ok($$ select public.admin_set_user(tests.uid('l1'), tests.uid('l1'), 'ADMIN', null, null) $$, '42501', NULL,
  'a learner cannot make themself ADMIN through the API');
select tests.reset();

-- am_i_admin: how Edge Functions check the caller with the caller's own token
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select is((select public.am_i_admin()), true, 'am_i_admin: true for an ACTIVE administrator with AAL2');
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal1');
select is((select public.am_i_admin()), false, 'am_i_admin: false for an administrator with AAL1');
select tests.reset();
select tests.authenticate_as(tests.uid('l1'));
select is((select public.am_i_admin()), false, 'am_i_admin: false for a learner');
select tests.reset();

-- ---------------------------------------------------------------- admin_set_user (as the service role)
select tests.as_service();
select throws_ok($$ select public.admin_set_user(tests.uid('l2'), tests.uid('l1'), 'LECTURER', null, null) $$, '42501', NULL,
  'a non-administrator actor is refused');
select throws_ok($$ select public.admin_set_user(tests.uid('sa'), tests.uid('l1'), 'LECTURER', null, null) $$, '42501', NULL,
  'a suspended administrator actor is refused');
select throws_ok($$ select public.admin_set_user(tests.uid('a1'), tests.uid('a1'), 'LEARNER', null, null) $$, '42501', NULL,
  'an administrator cannot change their own role (no lock-out)');
select throws_ok($$ select public.admin_set_user(tests.uid('a1'), tests.uid('a1'), null, 'SUSPENDED', null) $$, '42501', NULL,
  'an administrator cannot change their own status');
select throws_ok($$ select public.admin_set_user(tests.uid('a1'), tests.uid('l1'), null, null, true) $$, '22023', NULL,
  'course creation cannot be granted to a learner');
select lives_ok($$ select public.admin_set_user(tests.uid('a1'), tests.uid('l1'), 'LECTURER', null, true) $$,
  'an administrator promotes a learner to lecturer with course creation');
select lives_ok($$ select public.admin_set_user(tests.uid('a1'), tests.uid('t1'), null, null, false) $$,
  'an administrator revokes course creation');
select tests.reset();

select results_eq($$ select role::text, can_create_courses from public.profiles where id = tests.uid('l1') $$,
  $$ values ('LECTURER', true) $$, 'the promotion was saved');
select is((select can_create_courses from public.profiles where id = tests.uid('t1')), false, 'the revocation was saved');
select ok(exists (select 1 from public.audit_logs where action = 'profile.role_changed' and entity_id = tests.uid('l1')::text and actor_id = tests.uid('a1')),
  'the role change is audited with the acting administrator');
select ok(exists (select 1 from public.audit_logs where action = 'profile.course_creation_changed' and entity_id = tests.uid('t1')::text and actor_id = tests.uid('a1')),
  'the course-creation change is audited with the acting administrator');

-- Promotion to staff removes any Google sign-in (D27: staff use email and password only)
select set_config('t.g1', tests.create_user('g1@example.test', 'Esi', 'Addo')::text, true);
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
values (gen_random_uuid(), tests.uid('g1'), 'google-g1', 'google', '{"email_verified":true}', now(), now());
select tests.as_service();
select lives_ok($$ select public.admin_set_user(tests.uid('a1'), tests.uid('g1'), 'LECTURER', null, null) $$, 'promote a learner who uses Google');
select tests.reset();
select is((select count(*)::int from auth.identities where user_id = tests.uid('g1') and provider = 'google'), 0,
  'promotion to lecturer removes the Google identity');

-- Suspension revokes every session; reactivation restores access
select tests.make_session(tests.uid('l2'));
select tests.make_session(tests.uid('l2'));
select tests.as_service();
select lives_ok($$ select public.admin_set_user(tests.uid('a1'), tests.uid('l2'), null, 'SUSPENDED', null) $$, 'an administrator suspends a learner');
select tests.reset();
select is((select count(*)::int from auth.sessions where user_id = tests.uid('l2')), 0, 'suspension revokes all of the user''s sessions');
select ok(exists (select 1 from public.audit_logs where action = 'profile.status_changed' and entity_id = tests.uid('l2')::text and actor_id = tests.uid('a1')),
  'the suspension is audited with the acting administrator');
select ok(exists (select 1 from public.audit_logs where action = 'admin.sessions_revoked' and entity_id = tests.uid('l2')::text and actor_id = tests.uid('a1')),
  'the session revocation is audited');
select tests.as_service();
select lives_ok($$ select public.admin_set_user(tests.uid('a1'), tests.uid('l2'), null, 'ACTIVE', null) $$, 'an administrator reactivates the learner');
select tests.reset();
select is((select account_status::text from public.profiles where id = tests.uid('l2')), 'ACTIVE', 'reactivation saved');

-- ---------------------------------------------------------------- reset-admin-mfa: rate limit and audit
select tests.as_service();
select throws_ok($$ select public.admin_record_mfa_reset(tests.uid('a1'), tests.uid('a1')) $$, '42501', NULL, 'an administrator cannot reset their own MFA');
select throws_ok($$ select public.admin_record_mfa_reset(tests.uid('a1'), tests.uid('l2')) $$, '22023', NULL, 'MFA reset applies to administrators only');
select lives_ok($$ select public.admin_record_mfa_reset(tests.uid('a1'), tests.uid('a2')) $$, 'reset 1 of 3 in an hour');
select lives_ok($$ select public.admin_record_mfa_reset(tests.uid('a1'), tests.uid('a2')) $$, 'reset 2 of 3 in an hour');
select lives_ok($$ select public.admin_record_mfa_reset(tests.uid('a1'), tests.uid('a2')) $$, 'reset 3 of 3 in an hour');
select throws_ok($$ select public.admin_record_mfa_reset(tests.uid('a1'), tests.uid('a2')) $$, 'P0429', NULL, 'a fourth reset within an hour is refused');
select tests.reset();
select is((select count(*)::int from public.audit_logs where action = 'admin.mfa_reset' and actor_id = tests.uid('a1')), 3, 'each MFA reset is audited');

-- ---------------------------------------------------------------- launch check: two active administrators
select tests.as_service();
select ok((public.launch_readiness() ->> 'active_admins')::int >= 2, 'launch_readiness counts active administrators');
select tests.reset();
update public.profiles set account_status = 'SUSPENDED' where role = 'ADMIN' and id <> tests.uid('a1');
select tests.as_service();
select is((public.launch_readiness() ->> 'ok')::boolean, false, 'launch is refused with fewer than two active administrators');
select tests.reset();

-- ---------------------------------------------------------------- bootstrap: one-time
update public.profiles set role = 'LEARNER' where role = 'ADMIN';
update public.system_settings set value = 'false' where key = 'bootstrap_completed';
select tests.as_service();
select lives_ok($$ select public.bootstrap_first_admin(tests.uid('l2')) $$, 'bootstrap makes the first administrator when none exists');
select throws_ok($$ select public.bootstrap_first_admin(tests.uid('t1')) $$, '42501', NULL, 'bootstrap refuses once it has run');
select tests.reset();
select is((select role::text from public.profiles where id = tests.uid('l2')), 'ADMIN', 'the bootstrapped account is ADMIN');
select is((select value from public.system_settings where key = 'bootstrap_completed'), 'true'::jsonb, 'bootstrap switches itself off');

select * from finish();
rollback;
