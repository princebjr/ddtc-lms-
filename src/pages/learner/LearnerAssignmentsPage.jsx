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
import { formatScore } from '@/lib/grading/grading.js';

// The learner's Assignments (prototype `nasg`; Phases 7 and 8): published assignments of the courses
// they are enrolled in, To do (not answered and still open, soonest first), Submitted (answered,
// awaiting a grade, or Graded with the released score once the grade is released: never a draft) and Past due (not answered, closed), each with its
// course, how the instructions are given, and a chip: the due date in Ghana time with their own
// extension (D13), or the answer's version and lateness.

const SEGMENTS = /** @type {const} */ ([
  { key: 'todo', label: 'To do' },
  { key: 'sent', label: 'Submitted' },
  { key: 'past', label: 'Past due' },
]);

export default function LearnerAssignmentsPage() {
  const list = useLoad(fetchMyAssignments, []);
  const [segment, setSegment] = useState(/** @type {'todo' | 'sent' | 'past'} */ ('todo'));
  const now = new Date();
  const rows = (list.data ?? []).map((a) => ({ ...a, due: dueStatus({ dueAt: a.due_at, allowLate: a.allow_late, extendedTo: a.extended_to }, now) }));
  const open = rows.filter((a) => !a.submission && (!a.due.overdue || a.allow_late)).sort((x, y) => Date.parse(x.due.effective) - Date.parse(y.due.effective));
  const sent = rows.filter((a) => a.submission).sort((x, y) => Date.parse(y.due.effective) - Date.parse(x.due.effective));
  const past = rows.filter((a) => !a.submission && a.due.overdue && !a.allow_late).sort((x, y) => Date.parse(y.due.effective) - Date.parse(x.due.effective));
  const lists = { todo: open, sent, past };
  const shown = lists[segment];

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
            {s.label} {list.state === 'ready' ? `(${lists[s.key].length})` : ''}
          </button>
        ))}
      </div>
      {list.state === 'error' ? (
        <ErrorState title="Your assignments could not be loaded" onRetry={list.reload} />
      ) : (
        <LoadingRegion loading={list.state === 'loading'} skeleton={<ListSkeleton rows={4} columns={2} />} onRetry={list.reload}>
          {shown.length ? (
            <ul
              className="m-0 flex list-none flex-col divide-y divide-hairline rounded-md border border-hairline bg-card p-0"
              aria-label={segment === 'todo' ? 'Assignments to do' : segment === 'sent' ? 'Assignments submitted' : 'Assignments past their due date'}
            >
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
                    <span className="flex shrink-0 flex-wrap gap-2">
                      {a.submission ? (
                        <>
                          {a.grade ? (
                            <StatusChip tone={a.grade.passed ? 'success' : 'warning'}>
                              {`Graded · ${formatScore(a.grade.score, a.grade.max_marks)}${a.grade.letter_grade ? ` · ${a.grade.letter_grade}` : ''}`}
                            </StatusChip>
                          ) : (
                            <StatusChip tone="info">{`Awaiting grade · version ${a.submission.current_version}`}</StatusChip>
                          )}
                          {a.submission.is_late ? <StatusChip tone="warning">Late</StatusChip> : null}
                        </>
                      ) : (
                        <StatusChip tone={a.due.tone}>{a.due.label}</StatusChip>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title={segment === 'todo' ? 'Nothing to do right now' : segment === 'sent' ? 'Nothing submitted yet' : 'Nothing past due'}
              description={
                segment === 'todo'
                  ? 'New assignments from your lecturers appear here.'
                  : segment === 'sent'
                    ? 'Answers you send appear here until they are graded.'
                    : undefined
              }
            />
          )}
        </LoadingRegion>
      )}
    </div>
  );
}
