#!/usr/bin/env node
// npm run verify: every check from CLAUDE.md section 5, in order, with a pass/fail summary.
// Runs every step even after a failure so the summary is complete; exits 1 if any step failed.
// The database suite needs Docker (local Supabase). Nothing is skipped silently.

import { spawnSync } from 'node:child_process';

/** @type {Array<[label: string, script: string]>} */
const STEPS = [
  ['Lint (ESLint)', 'lint'],
  ['Type check (tsc --checkJs)', 'typecheck'],
  ['Unit and component tests (Vitest)', 'test'],
  ['Secret scan', 'scan:secrets'],
  ['Dependency audit (high and above)', 'audit:deps'],
  ['Build (Vite)', 'build'],
  ['Bundle budgets (200 KB starting code, 100 KB per chunk)', 'check:bundle'],
  ['Database tests (pgTAP on local Supabase)', 'test:db'],
  ['Edge Function integration tests (local Supabase)', 'test:functions'],
  ['End-to-end (Playwright, all device projects, light and dark)', 'test:e2e'],
  ['Lighthouse CI (mobile preset)', 'lighthouse'],
];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
/** @type {Array<{ label: string, ok: boolean, seconds: string }>} */
const results = [];

for (const [label, script] of STEPS) {
  console.log(`\n=== ${label}: npm run ${script} ===`);
  const started = Date.now();
  const run = spawnSync(npm, ['run', script], { stdio: 'inherit', shell: process.platform === 'win32' });
  results.push({ label, ok: run.status === 0, seconds: ((Date.now() - started) / 1000).toFixed(1) });
}

console.log('\n=== verify summary ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}  (${r.seconds}s)`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\nverify FAILED: ${failed} of ${results.length} steps failed.` : `\nverify PASSED: all ${results.length} steps green.`);
process.exit(failed ? 1 : 0);
