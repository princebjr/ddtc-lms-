import { BookOpen } from 'lucide-react';
import { CourseCard, courseStatusChip } from '@/components/courses/CourseCard.jsx';
import { CourseCardsSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { useCourseCovers } from '@/hooks/use-course-covers.js';
import { useLoad } from '@/hooks/use-load.js';
import { fetchMyEnrolledCourses } from '@/lib/courses/courses.js';

// Learner My Courses (Phase 5): the PUBLISHED and ARCHIVED courses the learner is enrolled in
// (ACTIVE or COMPLETED, D05). Draft and pending courses never appear: RLS hides them.

export default function LearnerCoursesPage() {
  const { state, data, reload } = useLoad(fetchMyEnrolledCourses, []);
  const rows = data ?? [];
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
