import { BookOpen, CircleCheck, Circle, ClipboardCheck, ClipboardList, Library } from 'lucide-react';
import { CourseAnnouncements } from '@/components/announcements/CourseAnnouncements.jsx';
import { Link, useParams } from 'react-router';
import { CourseCover } from '@/components/courses/CourseCover.jsx';
import { CourseWorkspaceSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardTitle } from '@/components/ui/card.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { useCourseCovers } from '@/hooks/use-course-covers.js';
import { useLoad } from '@/hooks/use-load.js';
import { useProfileImage } from '@/hooks/use-profile-image.js';
import { fetchCoursePage } from '@/lib/pages/page-reads.js';
import { CONTENT_TYPE_LABEL } from '@/lib/assignments/assignments.js';
import { LEARNER_STATE } from '@/lib/exams/exams.js';
import { courseGradeTag } from '@/lib/gradebook/gradebook.js';
import { dueStatus, formatDue } from '@/lib/assignments/due.js';

// A course as a learner sees it (Phase 5 overview; Phase 6 lessons with progress; Phase 7 its
// assignments with due dates). A COMPLETED
// enrolment (D05) and an ARCHIVED course (D07) are read-only: the page says so, and later phases
// offer no submission there (private.is_actively_enrolled).

export default function LearnerCoursePage() {
  const { courseId = '' } = useParams();
  // One call for the whole screen (Phase 15, D45); the assignments are already this course's.
  const { state, data, reload } = useLoad(() => fetchCoursePage(courseId), [courseId]);
  const covers = useCourseCovers(data?.course?.cover_image_file_id ? [courseId] : []);

  if (state === 'error') return <ErrorState title="The course could not be loaded" onRetry={reload} />;
  if (state === 'ready' && !data?.course) {
    return <EmptyState icon={BookOpen} title="Course not found" description="You are not enrolled in this course, or it is not open yet." />;
  }
  const course = data?.course ?? null;
  const readOnly = course?.status === 'ARCHIVED' || data?.enrolment === 'COMPLETED';

  return (
    <LoadingRegion loading={state === 'loading'} skeleton={<CourseWorkspaceSkeleton />} onRetry={reload}>
      {course ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <PageHeader title={course.title} description={course.category ? `${course.course_code} · ${course.category}` : course.course_code} className="pb-0" />
            {/* Always visible (not a header action, which hides below desktop width): the course's own gradebook. */}
            {/* Step 10.2 (owner request 2026-11-10): the course grade with its letter, on the course's tag. */}
            {courseGradeTag(data?.grade) ? (
              <span data-testid="course-grade-tag">
                <StatusChip tone={/** @type {NonNullable<ReturnType<typeof courseGradeTag>>} */ (courseGradeTag(data?.grade)).tone}>
                  {/** @type {NonNullable<ReturnType<typeof courseGradeTag>>} */ (courseGradeTag(data?.grade)).label}
                </StatusChip>
              </span>
            ) : null}
            <Button asChild variant="outline" className="self-start">
              <Link to={`/learner/courses/${course.id}/grades`}>
                <ClipboardCheck aria-hidden="true" />
                My grades
              </Link>
            </Button>
          </div>
          {readOnly ? (
            <div className="flex flex-col gap-3">
              <span>
                <StatusChip tone="info">{course.status === 'ARCHIVED' ? 'Archived' : 'Completed'}</StatusChip>
              </span>
              <p role="status" className="m-0 rounded-md bg-fill p-4 text-body-sm text-ink-secondary">
                {course.status === 'ARCHIVED'
                  ? 'This course is archived. You can still read it and see your released grades, but you cannot submit work.'
                  : 'You have completed this course. You can still read it and see your released grades, but you cannot submit work.'}
              </p>
            </div>
          ) : null}
          <CourseAnnouncements courseId={course.id} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="flex flex-col gap-4 lg:col-span-2">
              {covers[course.id] ? <CourseCover url={covers[course.id]} className="rounded-md" /> : null}
              <CardTitle>About this course</CardTitle>
              <p className="m-0 whitespace-pre-line text-reading text-ink">{course.description || 'No description yet.'}</p>
              {course.learning_objectives ? (
                <>
                  <CardTitle>What you will learn</CardTitle>
                  <ul className="m-0 flex flex-col gap-1 pl-5 text-body text-ink">
                    {course.learning_objectives
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                  </ul>
                </>
              ) : null}
            </Card>
            <Card className="flex flex-col gap-3">
              <CardTitle>Lecturers</CardTitle>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {(data?.teachers ?? []).map((t) => (
                  <li key={t.lecturer_id} className="flex items-center gap-3">
                    <Teacher first={t.first_name} second={t.second_name} path={t.profile_image_path} />
                    <span className="text-label text-ink">
                      {t.first_name} {t.second_name}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Lessons courseId={course.id} lessons={data?.lessons ?? []} progress={data?.progress ?? {}} />
          <Assignments courseId={course.id} assignments={data?.assignments ?? []} />
          <Examinations courseId={course.id} exams={data?.exams ?? []} />
        </div>
      ) : null}
    </LoadingRegion>
  );
}

/**
 * Lessons in order with what the learner has completed, and the course progress.
 * @param {{ courseId: string, lessons: import('@/lib/lessons/lessons.js').LessonSummary[], progress: Record<string, boolean> }} props
 */
function Lessons({ courseId, lessons, progress }) {
  if (!lessons.length) return <EmptyState icon={Library} title="No lessons yet" description="Your lecturer has not published any lessons in this course yet." />;
  const completed = lessons.filter((l) => progress[l.id]).length;
  const percent = Math.round((completed / lessons.length) * 100);
  return (
    <section aria-labelledby="lessons-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h2 id="lessons-heading" className="m-0 text-title-3 text-ink">
          Lessons
        </h2>
        <p className="m-0 text-body-sm text-ink-secondary">
          {completed} of {lessons.length} lessons completed
        </p>
        <div role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-fill">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ol className="m-0 flex list-none flex-col divide-y divide-hairline overflow-hidden rounded-md border border-hairline bg-card p-0">
        {lessons.map((l, i) => (
          <li key={l.id}>
            <Link to={`/learner/courses/${courseId}/lessons/${l.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-fill focus-visible:focus-ring">
              {progress[l.id] ? (
                <CircleCheck className="size-5 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <Circle className="size-5 shrink-0 text-ink-tertiary" aria-hidden="true" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-label text-ink">
                  {i + 1}. {l.title}
                </span>
                <span className="text-caption text-ink-secondary">{progress[l.id] ? 'Completed' : 'Not completed'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** @param {{ first: string, second: string, path: string | null }} props */
function Teacher({ first, second, path }) {
  const imageUrl = useProfileImage(path);
  return <UserAvatar firstName={first} secondName={second} imageUrl={imageUrl} size={40} decorative />;
}

/**
 * The course's published assignments, soonest due first, each with its due-date chip (Ghana time,
 * with the learner's own extension; D13).
 * @param {{ courseId: string, assignments: Awaited<ReturnType<typeof import('@/lib/assignments/assignments.js').fetchMyAssignments>> }} props
 */
function Assignments({ courseId, assignments }) {
  const now = new Date();
  const rows = assignments
    .map((a) => ({ ...a, due: dueStatus({ dueAt: a.due_at, allowLate: a.allow_late, extendedTo: a.extended_to }, now) }))
    .sort((x, y) => Date.parse(x.due.effective) - Date.parse(y.due.effective));
  return (
    <section aria-labelledby="assignments-heading" className="flex flex-col gap-3">
      <h2 id="assignments-heading" className="m-0 text-title-3 text-ink">
        Assignments
      </h2>
      {rows.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-hairline rounded-md border border-hairline bg-card p-0">
          {rows.map((a) => (
            <li key={a.id}>
              <Link to={`/learner/courses/${courseId}/assignments/${a.id}`} className="flex min-h-14 flex-col gap-1 px-4 py-2 hover:bg-fill focus-visible:focus-ring sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-label text-ink">{a.title}</span>
                  <span className="text-body-sm text-ink-secondary">{CONTENT_TYPE_LABEL[a.content_type]} instructions</span>
                </span>
                <span className="shrink-0">
                  <StatusChip tone={a.due.tone}>{a.due.label}</StatusChip>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={ClipboardList} title="No assignments yet" description="Your lecturer has not published any assignments in this course yet." />
      )}
    </section>
  );
}

/**
 * The course's examinations (Phase 10.1, ADR-016): each with where the learner stands and its deadline
 * in Ghana time (no countdown), and the released result. Each opens the examination page.
 * @param {{ courseId: string, exams: import('@/lib/exams/exams.js').MyExamSummary[] }} props
 */
function Examinations({ courseId, exams }) {
  if (!exams.length) return null;
  return (
    <section aria-labelledby="exams-heading" className="flex flex-col gap-3">
      <h2 id="exams-heading" className="m-0 text-title-3 text-ink">
        Examinations
      </h2>
      <ul className="m-0 flex list-none flex-col divide-y divide-hairline rounded-md border border-hairline bg-card p-0">
        {exams.map((x) => (
          <li key={x.id}>
            <Link
              to={`/learner/courses/${courseId}/exams/${x.id}`}
              className="flex min-h-14 flex-col gap-1 px-4 py-2 hover:bg-fill focus-visible:focus-ring sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              data-slot="course-exam"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-label text-ink">{x.title}</span>
                <span className="text-caption text-ink-secondary tabular-nums">
                  {x.state === 'UPCOMING' ? `Opens ${formatDue(x.opens_at)}` : `Submit by ${formatDue(x.closes_at)}`} (Ghana time)
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                {x.released && x.total_score !== null ? (
                  <StatusChip tone={x.passed ? 'success' : 'warning'}>{`${Number(x.total_score)} / ${Number(x.total_marks)} · ${x.passed ? 'Pass' : 'Not passed'}`}</StatusChip>
                ) : (
                  <StatusChip tone={LEARNER_STATE[x.state].tone}>{LEARNER_STATE[x.state].label}</StatusChip>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
