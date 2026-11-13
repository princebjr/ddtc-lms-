-- Phase 15 (owner request 2026-11-13, migration 56): the support contact in Help & Support.
--   Only an administrator with two-step verification changes it; a lecturer, a learner and an administrator
--   without two-step verification cannot (their update changes nothing). The database refuses a malformed email
--   or phone number. Every active signed-in user reads it through client_settings(); signed-out visitors cannot.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(13);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;
create function tests.support(p text) returns text language sql stable security definer set search_path = '' as $$
  select value #>> '{}' from public.system_settings where key = 'support_' || p
$$;
grant execute on function tests.support(text) to authenticated;

select is(tests.support('email'), '', 'the support email starts empty');
select is(tests.support('phone'), '', 'the support phone starts empty');

-- ---------------------------------------------------------------- who may change it
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select lives_ok($$ update public.system_settings set value = '"support@ddtc.example"' where key = 'support_email' $$, 'an administrator with two-step verification sets the email');
select lives_ok($$ update public.system_settings set value = '"+233 24 123 4567"' where key = 'support_phone' $$, 'and the phone number');
select throws_ok($$ update public.system_settings set value = '"not an email"' where key = 'support_email' $$, '23514', null, 'a malformed email is refused');
select throws_ok($$ update public.system_settings set value = '"call me"' where key = 'support_phone' $$, '23514', null, 'a phone with letters is refused');
select throws_ok($$ update public.system_settings set value = '"12345"' where key = 'support_phone' $$, '23514', null, 'a phone with too few digits is refused');
select throws_matching($$ update public.system_settings set value = '5' where key = 'support_email' $$, 'must stay a JSON string', 'a value that is not text is refused (the settings guard)');
select tests.reset();

select tests.authenticate_as(tests.uid('t1'));
update public.system_settings set value = '"lecturer@evil.example"' where key = 'support_email';
select tests.reset();
select tests.authenticate_as(tests.uid('a1'));
update public.system_settings set value = '"aal1@evil.example"' where key = 'support_email';
select tests.reset();
select is(tests.support('email'), 'support@ddtc.example', 'a lecturer or an administrator without two-step verification changed nothing');

-- ---------------------------------------------------------------- who may read it
select tests.authenticate_as(tests.uid('l1'));
select is(public.client_settings() -> 'support', '{"email": "support@ddtc.example", "phone": "+233 24 123 4567"}'::jsonb, 'a learner reads the support contact');
select tests.reset();
select tests.authenticate_as(tests.uid('t1'));
select is(public.client_settings() #>> '{support,email}', 'support@ddtc.example', 'and a lecturer');
select tests.reset();
select ok(not has_function_privilege('anon', 'public.client_settings()', 'execute'), 'signed-out visitors cannot read settings');
select tests.reset();
update public.system_settings set value = '""' where key = 'support_phone';
select tests.authenticate_as(tests.uid('l1'));
select is(public.client_settings() #>> '{support,phone}', '', 'an empty value reads as empty (not shown)');
select tests.reset();

select * from finish();
rollback;
