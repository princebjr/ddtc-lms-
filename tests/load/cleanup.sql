-- Removes everything tests/load/seed-staging.sql (or seed.sql) and the load test runs created (Phase 15, owner
-- decision of 2026-11-13: test data is removed afterwards). Only the test accounts (load-...@ddtc.test) and the test
-- courses (codes starting LOAD) are touched: every row in the app's tables that belongs to one of them, to their
-- lessons, assignments, answers or notifications, then the accounts' sign-in records. It refuses to run if the
-- patterns match more than a load seed creates, so real people and courses can never be removed.
-- Run: npx supabase db query --remote --yes -f tests/load/cleanup.sql   (locally: psql ... < tests/load/cleanup.sql)
begin;
-- Test data only: skip the triggers (audit-log immutability, cascading notifications, link checks) while removing it.
set local session_replication_role = replica;
set local statement_timeout = 0;

create temp table l_users on commit drop as select id from auth.users where email like 'load-%@ddtc.test';
create temp table l_courses on commit drop as select id from public.courses where course_code like 'LOAD%';

do $$
begin
  if (select count(*) from l_users) > 3100 or (select count(*) from l_courses) > 20 then
    raise exception 'Refusing: the patterns match more than a load seed creates (% accounts, % courses)',
      (select count(*) from l_users), (select count(*) from l_courses);
  end if;
  if exists (select 1 from auth.users u join l_users l on l.id = u.id where u.email not like 'load-%@ddtc.test') then
    raise exception 'Refusing: a matched account is not a test account';
  end if;
end;
$$;

create temp table l_lessons on commit drop as select id from public.lessons where course_id in (select id from l_courses);
create temp table l_assignments on commit drop as select id from public.assignments where course_id in (select id from l_courses);
create temp table l_submissions on commit drop as
  select id from public.submissions where assignment_id in (select id from l_assignments) or learner_id in (select id from l_users);
create temp table l_notifications on commit drop as select id from public.notifications where recipient_id in (select id from l_users);

do $$
declare
  r record;
  v_set text;
begin
  -- Every column in the app's tables that points at a person, course, lesson, assignment, answer or notification.
  for r in
    select c.table_name, c.column_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.data_type = 'uuid'
       and (c.column_name in ('learner_id', 'recipient_id', 'user_id', 'actor_id', 'created_by', 'updated_by', 'lecturer_id', 'enrolled_by',
                              'assigned_by', 'uploaded_by', 'granted_by', 'changed_by', 'graded_by', 'released_by', 'placed_by', 'author_id',
                              'course_id', 'lesson_id', 'assignment_id', 'submission_id', 'notification_id')
            or (c.column_name = 'id' and c.table_name in ('profiles', 'courses', 'lessons', 'assignments', 'submissions', 'notifications')))
  loop
    v_set := case
      when r.column_name = 'course_id' or (r.column_name = 'id' and r.table_name = 'courses') then 'l_courses'
      when r.column_name = 'lesson_id' or (r.column_name = 'id' and r.table_name = 'lessons') then 'l_lessons'
      when r.column_name = 'assignment_id' or (r.column_name = 'id' and r.table_name = 'assignments') then 'l_assignments'
      when r.column_name = 'submission_id' or (r.column_name = 'id' and r.table_name = 'submissions') then 'l_submissions'
      when r.column_name = 'notification_id' or (r.column_name = 'id' and r.table_name = 'notifications') then 'l_notifications'
      else 'l_users' end;
    execute format('delete from public.%I where %I in (select id from %I)', r.table_name, r.column_name, v_set);
  end loop;
  -- Audit entries about the test courses, lessons, assignments and answers (entity_id is text).
  delete from public.audit_logs where entity_id in (
    select id::text from l_courses union all select id::text from l_lessons union all select id::text from l_assignments
    union all select id::text from l_submissions union all select id::text from l_users);
  delete from private.rate_limit_hits where actor in (select id from l_users);
end;
$$;

-- The accounts' sign-in records last.
delete from auth.refresh_tokens where user_id::uuid in (select id from l_users);
delete from auth.sessions where user_id in (select id from l_users);
delete from auth.identities where user_id in (select id from l_users);
delete from auth.users where id in (select id from l_users);

select (select count(*) from auth.users where email like 'load-%@ddtc.test') as test_accounts_left,
       (select count(*) from public.courses where course_code like 'LOAD%') as test_courses_left;
commit;
