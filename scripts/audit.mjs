#!/usr/bin/env node
// Dependency audit for verify and CI (high and critical fail). Runs `npm audit --json` and fails on every high or
// critical advisory except the few listed in EXCEPTIONS, each approved by the owner with a reason and an end date
// (docs/DECISIONS.md). An exception past its date fails the audit again, so none is forgotten.
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Owner-approved exceptions: advisory URL -> { until (YYYY-MM-DD, inclusive), why }. */
export const EXCEPTIONS = {
  'https://github.com/advisories/GHSA-fc5q-39xc-vjpf': {
    until: '2026-12-17',
    why: 'picomatch ReDoS (first failed CI 2026-11-17; no fixed version yet); build and test tools only, not in the app (ADR-031)',
  },
};

const FAILING = new Set(['high', 'critical']);

/**
 * The advisories that fail the audit.
 * @param {{ vulnerabilities?: Record<string, { via: (string | { url: string, severity: string, title: string, name: string })[] }> }} report npm audit --json
 * @param {Record<string, { until: string, why: string }>} exceptions
 * @param {string} today YYYY-MM-DD
 */
export function failingAdvisories(report, exceptions, today) {
  /** @type {Map<string, { url: string, severity: string, title: string, name: string, expired?: boolean }>} */
  const found = new Map();
  for (const v of Object.values(report.vulnerabilities ?? {})) {
    for (const via of v.via) if (typeof via === 'object' && FAILING.has(via.severity)) found.set(via.url, via);
  }
  return [...found.values()].flatMap((a) => {
    const exception = exceptions[a.url];
    if (!exception) return [a];
    return exception.until < today ? [{ ...a, expired: true }] : [];
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let raw;
  try {
    raw = execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    raw = /** @type {{ stdout?: string }} */ (error).stdout ?? '';
  }
  // A Windows shell can put a byte-order mark before the JSON.
  const report = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  const today = new Date().toISOString().slice(0, 10);
  const failing = failingAdvisories(report, EXCEPTIONS, today);
  for (const [url, e] of Object.entries(EXCEPTIONS)) if (e.until >= today) console.log(`Allowed until ${e.until}: ${url} (${e.why})`);
  for (const a of failing) console.log(`${a.expired ? 'EXCEPTION EXPIRED' : a.severity.toUpperCase()}: ${a.name}: ${a.title} ${a.url}`);
  console.log(failing.length ? `\nDependency audit FAILED: ${failing.length} high or critical advisories.` : '\nDependency audit passed (no high or critical advisories outside the approved exceptions).');
  process.exit(failing.length ? 1 : 0);
}
