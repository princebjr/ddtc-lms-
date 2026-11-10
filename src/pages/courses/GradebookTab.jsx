import { ChartColumn, ClipboardCheck, Download, Send } from 'lucide-react';
import { useState } from 'react';
import { ChartSkeleton, GradebookSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { ClassStats } from '@/components/gradebook/ClassStats.jsx';
import { DistributionChart } from '@/components/gradebook/DistributionChart.jsx';
import { ExportDialog } from '@/components/gradebook/ExportDialog.jsx';
import { GradebookMatrix } from '@/components/gradebook/GradebookMatrix.jsx';
import { ReviewReleaseDialog } from '@/components/gradebook/ReviewReleaseDialog.jsx';
import { GroupByBranchSwitch } from '@/components/branches/BranchGroups.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { useGroupByBranch } from '@/lib/branch-groups.js';
import { chartSummary, fetchCourseGradebook } from '@/lib/gradebook/gradebook.js';

// The course's own gradebook and analytics (Phase 10; D11 to D15, D30; owner request of 2026-11-10:
// each course has its own gradebook) for its lecturers and AAL2 administrators. Gradebook: every
// learner against every assignment with the overall grade and its status, Review and release (every
// draft grade of the course at once, owner decision 1) and Export (CSV or Excel). Analytics: each
// assignment's class figures and score distribution, with Export report. An archived course is
// read-only: no release, exports only.

/** @param {{ role: 'admin' | 'lecturer', courseId: string, archived: boolean }} props */
export function GradebookTab({ role, courseId, archived }) {
  const book = useLoad(() => fetchCourseGradebook(courseId), [courseId]);
  const [reviewing, setReviewing] = useState(false);
  const [grouped, setGrouped] = useGroupByBranch();
  const [exporting, setExporting] = useState(false);
  const columns = book.data?.columns ?? [];
  const learners = book.data?.learners ?? [];
  const drafts = learners.reduce((n, l) => n + l.cells.filter((c) => c.state === 'DRAFT').length, 0);

  if (book.state === 'error') return <ErrorState title="The gradebook could not be loaded" onRetry={book.reload} />;
  return (
    <LoadingRegion loading={book.state === 'loading'} skeleton={<GradebookSkeleton />} onRetry={book.reload}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-body text-ink-secondary">
            {learners.length} {learners.length === 1 ? 'learner' : 'learners'} · {columns.length} {columns.length === 1 ? 'assignment' : 'assignments'}
            {drafts ? ` · ${drafts} draft ${drafts === 1 ? 'grade' : 'grades'} not released` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <GroupByBranchSwitch on={grouped} onChange={setGrouped} />
            {archived ? null : (
              <Button onClick={() => setReviewing(true)} disabled={drafts === 0}>
                <Send aria-hidden="true" />
                {drafts ? `Review and release (${drafts})` : 'Review and release'}
              </Button>
            )}
            <Button variant="outline" onClick={() => setExporting(true)} disabled={columns.length === 0}>
              <Download aria-hidden="true" />
              Export
            </Button>
          </div>
        </div>
        {learners.length && columns.length ? (
          <>
            <GradebookMatrix columns={columns} learners={learners} grouped={grouped} />
            <StateKey />
          </>
        ) : (
          <EmptyState
            icon={ClipboardCheck}
            title={columns.length ? 'No learners yet' : 'No assignments yet'}
            description={columns.length ? 'Learners appear here once they are enrolled.' : 'Published assignments appear here as columns.'}
          />
        )}
      </div>
      {reviewing ? <ReviewReleaseDialog courseId={courseId} onClose={() => setReviewing(false)} onReleased={book.reload} /> : null}
      {exporting ? <ExportDialog role={role} courseId={courseId} onClose={() => setExporting(false)} /> : null}
    </LoadingRegion>
  );
}

/** What each state means (D11), so the matrix is read the same way by everyone. */
function StateKey() {
  const items = /** @type {const} */ ([
    ['success', 'Released', 'the learner sees it; it counts'],
    ['warning', 'Draft', 'graded, not released; does not count yet'],
    ['info', 'Ungraded', 'sent, waiting for a grade; not counted'],
    ['error', 'Missing', 'past due, nothing sent; not counted'],
    ['error', 'Counted as 0', 'past due, nothing sent; counts as 0'],
    ['neutral', 'Not yet due', 'not counted'],
  ]);
  return (
    <details className="text-body-sm text-ink-secondary">
      <summary className="flex min-h-11 cursor-pointer items-center text-label text-link focus-visible:focus-ring">What the states mean</summary>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map(([tone, label, meaning]) => (
          <li key={label} className="flex flex-wrap items-center gap-2">
            <StatusChip tone={tone}>{label}</StatusChip>
            <span>{meaning}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** @param {{ role: 'admin' | 'lecturer', courseId: string }} props */
export function AnalyticsTab({ role, courseId }) {
  const book = useLoad(() => fetchCourseGradebook(courseId), [courseId]);
  const [exportFor, setExportFor] = useState(/** @type {string | null} */ (null));
  const columns = book.data?.columns ?? [];
  const stats = book.data?.stats ?? [];

  if (book.state === 'error') return <ErrorState title="The analytics could not be loaded" onRetry={book.reload} />;
  return (
    <LoadingRegion
      loading={book.state === 'loading'}
      skeleton={
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      }
      onRetry={book.reload}
    >
      {columns.length ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 lg:grid-cols-2" aria-label="Assignments">
          {columns.map((c) => {
            const s = stats.find((x) => x.assignment_id === c.assignment_id);
            return (
              <li key={c.assignment_id} className="min-w-0">
                <Card className="flex h-full flex-col gap-4" data-slot="assignment-analytics">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <CardTitle className="break-words">{c.title}</CardTitle>
                      <CardDescription>
                        Out of {Number(c.max_marks)} · {c.category_name}
                      </CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => setExportFor(c.assignment_id)}>
                      <Download aria-hidden="true" />
                      Export report
                    </Button>
                  </div>
                  {s ? (
                    <>
                      <ClassStats stats={s} />
                      {s.released ? (
                        <DistributionChart title="Score distribution" summary={chartSummary(s)} distribution={s.distribution} />
                      ) : (
                        <p className="m-0 text-body-sm text-ink-secondary">The chart appears once grades are released. Ungraded work is never counted.</p>
                      )}
                    </>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={ChartColumn} title="No assignments yet" description="Each published assignment's results and chart appear here." />
      )}
      {exportFor ? <ExportDialog role={role} courseId={courseId} initialAssignmentId={exportFor} onClose={() => setExportFor(null)} /> : null}
    </LoadingRegion>
  );
}
