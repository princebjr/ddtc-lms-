import { ArrowLeft, Download, FilePlus2, FileText, Mic, Trash2 } from 'lucide-react';
import { lazy, Suspense, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AudioPlayer } from '@/components/audio/AudioPlayer.jsx';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { FormField } from '@/components/auth/FormField.jsx';
import { FormSkeleton, LessonPageSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fileSize } from '@/lib/audio/format.js';
import { computePeaks } from '@/lib/audio/peaks.js';
import { fetchCourse } from '@/lib/courses/courses.js';
import {
  downloadMedia,
  fetchAudioHistory,
  fetchLesson,
  fetchLessonMedia,
  LESSON_STATUS_LABEL,
  playbackUrl,
  removeAttachment,
  saveLesson,
  setLessonPublished,
} from '@/lib/lessons/lessons.js';
import { uploadFile } from '@/lib/uploads.js';

// Lesson editor for the course's lecturers and administrators (Phase 6; D08, D09, D17, D18,
// ADR-006): title and rich text (cleaned on the server), Save and Publish in a sticky action bar
// (UI_FEEDBACK), lesson audio with upload progress and its waveform computed in this browser while
// it uploads, Replace with the history kept, and attachments. An archived course is read-only.

const RichTextEditor = lazy(() => import('@/components/lessons/RichTextEditor.jsx'));
const AUDIO_ACCEPT = '.mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav';
const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav'];
const AUDIO_MAX = 100 * 1024 * 1024; // D17; the server checks again
const DOC_ACCEPT = '.pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation';
const DOC_EXTENSIONS = ['pdf', 'docx', 'pptx'];
const DOC_MAX = 25 * 1024 * 1024;

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' });
/** @param {string} name */
const extension = (name) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();

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
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [content, setContent] = useState(lesson?.content ?? '');
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
      const res = await saveLesson({ courseId: course.id, lessonId: lesson?.id, title: title.trim(), content });
      toast.show('lecturer.lesson-saved');
      if (!lesson) navigate(`/${role}/courses/${course.id}/lessons/${res.lessonId}`, { replace: true });
      else setContent(res.content);
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
              <AudioCard lessonId={lesson.id} courseId={course.id} lessonTitle={lesson.title} courseTitle={course.title} archived={archived} />
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

/**
 * Lesson audio: the current recording, Upload or Replace with progress, and the history (D09).
 * @param {{ lessonId: string, courseId: string, lessonTitle: string, courseTitle: string, archived: boolean }} props
 */
function AudioCard({ lessonId, courseId, lessonTitle, courseTitle, archived }) {
  const toast = useToast();
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const media = useLoad(async () => {
    const [m, history] = await Promise.all([fetchLessonMedia(lessonId), fetchAudioHistory(lessonId)]);
    return { audio: m.audio, history };
  }, [lessonId]);
  const [progress, setProgress] = useState(/** @type {null | { stage: string, fraction: number }} */ (null));
  const [problem, setProblem] = useState(/** @type {string | null} */ (null));
  const [showHistory, setShowHistory] = useState(false);
  const audio = media.data?.audio ?? null;

  /** @param {File} file */
  const upload = async (file) => {
    setProblem(null);
    if (!AUDIO_EXTENSIONS.includes(extension(file.name))) return setProblem('Use an MP3, M4A or WAV file.');
    if (file.size > AUDIO_MAX) return setProblem('The file is larger than 100 MB.');
    setProgress({ stage: 'Uploading', fraction: 0 });
    try {
      // The waveform is prepared here while the file uploads (ADR-006); the server checks its shape.
      const peaks = computePeaks(file).then((p) => (p ? { peaks: p } : {}));
      const res = /** @type {{ replaced: boolean }} */ (
        await uploadFile({
          resourceType: 'LESSON_AUDIO',
          file,
          courseId,
          lessonId,
          finalizeLater: peaks,
          onProgress: (fraction) => setProgress({ stage: fraction < 1 ? 'Uploading' : 'Checking the file', fraction }),
        })
      );
      toast.show(res.replaced ? 'lecturer.audio-replaced' : 'lecturer.audio-ready');
      media.reload();
    } catch (error) {
      const reason = /** @type {Error} */ (error).message.replace(/\.$/, '');
      toast.show('lecturer.audio-rejected', { params: { reason }, onAction: () => input.current?.click() });
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Lesson audio</CardTitle>
      <LoadingRegion loading={media.state === 'loading'} skeleton={<LessonPageSkeleton />} onRetry={media.reload}>
        {audio ? (
          // Standard size: the side card is too narrow for the one-row compact layout.
          <AudioPlayer
            title={lessonTitle}
            subtitle={courseTitle}
            getUrl={() => playbackUrl(audio)}
            durationSeconds={audio.duration_seconds}
            peaks={audio.waveform_peaks}
            fileSize={audio.file_size}
            onDownload={() => downloadMedia(audio)}
          />
        ) : (
          <CardDescription>No audio yet. MP3, M4A or WAV, up to 100 MB and 90 minutes.</CardDescription>
        )}
      </LoadingRegion>
      {progress ? (
        <div className="flex flex-col gap-2" role="status">
          <span className="text-body-sm text-ink-secondary">
            {progress.stage}
            {progress.stage === 'Uploading' ? ` ${Math.round(progress.fraction * 100)}%` : '…'}
          </span>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.fraction * 100)}
            className="h-2 overflow-hidden rounded-full bg-fill"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-base" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {archived ? null : (
        <>
          <input
            ref={input}
            type="file"
            accept={AUDIO_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <Button variant="outline" onClick={() => input.current?.click()} disabled={progress !== null}>
            <Mic aria-hidden="true" />
            {audio ? 'Replace audio' : 'Upload audio'}
          </Button>
        </>
      )}
      <FormMessage>{problem}</FormMessage>
      {media.data?.history?.length ? (
        <div className="flex flex-col gap-1 text-body-sm text-ink-secondary">
          <Button variant="ghost" className="self-start px-2" aria-expanded={showHistory} aria-controls="audio-history" onClick={() => setShowHistory((v) => !v)}>
            Audio history ({media.data.history.length})
          </Button>
          <ul id="audio-history" hidden={!showHistory} className="m-0 flex list-none flex-col gap-1 p-0">
            {media.data.history.map((h, i) => (
              <li key={h.id}>
                Version {media.data?.history ? media.data.history.length - i : ''}: {h.lifecycle_status === 'ACTIVE' ? 'in use' : `replaced ${h.superseded_at ? dateFormat.format(new Date(h.superseded_at)) : ''}`}
                {' · uploaded '}
                {dateFormat.format(new Date(h.created_at))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Attachments (PDF, DOCX, PPTX): add, download, remove (the file and the record are kept, D25).
 * @param {{ lessonId: string, courseId: string, archived: boolean }} props
 */
function AttachmentsCard({ lessonId, courseId, archived }) {
  const toast = useToast();
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const media = useLoad(() => fetchLessonMedia(lessonId), [lessonId]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(/** @type {string | null} */ (null));
  const [confirm, setConfirm] = useState(/** @type {import('@/lib/lessons/lessons.js').LessonMedia | null} */ (null));
  const attachments = media.data?.attachments ?? [];

  /** @param {File} file */
  const upload = async (file) => {
    setProblem(null);
    if (!DOC_EXTENSIONS.includes(extension(file.name))) return setProblem('Use a PDF, Word (.docx) or PowerPoint (.pptx) file.');
    if (file.size > DOC_MAX) return setProblem('The file is larger than 25 MB.');
    setBusy(true);
    try {
      await uploadFile({ resourceType: 'LESSON_ATTACHMENT', file, courseId, lessonId, finalize: { title: file.name.replace(/\.[^.]+$/, '') } });
      toast.show('lecturer.attachment-added');
      media.reload();
    } catch (error) {
      setProblem(/** @type {Error} */ (error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Attachments</CardTitle>
      {attachments.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0">
          {attachments.map((a) => (
            <li key={a.item_id} className="flex min-h-14 items-center gap-2 py-1">
              <FileText className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-label text-ink">{a.title}</span>
                <span className="text-caption text-ink-secondary">{fileSize(a.file_size)}</span>
              </span>
              <Button variant="ghost" className="px-0" onClick={() => downloadMedia(a)} aria-label={`Download ${a.title}`}>
                <Download aria-hidden="true" />
              </Button>
              {archived ? null : (
                <Button variant="ghost" className="px-0" onClick={() => setConfirm(a)} aria-label={`Remove ${a.title}`}>
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <CardDescription>No attachments. PDF, Word or PowerPoint, up to 25 MB.</CardDescription>
      )}
      {archived ? null : (
        <>
          <input
            ref={input}
            type="file"
            accept={DOC_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <Button variant="outline" onClick={() => input.current?.click()} loading={busy} loadingLabel="Uploading">
            <FilePlus2 aria-hidden="true" />
            Add attachment
          </Button>
        </>
      )}
      <FormMessage>{problem}</FormMessage>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        {confirm ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove {confirm.title}?</DialogTitle>
              <DialogDescription>Learners will no longer see it. The file is kept in the records.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const item = confirm;
                  setConfirm(null);
                  try {
                    await removeAttachment(item.item_id);
                    media.reload();
                  } catch (error) {
                    setProblem(/** @type {Error} */ (error).message);
                  }
                }}
              >
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}

