// Phase 13 attack suite over HTTP (BUILD_PLAN Phase 13): every Edge Function refuses a caller without a
// session; administrator functions refuse learners, lecturers and administrators without two-step
// verification; scheduled jobs refuse everyone but the service role; a signed file link stops working
// when it expires; and a learner's session cannot read another learner's stored file even with its path.
// The database side (RLS, grants, tampering) is pgTAP 38.
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAccount } from '../e2e/support/accounts.js';
import { requireSupabase } from '../e2e/support/local-supabase.js';
import { webm } from '../fixtures/media.js';
import { call, signIn, signedInAdmin, signedInAs } from './support.js';

const ALL = [
  'bulk-import-learners', 'cleanup-files', 'course-lecturers', 'course-lifecycle', 'create-course', 'delete-media', 'exam-attempt', 'export-gradebook',
  'finalize-upload', 'grade-examination', 'grade-submission', 'manage-assignments', 'manage-enrolments', 'manage-examinations', 'manage-lessons',
  'provision-admin', 'provision-lecturer', 'register-upload', 'release-grades', 'reset-admin-mfa', 'retention-runner', 'send-notification-email',
  'set-user-role', 'submit-assignment',
];
const ADMIN_ONLY = ['bulk-import-learners', 'manage-enrolments', 'provision-admin', 'provision-lecturer', 'reset-admin-mfa', 'set-user-role'];
const SCHEDULED = ['cleanup-files', 'retention-runner', 'send-notification-email'];

/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let learner;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let lecturer;
/** @type {{ token: string }} */
let adminNoMfa;
/** @type {Awaited<ReturnType<typeof signedInAdmin>>} */
let admin;
const objectPath = `attack-test/${Date.now()}.webm`;

/** Service-role Storage request. @param {string} path @param {RequestInit} [init] */
async function storage(path, init = {}) {
  const s = requireSupabase();
  return fetch(`${s.url}/storage/v1/${path}`, { ...init, headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, ...init.headers } });
}

beforeAll(async () => {
  learner = await signedInAs({ first: 'Kwame', second: 'Mensah' });
  lecturer = await signedInAs({ role: 'LECTURER', first: 'Ama', second: 'Boateng' });
  const plainAdmin = await createAccount({ role: 'ADMIN', first: 'Test', second: 'NoMfa' });
  adminNoMfa = await signIn(plainAdmin.email, plainAdmin.password);
  admin = await signedInAdmin();
  const put = await storage(`object/learner-submissions/${objectPath}`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: new Blob([new Uint8Array(webm({ seconds: 2 }))]) });
  expect(put.ok, await put.clone().text()).toBe(true);
});

afterAll(async () => {
  await storage(`object/learner-submissions`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [objectPath] }) });
});

describe('every Edge Function refuses a caller without a session', () => {
  it.each(ALL)('%s', async (name) => {
    const s = requireSupabase();
    const none = await fetch(`${s.url}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(none.status, 'no Authorization header').toBe(401);
    await none.body?.cancel();
    const anon = await call(name, s.anonKey, {});
    expect([401, 403], `anon key as the bearer (${anon.status})`).toContain(anon.status);
  });
});

describe('administrator functions refuse everyone else', () => {
  it.each(ADMIN_ONLY)('%s', async (name) => {
    expect((await call(name, learner.token, {})).status, 'learner').toBe(403);
    expect((await call(name, lecturer.token, {})).status, 'lecturer').toBe(403);
    expect((await call(name, adminNoMfa.token, {})).status, 'administrator without two-step verification').toBe(403);
    expect((await call(name, admin.token, {})).status, 'an AAL2 administrator gets past the gate (then a 400 for the empty body)').not.toBe(403);
  });
});

/** An HS256 token for the local project. @param {object} claims @param {string} secret */
function mint(claims, secret) {
  const part = (/** @type {object} */ o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss: 'supabase-demo', iat: Math.floor(Date.now() / 1000) - 5, exp: Math.floor(Date.now() / 1000) + 600, ...claims })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

describe('scheduled jobs refuse everyone but the service role', () => {
  it.each(SCHEDULED)('%s', async (name) => {
    const s = requireSupabase();
    expect((await call(name, learner.token, {})).status).toBe(403);
    expect((await call(name, admin.token, {})).status).toBe(403);
    expect((await call(name, s.anonKey, {})).status, 'the public key').toBe(403);
    // A token that claims the service role but is not signed by the project: refused (gateway 401 or function 403).
    expect([401, 403], 'a forged service-role token').toContain((await call(name, mint({ role: 'service_role' }, 'not-the-project-secret-but-long-enough-0000'), {})).status);
  });

  // Phase 14 (production, 2026-11-14): projects created now give Edge Functions a different service key from the
  // legacy one the scheduler sends. A genuine service-role token of the project, not byte-equal to the function's
  // own key, must still run the job.
  it.each(SCHEDULED)('%s accepts a genuine service-role token that is not the same string as its own key', async (name) => {
    const s = requireSupabase();
    const token = mint({ role: 'service_role' }, s.jwtSecret);
    expect(token).not.toBe(s.serviceKey);
    const status = (await call(name, token, {})).status;
    expect(status).not.toBe(401);
    expect(status).not.toBe(403);
  });
});

describe('stored files', () => {
  it('a signed link works, then stops working when it expires', async () => {
    const s = requireSupabase();
    const sign = await storage(`object/sign/learner-submissions/${objectPath}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 2 }) });
    const { signedURL } = await sign.json();
    const url = `${s.url}/storage/v1${signedURL}`;
    const now = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    expect(now.ok).toBe(true);
    await now.body?.cancel();
    await new Promise((r) => setTimeout(r, 3500));
    const later = await fetch(url);
    expect(later.ok).toBe(false);
    expect([400, 401, 403]).toContain(later.status);
    await later.body?.cancel();
  });

  it('a learner cannot read or sign an object that is not theirs, even knowing its path', async () => {
    const s = requireSupabase();
    const read = await fetch(`${s.url}/storage/v1/object/authenticated/learner-submissions/${objectPath}`, { headers: { apikey: s.anonKey, Authorization: `Bearer ${learner.token}` } });
    expect(read.ok).toBe(false);
    await read.body?.cancel();
    const sign = await fetch(`${s.url}/storage/v1/object/sign/learner-submissions/${objectPath}`, {
      method: 'POST',
      headers: { apikey: s.anonKey, Authorization: `Bearer ${learner.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 60 }),
    });
    expect(sign.ok).toBe(false);
    await sign.body?.cancel();
    const list = await fetch(`${s.url}/storage/v1/object/list/learner-submissions`, {
      method: 'POST',
      headers: { apikey: s.anonKey, Authorization: `Bearer ${learner.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: 'attack-test/' }),
    });
    expect(await list.json()).toEqual([]);
  });
});

describe('per-user rate limits (migration 48)', () => {
  it('the 31st gradebook export in ten minutes is refused with 429, and another user is not affected', async () => {
    const statuses = [];
    for (let i = 0; i < 31; i += 1) statuses.push((await call('export-gradebook', lecturer.token, {})).status);
    expect(statuses.slice(0, 30).every((s) => s !== 429)).toBe(true);
    expect(statuses[30]).toBe(429);
    const other = await signedInAs({ role: 'LECTURER', first: 'Grace', second: 'Owusu' });
    expect((await call('export-gradebook', other.token, {})).status).not.toBe(429);
  });
});
