-- Phase 15 (D45 stability, migration 60): every role the app uses has a time limit for a transaction left idle,
-- the Edge Functions' role has a statement time limit, and Supabase's own statement limits are still in place.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

create function pg_temp.setting(p_role text, p_name text) returns text language sql stable as $$
  select split_part(c, '=', 2) from pg_roles r, unnest(r.rolconfig) c where r.rolname = p_role and split_part(c, '=', 1) = p_name
$$;

select is(pg_temp.setting('anon', 'idle_in_transaction_session_timeout'), '60s', 'signed-out requests: a transaction left idle closes after 60 s');
select is(pg_temp.setting('authenticated', 'idle_in_transaction_session_timeout'), '60s', 'signed-in requests too');
select is(pg_temp.setting('authenticator', 'idle_in_transaction_session_timeout'), '60s', 'and the API''s own connection');
select is(pg_temp.setting('service_role', 'idle_in_transaction_session_timeout'), '60s', 'and the Edge Functions');
select is(pg_temp.setting('service_role', 'statement_timeout'), '60s', 'the Edge Functions'' statements stop after 60 s');
select is(pg_temp.setting('authenticated', 'statement_timeout'), '8s', 'signed-in statements keep Supabase''s 8 s');
select is(pg_temp.setting('anon', 'statement_timeout'), '3s', 'signed-out statements keep 3 s');

select * from finish();
rollback;
