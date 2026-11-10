// Phase 7 Edge Function tests: manage-assignments (instructions cleaned on the server, rights,
// categories, publish rules with clear messages, archive) and instruction audio through
// register-upload and finalize-upload (D18): real type and duration from the bytes, 25 MB and 10
// minutes (D17), renamed and over-length files rejected, the audio attached to the assignment.
// Real HTTP calls as real users.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { requireSupabase } from '../e2e/support/local-supabase.js';
import { mp3, pdf, wav } from '../fixtures/media.js';
import { call, serviceGet, signedInAdmin, signedInAs } from './support.js';

/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let owner;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let other;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let learner;
let courseId = '';
let categoryId = '';

beforeAll(async () => {
  owner = await signedInAs({ role: 'LECTURER', first: 'Ama', second: 'Boateng' });
  other = await signedInAs({ role: 'LECTURER', first: 'Grace', second: 'Owusu' });
  learner = await signedInAs();
  const course = await call('create-course', owner.token, { title: 'Introduction to Biblical Studies', courseCode: `A${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}` });
  courseId = course.body.courseId;
  [{ id: categoryId }] = await serviceGet(`grade_categories?select=id&course_id=eq.${courseId}&part=eq.ASSIGNMENTS&archived_at=is.null`);
});

/** @param {Record<string, unknown>} [over] */
const fields = (over = {}) => ({
  title: 'Reflection on Genesis 1',
  description: 'Read and respond.',
  lessonId: null,
  categoryId,
  contentType: 'TEXT',
  textInstructions: '<p>Read Genesis 1 and reflect.</p>',
  dueAt: '2030-01-20T23:59:00Z',
  allowLate: false,
  maxMarks: 20,
  acceptedFormats: ['TEXT', 'AUDIO'],
  gradingCriteria: 'Clarity and use of Scripture.',
  ...over,
});

/**
 * register-upload, the browser's upload to the signed path, then finalize-upload.
 * @param {string} token @param {string} assignmentId @param {Uint8Array} bytes @param {string} filename
 */
async function uploadAudio(token, assignmentId, bytes, filename) {
  const reg = await call('register-upload', token, { resourceType: 'ASSIGNMENT_INSTRUCTION_AUDIO', courseId, assignmentId, filename, size: bytes.length });
  if (reg.status !== 200) return reg;
  const s = requireSupabase();
  const put = await fetch(`${s.url}/storage/v1/object/upload/sign/${reg.body.bucket}/${reg.body.path}?token=${reg.body.token}`, {
    method: 'PUT',
    headers: { 'Content-Type': reg.body.contentType },
    body: new Blob([new Uint8Array(bytes)]),
  });
  expect(put.ok, await put.clone().text()).toBe(true);
  return call('finalize-upload', token, { fileId: reg.body.fileId });
}

describe('manage-assignments', () => {
  it('cleans the instructions on the server and creates a draft that accepts text and audio answers (ADR-009)', async () => {
    const res = await call('manage-assignments', owner.token, {
      action: 'save',
      courseId,
      fields: fields({ textInstructions: '<p onclick="steal()">Read <strong>Genesis 1</strong></p><script>alert(1)</script>', acceptedFormats: ['PDF'] }),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [row] = await serviceGet(`assignments?select=text_instructions,publication_status,accepted_formats&id=eq.${res.body.assignmentId}`);
    expect(row.text_instructions).not.toMatch(/script|onclick/i);
    expect(row.text_instructions).toContain('<strong>Genesis 1</strong>');
    expect(row.publication_status).toBe('DRAFT');
    expect(row.accepted_formats).toEqual(['TEXT', 'AUDIO', 'PDF']);
  });

  it('refuses learners and lecturers of other courses', async () => {
    for (const caller of [learner, other]) {
      expect((await call('manage-assignments', caller.token, { action: 'save', courseId, fields: fields() })).status).toBe(403);
    }
  });

  it('explains why an assignment cannot be published yet', async () => {
    const saved = await call('manage-assignments', owner.token, { action: 'save', courseId, fields: fields({ title: 'Prayer journal', contentType: 'AUDIO', textInstructions: '' }) });
    const res = await call('manage-assignments', owner.token, { action: 'publish', assignmentId: saved.body.assignmentId, publish: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Add the instruction audio before publishing');
  });

  it('publishes, records a reason when a published assignment changes, archives and restores', async () => {
    const saved = await call('manage-assignments', owner.token, { action: 'save', courseId, fields: fields({ title: 'Covenant essay' }) });
    const id = saved.body.assignmentId;
    expect((await call('manage-assignments', owner.token, { action: 'publish', assignmentId: id, publish: true })).body.assignment.status).toBe('PUBLISHED');
    const moved = await call('manage-assignments', owner.token, { action: 'save', courseId, assignmentId: id, fields: fields({ title: 'Covenant essay', dueAt: '2030-01-27T23:59:00Z' }), reason: 'Retreat week' });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const versions = await serviceGet(`assignment_versions?select=version_number,change_reason&assignment_id=eq.${id}&order=version_number`);
    expect(versions).toEqual([{ version_number: 1, change_reason: null }, { version_number: 2, change_reason: 'Retreat week' }]);
    expect((await call('manage-assignments', owner.token, { action: 'archive', assignmentId: id, archived: true })).status).toBe(200);
    expect((await call('manage-assignments', owner.token, { action: 'save', courseId, assignmentId: id, fields: fields({ title: 'Covenant essay' }) })).status).toBe(400);
    expect((await call('manage-assignments', owner.token, { action: 'archive', assignmentId: id, archived: false })).status).toBe(200);
  });

  // Since Phase 10.1 (ADR-016) a course has three fixed parts whose weights only an administrator changes, with a reason.
  it('saves the weights of the three parts (administrators only, with a reason) and reports their total', async () => {
    const parts = await serviceGet(`grade_categories?select=id&course_id=eq.${courseId}&archived_at=is.null&order=position`);
    const categories = parts.map((/** @type {{ id: string }} */ p, /** @type {number} */ i) => ({ id: p.id, weight: [50, 30, 20][i] }));
    const byOwner = await call('manage-assignments', owner.token, { action: 'save-categories', courseId, categories, reason: 'Mine' });
    expect(byOwner.status).toBe(403);
    expect(byOwner.body.message).toBe('Only an administrator can change the grade weights');
    const admin = await signedInAdmin();
    const res = await call('manage-assignments', admin.token, { action: 'save-categories', courseId, categories, reason: 'Fewer examination marks' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ total: 100, ready: true });
    expect((await call('manage-assignments', other.token, { action: 'save-categories', courseId, categories, reason: 'Mine' })).status).toBe(403);
  });
});

describe('instruction audio (D18, D17)', () => {
  /** @type {string} */
  let assignmentId;
  beforeAll(async () => {
    const saved = await call('manage-assignments', owner.token, { action: 'save', courseId, fields: fields({ title: 'Listening task', contentType: 'TEXT_AND_AUDIO' }) });
    assignmentId = saved.body.assignmentId;
  });

  it('validates a WAV from its bytes and attaches it, so the assignment can be published', async () => {
    const res = await uploadAudio(owner.token, assignmentId, wav(3), 'brief.wav');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.replaced).toBe(false);
    const [row] = await serviceGet(`assignments?select=instruction_audio_file_id&id=eq.${assignmentId}`);
    expect(row.instruction_audio_file_id).toBe(res.body.fileId);
    expect((await call('manage-assignments', owner.token, { action: 'publish', assignmentId, publish: true })).status).toBe(200);
  });

  it('rejects a renamed non-audio file and audio longer than 10 minutes', async () => {
    const renamed = await uploadAudio(owner.token, assignmentId, pdf(), 'brief.mp3');
    expect(renamed.status).toBe(422);
    expect(renamed.body.message).toBe('The file is not an MP3, M4A or WAV audio file.');
    const long = await uploadAudio(owner.token, assignmentId, mp3({ frames: 10, xingFrames: 26000 }), 'long.mp3');
    expect(long.status).toBe(422);
    expect(long.body.message).toBe('The audio is longer than 10 minutes.');
  });

  it('refuses a learner and a lecturer of another course at register-upload', async () => {
    for (const caller of [learner, other]) {
      const res = await call('register-upload', caller.token, { resourceType: 'ASSIGNMENT_INSTRUCTION_AUDIO', courseId, assignmentId, filename: 'x.mp3', size: 1000 });
      expect(res.status).toBe(403);
    }
  });
});
