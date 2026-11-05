#!/usr/bin/env node
// Captures acceptance screenshots (TESTING.md 5 item 6): every new or changed screen at 375, 768
// and 1280 px in light and dark. Serves the preview build (with /dev routes) on its own port.
// Usage: node scripts/capture-screenshots.mjs <phase-number> <path>[,<path>...]
//   e.g. node scripts/capture-screenshots.mjs 01 /,/offline,/dev/design
// Output: docs/acceptance/phase-NN/screens/<name>-<width>-<theme>.png
/* global document -- used only inside page.evaluate(), which runs in the browser */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [phase, list] = process.argv.slice(2);
if (!phase || !list) {
  console.error('Usage: node scripts/capture-screenshots.mjs <phase-number> <path>[,<path>...]');
  process.exit(1);
}
const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = `docs/acceptance/phase-${phase}/screens`;
const WIDTHS = [375, 768, 1280];
const THEMES = /** @type {const} */ (['light', 'dark']);
mkdirSync(OUT, { recursive: true });

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const shell = process.platform === 'win32';
const build = spawnSync(npx, ['vite', 'build', '--outDir', 'dist-shots', '--emptyOutDir'], { stdio: 'inherit', shell, env: { ...process.env, VITE_DEV_ROUTES: 'true' } });
if (build.status !== 0) process.exit(build.status ?? 1);
const server = spawn(npx, ['vite', 'preview', '--outDir', 'dist-shots', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell });

/** @param {number} ms */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i += 1) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    await wait(500);
  }
}

/** @param {string} path */
const nameFor = (path) => (path === '/' ? 'home' : path.replace(/^\//, '').replace(/[/?=&]+/g, '-'));

const browser = await chromium.launch();
let count = 0;
try {
  for (const raw of list.split(',')) {
    // A path ending in "#more" also opens the phone More sheet (phones only).
    const [path, action] = raw.split('#');
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        if (action === 'more' && width >= 640) continue;
        const context = await browser.newContext({ viewport: { width, height: width < 640 ? 812 : 900 }, colorScheme: theme, deviceScaleFactor: 1 });
        const page = await context.newPage();
        await page.goto(BASE + path);
        await page.locator('#main').waitFor();
        await page.evaluate(() => document.fonts.ready);
        if (action === 'more') {
          await page.getByRole('button', { name: 'More' }).click();
          await page.getByRole('dialog', { name: 'More' }).waitFor();
        }
        await page.waitForTimeout(400);
        const file = `${OUT}/${nameFor(path)}${action ? `-${action}` : ''}-${width}-${theme}.png`;
        await page.screenshot({ path: file });
        count += 1;
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  // On Windows the server runs under a shell, so stop the whole process tree.
  if (process.platform === 'win32' && server.pid) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill();
}
console.log(`Saved ${count} screenshots to ${OUT}`);
