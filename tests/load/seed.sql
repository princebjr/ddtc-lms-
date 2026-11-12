-- Load and query-plan seed (Phase 13; extended in Phase 15, docs/CAPACITY.md). LOCAL OR A THROWAWAY COPY
-- ONLY: it adds thousands of accounts. Realistic DDTC sizes, a little above today's: 20 courses, each with
-- one lecturer and 150 learners (3,000 learners), 12 published lessons, 15 published assignments with every
-- learner's answer (45,000 answers; about 80% graded and released, the rest waiting), and one examination
-- with 150 submitted attempts. Sign-in works for the lecturers and the first 300 learners
-- (load-learner-1..300@ddtc.test, load-lecturer-1..20@ddtc.test), password Load-Password-2026.
-- Run: docker exec -i supabase_db_ddtc-lms psql -U postgres -v ON_ERROR_STOP=1 < tests/load/seed.sql
\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local session_replication_role = 'origin';

create temporary table seed_users (n int, id uuid, role text) on commit drop;
-- Lecturers and learners as GoTrue stores them; the sign-up trigger creates their profiles.
insert into seed_users
select n, gen_random_uuid(), 'LECTURER' from generate_series(1, 20) n
union all
select n, gen_random_uuid(), 'LEARNER' from generate_series(1, 3000) n;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       case when u.role = 'LECTURER' then 'load-lecturer-' || u.n || '@ddtc.test' else 'load-learner-' || u.n || '@ddtc.test' end,
       case when u.role = 'LECTURER' or u.n <= 300 then extensions.crypt('Load-Password-2026', extensions.gen_salt('bf', 6)) else '' end,
       now(), '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('first_name', case when u.role = 'LECTURER' then 'Lecturer' else 'Learner' end, 'second_name', 'Load' || u.n),
       now(), now()
  from seed_users u;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email', jsonb_build_object('sub', u.id::text, 'email', au.email, 'email_verified', true), now(), now(), now()
  from seed_users u join auth.users au on au.id = u.id;
update public.profiles p set role = 'LECTURER', can_create_courses = true, profile_completed = true from seed_users u where u.id = p.id and u.role = 'LECTURER';
update public.profiles p set profile_completed = true from seed_users u where u.id = p.id and u.role = 'LEARNER';

-- 20 published courses, each owned by its lecturer.
create temporary table seed_courses (n int, id uuid, lecturer uuid) on commit drop;
insert into seed_courses select l.n, gen_random_uuid(), l.id from seed_users l where l.role = 'LECTURER';
insert into public.courses (id, title, course_code, created_by, status, published_at)
select c.id, 'Load course ' || c.n, 'LOAD' || lpad(c.n::text, 3, '0'), c.lecturer, 'PUBLISHED', now() - interval '120 days' from seed_courses c;
insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by)
select c.id, c.lecturer, 'OWNER', c.lecturer from seed_courses c;
-- Learner n is in course ((n - 1) / 150) + 1: 150 learners a course.
insert into public.course_enrollments (course_id, learner_id, enrolment_status, enrolled_by)
select c.id, u.id, 'ACTIVE', c.lecturer from seed_users u join seed_courses c on c.n = ((u.n - 1) / 150) + 1 where u.role = 'LEARNER';

-- 12 published lessons a course, about 600 words each.
insert into public.lessons (course_id, title, content, position, publication_status, created_by, published_at)
select c.id, 'Lesson ' || k, '<p>' || repeat('Discipleship grows through the word, prayer and fellowship. ', 75) || '</p>', k, 'PUBLISHED', c.lecturer, now() - interval '100 days'
  from seed_courses c, generate_series(1, 12) k;

-- 15 published assignments a course, due over the last 90 days.
create temporary table seed_assignments (id uuid, course uuid, lecturer uuid, k int) on commit drop;
insert into seed_assignments select gen_random_uuid(), c.id, c.lecturer, k from seed_courses c, generate_series(1, 15) k;
insert into public.assignments (id, course_id, category_id, title, content_type, text_instructions, due_at, max_marks, accepted_formats, publication_status, created_by, published_at)
select a.id, a.course, g.id, 'Weekly assignment ' || a.k, 'TEXT', '<p>Reflect on this week''s lesson.</p>', now() - make_interval(days => 90 - a.k * 6), 20, array['TEXT', 'AUDIO'], 'PUBLISHED', a.lecturer, now() - interval '95 days'
  from seed_assignments a join public.grade_categories g on g.course_id = a.course and g.part = 'ASSIGNMENTS' and g.archived_at is null;

-- Every learner answers every assignment of their course; about 80% graded and released.
insert into public.submissions (assignment_id, learner_id, status, current_version, is_late, score, feedback, graded_by, graded_at, grade_release_status, released_at, released_score, released_feedback, released_by)
select a.id, e.learner_id,
       case when r.graded then 'GRADED' else 'SUBMITTED' end::public.submission_status, 1, false,
       case when r.graded then r.score end, case when r.graded then 'Good work.' end,
       case when r.graded then a.lecturer end, case when r.graded then now() - interval '10 days' end,
       case when r.graded then 'RELEASED' else 'DRAFT' end::public.grade_release_status,
       case when r.graded then now() - interval '9 days' end, case when r.graded then r.score end,
       case when r.graded then 'Good work.' end, case when r.graded then a.lecturer end
  from seed_assignments a
  join public.course_enrollments e on e.course_id = a.course
  cross join lateral (select random() < 0.8 as graded, (8 + floor(random() * 13))::numeric as score) r;
insert into public.submission_versions (submission_id, version_number, text_answer, is_late, client_request_id)
select s.id, 1, 'My reflection on this week''s lesson.', false, gen_random_uuid()
  from public.submissions s join seed_assignments a on a.id = s.assignment_id;

-- Lesson progress: each learner completed about half of their course's lessons.
insert into public.lesson_progress (lesson_id, learner_id, completion_status, completed_at)
select l.id, e.learner_id, 'COMPLETED', now() - interval '20 days'
  from public.lessons l join seed_courses c on c.id = l.course_id
  join public.course_enrollments e on e.course_id = c.id
 where random() < 0.5
on conflict do nothing;

commit;

analyze;
select (select count(*) from public.profiles where email like 'load-%') as accounts, (select count(*) from public.submissions) as answers,
       (select count(*) from public.lessons) as lessons, (select count(*) from public.course_enrollments) as enrolments;
