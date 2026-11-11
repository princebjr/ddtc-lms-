// @vitest-environment jsdom
// Phase 11 (owner request and answers of 2026-11-11, ADR-019): announcements.
// - A lecturer chooses one of their published courses; an administrator also all learners or a branch.
// - A confirmation names the audience before sending; then "Announcement sent" and the Sent list.
// - The learner's course page shows the course's announcements.
// Who may send to whom, and who receives them, is tested in pgTAP 32.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseAnnouncements } from '@/components/announcements/CourseAnnouncements.jsx';
import AnnouncementsPage from '@/pages/courses/AnnouncementsPage.jsx';

const api = vi.hoisted(() => ({ fetchAnnouncements: vi.fn(), sendAnnouncement: vi.fn(), archiveAnnouncement: vi.fn() }));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/lib/announcements.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAnnouncements: (/** @type {any} */ q) => api.fetchAnnouncements(q),
  sendAnnouncement: (/** @type {any} */ a) => api.sendAnnouncement(a),
  archiveAnnouncement: (/** @type {string} */ id) => api.archiveAnnouncement(id),
}));
vi.mock('@/lib/courses/courses.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchCourses: async () => [{ id: 'c1', title: 'Introduction to Biblical Studies', course_code: 'BIB101' }],
}));
vi.mock('@/lib/branches.js', async (importOriginal) => ({ ...(await importOriginal()), fetchBranches: async () => [{ id: 'b1', name: 'Kumasi', position: 1, is_active: true }] }));

const settled = async () => {
  await act(() => new Promise((r) => setTimeout(r, 500)));
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
};
const sentOne = {
  id: 'n1',
  title: 'Class moved',
  body: "Saturday's class starts at 10:00.",
  created_at: '2026-11-11T09:00:00Z',
  course_id: 'c1',
  branch_id: null,
  to_everyone: false,
  recipients: 12,
  archived_at: null,
  course: { title: 'Introduction to Biblical Studies', course_code: 'BIB101' },
  branch: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchAnnouncements.mockResolvedValue([]);
  api.sendAnnouncement.mockResolvedValue('n2');
  api.archiveAnnouncement.mockResolvedValue(undefined);
});

describe('sending an announcement', () => {
  it('a lecturer writes to a course, confirms, and sees it sent', async () => {
    render(
      <MemoryRouter>
        <AnnouncementsPage role="lecturer" />
      </MemoryRouter>,
    );
    await screen.findByText('No announcements yet');
    await settled();
    const to = screen.getByLabelText('To');
    expect(within(to).queryByRole('option', { name: 'All learners' })).toBeNull();
    fireEvent.change(to, { target: { value: 'course:c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send announcement' }));
    expect(await screen.findByText('Give the announcement a title.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Class moved' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: "Saturday's class starts at 10:00." } });
    expect(screen.getByText('33 of 2000 characters')).toBeTruthy();
    api.fetchAnnouncements.mockResolvedValue([sentOne]);
    fireEvent.click(screen.getByRole('button', { name: 'Send announcement' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Send this announcement?' });
    expect(within(dialog).getByText(/It goes to the learners of BIB101 Introduction to Biblical Studies now, in the app and by email/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(api.sendAnnouncement).toHaveBeenCalledWith({ courseId: 'c1', branchId: null, everyone: false, title: 'Class moved', body: "Saturday's class starts at 10:00." }),
    );
    expect(toast.show).toHaveBeenCalledWith('staff.announcement-sent');
    expect(await screen.findByText('BIB101 Introduction to Biblical Studies · 12 learners · 11 Nov 2026, 09:00')).toBeTruthy();
  });

  it('an administrator can also write to all learners or a branch, and archive one', async () => {
    api.fetchAnnouncements.mockResolvedValue([sentOne]);
    render(
      <MemoryRouter>
        <AnnouncementsPage role="admin" />
      </MemoryRouter>,
    );
    await screen.findByTestId('sent-announcement');
    await settled();
    const to = screen.getByLabelText('To');
    expect(within(to).getByRole('option', { name: 'All learners' })).toBeTruthy();
    expect(within(to).getByRole('option', { name: 'Kumasi' })).toBeTruthy();
    fireEvent.change(to, { target: { value: 'branch:b1' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Branch meeting' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Friday at 18:00.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send announcement' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(api.sendAnnouncement).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'b1', courseId: null, everyone: false })));
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Class moved' }));
    await waitFor(() => expect(api.archiveAnnouncement).toHaveBeenCalledWith('n1'));
  });
});

describe("the learner's course page", () => {
  it('shows the course announcements', async () => {
    api.fetchAnnouncements.mockResolvedValue([sentOne]);
    render(<CourseAnnouncements courseId="c1" />);
    expect(await screen.findByText('Class moved')).toBeTruthy();
    expect(api.fetchAnnouncements).toHaveBeenCalledWith({ courseId: 'c1' });
    expect(screen.getByRole('heading', { name: 'Announcements' })).toBeTruthy();
  });
});
