// @vitest-environment jsdom
// Phase 9 grading screens (D14 to D16, D30; owner decisions 1 to 3, 6 and 7 of 2026-11-09):
// - the grading panel checks the marks (0 to maximum, at most two decimals) before sending;
// - a released grade changes only with a reason;
// - Save draft and Release grade say what happened with the listed toasts;
// - reopening needs a reason;
// - releasing an assignment asks first;
// - the counts show what the database counted;
// - the learner's card shows only what the database computed;
// - "New grade available" is announced once per tab.
// The server rules are tested in pgTAP 19 and 20.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GradeNotices } from '@/components/grading/GradeNotices.jsx';
import { GradingPanel } from '@/components/grading/GradingPanel.jsx';
import { LearnerGradeCard } from '@/components/grading/LearnerGradeCard.jsx';
import { ReleaseAllDialog } from '@/components/grading/ReleaseAllDialog.jsx';
import { ResultCounts } from '@/components/grading/ResultCounts.jsx';
import { formatPercentage, formatScore, gradeState } from '@/lib/grading/grading.js';
import { TOASTS } from '@/lib/toast/catalogue.js';

const toast = vi.hoisted(() => ({ show: vi.fn() }));
const api = vi.hoisted(() => ({ saveGrade: vi.fn(), releaseGrades: vi.fn(), reopenGrade: vi.fn(), fetchUnreadGradeNotifications: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));
vi.mock('react-router', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => navigate }));
vi.mock('@/lib/grading/grading.js', async (importOriginal) => ({
  ...(await importOriginal()),
  saveGrade: (/** @type {any} */ g) => api.saveGrade(g),
  releaseGrades: (/** @type {any} */ r) => api.releaseGrades(r),
  reopenGrade: (/** @type {any} */ r) => api.reopenGrade(r),
  fetchUnreadGradeNotifications: () => api.fetchUnreadGradeNotifications(),
}));

/** @param {any} [grade] @param {any} [over] */
const review = (grade = null, over = {}) =>
  /** @type {any} */ ({
    learner: { id: 'l1', first_name: 'Kwame', second_name: 'Mensah', id_number: 123456, branch_name: 'Kumasi', profile_image_path: null },
    due_at: '2030-01-20T23:59:00Z',
    extended_due_at: null,
    extension_reason: null,
    effective_due_at: '2030-01-20T23:59:00Z',
    status: grade ? 'GRADED' : 'SUBMITTED',
    current_version: 1,
    is_late: false,
    max_marks: 20,
    grade,
    history: [],
    versions: [],
    ...over,
  });
const released = {
  score: 16,
  feedback: 'Good reading of the text.',
  percentage: 80,
  letter_grade: 'A',
  band: '80-89%',
  grade_release_status: 'RELEASED',
  graded_at: '2030-01-21T10:00:00Z',
  graded_by_name: 'Ama Boateng',
  released_at: '2030-01-21T11:00:00Z',
  released_score: 16,
  released_feedback: 'Good reading of the text.',
  changed_since_release: false,
};

/** @param {any} r @param {{ readOnly?: boolean }} [o] */
function renderPanel(r, { readOnly = false } = {}) {
  const onChanged = vi.fn();
  render(<GradingPanel assignmentId="a1" learnerId="l1" learnerName="Kwame Mensah" review={r} readOnly={readOnly} onChanged={onChanged} />);
  return { onChanged };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.saveGrade.mockResolvedValue({ submissionId: 's1', changed: true, gradeReleaseStatus: 'DRAFT' });
  api.releaseGrades.mockResolvedValue({ released: 1 });
  api.reopenGrade.mockResolvedValue({ reopened: true });
});

describe('labels and figures', () => {
  it('names each grade state (never colour alone)', () => {
    const base = { status: /** @type {const} */ ('GRADED'), score: 15, released_at: null, changed_since_release: false };
    expect(gradeState({ ...base, status: 'SUBMITTED', score: null, grade_release_status: 'DRAFT' }).label).toBe('Ungraded');
    expect(gradeState({ ...base, grade_release_status: 'DRAFT' }).label).toBe('Draft grade');
    expect(gradeState({ ...base, grade_release_status: 'RELEASED', released_at: 'x' }).label).toBe('Released');
    expect(gradeState({ ...base, grade_release_status: 'DRAFT', released_at: 'x', changed_since_release: true }).label).toBe('Changed, not released');
    expect(gradeState({ ...base, status: 'REOPENED', grade_release_status: 'RELEASED' }).label).toBe('Reopened');
  });

  it('shows the database\'s numbers without trailing zeros', () => {
    expect(formatScore(15.5, 20)).toBe('15.5 / 20');
    expect(formatScore(16, 20)).toBe('16 / 20');
    expect(formatScore(null, 20)).toBe('—');
    expect(formatPercentage(77.5)).toBe('77.5%');
    expect(formatPercentage(80)).toBe('80%');
  });

  it('says "1 learner" for one release and "N learners" otherwise', () => {
    expect(TOASTS['lecturer.grades-released'].text({ n: '1' })).toBe('Grades released to 1 learner');
    expect(TOASTS['lecturer.grades-released'].text({ n: '12' })).toBe('Grades released to 12 learners');
  });
});

describe('the grading panel', () => {
  it('checks the marks before sending anything', async () => {
    renderPanel(review());
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Enter a score from 0 to 20')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Marks'), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Enter a score from 0 to 20')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Marks'), { target: { value: '12.345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Use at most two decimals')).toBeTruthy();
    expect(api.saveGrade).not.toHaveBeenCalled();
  });

  it('saves a draft grade with trimmed feedback and says so', async () => {
    const { onChanged } = renderPanel(review());
    fireEvent.change(screen.getByLabelText('Marks'), { target: { value: '15,5' } });
    fireEvent.change(screen.getByLabelText('Feedback (optional)'), { target: { value: '  Good reading.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.saveGrade).toHaveBeenCalledWith({ assignmentId: 'a1', learnerId: 'l1', score: 15.5, feedback: 'Good reading.', reason: undefined }));
    expect(toast.show).toHaveBeenCalledWith('lecturer.grade-draft-saved');
    expect(onChanged).toHaveBeenCalled();
  });

  it('a released grade changes only with a reason, which goes with the change', async () => {
    renderPanel(review(released));
    expect(screen.getByText('Released')).toBeTruthy();
    expect(screen.queryByLabelText('Reason for the change')).toBeNull();
    fireEvent.change(screen.getByLabelText('Marks'), { target: { value: '17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Give a reason for changing a released grade')).toBeTruthy();
    expect(api.saveGrade).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'Marked the second part again' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.saveGrade).toHaveBeenCalledWith(expect.objectContaining({ score: 17, reason: 'Marked the second part again' })));
  });

  it('Release grade saves what was typed, then releases it to the learner', async () => {
    renderPanel(review());
    fireEvent.change(screen.getByLabelText('Marks'), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Release grade' }));
    await waitFor(() => expect(api.releaseGrades).toHaveBeenCalledWith({ assignmentId: 'a1', learnerId: 'l1' }));
    expect(api.saveGrade).toHaveBeenCalledBefore(api.releaseGrades);
    expect(toast.show).toHaveBeenCalledWith('lecturer.grades-released', { params: { n: '1' } });
  });

  it('shows the percentage, letter grade and band the database computed, and what the learner sees', () => {
    renderPanel(review({ ...released, score: 17, percentage: 85, grade_release_status: 'DRAFT', changed_since_release: true }));
    expect(screen.getByTestId('grade-facts').textContent).toBe('Saved: 17 / 20 · 85% · A · band 80-89%');
    expect(screen.getByText(/The learner sees/).textContent).toContain('16 / 20');
    expect(screen.getByText('Changed, not released')).toBeTruthy();
  });

  it('reopening needs a reason', async () => {
    const { onChanged } = renderPanel(review(released));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen grade' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reopen grade for Kwame Mensah' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reopen grade' }));
    expect(await screen.findByText('Give a reason for reopening')).toBeTruthy();
    expect(api.reopenGrade).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'The recording did not play' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reopen grade' }));
    await waitFor(() => expect(api.reopenGrade).toHaveBeenCalledWith({ assignmentId: 'a1', learnerId: 'l1', reason: 'The recording did not play' }));
    expect(toast.show).toHaveBeenCalledWith('lecturer.submission-reopened');
    expect(onChanged).toHaveBeenCalled();
  });

  it('nothing to grade before an answer is sent', () => {
    renderPanel(review(null, { status: null }));
    expect(screen.getByText('There is nothing to grade until Kwame Mensah sends an answer.')).toBeTruthy();
  });

  it('an archived course shows the grade read-only', () => {
    renderPanel(review(released), { readOnly: true });
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.getByText('This course is archived, so grades can no longer change.')).toBeTruthy();
  });
});

describe('releasing a whole assignment', () => {
  it('asks first, then says how many learners got their grade', async () => {
    api.releaseGrades.mockResolvedValue({ released: 3 });
    const onReleased = vi.fn();
    render(<ReleaseAllDialog assignmentId="a1" drafts={3} onClose={vi.fn()} onReleased={onReleased} />);
    expect(screen.getByRole('alertdialog', { name: 'Release 3 grades?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Release grades' }));
    await waitFor(() => expect(api.releaseGrades).toHaveBeenCalledWith({ assignmentId: 'a1' }));
    expect(toast.show).toHaveBeenCalledWith('lecturer.grades-released', { params: { n: '3' } });
    expect(onReleased).toHaveBeenCalled();
  });

  it('shows the server\'s reason when release is refused', async () => {
    api.releaseGrades.mockRejectedValue(new Error('Category weights must total 100 before grades can be released'));
    render(<ReleaseAllDialog assignmentId="a1" drafts={2} onClose={vi.fn()} onReleased={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Release grades' }));
    expect(await screen.findByText('Category weights must total 100 before grades can be released')).toBeTruthy();
  });
});

describe('counts and the learner\'s grade', () => {
  it('shows the six counts as the database counted them', () => {
    render(<ResultCounts counts={{ enrolled: 8, submitted: 3, graded: 1, ungraded: 2, not_yet_due: 1, missing: 4, released: 0, withdrawn_submitted: 1 }} />);
    const value = (/** @type {string} */ id) => screen.getByTestId(id).textContent;
    expect([value('count-enrolled'), value('count-submitted'), value('count-graded'), value('count-ungraded'), value('count-missing'), value('count-not-yet-due')]).toEqual([
      '8',
      '3',
      '1',
      '2',
      '4',
      '1',
    ]);
    expect(screen.getByText('0 released')).toBeTruthy();
  });

  it('the learner sees the released grade with feedback, and "Updated" after a change', () => {
    render(
      <LearnerGradeCard
        grade={{ score: 17, max_marks: 20, percentage: 85, letter_grade: 'A', band: '80-89%', passed: true, feedback: 'Well argued.', released_at: '2030-01-21T11:00:00Z', updated: true }}
      />,
    );
    expect(screen.getByText('17 / 20')).toBeTruthy();
    expect(screen.getByText('85%')).toBeTruthy();
    expect(screen.getByText('Grade A')).toBeTruthy();
    expect(screen.getByText('Band 80-89%')).toBeTruthy();
    expect(screen.getByText('Well argued.')).toBeTruthy();
    expect(screen.getByText('Updated')).toBeTruthy();
  });
});

describe('"New grade available" (owner decision 1)', () => {
  const note = { id: 'n1', notification_type: 'GRADE_RELEASED', title: 'New grade available', message: 'x', related_entity_id: 'a1', link_path: '/learner/courses/c1/assignments/a1', created_at: 'x' };

  it('is announced once per tab, and View opens the assignment', async () => {
    api.fetchUnreadGradeNotifications.mockResolvedValue([note]);
    const first = render(
      <MemoryRouter>
        <GradeNotices />
      </MemoryRouter>,
    );
    await waitFor(() => expect(toast.show).toHaveBeenCalledTimes(1));
    expect(toast.show.mock.calls[0][0]).toBe('learner.grade-released');
    toast.show.mock.calls[0][1].onAction();
    expect(navigate).toHaveBeenCalledWith('/learner/courses/c1/assignments/a1');
    first.unmount();
    render(
      <MemoryRouter>
        <GradeNotices />
      </MemoryRouter>,
    );
    await waitFor(() => expect(api.fetchUnreadGradeNotifications).toHaveBeenCalledTimes(2));
    expect(toast.show).toHaveBeenCalledTimes(1);
  });

  it('says nothing when there is nothing new, or when the check fails', async () => {
    api.fetchUnreadGradeNotifications.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline'));
    render(
      <MemoryRouter>
        <GradeNotices />
      </MemoryRouter>,
    );
    render(
      <MemoryRouter>
        <GradeNotices />
      </MemoryRouter>,
    );
    await waitFor(() => expect(api.fetchUnreadGradeNotifications).toHaveBeenCalledTimes(2));
    expect(toast.show).not.toHaveBeenCalled();
  });
});
