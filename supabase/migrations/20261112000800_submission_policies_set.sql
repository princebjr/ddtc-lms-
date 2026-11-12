-- Phase 13, migration 54 (performance, same rules): the answers and versions policies called
-- private.can_see_submission once per row. On the load seed a learner's course page read of the answers to a
-- course's assignments took 2.9 s and a lecturer's read of the answer versions 5.9 s, and both passed the
-- 8-second statement timeout under load ("The course could not be loaded"). The rule is unchanged:
--   an answer is visible to its learner while their account is active, and, once sent (not a draft), to
--   whoever manages its course (the course's active lecturers and AAL2 administrators);
--   a version is visible exactly when its answer is.
-- "Mine" is now a column comparison and "a course I manage" one set of assignment ids worked out once per
-- query; a version's policy asks whether its answer is visible, which is now cheap.

/** The ids of the assignments the caller may manage: every one for an AAL2 administrator, else their courses'. */
create function private.managed_assignment_ids() returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id from public.assignments a
   where (select private.is_admin()) or private.is_lecturer_of(a.course_id);
$$;
revoke execute on function private.managed_assignment_ids() from public, anon;
grant execute on function private.managed_assignment_ids() to authenticated;

drop policy submissions_select on public.submissions;
create policy submissions_select on public.submissions
  for select to authenticated
  using (
    (learner_id = (select auth.uid()) and (select private.is_active_user()))
    or (status <> 'DRAFT' and assignment_id in (select private.managed_assignment_ids()))
  );

drop policy submission_versions_select on public.submission_versions;
create policy submission_versions_select on public.submission_versions
  for select to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_versions.submission_id));
