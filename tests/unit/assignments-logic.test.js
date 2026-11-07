// Phase 7 pure logic: due dates in Ghana time (Africa/Accra, GMT all year) for learners, the
// assignment form rules (the server and database check them again), the category weights shown
// while editing (D12), and the answer formats that always include text and audio (ADR-009).
import { describe, expect, it } from 'vitest';
import { categoriesProblem, weightTotal } from '@/lib/assignments/categories.js';
import { dueStatus, formatDue, fromGhanaInput, toGhanaInput } from '@/lib/assignments/due.js';
import { answerFormats, assignmentSchema, publishProblem } from '@/lib/assignments/schemas.js';
import { validate } from '@/lib/auth/schemas.js';

const now = new Date('2026-11-07T10:00:00Z'); // Saturday 7 November, 10:00 in Ghana

describe('due dates (Ghana time)', () => {
  it('formats a due date and time', () => {
    expect(formatDue('2026-11-20T23:59:00Z')).toBe('20 Nov 2026, 23:59');
  });

  it('says today, tomorrow, in a few days, or the date', () => {
    expect(dueStatus({ dueAt: '2026-11-07T23:59:00Z' }, now)).toMatchObject({ label: 'Due today, 23:59', tone: 'warning', overdue: false });
    expect(dueStatus({ dueAt: '2026-11-08T09:00:00Z' }, now)).toMatchObject({ label: 'Due tomorrow, 09:00', tone: 'warning' });
    expect(dueStatus({ dueAt: '2026-11-11T12:00:00Z' }, now)).toMatchObject({ label: 'Due in 4 days', tone: 'info' });
    expect(dueStatus({ dueAt: '2026-11-30T12:00:00Z' }, now)).toMatchObject({ label: 'Due 30 Nov', tone: 'info' });
  });

  it('marks work past its due date as overdue, or late allowed when the assignment accepts late work', () => {
    expect(dueStatus({ dueAt: '2026-11-06T23:59:00Z' }, now)).toMatchObject({ label: 'Overdue', tone: 'error', overdue: true });
    expect(dueStatus({ dueAt: '2026-11-06T23:59:00Z', allowLate: true }, now)).toMatchObject({ label: 'Late allowed', tone: 'warning', overdue: true });
  });

  it("uses the learner's extension when there is one (D13)", () => {
    const s = dueStatus({ dueAt: '2026-11-06T23:59:00Z', extendedTo: '2026-11-10T23:59:00Z' }, now);
    expect(s).toMatchObject({ label: 'Extended: due in 3 days', overdue: false, effective: '2026-11-10T23:59:00Z' });
  });

  it('reads and writes the date and time field in Ghana time', () => {
    expect(toGhanaInput('2026-11-20T23:59:00Z')).toBe('2026-11-20T23:59');
    expect(fromGhanaInput('2026-11-20T23:59')).toBe('2026-11-20T23:59:00Z');
    expect(fromGhanaInput('')).toBe('');
    expect(toGhanaInput(null)).toBe('');
  });
});

describe('the assignment form', () => {
  const good = { title: 'Reflection on Genesis 1', categoryId: '00000000-0000-4000-8000-0000000000c1', contentType: 'TEXT', dueAt: '2026-11-20T23:59', maxMarks: '20', description: '', gradingCriteria: '' };

  it('accepts a complete form and turns the marks into a number', () => {
    const r = validate(assignmentSchema, good);
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.maxMarks).toBe(20);
  });

  it('explains each missing or wrong field', () => {
    const r = validate(assignmentSchema, { ...good, title: 'Hi', categoryId: '', dueAt: '', maxMarks: '0' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors).toEqual({
      title: 'Enter a title of at least 3 characters',
      categoryId: 'Choose a category',
      dueAt: 'Choose a due date and time',
      maxMarks: 'Maximum marks must be more than 0',
    });
  });

  it('checks what the instruction type needs before publishing', () => {
    expect(publishProblem({ contentType: 'TEXT', textInstructions: '<p> </p>', hasAudio: false })).toBe('Write the instructions before publishing');
    expect(publishProblem({ contentType: 'AUDIO', textInstructions: '', hasAudio: false })).toBe('Add the instruction audio before publishing');
    expect(publishProblem({ contentType: 'TEXT_AND_AUDIO', textInstructions: '<p>Read</p>', hasAudio: false })).toBe('Add the instruction audio before publishing');
    expect(publishProblem({ contentType: 'TEXT_AND_AUDIO', textInstructions: '<p>Read</p>', hasAudio: true })).toBeNull();
    expect(publishProblem({ contentType: 'AUDIO', textInstructions: '<p>Extra notes</p>', hasAudio: true })).toBeNull();
  });

  it('always accepts text and audio answers, plus PDF and Word when chosen (ADR-009)', () => {
    expect(answerFormats({ pdf: false, docx: false })).toEqual(['TEXT', 'AUDIO']);
    expect(answerFormats({ pdf: true, docx: true })).toEqual(['TEXT', 'AUDIO', 'PDF', 'DOCX']);
  });
});

describe('category weights while editing (D12)', () => {
  it('adds up the weights as typed', () => {
    expect(weightTotal([{ name: 'Assignments', weight: '70' }, { name: 'Participation', weight: '30' }])).toBe(100);
    expect(weightTotal([{ name: 'A', weight: '' }])).toBe(0);
  });

  it('explains what is wrong before saving', () => {
    expect(categoriesProblem([])).toBe('Keep at least one category');
    expect(categoriesProblem([{ name: ' ', weight: '50' }])).toBe('Give each category a name');
    expect(categoriesProblem([{ name: 'Work', weight: '50' }, { name: 'work', weight: '50' }])).toBe('Two categories cannot share a name');
    expect(categoriesProblem([{ name: 'Work', weight: '50.5' }])).toBe('Each weight is a whole number from 0 to 100');
    expect(categoriesProblem([{ name: 'Work', weight: '120' }])).toBe('Each weight is a whole number from 0 to 100');
    expect(categoriesProblem([{ name: 'Work', weight: '60' }])).toBeNull(); // saving is allowed; releasing grades needs 100
  });
});
