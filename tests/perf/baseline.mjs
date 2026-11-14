#!/usr/bin/env node
// Page-speed baseline (Phase 15, docs/PERFORMANCE.md). Loads each screen the brief names as the user who sees it,
// on several device and network profiles, and records per page:
//   ttfb, fcp, lcp (ms), cls, tbt (ms of input-blocking long tasks; Chromium only),
//   readable (ms until the page's own text is on screen), audioReady (ms until the Play button can be used),
//   audioStart (ms from a tap on Play until the audio is playing), api (data calls to Supabase, not audio bytes),
//   apiKb, totalKb, jsKb (transferred), and repeat (ms until readable when the same page is opened again inside
//   the app, the "repeat visit").
// Usage: node tests/perf/baseline.mjs [--profiles android-4g,android-3g,desktop,iphone-se,ipad] [--json out.json]
//        [--pages lesson,course,...] [--runs 1]
// Needs the local stack and a preview build on http://127.0.0.1:4173 (npm run build && npm run preview), or set
// PERF_BASE_URL. Creates its own course with the service role (local only); the browser only ever signs in.
/* global window, document, PopStateEvent -- the functions passed to page.evaluate run in the browser */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { chromium, devices, webkit } from '@playwright/test';
import { wav } from '../fixtures/media.js';
import { requireSupabase } from '../e2e/support/local-supabase.js';

const arg = (/** @type {string} */ name, /** @type {string} */ fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4173';
const PROFILE_NAMES = arg('profiles', 'android-4g,android-3g,desktop,iphone-se,ipad').split(',');
const PAGE_FILTER = arg('pages', '');
const RUNS = Number(arg('runs', '1'));
const s = requireSupabase();
const PASSWORD = 'Perf-Password-2026';

/** Device and network profiles. CPU and network throttling exist only in Chromium; WebKit runs unthrottled. */
const PROFILES = {
  'android-4g': { engine: chromium, device: devices['Pixel 7'], cpu: 4, net: { latency: 150, down: 1.6e6, up: 750e3 } },
  'android-3g': { engine: chromium, device: devices['Pixel 7'], cpu: 4, net: { latency: 2000, down: 400e3, up: 400e3 } },
  desktop: { engine: chromium, device: { viewport: { width: 1280, height: 800 } }, cpu: 1, net: null },
  'iphone-se': { engine: webkit, device: devices['iPhone SE'], cpu: 1, net: null },
  ipad: { engine: webkit, device: devices['iPad (gen 7)'], cpu: 1, net: null },
};

// ---------------------------------------------------------------- fixture (service role, local only)
const headers = { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
/** @param {string} path @param {RequestInit} [init] */
async function rest(path, init = {}) {
  const res = await fetch(`${s.url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
/** @param {string} role @param {string} first @param {string} second */
async function account(role, first, second) {
  const email = `perf-${role.toLowerCase()}-${randomUUID().slice(0, 8)}@ddtc.test`;
  const res = await fetch(`${s.url}/auth/v1/admin/users`, {
    method: 'POST', headers, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { first_name: first, second_name: second } }),
  });
  if (!res.ok) throw new Error(`account: ${res.status} ${await res.text()}`);
  const { id } = await res.json();
  if (role !== 'LEARNER') await rest(`profiles?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
  return { id, email };
}
/**
 * Stores a validated audio file (a 60 s WAV, about 1.9 MB) with a waveform, as the upload pipeline does.
 * @param {string} bucket @param {string} path @param {string} resourceType @param {string} resourceId @param {string} ownerId
 */
async function audioFile(bucket, path, resourceType, resourceId, ownerId) {
  const bytes = wav(60);
  const put = await fetch(`${s.url}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'audio/wav' }, body: new Blob([bytes]) });
  if (!put.ok) throw new Error(`audio upload: ${put.status} ${await put.text()}`);
  const id = path.split('/').pop()?.split('.')[0];
  const peaks = Array.from({ length: 128 }, (_, i) => Math.round((0.2 + 0.6 * Math.abs(Math.sin(i / 7))) * 1000) / 1000);
  await rest('file_objects', {
    method: 'POST',
    body: JSON.stringify({
      id, bucket_name: bucket, storage_path: path, original_filename: 'teaching.wav', safe_download_filename: 'teaching.wav', uploaded_by: ownerId, status: 'VALIDATED',
      resource_type: resourceType, resource_id: resourceId, detected_mime_type: 'audio/wav', file_size: bytes.length, duration_seconds: 60, waveform_peaks: peaks, validated_at: new Date().toISOString(),
    }),
  });
  return id;
}
const PARAGRAPH = 'In the beginning God created the heavens and the earth. The earth was without form and void, and darkness was over the face of the deep. And the Spirit of God was hovering over the face of the waters. ';
const lessonHtml = (/** @type {number} */ n) => `<h2>Lesson ${n}: Reading Genesis</h2>${Array.from({ length: 30 }, (_, i) => `<p>${i === 0 ? `Opening reading ${n}. ` : ''}${PARAGRAPH.repeat(2)}</p>`).join('')}`;

async function fixture() {
  const tag = randomUUID().slice(0, 6);
  const lecturer = await account('LECTURER', 'Ama', `Boateng${tag}`);
  const learner = await account('LEARNER', 'Kwame', `Mensah${tag}`);
  const [course] = await rest('courses', { method: 'POST', body: JSON.stringify({ title: `Perf course ${tag}`, course_code: `PF${tag.slice(0, 4).toUpperCase()}`, created_by: lecturer.id, status: 'PUBLISHED', published_at: new Date().toISOString() }) });
  await rest('course_lecturers', { method: 'POST', body: JSON.stringify({ course_id: course.id, lecturer_id: lecturer.id, permission_level: 'OWNER', assigned_by: lecturer.id }) });
  await rest('course_enrollments', { method: 'POST', body: JSON.stringify({ course_id: course.id, learner_id: learner.id, enrolled_by: lecturer.id, enrolment_status: 'ACTIVE' }) });
  const lessons = [];
  for (let n = 1; n <= 12; n += 1) {
    const [lesson] = await rest('lessons', { method: 'POST', body: JSON.stringify({ course_id: course.id, title: `Reading Genesis ${n}`, content: lessonHtml(n), position: n, publication_status: 'PUBLISHED', published_at: new Date().toISOString(), created_by: lecturer.id }) });
    const fileId = randomUUID();
    await audioFile('lesson-audio', `${course.id}/${lesson.id}/${fileId}.wav`, 'LESSON_AUDIO', lesson.id, lecturer.id);
    await rest('lesson_audio_files', { method: 'POST', body: JSON.stringify({ lesson_id: lesson.id, file_object_id: fileId, uploaded_by: lecturer.id, title: `Teaching ${n}`, position: 1 }) });
    lessons.push(lesson);
  }
  const [category] = await rest(`grade_categories?select=id&course_id=eq.${course.id}&archived_at=is.null&part=eq.ASSIGNMENTS&limit=1`);
  const [assignment] = await rest('assignments', {
    method: 'POST',
    body: JSON.stringify({ course_id: course.id, category_id: category.id, title: 'Spoken reflection on Genesis', content_type: 'TEXT_AND_AUDIO', text_instructions: `<p>Opening instructions. ${PARAGRAPH.repeat(3)}</p>`, due_at: new Date(Date.now() + 7 * 86400000).toISOString(), max_marks: 20, accepted_formats: ['TEXT', 'AUDIO'], created_by: lecturer.id }),
  });
  const brief = randomUUID();
  await audioFile('assignment-instructions-audio', `${course.id}/${assignment.id}/${brief}.wav`, 'ASSIGNMENT_INSTRUCTION_AUDIO', assignment.id, lecturer.id);
  await rest(`assignments?id=eq.${assignment.id}`, { method: 'PATCH', body: JSON.stringify({ instruction_audio_file_id: brief, publication_status: 'PUBLISHED', published_at: new Date().toISOString() }) });
  // A second, unanswered assignment: the learner's list opens on "To do".
  await rest('assignments', {
    method: 'POST',
    body: JSON.stringify({ course_id: course.id, category_id: category.id, title: 'Weekly reading reflection', content_type: 'TEXT', text_instructions: '<p>Reflect on this week.</p>', due_at: new Date(Date.now() + 5 * 86400000).toISOString(), max_marks: 20, accepted_formats: ['TEXT', 'AUDIO'], created_by: lecturer.id, publication_status: 'PUBLISHED', published_at: new Date().toISOString() }),
  });
  // The learner's sent answer (version 1), so the lecturer's grading page has something to show.
  const [sub] = await rest('submissions', { method: 'POST', body: JSON.stringify({ assignment_id: assignment.id, learner_id: learner.id, status: 'SUBMITTED', current_version: 1 }) });
  await rest('submission_versions', { method: 'POST', body: JSON.stringify({ submission_id: sub.id, version_number: 1, text_answer: `Answer text. ${PARAGRAPH}`, is_late: false, client_request_id: randomUUID() }) });
  return { lecturer, learner, course, lessons, assignment };
}

// ---------------------------------------------------------------- measuring
const PAGES = (/** @type {Awaited<ReturnType<typeof fixture>>} */ f) => [
  { name: 'learner dashboard', who: 'learner', path: '/learner/dashboard', text: [f.course.title] },
  { name: 'lesson list (course)', who: 'learner', path: `/learner/courses/${f.course.id}`, text: ['Reading Genesis 12'] },
  { name: 'lesson', who: 'learner', path: `/learner/courses/${f.course.id}/lessons/${f.lessons[4].id}`, text: ['Reading Genesis 5', 'Opening reading 5.'], audio: true },
  { name: 'assignment list', who: 'learner', path: '/learner/assignments', text: ['Weekly reading reflection'] },
  { name: 'assignment (instruction audio)', who: 'learner', path: `/learner/courses/${f.course.id}/assignments/${f.assignment.id}`, text: ['Spoken reflection on Genesis', 'Opening instructions.'], audio: true },
  { name: 'lecturer dashboard', who: 'lecturer', path: '/lecturer/dashboard', text: [f.course.title] },
  { name: 'grading (one answer)', who: 'lecturer', path: `/lecturer/courses/${f.course.id}/assignments/${f.assignment.id}/submissions/${f.learner.id}`, text: ['Answer text.'] },
  { name: 'gradebook', who: 'lecturer', path: `/lecturer/courses/${f.course.id}/gradebook`, text: ['1 learner'] },
].filter((p) => !PAGE_FILTER || PAGE_FILTER.split(',').some((x) => p.name.includes(x)));

const INIT = () => {
  const w = /** @type {any} */ (window);
  w.__perf = { lcp: 0, cls: 0, tbt: 0, playing: 0 };
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__perf.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { const x = /** @type {any} */ (e); if (!x.hadRecentInput) w.__perf.cls += x.value; })).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__perf.tbt += Math.max(0, e.duration - 50)))).observe({ type: 'longtask', buffered: true });
  } catch { /* WebKit lacks some entry types */ }
  document.addEventListener('playing', () => { if (!w.__perf.playing) w.__perf.playing = performance.now(); }, true);
};

/** @typedef {import('@playwright/test').Page} Page */
/**
 * Waits (checking every frame) until all texts are on the page; returns performance.now() at that moment.
 * @param {Page} page @param {string[]} texts @returns {Promise<number>}
 */
const untilText = (page, texts, timeout = 60000) =>
  page.waitForFunction((/** @type {string[]} */ t) => (t.every((x) => document.body?.textContent?.includes(x)) ? performance.now() : 0), texts, { polling: 'raf', timeout }).then((h) => /** @type {Promise<number>} */ (h.jsonValue()));
/** @param {Page} page @returns {Promise<number>} */
const untilPlayReady = (page, timeout = 60000) =>
  page.waitForFunction(() => { const b = /** @type {HTMLButtonElement | null} */ (document.querySelector('button[aria-label^="Play "]')); return b && !b.disabled ? performance.now() : 0; }, null, { polling: 'raf', timeout }).then((h) => /** @type {Promise<number>} */ (h.jsonValue()));

/** @param {import('@playwright/test').Page} page @param {any} profile */
async function throttle(page, profile) {
  if (profile.engine !== chromium) return null;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  if (profile.net) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.net.latency, downloadThroughput: profile.net.down / 8, uploadThroughput: profile.net.up / 8 });
  }
  return cdp;
}

/**
 * One fresh load of a page, then the in-app repeat visit.
 * @param {Page} page @param {any} profile @param {{ name: string, who: string, path: string, text: string[], audio?: boolean }} spec
 */
async function measurePage(page, profile, spec) {
  const api = { count: 0, bytes: 0 };
  const onDone = async (/** @type {import('@playwright/test').Request} */ req) => {
    if (!req.url().startsWith(s.url) || /\/storage\/v1\/object\/(sign|public)\/.+\.(wav|mp3|m4a|webm|ogg|pdf|docx|webp|jpe?g|png)/.test(req.url())) return;
    api.count += 1;
    try { const sizes = await req.sizes(); api.bytes += sizes.responseBodySize + sizes.responseHeadersSize; } catch { /* aborted */ }
  };
  page.on('requestfinished', onDone);
  const cdp = await throttle(page, profile);
  await page.goto(spec.path, { waitUntil: 'commit' });
  const readable = await untilText(page, spec.text);
  const audioReady = spec.audio ? await untilPlayReady(page) : null;
  let audioStart = null;
  if (spec.audio) {
    const t0 = await page.evaluate(() => { /** @type {HTMLButtonElement} */ (document.querySelector('button[aria-label^="Play "]')).click(); return performance.now(); });
    const t1 = await page.waitForFunction(() => /** @type {any} */ (window).__perf.playing || 0, null, { polling: 100, timeout: 60000 }).then((h) => /** @type {Promise<number>} */ (h.jsonValue())).catch(() => null);
    audioStart = t1 ? Math.round(t1 - t0) : null;
    await page.evaluate(() => document.querySelectorAll('audio').forEach((a) => a.pause()));
  }
  await page.waitForTimeout(2500); // late shifts and long tasks count
  const m = await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    const nav = /** @type {PerformanceNavigationTiming} */ (performance.getEntriesByType('navigation')[0]);
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    const res = /** @type {PerformanceResourceTiming[]} */ (performance.getEntriesByType('resource'));
    const kb = (/** @type {PerformanceResourceTiming[]} */ list) => Math.round(list.reduce((n, r) => n + (r.transferSize || 0), 0) / 1024);
    return { ttfb: nav ? Math.round(nav.responseStart) : null, fcp: fcp && Math.round(fcp), lcp: Math.round(w.__perf.lcp) || null, cls: Math.round(w.__perf.cls * 1000) / 1000, tbt: Math.round(w.__perf.tbt), totalKb: kb(res) + Math.round((nav?.transferSize ?? 0) / 1024), jsKb: kb(res.filter((r) => r.initiatorType === 'script')) };
  });
  page.off('requestfinished', onDone);
  // Repeat visit inside the app: go to the dashboard, then come back to the same address (as a learner does
  // with the back link or the menu), and time it until the same text is readable.
  // The profile page shows none of the measured texts; wait until they have left the screen before coming back,
  // or the old page's text would be counted as the new page's.
  const go = (/** @type {string} */ to) => page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); return performance.now(); }, to);
  await go(`/${spec.who}/profile`);
  await page.waitForFunction((/** @type {string[]} */ t) => !t.some((x) => document.body?.textContent?.includes(x)), spec.text, { polling: 'raf', timeout: 60000 });
  await page.waitForTimeout(1000);
  const r0 = await go(spec.path);
  const r1 = await untilText(page, spec.text);
  if (cdp) await cdp.detach().catch(() => {});
  return { ...m, readable: Math.round(readable), audioReady: audioReady && Math.round(audioReady), audioStart, api: api.count, apiKb: Math.round(api.bytes / 1024), repeat: Math.round(r1 - r0) };
}

/** @param {Page} page @param {string} email */
async function signIn(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(/\/(learner|lecturer)\/dashboard$/, { timeout: 60000 });
}

const f = await fixture();
const pages = PAGES(f);
/** @type {Array<Record<string, unknown>>} */
const rows = [];
for (const name of PROFILE_NAMES) {
  const profile = PROFILES[/** @type {keyof typeof PROFILES} */ (name)];
  if (!profile) throw new Error(`unknown profile ${name}`);
  const browser = await profile.engine.launch();
  for (const who of ['learner', 'lecturer']) {
    const mine = pages.filter((p) => p.who === who);
    if (!mine.length) continue;
    const context = await browser.newContext({ ...profile.device, baseURL: BASE, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.addInitScript(INIT);
    await signIn(page, who === 'learner' ? f.learner.email : f.lecturer.email);
    for (const spec of mine) {
      for (let run = 0; run < RUNS; run += 1) {
        try {
          rows.push({ profile: name, page: spec.name, ...(await measurePage(page, profile, spec)) });
        } catch (e) {
          rows.push({ profile: name, page: spec.name, error: String(e).slice(0, 120) });
        }
      }
    }
    await context.close();
  }
  await browser.close();
}
// eslint-disable-next-line no-console -- a measuring tool prints its results as a table
console.table(rows);
const out = arg('json', '');
if (out) writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), base: BASE, rows }, null, 2));
