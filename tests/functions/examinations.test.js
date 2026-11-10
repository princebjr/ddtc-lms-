// Phase 10.1, step C (ADR-016; owner request and answers of 2026-11-10), as real users over HTTP:
// - manage-examinations: only the course's lecturers set, publish and close an examination;
// - exam-attempt: an enrolled learner starts, saves (text and a recording) and submits once; the deadline
//   is enforced by the server;
// - grade-examination: marking, release, retake;
// - export-gradebook: the examination's results, sorted by branch, with pass or fail;
// - register-upload and finalize-upload for an examination recording.
// The rules and exact figures are in pgTAP 25 and 26.
import { beforeAll, describe, expect, it } from 'vitest';
import { setBranch } from '../e2e/support/accounts.js';
import { createCourseFixture, enrolFixture } from '../e2e/support/courses.js';
import { requireSupabase } from '../e2e/support/local-supabase.js';
import { wav } from '../fixtures/media.js';
import { call, serviceGet, signedInAs } from './support.js';

/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let lecturer;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let otherLecturer;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let kwame;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let abena;
let courseId = '';
let examId = '';
/** @type {Array<{ id: string, kind: string }>} */
let questions = [];

const hours = (/** @type {number} */ h) => new Date(Date.now() + h * 3600000).toISOString();
const structure = [
  {
    title: 'Section A: Multiple choice',
    questions: [{ kind: 'MCQ', prompt: 'Who led Israel out of Egypt?', marks: 2, options: { A: 'Aaron', B: 'Moses', C: 'Joshua', D: 'Samuel' }, correct: 'B' }],
  },
  { title: 'Section B: Essay', questions: [{ kind: 'ESSAY', prompt: 'Discuss the covenant in Genesis.', marks: 8, guide: 'Abraham, land, blessing.' }] },
];

beforeAll(async () => {
  lecturer = await signedInAs({ role: 'LECTURER', first: 'Ama', second: 'Boateng' });
  otherLecturer = await signedInAs({ role: 'LECTURER', first: 'Grace', second: 'Owusu' });
  kwame = await signedInAs({ first: 'Kwame', second: 'Mensah' });
  abena = await signedInAs({ first: 'Abena', second: 'Frimpong' });
  await setBranch(kwame.userId, 'Sampa');
  await setBranch(abena.userId, 'Kasoa C.P');
  ({ id: courseId } = await createCourseFixture({ ownerId: lecturer.userId, title: 'Introduction to Biblical Studies' }));
  for (const l of [kwame, abena]) await enrolFixture(courseId, l.userId, lecturer.userId);
});

describe('setting an examination (manage-examinations)', () => {
  it('only the course lecturers set it', async () => {
    const fields = { title: 'Final examination', pass_mark: 50, opens_at: hours(-1), closes_at: hours(48) };
    expect((await call('manage-examinations', otherLecturer.token, { action: 'save', courseId, fields })).status).toBe(403);
    expect((await call('manage-examinations', kwame.token, { action: 'save', courseId, fields })).status).toBe(403);
    const res = await call('manage-examinations', lecturer.token, { action: 'save', courseId, fields });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    examId = res.body.examId;
  });

  it('saves sections and questions, then publishes', async () => {
    const bad = await call('manage-examinations', lecturer.token, {
      action: 'structure',
      examId,
      sections: [{ title: 'A', questions: [{ kind: 'MCQ', prompt: 'Pick', marks: 1, options: { A: 'w', B: 'x', C: 'y', D: 'z' } }] }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('Choose the correct answer for each multiple-choice question');
    const res = await call('manage-examinations', lecturer.token, { action: 'structure', examId, sections: structure });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ questions: 2 });
    expect((await call('manage-examinations', lecturer.token, { action: 'publish', examId, publish: true })).status).toBe(200);
    questions = await serviceGet(`exam_questions?select=id,kind&exam_id=eq.${examId}&archived_at=is.null&order=position`);
  });
});

describe('taking it (exam-attempt), with a recording', () => {
  it('a learner of another course is refused', async () => {
    const stranger = await signedInAs({ first: 'Esi', second: 'Owusu' });
    const res = await call('exam-attempt', stranger.token, { action: 'start', examId });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You are not enrolled in this course');
  });

  it('starts, saves a choice, text and a recording, and submits once', async () => {
    expect((await call('exam-attempt', kwame.token, { action: 'start', examId })).status).toBe(200);
    const [mcq, essay] = questions;
    const bytes = wav(3);
    const reg = await call('register-upload', kwame.token, { resourceType: 'EXAM_ANSWER_AUDIO', examId, questionId: essay.id, filename: 'answer.wav', size: bytes.length });
    expect(reg.status, JSON.stringify(reg.body)).toBe(200);
    const s = requireSupabase();
    const put = await fetch(`${s.url}/storage/v1/object/upload/sign/${reg.body.bucket}/${reg.body.path}?token=${reg.body.token}`, {
      method: 'PUT',
      headers: { 'Content-Type': reg.body.contentType },
      body: new Blob([new Uint8Array(bytes)]),
    });
    expect(put.ok, await put.clone().text()).toBe(true);
    const fin = await call('finalize-upload', kwame.token, { fileId: reg.body.fileId });
    expect(fin.status, JSON.stringify(fin.body)).toBe(200);
    expect(fin.body.status).toBe('VALIDATED');
    const saved = await call('exam-attempt', kwame.token, {
      action: 'save',
      examId,
      answers: [
        { questionId: mcq.id, selectedOption: 'B' },
        { questionId: essay.id, textAnswer: 'Covenant runs through Genesis.', audioFileId: reg.body.fileId },
      ],
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((await call('exam-attempt', kwame.token, { action: 'submit', examId })).status).toBe(200);
    const again = await call('exam-attempt', kwame.token, { action: 'submit', examId });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('You have already submitted this examination');
  });

  it('a recording cannot be registered for a multiple-choice question', async () => {
    expect((await call('exam-attempt', abena.token, { action: 'start', examId })).status).toBe(200);
    const res = await call('register-upload', abena.token, { resourceType: 'EXAM_ANSWER_AUDIO', examId, questionId: questions[0].id, filename: 'a.wav', size: 100 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Multiple-choice questions are answered by choosing A to D');
  });
});

describe('marking, release and export (grade-examination, export-gradebook)', () => {
  it('marks the essay, releases, and refuses another course lecturer', async () => {
    const [, essay] = questions;
    expect((await call('grade-examination', otherLecturer.token, { action: 'release', examId })).status).toBe(403);
    const mark = await call('grade-examination', lecturer.token, { action: 'mark', examId, learnerId: kwame.userId, questionId: essay.id, score: 6, feedback: 'Good use of Genesis 15.' });
    expect(mark.status, JSON.stringify(mark.body)).toBe(200);
    const res = await call('grade-examination', lecturer.token, { action: 'release', examId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ released: 1 });
  });

  it('exports the results sorted by branch, with pass or fail', async () => {
    const res = await call('export-gradebook', lecturer.token, { kind: 'examination', examId, format: 'csv' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const text = Buffer.from(res.body.content, 'base64').toString('utf8');
    const [header, ...rows] = text.replace(new RegExp('^' + String.fromCharCode(0xfeff)), '').trim().split('\r\n');
    expect(header).toBe('Name,ID number,Branch,Examination,Submission date,Multiple choice,Short answer,Essay,Total,Maximum,Percentage,Result,Status,Marking,Feedback');
    // Kasoa C.P (Abena) before Sampa (Kwame).
    expect(rows[0]).toMatch(/^Abena Frimpong,\d{6},Kasoa C\.P,Final examination,,/);
    expect(rows[1]).toMatch(/^Kwame Mensah,\d{6},Sampa,Final examination,.+,2,0,6,8,10,80,Pass,Submitted,Marked · released,/);
    const audits = await serviceGet(`audit_logs?select=action&entity_id=eq.${examId}&action=eq.export.exam_results`);
    expect(audits).toHaveLength(1);
  });

  it('authorises a retake with a reason', async () => {
    const noReason = await call('grade-examination', lecturer.token, { action: 'retake', examId, learnerId: kwame.userId, reason: '' });
    expect(noReason.status).toBe(400);
    const ok = await call('grade-examination', lecturer.token, { action: 'retake', examId, learnerId: kwame.userId, reason: 'Unwell on the day' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });
});

describe('the deadline (server time)', () => {
  it('nothing is saved after an early close', async () => {
    expect((await call('manage-examinations', lecturer.token, { action: 'close', examId, reason: 'Ended early' })).status).toBe(200);
    const res = await call('exam-attempt', abena.token, { action: 'save', examId, answers: [{ questionId: questions[0].id, selectedOption: 'A' }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('The deadline for this examination has passed');
  });
});
