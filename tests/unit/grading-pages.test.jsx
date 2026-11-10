// @vitest-environment jsdom
// Step 9.1: the lecturer's "To grade" and the learner's "Grades and feedback" (navigation pages promised
// for Phase 9). To grade lists the answers waiting (oldest first, Late and Reopened marked), each with
// Grade opening the grading screen, and the draft grades not released per assignment; a course filter
// appears with more than one course. The database rules are tested in pgTAP 21. Grades and feedback
// became one gradebook per course in Phase 10 (owner request 2026-11-10); its checks, the released score
// with feedback and "Awaiting grade" without a score included, are in gradebook.test.jsx.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    // Retried until the content has settled: under load the skeleton can take over for its 300 ms
    // just after a first paint of the content.
    await waitFor(() => {
      const grade = screen.getAllByRole('link', { name: 'Grade answer from Kwame Mensah' })[0];
      expect(grade.getAttribute('href')).toBe('/lecturer/courses/c1/assignments/a1/submissions/l1');
      expect(screen.getAllByText('Reopened').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Late').length).toBeGreaterThan(0);
      const drafts = screen.getByRole('list', { name: 'Draft grades not released' });
      expect(within(drafts).getByText('2 draft grades')).toBeTruthy();
      expect(within(drafts).getByRole('link').getAttribute('href')).toBe('/lecturer/courses/c1/assignments/a1/submissions');
      // A draft is not an answer waiting.
      expect(screen.queryByRole('link', { name: 'Grade answer from Yaw Darko' })).toBeNull();
    });
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
