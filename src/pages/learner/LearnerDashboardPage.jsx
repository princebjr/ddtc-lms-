import { BookOpen, GraduationCap } from 'lucide-react';
import { Link } from 'react-router';
import { DashboardSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Card } from '@/components/ui/card.jsx';
import { InsetList, InsetListLink } from '@/components/ui/inset-list.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fetchMyEnrolledCourses } from '@/lib/courses/courses.js';

// Learner dashboard (Phase 5): the courses the learner is enrolled in. Assignments, due dates and
// grades join it in later phases.

export default function LearnerDashboardPage() {
  const auth = useAuth();
  const { state, data, reload } = useLoad(fetchMyEnrolledCourses, []);
  const rows = data ?? [];
  const active = rows.filter((r) => r.enrolment_status === 'ACTIVE' && r.course.status === 'PUBLISHED');
  const tiles = [
    { label: 'Courses in progress', value: active.length, icon: BookOpen },
    { label: 'Completed courses', value: rows.filter((r) => r.enrolment_status === 'COMPLETED').length, icon: GraduationCap },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Welcome, ${auth.profile?.first_name ?? ''}`} description="Your learning at a glance" />
      {state === 'error' ? (
        <ErrorState title="The dashboard could not be loaded" onRetry={reload} />
      ) : (
        <LoadingRegion loading={state === 'loading'} skeleton={<DashboardSkeleton />} onRetry={reload}>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
            {tiles.map((t) => (
              <li key={t.label}>
                <Card className="flex items-center gap-4">
                  <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-fill text-link">
                    <t.icon className="size-6" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-title-2 text-ink">{t.value}</span>
                    <span className="text-body-sm text-ink-secondary">{t.label}</span>
                  </span>
                </Card>
              </li>
            ))}
          </ul>
          <section aria-labelledby="my-courses-heading" className="mt-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 id="my-courses-heading" className="m-0 text-title-3 text-ink">
                My courses
              </h2>
              <Link to="/learner/my-courses" className="inline-flex min-h-11 items-center text-label text-link hover:underline focus-visible:focus-ring">
                All courses
              </Link>
            </div>
            {rows.length ? (
              <InsetList>
                {rows.slice(0, 5).map(({ course, enrolment_status: status }) => (
                  <InsetListLink
                    key={course.id}
                    to={`/learner/courses/${course.id}`}
                    title={course.title}
                    secondary={course.course_code}
                    trailing={status === 'COMPLETED' ? <StatusChip tone="info">Completed</StatusChip> : course.status === 'ARCHIVED' ? <StatusChip>Archived</StatusChip> : null}
                  />
                ))}
              </InsetList>
            ) : (
              <p className="m-0 text-body-sm text-ink-secondary">You are not enrolled in any course yet. The DDTC office enrols you.</p>
            )}
          </section>
        </LoadingRegion>
      )}
    </div>
  );
}
