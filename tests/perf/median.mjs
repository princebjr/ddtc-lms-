#!/usr/bin/env node
// Medians of a baseline run (Phase 15, docs/PERFORMANCE.md): one row per profile and page, the median of the runs.
// Usage: node tests/perf/median.mjs <baseline.json> [out.json]
import { readFileSync, writeFileSync } from 'node:fs';

/** @typedef {Record<string, unknown> & { profile: string, page: string, error?: string }} Row */
const { rows } = /** @type {{ rows: Row[] }} */ (JSON.parse(readFileSync(process.argv[2], 'utf8')));
const KEYS = ['readable', 'repeat', 'audioReady', 'audioStart', 'lcp', 'fcp', 'ttfb', 'cls', 'tbt', 'api', 'apiKb', 'totalKb', 'jsKb'];

/** @param {unknown[]} values */
const median = (values) => {
  const v = /** @type {number[]} */ (values.filter((x) => typeof x === 'number')).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};

/** @type {Map<string, Row[]>} */
const groups = new Map();
for (const r of rows) {
  const key = `${r.profile}|${r.page}`;
  groups.set(key, [...(groups.get(key) ?? []), r]);
}
const out = [...groups.values()].map((rs) => {
  /** @type {Record<string, unknown>} */
  const o = { profile: rs[0].profile, page: rs[0].page, runs: rs.filter((r) => !r.error).length };
  for (const k of KEYS) o[k] = median(rs.map((r) => r[k]));
  return o;
});
// eslint-disable-next-line no-console -- a measuring tool prints its results as a table
console.table(out);
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
