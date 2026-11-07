import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { CONTENT_TYPE_LABEL, fetchMyAssignments } from '@/lib/assignments/assignments.js';
import { dueStatus } from '@/lib/assignments/due.js';

// The learner's Assignments (prototype `nasg`; Phase 7): published assignments of the courses they
// are enrolled in, To do (still open, soonest first) and Past due, each with its course, how the
// instructions are given, and a due-date chip in Ghana time that uses their own extension (D13).
// Submitting arrives in Phase 8, with Submitted and Graded.

const SEGMENTS = /** @type {const} */ ([
  { key: 'todo', label: 'To do' },
  { key: 'past', label: 'Past due' },
]);

export default function LearnerAssignmentsPage() {
  const list = useLoad(fetchMyAssignments, []);
  const [segment, setSegment] = useState(/** @type {'todo' | 'past'} */ ('todo'));
  const now = new Date();
  const rows = (list.data ?? []).map((a) => ({ ...a, due: dueStatus({ dueAt: a.due_at, allowLate: a.allow_late, extendedTo: a.extended_to }, now) }));
  const open = rows.filter((a) => !a.due.overdue || a.allow_late).sort((x, y) => Date.parse(x.due.effective) - Date.parse(y.due.effective));
  const past = rows.filter((a) => a.due.overdue && !a.allow_late).sort((x, y) => Date.parse(y.due.effective) - Date.parse(x.due.effective));
  const shown = segment === 'todo' ? open : past;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Assignments" description="Due soon and recent." />
      <div role="tablist" aria-label="Assignments" className="inline-flex self-start rounded-full bg-fill p-1">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={segment === s.key}
            onClick={() => setSegment(s.key)}
            className={
              segment === s.key
                ? 'min-h-11 rounded-full bg-card px-4 text-label text-ink shadow-card focus-visible:focus-ring'
                : 'min-h-11 rounded-full px-4 text-label text-ink-secondary hover:text-ink focus-visible:focus-ring'
            }
          >
            {s.label} {list.state === 'ready' ? `(${s.key === 'todo' ? open.length : past.length})` : ''}
          </button>
        ))}
      </div>
      {list.state === 'error' ? (
        <ErrorState title="Your assignments could not be loaded" onRetry={list.reload} />
      ) : (
        <LoadingRegion loading={list.state === 'loading'} skeleton={<ListSkeleton rows={4} columns={2} />} onRetry={list.reload}>
          {shown.length ? (
            <ul className="m-0 flex list-none flex-col divide-y divide-hairline rounded-md border border-hairline bg-card p-0" aria-label={segment === 'todo' ? 'Assignments to do' : 'Assignments past their due date'}>
              {shown.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/learner/courses/${a.course_id}/assignments/${a.id}`}
                    className="flex min-h-16 flex-col gap-1 px-4 py-3 hover:bg-fill focus-visible:focus-ring sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-label text-ink">{a.title}</span>
                      <span className="truncate text-body-sm text-ink-secondary">
                        {a.course?.title ?? ''} · {CONTENT_TYPE_LABEL[a.content_type]} instructions
                      </span>
                    </span>
                    <span className="shrink-0">
                      <StatusChip tone={a.due.tone}>{a.due.label}</StatusChip>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title={segment === 'todo' ? 'Nothing to do right now' : 'Nothing past due'}
              description={segment === 'todo' ? 'New assignments from your lecturers appear here.' : undefined}
            />
          )}
        </LoadingRegion>
      )}
    </div>
  );
}
