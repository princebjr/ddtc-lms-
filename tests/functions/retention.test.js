// Phase 12 Edge Function tests (D20; ADR-022): retention-runner over HTTP with real stored files.
// With retention_days set to 0 (as on staging, BUILD_PLAN Phase 12) and seeded answers:
// - only the scheduled job may run it;
// - a dry run lists the released learner audio and changes nothing;
// - switched on before 30 days of dry runs, it still only dry-runs;
// - after 30 days of dry runs, a live run deletes only released learner audio, by exact path: the file row
//   stays DELETED, the stored object is gone; an unreleased answer's audio, a PDF answer and a held
//   learner's audio stay; the answer, its file link and its grade survive.
// The settings are put back to the launch values afterwards (retention off, 180 days).
// The full rule set (every excluded kind, failures and retries, roles) is in pgTAP 37.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireSupabase } from '../e2e/support/local-supabase.js';
import { createAssignmentFixture } from '../e2e/support/assignments.js';
import { createCourseFixture, enrolFixture } from '../e2e/support/courses.js';
import { pdf, webm } from '../fixtures/media.js';
import { call, serviceGet, signedInAdmin, signedInAs } from './support.js';

/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let lecturer;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let kwame;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let abena;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let yaw;
/** @type {Awaited<ReturnType<typeof signedInAdmin>>} */
let admin;
let courseId = '';
let assignmentId = '';
/** @type {Record<string, { id: string, bucket: string, path: string }>} */
const files = {};

/** Service-role REST write. @param {string} path @param {string} method @param {unknown} body */
async function serviceWrite(path, method, body) {
  const s = requireSupabase();
  const res = await fetch(`${s.url}/rest/v1/${path}`, {
    method,
    headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
}
/** @param {string} key @param {unknown} value */
const setSetting = (key, value) => serviceWrite(`system_settings?key=eq.${key}`, 'PATCH', { value });

/** Uploads a file through the D18 pipeline as a learner's answer file. @param {{ token: string }} user @param {string} name @param {Uint8Array} bytes */
async function upload(user, name, bytes) {
  const s = requireSupabase();
  const reg = await call('register-upload', user.token, { resourceType: 'SUBMISSION_FILE', assignmentId, filename: name, size: bytes.length });
  expect(reg.status, JSON.stringify(reg.body)).toBe(200);
  const put = await fetch(`${s.url}/storage/v1/object/upload/sign/${reg.body.bucket}/${reg.body.path}?token=${reg.body.token}`, {
    method: 'PUT',
    headers: { 'Content-Type': reg.body.contentType },
    body: new Blob([new Uint8Array(bytes)]),
  });
  expect(put.ok).toBe(true);
  const done = await call('finalize-upload', user.token, { fileId: reg.body.fileId });
  expect(done.status, JSON.stringify(done.body)).toBe(200);
  return { id: reg.body.fileId, bucket: reg.body.bucket, path: reg.body.path };
}
/** @param {{ token: string }} user @param {string[]} fileIds */
const send = (user, fileIds) => call('submit-assignment', user.token, { action: 'submit', assignmentId, text: 'My answer.', fileIds, requestId: randomUUID() });
/** @param {string} id */
const fileRow = async (id) => (await serviceGet(`file_objects?select=status,deleted_at&id=eq.${id}`))[0];
/** Whether the stored object still exists. @param {{ bucket: string, path: string }} f */
async function stored(f) {
  const s = requireSupabase();
  const res = await fetch(`${s.url}/storage/v1/object/authenticated/${f.bucket}/${f.path}`, { headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, Range: 'bytes=0-0' } });
  await res.body?.cancel();
  return res.ok;
}
const runJob = () => call('retention-runner', requireSupabase().serviceKey, {});

beforeAll(async () => {
  lecturer = await signedInAs({ role: 'LECTURER', first: 'Ama', second: 'Boateng' });
  kwame = await signedInAs({ first: 'Kwame', second: 'Mensah' });
  abena = await signedInAs({ first: 'Abena', second: 'Frimpong' });
  yaw = await signedInAs({ first: 'Yaw', second: 'Darko' });
  admin = await signedInAdmin();
  ({ id: courseId } = await createCourseFixture({ ownerId: lecturer.userId, title: 'Introduction to Biblical Studies' }));
  for (const l of [kwame, abena, yaw]) await enrolFixture(courseId, l.userId, lecturer.userId);
  ({ id: assignmentId } = await createAssignmentFixture({ courseId, ownerId: lecturer.userId, title: 'Spoken reflection', dueAt: new Date(Date.now() + 7 * 86400000).toISOString(), formats: ['TEXT', 'AUDIO', 'PDF'] }));
  // Kwame: a recording and a PDF, released. Abena: a recording, graded but not released. Yaw: a recording, released, then held.
  files.kwameAudio = await upload(kwame, 'kwame.webm', webm({ seconds: 5 }));
  files.kwamePdf = await upload(kwame, 'kwame.pdf', pdf());
  files.abenaAudio = await upload(abena, 'abena.webm', webm({ seconds: 5 }));
  files.yawAudio = await upload(yaw, 'yaw.webm', webm({ seconds: 5 }));
  expect((await send(kwame, [files.kwameAudio.id, files.kwamePdf.id])).status).toBe(200);
  expect((await send(abena, [files.abenaAudio.id])).status).toBe(200);
  expect((await send(yaw, [files.yawAudio.id])).status).toBe(200);
  for (const [l, score] of /** @type {const} */ ([[kwame, 15], [abena, 12], [yaw, 14]])) {
    const saved = await call('grade-submission', lecturer.token, { action: 'save', assignmentId, learnerId: l.userId, score });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  }
  for (const l of [kwame, yaw]) expect((await call('release-grades', lecturer.token, { assignmentId, learnerId: l.userId })).status).toBe(200);
  await setSetting('retention_days', 0);
});

afterAll(async () => {
  // The launch values (D20): off, 180 days.
  await setSetting('retention_enabled', false);
  await setSetting('retention_days', 180);
});

describe('retention-runner', () => {
  it('only the scheduled job may run it', async () => {
    expect((await call('retention-runner', kwame.token, {})).status).toBe(403);
    expect((await call('retention-runner', admin.token, {})).status).toBe(403);
  });

  it('a dry run lists released learner audio and changes nothing', async () => {
    await setSetting('retention_enabled', false);
    const res = await runJob();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.mode).toBe('DRY_RUN');
    expect(res.body.deleted).toBe(0);
    const [run] = await serviceGet(`retention_runs?select=details&id=eq.${res.body.runId}`);
    const listed = run.details.files.map((/** @type {{ file_id: string }} */ f) => f.file_id);
    expect(listed).toEqual(expect.arrayContaining([files.kwameAudio.id, files.yawAudio.id]));
    expect(listed).not.toContain(files.kwamePdf.id);
    expect(listed).not.toContain(files.abenaAudio.id);
    for (const f of Object.values(files)) {
      expect((await fileRow(f.id)).status).toBe('VALIDATED');
      expect(await stored(f)).toBe(true);
    }
  });

  it('switched on before 30 days of dry runs, it still only dry-runs', async () => {
    await setSetting('retention_enabled', true);
    const res = await runJob();
    expect(res.body.mode).toBe('DRY_RUN');
    expect(await stored(files.kwameAudio)).toBe(true);
  });

  it('after 30 days of dry runs, deletes only released, unheld learner audio, keeping every record', async () => {
    // A learner hold on Yaw, placed by an administrator.
    const s = requireSupabase();
    const hold = await fetch(`${s.url}/rest/v1/rpc/retention_hold_place`, {
      method: 'POST',
      headers: { apikey: s.anonKey, Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_scope: 'LEARNER', p_scope_id: yaw.userId, p_reason: 'Keep for review' }),
    });
    expect(hold.ok, await hold.clone().text()).toBe(true);
    // Every dry run so far moved 31 days back, as if the 30-day dry run had passed.
    await serviceWrite(`retention_runs?mode=eq.DRY_RUN`, 'PATCH', { started_at: new Date(Date.now() - 31 * 86400000).toISOString() });
    const res = await runJob();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.mode).toBe('LIVE');
    expect(res.body.failed).toBe(0);

    const gone = await fileRow(files.kwameAudio.id);
    expect(gone.status).toBe('DELETED');
    expect(gone.deleted_at).not.toBeNull();
    expect(await stored(files.kwameAudio)).toBe(false);
    for (const f of [files.kwamePdf, files.abenaAudio, files.yawAudio]) {
      expect((await fileRow(f.id)).status).toBe('VALIDATED');
      expect(await stored(f)).toBe(true);
    }
    // The answer, its file link and its grade survive.
    const [sub] = await serviceGet(`submissions?select=id,released_score&assignment_id=eq.${assignmentId}&learner_id=eq.${kwame.userId}`);
    expect(Number(sub.released_score)).toBe(15);
    expect((await serviceGet(`submission_files?select=id&file_object_id=eq.${files.kwameAudio.id}`)).length).toBe(1);
    const audit = await serviceGet(`audit_logs?select=action&entity_id=eq.${res.body.runId}`);
    expect(audit.map((/** @type {{ action: string }} */ a) => a.action)).toContain('retention.run');
  });
});
