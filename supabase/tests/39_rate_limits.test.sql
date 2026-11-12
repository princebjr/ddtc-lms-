-- Phase 13 (rate-limit review): rate_limit_take counts a user's uses of one action in a fixed window and
-- refuses with P0429 above the limit; each user and each action counts apart; a new window starts afresh;
-- only the service role (the Edge Functions) may call it; old counts are removed by the daily clean.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(10);

select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;

select tests.as_service();
select lives_ok($$ select public.rate_limit_take(tests.uid('l1'), 'export', 3, 600) from generate_series(1, 3) $$, 'three exports within the limit of 3');
select throws_ok($$ select public.rate_limit_take(tests.uid('l1'), 'export', 3, 600) $$, 'P0429', 'Too many requests. Try again in a few minutes.', 'the fourth is refused');
select lives_ok($$ select public.rate_limit_take(tests.uid('l2'), 'export', 3, 600) $$, 'another user counts apart');
select lives_ok($$ select public.rate_limit_take(tests.uid('l1'), 'upload', 3, 600) $$, 'another action counts apart');
select tests.reset();
-- Move Kwame's export count into the previous window: a new window starts afresh.
update private.rate_limit_hits set window_start = window_start - interval '601 seconds' where actor = tests.uid('l1') and action = 'export';
select tests.as_service();
select lives_ok($$ select public.rate_limit_take(tests.uid('l1'), 'export', 3, 600) $$, 'a new window starts afresh');
select throws_ok($$ select public.rate_limit_take(tests.uid('l1'), 'export', 0, 600) $$, '22023', 'Give a limit and a window above 0', 'a limit of 0 is a mistake, not a block');

select tests.reset(); select tests.authenticate_as(tests.uid('l1'));
select throws_ok($$ select public.rate_limit_take(tests.uid('l1'), 'export', 100, 600) $$, '42501', null, 'a signed-in user cannot call it (they could reset nothing, but could fill the table)');
select throws_ok($$ select count(*) from private.rate_limit_hits $$, '42501', null, 'nor read the counts');

select tests.reset();
select lives_ok($$ select private.rate_limit_clean() $$, 'the daily clean runs');
select is((select count(*)::int from private.rate_limit_hits where window_start < now() - interval '1 day'), 0, 'and leaves no count older than a day');

select * from finish();
rollback;
