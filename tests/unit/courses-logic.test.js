// Phase 5 logic: the course form rules (Zod, mirrored by the database checks), the optional course
// column of the learner CSV (ADR-005), and the labels every course and enrolment status needs.
import { describe, expect, it } from 'vitest';
import { learnerRows, parseCsv, TEMPLATE } from '@/lib/admin/csv.js';
import { validate } from '@/lib/auth/schemas.js';
import { COURSE_STATUS_LABEL, COURSE_STATUS_TONE, ENROLMENT_STATUS_LABEL, ENROLMENT_STATUS_TONE } from '@/lib/courses/courses.js';
import { courseSchema, returnReasonSchema } from '@/lib/courses/schemas.js';

const valid = { title: 'Introduction to Biblical Studies', courseCode: 'bib101', category: 'Biblical Studies', description: '', learningObjectives: '' };

describe('course form', () => {
  it('accepts a valid course and stores the code in capitals', () => {
    const r = validate(courseSchema, valid);
    expect(r).toMatchObject({ ok: true, data: { courseCode: 'BIB101', title: 'Introduction to Biblical Studies' } });
  });

  it('rejects a short title and a code with spaces or symbols, with a clear message', () => {
    expect(validate(courseSchema, { ...valid, title: 'ab' })).toMatchObject({ ok: false, errors: { title: 'Enter a title of at least 3 characters' } });
    const bad = validate(courseSchema, { ...valid, courseCode: 'BIB 101!' });
    expect(bad.ok).toBe(false);
    expect(bad.ok ? '' : bad.errors.courseCode).toMatch(/capital letters, digits or dashes/);
    expect(validate(courseSchema, { ...valid, courseCode: '' })).toMatchObject({ ok: false });
  });

  it('allows the same code shapes as the database (2 to 20 letters, digits or dashes)', () => {
    for (const code of ['BI', 'BIB-101', 'DISC2026', 'A1234567890123456789']) expect(validate(courseSchema, { ...valid, courseCode: code }).ok, code).toBe(true);
    for (const code of ['B', '-BIB', 'A12345678901234567890']) expect(validate(courseSchema, { ...valid, courseCode: code }).ok, code).toBe(false);
  });

  it('needs a real reason to return a course', () => {
    expect(returnReasonSchema.safeParse('  ').success).toBe(false);
    expect(returnReasonSchema.safeParse('Add learning objectives').success).toBe(true);
  });
});

describe('learner CSV with a course column', () => {
  it('reads an optional course_code column in capitals and leaves it out when empty', () => {
    const r = learnerRows(parseCsv('first_name,second_name,email,course_code\nAma,Mensah,ama@example.org,bib101\nKofi,Owusu,kofi@example.org,\n'));
    expect(r).toEqual({
      ok: true,
      rows: [
        { firstName: 'Ama', secondName: 'Mensah', email: 'ama@example.org', courseCode: 'BIB101' },
        { firstName: 'Kofi', secondName: 'Owusu', email: 'kofi@example.org' },
      ],
    });
  });

  it('still works without the column (Phase 4 files)', () => {
    expect(learnerRows(parseCsv('first_name,second_name,email\nAma,Mensah,ama@example.org\n'))).toEqual({
      ok: true,
      rows: [{ firstName: 'Ama', secondName: 'Mensah', email: 'ama@example.org' }],
    });
  });

  it('the template shows the course column', () => {
    expect(TEMPLATE.split('\n')[0]).toBe('first_name,second_name,email,course_code');
  });
});

describe('status labels', () => {
  it('every course and enrolment status has a label and a tone (icon plus text, never colour alone)', () => {
    for (const s of ['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'ARCHIVED']) {
      expect(COURSE_STATUS_LABEL[/** @type {keyof typeof COURSE_STATUS_LABEL} */ (s)]).toBeTruthy();
      expect(COURSE_STATUS_TONE[/** @type {keyof typeof COURSE_STATUS_TONE} */ (s)]).toBeTruthy();
    }
    for (const s of ['ACTIVE', 'COMPLETED', 'WITHDRAWN', 'SUSPENDED']) {
      expect(ENROLMENT_STATUS_LABEL[/** @type {keyof typeof ENROLMENT_STATUS_LABEL} */ (s)]).toBeTruthy();
      expect(ENROLMENT_STATUS_TONE[/** @type {keyof typeof ENROLMENT_STATUS_TONE} */ (s)]).toBeTruthy();
    }
  });
});
