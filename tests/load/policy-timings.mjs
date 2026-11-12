#!/usr/bin/env node
// Row-level-security timings on the load seed (tests/load/seed.sql): the plain table reads the screens make
// through the API, run as a learner and as a lecturer, timed by the database (EXPLAIN ANALYZE, median of
// three). A per-row permission check in a policy shows up here as seconds on a big table, and the API would
// answer 500 once it passes the 8-second statement timeout. LOCAL ONLY.
// Usage: node tests/load/policy-timings.mjs [--json out.json]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CONTAINER = process.env.DB_CONTAINER ?? 'supabase_db_ddtc-lms';
/** @param {string} sql */
const psql = (sql) => execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-tA'], { input: sql, encoding: 'utf8', maxBuffer: 64 << 20 });

const ids = JSON.parse(
  psql(`select json_build_object(
  'learner', (select id from public.profiles where email = 'load-learner-1@ddtc.test'),
  'lecturer', (select id from public.profiles where email = 'load-lecturer-1@ddtc.test'),
  'course', (select id from public.courses where course_code = 'LOAD001'));`).trim(),
);
if (!ids.learner) throw new Error('Load the seed first: tests/load/seed.sql');

const CASES = [
  ['learner', 'lesson progress for a course', `select lp.lesson_id, lp.completion_status from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id where l.course_id = '${ids.course}'`],
  ['learner', 'own lesson progress', `select lesson_id from public.lesson_progress where learner_id = '${ids.learner}'`],
  ['learner', 'unread notifications (count)', `select count(*) from public.notifications where read_at is null`],
  ['learner', 'latest notifications', `select id, title from public.notifications order by created_at desc limit 20`],
  ['learner', 'own answers', `select id, status from public.submissions where learner_id = '${ids.learner}'`],
  ['learner', 'answer versions', `select v.id from public.submission_versions v join public.submissions s on s.id = v.submission_id where s.learner_id = '${ids.learner}'`],
  ['learner', 'course lessons', `select id, title from public.lessons where course_id = '${ids.course}' order by position`],
  ['learner', 'course assignments', `select id, title from public.assignments where course_id = '${ids.course}' order by due_at`],
  ['learner', 'own enrolments', `select course_id from public.course_enrollments where learner_id = '${ids.learner}'`],
  ['learner', 'file records', `select id from public.file_objects limit 50`],
  ['lecturer', 'lesson progress for a course', `select lp.lesson_id, lp.completion_status from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id where l.course_id = '${ids.course}'`],
  ['lecturer', 'answers to an assignment', `select s.id from public.submissions s join public.assignments a on a.id = s.assignment_id where a.course_id = '${ids.course}' limit 200`],
  ['lecturer', 'course enrolments', `select learner_id from public.course_enrollments where course_id = '${ids.course}'`],
  ['lecturer', 'unread notifications (count)', `select count(*) from public.notifications where read_at is null`],
];

const rows = [];
for (const [who, label, sql] of CASES) {
  const id = who === 'learner' ? ids.learner : ids.lecturer;
  const times = [];
  for (let i = 0; i < 3; i += 1) {
    const out = psql(`begin;
select set_config('request.jwt.claims', '${JSON.stringify({ sub: id, role: 'authenticated' })}', true);
select set_config('role', 'authenticated', true);
set local statement_timeout = '60s';
explain (analyze, format text) ${sql};
rollback;`);
    const m = /Execution Time: ([\d.]+) ms/.exec(out);
    times.push(m ? Number(m[1]) : NaN);
  }
  times.sort((a, b) => a - b);
  rows.push({ who, read: label, median_ms: times[1], over_8s_timeout: times[1] > 8000 });
}
// eslint-disable-next-line no-console -- a measuring tool prints its results as a table
console.table(rows);
if (process.argv.includes('--json')) writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify(rows, null, 2));
