import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { formatPercentage, formatScore } from '@/lib/grading/grading.js';
import { fetchReleasePreview, releaseCourseGrades } from '@/lib/gradebook/gradebook.js';
import { formatIdNumber } from '@/lib/id-number.js';

// Review and release (Phase 10; owner request and decision 1 of 2026-11-10): every draft grade of the
// course, assignment by assignment, with each learner's score and percentage as the
// database computed them; a released grade changed since is marked "Changed" with what the learner
// sees now. Release all (N) releases them at once: each learner sees their grades and is notified once
// per grade. The server refuses while the category weights do not total 100 and says so here.

/** @param {{ courseId: string, onClose: () => void, onReleased: () => void }} props */
export function ReviewReleaseDialog({ courseId, onClose, onReleased }) {
  const toast = useToast();
  const preview = useLoad(() => fetchReleasePreview(courseId), [courseId]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const rows = preview.data ?? [];
  const learners = new Set(rows.map((r) => r.learner_id)).size;

  /** @type {Array<{ id: string, title: string, rows: typeof rows }>} */
  const groups = [];
  for (const r of rows) {
    const g = groups.find((x) => x.id === r.assignment_id);
    if (g) g.rows.push(r);
    else groups.push({ id: r.assignment_id, title: r.assignment_title, rows: [r] });
  }

  const release = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await releaseCourseGrades(courseId);
      toast.show('lecturer.grades-released', { params: { n: String(learners) } });
      onReleased();
      onClose();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review and release grades</DialogTitle>
          <DialogDescription>
            Every draft grade in this course. Each learner sees their grades and feedback straight away and is told a new grade is available. Ungraded answers are not
            affected.
          </DialogDescription>
        </DialogHeader>
        <LoadingRegion loading={preview.state === 'loading'} skeleton={<ListSkeleton rows={4} columns={2} />} onRetry={preview.reload}>
          {preview.state === 'error' ? (
            <FormMessage>The draft grades could not be loaded. Close and try again.</FormMessage>
          ) : rows.length === 0 ? (
            <p className="m-0 text-body text-ink-secondary">There are no draft grades to release.</p>
          ) : (
            <div className="flex max-h-80 flex-col gap-4 overflow-y-auto focus-visible:focus-ring" data-slot="release-preview" tabIndex={0} role="region" aria-label="Draft grades to release">
              {groups.map((g) => (
                <section key={g.id} aria-labelledby={`release-${g.id}`} className="flex flex-col gap-1">
                  <h3 id={`release-${g.id}`} className="m-0 text-label text-ink">
                    {g.title} <span className="text-ink-secondary">({g.rows.length})</span>
                  </h3>
                  <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0">
                    {g.rows.map((r) => (
                      <li key={r.learner_id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-body text-ink">
                            {r.first_name} {r.second_name}
                          </span>
                          <span className="text-caption text-ink-secondary tabular-nums">
                            ID {formatIdNumber(r.id_number)}
                            {r.branch_name ? ` · ${r.branch_name}` : ''}
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="whitespace-nowrap tabular-nums text-ink">
                            {formatScore(r.score, r.max_marks)}
                            <span className="text-ink-secondary">
                              {' '}
                              · {formatPercentage(r.percentage)}
                            </span>
                          </span>
                          {r.changed ? <StatusChip tone="warning">{`Changed, was ${formatScore(r.released_score, r.max_marks)}`}</StatusChip> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </LoadingRegion>
        <FormMessage>{message}</FormMessage>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void release()} loading={busy} loadingLabel="Releasing" disabled={preview.state !== 'ready' || rows.length === 0}>
            {`Release all (${rows.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
