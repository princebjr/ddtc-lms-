import { ArrowLeft } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { FormField } from '@/components/auth/FormField.jsx';
import { FormSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useDraftAutosave, useDraftStart } from '@/hooks/use-draft.js';
import { useLoad } from '@/hooks/use-load.js';
import { fetchCourse } from '@/lib/courses/courses.js';
import { fetchLesson, LESSON_STATUS_LABEL, saveLesson, setLessonPublished } from '@/lib/lessons/lessons.js';
import { AttachmentsCard, AudioCard } from './LessonMediaCards.jsx';

// Lesson editor for the course's lecturers and administrators (Phase 6; D08, D09, D17, D18,
// ADR-006, ADR-007): title and rich text (cleaned on the server), Save and Publish in a sticky action
// bar (UI_FEEDBACK), then the lesson's audio files and attachments (LessonMediaCards.jsx). An archived
// course is read-only. Unsaved title and text are kept as a draft on this device and put back after
// an idle sign-out (D43).

const RichTextEditor = lazy(() => import('@/components/lessons/RichTextEditor.jsx'));

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function LessonEditorPage({ role }) {
  const { courseId = '', lessonId = 'new' } = useParams();
  const isNew = lessonId === 'new';
  const data = useLoad(async () => {
    const [course, lesson] = await Promise.all([fetchCourse(courseId), isNew ? Promise.resolve(null) : fetchLesson(lessonId)]);
    return { course, lesson };
  }, [courseId, lessonId]);

  if (data.state === 'error') return <ErrorState title="The lesson could not be loaded" onRetry={data.reload} />;
  if (data.state === 'ready' && (!data.data?.course || (!isNew && !data.data?.lesson))) {
    return <EmptyState title="Lesson not found" description="It may not exist, or you do not teach this course." />;
  }
  return (
    <LoadingRegion loading={data.state === 'loading'} skeleton={<FormSkeleton fields={3} />} onRetry={data.reload}>
      {data.data?.course ? (
        <Editor
          key={lessonId}
          role={role}
          course={data.data.course}
          lesson={data.data.lesson}
          onPublishedChange={(status) => data.setData((d) => ({ ...d, lesson: d.lesson ? { ...d.lesson, publication_status: status } : d.lesson }))}
        />
      ) : null}
    </LoadingRegion>
  );
}

/**
 * @param {{ role: 'admin' | 'lecturer', course: import('@/lib/courses/courses.js').Course, lesson: import('@/lib/lessons/lessons.js').Lesson | null,
 *   onPublishedChange: (status: import('@/lib/lessons/lessons.js').PublicationStatus) => void }} props
 */
function Editor({ role, course, lesson, onPublishedChange }) {
  const navigate = useNavigate();
  const toast = useToast();
  const archived = course.status === 'ARCHIVED';
  const draftKey = `lesson:${course.id}:${lesson?.id ?? 'new'}`;
  const [saved, setSaved] = useState(() => ({ title: lesson?.title ?? '', content: lesson?.content ?? '' }));
  const start = useDraftStart(draftKey, saved, { isNew: !lesson });
  const [title, setTitle] = useState(start.title);
  const [content, setContent] = useState(start.content);
  const clearDraft = useDraftAutosave(draftKey, saved, { title, content }, { isNew: !lesson });
  const [titleError, setTitleError] = useState(/** @type {string | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(/** @type {null | 'save' | 'publish'} */ (null));
  const back = `/${role}/courses/${course.id}/lessons`;
  const published = lesson?.publication_status === 'PUBLISHED';

  const save = async () => {
    setMessage(null);
    if (title.trim().length < 3) return setTitleError('Enter a title of at least 3 characters');
    setTitleError(null);
    setBusy('save');
    try {
      const trimmed = title.trim();
      const res = await saveLesson({ courseId: course.id, lessonId: lesson?.id, title: trimmed, content });
      clearDraft();
      toast.show('lecturer.lesson-saved');
      if (!lesson) navigate(`/${role}/courses/${course.id}/lessons/${res.lessonId}`, { replace: true });
      else {
        setTitle(trimmed);
        setContent(res.content);
        setSaved({ title: trimmed, content: res.content });
      }
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(null);
    }
  };

  /** @param {boolean} publish */
  const setPublished = async (publish) => {
    if (!lesson) return;
    setBusy('publish');
    setMessage(null);
    try {
      const status = await setLessonPublished(lesson.id, publish);
      onPublishedChange(status);
      toast.show(publish ? 'lecturer.lesson-published' : 'lecturer.lesson-unpublished', {
        onAction: async () => onPublishedChange(await setLessonPublished(lesson.id, !publish)),
      });
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link to={back} className="inline-flex min-h-11 items-center gap-1 self-start text-label text-link hover:underline focus-visible:focus-ring">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {course.title}
        </Link>
        <PageHeader title={lesson ? lesson.title : 'New lesson'} description={course.course_code} className="pb-0" />
        {lesson ? (
          <span>
            <StatusChip tone={published ? 'success' : 'neutral'}>{LESSON_STATUS_LABEL[lesson.publication_status]}</StatusChip>
          </span>
        ) : null}
        {archived ? (
          <p role="status" className="m-0 rounded-md bg-fill p-4 text-body-sm text-ink-secondary">
            This course is archived. Its lessons are read-only.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <FormField label="Lesson title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={archived} error={titleError ?? undefined} autoComplete="off" />
          <Suspense fallback={<div className="min-h-64 rounded-md border border-control bg-card" aria-busy="true" />}>
            <RichTextEditor value={content} onChange={setContent} label="Lesson text" disabled={archived} />
          </Suspense>
          <FormMessage>{message}</FormMessage>
        </div>
        <div className="flex flex-col gap-4">
          {lesson ? (
            <>
              <AudioCard lessonId={lesson.id} courseId={course.id} lessonTitle={lesson.title} archived={archived} />
              <AttachmentsCard lessonId={lesson.id} courseId={course.id} archived={archived} />
            </>
          ) : (
            <Card className="flex flex-col gap-2">
              <CardTitle>Audio and attachments</CardTitle>
              <CardDescription>Save the lesson first, then add its audio and any attachments.</CardDescription>
            </Card>
          )}
        </div>
      </div>

      {archived ? null : (
        // Sticky action bar (UI_FEEDBACK: Save and Publish never use a FAB); above the phone pill bar.
        <div className="sticky bottom-above-nav z-20 flex flex-col gap-2 rounded-lg border border-hairline bg-pill p-3 blur-material sm:flex-row sm:justify-end lg:bottom-4">
          {lesson ? (
            <Button variant="outline" onClick={() => setPublished(!published)} loading={busy === 'publish'} loadingLabel={published ? 'Unpublishing' : 'Publishing'} disabled={busy !== null}>
              {published ? 'Unpublish' : 'Publish'}
            </Button>
          ) : null}
          <Button onClick={save} loading={busy === 'save'} loadingLabel="Saving" disabled={busy !== null}>
            Save lesson
          </Button>
        </div>
      )}
    </div>
  );
}
