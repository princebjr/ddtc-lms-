-- Phase 13, migration 52 (performance, same rules): lesson_progress's managers' policy called
-- private.can_manage_lesson(lesson_id) once per row. With a term's progress (17,919 rows in tests/load/seed.sql)
-- a learner's or lecturer's read of one course's progress took about 1 s on its own and passed the 8-second
-- statement timeout under load (the lesson page answered 500 on a throttled phone). The managers' check is now
-- one set of lesson ids worked out once per query: the lessons of the courses the caller administers or
-- teaches, which is exactly what can_manage_lesson tests (a lesson whose course the caller may manage).

/** The ids of the lessons the caller may manage: every lesson for an AAL2 administrator, else their courses' lessons. */
create function private.managed_lesson_ids() returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id from public.lessons l
   where (select private.is_admin()) or private.is_lecturer_of(l.course_id);
$$;
revoke execute on function private.managed_lesson_ids() from public, anon;
grant execute on function private.managed_lesson_ids() to authenticated;

drop policy lesson_progress_select_managers on public.lesson_progress;
create policy lesson_progress_select_managers on public.lesson_progress
  for select to authenticated
  using (lesson_id in (select private.managed_lesson_ids()));
