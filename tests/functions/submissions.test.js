// Phase 8 Edge Function tests: learners' answers through register-upload, finalize-upload and
// submit-assignment, extensions through manage-assignments, and the cleanup of files never sent.
// Tests required (phase file): a renamed .exe sent as .pdf is rejected; oversize and over-duration
// files are rejected; late and extension rules behave as D10 (the full rule set is in pgTAP 18);
// a learner cannot submit or remove another learner's files. Real HTTP calls as real users.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { requireSupabase } from '../e2e/support/local-supabase.js';
import { createAssignmentFixture } from '../e2e/support/assignments.js';
import { createCourseFixture, enrolFixture } from '../e2e/support/courses.js';
import { concat, ogg, pdf, webm, zip } from '../fixtures/media.js';
import { call, serviceGet, signedInAs } from './support.js';

/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let lecturer;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let otherLecturer;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let kwame;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let abena;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let stranger;
let courseId = '';
let open = ''; // due in a week, text and audio answers
let documents = ''; // due in a week, PDF and Word allowed as well
let pastDue = ''; // due yesterday, no late answers

const DOCX = zip(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
const in7days = () => new Date(Date.now() + 7 * 86400000).toISOString();

beforeAll(async () => {
  lecturer = await signedInAs({ role: 'LECTURER', first: 'Ama', second: 'Boateng' });
  otherLecturer = await signedInAs({ role: 'LECTURER', first: 'Grace', second: 'Owusu' });
  kwame = await signedInAs({ first: 'Kwame', second: 'Mensah' });
  abena = await signedInAs({ first: 'Abena', second: 'Frimpong' });
  stranger = await signedInAs({ first: 'Yaw', second: 'Darko' });
  ({ id: courseId } = await createCourseFixture({ ownerId: lecturer.userId, title: 'Introduction to Biblical Studies' }));
  await enrolFixture(courseId, kwame.userId, lecturer.userId);
  await enrolFixture(courseId, abena.userId, lecturer.userId);
  const base = { courseId, ownerId: lecturer.userId };
  ({ id: open } = await createAssignmentFixture({ ...base, title: 'Reflection on Genesis 1', dueAt: in7days() }));
  ({ id: documents } = await createAssignmentFixture({ ...base, title: 'Covenant essay', dueAt: in7days(), formats: ['TEXT', 'AUDIO', 'PDF', 'DOCX'] }));
  ({ id: pastDue } = await createAssignmentFixture({ ...base, title: 'Prayer journal', dueAt: new Date(Date.now() - 86400000).toISOString() }));
});

/**
 * register-upload, the browser's upload to the signed path, then finalize-upload.
 * @param {{ token: string }} user @param {string} assignmentId @param {Uint8Array} bytes @param {string} filename
 */
async function upload(user, assignmentId, bytes, filename) {
  const reg = await call('register-upload', user.token, { resourceType: 'SUBMISSION_FILE', assignmentId, filename, size: bytes.length });
  if (reg.status !== 200) return { reg, fin: null };
  const s = requireSupabase();
  const put = await fetch(`${s.url}/storage/v1/object/upload/sign/${reg.body.bucket}/${reg.body.path}?token=${reg.body.token}`, {
    method: 'PUT',
    headers: { 'Content-Type': reg.body.contentType },
    body: new Blob([new Uint8Array(bytes)]),
  });
  expect(put.ok, await put.clone().text()).toBe(true);
  return { reg, fin: await call('finalize-upload', user.token, { fileId: reg.body.fileId }) };
}

/** @param {{ token: string }} user @param {string} assignmentId @param {Record<string, unknown>} [over] */
const submit = (user, assignmentId, over = {}) => call('submit-assignment', user.token, { action: 'submit', assignmentId, text: 'My answer.', fileIds: [], requestId: randomUUID(), ...over });

/** @param {string} id */
const fileRow = async (id) => (await serviceGet(`file_objects?select=status,detected_mime_type,duration_seconds,storage_path&id=eq.${id}`))[0];

describe('answer files (register-upload and finalize-upload)', () => {
  it('a Chrome recording (WebM) passes, with its length worked out on the server, in the learner\'s folder for version 1', async () => {
    const { reg, fin } = await upload(kwame, open, webm({ seconds: 95 }), 'Recording 1.webm');
    expect(reg.status).toBe(200);
    expect(reg.body.path).toMatch(new RegExp(`^${open}/${kwame.userId}/1/[0-9a-f-]+\\.webm$`));
    expect(fin?.status).toBe(200);
    expect(fin?.body).toMatchObject({ status: 'VALIDATED', role: 'AUDIO', mimeType: 'audio/webm', durationSeconds: 95 });
  });

  it('a renamed .exe sent as .pdf is rejected and removed', async () => {
    const exe = concat('MZ', new Uint8Array(2000));
    const { reg, fin } = await upload(kwame, documents, exe, 'essay.pdf');
    expect(fin?.status).toBe(422);
    expect(fin?.body.message).toMatch(/not a PDF or Word/);
    expect((await fileRow(reg.body.fileId)).status).toBe('DELETED');
  });

  it('a recording over 10 minutes is rejected (D17)', async () => {
    const { fin } = await upload(kwame, open, ogg({ seconds: 601 }), 'long.ogg');
    expect(fin?.status).toBe(422);
    expect(fin?.body.message).toBe('The audio is longer than 10 minutes.');
  });

  it('oversize files are refused before any upload: audio over 25 MB, PDF over 10 MB', async () => {
    const audio = await call('register-upload', kwame.token, { resourceType: 'SUBMISSION_FILE', assignmentId: open, filename: 'big.mp3', size: 26 * 1048576 });
    expect(audio.status).toBe(400);
    expect(audio.body.code).toBe('too_large');
    const doc = await call('register-upload', kwame.token, { resourceType: 'SUBMISSION_FILE', assignmentId: documents, filename: 'big.pdf', size: 11 * 1048576 });
    expect(doc.status).toBe(400);
    expect(doc.body.message).toBe('The file is larger than 10 MB');
  });

  it('PDF and Word are taken only where the lecturer allowed them (ADR-009)', async () => {
    const refused = await call('register-upload', kwame.token, { resourceType: 'SUBMISSION_FILE', assignmentId: open, filename: 'notes.pdf', size: 100 });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe('This assignment does not accept PDF files');
    const { fin: p } = await upload(kwame, documents, pdf(), 'notes.pdf');
    expect(p?.body).toMatchObject({ status: 'VALIDATED', role: 'PDF' });
    const { fin: d } = await upload(kwame, documents, DOCX, 'notes.docx');
    expect(d?.body).toMatchObject({ status: 'VALIDATED', role: 'DOCX' });
  });

  it('a learner who is not enrolled cannot start an upload', async () => {
    const res = await call('register-upload', stranger.token, { resourceType: 'SUBMISSION_FILE', assignmentId: open, filename: 'a.mp3', size: 100 });
    expect(res.status).toBe(403);
  });
});

describe('submit-assignment', () => {
  it('a text answer with a recording is version 1, on time; a resubmission is version 2; the same request twice makes one version', async () => {
    const { fin } = await upload(abena, open, webm({ seconds: 30 }), 'Recording.webm');
    const fileId = fin?.body.fileId;
    const first = await submit(abena, open, { text: 'Genesis 1 shows a God of order.', fileIds: [fileId] });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ versionNumber: 1, isLate: false, resubmitted: false, replayed: false });
    const requestId = randomUUID();
    const second = await submit(abena, open, { text: 'A fuller answer.', requestId });
    expect(second.body).toMatchObject({ versionNumber: 2, resubmitted: true, replayed: false });
    const again = await submit(abena, open, { text: 'A fuller answer.', requestId });
    expect(again.body).toMatchObject({ versionNumber: 2, replayed: true });
    const versions = await serviceGet(`submission_versions?select=version_number&submission_id=eq.${first.body.submissionId}`);
    expect(versions).toHaveLength(2);
  });

  it('after the due date a first answer is refused when late answers are not allowed', async () => {
    const res = await submit(kwame, pastDue);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('The due date has passed');
  });

  it('an empty answer and an answer over 20,000 characters are refused', async () => {
    expect((await submit(kwame, open, { text: '  ' })).body.message).toBe('Add a text answer, a recording or a file');
    expect((await submit(kwame, open, { text: 'a'.repeat(20001) })).body.message).toBe('Your text answer is longer than 20,000 characters');
  });

  it('a learner cannot submit another learner\'s file, nor remove it', async () => {
    const { fin } = await upload(kwame, open, webm({ seconds: 10 }), 'mine.webm');
    const fileId = fin?.body.fileId;
    const res = await submit(abena, open, { fileIds: [fileId] });
    expect(res.status).toBe(400);
    const removal = await call('submit-assignment', abena.token, { action: 'remove-file', fileId });
    expect(removal.status).toBe(403);
    expect((await fileRow(fileId)).status).toBe('VALIDATED');
  });

  it('a learner removes a file they have not sent: it leaves Storage at once (decision 4)', async () => {
    const { fin } = await upload(kwame, open, webm({ seconds: 10 }), 'mistake.webm');
    const fileId = fin?.body.fileId;
    const res = await call('submit-assignment', kwame.token, { action: 'remove-file', fileId });
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
    expect((await fileRow(fileId)).status).toBe('DELETED');
  });

  it('a visitor cannot submit', async () => {
    expect((await call('submit-assignment', null, { action: 'submit', assignmentId: open, requestId: randomUUID() })).status).toBe(401);
  });
});

describe('extensions (manage-assignments)', () => {
  it('the lecturer gives an extension; the learner can then answer on time; it can be taken back (decision 6)', async () => {
    const due = new Date(Date.now() + 3 * 86400000).toISOString();
    const set = await call('manage-assignments', lecturer.token, { action: 'extension-set', assignmentId: pastDue, learnerId: abena.userId, extendedDueAt: due, reason: 'Illness' });
    expect(set.status).toBe(200);
    expect(set.body.previous).toBeNull();
    const answer = await submit(abena, pastDue);
    expect(answer.body).toMatchObject({ versionNumber: 1, isLate: false });
    const removed = await call('manage-assignments', lecturer.token, { action: 'extension-remove', assignmentId: pastDue, learnerId: abena.userId });
    expect(removed.status).toBe(200);
    expect(new Date(removed.body.removed).getTime()).toBe(new Date(due).getTime());
    const rows = await serviceGet(`submission_extensions?select=revoked_at&assignment_id=eq.${pastDue}&learner_id=eq.${abena.userId}`);
    expect(rows[0].revoked_at).not.toBeNull();
  });

  it('only the course\'s lecturers give extensions, never a learner or another lecturer', async () => {
    const body = { action: 'extension-set', assignmentId: pastDue, learnerId: kwame.userId, extendedDueAt: in7days() };
    expect((await call('manage-assignments', otherLecturer.token, body)).status).toBe(403);
    expect((await call('manage-assignments', kwame.token, body)).status).toBe(403);
  });

  it('an extension must be after the due date and in the future', async () => {
    const res = await call('manage-assignments', lecturer.token, { action: 'extension-set', assignmentId: open, learnerId: kwame.userId, extendedDueAt: new Date(Date.now() + 86400000).toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Choose a date after the assignment's due date");
  });
});

describe('cleanup-files and answers', () => {
  it('a file never sent is removed after 24 hours; a submitted file stays (decision 4)', async () => {
    const s = requireSupabase();
    const { fin: unsent } = await upload(kwame, documents, pdf(), 'forgotten.pdf');
    const { fin: sent } = await upload(kwame, documents, pdf(), 'sent.pdf');
    expect((await submit(kwame, documents, { fileIds: [sent?.body.fileId] })).status).toBe(200);
    const old = new Date(Date.now() - 25 * 3600000).toISOString();
    for (const id of [unsent?.body.fileId, sent?.body.fileId]) {
      const res = await fetch(`${s.url}/rest/v1/file_objects?id=eq.${id}`, {
        method: 'PATCH',
        headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploaded_at: old }),
      });
      expect(res.ok).toBe(true);
    }
    const run = await call('cleanup-files', s.serviceKey, {});
    expect(run.status).toBe(200);
    expect((await fileRow(unsent?.body.fileId)).status).toBe('DELETED');
    expect((await fileRow(sent?.body.fileId)).status).toBe('VALIDATED');
  });
});

describe('lesson audio recorded in the app (decision 5)', () => {
  it('a lecturer\'s WebM recording becomes lesson audio', async () => {
    const lesson = await call('manage-lessons', lecturer.token, { action: 'save', courseId, title: 'The Creation Account', content: '<p>Genesis 1</p>' });
    expect(lesson.status).toBe(200);
    const bytes = webm({ seconds: 120 });
    const reg = await call('register-upload', lecturer.token, { resourceType: 'LESSON_AUDIO', courseId, lessonId: lesson.body.lessonId, filename: 'Recording 1.webm', size: bytes.length });
    expect(reg.status).toBe(200);
    expect(reg.body.contentType).toBe('audio/webm');
    const s = requireSupabase();
    const put = await fetch(`${s.url}/storage/v1/object/upload/sign/${reg.body.bucket}/${reg.body.path}?token=${reg.body.token}`, {
      method: 'PUT',
      headers: { 'Content-Type': reg.body.contentType },
      body: new Blob([new Uint8Array(bytes)]),
    });
    expect(put.ok).toBe(true);
    const fin = await call('finalize-upload', lecturer.token, { fileId: reg.body.fileId, title: 'Recording 1' });
    expect(fin.status).toBe(200);
    expect(fin.body).toMatchObject({ mimeType: 'audio/webm', durationSeconds: 120 });
  });
});
