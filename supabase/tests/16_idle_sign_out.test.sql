-- Phase 7, D43 (ADR-011, owner request 2026-11-07): idle sign-out after 10 minutes, every role.
-- The two settings and their bounds; every signed-in user (learners included) reads them through
-- idle_settings(), visitors do not; only an administrator with an AAL2 session changes them, and the
-- change is audited; D32's per-role idle values are gone while the absolute limits stay; is_admin()
-- refuses an administrator session idle for longer than idle_timeout_minutes (the server side of the
-- idle limit for administrators).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(25);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- the settings
select results_eq(
  $$ select key, value, is_sensitive from public.system_settings where key in ('idle_timeout_minutes', 'idle_warning_seconds') order by key $$,
  $$ values ('idle_timeout_minutes', '10'::jsonb, false), ('idle_warning_seconds', '120'::jsonb, false) $$,
  'D43 defaults: sign out after 10 minutes, warn 120 seconds before');
select ok((select not (value::text like '%idle_minutes%') from public.system_settings where key = 'session_limits'),
  'D32''s per-role idle values are gone (D43 replaces them)');
select results_eq(
  $$ select (value -> 'ADMIN' ->> 'absolute_hours')::int, (value -> 'LECTURER' ->> 'absolute_hours')::int, (value -> 'LEARNER' ->> 'absolute_hours')::int
       from public.system_settings where key = 'session_limits' $$,
  $$ values (12, 168, 720) $$,
  'the absolute session limits are unchanged');

-- ---------------------------------------------------------------- every signed-in user reads them
select tests.authenticate_as(tests.uid('l1'));
select is(public.idle_settings(), '{"timeout_minutes": 10, "warning_seconds": 120}'::jsonb, 'a learner reads the idle settings');
select is((select count(*)::int from public.system_settings), 0, 'but not the settings table itself');
update public.system_settings set value = '60' where key = 'idle_timeout_minutes';
select tests.reset();
select is((select value from public.system_settings where key = 'idle_timeout_minutes'), '10'::jsonb, 'a learner cannot change the idle limit');

select tests.authenticate_as(tests.uid('t1'));
select is(public.idle_settings() ->> 'timeout_minutes', '10', 'a lecturer reads the idle settings');
update public.system_settings set value = '60' where key = 'idle_timeout_minutes';
select tests.reset();
select is((select value from public.system_settings where key = 'idle_timeout_minutes'), '10'::jsonb, 'a lecturer cannot change the idle limit');

select tests.as_anon();
select throws_ok($$ select public.idle_settings() $$, '42501', NULL, 'a visitor cannot read the idle settings');
select tests.reset();

-- ---------------------------------------------------------------- administrators change them, within bounds, audited
select tests.authenticate_as(tests.uid('a1'), 'aal1', tests.make_session(tests.uid('a1'), interval '1 hour', interval '1 minute', 'aal1'));
update public.system_settings set value = '60' where key = 'idle_timeout_minutes';
select tests.reset();
select is((select value from public.system_settings where key = 'idle_timeout_minutes'), '10'::jsonb, 'an administrator without two-step verification (AAL1) cannot change it');

select tests.authenticate_as(tests.uid('a1'), 'aal2', tests.make_session(tests.uid('a1'), interval '1 hour', interval '1 minute', 'aal2'));
select lives_ok($$ update public.system_settings set value = '15' where key = 'idle_timeout_minutes' $$, 'a verified administrator sets 15 minutes');
select is(public.idle_settings() ->> 'timeout_minutes', '15', 'and the new value is what everyone reads');
select throws_ok($$ update public.system_settings set value = '4' where key = 'idle_timeout_minutes' $$, '23514', NULL, 'less than 5 minutes is refused');
select throws_ok($$ update public.system_settings set value = '61' where key = 'idle_timeout_minutes' $$, '23514', NULL, 'more than 60 minutes is refused');
select throws_ok($$ update public.system_settings set value = '10.5' where key = 'idle_timeout_minutes' $$, '23514', NULL, 'whole minutes only');
select throws_ok($$ update public.system_settings set value = '"10"' where key = 'idle_timeout_minutes' $$, '22023', NULL, 'the limit stays a number');
select throws_ok($$ update public.system_settings set value = '20' where key = 'idle_warning_seconds' $$, '23514', NULL, 'a warning under 30 seconds is refused');
select throws_ok($$ update public.system_settings set value = '200' where key = 'idle_warning_seconds' $$, '23514', NULL, 'a warning over 3 minutes is refused');
select lives_ok($$ update public.system_settings set value = '90' where key = 'idle_warning_seconds' $$, 'a 90-second warning is accepted');
select tests.reset();
select results_eq(
  $$ select actor_id, metadata ->> 'new_value' from public.audit_logs where action = 'setting.updated' and entity_id = 'idle_timeout_minutes' $$,
  $$ values (tests.uid('a1'), '15') $$,
  'the change is audited with who made it');

-- ---------------------------------------------------------------- the administrators' server-side idle window
update public.system_settings set value = '10' where key = 'idle_timeout_minutes';
select tests.authenticate_as(tests.uid('a1'), 'aal2', tests.make_session(tests.uid('a1'), interval '1 hour', interval '9 minutes', 'aal2'));
select is((select private.is_admin()), true, 'an administrator active 9 minutes ago is still an administrator');
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal2', tests.make_session(tests.uid('a1'), interval '1 hour', interval '11 minutes', 'aal2'));
select is((select private.is_admin()), false, 'after 11 minutes without activity the session is refused (D43: 10 minutes, was 30)');
select tests.reset();
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('00000000-0000-4000-8000-00000000f5e3', tests.uid('a1'), now() - interval '11 minutes', now(), 'aal2');
select tests.authenticate_as(tests.uid('a1'), 'aal2', '00000000-0000-4000-8000-00000000f5e3');
select is((select private.is_admin()), false, 'a session 11 minutes old with no activity at all is refused');
select tests.reset();

update public.system_settings set value = '15' where key = 'idle_timeout_minutes';
select tests.authenticate_as(tests.uid('a1'), 'aal2', tests.make_session(tests.uid('a1'), interval '1 hour', interval '11 minutes', 'aal2'));
select is((select private.is_admin()), true, 'the window follows the setting: with 15 minutes, 11 minutes idle is still allowed');
select tests.reset();
select tests.authenticate_as(tests.uid('a1'), 'aal2', tests.make_session(tests.uid('a1'), interval '12 hours 1 minute', interval '1 minute', 'aal2'));
select is((select private.is_admin()), false, 'the 12-hour absolute limit still applies to an active session');
select tests.reset();

select * from finish();
rollback;
