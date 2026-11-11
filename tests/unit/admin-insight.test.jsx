// @vitest-environment jsdom
// Phase 11 (ADR-019): the administrator's Settings, Audit logs and Reports screens and the dashboard panels.
// The rules (who may, checks, audit) are tested in pgTAP 30 and 31; these check the screens.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminActivity, LearnerOverview, LecturerOverview } from '@/components/dashboard/DashboardPanels.jsx';
import AuditLogsPage from '@/pages/admin/AuditLogsPage.jsx';
import ReportsPage from '@/pages/admin/ReportsPage.jsx';
import SettingsPage from '@/pages/admin/SettingsPage.jsx';

const api = vi.hoisted(() => ({
  fetchSettings: vi.fn(),
  saveSetting: vi.fn(),
  searchAudit: vi.fn(),
  fetchAuditActions: vi.fn(),
  exportAudit: vi.fn(),
  fetchReport: vi.fn(),
  recordReportExport: vi.fn(),
  fetchDashboard: vi.fn(),
  downloadText: vi.fn(),
}));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/lib/admin/insight.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchSettings: () => api.fetchSettings(),
  saveSetting: (/** @type {string} */ k, /** @type {any} */ v) => api.saveSetting(k, v),
  searchAudit: (/** @type {any} */ f, /** @type {any} */ b) => api.searchAudit(f, b),
  fetchAuditActions: () => api.fetchAuditActions(),
  exportAudit: (/** @type {any} */ f) => api.exportAudit(f),
  fetchReport: (/** @type {any} */ k, /** @type {any} */ f) => api.fetchReport(k, f),
  recordReportExport: (/** @type {any} */ k, /** @type {any} */ f) => api.recordReportExport(k, f),
  fetchDashboard: (/** @type {string} */ fn) => api.fetchDashboard(fn),
}));
vi.mock('@/lib/admin/csv.js', async (importOriginal) => ({ ...(await importOriginal()), downloadText: (/** @type {string} */ n, /** @type {string} */ t) => api.downloadText(n, t) }));
vi.mock('@/lib/courses/courses.js', async (importOriginal) => ({ ...(await importOriginal()), fetchCourses: async () => [{ id: 'c1', title: 'Introduction to Biblical Studies', course_code: 'BIB101' }] }));
vi.mock('@/lib/branches.js', async (importOriginal) => ({ ...(await importOriginal()), fetchBranches: async () => [{ id: 'b1', name: 'Kumasi', position: 1, is_active: true }] }));

const settled = async () => {
  await act(() => new Promise((r) => setTimeout(r, 500)));
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
};
const inRouter = (/** @type {import('react').ReactNode} */ ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
const setting = (/** @type {string} */ key, /** @type {any} */ value) => ({ key, value, description: '', is_sensitive: false, updated_at: '2026-11-10T09:00:00Z' });

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchSettings.mockResolvedValue([
    setting('pass_mark', 50),
    setting('missing_as_zero', false),
    setting('min_class_size', 5),
    setting('idle_timeout_minutes', 10),
    setting('idle_warning_seconds', 120),
    setting('require_course_approval', true),
    setting('max_files_per_submission_version', 5),
    setting('grade_scale', [
      { grade: 'A', min: 80, max: 100 },
      { grade: 'F', min: 0, max: 79 },
    ]),
    setting('distribution_bands', [
      [0, 50],
      [50, 100],
    ]),
    setting('file_limits', { submission_document: { max_bytes: 10485760 }, submission_audio: { max_bytes: 26214400, max_seconds: 600 } }),
    setting('notification_retry_minutes', [1, 5, 15, 60, 240]),
    setting('retention_enabled', false),
  ]);
  api.saveSetting.mockResolvedValue(undefined);
});

describe('Settings', () => {
  it('saves the pass mark with "Setting saved"', async () => {
    inRouter(<SettingsPage />);
    const input = await screen.findByLabelText('Pass mark');
    await settled();
    fireEvent.change(input, { target: { value: '60' } });
    fireEvent.click(within(/** @type {HTMLElement} */ (input.closest('[data-setting]'))).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveSetting).toHaveBeenCalledWith('pass_mark', 60));
    expect(toast.show).toHaveBeenCalledWith('admin.setting-saved');
  });

  it('checks a value before sending it, and explains a refusal in plain words', async () => {
    inRouter(<SettingsPage />);
    const idle = await screen.findByLabelText('Sign out after inactivity');
    await settled();
    const row = /** @type {HTMLElement} */ (idle.closest('[data-setting]'));
    fireEvent.change(idle, { target: { value: '90' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));
    expect(await within(row).findByText('Enter a whole number from 5 to 60.')).toBeTruthy();
    expect(api.saveSetting).not.toHaveBeenCalled();
    api.saveSetting.mockRejectedValueOnce({ code: '23514', message: 'violates check constraint' });
    fireEvent.change(idle, { target: { value: '45' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));
    expect(await within(row).findByText('That value is outside what this setting allows.')).toBeTruthy();
  });

  it('explains and turns on counting missing work as 0', async () => {
    inRouter(<SettingsPage />);
    const sw = await screen.findByRole('switch', { name: 'Count missing work as 0' });
    await settled();
    expect(screen.getByText(/Off: overdue work with nothing sent shows as Missing and is not counted/)).toBeTruthy();
    fireEvent.click(sw);
    await waitFor(() => expect(api.saveSetting).toHaveBeenCalledWith('missing_as_zero', true));
  });

  it('saves chart bands from their boundaries and upload limits in MB', async () => {
    inRouter(<SettingsPage />);
    const bands = await screen.findByLabelText('Chart bands');
    await settled();
    fireEvent.change(bands, { target: { value: '0, 40, 100' } });
    fireEvent.click(within(/** @type {HTMLElement} */ (bands.closest('[data-setting]'))).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.saveSetting).toHaveBeenCalledWith('distribution_bands', [
        [0, 40],
        [40, 100],
      ]),
    );
    fireEvent.change(screen.getByLabelText('Learners’ documents (PDF, Word): largest file in MB'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save upload limits' }));
    await waitFor(() => expect(api.saveSetting).toHaveBeenLastCalledWith('file_limits', expect.objectContaining({ submission_document: { max_bytes: 20971520 } })));
  });
});

describe('Audit logs', () => {
  const entry = { id: 'e1', created_at: '2026-11-11T09:00:00Z', action: 'setting.updated', entity_type: 'system_setting', entity_id: 'pass_mark', metadata: { old_value: 50, new_value: 60 }, actor_id: 'a1', actor_name: 'Prince Boateng', actor_role: 'ADMIN' };

  it('lists entries with who and the details, filters, and downloads the CSV', async () => {
    api.fetchAuditActions.mockResolvedValue([{ action: 'setting.updated', entity_type: 'system_setting' }]);
    api.searchAudit.mockResolvedValue([entry]);
    api.exportAudit.mockResolvedValue('time_utc,action\n');
    inRouter(<AuditLogsPage />);
    await screen.findByText('setting.updated', { selector: 'span' });
    await settled();
    expect(screen.getByText('Prince Boateng (admin)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'setting.updated' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show entries' }));
    await waitFor(() =>
      expect(api.searchAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'setting.updated', from: '2026-11-01T00:00:00.000Z', to: '2026-11-11T00:00:00.000Z' }),
        undefined,
      ),
    );
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(api.downloadText).toHaveBeenCalledWith(expect.stringMatching(/^ddtc-audit-log-.*\.csv$/), 'time_utc,action\n'));
  });

  it('refuses an end date before the start date', async () => {
    api.fetchAuditActions.mockResolvedValue([]);
    api.searchAudit.mockResolvedValue([]);
    inRouter(<AuditLogsPage />);
    await screen.findByText('No entries');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show entries' }));
    expect(await screen.findByText('The end date is before the start date.')).toBeTruthy();
  });
});

describe('Reports', () => {
  it('shows each course by branch, switches report, and records a download', async () => {
    api.fetchReport.mockImplementation(async (/** @type {string} */ kind) =>
      kind === 'grades'
        ? [{ course_id: 'c1', course_title: 'Introduction to Biblical Studies', course_code: 'BIB101', branch_name: 'Kumasi', learners: 4, graded: 3, average_percentage: 71.5, passed: 3 }]
        : [{ course_id: 'c1', course_title: 'Introduction to Biblical Studies', course_code: 'BIB101', branch_name: null, active: 2, completed: 0, suspended: 0, withdrawn: 1, enrolled_in_period: 2 }],
    );
    api.recordReportExport.mockResolvedValue(undefined);
    inRouter(<ReportsPage />);
    await screen.findAllByText('No branch');
    await settled();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Grade summaries' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Grade summaries' }));
    await waitFor(() => expect(api.fetchReport).toHaveBeenLastCalledWith('grades', {}));
    expect((await screen.findAllByText('71.5%')).length).toBeGreaterThan(0);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(api.recordReportExport).toHaveBeenCalledWith('grades', {}));
    await waitFor(() => expect(api.downloadText).toHaveBeenCalledWith(expect.stringMatching(/^ddtc-grades-report-/), expect.stringContaining('BIB101,Introduction to Biblical Studies,Kumasi,4,3,71.5,3')));
  });
});

describe('dashboard panels', () => {
  it('learner: answers sent, missing work, what is due next and lesson progress', async () => {
    api.fetchDashboard.mockResolvedValue({
      sent: 3,
      missing: 1,
      due_next: [{ id: 'a1', title: 'Reflection on Genesis 1', course_id: 'c1', course_title: 'BIB101', due: '2026-11-20T23:59:00Z' }],
      recent_grades: [],
      progress: [{ course_id: 'c1', course_title: 'Introduction to Biblical Studies', lessons: 4, completed: 1 }],
    });
    inRouter(<LearnerOverview />);
    expect(await screen.findByText('Reflection on Genesis 1')).toBeTruthy();
    expect(api.fetchDashboard).toHaveBeenCalledWith('learner_dashboard');
    expect(screen.getByText('Missing work').previousSibling?.textContent).toBe('1');
    expect(screen.getByRole('progressbar', { name: 'Introduction to Biblical Studies: lesson progress' }).getAttribute('aria-valuenow')).toBe('25');
    expect(screen.getByText('No grades released yet.')).toBeTruthy();
  });

  it('lecturer: deadlines with how many have sent their work', async () => {
    api.fetchDashboard.mockResolvedValue({
      upcoming: [{ kind: 'ASSIGNMENT', id: 'a1', title: 'Covenant essay', course_id: 'c1', course_title: 'BIB101', due: '2026-11-20T23:59:00Z', sent: 4, learners: 9 }],
      performance: [{ course_id: 'c1', course_title: 'Introduction to Biblical Studies', learners: 9, graded: 0, average: null }],
    });
    inRouter(<LecturerOverview />);
    expect(await screen.findByText('4 of 9 sent')).toBeTruthy();
    expect(screen.getByText('No grades yet')).toBeTruthy();
  });

  it('administrator: activity, releases and events', async () => {
    api.fetchDashboard.mockResolvedValue({
      answers_sent_7d: 12,
      grading_backlog: 5,
      releases_7d: 2,
      recent_releases: [],
      recent_events: [{ at: '2026-11-11T09:00:00Z', action: 'setting.updated', actor_name: 'Prince Boateng' }],
    });
    inRouter(<AdminActivity />);
    expect(await screen.findByText('Waiting for marks')).toBeTruthy();
    expect(screen.getByText('Setting changed')).toBeTruthy();
    expect(screen.getByText('No grades released yet.')).toBeTruthy();
  });
});
