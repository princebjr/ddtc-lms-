// @vitest-environment jsdom
// Phase 10.1, step D screens (ADR-016; owner request and answers of 2026-11-10):
// - the learner's examination: the deadline in Ghana time and no countdown; Start; answers saved
//   automatically (a saving indicator), kept on the device while offline; Review and submit with a
//   confirmation; the released result;
// - the examination builder checks four options and a correct answer before saving;
// - results grouped by branch, with pass or fail and Release results (N);
// - the managers' status labels.
// The rules are tested in pgTAP 25 to 27 and tests/functions/examinations.test.js.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { examStatus } from '@/lib/exams/exams.js';
import ExamEditorPage from '@/pages/courses/ExamEditorPage.jsx';
import ExamResultsPage from '@/pages/courses/ExamResultsPage.jsx';
import LearnerExamPage from '@/pages/learner/LearnerExamPage.jsx';

const api = vi.hoisted(() => ({
  fetchMyExam: vi.fn(),
  fetchExamAudio: vi.fn(),
  startExam: vi.fn(),
  saveExamAnswers: vi.fn(),
  submitExam: vi.fn(),
  fetchExamForEditing: vi.fn(),
  saveExamStructure: vi.fn(),
  fetchExamResults: vi.fn(),
  releaseExam: vi.fn(),
}));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));
vi.mock('@/hooks/use-profile-image.js', () => ({ useProfileImage: () => null }));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/components/auth/AuthProvider.jsx', () => ({ useAuth: () => ({ profile: { id: 'me', first_name: 'Kwame' } }) }));
vi.mock('@/lib/exams/exams.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchMyExam: (/** @type {string} */ id) => api.fetchMyExam(id),
  fetchExamAudio: () => api.fetchExamAudio(),
  startExam: (/** @type {string} */ id) => api.startExam(id),
  saveExamAnswers: (/** @type {any[]} */ ...a) => api.saveExamAnswers(...a),
  submitExam: (/** @type {string} */ id) => api.submitExam(id),
  fetchExamForEditing: (/** @type {string} */ id) => api.fetchExamForEditing(id),
  saveExamStructure: (/** @type {any[]} */ ...a) => api.saveExamStructure(...a),
  fetchExamResults: (/** @type {string} */ id) => api.fetchExamResults(id),
  releaseExam: (/** @type {any[]} */ ...a) => api.releaseExam(...a),
}));

/** @param {Partial<import('@/lib/exams/exams.js').MyExam>} over @returns {import('@/lib/exams/exams.js').MyExam} */
const exam = (over) => ({
  id: 'e1',
  course_id: 'c1',
  title: 'Final examination',
  description: 'End of course.',
  instructions: 'Answer every question.',
  opens_at: '2030-01-10T09:00:00Z',
  closes_at: '2030-01-20T23:59:00Z',
  total_marks: 13,
  pass_mark: 50,
  state: 'OPEN',
  attempt_number: null,
  submitted_at: null,
  sections: null,
  result: null,
  ...over,
});
const sections = [
  {
    id: 's1',
    title: 'Section A: Multiple choice',
    instructions: '',
    questions: [{ id: 'q1', kind: /** @type {const} */ ('MCQ'), prompt: 'Who led Israel out of Egypt?', marks: 2, options: { A: 'Aaron', B: 'Moses', C: 'Joshua', D: 'Samuel' }, answer: {} }],
  },
  { id: 's2', title: 'Section B: Essay', instructions: '', questions: [{ id: 'q2', kind: /** @type {const} */ ('ESSAY'), prompt: 'Discuss the covenant.', marks: 11, options: null, answer: {} }] },
];

const learnerPage = () =>
  render(
    <MemoryRouter initialEntries={['/learner/courses/c1/exams/e1']}>
      <Routes>
        <Route path="/learner/courses/:courseId/exams/:examId" element={<LearnerExamPage />} />
      </Routes>
    </MemoryRouter>,
  );

/**
 * Waits until loading is over for good: under load the skeleton can appear just after a first paint
 * (150 ms delay) and then stays at least 300 ms, so wait out that window before requiring nothing to load.
 */
const settled = async () => {
  await act(() => new Promise((r) => setTimeout(r, 500)));
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.fetchExamAudio.mockResolvedValue([]);
});
afterEach(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

describe("the learner's examination", () => {
  it('shows the deadline in Ghana time and no countdown, and starts', async () => {
    api.fetchMyExam.mockResolvedValue(exam({}));
    api.startExam.mockResolvedValue({ attemptId: 'a1' });
    learnerPage();
    await waitFor(() => expect(screen.getByTestId('exam-deadline').textContent).toMatch(/\(Ghana time\)$/));
    await settled();
    expect(screen.getByText('There is no time limit. Work at your own pace and submit before the deadline.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/time (left|remaining)|countdown/i);
    fireEvent.click(screen.getByRole('button', { name: 'Start examination' }));
    await waitFor(() => expect(api.startExam).toHaveBeenCalledWith('e1'));
  });

  it('saves a choice automatically and says so', async () => {
    api.fetchMyExam.mockResolvedValue(exam({ state: 'IN_PROGRESS', sections }));
    api.saveExamAnswers.mockResolvedValue({ savedAt: '2030-01-11T10:15:00Z' });
    learnerPage();
    await screen.findAllByLabelText('B. Moses');
    await settled();
    fireEvent.click(screen.getByLabelText('B. Moses'));
    expect(screen.getByTestId('save-state').textContent).toBe('Saving…');
    await waitFor(() => expect(api.saveExamAnswers).toHaveBeenCalledWith('e1', [{ questionId: 'q1', selectedOption: 'B' }]), { timeout: 4000 });
    await waitFor(() => expect(screen.getByTestId('save-state').textContent).toBe('All answers saved at 10:15'));
  });

  it('keeps answers on the device while offline and sends them when back online', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    api.fetchMyExam.mockResolvedValue(exam({ state: 'IN_PROGRESS', sections }));
    api.saveExamAnswers.mockResolvedValue({ savedAt: '2030-01-11T10:20:00Z' });
    learnerPage();
    await screen.findAllByLabelText('C. Joshua');
    await settled();
    fireEvent.click(screen.getByLabelText('C. Joshua'));
    await waitFor(() => expect(screen.getByTestId('save-state').textContent).toMatch(/You are offline/), { timeout: 4000 });
    expect(JSON.parse(window.localStorage.getItem('ddtc.exam.e1.me') ?? '{}')).toEqual({ q1: { selected_option: 'C' } });
    expect(api.saveExamAnswers).not.toHaveBeenCalled();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    await act(async () => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(api.saveExamAnswers).toHaveBeenCalledWith('e1', [{ questionId: 'q1', selectedOption: 'C' }]));
    await waitFor(() => expect(window.localStorage.getItem('ddtc.exam.e1.me')).toBeNull());
  });

  it('asks before submitting and then submits', async () => {
    api.fetchMyExam.mockResolvedValue(exam({ state: 'IN_PROGRESS', sections }));
    api.submitExam.mockResolvedValue({ attemptId: 'a1', submittedAt: '2030-01-11T11:00:00Z' });
    learnerPage();
    await screen.findAllByRole('button', { name: 'Review and submit' });
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Review and submit' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Submit your examination?' });
    expect(within(dialog).getByText('You have answered 0 of 2 questions. Once you submit, you cannot change your answers.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit examination' }));
    await waitFor(() => expect(api.submitExam).toHaveBeenCalledWith('e1'));
    expect(toast.show).toHaveBeenCalledWith('learner.exam-submitted');
  });

  it('shows the released result with its feedback', async () => {
    api.fetchMyExam.mockResolvedValue(
      exam({
        state: 'SUBMITTED',
        submitted_at: '2030-01-11T11:00:00Z',
        sections: [{ ...sections[1], questions: [{ ...sections[1].questions[0], answer: { text_answer: 'Covenant runs through Genesis.', score: 9, feedback: 'Thoughtful.' } }] }],
        result: { attempt_number: 1, total_score: 11, total_marks: 13, percentage: 84.6, letter_grade: 'A', passed: true, feedback: 'Well done.', released_at: '2030-01-15T10:00:00Z' },
      }),
    );
    learnerPage();
    await waitFor(() => expect(screen.getByTestId('exam-result').textContent).toBe('11 / 13 · 84.6%')); // no letter on one examination (Step 10.2)
    expect(screen.getByText('Pass')).toBeTruthy();
    expect(screen.getByText('Well done.')).toBeTruthy();
    expect(screen.getByText('Feedback: Thoughtful.')).toBeTruthy();
    expect(screen.getByText('9 / 11')).toBeTruthy();
  });
});

describe('the examination builder', () => {
  it('checks four options and the correct answer before saving the questions', async () => {
    api.fetchExamForEditing.mockResolvedValue({
      exam: { id: 'e1', course_id: 'c1', title: 'Final examination', description: '', instructions: '', pass_mark: 50, opens_at: '2030-01-10T09:00:00Z', closes_at: '2030-01-20T23:59:00Z', closed_at: null, publication_status: 'DRAFT', archived_at: null },
      sections: [],
      started: false,
    });
    api.saveExamStructure.mockResolvedValue({ questions: 1 });
    render(
      <MemoryRouter initialEntries={['/lecturer/courses/c1/exams/e1']}>
        <Routes>
          <Route path="/lecturer/courses/:courseId/exams/:examId" element={<ExamEditorPage role="lecturer" />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findAllByRole('button', { name: 'Add multiple choice' });
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Add multiple choice' }));
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Who led Israel out of Egypt?' } });
    for (const [o, v] of [['A', 'Aaron'], ['B', 'Moses'], ['C', 'Joshua']]) fireEvent.change(screen.getByLabelText(o), { target: { value: v } });
    fireEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    expect(await screen.findByText('Section A, question 1: give all four options, A to D')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('D'), { target: { value: 'Samuel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    expect(await screen.findByText('Section A, question 1: choose the correct answer')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Option B is correct' }));
    expect(screen.getByText('Total 1 marks')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    await waitFor(() => expect(api.saveExamStructure).toHaveBeenCalled());
    const [examId, saved] = api.saveExamStructure.mock.calls[0];
    expect(examId).toBe('e1');
    expect(saved[0].questions[0]).toMatchObject({ kind: 'MCQ', correct: 'B', options: { A: 'Aaron', B: 'Moses', C: 'Joshua', D: 'Samuel' } });
  });
});

describe('examination results', () => {
  it('are grouped by branch with pass or fail, and release the fully marked results', async () => {
    /** @param {Partial<import('@/lib/exams/exams.js').ExamResult>} over */
    const row = (over) => ({
      learner_id: 'l1', first_name: 'Kwame', second_name: 'Mensah', id_number: 123456, branch_name: 'Sampa', profile_image_path: null,
      attempt_number: 1, state: 'SUBMITTED', submitted_at: '2030-01-11T11:00:00Z', closes_at: '2030-01-20T23:59:00Z',
      mcq_score: 2, short_score: 4, essay_score: 9, total_score: 15, total_marks: 20, percentage: 75, passed: true, feedback: null,
      grading_state: 'GRADED', grade_release_status: 'DRAFT', released_at: null, released_score: null, changed_since_release: false, ...over,
    });
    api.fetchExamForEditing.mockResolvedValue({
      exam: { id: 'e1', course_id: 'c1', title: 'Final examination', description: '', instructions: '', pass_mark: 50, opens_at: '2030-01-10T09:00:00Z', closes_at: '2030-01-20T23:59:00Z', closed_at: null, publication_status: 'PUBLISHED', archived_at: null },
      sections: [],
      started: true,
    });
    api.fetchExamResults.mockResolvedValue([
      row({}),
      row({ learner_id: 'l2', first_name: 'Abena', second_name: 'Frimpong', branch_name: 'Kasoa C.P', total_score: 8, percentage: 40, passed: false, grading_state: 'PARTLY' }),
    ]);
    api.releaseExam.mockResolvedValue({ released: 1 });
    render(
      <MemoryRouter initialEntries={['/lecturer/courses/c1/exams/e1/results']}>
        <Routes>
          <Route path="/lecturer/courses/:courseId/exams/:examId/results" element={<ExamResultsPage role="lecturer" />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Kasoa C.P, 1 learner', 'Sampa, 1 learner']));
    expect(screen.getAllByText('75% · Pass').length).toBeGreaterThan(0);
    expect(screen.getAllByText('40% · Fail').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Release results (1)' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Release results' }));
    await waitFor(() => expect(api.releaseExam).toHaveBeenCalledWith('e1'));
    expect(toast.show).toHaveBeenCalledWith('lecturer.grades-released', { params: { n: '1' } });
  });

  it('labels where an examination stands', () => {
    const base = { id: 'e', course_id: 'c', title: 't', description: '', instructions: '', pass_mark: 50, closed_at: null, archived_at: null };
    const now = new Date('2030-01-15T12:00:00Z');
    expect(examStatus({ ...base, publication_status: 'DRAFT', opens_at: '2030-01-10T09:00:00Z', closes_at: '2030-01-20T23:59:00Z' }, now).label).toBe('Draft');
    expect(examStatus({ ...base, publication_status: 'PUBLISHED', opens_at: '2030-01-10T09:00:00Z', closes_at: '2030-01-20T23:59:00Z' }, now).label).toBe('Open');
    expect(examStatus({ ...base, publication_status: 'PUBLISHED', opens_at: '2030-01-16T09:00:00Z', closes_at: '2030-01-20T23:59:00Z' }, now).label).toBe('Published, opens later');
    expect(examStatus({ ...base, publication_status: 'PUBLISHED', opens_at: '2030-01-10T09:00:00Z', closes_at: '2030-01-14T23:59:00Z' }, now).label).toBe('Closed');
  });
});
