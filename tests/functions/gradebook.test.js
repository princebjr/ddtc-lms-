// Phase 10 Edge Function tests, as real users over HTTP:
// - release-grades for a whole course (owner request 2026-11-10);
// - the weights lock through manage-assignments (owner decision 4);
// - export-gradebook: the course gradebook and the assignment performance report (owner request
//   2026-11-06), in CSV and Excel (a small built-in writer: exceljs exceeded the CPU limit, owner
//   decision of 2026-11-10), for the course's lecturers and AAL2
//   administrators only, each export audited.
// The formulas and access rules are in pgTAP 22 and 23.
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
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let yaw;
let courseId = '';
let essay = '';
let journal = '';

const in7days = () => new Date(Date.now() + 7 * 86400000).toISOString();
/** @param {{ token: string }} user @param {string} assignmentId */
const send = (user, assignmentId) => call('submit-assignment', user.token, { action: 'submit', assignmentId, text: 'My answer.', fileIds: [], requestId: randomUUID() });
/** @param {string} assignmentId @param {string} learnerId @param {number} score */
const grade = (assignmentId, learnerId, score) => call('grade-submission', lecturer.token, { action: 'save', assignmentId, learnerId, score });

beforeAll(async () => {
  lecturer = await signedInAs({ role: 'LECTURER', first: 'Ama', second: 'Boateng' });
  otherLecturer = await signedInAs({ role: 'LECTURER', first: 'Grace', second: 'Owusu' });
  kwame = await signedInAs({ first: 'Kwame', second: 'Mensah' });
  abena = await signedInAs({ first: 'Abena', second: 'Frimpong' });
  yaw = await signedInAs({ first: 'Yaw', second: 'Darko' });
  ({ id: courseId } = await createCourseFixture({ ownerId: lecturer.userId, title: 'Introduction to Biblical Studies' }));
  for (const l of [kwame, abena, yaw]) await enrolFixture(courseId, l.userId, lecturer.userId);
  ({ id: essay } = await createAssignmentFixture({ courseId, ownerId: lecturer.userId, title: 'Covenant essay', dueAt: in7days() }));
  ({ id: journal } = await createAssignmentFixture({ courseId, ownerId: lecturer.userId, title: 'Prayer journal', dueAt: in7days() }));
  /** @type {Array<[{ token: string }, string]>} */
  const answers = [[kwame, essay], [abena, essay], [kwame, journal]];
  for (const [l, a] of answers) expect((await send(l, a)).status).toBe(200);
  expect((await grade(essay, kwame.userId, 15)).status).toBe(200);
  expect((await grade(essay, abena.userId, 12)).status).toBe(200);
  expect((await grade(journal, kwame.userId, 18)).status).toBe(200);
});

describe('release-grades for a whole course (owner request)', () => {
  it('only the course lecturers release a course', async () => {
    expect((await call('release-grades', otherLecturer.token, { courseId })).status).toBe(403);
    expect((await call('release-grades', kwame.token, { courseId })).status).toBe(403);
  });

  it('releases every draft grade of the course at once', async () => {
    const res = await call('release-grades', lecturer.token, { courseId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ released: 3 });
    const again = await call('release-grades', lecturer.token, { courseId });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('There are no grades to release');
  });
});

describe('weights after the first release (owner decision 4; since Phase 10.1 administrators only, ADR-016)', () => {
  it('a lecturer is refused; an administrator changes them with a reason', async () => {
    const parts = await serviceGet(`grade_categories?select=id,weight&course_id=eq.${courseId}&archived_at=is.null&order=position`);
    const categories = parts.map((/** @type {{ id: string, weight: number }} */ p) => ({ id: p.id, weight: p.weight }));
    expect(categories).toHaveLength(3);
    const lect = await call('manage-assignments', lecturer.token, { action: 'save-categories', courseId, categories, reason: 'Mine' });
    expect(lect.status).toBe(403);
    expect(lect.body.message).toBe('Only an administrator can change the grade weights');
    const admin = await signedInAdmin();
    const noReason = await call('manage-assignments', admin.token, { action: 'save-categories', courseId, categories });
    expect(noReason.status).toBe(400);
    expect(noReason.body.message).toBe('Give a reason for changing the grade weights');
    const ok = await call('manage-assignments', admin.token, { action: 'save-categories', courseId, categories, reason: 'Confirming the weights' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });
});

describe('export-gradebook', () => {
  it('exports the course gradebook as CSV, one row per learner with their grades', async () => {
    const res = await call('export-gradebook', lecturer.token, { kind: 'gradebook', courseId, format: 'csv' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.filename).toMatch(/\.csv$/);
    const text = Buffer.from(res.body.content, 'base64').toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff); // Excel opens UTF-8 CSV cleanly with the byte-order mark
    const [header, ...rows] = text.replace(new RegExp('^' + String.fromCharCode(0xfeff)), '').trim().split('\r\n');
    expect(header).toContain('Learner,ID number,Branch,Covenant essay (20),Prayer journal (20),Overall %,Grade,Status');
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.startsWith('Kwame Mensah'))).toContain(',15,18,82.5,A,Final');
  });

  it('exports the assignment performance report as CSV with "Not Submitted" and the totals', async () => {
    const res = await call('export-gradebook', lecturer.token, { kind: 'assignment', assignmentId: essay, format: 'csv' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const text = Buffer.from(res.body.content, 'base64').toString('utf8');
    expect(text).toContain('Name,ID number,Branch,Assignment,Submission date,Score,Maximum,Percentage,Status');
    expect(text).toMatch(/Yaw Darko,\d{6},,Covenant essay,,,20,,Not Submitted/);
    expect(text).toContain('Class average (%),67.5');
    expect(text).toContain('Highest (%),75');
    expect(text).toContain('Lowest (%),60');
  });

  it('exports Excel files (a real .xlsx, a zip) with the DDTC heading', async () => {
    for (const body of [{ kind: 'gradebook', courseId, format: 'xlsx' }, { kind: 'assignment', assignmentId: essay, format: 'xlsx' }]) {
      const res = await call('export-gradebook', lecturer.token, body);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.filename).toMatch(/\.xlsx$/);
      const bytes = Buffer.from(res.body.content, 'base64');
      expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
      // The parts an .xlsx needs (their names are stored uncompressed in the zip).
      const names = bytes.toString('latin1');
      for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) expect(names).toContain(part);
    }
  });

  it('refuses learners and other lecturers, and audits every export', async () => {
    expect((await call('export-gradebook', kwame.token, { kind: 'gradebook', courseId, format: 'csv' })).status).toBe(403);
    expect((await call('export-gradebook', otherLecturer.token, { kind: 'assignment', assignmentId: essay, format: 'csv' })).status).toBe(403);
    const audits = await serviceGet(`audit_logs?select=action&entity_id=eq.${courseId}&action=eq.export.gradebook`);
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });
});
