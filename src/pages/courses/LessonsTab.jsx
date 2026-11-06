import { ArrowDown, ArrowUp, Library, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { Fab } from '@/components/feedback/Fab.jsx';
import { LessonListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/use-media-query.js';
import { fetchLessons, LESSON_STATUS_LABEL, reorderLessons } from '@/lib/lessons/lessons.js';

// The course's Lessons tab for its lecturers and administrators (prototype `lcw`, D08): lessons in
// order with their status and audio, Move up and Move down (saved at once for the whole course,
// with Undo), and Add lesson (a FAB on phones for the course's lecturers, UI_FEEDBACK). An archived
// course is read-only.

/** @typedef {import('@/lib/lessons/lessons.js').LessonSummary} LessonSummary */

/** @param {{ role: 'admin' | 'lecturer', courseId: string, archived: boolean, isLecturer: boolean }} props */
export function LessonsTab({ role, courseId, archived, isLecturer }) {
  const navigate = useNavigate();
  const toast = useToast();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const list = useLoad(() => fetchLessons(courseId, { withAudio: true }), [courseId]);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  const base = `/${role}/courses/${courseId}/lessons`;
  const lessons = list.data ?? [];

  /** @param {LessonSummary[]} next @param {LessonSummary[]} previous */
  const saveOrder = async (next, previous) => {
    setBusy(true);
    setMessage(null);
    list.setData(() => next.map((l, i) => ({ ...l, position: i + 1 })));
    try {
      await reorderLessons(courseId, next.map((l) => l.id));
      toast.show('lecturer.order-saved', {
        onAction: async () => {
          await reorderLessons(courseId, previous.map((l) => l.id));
          list.reload();
        },
      });
    } catch (error) {
      list.setData(() => previous);
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(false);
    }
  };

  /** @param {number} index @param {-1 | 1} step */
  const move = (index, step) => {
    const next = [...lessons];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item);
    saveOrder(next, lessons);
  };

  // Desktop: a header button. Phones and tablets: the FAB for the course's lecturers (UI_FEEDBACK
  // FAB table); administrators keep the button.
  const showButton = !archived && (desktop || !isLecturer);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-body-sm text-ink-secondary">
          {archived ? 'This course is archived; its lessons are read-only.' : 'Learners see published lessons in this order.'}
        </p>
        {showButton ? (
          <Button onClick={() => navigate(`${base}/new`)}>
            <Plus aria-hidden="true" />
            Add lesson
          </Button>
        ) : null}
      </div>
      <FormMessage>{message}</FormMessage>
      {list.state === 'error' ? (
        <ErrorState title="The lessons could not be loaded" onRetry={list.reload} />
      ) : (
        <LoadingRegion loading={list.state === 'loading'} skeleton={<LessonListSkeleton />} onRetry={list.reload}>
          {lessons.length ? (
            <ol className="m-0 flex list-none flex-col divide-y divide-hairline rounded-md border border-hairline bg-card p-0" aria-label="Lessons in order">
              {lessons.map((l, i) => (
                <li key={l.id} className="flex min-h-16 items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4">
                  <span className="w-8 shrink-0 text-center text-label text-ink-secondary" aria-hidden="true">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(`${base}/${l.id}`)}
                    className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center rounded-sm text-left hover:underline focus-visible:focus-ring"
                  >
                    <span className="w-full truncate text-label text-ink">
                      <span className="sr-only">Lesson {i + 1}: </span>
                      {l.title}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-2">
                      <StatusChip tone={l.publication_status === 'PUBLISHED' ? 'success' : 'neutral'}>{LESSON_STATUS_LABEL[l.publication_status]}</StatusChip>
                      <StatusChip tone={l.has_audio ? 'info' : 'neutral'}>{l.has_audio ? 'Audio ready' : 'No audio'}</StatusChip>
                    </span>
                  </button>
                  {archived ? null : (
                    <span className="flex shrink-0 gap-1">
                      <Button variant="ghost" className="px-0" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${l.title} up`}>
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" className="px-0" disabled={busy || i === lessons.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${l.title} down`}>
                        <ArrowDown aria-hidden="true" />
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState icon={Library} title="No lessons yet" description={archived ? undefined : 'Add the first lesson. It stays a draft until you publish it.'} />
          )}
        </LoadingRegion>
      )}
      <Fab label="Add lesson" onClick={() => navigate(`${base}/new`)} allowed={isLecturer} archived={archived} />
    </div>
  );
}
