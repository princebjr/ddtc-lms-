// Phase 10.1, step A (ADR-016; owner request of 2026-11-10), as real users over HTTP:
// - the practical mark sheet: the course's lecturer types several learners' marks in one request
//   (grade-submission save-practical-marks), released like any grade (release-grades);
// - learners cannot answer a practical (submit-assignment), and a lecturer of another course or a learner
//   cannot enter marks;
// - switching a course to the three parts (manage-assignments apply-parts) is for administrators only.
// The rules and exact figures are in pgTAP 24.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAssignmentFixture } from '../e2e/support/assignments.js';
import { createCourseFixture, enrolFixture } from '../e2e/support/courses.js';
import { call, serviceGet, signedInAdmin, signedInAs } from './support.js';

/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let lecturer;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let otherLecturer;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let kwame;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let abena;
let courseId = '';
let practical = '';

beforeAll(async () => {
  lecturer = await signedInAs({ role: 'LECTURER', first: 'Ama', second: 'Boateng' });
  otherLecturer = await signedInAs({ role: 'LECTURER', first: 'Grace', second: 'Owusu' });
  kwame = await signedInAs({ first: 'Kwame', second: 'Mensah' });
  abena = await signedInAs({ first: 'Abena', second: 'Frimpong' });
  ({ id: courseId } = await createCourseFixture({ ownerId: lecturer.userId, title: 'Introduction to Biblical Studies' }));
  for (const l of [kwame, abena]) await enrolFixture(courseId, l.userId, lecturer.userId);
  ({ id: practical } = await createAssignmentFixture({
    courseId,
    ownerId: lecturer.userId,
    title: 'Leading a prayer meeting',
    dueAt: new Date(Date.now() - 86400000).toISOString(),
    part: 'PRACTICALS',
    maxMarks: 30,
  }));
});

const marks = () => [
  { learnerId: kwame.userId, score: 25, feedback: 'Led with confidence.' },
  { learnerId: abena.userId, score: 18 },
];

describe('the practical mark sheet', () => {
  it('a learner cannot answer a practical; it is marked in person', async () => {
    const res = await call('submit-assignment', kwame.token, { action: 'submit', assignmentId: practical, text: 'My answer.', fileIds: [], requestId: randomUUID() });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This practical is marked in person by your lecturer');
  });

  it('only the course lecturers enter marks', async () => {
    expect((await call('grade-submission', otherLecturer.token, { action: 'save-practical-marks', assignmentId: practical, marks: marks() })).status).toBe(403);
    expect((await call('grade-submission', kwame.token, { action: 'save-practical-marks', assignmentId: practical, marks: marks() })).status).toBe(403);
  });

  it('refuses a mark above the maximum', async () => {
    const res = await call('grade-submission', lecturer.token, { action: 'save-practical-marks', assignmentId: practical, marks: [{ learnerId: kwame.userId, score: 31 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('The score must be between 0 and 30');
  });

  it('saves several marks at once as drafts, then releases them', async () => {
    const res = await call('grade-submission', lecturer.token, { action: 'save-practical-marks', assignmentId: practical, marks: [...marks(), { learnerId: kwame.userId, score: null }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ saved: 2 });
    const rows = await serviceGet(`submissions?select=score,marked_in_person,grade_release_status&assignment_id=eq.${practical}&order=score.desc`);
    expect(rows).toEqual([
      { score: 25, marked_in_person: true, grade_release_status: 'DRAFT' },
      { score: 18, marked_in_person: true, grade_release_status: 'DRAFT' },
    ]);
    const released = await call('release-grades', lecturer.token, { assignmentId: practical });
    expect(released.status, JSON.stringify(released.body)).toBe(200);
    expect(released.body).toEqual({ released: 2 });
  });
});

describe('switching a course to the three parts', () => {
  it('is for administrators only, with a reason', async () => {
    const lect = await call('manage-assignments', lecturer.token, { action: 'apply-parts', courseId, reason: 'Switching' });
    expect(lect.status).toBe(403);
    expect(lect.body.message).toBe('Only an administrator can change the grade weights');
    const admin = await signedInAdmin();
    const noReason = await call('manage-assignments', admin.token, { action: 'apply-parts', courseId, reason: '' });
    expect(noReason.status).toBe(400);
    // This course already has the parts, so nothing changes.
    const ok = await call('manage-assignments', admin.token, { action: 'apply-parts', courseId, reason: 'Moving to the DDTC standard' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });
});
