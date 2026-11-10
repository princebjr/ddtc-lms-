// @vitest-environment jsdom
// Step 9.1: the lecturer's "To grade" and the learner's "Grades and feedback" (navigation pages promised
// for Phase 9). To grade lists the answers waiting (oldest first, Late and Reopened marked), each with
// Grade opening the grading screen, and the draft grades not released per assignment; a course filter
// appears with more than one course. Grades and feedback groups the learner's assignments by course:
// a released grade with its figures and feedback, or "Awaiting grade" with no score. The database
// rules are tested in pgTAP 21.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LearnerGradesPage from '@/pages/learner/LearnerGradesPage.jsx';
import ToGradePage from '@/pages/lecturer/ToGradePage.jsx';

const api = vi.hoisted(() => ({ fetchGradingQueue: vi.fn(), fetchMyGrades: vi.fn() }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));
vi.mock('@/hooks/use-profile-image.js', () => ({ useProfileImage: () => null }));
vi.mock('@/lib/branches.js', () => ({ fetchBranches: async () => [] }));
vi.mock('@/lib/grading/grading.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchGradingQueue: () => api.fetchGradingQueue(),
  fetchMyGrades: () => api.fetchMyGrades(),
}));

/** @param {Partial<import('@/lib/grading/grading.js').QueueRow>} over @returns {import('@/lib/grading/grading.js').QueueRow} */
const queue = (over) => ({
  course_id: 'c1',
  course_title: 'Introduction to Biblical Studies',
  course_code: 'BIB101',
  assignment_id: 'a1',
  assignment_title: 'Reflection on Genesis 1',
  due_at: '2030-01-20T23:59:00Z',
  max_marks: 20,
  learner_id: 'l1',
  first_name: 'Kwame',
  second_name: 'Mensah',
  id_number: 123456,
  branch_name: 'Kumasi',
  profile_image_path: null,
  state: 'UNGRADED',
  status: 'SUBMITTED',
  current_version: 1,
  submitted_at: '2030-01-18T10:00:00Z',
  is_late: false,
  score: null,
  ...over,
});

/** @param {import('react').ReactNode} ui */
const renderAt = (ui) =>
  render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());

describe('To grade', () => {
  it('lists the answers waiting, each with Grade opening the grading screen, and the drafts to release', async () => {
    api.fetchGradingQueue.mockResolvedValue([
      queue({}),
      queue({ learner_id: 'l2', first_name: 'Abena', second_name: 'Frimpong', status: 'REOPENED', is_late: true }),
      queue({ learner_id: 'l3', first_name: 'Yaw', second_name: 'Darko', state: 'DRAFT', status: 'GRADED', score: 14 }),
      queue({ learner_id: 'l4', first_name: 'Esi', second_name: 'Owusu', state: 'DRAFT', status: 'GRADED', score: 17 }),
    ]);
    renderAt(<ToGradePage />);
    expect(await screen.findByText('2 answers waiting in 1 assignment')).toBeTruthy();
    // Wait for the list itself: while the skeleton keeps its 300 ms the loaded content is hidden.
    const grade = (await screen.findAllByRole('link', { name: 'Grade answer from Kwame Mensah' }))[0];
    expect(grade.getAttribute('href')).toBe('/lecturer/courses/c1/assignments/a1/submissions/l1');
    expect(screen.getAllByText('Reopened').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Late').length).toBeGreaterThan(0);
    const drafts = screen.getByRole('list', { name: 'Draft grades not released' });
    expect(within(drafts).getByText('2 draft grades')).toBeTruthy();
    expect(within(drafts).getByRole('link').getAttribute('href')).toBe('/lecturer/courses/c1/assignments/a1/submissions');
    // A draft is not an answer waiting.
    expect(screen.queryByRole('link', { name: 'Grade answer from Yaw Darko' })).toBeNull();
  });

  it('filters by course when there is more than one', async () => {
    api.fetchGradingQueue.mockResolvedValue([
      queue({}),
      queue({ course_id: 'c2', course_title: 'Principles of Discipleship', course_code: 'DIS201', assignment_id: 'a2', learner_id: 'l2', first_name: 'Abena' }),
    ]);
    renderAt(<ToGradePage />);
    expect(await screen.findByText('2 answers waiting in 2 assignments')).toBeTruthy();
    expect(screen.getByLabelText('Course')).toBeTruthy();
  });

  it('says when there is nothing to grade', async () => {
    api.fetchGradingQueue.mockResolvedValue([]);
    renderAt(<ToGradePage />);
    expect(await screen.findByText('Nothing to grade')).toBeTruthy();
  });

  it('offers Retry when the list cannot be loaded', async () => {
    api.fetchGradingQueue.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    renderAt(<ToGradePage />);
    expect(await screen.findByText('The answers to grade could not be loaded')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Retry|Try again/ }));
    await waitFor(() => expect(api.fetchGradingQueue).toHaveBeenCalledTimes(2));
  });
});

describe('Grades and feedback', () => {
  /** @param {Partial<import('@/lib/grading/grading.js').MyGradeRow>} over @returns {import('@/lib/grading/grading.js').MyGradeRow} */
  const mine = (over) => ({
    course_id: 'c1',
    course_title: 'Introduction to Biblical Studies',
    course_code: 'BIB101',
    assignment_id: 'a1',
    assignment_title: 'Covenant essay',
    due_at: '2030-01-20T23:59:00Z',
    max_marks: 20,
    state: 'RELEASED',
    score: 15.5,
    percentage: 77.5,
    letter_grade: 'B',
    band: '70-79%',
    passed: true,
    feedback: 'Good reading of the text.',
    released_at: '2030-01-21T11:00:00Z',
    updated: true,
    submitted_at: '2030-01-18T10:00:00Z',
    current_version: 1,
    ...over,
  });

  it('shows released grades with their figures and feedback, and awaiting answers without a score, course by course', async () => {
    api.fetchMyGrades.mockResolvedValue([
      mine({}),
      mine({ assignment_id: 'a2', assignment_title: 'Reflection on Genesis 1', state: 'AWAITING', score: null, percentage: null, letter_grade: null, band: null, feedback: null, released_at: null, updated: false }),
      mine({ course_id: 'c2', course_title: 'Principles of Discipleship', course_code: 'DIS201', assignment_id: 'a3', assignment_title: 'Prayer journal', score: 9, percentage: 45, letter_grade: 'F', band: '0-49%', passed: false, updated: false, feedback: null }),
    ]);
    renderAt(<LearnerGradesPage />);
    expect(await screen.findByRole('heading', { name: /Introduction to Biblical Studies/ })).toBeTruthy();
    await screen.findByText('Awaiting grade');
    expect(screen.getByRole('heading', { name: /Principles of Discipleship/ })).toBeTruthy();
    expect(screen.getByText('15.5 / 20')).toBeTruthy();
    expect(screen.getByText('Grade B')).toBeTruthy();
    expect(screen.getByText('Updated')).toBeTruthy();
    expect(screen.getByText('Good reading of the text.')).toBeTruthy();
    expect(screen.getByText('Awaiting grade')).toBeTruthy();
    expect(screen.getByText('Grade F')).toBeTruthy();
    const rows = screen.getAllByRole('link');
    expect(rows[0].getAttribute('href')).toBe('/learner/courses/c1/assignments/a1');
  });

  it('says when there are no grades yet', async () => {
    api.fetchMyGrades.mockResolvedValue([]);
    renderAt(<LearnerGradesPage />);
    expect(await screen.findByText('No grades yet')).toBeTruthy();
  });
});
