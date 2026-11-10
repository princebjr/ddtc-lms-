import { ClipboardList, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { Fab } from '@/components/feedback/Fab.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { Button } from '@/components/ui/button.jsx';
import { GradePartsCard } from '@/components/gradebook/GradePartsCard.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/use-media-query.js';
import { CONTENT_TYPE_LABEL, fetchCourseAssignments } from '@/lib/assignments/assignments.js';
import { formatDue } from '@/lib/assignments/due.js';

// The course's Assignments tab for its lecturers and administrators (prototype `lasg`; Phase 7):
// the assignments by due date with their instruction type and status, New assignment (a FAB on
// phones for the course's lecturers, UI_FEEDBACK), and the grade categories with their weights
// (D12: they must total 100 before grades are released). An archived course is read-only.

/** @typedef {Awaited<ReturnType<typeof fetchCourseAssignments>>[number]} Row */

/** @param {Row} a */
function statusOf(a) {
  if (a.archived_at) return /** @type {const} */ ({ label: 'Archived', tone: 'neutral' });
  return a.publication_status === 'PUBLISHED'
    ? /** @type {const} */ ({ label: 'Published', tone: 'success' })
    : /** @type {const} */ ({ label: 'Draft', tone: 'neutral' });
}

/** @param {{ role: 'admin' | 'lecturer', courseId: string, archived: boolean, isLecturer: boolean }} props */
export function AssignmentsTab({ role, courseId, archived, isLecturer }) {
  const navigate = useNavigate();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const list = useLoad(() => fetchCourseAssignments(courseId), [courseId]);
  const base = `/${role}/courses/${courseId}/assignments`;
  // Desktop: a header button. Phones and tablets: the FAB for the course's lecturers (UI_FEEDBACK
  // FAB table); administrators keep the button.
  const showButton = !archived && (desktop || !isLecturer);

  const columns = [
    {
      key: 'title',
      header: 'Assignment',
      card: /** @type {const} */ ('title'),
      cell: (/** @type {Row} */ a) => (
        <span className="flex min-w-0 flex-col">
          <Link to={`${base}/${a.id}`} className="truncate text-label text-link hover:underline focus-visible:focus-ring">
            {a.title}
          </Link>
          <span className="truncate text-caption text-ink-secondary">{a.lesson ? a.lesson.title : 'Course assignment'}</span>
        </span>
      ),
    },
    { key: 'type', header: 'Instructions', card: /** @type {const} */ ('secondary'), cell: (/** @type {Row} */ a) => CONTENT_TYPE_LABEL[a.content_type] },
    {
      key: 'due',
      header: 'Due (Ghana time)',
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {Row} */ a) => <span className="tabular-nums">{formatDue(a.due_at)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {Row} */ a) => {
        const s = statusOf(a);
        return <StatusChip tone={s.tone}>{s.label}</StatusChip>;
      },
    },
    // Phase 8: who has submitted, with extensions (published assignments only take answers).
    {
      key: 'submissions',
      header: 'Submissions',
      card: /** @type {const} */ ('detail'),
      align: /** @type {const} */ ('end'),
      cell: (/** @type {Row} */ a) =>
        a.publication_status === 'PUBLISHED' ? (
          <Link
            to={`${base}/${a.id}/submissions`}
            className="inline-flex min-h-11 items-center text-label text-link hover:underline focus-visible:focus-ring"
            aria-label={`Submissions for ${a.title}`}
          >
            Submissions
          </Link>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-body-sm text-ink-secondary">
          {archived
            ? 'This course is archived; its assignments are read-only.'
            : 'Learners see published assignments. Every assignment accepts text and audio answers.'}
        </p>
        {showButton ? (
          <Button onClick={() => navigate(`${base}/new`)}>
            <Plus aria-hidden="true" />
            New assignment
          </Button>
        ) : null}
      </div>
      {list.state === 'error' ? (
        <ErrorState title="The assignments could not be loaded" onRetry={list.reload} />
      ) : (
        <LoadingRegion loading={list.state === 'loading'} skeleton={<ListSkeleton rows={4} columns={4} />} onRetry={list.reload}>
          <ResponsiveTable
            caption="Assignments"
            columns={columns}
            rows={list.data ?? []}
            getRowKey={(a) => a.id}
            empty={
              <EmptyState
                icon={ClipboardList}
                title="No assignments yet"
                description={archived ? undefined : 'Create the first assignment. It stays a draft until you publish it.'}
              />
            }
          />
        </LoadingRegion>
      )}
      <GradePartsCard courseId={courseId} archived={archived} admin={role === 'admin'} />
      <Fab label="New assignment" onClick={() => navigate(`${base}/new`)} allowed={isLecturer} archived={archived} />
    </div>
  );
}
