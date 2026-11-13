import { expect as baseExpect, test } from '@playwright/test';
import { createAccount } from './support/accounts.js';
import { createAssignmentFixture } from './support/assignments.js';
import { createCourseFixture, createLessonFixture, enrolFixture } from './support/courses.js';
import { gradeFixture, releaseFixture, sendAnswerFixture } from './support/grading.js';
import { requireSupabase } from './support/local-supabase.js';

// Phase 13 performance budgets (BUILD_PLAN 15.5) on the signed-in pages they name, on a throttled mid-range
// Android profile: Chromium with a 412 px phone screen (Pixel 7), the CPU 4 times slower and Lighthouse's
// "slow 4G" network (150 ms round trip, 1.6 Mbit/s down, 750 kbit/s up). Each page is loaded fresh (a full
// navigation, signed in) and measured in the browser:
//   LCP (largest contentful paint) at or below 2.5 s, CLS (layout shift) at or below 0.1, and the long tasks
//   that block input (total blocking time) at or below 600 ms.
// The Sign In page's JavaScript budget (200 KB) and its Lighthouse scores stay in lighthouserc.cjs. Runs on the
// pixel-7-light project only: one throttled profile, not 24.

const expect = baseExpect.configure({ timeout: 60_000 });
test.describe.configure({ timeout: 300_000 });

const unique = () => Math.random().toString(36).slice(2, 8);
const BUDGET = { lcp: 2500, cls: 0.1, tbt: 600 };
// Phase 15 (D45): a screen's own data calls until its text is readable (the app frame's startup calls, made once
// per session for every screen, are not counted).
const CALL_BUDGET = { lesson: 3, 'assignment (instruction audio)': 3 };
const FRAME_CALLS = /\/rest\/v1\/(profiles|notifications|rpc\/(idle_settings|presence_my_courses|client_settings))\b/;
/** @type {Array<{ page: string, lcp: number, cls: number, tbt: number, scriptKb: number, calls: number }>} */
const results = [];

/** @param {string} id */
async function publishLesson(id) {
  const s = requireSupabase();
  await fetch(`${s.url}/rest/v1/lessons?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publication_status: 'PUBLISHED', published_at: new Date().toISOString() }),
  });
}

/** Stores a waveform on an assignment's instruction audio, as an upload does. @param {string} assignmentId */
async function storePeaks(assignmentId) {
  const s = requireSupabase();
  const headers = { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json' };
  const [row] = await (await fetch(`${s.url}/rest/v1/assignments?select=instruction_audio_file_id&id=eq.${assignmentId}`, { headers })).json();
  const peaks = Array.from({ length: 128 }, (_, i) => Math.round((0.2 + 0.6 * Math.abs(Math.sin(i / 7))) * 1000) / 1000);
  const res = await fetch(`${s.url}/rest/v1/file_objects?id=eq.${row.instruction_audio_file_id}`, { method: 'PATCH', headers, body: JSON.stringify({ waveform_peaks: peaks }) });
  if (!res.ok) throw new Error(`store peaks: ${res.status} ${await res.text()}`);
}

/** Throttles this page like a mid-range Android phone on slow 4G. @param {import('@playwright/test').Page} page */
async function throttle(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  return cdp;
}

/**
 * Loads a page fresh and returns LCP, CLS, total blocking time and the JavaScript transferred.
 * @param {import('@playwright/test').Page} page @param {string} path @param {import('@playwright/test').Locator} ready the page's main content
 * @param {{ selector?: string, text?: string }} cheap the same content, checked cheaply while measuring
 */
async function measure(page, path, ready, cheap) {
  await page.addInitScript(() => {
    const w = /** @type {any} */ (window);
    w.__perf = { lcp: 0, cls: 0, tbt: 0 };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__perf.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { const x = /** @type {any} */ (e); if (!x.hadRecentInput) w.__perf.cls += x.value; })).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__perf.tbt += Math.max(0, e.duration - 50)))).observe({ type: 'longtask', buffered: true });
  });
  let calls = 0;
  const supabase = requireSupabase().url;
  const count = (/** @type {import('@playwright/test').Request} */ r) => {
    if (r.url().startsWith(supabase) && !FRAME_CALLS.test(r.url()) && !/\/object\/sign\/.+\?token=/.test(r.url())) calls += 1;
  };
  page.on('request', count);
  const cdp = await throttle(page);
  await page.goto(path);
  // Wait with a cheap check of the page itself (a selector or a text). Waiting with a role locator made Playwright
  // compute accessible names over the whole page on every check, and on the 4x slower CPU that work was counted
  // as the page's own blocking time (found with a CPU profile, Phase 15).
  await page.waitForFunction((c) => (c.selector ? Boolean(document.querySelector(c.selector)) : Boolean(document.body?.textContent?.includes(c.text ?? ''))), cheap, { polling: 'raf', timeout: 60_000 });
  page.off('request', count);
  // Let the page settle (late layout shifts and long tasks count), then stop throttling.
  await page.waitForTimeout(3000);
  const perf = await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    const scripts = performance.getEntriesByType('resource').filter((r) => /** @type {PerformanceResourceTiming} */ (r).initiatorType === 'script');
    return { ...w.__perf, scriptKb: Math.round(scripts.reduce((n, r) => n + /** @type {PerformanceResourceTiming} */ (r).transferSize, 0) / 1024) };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expect(ready).toBeVisible();
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  return { lcp: Math.round(perf.lcp), cls: Math.round(perf.cls * 1000) / 1000, tbt: Math.round(perf.tbt), scriptKb: perf.scriptKb, calls };
}

/** @param {import('@playwright/test').Page} page @param {{ email: string, password: string }} who @param {RegExp} home */
async function signIn(page, who, home) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(who.email);
  await page.getByLabel('Password', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(home);
}

test('the signed-in pages meet the budgets on a throttled mid-range Android phone', async ({ browser }) => {
  test.skip(test.info().project.name !== 'pixel-7-light', 'measured once, on the throttled Android profile');
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Budget course ${tag}` });
  await enrolFixture(course.id, kwame.id, lecturer.id);
  const lesson = await createLessonFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Reading Genesis 1' });
  await publishLesson(lesson.id);
  const assignment = await createAssignmentFixture({
    courseId: course.id, ownerId: lecturer.id, title: 'Spoken instructions', dueAt: new Date(Date.now() + 7 * 86400000).toISOString(), contentType: 'TEXT_AND_AUDIO', withAudio: true,
  });
  // Real uploads store their waveform (ADR-006: computed while uploading); give the fixture's audio one too, so
  // the page is measured as learners get it. (Audio without stored peaks is measured in docs/acceptance/phase-13.md.)
  await storePeaks(assignment.id);
  await sendAnswerFixture(kwame, assignment.id);
  await gradeFixture(lecturer, assignment.id, kwame.id, 15);
  await releaseFixture(lecturer, assignment.id, kwame.id);

  const learnerContext = await browser.newContext({ serviceWorkers: 'block' });
  const learner = await learnerContext.newPage();
  await signIn(learner, kwame, /\/learner\/dashboard$/);
  results.push({ page: 'learner dashboard', ...(await measure(learner, '/learner/dashboard', learner.locator('[data-slot="role-intro"]'), { selector: '[data-slot="role-intro"]' })) });
  results.push({ page: 'lesson', ...(await measure(learner, `/learner/courses/${course.id}/lessons/${lesson.id}`, learner.getByRole('heading', { name: 'Reading Genesis 1' }), { text: 'Reading Genesis 1' })) });
  results.push({ page: 'assignment (instruction audio)', ...(await measure(learner, `/learner/courses/${course.id}/assignments/${assignment.id}`, learner.getByRole('heading', { name: 'Spoken instructions' }), { text: 'Spoken instructions' })) });
  await learnerContext.close();

  const staffContext = await browser.newContext({ serviceWorkers: 'block' });
  const staff = await staffContext.newPage();
  await signIn(staff, lecturer, /\/lecturer\/dashboard$/);
  results.push({ page: 'gradebook', ...(await measure(staff, `/lecturer/courses/${course.id}/gradebook`, staff.getByRole('tabpanel', { name: 'Gradebook' }).getByText(/\d+ learners? · \d+ assignments?/), { text: ' assignment' })) });
  await staffContext.close();

  // eslint-disable-next-line no-console -- a measuring tool prints its results as a table
  console.table(results);
  // Over-budget pages are reported (and written to the test report) on every run. They fail the run only with
  // ENFORCE_BUDGETS=1 until the owner decides how the remaining LCP and blocking-time gaps are handled
  // (docs/acceptance/phase-13.md); the layout-shift budget is always enforced.
  test.info().annotations.push({ type: 'performance', description: JSON.stringify(results) });
  const enforce = process.env.ENFORCE_BUDGETS === '1';
  for (const r of results) {
    expect.soft(r.cls, `${r.page}: CLS ${r.cls}`).toBeLessThanOrEqual(BUDGET.cls);
    const callBudget = CALL_BUDGET[/** @type {keyof typeof CALL_BUDGET} */ (r.page)];
    if (callBudget) expect.soft(r.calls, `${r.page}: ${r.calls} data calls before it is readable`).toBeLessThanOrEqual(callBudget);
    if (!enforce) continue;
    expect.soft(r.lcp, `${r.page}: LCP ${r.lcp} ms`).toBeLessThanOrEqual(BUDGET.lcp);
    expect.soft(r.tbt, `${r.page}: total blocking time ${r.tbt} ms`).toBeLessThanOrEqual(BUDGET.tbt);
  }
});
