import { ArrowLeft, CalendarClock, Eye } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BranchChip } from '@/components/branches/BranchChip.jsx';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { ExtensionDialog } from '@/components/submissions/ExtensionDialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { useProfileImage } from '@/hooks/use-profile-image.js';
import { fetchAssignment } from '@/lib/assignments/assignments.js';
import { formatDue } from '@/lib/assignments/due.js';
import { fetchCourse } from '@/lib/courses/courses.js';
import { formatIdNumber } from '@/lib/id-number.js';
import { fetchAssignmentSubmissions } from '@/lib/submissions/submissions.js';

// An assignment's submissions for its course's lecturers and administrators (Phase 8; D10, D13, D42):
// every learner of the course with their branch chip, status, latest version and time, lateness and
// effective due date; View answer opens the read-only answer (Phase 9 adds grading there) and
// Extension sets, changes or takes back one learner's extension (owner decision 6). A draft (uploads
// waiting, nothing sent) shows as not submitted.

/** @typedef {import('@/lib/submissions/submissions.js').SubmissionRow} Row */

const STATUS = /** @type {const} */ ({
  SUBMITTED: { label: 'Submitted', tone: 'info' },
  GRADED: { label: 'Graded', tone: 'success' },
  REOPENED: { label: 'Reopened', tone: 'warning' },
});

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function AssignmentSubmissionsPage({ role }) {
  const { courseId = '', assignmentId = '' } = useParams();
  const page = useLoad(async () => {
    const [course, assignment, rows] = await Promise.all([fetchCourse(courseId), fetchAssignment(assignmentId), fetchAssignmentSubmissions(assignmentId)]);
    return { course, assignment, rows };
  }, [courseId, assignmentId]);
  const [extending, setExtending] = useState(/** @type {Row | null} */ (null));

  if (page.state === 'error') return <ErrorState title="The submissions could not be loaded" onRetry={page.reload} />;
  const d = page.data;
  if (page.state === 'ready' && (!d?.course || !d?.assignment || d.assignment.course_id !== courseId)) {
    return <EmptyState title="Assignment not found" description="It may have been moved, or you do not teach this course." />;
  }
  const a = d?.assignment;
  const archived = d?.course?.status === 'ARCHIVED' || Boolean(a?.archived_at);
  const rows = d?.rows ?? [];
  const sent = rows.filter((r) => r.status).length;
  const late = rows.filter((r) => r.status && r.is_late).length;

  const columns = [
    { key: 'learner', header: 'Learner', card: /** @type {const} */ ('title'), cell: (/** @type {Row} */ r) => <Person row={r} /> },
    {
      key: 'id',
      header: 'ID number',
      card: /** @type {const} */ ('secondary'),
      cell: (/** @type {Row} */ r) => <span className="tabular-nums">{formatIdNumber(r.id_number)}</span>,
    },
    { key: 'branch', header: 'Branch', card: /** @type {const} */ ('status'), cell: (/** @type {Row} */ r) => <BranchChip name={r.branch_name} /> },
    {
      key: 'status',
      header: 'Status',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {Row} */ r) => (
        <span className="flex flex-wrap gap-2">
          {r.status ? <StatusChip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusChip> : <StatusChip>Not submitted</StatusChip>}
          {r.status && r.is_late ? <StatusChip tone="warning">Late</StatusChip> : null}
        </span>
      ),
    },
    {
      key: 'sent',
      header: 'Latest answer',
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {Row} */ r) =>
        r.submitted_at ? <span className="tabular-nums">{`Version ${r.current_version}, ${formatDue(r.submitted_at)}`}</span> : '—',
    },
    {
      key: 'due',
      header: 'Due',
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {Row} */ r) => (
        <span className="tabular-nums">
          {formatDue(r.effective_due_at)}
          {r.extended_due_at ? ' (extended)' : ''}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      card: /** @type {const} */ ('detail'),
      align: /** @type {const} */ ('end'),
      cell: (/** @type {Row} */ r) => (
        <span className="flex flex-wrap justify-end gap-2">
          {r.status ? (
            <Button asChild variant="outline">
              <Link
                to={`/${role}/courses/${courseId}/assignments/${assignmentId}/submissions/${r.learner_id}`}
                aria-label={`View answer from ${r.first_name} ${r.second_name}`}
              >
                <Eye aria-hidden="true" />
                View answer
              </Link>
            </Button>
          ) : null}
          {!archived && r.enrolment_status === 'ACTIVE' ? (
            <Button type="button" variant="ghost" onClick={() => setExtending(r)} aria-label={`Extension for ${r.first_name} ${r.second_name}`}>
              <CalendarClock aria-hidden="true" />
              Extension
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<ListSkeleton rows={6} columns={4} />} onRetry={page.reload}>
      {d?.course && a ? (
        <div className="flex flex-col gap-4">
          <Link
            to={`/${role}/courses/${courseId}/assignments`}
            className="inline-flex min-h-11 items-center gap-1 self-start text-label text-link hover:underline focus-visible:focus-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {d.course.title}
          </Link>
          <PageHeader
            title={`Submissions: ${a.title}`}
            description={`Due ${formatDue(a.due_at)} (Ghana time). ${sent} of ${rows.length} learners have submitted${late ? `, ${late} late` : ''}.`}
            className="pb-0"
          />
          <ResponsiveTable
            caption={`Submissions for ${a.title}`}
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.learner_id}
            empty={<EmptyState title="No learners yet" description="Learners appear here once an administrator enrols them in the course." />}
          />
          {extending ? (
            <ExtensionDialog
              assignmentId={assignmentId}
              learner={{ id: extending.learner_id, name: `${extending.first_name} ${extending.second_name}` }}
              dueAt={a.due_at}
              extendedTo={extending.extended_due_at}
              onClose={() => setExtending(null)}
              onChanged={page.reload}
            />
          ) : null}
        </div>
      ) : null}
    </LoadingRegion>
  );
}

/** @param {{ row: Row }} props */
function Person({ row }) {
  const imageUrl = useProfileImage(row.profile_image_path);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <UserAvatar firstName={row.first_name} secondName={row.second_name} imageUrl={imageUrl} size={40} decorative />
      <span className="truncate text-label text-ink">
        {row.first_name} {row.second_name}
      </span>
    </span>
  );
}
