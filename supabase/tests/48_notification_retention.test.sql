-- Phase 15 (migration 59, the approved retention schedule): notifications, their email records and finished
-- reminders older than 2 years are removed daily; newer ones, and anything still waiting to be sent, are kept; each
-- run that removes something is audited; only the scheduled job runs it.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(10);

select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
create function tests.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(encode(convert_to(p, 'UTF8'), 'hex'), 12, '0'))::uuid $$;
grant execute on function tests.uid(text), tests.id(text) to anon, authenticated, service_role;

insert into public.courses (id, title, course_code, created_by, status, published_at) values (tests.id('c1'), 'Biblical Studies', 'BIB901', tests.uid('t1'), 'PUBLISHED', now());
-- Three notifications for the learner: one 3 years old (sent), one 3 years old whose email is still queued, one new.
insert into public.notifications (id, recipient_id, notification_type, title, message, created_at) values
  (tests.id('old'), tests.uid('l1'), 'ANNOUNCEMENT', 'Old', 'Old news', now() - interval '3 years'),
  (tests.id('queued'), tests.uid('l1'), 'ANNOUNCEMENT', 'Old, queued', 'Waiting', now() - interval '3 years'),
  (tests.id('new'), tests.uid('l1'), 'ANNOUNCEMENT', 'New', 'Recent news', now() - interval '30 days');
update public.notification_deliveries set status = 'SENT', sent_at = now() - interval '3 years' where notification_id in (tests.id('old'), tests.id('new'));
update public.notification_deliveries set status = 'QUEUED' where notification_id = tests.id('queued');
-- Reminders: one sent 3 years ago, one still pending from 3 years ago (never removed), one sent recently.
insert into public.notification_reminders (kind, item_id, course_id, learner_id, effective_due_at, fire_at, status, deduplication_key, updated_at) values
  ('ASSIGNMENT', gen_random_uuid(), tests.id('c1'), tests.uid('l1'), now() - interval '3 years', now() - interval '3 years', 'SENT', 'test:r1', now() - interval '3 years'),
  ('ASSIGNMENT', gen_random_uuid(), tests.id('c1'), tests.uid('l1'), now() - interval '3 years', now() - interval '3 years', 'PENDING', 'test:r2', now() - interval '3 years'),
  ('ASSIGNMENT', gen_random_uuid(), tests.id('c1'), tests.uid('l1'), now() - interval '10 days', now() - interval '10 days', 'SENT', 'test:r3', now() - interval '10 days');

select ok((private.purge_old_notifications() ->> 'notifications')::int >= 1, 'the daily run removes old notifications');
select is((select count(*)::int from public.notifications where id = tests.id('old')), 0, 'a notification older than 2 years is gone');
select is((select count(*)::int from public.notification_deliveries where notification_id = tests.id('old')), 0, 'with its email record');
select is((select count(*)::int from public.notifications where id = tests.id('new')), 1, 'a recent one is kept');
select is((select count(*)::int from public.notifications where id = tests.id('queued')), 1, 'an old one whose email is still waiting is kept');
select is((select count(*)::int from public.notification_reminders where deduplication_key = 'test:r1'), 0, 'a reminder sent over 2 years ago is gone');
select is((select count(*)::int from public.notification_reminders where deduplication_key in ('test:r2', 'test:r3')), 2, 'a pending or recent reminder is kept');
select ok(exists (select 1 from public.audit_logs where action = 'notifications.purged' and created_at >= now()), 'the run is audited with its counts');
select ok(exists (select 1 from cron.job where jobname = 'notification-retention-daily'), 'it runs daily');
select ok(not has_function_privilege('authenticated', 'private.purge_old_notifications(integer, integer)', 'execute'), 'no signed-in user can run it');

select * from finish();
rollback;
