// @vitest-environment jsdom
// Phase 11 (D21, ADR-019): the notification centre and the header bell.
// - Newest first, unread marked (a dot and "(unread)" for screen readers); View marks read and opens it.
// - Mark all read; Show more; the email switch "Email me about my courses".
// - The bell shows the unread count and announces a new notification ("New notification arrives": its
//   title with Open), but not grade notices, which GradeNotices announces.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from '@/components/notifications/NotificationBell.jsx';
import NotificationsPage from '@/pages/account/NotificationsPage.jsx';

const api = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  fetchUnreadCount: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  fetchEmailEnabled: vi.fn(),
  setEmailEnabled: vi.fn(),
}));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/components/auth/AuthProvider.jsx', () => ({ useAuth: () => ({ profile: { id: 'me', first_name: 'Kwame' } }) }));
vi.mock('@/lib/notifications/notifications.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchNotifications: (/** @type {any} */ b) => api.fetchNotifications(b),
  fetchUnreadCount: () => api.fetchUnreadCount(),
  markRead: (/** @type {string} */ id) => api.markRead(id),
  markAllRead: () => api.markAllRead(),
  fetchEmailEnabled: (/** @type {string} */ id) => api.fetchEmailEnabled(id),
  setEmailEnabled: (/** @type {string} */ id, /** @type {boolean} */ on) => api.setEmailEnabled(id, on),
}));

const notice = (/** @type {Record<string, any>} */ over) => ({
  id: 'n1',
  notification_type: 'ASSIGNMENT_PUBLISHED',
  title: 'New assignment',
  message: 'Reflection on Genesis 1 in Introduction to Biblical Studies. Due 20 Nov 2026, 23:59 (Ghana time).',
  link_path: '/learner/courses/c1/assignments/a1',
  read_at: null,
  created_at: '2026-11-11T09:00:00Z',
  ...over,
});

const page = () =>
  render(
    <MemoryRouter initialEntries={['/learner/notifications']}>
      <Routes>
        <Route path="/learner/notifications" element={<NotificationsPage />} />
        <Route path="/learner/courses/c1/assignments/a1" element={<p>Assignment page</p>} />
      </Routes>
    </MemoryRouter>,
  );
const settled = async () => {
  await act(() => new Promise((r) => setTimeout(r, 500)));
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
};

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchEmailEnabled.mockResolvedValue(true);
  api.markRead.mockResolvedValue(undefined);
  api.markAllRead.mockResolvedValue(undefined);
  api.setEmailEnabled.mockResolvedValue(undefined);
});

describe('the notification centre', () => {
  it('lists the newest first, marks the unread, and opens one (marking it read)', async () => {
    api.fetchNotifications.mockResolvedValue([notice({}), notice({ id: 'n2', title: 'You have been enrolled', read_at: '2026-11-10T09:00:00Z', link_path: null })]);
    page();
    await screen.findByText('You have been enrolled');
    await settled();
    const rows = screen.getAllByTestId('notice');
    expect(rows[0].dataset.unread).toBe('true');
    expect(rows[1].dataset.unread).toBeUndefined();
    expect(screen.getByText('(unread)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /New assignment/ }));
    await screen.findByText('Assignment page');
    expect(api.markRead).toHaveBeenCalledWith('n1');
  });

  it('marks all read', async () => {
    api.fetchNotifications.mockResolvedValue([notice({})]);
    page();
    await screen.findByText('New assignment');
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(api.markAllRead).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull());
    expect(screen.getByTestId('notice').dataset.unread).toBeUndefined();
  });

  it('turns course emails off with one switch', async () => {
    api.fetchNotifications.mockResolvedValue([]);
    page();
    await screen.findByText('No notifications yet');
    await settled();
    const sw = screen.getByRole('switch', { name: 'Email me about my courses' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    await waitFor(() => expect(api.setEmailEnabled).toHaveBeenCalledWith('me', false));
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('shows more, twenty at a time', async () => {
    const first = Array.from({ length: 20 }, (_, i) => notice({ id: 'n' + i, created_at: '2026-11-11T09:' + String(59 - i).padStart(2, '0') + ':00Z' }));
    api.fetchNotifications.mockResolvedValueOnce(first);
    api.fetchNotifications.mockResolvedValueOnce([notice({ id: 'old', title: 'Older one' })]);
    page();
    await screen.findAllByTestId('notice');
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await screen.findByText('Older one');
    expect(api.fetchNotifications).toHaveBeenLastCalledWith('2026-11-11T09:40:00Z');
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });
});

describe('the bell', () => {
  const bell = () =>
    render(
      <MemoryRouter>
        <NotificationBell href="/learner/notifications" />
      </MemoryRouter>,
    );

  it('shows the unread count and announces a new notification', async () => {
    api.fetchUnreadCount.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    api.fetchNotifications.mockResolvedValue([notice({ title: 'New examination', notification_type: 'EXAM_PUBLISHED' })]);
    bell();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Notifications, 2 unread' })).toBeTruthy());
    expect(toast.show).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new Event('ddtc:notices-changed'));
    });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Notifications, 3 unread' })).toBeTruthy());
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith('notification.new', expect.objectContaining({ params: { title: 'New examination' } })));
  });

  it('leaves grade notices to GradeNotices', async () => {
    api.fetchUnreadCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    api.fetchNotifications.mockResolvedValue([notice({ notification_type: 'GRADE_RELEASED', title: 'New grade available' })]);
    bell();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Notifications' })).toBeTruthy());
    act(() => {
      window.dispatchEvent(new Event('ddtc:notices-changed'));
    });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Notifications, 1 unread' })).toBeTruthy());
    expect(toast.show).not.toHaveBeenCalled();
  });
});
