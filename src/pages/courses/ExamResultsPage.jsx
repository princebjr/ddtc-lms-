import { ArrowLeft, Download, PenLine, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { BranchGroups, GroupByBranchSwitch } from '@/components/branches/BranchGroups.jsx';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { LoadingRegion, ResultsSkeleton } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { ExportDialog } from '@/components/gradebook/ExportDialog.jsx';
import { LearnerCell } from '@/components/grading/LearnerCell.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { formatDue } from '@/lib/assignments/due.js';
import { useGroupByBranch } from '@/lib/branch-groups.js';
import { fetchExamForEditing, fetchExamResults, RESULT_STATE, releaseExam } from '@/lib/exams/exams.js';
import { formatPercentage } from '@/lib/grading/grading.js';

// An examination's results for the course's lecturers and administrators (Phase 10.1, ADR-016; owner
// request and answers of 2026-11-10): every learner, grouped by branch unless switched off, with where
// they stand (not started, in progress, submitted, not submitted), the multiple-choice, short-answer and
// essay scores, total, percentage and pass or fail, how far marking has got and whether the result is
// released; Mark opens the learner's script. Release results releases every fully marked result after a
// confirmation; Export gives the results as Excel or CSV, sorted by branch. Figures from the database.

/** @typedef {import('@/lib/exams/exams.js').ExamResult} Row */

const MARKING = /** @type {const} */ ({
  GRADED: { label: 'Marked', tone: 'success' },
  PARTLY: { label: 'Partly marked', tone: 'warning' },
  UNGRADED: { label: 'To mark', tone: 'info' },
});
const num = (/** @type {number | null} */ n) => (n === null || n === undefined ? '—' : String(Number(n)));

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function ExamResultsPage({ role }) {
  const { courseId = '', examId = '' } = useParams();
  const toast = useToast();
  const page = useLoad(async () => {
    const [editing, rows] = await Promise.all([fetchExamForEditing(examId), fetchExamResults(examId)]);
    return { exam: editing.exam, rows };
  }, [examId]);
  const [grouped, setGrouped] = useGroupByBranch();
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  if (page.state === 'error') return <ErrorState title="The results could not be loaded" onRetry={page.reload} />;
  const exam = page.data?.exam ?? null;
  if (page.state === 'ready' && !exam) return <EmptyState title="Examination not found" description="It may not exist, or you do not teach this course." />;
  const rows = page.data?.rows ?? [];
  const releasable = rows.filter((r) => r.grading_state === 'GRADED' && r.grade_release_status === 'DRAFT' && (r.state === 'SUBMITTED' || r.state === 'NOT_SUBMITTED')).length;
  const base = `/${role}/courses/${courseId}/exams/${examId}`;

  const release = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { released } = await releaseExam(examId);
      toast.show('lecturer.grades-released', { params: { n: String(released) } });
      setConfirming(false);
      page.reload();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'learner', header: 'Learner', card: /** @type {const} */ ('title'), cell: (/** @type {Row} */ r) => <LearnerCell row={r} /> },
    {
      key: 'state',
      header: 'Status',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {Row} */ r) => (
        <span className="flex flex-wrap gap-2">
          <StatusChip tone={RESULT_STATE[r.state].tone}>{RESULT_STATE[r.state].label}</StatusChip>
          {r.grading_state ? <StatusChip tone={MARKING[r.grading_state].tone}>{MARKING[r.grading_state].label}</StatusChip> : null}
          {r.released_at ? <StatusChip tone={r.changed_since_release ? 'warning' : 'success'}>{r.changed_since_release ? 'Changed, not released' : 'Released'}</StatusChip> : null}
        </span>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {Row} */ r) => <span className="tabular-nums">{r.submitted_at ? formatDue(r.submitted_at) : '—'}</span>,
    },
    { key: 'mcq', header: 'Multiple choice', card: /** @type {const} */ ('detail'), align: /** @type {const} */ ('end'), cell: (/** @type {Row} */ r) => num(r.mcq_score) },
    { key: 'short', header: 'Short answer', card: /** @type {const} */ ('detail'), align: /** @type {const} */ ('end'), cell: (/** @type {Row} */ r) => num(r.short_score) },
    { key: 'essay', header: 'Essay', card: /** @type {const} */ ('detail'), align: /** @type {const} */ ('end'), cell: (/** @type {Row} */ r) => num(r.essay_score) },
    {
      key: 'total',
      header: 'Total',
      card: /** @type {const} */ ('value'),
      align: /** @type {const} */ ('end'),
      cell: (/** @type {Row} */ r) => (
        <span className="flex flex-col items-end">
          <span className="whitespace-nowrap tabular-nums">
            {r.total_score === null ? '—' : `${num(r.total_score)} / ${num(r.total_marks)}${r.grading_state === 'GRADED' ? '' : ' so far'}`}
          </span>
          {r.percentage === null ? null : (
            <span className="whitespace-nowrap text-caption text-ink-secondary">{`${formatPercentage(r.percentage)} · ${r.passed ? 'Pass' : 'Fail'}`}</span>
          )}
        </span>
      ),
    },
    {
      key: 'mark',
      header: 'Script',
      card: /** @type {const} */ ('actions'),
      cell: (/** @type {Row} */ r) =>
        r.state === 'SUBMITTED' || r.state === 'NOT_SUBMITTED' ? (
          <Button asChild variant="outline">
            <Link to={`${base}/results/${r.learner_id}`} aria-label={`Mark the script of ${r.first_name} ${r.second_name}`}>
              <PenLine aria-hidden="true" />
              Mark
            </Link>
          </Button>
        ) : null,
    },
  ];

  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<ResultsSkeleton />} onRetry={page.reload}>
      {exam ? (
        <div className="flex flex-col gap-4">
          <Link to={base} className="inline-flex min-h-11 items-center gap-1 self-start text-label text-link hover:underline focus-visible:focus-ring">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {exam.title}
          </Link>
          <PageHeader title={`Results: ${exam.title}`} description={`Pass mark ${exam.pass_mark}%. Closes ${formatDue(exam.closed_at ?? exam.closes_at)} (Ghana time).`} className="pb-0" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setConfirming(true)} disabled={releasable === 0}>
                <Send aria-hidden="true" />
                {releasable ? `Release results (${releasable})` : 'Release results'}
              </Button>
              <Button variant="outline" onClick={() => setExporting(true)}>
                <Download aria-hidden="true" />
                Export
              </Button>
            </div>
            <GroupByBranchSwitch on={grouped} onChange={setGrouped} />
          </div>
          <FormMessage>{message}</FormMessage>
          {rows.length ? (
            <BranchGroups rows={rows} on={grouped}>
              {(group, branch) => <ResponsiveTable caption={branch ? `Results, ${branch}` : 'Results'} columns={columns} rows={group} getRowKey={(r) => r.learner_id} cardsBelow="lg" />}
            </BranchGroups>
          ) : (
            <EmptyState title="No learners yet" description="Learners appear here once they are enrolled." />
          )}
          {confirming ? (
            <AlertDialog open onOpenChange={(open) => !open && !busy && setConfirming(false)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{`Release ${releasable} ${releasable === 1 ? 'result' : 'results'}?`}</AlertDialogTitle>
                  <AlertDialogDescription>
                    Each learner sees their marks, result and feedback straight away and is told it is ready. Scripts not fully marked are not released.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <FormMessage>{message}</FormMessage>
                <AlertDialogFooter>
                  <AlertDialogCancel asChild>
                    <Button variant="ghost" disabled={busy}>
                      Cancel
                    </Button>
                  </AlertDialogCancel>
                  <Button onClick={() => void release()} loading={busy} loadingLabel="Releasing">
                    Release results
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          {exporting ? <ExportDialog role={role} courseId={courseId} examId={examId} onClose={() => setExporting(false)} /> : null}
        </div>
      ) : null}
    </LoadingRegion>
  );
}
