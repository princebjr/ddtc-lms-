// @vitest-environment jsdom
// Phase 12 (D20, ADR-022): the administrator's Retention page and the "Hold this answer's audio" control.
// The rules (which files, holds, dry run first, who may) are tested in pgTAP 37 and
// tests/functions/retention.test.js; these check the screens.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerAudioHold } from '@/components/retention/AnswerAudioHold.jsx';
import { liveFrom } from '@/lib/admin/retention.js';
import RetentionPage from '@/pages/admin/RetentionPage.jsx';

const api = vi.hoisted(() => ({
  fetchRetention: vi.fn(),
  fetchHolds: vi.fn(),
  fetchHoldCourses: vi.fn(),
  searchHoldLearners: vi.fn(),
  placeHold: vi.fn(),
  releaseHold: vi.fn(),
  fetchAnswerHold: vi.fn(),
  saveSetting: vi.fn(),
}));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/lib/admin/insight.js', async (importOriginal) => ({ ...(await importOriginal()), saveSetting: (/** @type {string} */ k, /** @type {any} */ v) => api.saveSetting(k, v) }));
vi.mock('@/lib/admin/retention.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchRetention: () => api.fetchRetention(),
  fetchHolds: () => api.fetchHolds(),
  fetchHoldCourses: () => api.fetchHoldCourses(),
  searchHoldLearners: (/** @type {string} */ t) => api.searchHoldLearners(t),
  placeHold: (/** @type {any[]} */ ...a) => api.placeHold(...a),
  releaseHold: (/** @type {string} */ id) => api.releaseHold(id),
  fetchAnswerHold: (/** @type {any[]} */ ...a) => api.fetchAnswerHold(...a),
}));

const settled = async () => {
  await act(() => new Promise((r) => setTimeout(r, 400)));
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
};
const DAY = 86_400_000;
/** @param {object} [over] */
const status = (over) => ({ enabled: false, days: 180, dryRunDays: 30, firstDryRun: null, ...over });
const hold = (/** @type {object} */ over) => ({
  id: 'h1', scope: 'COURSE', scope_id: 'c2', subject: 'HIS101 Church History', detail: null, reason: 'Appeal under review',
  placed_at: '2026-11-10T09:00:00Z', placed_by_name: 'Prince Boateng', released_at: null, released_by_name: null, ...over,
});

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  toast.show.mockReset();
  api.fetchHoldCourses.mockResolvedValue([{ id: 'c1', title: 'Introduction to Biblical Studies', course_code: 'BIB101' }]);
  api.fetchHolds.mockResolvedValue([]);
});

describe('liveFrom', () => {
  it('is the first dry run plus the dry-run days, or nothing before any run', () => {
    expect(liveFrom(status())).toBeNull();
    expect(liveFrom(status({ firstDryRun: '2026-11-01T02:40:00Z' }))?.toISOString()).toBe('2026-12-01T02:40:00.000Z');
  });
});

describe('the Retention page', () => {
  it('says what is removed and what is kept, and that it is off with dry runs first', async () => {
    api.fetchRetention.mockResolvedValue({ status: status(), runs: [] });
    render(<RetentionPage />);
    await settled();
    const card = /** @type {HTMLElement} */ (document.querySelector('[data-slot="retention-status"]'));
    expect(within(card).getByText('Off')).toBeTruthy();
    expect(within(card).getByText(/removed 180 days after the grade or result is released/)).toBeTruthy();
    expect(within(card).getByText(/text, PDF and Word files, lesson and instruction audio, grades, feedback and history are always kept/)).toBeTruthy();
    expect(within(card).getByText(/The first 30 days are dry runs only/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Live deletion' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('No runs yet')).toBeTruthy();
    expect(screen.getByText('No holds')).toBeTruthy();
  });

  it('asks before switching live deletion on, and switches off at once', async () => {
    api.fetchRetention.mockResolvedValue({ status: status({ firstDryRun: new Date(Date.now() - 5 * DAY).toISOString() }), runs: [] });
    api.saveSetting.mockResolvedValue(undefined);
    render(<RetentionPage />);
    await settled();
    fireEvent.click(screen.getByRole('switch', { name: 'Live deletion' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Switch on live deletion?' });
    expect(within(dialog).getByText(/Nothing is deleted until 30 days of dry runs have passed/)).toBeTruthy();
    expect(api.saveSetting).not.toHaveBeenCalled();
    // The page reads the setting again once it is saved.
    api.fetchRetention.mockResolvedValue({ status: status({ enabled: true, firstDryRun: new Date(Date.now() - 5 * DAY).toISOString() }), runs: [] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(api.saveSetting).toHaveBeenCalledWith('retention_enabled', true));
    expect(toast.show).toHaveBeenCalledWith('admin.retention-enabled');

    await settled();
    expect(screen.getByText('On, dry runs first')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Live deletion' }));
    await waitFor(() => expect(api.saveSetting).toHaveBeenCalledWith('retention_enabled', false));
    expect(toast.show).toHaveBeenCalledWith('admin.retention-disabled');
  });

  it('places a hold on a learner found by name, with a reason, and offers Undo', async () => {
    api.fetchRetention.mockResolvedValue({ status: status(), runs: [] });
    api.searchHoldLearners.mockResolvedValue([{ id: 'l1', first_name: 'Kwame', second_name: 'Mensah', id_number: 123456 }]);
    api.placeHold.mockResolvedValue('h9');
    api.releaseHold.mockResolvedValue(undefined);
    render(<RetentionPage />);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Place hold' }));
    expect(await screen.findByText('Choose the course')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Hold'), { target: { value: 'LEARNER' } });
    fireEvent.change(screen.getByLabelText("Learner's name"), { target: { value: 'Kwame' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    const pick = await screen.findByRole('combobox', { name: 'Learner' });
    fireEvent.change(pick, { target: { value: 'l1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place hold' }));
    expect(await screen.findByText('Give a reason of 3 to 500 characters')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Learner asked to keep their recordings' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place hold' }));
    await waitFor(() => expect(api.placeHold).toHaveBeenCalledWith('LEARNER', 'l1', 'Learner asked to keep their recordings'));
    const [key, options] = /** @type {[string, { onAction: () => void }]} */ (toast.show.mock.calls.at(-1));
    expect(key).toBe('admin.hold-placed');
    options.onAction();
    await waitFor(() => expect(api.releaseHold).toHaveBeenCalledWith('h9'));
  });

  it('lists active holds with Release (Undo places it again) and keeps released ones below', async () => {
    api.fetchRetention.mockResolvedValue({
      status: status(),
      runs: [
        { id: 'r2', started_at: '2026-11-12T02:40:00Z', finished_at: '2026-11-12T02:41:00Z', mode: 'LIVE', eligible_count: 3, deleted_count: 2, failed_count: 1 },
        { id: 'r1', started_at: '2026-11-11T02:40:00Z', finished_at: '2026-11-11T02:41:00Z', mode: 'DRY_RUN', eligible_count: 4, deleted_count: 0, failed_count: 0 },
      ],
    });
    api.fetchHolds.mockResolvedValue([hold({}), hold({ id: 'h0', scope: 'LEARNER', scope_id: 'l2', subject: 'Abena Frimpong', released_at: '2026-11-11T10:00:00Z', released_by_name: 'Prince Boateng' })]);
    api.releaseHold.mockResolvedValue(undefined);
    api.placeHold.mockResolvedValue('h2');
    render(<RetentionPage />);
    await settled();
    const active = screen.getAllByTestId('active-hold');
    expect(active).toHaveLength(1);
    expect(within(active[0]).getByText('HIS101 Church History')).toBeTruthy();
    expect(within(active[0]).getByText(/Appeal under review · placed by Prince Boateng/)).toBeTruthy();
    expect(screen.getByText('Released holds (1)')).toBeTruthy();
    const runs = screen.getAllByTestId('retention-run');
    expect(within(runs[0]).getByText('3 found · 2 removed · 1 failed')).toBeTruthy();
    expect(within(runs[1]).getByText('4 would be removed · nothing changed')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Release the hold on HIS101 Church History' }));
    await waitFor(() => expect(api.releaseHold).toHaveBeenCalledWith('h1'));
    const [key, options] = /** @type {[string, { onAction: () => void }]} */ (toast.show.mock.calls.at(-1));
    expect(key).toBe('admin.hold-released');
    options.onAction();
    await waitFor(() => expect(api.placeHold).toHaveBeenCalledWith('COURSE', 'c2', 'Appeal under review'));
  });
});

describe('Hold this answer\'s audio', () => {
  it('holds one answer with a reason, and shows the hold with Release', async () => {
    api.fetchAnswerHold.mockResolvedValue({ answer_id: 's1', hold_id: null, reason: null });
    api.placeHold.mockResolvedValue('h5');
    render(<AnswerAudioHold scope="SUBMISSION" parentId="a1" learnerId="l1" />);
    fireEvent.click(await screen.findByRole('button', { name: "Hold this answer's audio" }));
    const dialog = await screen.findByRole('dialog', { name: "Hold this answer's audio" });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Place hold' }));
    expect(await within(dialog).findByText('Give a reason of 3 to 500 characters')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Grade appeal' } });
    api.fetchAnswerHold.mockResolvedValue({ answer_id: 's1', hold_id: 'h5', reason: 'Grade appeal' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Place hold' }));
    await waitFor(() => expect(api.placeHold).toHaveBeenCalledWith('SUBMISSION', 's1', 'Grade appeal'));
    expect(toast.show.mock.calls.at(-1)?.[0]).toBe('admin.hold-placed');
    expect(await screen.findByText(/Held: Grade appeal/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Release hold' })).toBeTruthy();
  });

  it('shows nothing when there is no answer', async () => {
    api.fetchAnswerHold.mockResolvedValue(null);
    const view = render(<AnswerAudioHold scope="EXAM_ATTEMPT" parentId="x1" learnerId="l1" />);
    await waitFor(() => expect(api.fetchAnswerHold).toHaveBeenCalledWith('EXAM_ATTEMPT', 'x1', 'l1'));
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(view.container.innerHTML).toBe('');
  });
});
