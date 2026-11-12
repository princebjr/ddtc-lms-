-- Restore check (Phase 13 restore drill; runbook "Restore drill"). Run against a RESTORED copy, never production:
--   psql "<restored database URL>" -f scripts/verify-restore.sql
-- It changes nothing. It reports:
--   1. the size of every educational table (compare with the source's figures from the same backup time);
--   2. database and Storage agreement: every VALIDATED file record must have its stored object, and every stored
--      object of a VALIDATED file must belong to a record (orphans are files the database no longer knows);
--   3. the newest records, which give the data-loss window against D34 (RPO 24 hours);
--   4. a grade spot check: a released score is within its assignment's marks.
-- The drill passes when section 2 shows 0 missing and section 4 shows 0 out of range.
\pset footer off

\echo '1. Table sizes'
-- Exact counts (table statistics are empty right after a restore).
select t as table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t), false, true, '')))[1]::text::bigint as rows
  from unnest(array['profiles', 'courses', 'course_enrollments', 'lessons', 'assignments', 'submissions', 'submission_versions',
                    'submission_files', 'file_objects', 'examinations', 'exam_attempts', 'exam_answers', 'grade_change_history',
                    'exam_grade_history', 'audit_logs', 'notifications']) t
 order by t;

\echo '2. Database and Storage agree'
select 'VALIDATED files without a stored object' as check, count(*) as count
  from public.file_objects f
 where f.status = 'VALIDATED'
   and not exists (select 1 from storage.objects o where o.bucket_id = f.bucket_name and o.name = f.storage_path)
union all
select 'stored objects with no file record (orphans)', count(*)
  from storage.objects o
 where o.bucket_id in ('profile-images', 'course-covers', 'lesson-audio', 'lesson-attachments', 'assignment-instructions-audio', 'learner-submissions')
   and not exists (select 1 from public.file_objects f where f.bucket_name = o.bucket_id and f.storage_path = o.name);

\echo '3. Newest records (the data-loss window)'
select 'newest audit entry' as what, max(created_at) as at from public.audit_logs
union all select 'newest answer version', max(submitted_at) from public.submission_versions
union all select 'newest grade change', max(changed_at) from public.grade_change_history
union all select 'newest exam grade change', max(changed_at) from public.exam_grade_history
union all select 'newest file', max(uploaded_at) from public.file_objects;

\echo '4. Grade spot check'
select 'released scores outside their assignment marks' as check, count(*) as count
  from public.submissions s join public.assignments a on a.id = s.assignment_id
 where s.released_score is not null and (s.released_score < 0 or s.released_score > a.max_marks);
