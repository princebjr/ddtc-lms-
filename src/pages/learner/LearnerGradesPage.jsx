import { Award, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { formatDue } from '@/lib/assignments/due.js';
import { fetchMyGrades, formatPercentage, formatScore } from '@/lib/grading/grading.js';

// Grades and feedback (Step 9.1; navigation page promised for Phase 9; prototype `ngrd`): the
// learner's answered assignments, course by course. A released grade shows the score out of the
// maximum, the percentage and letter grade as the database computed them, the band, the feedback and
// when it was released ("Updated" after a changed grade is released); an answer not yet released says
// "Awaiting grade" and shows no score. Each opens its assignment. The course grade and the score
// chart come with the gradebook (Phase 10, calculate_course_grades).

/** @typedef {import('@/lib/grading/grading.js').MyGradeRow} Row */

export default function LearnerGradesPage() {
  const { state, data, reload } = useLoad(fetchMyGrades, []);
  const rows = data ?? [];
  /** @type {Array<{ id: string, title: string, code: string, rows: Row[] }>} */
  const courses = [];
  for (const r of rows) {
    const last = courses.at(-1);
    if (last && last.id === r.course_id) last.rows.push(r);
    else courses.push({ id: r.course_id, title: r.course_title, code: r.course_code, rows: [r] });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Grades and feedback" description="Your released results." className="pb-0" />
      {state === 'error' ? (
        <ErrorState title="Your grades could not be loaded" onRetry={reload} />
      ) : (
        <LoadingRegion loading={state === 'loading'} skeleton={<ListSkeleton rows={4} columns={2} />} onRetry={reload}>
          {courses.length ? (
            <div className="flex flex-col gap-6">
              {courses.map((c) => (
                <section key={c.id} aria-labelledby={`course-${c.id}`} className="flex flex-col gap-3">
                  <h2 id={`course-${c.id}`} className="m-0 text-title-3 text-ink">
                    {c.title} <span className="text-body text-ink-secondary">{c.code}</span>
                  </h2>
                  <ul className="m-0 flex list-none flex-col divide-y divide-hairline rounded-md border border-hairline bg-card p-0" aria-labelledby={`course-${c.id}`}>
                    {c.rows.map((r) => (
                      <li key={r.assignment_id}>
                        <Link
                          to={`/learner/courses/${r.course_id}/assignments/${r.assignment_id}`}
                          className="flex min-h-16 items-start gap-3 px-4 py-3 hover:bg-fill focus-visible:focus-ring"
                          data-slot="my-grade-row"
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-2">
                            <span className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                              <span className="text-label text-ink">{r.assignment_title}</span>
                              {r.state === 'RELEASED' ? (
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="whitespace-nowrap tabular-nums text-ink">
                                    {formatScore(r.score, r.max_marks)}
                                    <span className="text-ink-secondary"> · {formatPercentage(r.percentage)}</span>
                                  </span>
                                  {r.letter_grade ? <StatusChip tone={r.passed ? 'success' : 'warning'}>{`Grade ${r.letter_grade}`}</StatusChip> : null}
                                  {r.updated ? <StatusChip tone="info">Updated</StatusChip> : null}
                                </span>
                              ) : (
                                <StatusChip tone="info" className="self-start sm:self-auto">
                                  Awaiting grade
                                </StatusChip>
                              )}
                            </span>
                            {r.state === 'RELEASED' && r.feedback ? (
                              <span className="line-clamp-3 whitespace-pre-wrap break-words text-body-sm text-ink-secondary">{r.feedback}</span>
                            ) : null}
                            <span className="text-caption text-ink-secondary tabular-nums">
                              {r.state === 'RELEASED' && r.released_at
                                ? `${r.band ? `Band ${r.band} · ` : ''}Released ${formatDue(r.released_at)}`
                                : r.submitted_at
                                  ? `Version ${r.current_version} sent ${formatDue(r.submitted_at)}`
                                  : ''}
                            </span>
                          </span>
                          <ChevronRight className="mt-1 size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState icon={Award} title="No grades yet" description="Your grades appear here once your lecturers release them." />
          )}
        </LoadingRegion>
      )}
    </div>
  );
}
