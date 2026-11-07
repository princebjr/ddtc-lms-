import { ArrowLeft, FileText, Mic, PenLine } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { AudioPlayer } from '@/components/audio/AudioPlayer.jsx';
import { LessonPageSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fetchAssignment, fetchInstructionAudio } from '@/lib/assignments/assignments.js';
import { dueStatus, formatDue } from '@/lib/assignments/due.js';
import { fileSize } from '@/lib/audio/format.js';
import { fetchCourse } from '@/lib/courses/courses.js';
import { downloadMedia, playbackUrl } from '@/lib/lessons/lessons.js';
import { cleanForDisplay } from '@/lib/lessons/sanitize.js';
import { getSupabase } from '@/lib/supabase.js';

// The learner's assignment page (prototype `nsub`; Phase 7): the instructions (text, audio, or
// both), then the details: due date in Ghana time with their own extension (D13), whether late
// answers are accepted, maximum marks, and how they may answer: text or audio on every assignment
// (ADR-009), PDF and Word where allowed. Submitting arrives in Phase 8.

export default function LearnerAssignmentPage() {
  const { courseId = '', assignmentId = '' } = useParams();
  const toast = useToast();
  const page = useLoad(async () => {
    const [course, assignment, audio, extension] = await Promise.all([
      fetchCourse(courseId),
      fetchAssignment(assignmentId),
      fetchInstructionAudio(assignmentId),
      getSupabase().from('submission_extensions').select('extended_due_at').eq('assignment_id', assignmentId).maybeSingle(),
    ]);
    return { course, assignment, audio, extendedTo: /** @type {string | null} */ (extension.data?.extended_due_at ?? null) };
  }, [courseId, assignmentId]);

  if (page.state === 'error') return <ErrorState title="The assignment could not be loaded" onRetry={page.reload} />;
  if (page.state === 'ready' && (!page.data?.course || !page.data?.assignment || page.data.assignment.course_id !== courseId)) {
    return <EmptyState title="Assignment not found" description="It may not be published yet, or you are not enrolled in this course." />;
  }
  const d = page.data;
  const a = d?.assignment;
  const due = a ? dueStatus({ dueAt: a.due_at, allowLate: a.allow_late, extendedTo: d?.extendedTo }) : null;
  const files = a ? a.accepted_formats.filter((f) => f === 'PDF' || f === 'DOCX').map((f) => (f === 'PDF' ? 'PDF' : 'Word')) : [];

  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<LessonPageSkeleton />} onRetry={page.reload}>
      {d?.course && a && due ? (
        <article className="flex flex-col gap-6" aria-labelledby="assignment-title">
          <header className="flex flex-col gap-2">
            <Link to={`/learner/courses/${courseId}`} className="inline-flex min-h-11 items-center gap-1 self-start text-label text-link hover:underline focus-visible:focus-ring">
              <ArrowLeft className="size-4" aria-hidden="true" />
              {d.course.title}
            </Link>
            <h1 id="assignment-title" className="m-0 text-large-title break-words text-ink lg:text-title-1">
              {a.title}
            </h1>
            <span>
              <StatusChip tone={due.tone}>{due.label}</StatusChip>
            </span>
            {a.description ? <p className="m-0 text-body text-ink-secondary">{a.description}</p> : null}
          </header>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="flex flex-col gap-4 lg:col-span-2" aria-labelledby="instructions-title">
              <CardTitle id="instructions-title">Instructions</CardTitle>
              {d.audio ? (
                <AudioPlayer
                  title={`Instructions: ${a.title}`}
                  subtitle={d.course.title}
                  getUrl={() => playbackUrl(/** @type {any} */ (d.audio))}
                  durationSeconds={d.audio.duration_seconds}
                  peaks={d.audio.waveform_peaks}
                  fileSize={d.audio.file_size}
                  onDownload={async () => {
                    const audio = /** @type {NonNullable<typeof d.audio>} */ (d.audio);
                    toast.show('learner.audio-download', { params: { size: fileSize(audio.file_size) || 'audio' } });
                    await downloadMedia(/** @type {any} */ (audio)).catch(() => undefined);
                  }}
                />
              ) : null}
              {a.text_instructions ? (
                // Cleaned on the server when saved and again here (defence in depth).
                <div className="lesson-content" dangerouslySetInnerHTML={{ __html: cleanForDisplay(a.text_instructions) }} />
              ) : null}
              {a.grading_criteria ? (
                <div className="flex flex-col gap-1">
                  <h2 className="m-0 text-headline text-ink">How it is graded</h2>
                  <p className="m-0 whitespace-pre-line text-body text-ink-secondary">{a.grading_criteria}</p>
                </div>
              ) : null}
            </Card>

            <div className="flex flex-col gap-4">
              <Card className="flex flex-col gap-3" aria-labelledby="details-title">
                <CardTitle id="details-title">Details</CardTitle>
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
                  <dt className="text-ink-secondary">Due</dt>
                  <dd className="m-0 tabular-nums text-ink">{formatDue(due.effective)} (Ghana time)</dd>
                  {d.extendedTo ? (
                    <>
                      <dt className="text-ink-secondary">Extension</dt>
                      <dd className="m-0 text-ink">Your lecturer extended your due date.</dd>
                    </>
                  ) : null}
                  <dt className="text-ink-secondary">Late answers</dt>
                  <dd className="m-0 text-ink">{a.allow_late ? 'Accepted (marked late)' : 'Not accepted after the due date'}</dd>
                  <dt className="text-ink-secondary">Marks</dt>
                  <dd className="m-0 tabular-nums text-ink">{Number(a.max_marks)}</dd>
                </dl>
              </Card>
              <Card className="flex flex-col gap-3" aria-labelledby="answer-title">
                <CardTitle id="answer-title">Your answer</CardTitle>
                <CardDescription>You choose how to answer:</CardDescription>
                <ul className="m-0 flex list-none flex-col gap-2 p-0 text-body text-ink">
                  <li className="flex items-center gap-2">
                    <PenLine className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
                    Write a text answer
                  </li>
                  <li className="flex items-center gap-2">
                    <Mic className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
                    Record or upload an audio answer
                  </li>
                  {files.length ? (
                    <li className="flex items-center gap-2">
                      <FileText className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
                      Upload a {files.join(' or ')} file
                    </li>
                  ) : null}
                </ul>
                <p className="m-0 rounded-md bg-fill p-3 text-body-sm text-ink-secondary">Submitting answers arrives in Phase 8.</p>
              </Card>
            </div>
          </div>
        </article>
      ) : null}
    </LoadingRegion>
  );
}
