#!/usr/bin/env node
// Query timings on the load seed (tests/load/seed.sql): each read function the screens use, run as the user
// who would call it (a learner, the course's lecturer, an administrator with two-step verification), three
// times, reporting the database's own execution time (EXPLAIN ANALYZE) as the median and the slowest.
// LOCAL ONLY. Usage: node tests/load/timings.mjs [--json out.json] [--plan function_name]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CONTAINER = process.env.DB_CONTAINER ?? 'supabase_db_ddtc-lms';
/** @param {string} sql */
const psql = (sql) => execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-tA', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 64 << 20 });

const ids = JSON.parse(
  psql(`
select json_build_object(
  'learner', (select id from public.profiles where email = 'load-learner-1@ddtc.test'),
  'lecturer', (select id from public.profiles where email = 'load-lecturer-1@ddtc.test'),
  'course', (select id from public.courses where course_code = 'LOAD001'),
  'assignment', (select a.id from public.assignments a join public.courses c on c.id = a.course_id where c.course_code = 'LOAD001' order by a.title limit 1),
  'lesson', (select l.id from public.lessons l join public.courses c on c.id = l.course_id where c.course_code = 'LOAD001' order by l.position limit 1),
  'admin', (select id from public.profiles where role = 'ADMIN' and account_status = 'ACTIVE' order by created_at limit 1));`).trim(),
);
if (!ids.learner || !ids.course) throw new Error('Load the seed first: tests/load/seed.sql');
if (!ids.admin) throw new Error('No active administrator in this database');

/** Claims for a role; an administrator gets an AAL2 session with fresh activity (D32). */
function asUser(/** @type {string} */ id, aal = 'aal1') {
  const session = '00000000-0000-4000-9000-000000000001';
  const setup =
    aal === 'aal2'
      ? `insert into auth.sessions (id, user_id, created_at, updated_at, aal) values ('${session}', '${id}', now(), now(), 'aal2') on conflict (id) do update set user_id = excluded.user_id, aal = 'aal2';
insert into private.session_activity (session_id, user_id, last_seen_at) values ('${session}', '${id}', now()) on conflict (session_id) do update set user_id = excluded.user_id, last_seen_at = now();`
      : '';
  return `${setup}
select set_config('request.jwt.claims', '${JSON.stringify({ sub: id, role: 'authenticated', aal, session_id: session })}', true);
select set_config('role', 'authenticated', true);`;
}

const CASES = [
  ['learner', 'my_grades()', ids.learner],
  ['learner', `my_grade('${ids.assignment}')`, ids.learner],
  ['learner', `my_submission('${ids.assignment}')`, ids.learner],
  ['learner', `lesson_media('${ids.lesson}')`, ids.learner],
  ['learner', 'my_exam_deadlines()', ids.learner],
  ['learner', 'presence_my_courses()', ids.learner],
  ['lecturer', 'lecturer_dashboard()', ids.lecturer],
  ['lecturer', 'grading_queue()', ids.lecturer],
  ['lecturer', `gradebook_assignments('${ids.course}')`, ids.lecturer],
  ['lecturer', `assignment_submissions('${ids.assignment}')`, ids.lecturer],
  ['lecturer', `assignment_results('${ids.assignment}')`, ids.lecturer],
  ['lecturer', `assignment_statistics('${ids.course}')`, ids.lecturer],
  ['lecturer', `course_roster('${ids.course}')`, ids.lecturer],
  ['lecturer', `course_release_preview('${ids.course}')`, ids.lecturer],
  ['lecturer', `submission_review('${ids.assignment}', '${ids.learner}')`, ids.lecturer],
  ['admin', 'admin_dashboard()', ids.admin],
  ['admin', 'report_grades(null, null)', ids.admin],
  ['admin', 'report_completion(null, null)', ids.admin],
  ['admin', "report_activity(null, null, now() - interval '30 days', now())", ids.admin],
  ['admin', 'report_enrolment(null, null, null, null)', ids.admin],
];
const learnerDashboard = psql(`select count(*) from pg_proc where proname = 'learner_dashboard'`).trim() === '1';
if (learnerDashboard) CASES.splice(6, 0, ['learner', 'learner_dashboard()', ids.learner]);

const planOf = process.argv.includes('--plan') ? process.argv[process.argv.indexOf('--plan') + 1] : null;
const rows = [];
for (const [who, call, id] of CASES) {
  const aal = who === 'admin' ? 'aal2' : 'aal1';
  const times = [];
  let plan = '';
  for (let i = 0; i < 3; i += 1) {
    const out = psql(`begin;\n${asUser(id, aal)}\nexplain (analyze, buffers, format text) select * from public.${call};\nrollback;`);
    const m = /Execution Time: ([\d.]+) ms/.exec(out);
    times.push(m ? Number(m[1]) : NaN);
    plan = out;
  }
  times.sort((a, b) => a - b);
  rows.push({ who, call: call.replace(/'[0-9a-f-]{36}'/g, '…'), median_ms: times[1], max_ms: times[2] });
  if (planOf && call.startsWith(planOf)) console.log(plan);
}
// eslint-disable-next-line no-console -- a measuring tool prints its results as a table
console.table(rows);
if (process.argv.includes('--json')) writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify(rows, null, 2));
