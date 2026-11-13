#!/usr/bin/env node
// Load test (Phase 13; the base for Phase 15's stress, spike and soak tests). Virtual users sign in with the
// seeded accounts (tests/load/seed.sql) and repeat what the screens ask for, with a short think time:
//   learners  - dashboard, lesson list, one lesson with its media, grades, one assignment with their answer;
//   lecturers - dashboard, the grading queue, a course gradebook, one assignment's answers.
// It reports, per request: count, errors, median, 95th and 99th percentile response time, and the overall
// requests per second. Plain Node 22+ (fetch), no extra tools.
// Usage: node tests/load/load.mjs [--learners 150] [--lecturers 10] [--seconds 120] [--think 1000] [--signins-per-minute 25] [--json out.json]
// Staging (with the owner's go-ahead): SUPABASE_URL and SUPABASE_ANON_KEY point it at the project; seed it with
// tests/load/seed-staging.sql first and remove the data with tests/load/cleanup.sql afterwards.
// Defaults hit the local stack (127.0.0.1:54321). Local, a throwaway copy, or staging with the owner's go-ahead: never production.
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
// Sign-ins spread out to stay under Supabase Auth's limit (staging and production: 150 per 5 minutes from one
// address); 0 = all at the start (local).
const SIGNINS_PER_MINUTE = arg('signins-per-minute', 0);
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

/** Response bytes downloaded (counts against the plan's monthly downloads on a hosted project). */
let bytes = 0;

/** One timed request. @param {string} name @param {string} path @param {string} token @param {RequestInit} [init] */
async function hit(name, path, token, init = {}) {
  const t0 = performance.now();
  let status;
  let body = null;
  try {
    const res = await fetch(`${s.url}${path}`, { ...init, headers: { apikey: s.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
    status = res.status;
    const text = await res.text();
    bytes += text.length;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
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

/** A learner going through the screens, with the one-call screen reads of Phase 15 (migration 55). @param {number} n */
async function learner(n) {
  const session = await signIn(`load-learner-${n}@ddtc.test`);
  const token = session.access_token;
  const [enrolment] = (await hit('my enrolments', `/rest/v1/course_enrollments?select=course_id&learner_id=eq.${session.user.id}&limit=1`, token)) ?? [];
  const course = enrolment?.course_id;
  while (Date.now() < end) {
    await rpc('learner_dashboard', token);
    await sleep(THINK);
    const page = await rpc('get_course_page', token, { p_course: course });
    const lessons = /** @type {any[]} */ (page?.lessons ?? []);
    await sleep(THINK);
    const lesson = lessons[Math.floor(Math.random() * Math.max(1, lessons.length))];
    if (lesson) await rpc('get_lesson_page', token, { p_course: course, p_lesson: lesson.id });
    await sleep(THINK);
    await rpc('my_grades', token);
    await sleep(THINK);
    const assignments = /** @type {any[]} */ ((await rpc('list_my_assignments', token, { p_course: course })) ?? []);
    const a = assignments[Math.floor(Math.random() * Math.max(1, assignments.length))];
    if (a) await rpc('get_assignment_page', token, { p_course: course, p_assignment: a.id });
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
// Users arrive over the first fifth of the run, not all at once; with --signins-per-minute, one sign-in every
// 60/N seconds (lecturers first), so a hosted project's Auth rate limit is never reached.
const ramp = (SECONDS * 1000) / 5;
const paced = (/** @type {number} */ slot) => new Promise((r) => setTimeout(r, (slot * 60_000) / SIGNINS_PER_MINUTE));
const users = SIGNINS_PER_MINUTE > 0
  ? [
      ...Array.from({ length: LECTURERS }, (_, i) => paced(i).then(() => lecturer((i % 20) + 1))),
      ...Array.from({ length: LEARNERS }, (_, i) => paced(LECTURERS + i).then(() => learner((i % 300) + 1))),
    ]
  : [
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
console.log(`${total} requests in ${seconds.toFixed(0)} s (${(total / seconds).toFixed(1)}/s); errors ${errors} (${((100 * errors) / Math.max(1, total)).toFixed(2)}%); users that failed to start ${failedUsers.length}; downloaded ${(bytes / 1048576).toFixed(1)} MB`);
if (process.argv.includes('--json')) {
  writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify({ learners: LEARNERS, lecturers: LECTURERS, seconds, total, errors, downloadedMb: Math.round(bytes / 10485.76) / 100, rows }, null, 2));
}
