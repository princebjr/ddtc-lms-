import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { formatDue } from '@/lib/assignments/due.js';
import { fetchExamDeadlines, fetchExamMarkingQueue, LEARNER_STATE } from '@/lib/exams/exams.js';

// Examinations on the dashboards (Phase 10.1, ADR-016; owner request of 2026-11-10: "the examination
// deadline must be clearly displayed on the learner's dashboard"). The learner's examinations still to
// do, soonest deadline first, each with its course and closing time (Ghana time; no countdown); the
// lecturer's scripts to mark and results to release, per examination. Each hides itself when empty.

/** The learner's examinations still to do. */
export function ExamDeadlines() {
  const list = useLoad(fetchExamDeadlines, []);
  const rows = list.data ?? [];
  if (list.state === 'ready' && rows.length === 0) return null;
  if (list.state === 'error') return null;
  return (
    <section aria-labelledby="exam-deadlines-heading" className="mt-6 flex flex-col gap-3" data-slot="exam-deadlines">
      <h2 id="exam-deadlines-heading" className="m-0 text-title-3 text-ink">
        Examinations
      </h2>
      <LoadingRegion loading={list.state === 'loading'} skeleton={<ListSkeleton rows={2} columns={2} />} onRetry={list.reload}>
        <ul className="m-0 flex list-none flex-col divide-y divide-hairline rounded-md border border-hairline bg-card p-0">
          {rows.map((x) => (
            <li key={x.exam_id}>
              <Link
                to={`/learner/courses/${x.course_id}/exams/${x.exam_id}`}
                className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-fill focus-visible:focus-ring"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-label text-ink">{x.title}</span>
                  <span className="text-caption text-ink-secondary">{x.course_title}</span>
                  <span className="text-body-sm tabular-nums text-ink">
                    {x.state === 'UPCOMING' ? `Opens ${formatDue(x.opens_at)}` : `Submit by ${formatDue(x.closes_at)}`} (Ghana time)
                  </span>
                </span>
                <StatusChip tone={LEARNER_STATE[x.state].tone}>{LEARNER_STATE[x.state].label}</StatusChip>
                <ChevronRight className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </LoadingRegion>
    </section>
  );
}

/** The lecturer's (or administrator's) examination scripts to mark and results to release. @param {{ role: 'admin' | 'lecturer' }} props */
export function ExamMarkingList({ role }) {
  const list = useLoad(fetchExamMarkingQueue, []);
  const rows = (list.data ?? []).filter((r) => r.to_mark + r.to_release > 0);
  if (list.state === 'ready' && rows.length === 0) return null;
  if (list.state === 'error') return null;
  return (
    <section aria-labelledby="exam-marking-heading" className="flex flex-col gap-3" data-slot="exam-marking">
      <h2 id="exam-marking-heading" className="m-0 text-title-3 text-ink">
        Examination scripts
      </h2>
      <LoadingRegion loading={list.state === 'loading'} skeleton={<ListSkeleton rows={2} columns={2} />} onRetry={list.reload}>
        <ul className="m-0 flex list-none flex-col divide-y divide-hairline rounded-md border border-hairline bg-card p-0">
          {rows.map((x) => (
            <li key={x.exam_id}>
              <Link
                to={`/${role}/courses/${x.course_id}/exams/${x.exam_id}/results`}
                className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-fill focus-visible:focus-ring"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-label text-ink">{x.title}</span>
                  <span className="text-caption text-ink-secondary">{`${x.course_title} · ${x.course_code}`}</span>
                </span>
                <span className="flex flex-wrap justify-end gap-2">
                  {x.to_mark ? <StatusChip tone="info">{`${x.to_mark} to mark`}</StatusChip> : null}
                  {x.to_release ? <StatusChip tone="warning">{`${x.to_release} to release`}</StatusChip> : null}
                </span>
                <ChevronRight className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </LoadingRegion>
    </section>
  );
}
