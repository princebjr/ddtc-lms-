import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { AudioPlayer } from '@/components/audio/AudioPlayer.jsx';
import { LoadingRegion, SubmissionSkeleton } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { LearnerGradeCard } from '@/components/grading/LearnerGradeCard.jsx';
import { AnswerForm } from '@/components/submissions/AnswerForm.jsx';
import { VersionList } from '@/components/submissions/VersionList.jsx';
import { Card, CardTitle } from '@/components/ui/card.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fetchAssignment, fetchInstructionAudio } from '@/lib/assignments/assignments.js';
import { dueStatus, formatDue } from '@/lib/assignments/due.js';
import { fileSize } from '@/lib/audio/format.js';
import { fetchCourse } from '@/lib/courses/courses.js';
import { fetchMyGrade, markGradeNotificationsRead } from '@/lib/grading/grading.js';
import { downloadMedia, playbackUrl } from '@/lib/lessons/lessons.js';
import { cleanForDisplay } from '@/lib/lessons/sanitize.js';
import { blockedMessage, fetchMySubmission } from '@/lib/submissions/submissions.js';

// The learner's assignment page (prototype `nsub`; Phase 7): the instructions (text, audio, or
// both), then the details: due date in Ghana time with their own extension (D13), whether late
// answers are accepted, maximum marks; then the answer (Phase 8): text, recordings and uploads in
// one answer (owner decision 1), sent as the next version while the server allows it (D10, owner
// decision 3), and every version sent. Whether an answer may be sent and whether it would be late
// come from my_submission() on the server (D24). Once released, the grade comes first (Phase 9;
// D16; owner decision 2): my_grade() only ever returns a released grade; opening the page marks that
// assignment's grade notifications read.

/** ", PDF or Word" for the answer kinds the lecturer added (ADR-009). @param {string[]} formats */
function answerFiles(formats) {
  const extra = formats.filter((f) => f === 'PDF' || f === 'DOCX').map((f) => (f === 'PDF' ? 'PDF' : 'Word'));
  return extra.length ? `; ${extra.join(' or ')} files too` : '';
}

export default function LearnerAssignmentPage() {
  const { courseId = '', assignmentId = '' } = useParams();
  const toast = useToast();
  const page = useLoad(async () => {
    const [course, assignment, audio, mine, grade] = await Promise.all([
      fetchCourse(courseId),
      fetchAssignment(assignmentId),
      fetchInstructionAudio(assignmentId),
      fetchMySubmission(assignmentId),
      fetchMyGrade(assignmentId),
    ]);
    return {
      course,
      assignment,
      audio,
      mine,
      grade,
      extendedTo: mine?.extended ? mine.effective_due_at : null,
    };
  }, [courseId, assignmentId]);
  const shown = Boolean(page.data?.grade);
  useEffect(() => {
    // A grade on screen is a grade seen: its notifications count as read (the toast stops showing).
    if (shown) markGradeNotificationsRead(assignmentId).catch(() => undefined);
  }, [shown, assignmentId]);

  if (page.state === 'error') return <ErrorState title="The assignment could not be loaded" onRetry={page.reload} />;
  if (page.state === 'ready' && (!page.data?.course || !page.data?.assignment || page.data.assignment.course_id !== courseId)) {
    return <EmptyState title="Assignment not found" description="It may not be published yet, or you are not enrolled in this course." />;
  }
  const d = page.data;
  const a = d?.assignment;
  const due = a
    ? dueStatus({
        dueAt: a.due_at,
        allowLate: a.allow_late,
        extendedTo: d?.extendedTo,
      })
    : null;
  const mine = d?.mine ?? null;
  const sent = mine?.versions[0] ?? null;

  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<SubmissionSkeleton />} onRetry={page.reload}>
      {d?.course && a && due ? (
        <article className="flex flex-col gap-6" aria-labelledby="assignment-title">
          <header className="flex flex-col gap-2">
            <Link
              to={`/learner/courses/${courseId}`}
              className="inline-flex min-h-11 items-center gap-1 self-start text-label text-link hover:underline focus-visible:focus-ring"
            >
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
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
              {d.grade ? <LearnerGradeCard grade={d.grade} /> : null}
              <Card className="flex flex-col gap-4" aria-labelledby="instructions-title">
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
                      toast.show('learner.audio-download', {
                        params: { size: fileSize(audio.file_size) || 'audio' },
                      });
                      await downloadMedia(/** @type {any} */ (audio)).catch(() => undefined);
                    }}
                  />
                ) : null}
                {a.text_instructions ? (
                  // Cleaned on the server when saved and again here (defence in depth).
                  <div
                    className="lesson-content"
                    dangerouslySetInnerHTML={{
                      __html: cleanForDisplay(a.text_instructions),
                    }}
                  />
                ) : null}
                {a.grading_criteria ? (
                  <div className="flex flex-col gap-1">
                    <h2 className="m-0 text-headline text-ink">How it is graded</h2>
                    <p className="m-0 whitespace-pre-line text-body text-ink-secondary">{a.grading_criteria}</p>
                  </div>
                ) : null}
              </Card>
              {mine?.can_submit ? (
                <Card>
                  <AnswerForm key={mine.current_version} assignmentId={assignmentId} title={a.title} mine={mine} onSent={page.reload} />
                </Card>
              ) : mine ? (
                <Card className="flex flex-col gap-2" aria-labelledby="closed-title">
                  <CardTitle id="closed-title">{sent ? 'Your answer' : 'Answers'}</CardTitle>
                  <p className="m-0 text-body text-ink-secondary">
                    {mine.blocked_reason === 'graded' && !d.grade
                      ? 'Your answer is being graded, so it cannot be sent again. Your grade will appear here once it is released.'
                      : blockedMessage(mine.blocked_reason)}
                  </p>
                </Card>
              ) : null}
              {mine ? <VersionList versions={mine.versions} title={a.title} /> : null}
            </div>

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
                  <dt className="text-ink-secondary">Answers</dt>
                  <dd className="m-0 text-ink">Text or audio{answerFiles(a.accepted_formats)}</dd>
                  <dt className="text-ink-secondary">Your answer</dt>
                  <dd className="m-0 text-ink">
                    {sent ? `Version ${sent.version_number} sent ${formatDue(sent.submitted_at)}${sent.is_late ? ' (late)' : ''}` : 'Not sent yet'}
                  </dd>
                </dl>
              </Card>
            </div>
          </div>
        </article>
      ) : null}
    </LoadingRegion>
  );
}
