-- Phase 15 (D45 stability, migration 58): DDTC can pause heavy features under strain.
--   Reports: paused, every report refuses with a plain message (P0503); on again, they answer. Exports: the
--   export function reads exports_enabled (service role only). Only an AAL2 administrator flips a switch; a
--   switch must stay true or false.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(10);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;

select is((select value from public.system_settings where key = 'reports_enabled'), 'true'::jsonb, 'reports start on');
select is((select value from public.system_settings where key = 'exports_enabled'), 'true'::jsonb, 'exports start on');

select tests.authenticate_as(tests.uid('a1'), 'aal2');
select lives_ok($$ select * from public.report_enrolment(null, null, null, null) $$, 'with reports on, an administrator reads a report');
select lives_ok($$ update public.system_settings set value = 'false' where key = 'reports_enabled' $$, 'an administrator with two-step verification pauses reports');
select throws_ok($$ select * from public.report_enrolment(null, null, null, null) $$, 'P0503', 'Reports are paused by DDTC for now. Try again later.', 'paused, a report refuses with a plain message');
select throws_ok($$ select * from public.report_grades(null, null) $$, 'P0503', null, 'every report does');
select throws_matching($$ update public.system_settings set value = '"no"' where key = 'reports_enabled' $$, 'must stay', 'a switch stays true or false');
select lives_ok($$ update public.system_settings set value = 'true' where key = 'reports_enabled' $$, 'and turns them on again');
select tests.reset();

select tests.authenticate_as(tests.uid('t1'));
update public.system_settings set value = 'false' where key = 'exports_enabled';
select tests.reset();
select is((select value from public.system_settings where key = 'exports_enabled'), 'true'::jsonb, 'a lecturer cannot pause exports');
select tests.as_service();
select is(public.exports_enabled(), true, 'the export function reads the switch');
select tests.reset();

select * from finish();
rollback;
