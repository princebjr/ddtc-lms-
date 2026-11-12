// @vitest-environment jsdom
// Owner request of 2026-11-12 (ADR-024): learners and lecturers clear notifications one at a time or all at once,
// with Undo; administrators keep their alerts (no clear controls). The database rules are pgTAP 42.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationsPage from '@/pages/account/NotificationsPage.jsx';

const api = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  fetchEmailEnabled: vi.fn(),
  clearNotices: vi.fn(),
  restoreNotices: vi.fn(),
  role: 'LEARNER',
}));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/components/auth/AuthProvider.jsx', () => ({ useAuth: () => ({ profile: { id: 'me', first_name: 'Kwame', role: api.role } }) }));
vi.mock('@/lib/notifications/notifications.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchNotifications: () => api.fetchNotifications(),
  fetchEmailEnabled: () => api.fetchEmailEnabled(),
  clearNotices: (/** @type {string[] | null} */ ids) => api.clearNotices(ids),
  restoreNotices: (/** @type {string[]} */ ids) => api.restoreNotices(ids),
}));

/** @param {string} id @param {string} title @param {string} at */
const notice = (id, title, at) => ({ id, notification_type: 'ANNOUNCEMENT', title, message: 'Body.', link_path: null, read_at: null, created_at: at });
const settled = async () => {
  await act(() => new Promise((r) => setTimeout(r, 400)));
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
};
const page = () => render(<MemoryRouter><NotificationsPage /></MemoryRouter>);

beforeEach(() => {
  for (const f of [api.fetchNotifications, api.fetchEmailEnabled, api.clearNotices, api.restoreNotices, toast.show]) f.mockReset();
  api.role = 'LEARNER';
  api.fetchEmailEnabled.mockResolvedValue(true);
  api.fetchNotifications.mockResolvedValue([notice('n2', 'Class moved', '2026-11-12T09:00:00Z'), notice('n1', 'New assignment', '2026-11-11T09:00:00Z')]);
});

describe('clearing notifications', () => {
  it('a learner clears one; Undo brings it back in its place', async () => {
    api.clearNotices.mockResolvedValue(['n2']);
    api.restoreNotices.mockResolvedValue(undefined);
    page();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear notification: Class moved' }));
    await waitFor(() => expect(screen.getAllByTestId('notice')).toHaveLength(1));
    expect(api.clearNotices).toHaveBeenCalledWith(['n2']);
    const [key, options] = /** @type {[string, { onAction: () => void }]} */ (toast.show.mock.calls.at(-1));
    expect(key).toBe('notification.cleared');
    act(() => options.onAction());
    await waitFor(() => expect(screen.getAllByTestId('notice')).toHaveLength(2));
    expect(api.restoreNotices).toHaveBeenCalledWith(['n2']);
    expect(screen.getAllByTestId('notice')[0].textContent).toContain('Class moved');
  });

  it('a lecturer clears all at once; Undo brings them all back', async () => {
    api.role = 'LECTURER';
    api.clearNotices.mockResolvedValue(['n2', 'n1']);
    api.restoreNotices.mockResolvedValue(undefined);
    page();
    await settled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear all' })[0]);
    await waitFor(() => expect(screen.queryAllByTestId('notice')).toHaveLength(0));
    expect(api.clearNotices).toHaveBeenCalledWith(null);
    expect(screen.getByText('No notifications yet')).toBeTruthy();
    const [key, options] = /** @type {[string, { onAction: () => void }]} */ (toast.show.mock.calls.at(-1));
    expect(key).toBe('notification.cleared-all');
    act(() => options.onAction());
    await waitFor(() => expect(screen.getAllByTestId('notice')).toHaveLength(2));
    expect(api.restoreNotices).toHaveBeenCalledWith(['n2', 'n1']);
  });

  it('a failed clear puts the notification back and offers Retry', async () => {
    api.clearNotices.mockRejectedValue(new Error('offline'));
    page();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear notification: New assignment' }));
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith('request.failed', expect.anything()));
    expect(screen.getAllByTestId('notice')).toHaveLength(2);
  });

  it('administrators see no clear controls', async () => {
    api.role = 'ADMIN';
    page();
    await settled();
    expect(screen.getAllByTestId('notice')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Clear notification: / })).toBeNull();
  });
});
