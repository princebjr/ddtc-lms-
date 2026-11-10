import { ClipboardList, PenLine, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { FilterSelect } from '@/components/data/FilterSelect.jsx';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { LearnerCell } from '@/components/grading/LearnerCell.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { formatDueShort } from '@/lib/assignments/due.js';
import { fetchGradingQueue } from '@/lib/grading/grading.js';
import { ExamMarkingList } from '@/components/exams/ExamPanels.jsx';
import { BranchGroups, GroupByBranchSwitch } from '@/components/branches/BranchGroups.jsx';
import { useGroupByBranch } from '@/lib/branch-groups.js';

// To grade (Step 9.1; navigation page promised for Phase 9; prototype dashboard "To grade"): the
// answers waiting for marks and feedback in the courses the lecturer teaches, oldest first, with the
// learner (photo, name, ID number, branch chip, D42), the assignment and course, when it was sent, Late
// and Reopened; Grade opens the grading screen. Below, the draft grades not yet released, per
// assignment, each opening that assignment's submissions to release them. Archived courses are not
// listed (they are read-only).

/** @typedef {import('@/lib/grading/grading.js').QueueRow} Row */

export default function ToGradePage() {
  const { state, data, reload } = useLoad(fetchGradingQueue, []);
  // Grouped by branch unless switched off (Phase 10.1; owner answer of 2026-11-10).
  const [grouped, setGrouped] = useGroupByBranch();
  const [course, setCourse] = useState('');
  const rows = useMemo(() => data ?? [], [data]);
  const courses = useMemo(() => {
    /** @type {Map<string, string>} */
    const seen = new Map();
    for (const r of rows) seen.set(r.course_id, `${r.course_title} (${r.course_code})`);
    return [...seen.entries()];
  }, [rows]);
  const inCourse = rows.filter((r) => !course || r.course_id === course);
  const waiting = inCourse.filter((r) => r.state === 'UNGRADED');
  /** @type {Map<string, { row: Row, count: number }>} */
  const byAssignment = new Map();
  for (const r of inCourse) {
    if (r.state !== 'DRAFT') continue;
    const entry = byAssignment.get(r.assignment_id);
    if (entry) entry.count += 1;
    else byAssignment.set(r.assignment_id, { row: r, count: 1 });
  }
  const drafts = [...byAssignment.values()];
  const assignmentsWaiting = new Set(waiting.map((r) => r.assignment_id)).size;

  const columns = [
    { key: 'learner', header: 'Learner', card: /** @type {const} */ ('title'), cell: (/** @type {Row} */ r) => <LearnerCell row={r} /> },
    {
      key: 'assignment',
      header: 'Assignment',
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {Row} */ r) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-ink">{r.assignment_title}</span>
          <span className="text-caption text-ink-secondary">{r.course_code}</span>
        </span>
      ),
    },
    {
      key: 'sent',
      header: 'Sent',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {Row} */ r) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="whitespace-nowrap tabular-nums text-ink">{r.submitted_at ? formatDueShort(r.submitted_at) : '—'}</span>
          {r.status === 'REOPENED' ? <StatusChip tone="warning">Reopened</StatusChip> : null}
          {r.is_late ? <StatusChip tone="warning">Late</StatusChip> : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      card: /** @type {const} */ ('actions'),
      align: /** @type {const} */ ('end'),
      cell: (/** @type {Row} */ r) => (
        <Button asChild>
          <Link
            to={`/lecturer/courses/${r.course_id}/assignments/${r.assignment_id}/submissions/${r.learner_id}`}
            aria-label={`Grade answer from ${r.first_name} ${r.second_name}`}
          >
            <PenLine aria-hidden="true" />
            Grade
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="To grade" description="Answers waiting for marks and feedback in the courses you teach." className="pb-0" />
      {state === 'error' ? (
        <ErrorState title="The answers to grade could not be loaded" onRetry={reload} />
      ) : (
        <LoadingRegion loading={state === 'loading'} skeleton={<ListSkeleton rows={6} columns={4} />} onRetry={reload}>
          {rows.length === 0 ? (
            <div className="flex flex-col gap-6">
              {/* Examination scripts can wait even when no assignment answers do (Phase 10.1). */}
              <ExamMarkingList role="lecturer" />
              <EmptyState icon={ClipboardList} title="Nothing to grade" description="Answers appear here when learners send them." />
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <p className="m-0 text-body text-ink" role="status" data-testid="to-grade-summary">
                  {waiting.length
                    ? `${waiting.length} ${waiting.length === 1 ? 'answer' : 'answers'} waiting in ${assignmentsWaiting} ${assignmentsWaiting === 1 ? 'assignment' : 'assignments'}`
                    : 'No answers waiting'}
                </p>
                {courses.length > 1 ? (
                  <FilterSelect label="Course" id="to-grade-course" value={course} onChange={setCourse} options={[['', 'All courses'], ...courses]} />
                ) : null}
              </div>
              {waiting.length ? (
                <>
                  <GroupByBranchSwitch on={grouped} onChange={setGrouped} />
                  <BranchGroups rows={waiting} on={grouped}>
                    {(group, branchName) => (
                      <ResponsiveTable
                        caption={branchName ? `Answers waiting to be graded, ${branchName}` : 'Answers waiting to be graded'}
                        cardsBelow="lg"
                        columns={columns}
                        rows={group}
                        getRowKey={(r) => `${r.assignment_id}:${r.learner_id}`}
                      />
                    )}
                  </BranchGroups>
                </>
              ) : null}
              <ExamMarkingList role="lecturer" />
              {drafts.length ? (
                <section aria-labelledby="drafts-title" className="flex flex-col gap-3">
                  <h2 id="drafts-title" className="m-0 text-title-3 text-ink">
                    Draft grades not released
                  </h2>
                  <ul className="m-0 flex list-none flex-col divide-y divide-hairline rounded-md border border-hairline bg-card p-0" aria-labelledby="drafts-title">
                    {drafts.map(({ row, count }) => (
                      <li key={row.assignment_id}>
                        <Link
                          to={`/lecturer/courses/${row.course_id}/assignments/${row.assignment_id}/submissions`}
                          className="flex min-h-16 flex-col gap-1 px-4 py-3 hover:bg-fill focus-visible:focus-ring sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-label text-ink">{row.assignment_title}</span>
                            <span className="truncate text-body-sm text-ink-secondary">
                              {row.course_title} ({row.course_code})
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-label text-link">
                            <StatusChip tone="warning">{`${count} draft ${count === 1 ? 'grade' : 'grades'}`}</StatusChip>
                            <Send className="size-4" aria-hidden="true" />
                            Open to release
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </LoadingRegion>
      )}
    </div>
  );
}
