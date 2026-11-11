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
  fetchExamFiles: vi.fn(),
  uploadFile: vi.fn(),
  startExam: vi.fn(),
  saveExamAnswers: vi.fn(),
  submitExam: vi.fn(),
  fetchExamForEditing: vi.fn(),
  saveExamStructure: vi.fn(),
  saveExam: vi.fn(),
  fetchExamResults: vi.fn(),
  releaseExam: vi.fn(),
  documentUrl: vi.fn(),
}));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/lib/uploads.js', () => ({ uploadFile: (/** @type {any} */ o) => api.uploadFile(o) }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));
vi.mock('@/hooks/use-profile-image.js', () => ({ useProfileImage: () => null }));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/components/auth/AuthProvider.jsx', () => ({ useAuth: () => ({ profile: { id: 'me', first_name: 'Kwame' } }) }));
vi.mock('@/lib/exams/exams.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchMyExam: (/** @type {string} */ id) => api.fetchMyExam(id),
  fetchExamFiles: () => api.fetchExamFiles(),
  startExam: (/** @type {string} */ id) => api.startExam(id),
  saveExamAnswers: (/** @type {any[]} */ ...a) => api.saveExamAnswers(...a),
  submitExam: (/** @type {string} */ id) => api.submitExam(id),
  fetchExamForEditing: (/** @type {string} */ id) => api.fetchExamForEditing(id),
  saveExamStructure: (/** @type {any[]} */ ...a) => api.saveExamStructure(...a),
  saveExam: (/** @type {any[]} */ ...a) => api.saveExam(...a),
  fetchExamResults: (/** @type {string} */ id) => api.fetchExamResults(id),
  releaseExam: (/** @type {any[]} */ ...a) => api.releaseExam(...a),
  documentUrl: (/** @type {any[]} */ ...a) => api.documentUrl(...a),
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
  api.fetchExamFiles.mockResolvedValue([]);
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

  it('offers Record (red border), Upload an audio file and Upload a PDF or Word file, and saves the document', async () => {
    api.fetchMyExam.mockResolvedValue(exam({ state: 'IN_PROGRESS', sections }));
    api.saveExamAnswers.mockResolvedValue({ savedAt: '2030-01-11T10:15:00Z' });
    api.uploadFile.mockResolvedValue({ fileId: 'f-doc' });
    learnerPage();
    await screen.findAllByRole('tab');
    await settled();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Section B/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Section B/ }));
    const record = await screen.findByRole('button', { name: 'Record your answer' });
    expect(record.className).toMatch(/border-error/);
    expect(screen.getByRole('button', { name: 'Upload an audio file' })).toBeTruthy();
    expect(screen.getByTestId('exam-audio-input').getAttribute('accept')).toMatch(/audio/);
    expect(screen.getByTestId('exam-document-input').getAttribute('accept')).toMatch(/.pdf,.docx/);
    const file = new File(['%PDF-1.4'], 'covenant.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('exam-document-input'), { target: { files: [file] } });
    await waitFor(() => expect(api.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'EXAM_ANSWER_DOCUMENT', examId: 'e1', questionId: 'q2', file })));
    await screen.findByText('Document attached: covenant.pdf');
    await waitFor(() => expect(api.saveExamAnswers).toHaveBeenCalledWith('e1', [{ questionId: 'q2', documentFileId: 'f-doc' }]), { timeout: 4000 });
    expect(screen.queryByRole('button', { name: 'Upload a PDF or Word file' })).toBeNull();
  });

  // Owner request of 2026-11-11 (ADR-020 item 10): up to three recordings or audio files on one answer,
  // each replaceable in place and removable.
  it('takes up to three audio answers, replaces one in place and removes one', async () => {
    api.fetchMyExam.mockResolvedValue(exam({ state: 'IN_PROGRESS', sections }));
    api.saveExamAnswers.mockResolvedValue({ savedAt: '2030-01-11T10:15:00Z' });
    for (const id of ['a1', 'a2', 'a3', 'a4']) api.uploadFile.mockResolvedValueOnce({ fileId: id, bucket: 'learner-submissions', storagePath: `exams/e1/me/t1/${id}.m4a` });
    learnerPage();
    await screen.findAllByRole('tab');
    await settled();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Section B/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Section B/ }));
    await screen.findByRole('button', { name: 'Record your answer' });
    const audio = (/** @type {string} */ name) => new File(['x'], name, { type: 'audio/mp4' });

    fireEvent.change(screen.getByTestId('exam-audio-input'), { target: { files: [audio('one.m4a')] } });
    await waitFor(() => expect(screen.getAllByTestId('exam-audio-item')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Record another answer' })).toBeTruthy();
    fireEvent.change(screen.getByTestId('exam-audio-input'), { target: { files: [audio('two.m4a')] } });
    await waitFor(() => expect(screen.getAllByTestId('exam-audio-item')).toHaveLength(2));
    fireEvent.change(screen.getByTestId('exam-audio-input'), { target: { files: [audio('three.m4a')] } });
    await waitFor(() => expect(screen.getAllByTestId('exam-audio-item')).toHaveLength(3));
    expect(api.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'EXAM_ANSWER_AUDIO', examId: 'e1', questionId: 'q2' }));

    // Full: no way to add a fourth, and the page says why.
    expect(screen.queryByRole('button', { name: /Record another answer|Record your answer/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Upload another audio file|Upload an audio file/ })).toBeNull();
    expect(screen.getByText(/You have added 3 audio answers, the most one answer can hold/)).toBeTruthy();
    await waitFor(() => expect(api.saveExamAnswers).toHaveBeenLastCalledWith('e1', [{ questionId: 'q2', audioFileIds: ['a1', 'a2', 'a3'] }]), { timeout: 4000 });

    // Replace the second: the new audio takes its place.
    fireEvent.click(screen.getByRole('button', { name: 'Replace audio answer 2' }));
    expect(screen.getByText('Being replaced')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record the replacement' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload the replacement' })).toBeTruthy();
    fireEvent.change(screen.getByTestId('exam-audio-input'), { target: { files: [audio('four.m4a')] } });
    await waitFor(() => expect(api.saveExamAnswers).toHaveBeenLastCalledWith('e1', [{ questionId: 'q2', audioFileIds: ['a1', 'a4', 'a3'] }]), { timeout: 4000 });
    expect(screen.getAllByTestId('exam-audio-item')).toHaveLength(3);
    expect(screen.queryByText('Being replaced')).toBeNull();

    // Remove the first: two are left, and another may be added again.
    fireEvent.click(screen.getByRole('button', { name: 'Remove audio answer 1' }));
    await waitFor(() => expect(api.saveExamAnswers).toHaveBeenLastCalledWith('e1', [{ questionId: 'q2', audioFileIds: ['a4', 'a3'] }]), { timeout: 4000 });
    expect(screen.getAllByTestId('exam-audio-item')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Record another answer' })).toBeTruthy();
  }, 30_000); // three autosaves, each after its own pause

  it('opens the recordings a learner already saved, and reads an older single-recording draft as a list', async () => {
    window.localStorage.setItem('ddtc.exam.e1.me', JSON.stringify({ q2: { audio_file_id: 'old1' } }));
    api.fetchMyExam.mockResolvedValue(exam({ state: 'IN_PROGRESS', sections }));
    api.saveExamAnswers.mockResolvedValue({ savedAt: '2030-01-11T10:15:00Z' });
    learnerPage();
    await screen.findAllByRole('tab');
    await settled();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Section B/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Section B/ }));
    await waitFor(() => expect(screen.getAllByTestId('exam-audio-item')).toHaveLength(1));
    window.localStorage.removeItem('ddtc.exam.e1.me');
  });

  // Owner report of 2026-11-11: Open did nothing. The tab is opened inside the click (a tab opened after
  // waiting for the link is blocked as a pop-up) and then sent to the signed link; Download saves the file.
  it('opens an uploaded PDF in a new tab at once, and offers Download; a Word file is downloaded', async () => {
    api.fetchMyExam.mockResolvedValue(exam({ state: 'IN_PROGRESS', sections }));
    api.saveExamAnswers.mockResolvedValue({ savedAt: '2030-01-11T10:15:00Z' });
    api.uploadFile.mockResolvedValueOnce({ fileId: 'f-pdf', bucket: 'learner-submissions', storagePath: 'exams/e1/me/t1/f-pdf.pdf', mimeType: 'application/pdf' });
    /** @type {(url: string) => void} */
    let deliver = () => undefined;
    api.documentUrl.mockImplementation(() => new Promise((resolve) => (deliver = resolve)));
    const tab = { opener: /** @type {unknown} */ ({}), close: vi.fn(), location: { replace: vi.fn() } };
    const open = vi.spyOn(window, 'open').mockReturnValue(/** @type {any} */ (tab));
    learnerPage();
    await screen.findAllByRole('tab');
    await settled();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Section B/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Section B/ }));
    await screen.findByRole('button', { name: 'Record your answer' });
    fireEvent.change(screen.getByTestId('exam-document-input'), { target: { files: [new File(['%PDF-1.4'], 'covenant.pdf', { type: 'application/pdf' })] } });

    const openButton = await screen.findByRole('button', { name: 'Open covenant.pdf' });
    expect(screen.getByRole('button', { name: 'Download covenant.pdf' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace document' })).toBeTruthy();
    fireEvent.click(openButton);
    // The tab exists before the link does.
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(tab.opener).toBeNull();
    expect(api.documentUrl).toHaveBeenCalledWith(expect.objectContaining({ file_id: 'f-pdf', bucket: 'learner-submissions' }), { download: false });
    await act(async () => deliver('https://files.test/signed-pdf'));
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith('https://files.test/signed-pdf'));

    // Replacing it with a Word file: no Open (a browser cannot show it), Download only.
    api.uploadFile.mockResolvedValueOnce({ fileId: 'f-docx', bucket: 'learner-submissions', storagePath: 'exams/e1/me/t1/f-docx.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    fireEvent.change(screen.getByTestId('exam-document-input'), { target: { files: [new File(['PK'], 'essay.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })] } });
    await screen.findByRole('button', { name: 'Download essay.docx' });
    expect(screen.queryByRole('button', { name: /^Open / })).toBeNull();
    open.mockRestore();
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
    await screen.findAllByRole('button', { name: 'Add multiple choice to Section A' });
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Add multiple choice to Section A' }));
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

// Step 11.2 (ADR-021; owner request and answer of 2026-11-11): the lecturer chooses the examination's types
// of question first; each section has one type from those; an older mixed section is split.
describe('examination types and one type per section', () => {
  /** @param {string} path */
  const editor = (path) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/lecturer/courses/:courseId/exams/:examId" element={<ExamEditorPage role="lecturer" />} />
        </Routes>
      </MemoryRouter>,
    );
  /** @param {object} over */
  const saved = (over) => ({
    exam: { id: 'e1', course_id: 'c1', title: 'Final examination', description: '', instructions: '', pass_mark: 50, opens_at: '2030-01-10T09:00:00Z', closes_at: '2030-01-20T23:59:00Z', closed_at: null, publication_status: 'DRAFT', archived_at: null, modes: ['MCQ', 'ESSAY'] },
    sections: [],
    started: false,
    ...over,
  });
  /** @param {'MCQ' | 'SHORT' | 'ESSAY'} kind @param {string} prompt */
  const question = (kind, prompt) => ({ kind, prompt, marks: '2', options: { A: 'w', B: 'x', C: 'y', D: 'z' }, correct: kind === 'MCQ' ? 'A' : '', guide: '' });

  it('a new examination needs at least one type, chosen by the lecturer', async () => {
    api.saveExam.mockResolvedValue({ examId: 'e9' });
    editor('/lecturer/courses/c1/exams/new');
    const create = await screen.findByRole('button', { name: 'Create examination' });
    for (const name of ['Multiple choice', 'Short answer', 'Essay']) expect(screen.getByRole('checkbox', { name }).getAttribute('aria-checked')).toBe('false');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Final examination' } });
    fireEvent.click(create);
    expect(await screen.findByText('Choose at least one type of question')).toBeTruthy();
    expect(api.saveExam).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Essay' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Multiple choice' }));
    fireEvent.click(create);
    await waitFor(() => expect(api.saveExam).toHaveBeenCalled());
    // Sent in the usual order, whatever order they were ticked in.
    expect(api.saveExam.mock.calls[0][0].fields.modes).toEqual(['MCQ', 'ESSAY']);
  });

  it('each section has one type from the examination\'s types, and only that kind of question is added', async () => {
    api.fetchExamForEditing.mockResolvedValue(saved({}));
    api.saveExamStructure.mockResolvedValue({ questions: 2 });
    editor('/lecturer/courses/c1/exams/e1');
    const first = await screen.findByLabelText('Type of question');
    await settled();
    expect(/** @type {HTMLSelectElement} */ (first).value).toBe('MCQ');
    expect(within(first).getAllByRole('option').map((o) => o.textContent)).toEqual(['Multiple choice', 'Essay']);
    expect(screen.queryByRole('button', { name: /Add short answer/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add essay/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add multiple choice to Section A' }));
    // With a question in it, the section's type is fixed until the question is removed.
    expect(/** @type {HTMLSelectElement} */ (screen.getAllByLabelText('Type of question')[0]).disabled).toBe(true);
    expect(screen.getByText("Remove this section's questions to change its type.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Who led Israel out of Egypt?' } });
    for (const o of ['A', 'B', 'C', 'D']) fireEvent.change(screen.getByLabelText(o), { target: { value: `Option ${o}` } });
    fireEvent.click(screen.getByRole('radio', { name: 'Option B is correct' }));

    // The next section starts with the type not used yet.
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
    expect(/** @type {HTMLSelectElement} */ (screen.getAllByLabelText('Type of question')[1]).value).toBe('ESSAY');
    fireEvent.click(screen.getByRole('button', { name: 'Add essay to Section B' }));
    fireEvent.change(screen.getAllByLabelText('Question')[1], { target: { value: 'Discuss the covenant.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    await waitFor(() => expect(api.saveExamStructure).toHaveBeenCalled());
    const sections = api.saveExamStructure.mock.calls[0][1];
    expect(sections.map((/** @type {any} */ x) => x.mode)).toEqual(['MCQ', 'ESSAY']);
    expect(sections.map((/** @type {any} */ x) => x.questions.map((/** @type {any} */ q) => q.kind))).toEqual([['MCQ'], ['ESSAY']]);
  });

  it('a section set before this step that mixes types is split before the questions are saved', async () => {
    api.fetchExamForEditing.mockResolvedValue(
      saved({ sections: [{ title: 'Section A', instructions: '', mode: null, questions: [question('MCQ', 'Pick one'), question('ESSAY', 'Write about covenant'), question('MCQ', 'Pick another')] }] }),
    );
    api.saveExamStructure.mockResolvedValue({ questions: 3 });
    editor('/lecturer/courses/c1/exams/e1');
    expect(await screen.findByText(/This section mixes types of question/)).toBeTruthy();
    await settled();
    expect(screen.queryByLabelText('Type of question')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    expect(await screen.findByText('Section A mixes types of question: split it into one section for each type')).toBeTruthy();
    expect(api.saveExamStructure).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Split into sections' }));
    expect(screen.queryByText(/This section mixes types of question/)).toBeNull();
    expect(screen.getAllByLabelText('Section title').map((i) => /** @type {HTMLInputElement} */ (i).value)).toEqual(['Section A (Multiple choice)', 'Section A (Essay)']);
    fireEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    await waitFor(() => expect(api.saveExamStructure).toHaveBeenCalled());
    const sections = api.saveExamStructure.mock.calls[0][1];
    expect(sections.map((/** @type {any} */ x) => [x.mode, x.questions.length])).toEqual([['MCQ', 2], ['ESSAY', 1]]);
  });

  it('a section whose type the examination no longer includes is refused with the way out', async () => {
    api.fetchExamForEditing.mockResolvedValue(saved({ sections: [{ title: 'Section A', instructions: '', mode: 'SHORT', questions: [question('SHORT', 'Name one prophet')] }] }));
    editor('/lecturer/courses/c1/exams/e1');
    const select = await screen.findByLabelText('Type of question');
    await settled();
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Multiple choice', 'Short answer (not in this examination)', 'Essay']);
    fireEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    expect(await screen.findByText(/Section A: this examination does not include short answer questions/)).toBeTruthy();
    expect(api.saveExamStructure).not.toHaveBeenCalled();
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
