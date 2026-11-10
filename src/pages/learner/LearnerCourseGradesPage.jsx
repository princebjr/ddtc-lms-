import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { GradebookSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { DistributionChart } from '@/components/gradebook/DistributionChart.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fetchCourse } from '@/lib/courses/courses.js';
import { cellState, chartSummary, fetchCourseGradebook, STATUS_LABEL, STATUS_TONE } from '@/lib/gradebook/gradebook.js';
import { fetchMyGrades, formatPercentage, formatScore } from '@/lib/grading/grading.js';

// The learner's gradebook for one course (Phase 10; D11, D13 to D16; prototype `ngrd` and `ngb`;
// owner request of 2026-11-10: a learner sees one course's grades apart from another's). The course
// grade (overall percentage and letter grade, Provisional, Final or Not yet available) with each
// category, every assignment with the learner's own released score, its state and the feedback, and
// for each released assignment the class distribution with the learner's own band highlighted (only
// when the class reaches min_class_size, D15; a band is not a rank). Only the learner's own row and
// released results reach this page (calculate_course_grades, my_grades). Lesson completion is not a
// mark and is not shown here.

/** @typedef {import('@/lib/gradebook/gradebook.js').GradebookColumn} Column */

export default function LearnerCourseGradesPage() {
  const { courseId = '' } = useParams();
  const { state, data, reload } = useLoad(async () => {
    const [course, book, mine] = await Promise.all([fetchCourse(courseId), fetchCourseGradebook(courseId), fetchMyGrades()]);
    return { course, book, mine: mine.filter((g) => g.course_id === courseId) };
  }, [courseId]);

  if (state === 'error') return <ErrorState title="Your grades for this course could not be loaded" onRetry={reload} />;
  if (state === 'ready' && !data?.course) {
    return <EmptyState icon={ClipboardCheck} title="Course not found" description="You are not enrolled in this course, or it is not open yet." />;
  }
  const course = data?.course ?? null;
  const me = data?.book.learners[0] ?? null;
  const columns = data?.book.columns ?? [];
  const stats = data?.book.stats ?? [];
  const mine = data?.mine ?? [];
  const feedbackOf = (/** @type {string} */ id) => mine.find((g) => g.assignment_id === id && g.state === 'RELEASED') ?? null;
  const cellOf = (/** @type {string} */ id) => me?.cells.find((c) => c.assignment_id === id);

  const tableColumns = [
    {
      key: 'title',
      header: 'Assignment',
      card: /** @type {const} */ ('title'),
      cell: (/** @type {Column} */ c) => (
        <Link to={`/learner/courses/${courseId}/assignments/${c.assignment_id}`} className="text-label text-link hover:underline focus-visible:focus-ring">
          {c.title}
        </Link>
      ),
    },
    { key: 'category', header: 'Category', card: /** @type {const} */ ('secondary'), cell: (/** @type {Column} */ c) => c.category_name },
    {
      key: 'score',
      header: 'Score',
      card: /** @type {const} */ ('value'),
      cell: (/** @type {Column} */ c) => {
        const cell = cellOf(c.assignment_id);
        return (
          <span className="whitespace-nowrap tabular-nums">
            {cell && (cell.state === 'RELEASED' || cell.state === 'COUNTED_ZERO') ? formatScore(cell.score, c.max_marks) : `— / ${Number(c.max_marks)}`}
          </span>
        );
      },
    },
    {
      key: 'percentage',
      header: '%',
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {Column} */ c) => formatPercentage(cellOf(c.assignment_id)?.percentage) || '—',
    },
    {
      key: 'status',
      header: 'Status',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {Column} */ c) => {
        const cell = cellOf(c.assignment_id);
        if (!cell) return null;
        const s = cellState(cell.state, 'learner', c.part === 'PRACTICALS');
        return (
          <span className="flex flex-wrap gap-2">
            <StatusChip tone={s.tone}>{cell.letter_grade && cell.state === 'RELEASED' ? `${s.label} · ${cell.letter_grade}` : s.label}</StatusChip>
            {cell.is_late ? <StatusChip tone="warning">Late</StatusChip> : null}
          </span>
        );
      },
    },
    {
      key: 'feedback',
      header: 'Feedback',
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {Column} */ c) => {
        const g = feedbackOf(c.assignment_id);
        return g?.feedback ? <span className="line-clamp-2 whitespace-pre-wrap break-words text-body-sm">{g.feedback}</span> : '—';
      },
    },
  ];

  const charts = columns
    .map((c) => ({ c, s: stats.find((x) => x.assignment_id === c.assignment_id), cell: cellOf(c.assignment_id) }))
    .filter((x) => x.s && x.s.chart_visible && x.s.released > 0 && x.cell?.state === 'RELEASED');

  return (
    <LoadingRegion loading={state === 'loading'} skeleton={<GradebookSkeleton />} onRetry={reload}>
      {course ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Button asChild variant="ghost" className="self-start">
              <Link to="/learner/grades">
                <ArrowLeft aria-hidden="true" />
                All my courses
              </Link>
            </Button>
            <PageHeader title={course.title} description={`${course.course_code} · Your grades for this course`} className="pb-0" />
          </div>
          <Card className="flex flex-col gap-4" aria-labelledby="course-grade-title" data-slot="course-grade">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle id="course-grade-title">Course grade</CardTitle>
                <span className="text-title-1 tabular-nums text-ink" data-testid="course-grade">
                  {me && me.overall_percentage !== null ? `${formatPercentage(me.overall_percentage)}${me.letter_grade ? ` · ${me.letter_grade}` : ''}` : 'Not yet available'}
                </span>
                {me?.band ? <CardDescription>Band {me.band}</CardDescription> : null}
              </div>
              {me ? <StatusChip tone={STATUS_TONE[me.status]}>{STATUS_LABEL[me.status]}</StatusChip> : null}
            </div>
            <CardDescription>
              {me?.status === 'FINAL'
                ? 'Every assignment is graded and released. This is your final grade for the course.'
                : me?.status === 'PROVISIONAL'
                  ? 'Some work is still to come or waiting for a grade, so this grade may change. Work not yet due or not yet graded does not count against you.'
                  : 'Your course grade appears once a grade is released.'}
            </CardDescription>
            {me && me.categories.length > 1 ? (
              <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0" aria-label="Categories">
                {me.categories.map((k) => (
                  <li key={k.category_id} className="flex min-h-11 items-center justify-between gap-3 py-1">
                    <span className="min-w-0 break-words text-body text-ink">
                      {k.name} <span className="text-ink-secondary">({Number(k.weight)}% of the grade)</span>
                    </span>
                    <span className="tabular-nums text-body text-ink">{formatPercentage(k.percentage) || '—'}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
          <section aria-labelledby="my-assignments" className="flex flex-col gap-3">
            <h2 id="my-assignments" className="m-0 text-title-3 text-ink">
              Assignments
            </h2>
            <ResponsiveTable
              caption="Your assignments in this course"
              columns={tableColumns}
              rows={columns}
              getRowKey={(c) => c.assignment_id}
              cardsBelow="lg"
              empty={<EmptyState icon={ClipboardCheck} title="No assignments yet" description="Assignments appear here once your lecturer publishes them." />}
            />
          </section>
          {charts.length ? (
            <section aria-labelledby="my-charts" className="flex flex-col gap-3">
              <h2 id="my-charts" className="m-0 text-title-3 text-ink">
                How the class scored
              </h2>
              <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 lg:grid-cols-2">
                {charts.map(({ c, s, cell }) =>
                  s ? (
                    <li key={c.assignment_id} className="min-w-0">
                      <Card>
                        <DistributionChart title={c.title} summary={chartSummary(s, cell?.percentage ?? null)} distribution={s.distribution} ownBand={s.my_band} />
                      </Card>
                    </li>
                  ) : null,
                )}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </LoadingRegion>
  );
}
