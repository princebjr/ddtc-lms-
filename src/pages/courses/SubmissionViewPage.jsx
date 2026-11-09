import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { BranchChip } from '@/components/branches/BranchChip.jsx';
import { LessonPageSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { VersionList } from '@/components/submissions/VersionList.jsx';
import { Card } from '@/components/ui/card.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { useProfileImage } from '@/hooks/use-profile-image.js';
import { fetchAssignment } from '@/lib/assignments/assignments.js';
import { formatDue } from '@/lib/assignments/due.js';
import { formatIdNumber } from '@/lib/id-number.js';
import { fetchSubmissionReview } from '@/lib/submissions/submissions.js';

// One learner's answer, read-only, for the course's lecturers and administrators (Phase 8; D10, D42):
// the learner with their ID number and branch, the due date and any extension, and every version
// sent (the latest is the one graded; older ones are kept). Phase 9 adds the grading panel here.

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function SubmissionViewPage({ role }) {
  const { courseId = '', assignmentId = '', learnerId = '' } = useParams();
  const page = useLoad(async () => {
    const [assignment, review] = await Promise.all([fetchAssignment(assignmentId), fetchSubmissionReview(assignmentId, learnerId)]);
    return { assignment, review };
  }, [assignmentId, learnerId]);

  if (page.state === 'error') return <ErrorState title="The answer could not be loaded" onRetry={page.reload} />;
  const d = page.data;
  if (page.state === 'ready' && (!d?.assignment || !d.review || d.assignment.course_id !== courseId)) {
    return <EmptyState title="Answer not found" description="It may not exist, or you do not teach this course." />;
  }
  const r = d?.review;
  const a = d?.assignment;

  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<LessonPageSkeleton />} onRetry={page.reload}>
      {r && a ? (
        <article className="flex flex-col gap-6" aria-labelledby="answer-learner">
          <Link
            to={`/${role}/courses/${courseId}/assignments/${assignmentId}/submissions`}
            className="inline-flex min-h-11 items-center gap-1 self-start text-label text-link hover:underline focus-visible:focus-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Submissions: {a.title}
          </Link>
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Avatar learner={r.learner} />
              <div className="flex min-w-0 flex-col gap-1">
                <h1 id="answer-learner" className="m-0 text-title-2 break-words text-ink">
                  {r.learner.first_name} {r.learner.second_name}
                </h1>
                <span className="text-body-sm text-ink-secondary tabular-nums">ID number {formatIdNumber(r.learner.id_number)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <BranchChip name={r.learner.branch_name} />
              {r.status ? (
                <StatusChip tone="info">{r.status === 'GRADED' ? 'Graded' : r.status === 'REOPENED' ? 'Reopened' : 'Submitted'}</StatusChip>
              ) : (
                <StatusChip>Not submitted</StatusChip>
              )}
              {r.is_late ? <StatusChip tone="warning">Late</StatusChip> : null}
            </div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
              <dt className="text-ink-secondary">Assignment</dt>
              <dd className="m-0 break-words text-ink">{a.title}</dd>
              <dt className="text-ink-secondary">Due</dt>
              <dd className="m-0 tabular-nums text-ink">{formatDue(r.due_at)} (Ghana time)</dd>
              {r.extended_due_at ? (
                <>
                  <dt className="text-ink-secondary">Extension</dt>
                  <dd className="m-0 text-ink">
                    <span className="tabular-nums">{formatDue(r.extended_due_at)}</span>
                    {r.extension_reason ? ` (${r.extension_reason})` : ''}
                  </dd>
                </>
              ) : null}
            </dl>
          </Card>
          {r.versions.length ? (
            <VersionList versions={r.versions} title={`${r.learner.first_name} ${r.learner.second_name}: ${a.title}`} heading="Answers" latestLabel="Latest" />
          ) : (
            <EmptyState title="No answer yet" description="This learner has not submitted an answer." />
          )}
        </article>
      ) : null}
    </LoadingRegion>
  );
}

/** @param {{ learner: { first_name: string, second_name: string, profile_image_path: string | null } }} props */
function Avatar({ learner }) {
  const imageUrl = useProfileImage(learner.profile_image_path);
  return <UserAvatar firstName={learner.first_name} secondName={learner.second_name} imageUrl={imageUrl} size={56} decorative />;
}
