-- Phase 11, migration 42 (owner request and answers of 2026-11-11, ADR-019): announcements to learners.
--   * A lecturer announces to the learners of a course they teach; an AAL2 administrator to everyone, one
--     course or one branch. Only through announcement_send, which checks the sender and the audience.
--   * Each active learner in the audience gets one ANNOUNCEMENT notification (dedup per announcement and
--     learner), emailed unless they turned course emails off (the existing delivery queue).
--   * Learners read the announcements meant for them (their active courses, their branch, everyone); the
--     course's lecturers read their course's; administrators read all. Archived, never deleted.
--   * Sending and archiving are audited.

alter type public.notification_type add value if not exists 'ANNOUNCEMENT';

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete restrict,
  course_id uuid references public.courses (id) on delete restrict,
  branch_id uuid references public.branches (id) on delete restrict,
  to_everyone boolean not null default false,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  recipients integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  -- Exactly one audience: a course, a branch, or everyone.
  constraint announcements_one_audience check (num_nonnulls(course_id, branch_id, nullif(to_everyone, false)) = 1)
);
create index announcements_course_idx on public.announcements (course_id, created_at desc);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated, service_role;
grant select on public.announcements to authenticated, service_role;

create policy announcements_learner_read on public.announcements for select to authenticated
  using (archived_at is null and (select private.is_active_user()) and (
    to_everyone
    or exists (select 1 from public.course_enrollments e where e.course_id = announcements.course_id
                and e.learner_id = (select auth.uid()) and e.enrolment_status = 'ACTIVE')
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'LEARNER' and p.branch_id = announcements.branch_id)));
create policy announcements_staff_read on public.announcements for select to authenticated
  using ((course_id is not null and private.is_lecturer_of(course_id)) or author_id = (select auth.uid()) or (select private.is_admin()));

/** Sends an announcement and notifies its audience. Returns its id. */
create function public.announcement_send(p_course uuid, p_branch uuid, p_everyone boolean, p_title text, p_body text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_admin boolean := private.is_admin();
  v_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_course public.courses;
  v_count integer := 0;
  r record;
begin
  if num_nonnulls(p_course, p_branch, nullif(coalesce(p_everyone, false), false)) <> 1 then
    raise exception 'Choose one audience: a course, a branch or everyone' using errcode = '22023';
  end if;
  if not v_admin and (p_course is null or not private.is_lecturer_of(p_course) or not private.is_active_lecturer()) then
    raise exception 'You can announce only to the courses you teach' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 120 or char_length(v_body) not between 1 and 2000 then
    raise exception 'Give a title (up to 120 characters) and a message (up to 2,000)' using errcode = '22023';
  end if;
  if p_course is not null then
    select * into v_course from public.courses where id = p_course;
    if not found or v_course.status <> 'PUBLISHED' then
      raise exception 'Announce only to a published course' using errcode = '22023';
    end if;
  end if;

  insert into public.announcements (author_id, course_id, branch_id, to_everyone, title, body)
  values (v_me, p_course, p_branch, coalesce(p_everyone, false), v_title, v_body) returning id into v_id;

  for r in
    select distinct p.id
      from public.profiles p
     where p.role = 'LEARNER' and p.account_status = 'ACTIVE'
       and (coalesce(p_everyone, false)
            or p.branch_id = p_branch
            or exists (select 1 from public.course_enrollments e where e.course_id = p_course and e.learner_id = p.id and e.enrolment_status = 'ACTIVE'))
  loop
    perform private.notify(r.id, 'ANNOUNCEMENT', v_title,
      case when v_course.id is not null then v_course.title || ': ' else '' end || v_body,
      case when v_course.id is not null then 'course' end, v_course.id,
      case when v_course.id is not null then '/learner/courses/' || v_course.id else '/learner/notifications' end,
      'announcement:' || v_id || ':' || r.id);
    v_count := v_count + 1;
  end loop;
  update public.announcements set recipients = v_count where id = v_id;
  perform private.write_audit('announcement.sent', 'announcement', v_id::text, jsonb_strip_nulls(jsonb_build_object(
    'course_id', p_course, 'branch_id', p_branch, 'to_everyone', coalesce(p_everyone, false), 'recipients', v_count, 'title', v_title)));
  return v_id;
end;
$$;

/** Archives an announcement (its author, the course's lecturers or an administrator): kept, hidden from learners. */
create function public.announcement_archive(p_announcement uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.announcements;
begin
  select * into a from public.announcements where id = p_announcement for update;
  if not found then
    raise exception 'Announcement not found' using errcode = 'P0002';
  end if;
  if not (private.is_admin() or a.author_id = (select auth.uid()) or (a.course_id is not null and private.is_lecturer_of(a.course_id))) then
    raise exception 'You cannot archive this announcement' using errcode = '42501';
  end if;
  if a.archived_at is null then
    update public.announcements set archived_at = now() where id = a.id;
    perform private.write_audit('announcement.archived', 'announcement', a.id::text, '{}'::jsonb);
  end if;
end;
$$;

revoke execute on function public.announcement_send(uuid, uuid, boolean, text, text), public.announcement_archive(uuid) from public, anon;
grant execute on function public.announcement_send(uuid, uuid, boolean, text, text), public.announcement_archive(uuid) to authenticated;

-- Announcements are emailed like the other course events (D21; the person's switch applies).
create or replace function private.notifications_queue_email() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.notification_type::text in ('GRADE_RELEASED', 'GRADE_UPDATED', 'ASSIGNMENT_PUBLISHED', 'EXAM_PUBLISHED', 'DUE_REMINDER',
                                     'ENROLMENT_ADDED', 'COURSE_APPROVED', 'COURSE_RETURNED', 'ANNOUNCEMENT') then
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
