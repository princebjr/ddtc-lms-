// @vitest-environment jsdom
// Phase 8 answers (D10, ADR-009, owner decisions 1, 2, 3, 4 and 6 of 2026-11-08): the learner's answer
// form combines a plain-text answer with uploads (resumable, waiting on the server until sent),
// counts characters to 20,000, sends everything as the next version with one request id per answer
// (a retry never makes a second version) and says what happened with the listed toasts; PDF and Word
// only where allowed; at most 5 files. The extension dialog checks the date and offers Undo and
// taking an extension back. The server rules themselves are tested in pgTAP 17 and 18.
import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContextForTests } from '@/components/auth/AuthProvider.jsx';
import { AnswerForm, answerRoleFor } from '@/components/submissions/AnswerForm.jsx';
import { ExtensionDialog } from '@/components/submissions/ExtensionDialog.jsx';
import { blockedMessage, versionSummary } from '@/lib/submissions/submissions.js';

const toast = vi.hoisted(() => ({ show: vi.fn() }));
const api = vi.hoisted(() => ({
  submitAnswer: vi.fn(),
  removeDraftFile: vi.fn(),
  uploadFile: vi.fn(),
  setExtension: vi.fn(),
  removeExtension: vi.fn(),
}));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));
vi.mock('@/lib/uploads.js', () => ({ uploadFile: (/** @type {any} */ req) => api.uploadFile(req) }));
vi.mock('@/lib/audio/peaks.js', () => ({ computePeaks: async () => null, PEAK_COUNT: 128 }));
vi.mock('@/lib/submissions/submissions.js', async (importOriginal) => ({
  ...(await importOriginal()),
  submitAnswer: (/** @type {any} */ a) => api.submitAnswer(a),
  removeDraftFile: (/** @type {string} */ id) => api.removeDraftFile(id),
  setExtension: (/** @type {any} */ a) => api.setExtension(a),
  removeExtension: (/** @type {string} */ a, /** @type {string} */ l) => api.removeExtension(a, l),
}));

/** @param {Partial<import('@/lib/submissions/submissions.js').MySubmission>} [over] @returns {import('@/lib/submissions/submissions.js').MySubmission} */
const mine = (over = {}) => ({
  assignment_id: 'a1',
  due_at: '2030-01-20T23:59:00Z',
  effective_due_at: '2030-01-20T23:59:00Z',
  extended: false,
  allow_late: false,
  accepted_formats: ['TEXT', 'AUDIO'],
  max_files: 5,
  submission_id: null,
  status: null,
  current_version: 0,
  next_version: 1,
  is_late: false,
  can_submit: true,
  will_be_late: false,
  blocked_reason: null,
  draft_files: [],
  versions: [],
  ...over,
});

/** @param {Parameters<typeof AnswerForm>[0]} props */
function renderForm(props) {
  return render(
    <AuthContextForTests.Provider value={/** @type {any} */ ({ status: 'signed-in', profile: { id: 'u1', role: 'LEARNER' } })}>
      <AnswerForm {...props} />
    </AuthContextForTests.Provider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  toast.show.mockReset();
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe('the answer form', () => {
  it('sends a text answer as version 1 with "Submission received"', async () => {
    const onSent = vi.fn();
    api.submitAnswer.mockResolvedValue({ submissionId: 's1', versionNumber: 1, isLate: false, resubmitted: false, replayed: false });
    renderForm({ assignmentId: 'a1', title: 'Reflection', mine: mine(), onSent });
    fireEvent.change(screen.getByLabelText('Text answer'), { target: { value: 'Genesis 1 shows order.' } });
    expect(screen.getByText('22 of 20,000 characters')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit' })));
    expect(api.submitAnswer).toHaveBeenCalledWith({ assignmentId: 'a1', text: 'Genesis 1 shows order.', fileIds: [], requestId: expect.any(String) });
    expect(toast.show).toHaveBeenCalledWith('learner.submission-received');
    expect(onSent).toHaveBeenCalled();
  });

  it('an empty answer and one over 20,000 characters are not sent', async () => {
    renderForm({ assignmentId: 'a1', title: 'Reflection', mine: mine(), onSent: vi.fn() });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit' })));
    expect(screen.getByRole('alert')).toHaveTextContent('Add a text answer, a recording or a file.');
    fireEvent.change(screen.getByLabelText('Text answer'), { target: { value: 'a'.repeat(20001) } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit' })));
    expect(screen.getByRole('alert')).toHaveTextContent('longer than 20,000 characters');
    expect(api.submitAnswer).not.toHaveBeenCalled();
  });

  it('a retry after a dropped connection sends the same request id, so no second version is made', async () => {
    api.submitAnswer
      .mockRejectedValueOnce(new Error('The connection dropped. Try again.'))
      .mockResolvedValueOnce({ versionNumber: 1, isLate: false, resubmitted: false, replayed: true });
    renderForm({ assignmentId: 'a1', title: 'Reflection', mine: mine(), onSent: vi.fn() });
    fireEvent.change(screen.getByLabelText('Text answer'), { target: { value: 'My answer.' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit' })));
    expect(screen.getByRole('alert')).toHaveTextContent('The connection dropped');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit' })));
    expect(api.submitAnswer.mock.calls[1][0].requestId).toBe(api.submitAnswer.mock.calls[0][0].requestId);
  });

  it('a resubmission starts from the last answer and says "Resubmitted as version 2"; a late answer warns first and says "Submitted late"', async () => {
    api.submitAnswer.mockResolvedValue({ versionNumber: 2, isLate: false, resubmitted: true, replayed: false });
    const last = { id: 'v1', version_number: 1, submitted_at: '2030-01-10T10:00:00Z', is_late: false, text_answer: 'First try.', files: [] };
    const view = renderForm({
      assignmentId: 'a1',
      title: 'Reflection',
      mine: mine({ status: 'SUBMITTED', current_version: 1, next_version: 2, versions: [last] }),
      onSent: vi.fn(),
    });
    expect(screen.getByLabelText('Text answer')).toHaveValue('First try.');
    expect(screen.getByRole('heading', { name: 'Send a new answer' })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit again' })));
    expect(toast.show).toHaveBeenCalledWith('learner.resubmitted', { params: { n: '2' } });
    view.unmount();
    api.submitAnswer.mockResolvedValue({ versionNumber: 1, isLate: true, resubmitted: false, replayed: false });
    renderForm({ assignmentId: 'a2', title: 'Psalms', mine: mine({ assignment_id: 'a2', will_be_late: true }), onSent: vi.fn() });
    expect(screen.getByText('The due date has passed. Your answer will be accepted and marked late.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Text answer'), { target: { value: 'Late but here.' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit' })));
    expect(toast.show).toHaveBeenCalledWith('learner.submitted-late');
  });

  it('an uploaded recording is checked, listed as Ready and sent with the answer', async () => {
    api.uploadFile.mockImplementation(async (/** @type {any} */ req) => {
      req.onRegistered?.('f1');
      req.onProgress?.(1);
      return { fileId: 'f1', durationSeconds: 95 };
    });
    api.submitAnswer.mockResolvedValue({ versionNumber: 1, isLate: false, resubmitted: false, replayed: false });
    renderForm({ assignmentId: 'a1', title: 'Reflection', mine: mine(), onSent: vi.fn() });
    const file = new File(['abc'], 'answer.m4a', { type: 'audio/mp4' });
    await act(async () => fireEvent.change(screen.getByTestId('answer-audio-input'), { target: { files: [file] } }));
    expect(api.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'SUBMISSION_FILE', assignmentId: 'a1', file, alwaysResumable: true }));
    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument());
    expect(screen.getByText('1:35 · 1 KB')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit' })));
    expect(api.submitAnswer).toHaveBeenCalledWith(expect.objectContaining({ text: '', fileIds: ['f1'] }));
  });

  it('a rejected file shows the reason and "File not accepted: reason"; it is not sent', async () => {
    api.uploadFile.mockRejectedValue(Object.assign(new Error('The audio is longer than 10 minutes.'), { status: 422, code: 'rejected' }));
    renderForm({ assignmentId: 'a1', title: 'Reflection', mine: mine(), onSent: vi.fn() });
    await act(async () => fireEvent.change(screen.getByTestId('answer-audio-input'), { target: { files: [new File(['x'], 'long.webm')] } }));
    await waitFor(() => expect(screen.getByText('Rejected')).toBeInTheDocument());
    expect(screen.getByText('The audio is longer than 10 minutes.')).toBeInTheDocument();
    expect(toast.show).toHaveBeenCalledWith('learner.file-rejected', expect.objectContaining({ params: { reason: 'The audio is longer than 10 minutes.' } }));
  });

  it('a file not yet sent can be removed (decision 4)', async () => {
    api.removeDraftFile.mockResolvedValue({ removed: true });
    const waiting = {
      id: 'f9',
      original_filename: 'notes.webm',
      safe_download_filename: 'notes.webm',
      mime_type: 'audio/webm',
      file_size: 2048,
      duration_seconds: 30,
      waveform_peaks: null,
      status: /** @type {const} */ ('VALIDATED'),
      validation_error: null,
      bucket_name: 'learner-submissions',
      storage_path: 'a1/u1/1/f9.webm',
      file_role: /** @type {const} */ ('AUDIO'),
      uploaded_at: '2030-01-10T10:00:00Z',
    };
    renderForm({ assignmentId: 'a1', title: 'Reflection', mine: mine({ draft_files: [waiting] }), onSent: vi.fn() });
    expect(screen.getByText('notes.webm')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove notes.webm' })));
    expect(api.removeDraftFile).toHaveBeenCalledWith('f9');
    expect(screen.queryByText('notes.webm')).toBeNull();
  });

  it('offers PDF and Word only where the lecturer allowed them (ADR-009)', () => {
    const view = renderForm({ assignmentId: 'a1', title: 'Reflection', mine: mine(), onSent: vi.fn() });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Upload' }));
    expect(screen.getByRole('button', { name: 'Upload audio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upload PDF/ })).toBeNull();
    view.unmount();
    renderForm({
      assignmentId: 'a3',
      title: 'Essay',
      mine: mine({ assignment_id: 'a3', accepted_formats: ['TEXT', 'AUDIO', 'PDF', 'DOCX'] }),
      onSent: vi.fn(),
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Upload' }));
    expect(screen.getByRole('button', { name: 'Upload PDF or Word' })).toBeInTheDocument();
  });

  it('holds at most 5 files: the recorder says so once 5 are added', () => {
    const file = (/** @type {number} */ n) => ({
      id: `f${n}`,
      original_filename: `r${n}.webm`,
      safe_download_filename: `r${n}.webm`,
      mime_type: 'audio/webm',
      file_size: 10,
      duration_seconds: 5,
      waveform_peaks: null,
      status: /** @type {const} */ ('VALIDATED'),
      validation_error: null,
      bucket_name: 'learner-submissions',
      storage_path: `a1/u1/1/f${n}.webm`,
      file_role: /** @type {const} */ ('AUDIO'),
      uploaded_at: '2030-01-10T10:00:00Z',
    });
    renderForm({ assignmentId: 'a1', title: 'Reflection', mine: mine({ draft_files: [1, 2, 3, 4, 5].map(file) }), onSent: vi.fn() });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Record' }));
    expect(screen.getByText(/You have added 5 files, the most one answer can hold/)).toBeInTheDocument();
  });
});

describe('answer helpers', () => {
  it('names the kind of file from its extension, as the server does', () => {
    expect(answerRoleFor('voice.opus')).toBe('AUDIO');
    expect(answerRoleFor('Essay.PDF')).toBe('PDF');
    expect(answerRoleFor('essay.docx')).toBe('DOCX');
    expect(answerRoleFor('setup.exe')).toBeNull();
  });

  it('says why an answer cannot be sent', () => {
    expect(blockedMessage('past_due')).toMatch(/does not accept late answers/);
    expect(blockedMessage('past_due_resubmit')).toMatch(/Your last answer is the one that will be graded/);
    expect(blockedMessage('graded')).toMatch(/graded/);
    expect(blockedMessage('read_only')).toMatch(/read-only/);
  });

  it('sums up what a version holds', () => {
    const v = (/** @type {string} */ text, /** @type {Array<'AUDIO' | 'PDF' | 'DOCX'>} */ roles) =>
      /** @type {any} */ ({ text_answer: text, files: roles.map((r) => ({ file_role: r })) });
    expect(versionSummary(v('Hello', []))).toBe('Text');
    expect(versionSummary(v('', ['AUDIO']))).toBe('Audio');
    expect(versionSummary(v('Hi', ['AUDIO', 'AUDIO', 'PDF']))).toBe('Text, 2 recordings and PDF');
  });
});

describe('the extension dialog', () => {
  const learner = { id: 'l1', name: 'Kwame Mensah' };
  it('refuses a date before the due date, saves a later one with Undo, and Undo takes a new extension back', async () => {
    api.setExtension.mockResolvedValue({ previous: null });
    api.removeExtension.mockResolvedValue({ removed: '2030-02-01T12:00:00Z' });
    const onChanged = vi.fn();
    render(<ExtensionDialog assignmentId="a1" learner={learner} dueAt="2030-01-20T23:59:00Z" extendedTo={null} onClose={vi.fn()} onChanged={onChanged} />);
    fireEvent.change(screen.getByLabelText('New due date and time'), { target: { value: '2030-01-10T10:00' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save extension' })));
    expect(screen.getByText(/Choose a date after the due date/)).toBeInTheDocument();
    expect(api.setExtension).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('New due date and time'), { target: { value: '2030-02-01T12:00' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save extension' })));
    expect(api.setExtension).toHaveBeenCalledWith({ assignmentId: 'a1', learnerId: 'l1', extendedDueAt: '2030-02-01T12:00:00Z', reason: undefined });
    const [id, options] = toast.show.mock.calls[0];
    expect(id).toBe('lecturer.extension-granted');
    await act(async () => options.onAction());
    expect(api.removeExtension).toHaveBeenCalledWith('a1', 'l1');
  });

  it('Undo of a change restores the previous date', async () => {
    api.setExtension.mockResolvedValueOnce({ previous: '2030-01-25T10:00:00Z' }).mockResolvedValueOnce({ previous: '2030-02-01T12:00:00Z' });
    render(
      <ExtensionDialog
        assignmentId="a1"
        learner={learner}
        dueAt="2030-01-20T23:59:00Z"
        extendedTo="2030-01-25T10:00:00Z"
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('New due date and time'), { target: { value: '2030-02-01T12:00' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save extension' })));
    await act(async () => toast.show.mock.calls[0][1].onAction());
    expect(api.setExtension).toHaveBeenLastCalledWith({ assignmentId: 'a1', learnerId: 'l1', extendedDueAt: '2030-01-25T10:00:00Z', undo: true });
  });

  it('takes an extension back with "Extension removed"', async () => {
    api.removeExtension.mockResolvedValue({ removed: '2030-01-25T10:00:00Z' });
    render(
      <ExtensionDialog
        assignmentId="a1"
        learner={learner}
        dueAt="2030-01-20T23:59:00Z"
        extendedTo="2030-01-25T10:00:00Z"
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Take back extension' })));
    expect(api.removeExtension).toHaveBeenCalledWith('a1', 'l1');
    expect(toast.show).toHaveBeenCalledWith('lecturer.extension-removed');
  });
});
