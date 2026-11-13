#!/usr/bin/env node
// Request waterfall of one screen (Phase 15, docs/PERFORMANCE.md): signs in as the newest baseline learner, then
// loads a screen fresh on the budget Android over slow 4G and prints every request with its start and end (ms)
// and when the page's text became readable. Shows which waits are in a row (a chain) and which overlap.
// Usage: node tests/perf/waterfall.mjs [lesson|assignment|course] [--3g]
// Needs a baseline run first (tests/perf/baseline.mjs creates the course) and the preview on :4173.
/* global document, location -- the functions passed to page.evaluate run in the browser */
import { execFileSync } from 'node:child_process';
import { chromium, devices } from '@playwright/test';

const screen = process.argv[2] ?? 'lesson';
const slow3g = process.argv.includes('--3g');
/** @param {string} sql */
const psql = (sql) => execFileSync('docker', ['exec', 'supabase_db_ddtc-lms', 'psql', '-U', 'postgres', '-Atc', sql], { encoding: 'utf8' }).trim();
const [email, course, lesson, assignment] = psql(`
  select u.email || '|' || c.id || '|' || l.id || '|' || a.id from auth.users u
    join public.course_enrollments e on e.learner_id = u.id join public.courses c on c.id = e.course_id
    join public.lessons l on l.course_id = c.id and l.position = 5
    join public.assignments a on a.course_id = c.id and a.title like 'Spoken%'
   where u.email like 'perf-learner-%' order by u.created_at desc limit 1`).split('|');
if (!email) throw new Error('Run tests/perf/baseline.mjs first: it creates the course this tool opens.');
const paths = {
  lesson: { path: `/learner/courses/${course}/lessons/${lesson}`, text: 'Opening reading 5.' },
  assignment: { path: `/learner/courses/${course}/assignments/${assignment}`, text: 'Opening instructions.' },
  course: { path: `/learner/courses/${course}`, text: 'Reading Genesis 12' },
};
const target = paths[/** @type {keyof typeof paths} */ (screen)];

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block', baseURL: process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4173' });
const page = await context.newPage();
await page.goto('/login');
await page.getByLabel('Email address').fill(email);
await page.getByLabel('Password', { exact: true }).fill('Perf-Password-2026');
await page.getByRole('button', { name: 'Sign In', exact: true }).click();
await page.waitForURL(/dashboard/, { waitUntil: 'commit' });
await page.waitForTimeout(3000);
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp.send('Network.enable');
const net = slow3g ? { latency: 2000, down: 400e3, up: 400e3 } : { latency: 150, down: 1.6e6, up: 750e3 };
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: net.latency, downloadThroughput: net.down / 8, uploadThroughput: net.up / 8 });
await page.goto(target.path, { waitUntil: 'commit' });
const readable = await page
  .waitForFunction((t) => (document.body?.textContent?.includes(t) ? performance.now() : 0), target.text, { polling: 'raf', timeout: 120000 })
  .then((h) => h.jsonValue());
await page.waitForTimeout(3000);
const rows = await page.evaluate(() =>
  /** @type {PerformanceResourceTiming[]} */ (performance.getEntriesByType('resource')).map((r) => [
    Math.round(r.startTime), Math.round(r.responseEnd), Math.round(r.transferSize / 1024),
    r.name.replace(location.origin, '').replace(/^https?:\/\/[^/]+:54321/, 'API').slice(0, 80),
  ]),
);
const nav = await page.evaluate(() => {
  const n = /** @type {PerformanceNavigationTiming} */ (performance.getEntriesByType('navigation')[0]);
  return { htmlEnd: Math.round(n.responseEnd), domContentLoaded: Math.round(n.domContentLoadedEventEnd) };
});
console.log(`${screen} (${slow3g ? 'slow 3G' : 'slow 4G'}): html ${nav.htmlEnd} ms, DOMContentLoaded ${nav.domContentLoaded} ms, readable ${Math.round(Number(readable))} ms`);
for (const r of rows.sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(`${String(r[0]).padStart(6)} → ${String(r[1]).padStart(6)} ${String(r[2]).padStart(4)} KB  ${r[3]}`);
}
await browser.close();
