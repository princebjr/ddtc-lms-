import { BookOpen, Library } from 'lucide-react';
import { useParams } from 'react-router';
import { CourseWorkspaceSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Card, CardTitle } from '@/components/ui/card.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { useCourseCovers } from '@/hooks/use-course-covers.js';
import { useLoad } from '@/hooks/use-load.js';
import { useProfileImage } from '@/hooks/use-profile-image.js';
import { fetchCourse, fetchMyEnrolment, fetchTeachers } from '@/lib/courses/courses.js';

// A course as a learner sees it (Phase 5: overview; lessons arrive in Phase 6). A COMPLETED
// enrolment (D05) and an ARCHIVED course (D07) are read-only: the page says so, and later phases
// offer no submission there (private.is_actively_enrolled).

export default function LearnerCoursePage() {
  const { courseId = '' } = useParams();
  const { state, data, reload } = useLoad(async () => {
    const [course, teachers, enrolment] = await Promise.all([fetchCourse(courseId), fetchTeachers(courseId), fetchMyEnrolment(courseId)]);
    return { course, teachers, enrolment };
  }, [courseId]);
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
          <PageHeader title={course.title} description={course.category ? `${course.course_code} · ${course.category}` : course.course_code} />
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="flex flex-col gap-4 lg:col-span-2">
              {covers[course.id] ? <img src={covers[course.id]} alt="" className="aspect-video w-full rounded-md object-cover" /> : null}
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
          <EmptyState icon={Library} title="Lessons arrive in Phase 6" description="Your lessons will appear here." />
        </div>
      ) : null}
    </LoadingRegion>
  );
}

/** @param {{ first: string, second: string, path: string | null }} props */
function Teacher({ first, second, path }) {
  const imageUrl = useProfileImage(path);
  return <UserAvatar firstName={first} secondName={second} imageUrl={imageUrl} size={40} decorative />;
}
