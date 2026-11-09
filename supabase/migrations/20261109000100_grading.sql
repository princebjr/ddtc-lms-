-- Phase 9, migration 28: grading. Scores stay between 0 and the assignment's maximum marks (D14), and
-- maximum marks never drop below a score already given; what the learner sees is kept apart from the
-- grade being worked on (released_score and released_feedback), so a change after release stays
-- invisible to the learner until it is released (owner decision 2, 2026-11-09); every change to a
-- grade, every release and every reopening is recorded in grade_change_history, written by a trigger
-- and never changed or deleted (D30); notifications are durable records, written now for releases and
-- updated grades (owner decision 1; the notification centre and email are Phase 11, D21, D31); one
-- helper gives the percentage, letter grade and band from the settings, for every screen and for
-- Phase 10's calculate_course_grades (D14, D15, D30).

-- ---------------------------------------------------------------- the grade the learner sees (owner decision 2)
alter table public.submissions
  add column released_score numeric(7, 2) check (released_score is null or released_score >= 0),
  add column released_feedback text check (released_feedback is null or char_length(released_feedback) <= 10000),
  add column released_by uuid references public.profiles (id) on delete restrict,
  -- A released grade always has its score, time and releaser; RELEASED means the learner sees the
  -- current grade, DRAFT that there is nothing released or a change waits to be released.
  add constraint submissions_release_complete check (
    (released_at is null) = (released_score is null) and (released_at is null) = (released_by is null)
    and (grade_release_status = 'DRAFT' or released_at is not null)
  );

comment on column public.submissions.released_score is 'The score the learner sees (D16): copied from score on release; a later change waits in score until released again.';

-- ---------------------------------------------------------------- scores and reasons (any writer)
/**
 * A score (being worked on or released) is between 0 and the assignment's maximum marks; a released
 * grade changes only with a reason (app.grade_reason, set by the trusted functions).
 */
create function private.submissions_grade_guard() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max numeric;
begin
  if new.score is not null or new.released_score is not null then
    select a.max_marks into v_max from public.assignments a where a.id = new.assignment_id;
    if (new.score is not null and (new.score < 0 or new.score > v_max))
       or (new.released_score is not null and (new.released_score < 0 or new.released_score > v_max)) then
      raise exception 'The score must be between 0 and %', trim_scale(v_max) using errcode = '22023';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.released_at is not null
     and (new.score is distinct from old.score or new.feedback is distinct from old.feedback)
     and nullif(btrim(coalesce(current_setting('app.grade_reason', true), '')), '') is null then
    raise exception 'Give a reason for changing a released grade' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger submissions_grade_guard before insert or update on public.submissions
  for each row execute function private.submissions_grade_guard();

/** Maximum marks never drop below a score already given (that score would leave its range). */
create function private.assignments_max_marks_guard() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.max_marks < old.max_marks and exists (
    select 1 from public.submissions s
     where s.assignment_id = new.id and (s.score > new.max_marks or s.released_score > new.max_marks)
  ) then
    raise exception 'Some answers already have more marks than that' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger assignments_max_marks_guard before update of max_marks on public.assignments
  for each row execute function private.assignments_max_marks_guard();

revoke execute on function private.submissions_grade_guard(), private.assignments_max_marks_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------- grade history (D30)
create type public.grade_event as enum ('SAVED', 'RELEASED', 'REOPENED');

create table public.grade_change_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete restrict,
  event public.grade_event not null,
  previous_score numeric(7, 2),
  new_score numeric(7, 2),
  previous_feedback text,
  new_feedback text,
  reason text check (reason is null or char_length(reason) between 1 and 1000),
  changed_by uuid not null references public.profiles (id) on delete restrict,
  -- clock time, so several changes in one transaction keep their order
  changed_at timestamptz not null default clock_timestamp()
);
create index grade_change_history_submission_idx on public.grade_change_history (submission_id, changed_at);

comment on table public.grade_change_history is 'Every grade change, release and reopening (D30): written by trigger, never updated or deleted.';

create function private.keep_grade_history() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Grade history cannot be changed' using errcode = '42501';
end;
$$;

create trigger grade_change_history_keep before update or delete on public.grade_change_history
  for each row execute function private.keep_grade_history();
create trigger grade_change_history_keep_truncate before truncate on public.grade_change_history
  for each statement execute function private.keep_grade_history();

/**
 * Records a change of score or feedback (SAVED), a release (RELEASED) and a reopening (REOPENED), with
 * who did it (app.actor_id from the trusted functions) and the reason (app.grade_reason).
 */
create function private.record_grade_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(nullif(current_setting('app.actor_id', true), '')::uuid, auth.uid(), new.graded_by, new.released_by);
  v_reason text := nullif(btrim(coalesce(current_setting('app.grade_reason', true), '')), '');
begin
  if new.score is distinct from old.score or new.feedback is distinct from old.feedback then
    insert into public.grade_change_history (submission_id, event, previous_score, new_score, previous_feedback, new_feedback, reason, changed_by)
    values (new.id, 'SAVED', old.score, new.score, old.feedback, new.feedback, v_reason, v_actor);
  end if;
  if new.grade_release_status = 'RELEASED' and old.grade_release_status is distinct from 'RELEASED' then
    insert into public.grade_change_history (submission_id, event, previous_score, new_score, previous_feedback, new_feedback, changed_by)
    values (new.id, 'RELEASED', old.released_score, new.released_score, old.released_feedback, new.released_feedback, v_actor);
  end if;
  if new.status = 'REOPENED' and old.status is distinct from 'REOPENED' then
    insert into public.grade_change_history (submission_id, event, previous_score, new_score, previous_feedback, new_feedback, reason, changed_by)
    values (new.id, 'REOPENED', new.score, new.score, new.feedback, new.feedback, v_reason, v_actor);
  end if;
  return null;
end;
$$;

create trigger submissions_record_grade_change after update on public.submissions
  for each row execute function private.record_grade_change();

revoke execute on function private.keep_grade_history(), private.record_grade_change() from public, anon, authenticated;

-- Nobody reads the history directly: the course's lecturers and AAL2 administrators see it through
-- submission_review(); the server only adds to it (the trigger above).
alter table public.grade_change_history enable row level security;
revoke all on public.grade_change_history from anon, authenticated, service_role;
grant select, insert on public.grade_change_history to service_role;

-- ---------------------------------------------------------------- notifications (D31; owner decision 1)
-- Phase 9 writes grade releases and updated grades; Phase 11 adds the other D21 events, the
-- notification centre, preferences and email deliveries.
create type public.notification_type as enum ('GRADE_RELEASED', 'GRADE_UPDATED');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete restrict,
  notification_type public.notification_type not null,
  title text not null check (char_length(title) between 1 and 200),
  message text not null check (char_length(message) between 1 and 1000),
  related_entity_type text check (related_entity_type in ('assignment', 'course', 'submission')),
  related_entity_id uuid,
  -- Where View goes in the app: always a path inside the app.
  link_path text check (link_path ~ '^/[a-z]' and char_length(link_path) <= 300),
  -- One notification per event (D31).
  deduplication_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated, service_role;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update on public.notifications to service_role;

create policy notifications_recipient_read on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()) and (select private.is_active_user()));
create policy notifications_recipient_mark_read on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()) and (select private.is_active_user()))
  with check (recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------- percentage, letter grade and band (D14, D15, D30)
/**
 * The one place a grade becomes a percentage (score / max_marks x 100, two decimals), a letter grade
 * (D14: the highest band whose lower bound the percentage reaches), a band (D15: lower <= percentage
 * < upper, 100 in the last band) and pass or not (pass_mark). Read from system_settings, so changing
 * the scale changes every result at once (nothing is stored, D30).
 */
create function private.grade_facts(p_score numeric, p_max numeric,
  out percentage numeric, out letter_grade text, out band text, out passed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scale jsonb;
  v_bands jsonb;
  v_pass numeric;
  v_lo numeric;
  v_hi numeric;
  v_last boolean;
begin
  if p_score is null or p_max is null or p_max <= 0 then
    return;
  end if;
  percentage := round(p_score / p_max * 100, 2);
  select value into v_scale from public.system_settings where key = 'grade_scale';
  select value into v_bands from public.system_settings where key = 'distribution_bands';
  select (value)::text::numeric into v_pass from public.system_settings where key = 'pass_mark';
  select e ->> 'grade' into letter_grade
    from jsonb_array_elements(v_scale) e
   where (e ->> 'min')::numeric <= percentage
   order by (e ->> 'min')::numeric desc
   limit 1;
  select (b ->> 0)::numeric, (b ->> 1)::numeric, n = jsonb_array_length(v_bands)
    into v_lo, v_hi, v_last
    from jsonb_array_elements(v_bands) with ordinality as x(b, n)
   where (b ->> 0)::numeric <= percentage
     and (percentage < (b ->> 1)::numeric or (n = jsonb_array_length(v_bands) and percentage <= (b ->> 1)::numeric))
   order by n
   limit 1;
  band := case
    when v_lo is null then null
    when v_last then trim_scale(v_lo) || '-' || trim_scale(v_hi) || '%'
    else trim_scale(v_lo) || '-' || trim_scale(v_hi - 1) || '%'
  end;
  passed := percentage >= coalesce(v_pass, 50);
end;
$$;

revoke execute on function private.grade_facts(numeric, numeric) from public, anon, authenticated;
