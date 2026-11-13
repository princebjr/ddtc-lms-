#!/usr/bin/env node
// Bundle budgets (Phase 15, D45; BUILD_PLAN 15.5): run after `npm run build`. Fails when
//   - the starting code (the entry script and every script index.html preloads) is over 200 KB gzipped, or
//   - any other script chunk is over 100 KB gzipped, except the chunks named in EXCEPTIONS with their reason.
// Prints every chunk over 20 KB so growth is visible in CI logs.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = process.argv[2] ?? 'dist';
const INITIAL_BUDGET_KB = 200;
const CHUNK_BUDGET_KB = 100;
/** Chunks allowed over the chunk budget, and why. */
const EXCEPTIONS = {
  RichTextEditor: 'the lesson editor: lecturers only, loaded when they open the editor (the brief asks for exactly this)',
};

const kb = (/** @type {string} */ file) => gzipSync(readFileSync(join(DIST, 'assets', file))).length / 1024;
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const initial = [...new Set([...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]))];
const initialKb = initial.reduce((n, f) => n + kb(f), 0);

let failed = false;
console.log(`Starting code: ${initial.length} file(s), ${initialKb.toFixed(1)} KB gzipped (budget ${INITIAL_BUDGET_KB} KB)`);
if (initialKb > INITIAL_BUDGET_KB) failed = true;

for (const file of readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'))) {
  if (initial.includes(file)) continue;
  const size = kb(file);
  const exception = Object.entries(EXCEPTIONS).find(([name]) => file.startsWith(`${name}-`));
  const over = size > CHUNK_BUDGET_KB;
  if (size > 20 || over) console.log(`  ${file}: ${size.toFixed(1)} KB${over ? (exception ? ` (allowed: ${exception[1]})` : ' OVER BUDGET') : ''}`);
  if (over && !exception) failed = true;
}
console.log(failed ? '\nBundle budgets FAILED.' : '\nBundle budgets passed.');
process.exit(failed ? 1 : 0);
