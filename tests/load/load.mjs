#!/usr/bin/env node
// Load test (Phase 13; the base for Phase 15's stress, spike and soak tests). Virtual users sign in with the
// seeded accounts (tests/load/seed.sql) and repeat what the screens ask for, with a short think time:
//   learners  - dashboard, lesson list, one lesson with its media, grades, one assignment with their answer;
//   lecturers - dashboard, the grading queue, a course gradebook, one assignment's answers.
// It reports, per request: count, errors, median, 95th and 99th percentile response time, and the overall
// requests per second. Plain Node 22+ (fetch), no extra tools.
// Usage: node tests/load/load.mjs [--learners 150] [--lecturers 10] [--seconds 120] [--think 1000] [--json out.json]
// Defaults hit the local stack (127.0.0.1:54321). LOCAL OR A THROWAWAY COPY ONLY: never production.
import { writeFileSync } from 'node:fs';
import { localSupabase } from '../e2e/support/local-supabase.js';

const arg = (/** @type {string} */ name, /** @type {number} */ fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const LEARNERS = arg('learners', 150);
const LECTURERS = arg('lecturers', 10);
const SECONDS = arg('seconds', 120);
const THINK = arg('think', 1000);
const PASSWORD = 'Load-Password-2026';
const s = localSupabase();
if (!s.url || !s.anonKey) throw new Error('Local Supabase is not running');

/** @type {Record<string, { ms: number[], errors: number, statuses: Record<string, number> }>} */
const stats = {};
const record = (/** @type {string} */ name, /** @type {number} */ ms, /** @type {boolean} */ ok, /** @type {number} */ status) => {
  const st = (stats[name] ??= { ms: [], errors: 0, statuses: {} });
  st.ms.push(ms);
  if (!ok) {
    st.errors += 1;
    st.statuses[status] = (st.statuses[status] ?? 0) + 1;
  }
};

/** One timed request. @param {string} name @param {string} path @param {string} token @param {RequestInit} [init] */
async function hit(name, path, token, init = {}) {
  const t0 = performance.now();
  let status;
  let body = null;
  try {
    const res = await fetch(`${s.url}${path}`, { ...init, headers: { apikey: s.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
    status = res.status;
    body = await res.json().catch(() => null);
    record(name, performance.now() - t0, res.ok, status);
  } catch {
    record(name, performance.now() - t0, false, 0);
  }
  return body;
}
const rpc = (/** @type {string} */ name, /** @type {string} */ token, /** @type {object} */ args = {}) => hit(name, `/rest/v1/rpc/${name}`, token, { method: 'POST', body: JSON.stringify(args) });
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms * (0.5 + Math.random())));

/** @param {string} email */
async function signIn(email) {
  const t0 = performance.now();
  const res = await fetch(`${s.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: s.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  record('sign-in', performance.now() - t0, res.ok, res.status);
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  return /** @type {{ access_token: string, user: { id: string } }} */ (await res.json());
}

const end = Date.now() + SECONDS * 1000;

/** @param {number} n */
async function learner(n) {
  const session = await signIn(`load-learner-${n}@ddtc.test`);
  const token = session.access_token;
  const [enrolment] = (await hit('my enrolments', `/rest/v1/course_enrollments?select=course_id&learner_id=eq.${session.user.id}&limit=1`, token)) ?? [];
  const course = enrolment?.course_id;
  while (Date.now() < end) {
    await rpc('learner_dashboard', token);
    await sleep(THINK);
    const lessons = (await hit('lesson list', `/rest/v1/lessons?select=id,title,position&course_id=eq.${course}&order=position`, token)) ?? [];
    await sleep(THINK);
    const lesson = lessons[Math.floor(Math.random() * Math.max(1, lessons.length))];
    if (lesson) {
      await hit('lesson', `/rest/v1/lessons?select=id,title,content&id=eq.${lesson.id}`, token);
      await rpc('lesson_media', token, { p_lesson: lesson.id });
    }
    await sleep(THINK);
    await rpc('my_grades', token);
    await sleep(THINK);
    const assignments = (await hit('assignment list', `/rest/v1/assignments?select=id,title,due_at&course_id=eq.${course}&order=due_at`, token)) ?? [];
    const a = assignments[Math.floor(Math.random() * Math.max(1, assignments.length))];
    if (a) await rpc('my_submission', token, { p_assignment: a.id });
    await sleep(THINK);
  }
}

/** @param {number} n */
async function lecturer(n) {
  const session = await signIn(`load-lecturer-${n}@ddtc.test`);
  const token = session.access_token;
  const [course] = (await hit('my courses', `/rest/v1/course_lecturers?select=course_id&lecturer_id=eq.${session.user.id}&limit=1`, token)) ?? [];
  const courseId = course?.course_id;
  while (Date.now() < end) {
    await rpc('lecturer_dashboard', token);
    await sleep(THINK);
    await rpc('grading_queue', token);
    await sleep(THINK);
    await rpc('gradebook_assignments', token, { p_course: courseId });
    await sleep(THINK);
    const [a] = (await hit('assignment list (lecturer)', `/rest/v1/assignments?select=id&course_id=eq.${courseId}&limit=1`, token)) ?? [];
    if (a) await rpc('assignment_submissions', token, { p_assignment: a.id });
    await sleep(THINK * 2);
  }
}

const started = Date.now();
console.log(`Load: ${LEARNERS} learners and ${LECTURERS} lecturers for ${SECONDS} s against ${s.url}`);
// Users arrive over the first fifth of the run, not all at once.
const ramp = (SECONDS * 1000) / 5;
const users = [
  ...Array.from({ length: LEARNERS }, (_, i) => sleep((ramp * i) / LEARNERS).then(() => learner((i % 300) + 1))),
  ...Array.from({ length: LECTURERS }, (_, i) => sleep((ramp * i) / LECTURERS).then(() => lecturer((i % 20) + 1))),
];
const outcomes = await Promise.allSettled(users);
const failedUsers = outcomes.filter((o) => o.status === 'rejected');
const seconds = (Date.now() - started) / 1000;

const pct = (/** @type {number[]} */ xs, /** @type {number} */ p) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? Math.round(a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]) : 0;
};
const rows = Object.entries(stats).map(([name, st]) => ({
  request: name,
  count: st.ms.length,
  errors: st.errors,
  p50_ms: pct(st.ms, 50),
  p95_ms: pct(st.ms, 95),
  p99_ms: pct(st.ms, 99),
  error_codes: Object.entries(st.statuses).map(([k, v]) => `${k}x${v}`).join(' '),
}));
const total = rows.reduce((n, r) => n + r.count, 0);
const errors = rows.reduce((n, r) => n + r.errors, 0);
// eslint-disable-next-line no-console -- a measuring tool prints its results as a table
console.table(rows);
console.log(`${total} requests in ${seconds.toFixed(0)} s (${(total / seconds).toFixed(1)}/s); errors ${errors} (${((100 * errors) / Math.max(1, total)).toFixed(2)}%); users that failed to start ${failedUsers.length}`);
if (process.argv.includes('--json')) {
  writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify({ learners: LEARNERS, lecturers: LECTURERS, seconds, total, errors, rows }, null, 2));
}
