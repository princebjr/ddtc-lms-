#!/usr/bin/env node
// Before and after (Phase 15, docs/PERFORMANCE.md): medians of two baseline runs side by side.
// Usage: node tests/perf/compare.mjs <before.json> <after.json> [--markdown]
import { readFileSync } from 'node:fs';

/** @typedef {Record<string, any> & { profile: string, page: string }} Row */
/** @param {string} file @returns {Map<string, Row>} */
function medians(file) {
  const { rows } = /** @type {{ rows: Row[] }} */ (JSON.parse(readFileSync(file, 'utf8')));
  /** @type {Map<string, Row[]>} */
  const groups = new Map();
  for (const r of rows) groups.set(`${r.profile}|${r.page}`, [...(groups.get(`${r.profile}|${r.page}`) ?? []), r]);
  /** @param {unknown[]} xs */
  const med = (xs) => {
    const v = /** @type {number[]} */ (xs.filter((x) => typeof x === 'number')).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };
  const out = new Map();
  for (const [k, rs] of groups) {
    /** @type {Row} */
    const o = { profile: rs[0].profile, page: rs[0].page };
    for (const key of ['readable', 'repeat', 'audioReady', 'audioStart', 'lcp', 'cls', 'tbt', 'api']) o[key] = med(rs.map((r) => r[key]));
    out.set(k, o);
  }
  return out;
}
const before = medians(process.argv[2]);
const after = medians(process.argv[3]);
/** @param {number | null} v */
const t = (v) => (v === null || v === undefined ? '–' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`);
/** @param {number | null} b @param {number | null} a */
const pct = (b, a) => (b && a !== null && a !== undefined ? `${a <= b ? '−' : '+'}${Math.abs(Math.round((100 * (a - b)) / b))}%` : '');
const md = process.argv.includes('--markdown');
let profile = '';
for (const [k, b] of before) {
  const a = after.get(k);
  if (!a) continue;
  if (md && b.profile !== profile) {
    profile = b.profile;
    process.stdout.write(`\n**${profile}**\n\n| Page | Readable | Repeat visit | Audio ready | Audio starts | Data calls |\n|---|---|---|---|---|---|\n`);
  }
  const cells = ['readable', 'repeat', 'audioReady', 'audioStart'].map((x) => (b[x] === null || b[x] === undefined ? '–' : `${t(b[x])} → ${t(a[x])} (${pct(b[x], a[x])})`));
  const line = md ? `| ${b.page} | ${cells.join(' | ')} | ${b.api} → ${a.api} |\n` : `${b.profile.padEnd(10)} ${b.page.padEnd(31)} ${cells.join('  ')}  api ${b.api}→${a.api}\n`;
  process.stdout.write(line);
}
