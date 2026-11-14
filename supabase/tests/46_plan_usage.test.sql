-- Phase 15 (ADR-028, migration 57): the System health card warns before the free plan's limits are reached.
--   Below 80% of a limit: nothing. From 80%: a warning; from 95%: an error, saying how much is used and left.
--   The limits are settings (1024 MB of files, 500 MB of database by default) that only an AAL2 administrator
--   changes, within bounds. The earlier health checks still run.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(10);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;

select is((select value #>> '{}' from public.system_settings where key = 'plan_storage_limit_mb'), '1024', 'the free plan''s 1024 MB of files is the default');
select is((select value #>> '{}' from public.system_settings where key = 'plan_database_limit_mb'), '500', 'and 500 MB of database');

-- The limits are set around what is stored now, so the test does not depend on the files already there.
create function tests.used_mb() returns bigint language sql stable as $$
  select coalesce(sum((metadata ->> 'size')::bigint), 0) / 1048576 from storage.objects
$$;
create function tests.storage_issue() returns text language sql stable as $$
  select key || '|' || severity from private.plan_usage_issues() where key like 'plan_storage_%'
$$;
create function tests.set_limit(mb bigint) returns void language sql as $$
  update public.system_settings set value = to_jsonb(greatest(100, mb)) where key = 'plan_storage_limit_mb'
$$;
-- Files of a known size, so the share is under the test's control: 100 MB stored on top of what is there.
insert into storage.objects (bucket_id, name, metadata)
values ('profile-images', 'plan-usage-test/' || gen_random_uuid(), jsonb_build_object('size', 100 * 1048576));

select tests.set_limit((tests.used_mb() * 10)::bigint);
select is(tests.storage_issue(), null, 'below 80% of the limit: no issue');
select tests.set_limit(ceil(tests.used_mb() / 0.85)::bigint);
select is(tests.storage_issue(), 'plan_storage_high|warning', 'from 80%: a warning');
select tests.set_limit(ceil(tests.used_mb() / 0.97)::bigint);
select is(tests.storage_issue(), 'plan_storage_full|error', 'from 95%: an error');
select matches((select message from private.plan_usage_issues() where key = 'plan_storage_full'), '^File storage uses \d+ MB of \d+ MB \(\d+%\); \d+ MB left\.', 'the message says what is used and left');
select ok(exists (select 1 from private.system_health_issues() where key = 'plan_storage_full'), 'it is on the System health card and in the daily alert');
insert into public.backup_runs (kind, succeeded, error, finished_at) values ('DATABASE', false, 'test failure', now() + interval '1 hour');
select ok(exists (select 1 from private.system_health_issues() where key = 'backup_database_failed'), 'the earlier checks still run with it (a failed backup is still reported)');

-- Who may change the limits
select tests.authenticate_as(tests.uid('t1'));
update public.system_settings set value = '200000' where key = 'plan_database_limit_mb';
select tests.reset();
select is((select value #>> '{}' from public.system_settings where key = 'plan_database_limit_mb'), '500', 'a lecturer cannot change a plan limit');
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select throws_ok($$ update public.system_settings set value = '10' where key = 'plan_database_limit_mb' $$, '23514', null, 'a limit below 100 MB is refused');
select tests.reset();

select * from finish();
rollback;
