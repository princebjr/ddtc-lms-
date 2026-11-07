import DOMPurify from 'dompurify';
import { ArrowLeft, ArrowRight, CircleCheck, Download, FileText } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { AudioPlayer } from '@/components/audio/AudioPlayer.jsx';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { LessonPageSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardTitle } from '@/components/ui/card.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fileSize } from '@/lib/audio/format.js';
import { fetchCourse, fetchMyEnrolment } from '@/lib/courses/courses.js';
import { downloadMedia, fetchLesson, fetchLessonMedia, fetchLessons, fetchMyProgress, markLesson, playbackUrl } from '@/lib/lessons/lessons.js';

// The learner's lesson page (Phase 6; RESPONSIVE.md 15.2 "Lesson page"): the lesson text first at
// reading width, the full-width audio player, attachments, then Previous, Next and the completion
// button within thumb reach. A COMPLETED enrolment (D05) or an ARCHIVED course (D07) is read-only:
// the lesson can be read and played, but not marked.

// Same allow-list as the server (supabase/functions/_shared/lesson-html.ts): cleaned once more here.
const ALLOWED = {
  ALLOWED_TAGS: ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan', 'start'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
};

export default function LearnerLessonPage() {
  const { courseId = '', lessonId = '' } = useParams();
  const toast = useToast();
  const page = useLoad(async () => {
    const [course, lessons, lesson, media, progress, enrolment] = await Promise.all([
      fetchCourse(courseId),
      fetchLessons(courseId),
      fetchLesson(lessonId),
      fetchLessonMedia(lessonId),
      fetchMyProgress(courseId),
      fetchMyEnrolment(courseId),
    ]);
    return { course, lessons, lesson, media, progress, enrolment };
  }, [courseId, lessonId]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  if (page.state === 'error') return <ErrorState title="The lesson could not be loaded" onRetry={page.reload} />;
  if (page.state === 'ready' && (!page.data?.course || !page.data?.lesson)) {
    return <EmptyState title="Lesson not found" description="It may not be published yet, or you are not enrolled in this course." />;
  }
  const d = page.data;
  const index = d?.lessons.findIndex((l) => l.id === lessonId) ?? -1;
  const previous = d && index > 0 ? d.lessons[index - 1] : null;
  const next = d && index >= 0 && index < d.lessons.length - 1 ? d.lessons[index + 1] : null;
  const done = Boolean(d?.progress[lessonId]);
  const readOnly = d?.course?.status === 'ARCHIVED' || d?.enrolment === 'COMPLETED';
  const base = `/learner/courses/${courseId}`;

  /** @param {boolean} completed */
  const mark = async (completed) => {
    setBusy(true);
    setMessage(null);
    try {
      await markLesson(lessonId, completed);
      page.setData((p) => ({ ...p, progress: { ...p.progress, [lessonId]: completed } }));
      toast.show(completed ? 'learner.lesson-completed' : 'learner.lesson-not-complete', { onAction: () => mark(!completed) });
    } catch {
      setMessage('Your progress could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<LessonPageSkeleton />} onRetry={page.reload}>
      {d?.course && d.lesson ? (
        <article className="flex flex-col gap-6" aria-labelledby="lesson-title">
          <header className="flex flex-col gap-2">
            <Link to={base} className="inline-flex min-h-11 items-center gap-1 self-start text-label text-link hover:underline focus-visible:focus-ring">
              <ArrowLeft className="size-4" aria-hidden="true" />
              {d.course.title}
            </Link>
            <p className="m-0 text-label text-ink-secondary">
              Lesson {index + 1} of {d.lessons.length}
              {done ? ' · Completed' : ''}
            </p>
            <h1 id="lesson-title" className="m-0 text-large-title break-words text-ink lg:text-title-1">
              {d.lesson.title}
            </h1>
          </header>

          {d.media.audios.length ? (
            // One player per audio file, in the lecturer's order (ADR-007); starting one pauses the others.
            <section aria-label="Lesson audio" className="flex flex-col gap-3">
              {d.media.audios.map((audio) => (
                <div key={audio.item_id} className="flex flex-col gap-2">
                  {/* The title for the eye; the player region carries it for screen readers. */}
                  <p className="m-0 truncate text-label text-ink" aria-hidden="true">
                    {audio.title}
                  </p>
                  <AudioPlayer
                    title={audio.title}
                    subtitle={d.lesson?.title}
                    getUrl={() => playbackUrl(audio)}
                    durationSeconds={audio.duration_seconds}
                    peaks={audio.waveform_peaks}
                    fileSize={audio.file_size}
                    onDownload={async () => {
                      toast.show('learner.audio-download', { params: { size: fileSize(audio.file_size) || 'audio' } });
                      try {
                        await downloadMedia(audio);
                      } catch {
                        setMessage('The download did not start. Check your connection and try again.');
                      }
                    }}
                  />
                </div>
              ))}
            </section>
          ) : null}

          {d.lesson.content ? (
            // Cleaned on the server when saved and again here (defence in depth).
            <div className="lesson-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(d.lesson.content, ALLOWED) }} />
          ) : null}

          {d.media.attachments.length ? (
            <Card className="flex flex-col gap-3">
              <CardTitle>Attachments</CardTitle>
              <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0">
                {d.media.attachments.map((a) => (
                  <li key={a.item_id} className="flex min-h-14 items-center gap-3 py-1">
                    <FileText className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
                    <span className="min-w-0 flex-1 line-clamp-2 break-words text-label text-ink">{a.title}</span>
                    <Button
                      variant="outline"
                      onClick={() => downloadMedia(a).catch(() => setMessage('The download did not start. Try again.'))}
                      aria-label={`Download ${a.title} (${fileSize(a.file_size)})`}
                    >
                      <Download aria-hidden="true" />
                      <span>
                        Download <span className="text-ink-secondary">({fileSize(a.file_size)})</span>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <FormMessage>{message}</FormMessage>

          <footer className="flex flex-col gap-3 border-t border-hairline pt-4">
            {readOnly ? (
              <p className="m-0 text-body-sm text-ink-secondary">
                {d.course.status === 'ARCHIVED' ? 'This course is archived: lessons stay readable, but progress cannot change.' : 'You have completed this course: lessons stay readable, but progress cannot change.'}
              </p>
            ) : (
              <Button size="auth" variant={done ? 'outline' : 'primary'} onClick={() => mark(!done)} loading={busy} loadingLabel="Saving">
                <CircleCheck aria-hidden="true" />
                {done ? 'Completed. Mark as not complete' : 'Mark complete'}
              </Button>
            )}
            <nav aria-label="Lessons" className="grid grid-cols-2 gap-3">
              {previous ? (
                <Button asChild variant="secondary">
                  <Link to={`${base}/lessons/${previous.id}`} aria-label={`Previous lesson: ${previous.title}`}>
                    <ArrowLeft aria-hidden="true" />
                    Previous
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              {next ? (
                <Button asChild variant="secondary">
                  <Link to={`${base}/lessons/${next.id}`} aria-label={`Next lesson: ${next.title}`}>
                    Next
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          </footer>
        </article>
      ) : null}
    </LoadingRegion>
  );
}
