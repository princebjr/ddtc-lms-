import { Award, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { CourseCardsSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fetchMyCourseGrades, STATUS_LABEL, STATUS_TONE } from '@/lib/gradebook/gradebook.js';
import { formatPercentage } from '@/lib/grading/grading.js';

// Grades and feedback (Step 9.1; Phase 10, owner request of 2026-11-10: each course has its own
// gradebook, and a learner sees one course's grades apart from another's). One card per course,
// current courses first and then completed ones: the course grade as the database computed it
// (calculate_course_grades: overall percentage and letter grade, Provisional, Final or Not yet
// available) and how many assignments are graded. Each card opens that course's own gradebook
// (/learner/courses/:courseId/grades) with the assignments, feedback and charts.

/** @typedef {Awaited<ReturnType<typeof fetchMyCourseGrades>>[number]} Row */

export default function LearnerGradesPage() {
  const { state, data, reload } = useLoad(fetchMyCourseGrades, []);
  const rows = data ?? [];
  const groups = [
    { id: 'current', title: 'Current courses', rows: rows.filter((r) => r.enrolment_status === 'ACTIVE') },
    { id: 'completed', title: 'Completed courses', rows: rows.filter((r) => r.enrolment_status === 'COMPLETED') },
  ].filter((g) => g.rows.length);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Grades and feedback" description="Each course has its own gradebook. Choose a course to see its grades." className="pb-0" />
      {state === 'error' ? (
        <ErrorState title="Your grades could not be loaded" onRetry={reload} />
      ) : (
        <LoadingRegion loading={state === 'loading'} skeleton={<CourseCardsSkeleton cards={3} />} onRetry={reload}>
          {groups.length ? (
            <div className="flex flex-col gap-6">
              {groups.map((g) => (
                <section key={g.id} aria-labelledby={`grades-${g.id}`} className="flex flex-col gap-3">
                  <h2 id={`grades-${g.id}`} className="m-0 text-title-3 text-ink">
                    {g.title}
                  </h2>
                  <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3" aria-labelledby={`grades-${g.id}`}>
                    {g.rows.map((r) => (
                      <li key={r.course.id} className="min-w-0">
                        <CourseGradeCard row={r} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState icon={Award} title="No courses yet" description="Your courses and their grades appear here once you are enrolled." />
          )}
        </LoadingRegion>
      )}
    </div>
  );
}

/** @param {{ row: Row }} props */
function CourseGradeCard({ row }) {
  const g = row.grade;
  const cells = g?.cells ?? [];
  const graded = cells.filter((c) => c.state === 'RELEASED').length;
  return (
    <Link
      to={`/learner/courses/${row.course.id}/grades`}
      className="flex h-full min-h-16 items-start gap-3 rounded-md border border-hairline bg-card p-4 hover:bg-fill focus-visible:focus-ring"
      data-slot="course-grade-card"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex flex-col">
          <span className="break-words text-headline text-ink">{row.course.title}</span>
          <span className="text-caption text-ink-secondary">{row.course.course_code}</span>
        </span>
        <span className="text-title-2 tabular-nums text-ink">
          {g && g.overall_percentage !== null ? `${formatPercentage(g.overall_percentage)}${g.letter_grade ? ` · ${g.letter_grade}` : ''}` : '—'}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <StatusChip tone={g ? STATUS_TONE[g.status] : 'neutral'}>{g ? STATUS_LABEL[g.status] : STATUS_LABEL.NOT_AVAILABLE}</StatusChip>
          <span className="text-caption text-ink-secondary tabular-nums">
            {graded} of {cells.length} {cells.length === 1 ? 'assignment' : 'assignments'} graded
          </span>
        </span>
      </span>
      <ChevronRight className="mt-1 size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
    </Link>
  );
}
