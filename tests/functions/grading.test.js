// Phase 9 Edge Function tests: grading through grade-submission (save, reopen) and release-grades
// (one learner or the whole assignment), as real users over HTTP; the full rule set is in pgTAP 19
// and 20. Also the cleanup-files cases the phase file requires: a pending upload older than 24 hours
// is removed, while lesson audio and validated submission files are left alone.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { requireSupabase } from '../e2e/support/local-supabase.js';
import { createAssignmentFixture } from '../e2e/support/assignments.js';
import { createCourseFixture, enrolFixture } from '../e2e/support/courses.js';
import { pdf, webm } from '../fixtures/media.js';
import { call, serviceGet, signedInAdmin, signedInAs } from './support.js';

/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let lecturer;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let otherLecturer;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let kwame;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let abena;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let yaw;
let courseId = '';
let assignmentId = '';

const in7days = () => new Date(Date.now() + 7 * 86400000).toISOString();
const send = (user, id, text = 'Genesis 1 shows a God who creates with purpose.') =>
  call('submit-assignment', user.token, { action: 'submit', assignmentId: id, text, fileIds: [], requestId: randomUUID() });
const save = (user, body) => call('grade-submission', user.token, { action: 'save', assignmentId, ...body });
const fileRow = async (id) => (await serviceGet(`file_objects?select=status&id=eq.${id}`))[0];

beforeAll(async () => {
  lecturer = await signedInAs({ role: 'LECTURER', first: 'Ama', second: 'Boateng' });
  otherLecturer = await signedInAs({ role: 'LECTURER', first: 'Grace', second: 'Owusu' });
  kwame = await signedInAs({ first: 'Kwame', second: 'Mensah' });
  abena = await signedInAs({ first: 'Abena', second: 'Frimpong' });
  yaw = await signedInAs({ first: 'Yaw', second: 'Darko' });
  ({ id: courseId } = await createCourseFixture({ ownerId: lecturer.userId, title: 'Introduction to Biblical Studies' }));
  for (const l of [kwame, abena, yaw]) await enrolFixture(courseId, l.userId, lecturer.userId);
  // Maximum marks 20 (the fixture's); PDF accepted for the cleanup case below.
  ({ id: assignmentId } = await createAssignmentFixture({ courseId, ownerId: lecturer.userId, title: 'Reflection on Genesis 1', dueAt: in7days(), formats: ['TEXT', 'AUDIO', 'PDF'] }));
  expect((await send(kwame, assignmentId)).status).toBe(200);
  expect((await send(abena, assignmentId)).status).toBe(200);
});

describe('grade-submission', () => {
  it('the course lecturer saves a draft grade', async () => {
    const res = await save(lecturer, { learnerId: kwame.userId, score: 15.5, feedback: 'Good reading of the text.' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ changed: true, gradeReleaseStatus: 'DRAFT' });
  });

  it('refuses scores outside the rules, with the reason', async () => {
    expect((await save(lecturer, { learnerId: kwame.userId, score: -1 })).body.message).toBe('Enter a score of 0 or more');
    expect((await save(lecturer, { learnerId: kwame.userId, score: 12.345 })).body.message).toBe('Use at most two decimals');
    const over = await save(lecturer, { learnerId: kwame.userId, score: 21 });
    expect(over.status).toBe(400);
    expect(over.body.message).toBe('The score must be between 0 and 20');
    const long = await save(lecturer, { learnerId: kwame.userId, score: 10, feedback: 'x'.repeat(10001) });
    expect(long.body.message).toBe('Keep the feedback to 10,000 characters');
  });

  it('only the course lecturers grade, and only answers that were sent', async () => {
    expect((await save(kwame, { learnerId: abena.userId, score: 20 })).status).toBe(403);
    const other = await save(otherLecturer, { learnerId: abena.userId, score: 20 });
    expect(other.status).toBe(403);
    expect(other.body.message).toBe('You do not teach this course');
    const nothing = await save(lecturer, { learnerId: yaw.userId, score: 10 });
    expect(nothing.status).toBe(404);
    expect(nothing.body.message).toBe('This learner has not sent an answer');
  });

  it('reopening needs a reason', async () => {
    const res = await call('grade-submission', lecturer.token, { action: 'reopen', assignmentId, learnerId: kwame.userId, reason: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Give a reason for reopening');
  });
});

describe('release-grades', () => {
  it('releases one learner\'s grade, who then sees it and is notified', async () => {
    const res = await call('release-grades', lecturer.token, { assignmentId, learnerId: kwame.userId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ released: 1 });
    const { data: grade } = await kwame.client.rpc('my_grade', { p_assignment: assignmentId });
    expect(grade).toMatchObject({ score: 15.5, percentage: 77.5, letter_grade: 'B', band: '70-79%', feedback: 'Good reading of the text.' });
    const { data: notes } = await kwame.client.from('notifications').select('notification_type, title, link_path, read_at');
    expect(notes).toEqual([
      { notification_type: 'GRADE_RELEASED', title: 'New grade available', link_path: `/learner/courses/${courseId}/assignments/${assignmentId}`, read_at: null },
    ]);
    const { data: others } = await abena.client.from('notifications').select('id');
    expect(others).toEqual([]);
    const again = await call('release-grades', lecturer.token, { assignmentId, learnerId: kwame.userId });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('There is no grade to release for this learner');
  });

  it('a released grade changes only with a reason, and the learner sees the change once released', async () => {
    const noReason = await save(lecturer, { learnerId: kwame.userId, score: 17, feedback: 'Good reading of the text.' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.message).toBe('Give a reason for changing a released grade');
    const changed = await save(lecturer, { learnerId: kwame.userId, score: 17, feedback: 'Good reading of the text.', reason: 'Marked the second part again' });
    expect(changed.body).toMatchObject({ changed: true, gradeReleaseStatus: 'DRAFT' });
    expect((await kwame.client.rpc('my_grade', { p_assignment: assignmentId })).data).toMatchObject({ score: 15.5 });
    expect((await call('release-grades', lecturer.token, { assignmentId, learnerId: kwame.userId })).body).toEqual({ released: 1 });
    expect((await kwame.client.rpc('my_grade', { p_assignment: assignmentId })).data).toMatchObject({ score: 17, updated: true });
  });

  it('releases every draft grade of an assignment; an AAL2 administrator may too', async () => {
    expect((await save(lecturer, { learnerId: abena.userId, score: 18 })).status).toBe(200);
    const admin = await signedInAdmin();
    const res = await call('release-grades', admin.token, { assignmentId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ released: 1 });
    const none = await call('release-grades', lecturer.token, { assignmentId });
    expect(none.status).toBe(400);
    expect(none.body.message).toBe('There are no grades to release');
  });

  it('a graded answer is reopened with a reason and may be sent again before the due date', async () => {
    const res = await call('grade-submission', lecturer.token, { action: 'reopen', assignmentId, learnerId: abena.userId, reason: 'The recording did not play' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await send(abena, assignmentId, 'Here is my answer again.')).status).toBe(200);
  });
});

describe('cleanup-files (Phase 9 tests required)', () => {
  it('removes a pending upload older than 24 hours; leaves lesson audio and validated submission files alone', async () => {
    const s = requireSupabase();
    // A pending upload: registered, never uploaded or checked (by Yaw, whose answer is not graded:
    // a graded answer takes no new files).
    const pending = await call('register-upload', yaw.token, { resourceType: 'SUBMISSION_FILE', assignmentId, filename: 'never-sent.pdf', size: 2000 });
    expect(pending.status).toBe(200);
    // A lesson's audio, validated and in use.
    const lesson = await call('manage-lessons', lecturer.token, { action: 'save', courseId, title: 'The Creation Account', content: '<p>Genesis 1</p>' });
    const bytes = webm({ seconds: 60 });
    const reg = await call('register-upload', lecturer.token, { resourceType: 'LESSON_AUDIO', courseId, lessonId: lesson.body.lessonId, filename: 'Lesson.webm', size: bytes.length });
    const put = await fetch(`${s.url}/storage/v1/object/upload/sign/${reg.body.bucket}/${reg.body.path}?token=${reg.body.token}`, {
      method: 'PUT',
      headers: { 'Content-Type': reg.body.contentType },
      body: new Blob([new Uint8Array(bytes)]),
    });
    expect(put.ok).toBe(true);
    expect((await call('finalize-upload', lecturer.token, { fileId: reg.body.fileId, title: 'Lesson' })).status).toBe(200);
    // A validated file of a sent answer.
    const doc = pdf();
    const answerReg = await call('register-upload', yaw.token, { resourceType: 'SUBMISSION_FILE', assignmentId, filename: 'notes.pdf', size: doc.length });
    expect(answerReg.status, JSON.stringify(answerReg.body)).toBe(200);
    const answerPut = await fetch(`${s.url}/storage/v1/object/upload/sign/${answerReg.body.bucket}/${answerReg.body.path}?token=${answerReg.body.token}`, {
      method: 'PUT',
      headers: { 'Content-Type': answerReg.body.contentType },
      body: new Blob([new Uint8Array(doc)]),
    });
    expect(answerPut.ok).toBe(true);
    expect((await call('finalize-upload', yaw.token, { fileId: answerReg.body.fileId })).status).toBe(200);
    const sent = await call('submit-assignment', yaw.token, { action: 'submit', assignmentId, text: 'With my notes.', fileIds: [answerReg.body.fileId], requestId: randomUUID() });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    // Two days old, all three.
    const old = new Date(Date.now() - 48 * 3600000).toISOString();
    for (const id of [pending.body.fileId, reg.body.fileId, answerReg.body.fileId]) {
      const res = await fetch(`${s.url}/rest/v1/file_objects?id=eq.${id}`, {
        method: 'PATCH',
        headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploaded_at: old }),
      });
      expect(res.ok).toBe(true);
    }
    expect((await call('cleanup-files', s.serviceKey, {})).status).toBe(200);
    expect((await fileRow(pending.body.fileId)).status).toBe('DELETED');
    expect((await fileRow(reg.body.fileId)).status).toBe('VALIDATED');
    expect((await fileRow(answerReg.body.fileId)).status).toBe('VALIDATED');
  });
});
