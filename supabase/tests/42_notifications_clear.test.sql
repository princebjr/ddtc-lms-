-- Owner request of 2026-11-12 (ADR-024): learners and lecturers clear their notifications one at a time or all
-- at once. A cleared notification is kept (never deleted), counts as read, and can be brought back (Undo).
-- - notifications_clear(ids) clears the caller's own notifications (all of them when ids is null) and returns
--   the ids it cleared; another person's notifications are never touched.
-- - notifications_restore(ids) brings back the caller's own cleared notifications.
-- - Nobody can clear or restore someone else's notifications, and anonymous visitors can do neither.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(13);

select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Abena', 'Frimpong')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;

insert into public.notifications (recipient_id, notification_type, title, message, read_at)
select tests.uid(x.who), 'ANNOUNCEMENT', x.title, 'Body.', x.read_at
  from (values ('l1', 'Kwame one', null::timestamptz), ('l1', 'Kwame two', now() - interval '1 day'), ('l1', 'Kwame three', null),
               ('l2', 'Abena one', null), ('t1', 'Ama one', null)) as x(who, title, read_at);
create function tests.cleared(p_title text) returns boolean language sql security definer set search_path = '' as $$
  select cleared_at is not null from public.notifications where title = p_title $$;
grant execute on function tests.cleared(text) to authenticated;
create function tests.read_at(p_title text) returns timestamptz language sql security definer set search_path = '' as $$
  select read_at from public.notifications where title = p_title $$;
grant execute on function tests.read_at(text) to authenticated;

-- ---------------------------------------------------------------- one at a time
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from public.notifications_clear(array[(select id from public.notifications where title = 'Kwame one')])), 1, 'a learner clears one notification');
select ok(tests.cleared('Kwame one') and tests.read_at('Kwame one') is not null, 'it is kept, marked cleared and counted as read');
select is((select count(*)::int from public.notifications where cleared_at is null), 2, 'their list without cleared ones has the other two');
select is((select count(*)::int from public.notifications_clear(array[(select id from public.notifications where title = 'Kwame one')])), 0, 'clearing it again changes nothing');
select is((select count(*)::int from public.notifications_restore(array[(select id from public.notifications where title = 'Kwame one')])), 1, 'Undo brings it back');
select ok(not tests.cleared('Kwame one'), 'no longer cleared');

-- ---------------------------------------------------------------- all at once
select is((select count(*)::int from public.notifications_clear(null)), 3, 'Clear all clears every one of theirs');
select ok(tests.read_at('Kwame two') < now() - interval '23 hours', 'a notification already read keeps the time it was read');
select ok(not tests.cleared('Abena one') and not tests.cleared('Ama one'), 'other people''s notifications are untouched');

-- ---------------------------------------------------------------- someone else's
select tests.reset(); select tests.authenticate_as(tests.uid('l2'));
select is((select count(*)::int from public.notifications_restore(array(select id from public.notifications where title like 'Kwame%'))), 0,
  'a learner cannot restore another learner''s notifications (they cannot even see their ids)');
select tests.reset();
select tests.authenticate_as(tests.uid('l2'));
select is((select count(*)::int from public.notifications_clear((select array_agg(n.id) from (select id from public.notifications) n) || array[gen_random_uuid()])), 1,
  'clearing with someone else''s ids clears only the caller''s own');
select tests.reset(); select tests.authenticate_as(tests.uid('t1'));
select is((select count(*)::int from public.notifications_clear(null)), 1, 'a lecturer clears theirs too');
select tests.reset(); set local role anon;
select throws_ok($$ select public.notifications_clear(null) $$, '42501', null, 'anonymous visitors cannot clear anything');

select * from finish();
rollback;
