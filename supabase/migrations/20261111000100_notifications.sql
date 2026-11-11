-- Phase 11, migration 38 (D21, D31, ADR-019; owner answers of 2026-11-10): notifications for every D21
-- event and the examination events, email deliveries with the D31 retry schedule, and 24-hour reminders.
--   * Events: assignment published, examination published, due within 24 hours (unsubmitted work only,
--     each learner's own deadline), enrolment added, course approved or returned (with Phase 9's grade
--     released and updated), extensions granted, changed or taken back, and alerts to administrators.
--     Each is written by a trigger on the table that changes, so every path is covered, once per event
--     (deduplication key, D31).
--   * Email: an email event queues one notification_deliveries row (SUPPRESSED when the person turned
--     email off or is not active). Extensions and alerts are in the app only. The send-notification-email
--     worker (every minute) claims due rows with notification_deliveries_claim and reports each result
--     with notification_delivery_result, which applies the retry schedule (setting
--     notification_retry_minutes: 1, 5, 15, 60, 240): FAILED after the last, with an alert; a permanent
--     failure is FAILED at once.
--   * Reminders: schedule_reminders (every 15 minutes) keeps one PENDING notification_reminders row per
--     learner and unsubmitted item, keyed reminder:{item}:{learner}:{effective_due_at} (D31); a deadline
--     or extension change cancels the old row and creates a new one; a row fires once, 24 hours before.
--     It also alerts administrators to files that keep failing to be removed (Phase 8, three failures).

alter type public.notification_type add value if not exists 'ASSIGNMENT_PUBLISHED';
alter type public.notification_type add value if not exists 'EXAM_PUBLISHED';
alter type public.notification_type add value if not exists 'DUE_REMINDER';
alter type public.notification_type add value if not exists 'ENROLMENT_ADDED';
alter type public.notification_type add value if not exists 'COURSE_APPROVED';
alter type public.notification_type add value if not exists 'COURSE_RETURNED';
alter type public.notification_type add value if not exists 'EXTENSION_CHANGED';
alter type public.notification_type add value if not exists 'SYSTEM_ALERT';

-- ---------------------------------------------------------------- deliveries (D31)
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications (id) on delete restrict,
  channel text not null default 'EMAIL' check (channel = 'EMAIL'),
  status text not null default 'QUEUED' check (status in ('QUEUED', 'SENT', 'RETRYING', 'FAILED', 'SUPPRESSED')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text check (char_length(provider_message_id) <= 200),
  last_error text check (char_length(last_error) <= 1000),
  next_attempt_at timestamptz default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_deliveries_due_idx on public.notification_deliveries (next_attempt_at) where status in ('QUEUED', 'RETRYING');
create trigger notification_deliveries_set_updated_at before update on public.notification_deliveries
  for each row execute function private.set_updated_at();
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated, service_role;
grant select on public.notification_deliveries to authenticated;
grant select on public.notification_deliveries to service_role;
create policy notification_deliveries_admin_read on public.notification_deliveries
  for select to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------- reminders (D31)
create table public.notification_reminders (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ASSIGNMENT', 'EXAMINATION')),
  item_id uuid not null,
  course_id uuid not null references public.courses (id) on delete restrict,
  learner_id uuid not null references public.profiles (id) on delete restrict,
  effective_due_at timestamptz not null,
  fire_at timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'CANCELLED')),
  deduplication_key text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now()
);
create index notification_reminders_pending_idx on public.notification_reminders (fire_at) where status = 'PENDING';
create trigger notification_reminders_set_updated_at before update on public.notification_reminders
  for each row execute function private.set_updated_at();
alter table public.notification_reminders enable row level security;
revoke all on public.notification_reminders from anon, authenticated, service_role;
grant select on public.notification_reminders to authenticated, service_role; -- no policy: nobody reads through the API

-- ---------------------------------------------------------------- writing a notification
/** Ghana time for messages (D24). */
create function private.ghana_time(p timestamptz) returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p at time zone 'Africa/Accra', 'FMDD Mon YYYY, HH24:MI') || ' (Ghana time)';
$$;

/** One notification per event: a second write with the same key does nothing (D31). */
create function private.notify(p_recipient uuid, p_type text, p_title text, p_message text, p_entity_type text,
                               p_entity_id uuid, p_link text, p_key text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, notification_type, title, message, related_entity_type, related_entity_id, link_path, deduplication_key)
  values (p_recipient, p_type::public.notification_type, left(p_title, 200), left(p_message, 1000), p_entity_type, p_entity_id, p_link, p_key)
  on conflict (deduplication_key) do nothing;
end;
$$;

/** Alerts every active administrator (in the app only). */
create function private.alert_admins(p_title text, p_message text, p_key text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v uuid;
begin
  for v in select p.id from public.profiles p where p.role = 'ADMIN' and p.account_status = 'ACTIVE' loop
    perform private.notify(v, 'SYSTEM_ALERT', p_title, p_message, null, null, '/admin/notifications', p_key || ':' || v);
  end loop;
end;
$$;

/** An email event queues one delivery; SUPPRESSED when the person turned email off or is not active (D21). */
create function private.notifications_queue_email() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.notification_type::text in ('GRADE_RELEASED', 'GRADE_UPDATED', 'ASSIGNMENT_PUBLISHED', 'EXAM_PUBLISHED', 'DUE_REMINDER',
                                     'ENROLMENT_ADDED', 'COURSE_APPROVED', 'COURSE_RETURNED') then
    insert into public.notification_deliveries (notification_id, status, next_attempt_at)
    select new.id,
           case when p.account_status = 'ACTIVE' and coalesce(np.email_enabled, true) then 'QUEUED' else 'SUPPRESSED' end,
           case when p.account_status = 'ACTIVE' and coalesce(np.email_enabled, true) then now() end
      from public.profiles p
      left join public.notification_preferences np on np.user_id = p.id
     where p.id = new.recipient_id;
  end if;
  return null;
end;
$$;
create trigger notifications_queue_email after insert on public.notifications
  for each row execute function private.notifications_queue_email();

-- ---------------------------------------------------------------- the events
/** Assignment published: every active learner of the (published) course, once per assignment. */
create function private.assignments_notify() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.courses;
  v_practical boolean;
  r record;
begin
  if new.publication_status <> 'PUBLISHED' or new.archived_at is not null
     or (tg_op = 'UPDATE' and old.publication_status = 'PUBLISHED' and old.archived_at is null) then
    return null;
  end if;
  select * into c from public.courses where id = new.course_id;
  if c.status <> 'PUBLISHED' then
    return null;
  end if;
  select g.part = 'PRACTICALS' into v_practical from public.grade_categories g where g.id = new.category_id;
  for r in select e.learner_id from public.course_enrollments e where e.course_id = new.course_id and e.enrolment_status = 'ACTIVE' loop
    perform private.notify(r.learner_id, 'ASSIGNMENT_PUBLISHED', case when v_practical then 'New practical' else 'New assignment' end,
      new.title || ' in ' || c.title || case when v_practical then '. Marked in person by your lecturer.' else '. Due ' || private.ghana_time(new.due_at) || '.' end,
      'assignment', new.id, '/learner/courses/' || new.course_id || '/assignments/' || new.id,
      'assignment-published:' || new.id || ':' || r.learner_id);
  end loop;
  return null;
end;
$$;
create trigger assignments_notify after insert or update of publication_status, archived_at on public.assignments
  for each row execute function private.assignments_notify();

/** Examination published: every active learner of the course, once per examination. */
create function private.examinations_notify() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.courses;
  r record;
begin
  if new.publication_status <> 'PUBLISHED' or new.archived_at is not null
     or (tg_op = 'UPDATE' and old.publication_status = 'PUBLISHED' and old.archived_at is null) then
    return null;
  end if;
  select * into c from public.courses where id = new.course_id;
  if c.status <> 'PUBLISHED' then
    return null;
  end if;
  for r in select e.learner_id from public.course_enrollments e where e.course_id = new.course_id and e.enrolment_status = 'ACTIVE' loop
    perform private.notify(r.learner_id, 'EXAM_PUBLISHED', 'New examination',
      new.title || ' in ' || c.title || '. Opens ' || private.ghana_time(new.opens_at) || '; submit by ' || private.ghana_time(new.closes_at) || '.',
      'examination', new.id, '/learner/courses/' || new.course_id || '/exams/' || new.id,
      'exam-published:' || new.id || ':' || r.learner_id);
  end loop;
  return null;
end;
$$;
create trigger examinations_notify after insert or update of publication_status, archived_at on public.examinations
  for each row execute function private.examinations_notify();

/** Enrolment added: an active enrolment in a published course, once per enrolment. */
create function private.notify_enrolment(p_enrolment uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select e.id, e.learner_id, c.id as course_id, c.title into r
    from public.course_enrollments e join public.courses c on c.id = e.course_id
   where e.id = p_enrolment and e.enrolment_status = 'ACTIVE' and c.status = 'PUBLISHED';
  if found then
    perform private.notify(r.learner_id, 'ENROLMENT_ADDED', 'You have been enrolled', 'You are now enrolled in ' || r.title || '.',
      'course', r.course_id, '/learner/courses/' || r.course_id, 'enrolment:' || r.id);
  end if;
end;
$$;

create function private.course_enrollments_notify() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.enrolment_status = 'ACTIVE' and (tg_op = 'INSERT' or old.enrolment_status <> 'ACTIVE') then
    perform private.notify_enrolment(new.id);
  end if;
  return null;
end;
$$;
create trigger course_enrollments_notify after insert or update of enrolment_status on public.course_enrollments
  for each row execute function private.course_enrollments_notify();

/** Course approved or returned (the lecturers); a course that publishes tells its enrolled learners. */
create function private.courses_notify() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_at text := extract(epoch from clock_timestamp())::text;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;
  if old.status = 'PENDING_APPROVAL' and new.status in ('PUBLISHED', 'DRAFT') then
    for r in select l.lecturer_id from public.course_lecturers l where l.course_id = new.id and l.removed_at is null loop
      if new.status = 'PUBLISHED' then
        perform private.notify(r.lecturer_id, 'COURSE_APPROVED', 'Course approved', new.title || ' was approved and is now published.',
          'course', new.id, '/lecturer/courses/' || new.id, 'course-approved:' || new.id || ':' || r.lecturer_id || ':' || v_at);
      else
        perform private.notify(r.lecturer_id, 'COURSE_RETURNED', 'Course returned',
          new.title || ' was returned for changes' || coalesce(': ' || new.return_reason, '.'),
          'course', new.id, '/lecturer/courses/' || new.id, 'course-returned:' || new.id || ':' || r.lecturer_id || ':' || v_at);
      end if;
    end loop;
  end if;
  if new.status = 'PUBLISHED' then
    for r in select e.id from public.course_enrollments e where e.course_id = new.id and e.enrolment_status = 'ACTIVE' loop
      perform private.notify_enrolment(r.id);
    end loop;
  end if;
  return null;
end;
$$;
create trigger courses_notify after update of status on public.courses
  for each row execute function private.courses_notify();

/** Extensions granted, changed or taken back (in the app only). */
create function private.extension_message(p_new_due timestamptz, p_revoked boolean, p_base_due timestamptz, p_title text, p_insert boolean, p_changed boolean,
                                          out title text, out message text)
language sql
stable
set search_path = ''
as $$
  select case when p_revoked then 'Extension taken back' when p_insert then 'Extension granted' else 'Extension changed' end,
         case when p_revoked then p_title || ': your extension was taken back. The deadline is ' || private.ghana_time(p_base_due) || '.'
              else p_title || ': your new deadline is ' || private.ghana_time(p_new_due) || '.' end;
$$;

create function private.submission_extensions_notify() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assignments;
  m record;
  v_revoked boolean := tg_op = 'UPDATE' and new.revoked_at is not null and old.revoked_at is null;
begin
  if tg_op = 'UPDATE' and not v_revoked and (new.revoked_at is not null or new.extended_due_at is not distinct from old.extended_due_at) then
    return null;
  end if;
  select * into a from public.assignments where id = new.assignment_id;
  if a.publication_status <> 'PUBLISHED' then
    return null;
  end if;
  select * into m from private.extension_message(new.extended_due_at, v_revoked, a.due_at, a.title, tg_op = 'INSERT', true);
  perform private.notify(new.learner_id, 'EXTENSION_CHANGED', m.title, m.message, 'assignment', a.id,
    '/learner/courses/' || a.course_id || '/assignments/' || a.id, 'extension:' || new.id || ':' || extract(epoch from clock_timestamp())::text);
  return null;
end;
$$;
create trigger submission_extensions_notify after insert or update on public.submission_extensions
  for each row execute function private.submission_extensions_notify();

create function private.exam_extensions_notify() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.examinations;
  m record;
  v_revoked boolean := tg_op = 'UPDATE' and new.revoked_at is not null and old.revoked_at is null;
  v_granted boolean := tg_op = 'INSERT' or (old.revoked_at is not null and new.revoked_at is null);
begin
  if not v_revoked and not v_granted and (new.revoked_at is not null or new.closes_at is not distinct from old.closes_at) then
    return null;
  end if;
  select * into x from public.examinations where id = new.exam_id;
  if x.publication_status <> 'PUBLISHED' then
    return null;
  end if;
  select * into m from private.extension_message(new.closes_at, v_revoked, x.closes_at, x.title, v_granted, true);
  perform private.notify(new.learner_id, 'EXTENSION_CHANGED', m.title, m.message, 'examination', x.id,
    '/learner/courses/' || x.course_id || '/exams/' || x.id, 'exam-extension:' || new.id || ':' || extract(epoch from clock_timestamp())::text);
  return null;
end;
$$;
create trigger exam_extensions_notify after insert or update on public.exam_extensions
  for each row execute function private.exam_extensions_notify();

-- ---------------------------------------------------------------- reminders and alerts (every 15 minutes)
create function private.schedule_reminders() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  create temporary table if not exists pg_temp.wanted_reminders (kind text, item_id uuid, course_id uuid, learner_id uuid, due timestamptz, k text) on commit drop;
  truncate pg_temp.wanted_reminders;
  insert into pg_temp.wanted_reminders
  select w.kind, w.item_id, w.course_id, w.learner_id, w.due,
         case when w.kind = 'ASSIGNMENT' then 'reminder:' else 'reminder:exam:' end || w.item_id || ':' || w.learner_id || ':' || w.due::text
    from (
      select 'ASSIGNMENT' as kind, a.id as item_id, a.course_id, e.learner_id, private.effective_due_at(a.id, e.learner_id) as due
        from public.assignments a
        join public.courses c on c.id = a.course_id and c.status = 'PUBLISHED'
        join public.grade_categories g on g.id = a.category_id and g.part <> 'PRACTICALS'
        join public.course_enrollments e on e.course_id = a.course_id and e.enrolment_status = 'ACTIVE'
       where a.publication_status = 'PUBLISHED' and a.archived_at is null
         and not exists (select 1 from public.submissions s where s.assignment_id = a.id and s.learner_id = e.learner_id and s.status <> 'DRAFT')
      union all
      select 'EXAMINATION', x.id, x.course_id, e.learner_id, private.exam_close_for(x.id, e.learner_id)
        from public.examinations x
        join public.courses c on c.id = x.course_id and c.status = 'PUBLISHED'
        join public.course_enrollments e on e.course_id = x.course_id and e.enrolment_status = 'ACTIVE'
        left join lateral (select t.status from public.exam_attempts t where t.exam_id = x.id and t.learner_id = e.learner_id
                            order by t.attempt_number desc limit 1) t on true
       where x.publication_status = 'PUBLISHED' and x.archived_at is null and coalesce(t.status::text, '') <> 'SUBMITTED'
    ) w
   where w.due > now() and w.due <= now() + interval '7 days';

  -- A pending reminder that no longer matches (sent, withdrawn, deadline or extension changed) is cancelled.
  update public.notification_reminders n set status = 'CANCELLED'
   where n.status = 'PENDING' and not exists (select 1 from pg_temp.wanted_reminders w where w.k = n.deduplication_key);

  insert into public.notification_reminders (kind, item_id, course_id, learner_id, effective_due_at, fire_at, deduplication_key)
  select w.kind, w.item_id, w.course_id, w.learner_id, w.due, w.due - interval '24 hours', w.k from pg_temp.wanted_reminders w
  on conflict (deduplication_key) do update set status = 'PENDING' where public.notification_reminders.status = 'CANCELLED';

  -- Fire what is due, once.
  for r in
    select n.*, coalesce(a.title, x.title) as title from public.notification_reminders n
      left join public.assignments a on n.kind = 'ASSIGNMENT' and a.id = n.item_id
      left join public.examinations x on n.kind = 'EXAMINATION' and x.id = n.item_id
     where n.status = 'PENDING' and n.fire_at <= now() and n.effective_due_at > now()
     for update of n skip locked
  loop
    perform private.notify(r.learner_id, 'DUE_REMINDER', 'Due within 24 hours',
      r.title || case when r.kind = 'EXAMINATION' then ' must be submitted by ' else ' is due ' end || private.ghana_time(r.effective_due_at) || '.',
      lower(r.kind), r.item_id,
      '/learner/courses/' || r.course_id || case when r.kind = 'EXAMINATION' then '/exams/' else '/assignments/' end || r.item_id,
      r.deduplication_key);
    update public.notification_reminders set status = 'SENT' where id = r.id;
  end loop;

  -- Phase 8: files that keep failing to be removed (three failures or more), once per file.
  for r in select f.id, f.storage_path from public.file_objects f where f.delete_attempts >= 3 and f.status <> 'DELETED' loop
    perform private.alert_admins('A file could not be removed', 'Removing a stored file failed three times or more. See Files that could not be removed in the runbook.',
      'cleanup-failure:' || r.id);
  end loop;
end;
$$;
revoke execute on function private.schedule_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------- the email worker's calls (service role only)
/**
 * Due deliveries for the worker, with the address: anyone who turned email off (or is not active) is
 * SUPPRESSED instead. Claimed rows are leased for 15 minutes so two workers never send the same email.
 */
create function public.notification_deliveries_claim(p_limit integer)
returns table (delivery_id uuid, email text, first_name text, title text, message text, link_path text, notification_type text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_deliveries d set status = 'SUPPRESSED', next_attempt_at = null
    from public.notifications n join public.profiles p on p.id = n.recipient_id
    left join public.notification_preferences np on np.user_id = p.id
   where d.notification_id = n.id and d.status in ('QUEUED', 'RETRYING') and d.next_attempt_at <= now()
     and (p.account_status <> 'ACTIVE' or not coalesce(np.email_enabled, true));
  return query
  with due as (
    select d.id from public.notification_deliveries d
     where d.status in ('QUEUED', 'RETRYING') and d.next_attempt_at <= now()
     order by d.next_attempt_at
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
     for update skip locked
  ), leased as (
    update public.notification_deliveries d set next_attempt_at = now() + interval '15 minutes'
      from due where d.id = due.id
    returning d.id, d.notification_id, d.attempts
  )
  select l.id, u.email::text, p.first_name, n.title, n.message, n.link_path, n.notification_type::text, l.attempts
    from leased l
    join public.notifications n on n.id = l.notification_id
    join public.profiles p on p.id = n.recipient_id
    join auth.users u on u.id = p.id
   where u.email is not null;
end;
$$;
revoke execute on function public.notification_deliveries_claim(integer) from public, anon, authenticated;
grant execute on function public.notification_deliveries_claim(integer) to service_role;

/** A send's result: SENT; FAILED at once if permanent; otherwise the D31 retry schedule, then FAILED with an alert. */
create function public.notification_delivery_result(p_delivery uuid, p_ok boolean, p_provider_id text, p_error text, p_permanent boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.notification_deliveries;
  v_waits jsonb := coalesce((select value from public.system_settings where key = 'notification_retry_minutes'), '[1,5,15,60,240]'::jsonb);
  v_attempts integer;
  v_status text;
  v_who text;
  v_title text;
begin
  select * into d from public.notification_deliveries where id = p_delivery for update;
  if not found then
    raise exception 'Delivery not found' using errcode = 'P0002';
  end if;
  v_attempts := d.attempts + 1;
  if p_ok then
    update public.notification_deliveries set status = 'SENT', attempts = v_attempts, sent_at = now(), next_attempt_at = null,
           provider_message_id = left(p_provider_id, 200), last_error = null where id = d.id;
    return 'SENT';
  end if;
  if not coalesce(p_permanent, false) and v_attempts <= jsonb_array_length(v_waits) then
    update public.notification_deliveries set status = 'RETRYING', attempts = v_attempts, last_error = left(p_error, 1000),
           next_attempt_at = now() + make_interval(mins => (v_waits ->> (v_attempts - 1))::int) where id = d.id;
    return 'RETRYING';
  end if;
  update public.notification_deliveries set status = 'FAILED', attempts = v_attempts, last_error = left(p_error, 1000), next_attempt_at = null where id = d.id;
  select p.first_name || ' ' || p.second_name, n.title into v_who, v_title
    from public.notifications n join public.profiles p on p.id = n.recipient_id where n.id = d.notification_id;
  perform private.alert_admins('An email could not be sent',
    'The email "' || v_title || '" to ' || v_who || ' failed' || case when coalesce(p_permanent, false) then '' else ' after ' || v_attempts || ' attempts' end
      || ': ' || coalesce(left(p_error, 300), 'unknown error') || '.',
    'delivery-failed:' || d.id);
  return 'FAILED';
end;
$$;
revoke execute on function public.notification_delivery_result(uuid, boolean, text, text, boolean) from public, anon, authenticated;
grant execute on function public.notification_delivery_result(uuid, boolean, text, text, boolean) to service_role;

-- ---------------------------------------------------------------- schedules
/** Calls an Edge Function with the Vault secrets (as cleanup-files does, migration 11); does nothing until configured. */
create function private.call_edge_function(p_name text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key');
begin
  if v_url is null or v_key is null then
    return;
  end if;
  perform net.http_post(url := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key), body := '{}'::jsonb);
end;
$$;
revoke execute on function private.call_edge_function(text) from public, anon, authenticated;

select cron.schedule('schedule-reminders', '*/15 * * * *', 'select private.schedule_reminders()');
select cron.schedule('send-notification-email', '* * * * *', $$select private.call_edge_function('send-notification-email')$$);
