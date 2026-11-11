-- Step 11.1, migration 43 (owner answers of 2026-11-06; plan approved 2026-11-11; ADR-020): live presence.
--   * Supabase Realtime Presence on one private channel per course, presence:course:{id}. Realtime checks
--     these policies on realtime.messages when someone joins (SELECT to listen, INSERT to announce): only
--     the course's active learners and its lecturers, never administrators. Nothing is written per heartbeat.
--   * presence_my_courses: the channels the signed-in person may join (none for administrators).
--   * presence_people: names, role and photo for announced ids that are course-mates of the caller
--     (learners and co-lecturers of shared courses), active accounts only, never administrators, nothing
--     private. The browser announces only "I am here"; who someone is always comes from here.

/** Whether the signed-in person may join a course's presence channel. */
create function private.presence_member(p_course uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles me
      join public.courses c on c.id = p_course and c.status = 'PUBLISHED'
     where me.id = (select auth.uid()) and me.account_status = 'ACTIVE' and me.role <> 'ADMIN'
       and (exists (select 1 from public.course_enrollments e where e.course_id = c.id and e.learner_id = me.id and e.enrolment_status = 'ACTIVE')
            or exists (select 1 from public.course_lecturers l where l.course_id = c.id and l.lecturer_id = me.id and l.removed_at is null))
  );
$$;
revoke execute on function private.presence_member(uuid) from public, anon;
grant execute on function private.presence_member(uuid) to authenticated;

/** The course id in a presence topic, or null when the topic is not one. */
create function private.presence_topic_course(p_topic text) returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_topic ~ '^presence:course:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then substring(p_topic from 17)::uuid end;
$$;
revoke execute on function private.presence_topic_course(text) from public, anon;
grant execute on function private.presence_topic_course(text) to authenticated;

create policy presence_listen on realtime.messages for select to authenticated
  using (extension = 'presence' and topic = (select realtime.topic()) and private.presence_member(private.presence_topic_course((select realtime.topic()))));
create policy presence_announce on realtime.messages for insert to authenticated
  with check (extension = 'presence' and topic = (select realtime.topic()) and private.presence_member(private.presence_topic_course((select realtime.topic()))));

/** The courses whose presence channel the signed-in person may join. */
create function public.presence_my_courses() returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.courses c where private.presence_member(c.id) order by c.id;
$$;

/** Who the announced ids are, for course-mates of the caller only (owner answers 2 and 7 of 2026-11-06). */
create function public.presence_people(p_ids uuid[])
returns table (id uuid, first_name text, second_name text, role public.user_role, profile_image_file_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (select c.id from public.courses c where private.presence_member(c.id))
  select p.id, p.first_name, p.second_name, p.role, p.profile_image_file_id
    from public.profiles p
   where p.id = any (coalesce(p_ids[1:500], '{}'))
     and p.id <> (select auth.uid())
     and p.role in ('LEARNER', 'LECTURER') and p.account_status = 'ACTIVE'
     and (exists (select 1 from public.course_enrollments e join mine on mine.id = e.course_id
                   where e.learner_id = p.id and e.enrolment_status = 'ACTIVE')
          or exists (select 1 from public.course_lecturers l join mine on mine.id = l.course_id
                      where l.lecturer_id = p.id and l.removed_at is null))
   order by p.role, p.first_name, p.second_name; -- lecturers first (enum order), then by name
$$;

revoke execute on function public.presence_my_courses(), public.presence_people(uuid[]) from public, anon;
grant execute on function public.presence_my_courses(), public.presence_people(uuid[]) to authenticated;
