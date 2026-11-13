// @vitest-environment jsdom
// ADR-007 (owner decisions 2026-11-07): deleting lesson audio, attachments and course covers.
// Delete controls appear for the course's lecturers and administrators (the editor and course
// workspace), never on a learner's page and never on an archived course; every delete asks first
// ("Delete this audio? This cannot be undone.", Cancel, destructive Delete); Delete shows a loading
// state; the item goes only after the server confirms, with a success toast; a failure shows an
// error toast with Try again and leaves the item in place.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast as sonner } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContextForTests } from '@/components/auth/AuthProvider.jsx';
import { ToastProvider } from '@/components/feedback/ToastProvider.jsx';

const api = vi.hoisted(() => ({
  media: /** @type {{ audios: any[], attachments: any[] }} */ ({ audios: [], attachments: [] }),
  history: /** @type {any[]} */ ([]),
  deleteMedia: /** @type {import('vitest').Mock} */ (/** @type {unknown} */ (null)),
}));

vi.mock('@/lib/lessons/lessons.js', async (importOriginal) => ({
  .../** @type {object} */ (await importOriginal()),
  fetchLessonMedia: vi.fn(async () => structuredClone(api.media)),
  fetchAudioHistory: vi.fn(async () => structuredClone(api.history)),
  fetchLesson: vi.fn(async () => ({
    id: 'lesson-1',
    course_id: 'course-1',
    title: 'Welcome and overview',
    content: '<p>Welcome</p>',
    position: 1,
    publication_status: 'PUBLISHED',
  })),
  fetchLessons: vi.fn(async () => [{ id: 'lesson-1', title: 'Welcome and overview', position: 1, publication_status: 'PUBLISHED', audio_count: 2 }]),
  fetchMyProgress: vi.fn(async () => ({})),
  playbackUrl: vi.fn(async () => 'https://example.test/audio.mp3'),
}));
vi.mock('@/lib/media.js', () => ({ deleteMedia: (/** @type {string} */ kind, /** @type {string} */ id) => api.deleteMedia(kind, id) }));
vi.mock('@/lib/courses/courses.js', async (importOriginal) => ({
  .../** @type {object} */ (await importOriginal()),
  fetchCourse: vi.fn(async () => ({ id: 'course-1', title: 'Introduction to Biblical Studies', status: 'PUBLISHED' })),
  fetchMyEnrolment: vi.fn(async () => 'ACTIVE'),
}));
vi.mock('@/hooks/use-course-covers.js', () => ({ useCourseCovers: () => ({ 'course-1': 'https://example.test/cover.png' }) }));
// The learner's lesson screen reads everything in one call since Phase 15 (get_lesson_page).
vi.mock('@/lib/pages/page-reads.js', () => ({
  fetchLessonPage: vi.fn(async () => ({
    course: { id: 'course-1', title: 'Introduction to Biblical Studies', status: 'PUBLISHED' },
    lessons: [{ id: 'lesson-1', title: 'Welcome and overview', position: 1, publication_status: 'PUBLISHED', audio_count: 2 }],
    lesson: { id: 'lesson-1', course_id: 'course-1', title: 'Welcome and overview', content: '<p>Welcome</p>', position: 1, publication_status: 'PUBLISHED' },
    media: structuredClone(api.media),
    progress: {},
    enrolment: 'ACTIVE',
  })),
}));

const { AttachmentsCard, AudioCard } = await import('@/pages/courses/LessonMediaCards.jsx');
const { CoverCard } = await import('@/pages/courses/CourseWorkspacePage.jsx');
const { default: LearnerLessonPage } = await import('@/pages/learner/LearnerLessonPage.jsx');

/** @param {string} id @param {string} title @param {number} position */
const audio = (id, title, position) => ({
  kind: 'AUDIO',
  item_id: id,
  file_object_id: `f-${id}`,
  title,
  bucket_name: 'lesson-audio',
  storage_path: `c/l/${id}.mp3`,
  safe_download_filename: `${id}.mp3`,
  mime_type: 'audio/mpeg',
  file_size: 1_000_000,
  duration_seconds: 60,
  waveform_peaks: Array.from({ length: 128 }, () => 0.5),
  sort_order: position,
});
const attachment = (/** @type {string} */ id, /** @type {string} */ title) => ({
  kind: 'ATTACHMENT',
  item_id: id,
  file_object_id: `f-${id}`,
  title,
  bucket_name: 'lesson-attachments',
  storage_path: `c/l/${id}.pdf`,
  safe_download_filename: `${id}.pdf`,
  mime_type: 'application/pdf',
  file_size: 20_000,
  duration_seconds: null,
  waveform_peaks: null,
  sort_order: 1,
});

// The audio card reads the signed-in lecturer since Phase 8 (its recordings are kept as drafts per user).
const lecturer = /** @type {any} */ ({ status: 'signed-in', profile: { id: 'lecturer-1', role: 'LECTURER' } });

/** @param {import('react').ReactNode} ui */
const withToasts = (ui) =>
  render(
    <AuthContextForTests.Provider value={lecturer}>
      <ToastProvider>{ui}</ToastProvider>
    </AuthContextForTests.Provider>,
  );

beforeEach(() => {
  api.media = { audios: [audio('a1', 'Part 1', 1), audio('a2', 'Part 2', 2)], attachments: [attachment('x1', 'Lesson notes')] };
  api.history = [];
  api.deleteMedia = vi.fn(async () => ({ deleted: true, already: false, fileRemoved: true }));
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => sonner.dismiss());

describe('who sees delete controls', () => {
  it('the lesson editor offers Delete on every audio and attachment to the course lecturers and administrators', async () => {
    withToasts(
      <>
        <AudioCard lessonId="lesson-1" courseId="course-1" lessonTitle="Welcome and overview" archived={false} />
        <AttachmentsCard lessonId="lesson-1" courseId="course-1" archived={false} />
      </>,
    );
    expect(await screen.findByRole('button', { name: 'Delete Part 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Part 2' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Delete Lesson notes' })).toBeInTheDocument();
    expect(screen.getByText('2 of 10')).toBeInTheDocument();
  });

  it('an archived course shows no delete, rename, replace or move controls', async () => {
    withToasts(
      <>
        <AudioCard lessonId="lesson-1" courseId="course-1" lessonTitle="Welcome and overview" archived />
        <AttachmentsCard lessonId="lesson-1" courseId="course-1" archived />
      </>,
    );
    await screen.findByRole('button', { name: 'Play Part 1' });
    await screen.findByText('Lesson notes');
    expect(screen.queryByRole('button', { name: /^(Delete|Rename|Replace|Move) / })).toBeNull();
  });

  it('a learner never sees delete controls: one player per audio, in order, and Download only', async () => {
    withToasts(
      <MemoryRouter initialEntries={['/learner/courses/course-1/lessons/lesson-1']}>
        <Routes>
          <Route path="/learner/courses/:courseId/lessons/:lessonId" element={<LearnerLessonPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const players = await screen.findAllByRole('region', { name: /^Audio: / });
    expect(players.map((p) => p.getAttribute('aria-label'))).toEqual(['Audio: Part 1', 'Audio: Part 2']);
    expect(screen.getAllByRole('button', { name: /^Download/ })).toHaveLength(3); // each audio and the attachment
    expect(screen.queryByRole('button', { name: /Delete|Remove|Rename|Replace/ })).toBeNull();
  });

  it('the course cover offers Remove only to people who may edit the course, and only when there is a cover', () => {
    const course = /** @type {any} */ ({ id: 'course-1', title: 'Introduction to Biblical Studies', cover_image_file_id: 'cover-1' });
    const { rerender } = withToasts(<CoverCard course={course} canEdit onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: 'Remove cover image' })).toBeInTheDocument();
    rerender(
      <ToastProvider>
        <CoverCard course={course} canEdit={false} onChanged={() => {}} />
      </ToastProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Remove cover image' })).toBeNull();
    rerender(
      <ToastProvider>
        <CoverCard course={{ ...course, cover_image_file_id: null }} canEdit onChanged={() => {}} />
      </ToastProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Remove cover image' })).toBeNull();
  });
});

describe('confirming a delete', () => {
  it('asks first; Cancel keeps the audio and calls nothing', async () => {
    withToasts(<AudioCard lessonId="lesson-1" courseId="course-1" lessonTitle="Welcome and overview" archived={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Part 1' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this audio?' });
    expect(within(dialog).getByText(/This cannot be undone\./)).toBeInTheDocument();
    expect(within(dialog).getByText(/Part 1/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.deleteMedia).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete Part 1' })).toBeInTheDocument();
  });

  it('shows a loading state, removes the audio only once the server confirms, then says so', async () => {
    /** @type {(value: unknown) => void} */
    let finish = () => {};
    api.deleteMedia = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    withToasts(<AudioCard lessonId="lesson-1" courseId="course-1" lessonTitle="Welcome and overview" archived={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Part 1' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(api.deleteMedia).toHaveBeenCalledWith('lesson-audio', 'a1');
    const pending = within(screen.getByRole('alertdialog')).getByRole('button', { name: /Delet/ });
    expect(pending).toHaveAttribute('aria-busy', 'true');
    // Still there while waiting (the open dialog hides the page from assistive technology, so look past it).
    expect(screen.getByRole('button', { name: 'Play Part 1', hidden: true })).toBeInTheDocument();

    api.media = { ...api.media, audios: [audio('a2', 'Part 2', 1)] };
    await act(async () => finish({ deleted: true, already: false, fileRemoved: true }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Play Part 1' })).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText('Audio deleted')).toBeInTheDocument();
  });

  it('on failure shows an error toast with Try again and keeps the attachment', async () => {
    api.deleteMedia = vi.fn(async () => {
      throw new Error('This is taking too long. Check your connection and try again.');
    });
    withToasts(<AttachmentsCard lessonId="lesson-1" courseId="course-1" archived={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Lesson notes' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete this attachment?' })).toBeInTheDocument();
    await act(async () => fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' })));
    expect(await screen.findByText('Could not delete: This is taking too long. Check your connection and try again')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByText('Lesson notes')).toBeInTheDocument();
    expect(api.deleteMedia).toHaveBeenCalledWith('lesson-attachment', 'x1');
  });

  it('removing a cover asks first, then the course reloads with the placeholder', async () => {
    const onChanged = vi.fn();
    const course = /** @type {any} */ ({ id: 'course-1', title: 'Introduction to Biblical Studies', cover_image_file_id: 'cover-1' });
    withToasts(<CoverCard course={course} canEdit onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove cover image' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Remove this cover image?' });
    expect(within(dialog).getByText(/placeholder.*This cannot be undone\./)).toBeInTheDocument();
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' })));
    expect(api.deleteMedia).toHaveBeenCalledWith('course-cover', 'course-1');
    expect(onChanged).toHaveBeenCalled();
    expect(await screen.findByText('Cover image removed')).toBeInTheDocument();
  });
});
