import { BookOpen } from 'lucide-react';
import { CourseCard, courseStatusChip } from '@/components/courses/CourseCard.jsx';
import { CourseCardsSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { useCourseCovers } from '@/hooks/use-course-covers.js';
import { useLoad } from '@/hooks/use-load.js';
import { fetchMyEnrolledCourses } from '@/lib/courses/courses.js';
import { courseGradeTag, fetchMyCourseGrades } from '@/lib/gradebook/gradebook.js';

// Learner My Courses (Phase 5): the PUBLISHED and ARCHIVED courses the learner is enrolled in
// (ACTIVE or COMPLETED, D05). Draft and pending courses never appear: RLS hides them. Since Step 10.2
// each card carries the course grade with its letter (Final or provisional) once a grade counts.

export default function LearnerCoursesPage() {
  const { state, data, reload } = useLoad(async () => {
    const [courses, grades] = await Promise.all([fetchMyEnrolledCourses(), fetchMyCourseGrades()]);
    return { courses, grades };
  }, []);
  const rows = data?.courses ?? [];
  const gradeOf = (/** @type {string} */ id) => courseGradeTag(data?.grades.find((g) => g.course.id === id)?.grade);
  const covers = useCourseCovers(rows.map((r) => r.course.id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My Courses" description="Courses you are enrolled in" />
      {state === 'error' ? (
        <ErrorState title="Your courses could not be loaded" onRetry={reload} />
      ) : (
        <LoadingRegion loading={state === 'loading'} skeleton={<CourseCardsSkeleton />} onRetry={reload}>
          {rows.length ? (
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map(({ course, enrolment_status: status }) => (
                <li key={course.id}>
                  <CourseCard
                    to={`/learner/courses/${course.id}`}
                    title={course.title}
                    code={course.course_code}
                    coverUrl={covers[course.id]}
                    chips={[
                      // Step 10.2 (owner request 2026-11-10): the course's grade with its letter, on the course's tag.
                      ...(gradeOf(course.id) ? [/** @type {NonNullable<ReturnType<typeof gradeOf>>} */ (gradeOf(course.id))] : []),
                      ...(course.status === 'ARCHIVED' ? [courseStatusChip('ARCHIVED')] : []),
                      ...(status === 'COMPLETED' ? [{ label: 'Completed', tone: /** @type {const} */ ('info') }] : []),
                    ]}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={BookOpen} title="You are not enrolled in any course yet" description="The DDTC office enrols you in courses. You will see them here." />
          )}
        </LoadingRegion>
      )}
    </div>
  );
}
