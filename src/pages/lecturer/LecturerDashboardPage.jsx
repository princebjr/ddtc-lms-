import { BookOpen, CircleCheck, ClipboardList, Clock, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { DashboardSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { ErrorState } from '@/components/feedback/States.jsx';
import { LecturerOverview } from '@/components/dashboard/DashboardPanels.jsx';
import { RoleIntro } from '@/components/dashboard/RoleIntro.jsx';
import { WhoIsOnline } from '@/components/presence/WhoIsOnline.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Card } from '@/components/ui/card.jsx';
import { InsetList, InsetListLink } from '@/components/ui/inset-list.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { COURSE_STATUS_LABEL, COURSE_STATUS_TONE, fetchCourses } from '@/lib/courses/courses.js';
import { fetchGradingQueue } from '@/lib/grading/grading.js';
import { greeting } from '@/lib/greeting.js';
import { ExamMarkingList } from '@/components/exams/ExamPanels.jsx';

// Lecturer dashboard (Phase 5): courses taught at a glance and the most recently changed courses.
// Step 9.1 adds To grade: the answers waiting for marks and feedback, opening the To grade page.
// Phase 11 adds upcoming deadlines and course performance.

export default function LecturerDashboardPage() {
  const auth = useAuth();
  const { state, data, reload } = useLoad(async () => {
    const [courses, queue] = await Promise.all([fetchCourses({}), fetchGradingQueue()]);
    return { courses, queue };
  }, []);
  const courses = data?.courses ?? [];
  const waiting = (data?.queue ?? []).filter((r) => r.state === 'UNGRADED');
  const waitingIn = new Set(waiting.map((r) => r.assignment_id)).size;
  /** @type {Array<{ label: string, value: number, icon: import('lucide-react').LucideIcon, to?: string, detail?: string }>} */
  const tiles = [
    {
      label: 'To grade',
      value: waiting.length,
      icon: ClipboardList,
      to: '/lecturer/to-grade',
      detail: waiting.length ? `in ${waitingIn} ${waitingIn === 1 ? 'assignment' : 'assignments'}` : 'nothing waiting',
    },
    { label: 'Courses you teach', value: courses.filter((c) => c.status !== 'ARCHIVED').length, icon: BookOpen },
    { label: 'Published', value: courses.filter((c) => c.status === 'PUBLISHED').length, icon: CircleCheck },
    { label: 'Waiting for approval', value: courses.filter((c) => c.status === 'PENDING_APPROVAL').length, icon: Clock },
    { label: 'Learners', value: courses.filter((c) => c.status !== 'ARCHIVED').reduce((n, c) => n + c.learners, 0), icon: UsersRound },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={greeting(auth.profile?.first_name)} description="Your teaching at a glance" />
      {state === 'error' ? (
        <ErrorState title="The dashboard could not be loaded" onRetry={reload} />
      ) : (
        <LoadingRegion loading={state === 'loading'} skeleton={<DashboardSkeleton />} onRetry={reload}>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map((t) => {
              const card = (
                <Card className={t.to ? 'flex items-center gap-4 hover:bg-fill' : 'flex items-center gap-4'}>
                  <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-fill text-link">
                    <t.icon className="size-6" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-title-2 text-ink" data-testid={t.to ? 'to-grade-count' : undefined}>
                      {t.value}
                    </span>
                    <span className="text-body-sm text-ink-secondary">{t.label}</span>
                    {t.detail ? <span className="text-caption text-ink-secondary">{t.detail}</span> : null}
                  </span>
                </Card>
              );
              return (
                <li key={t.label}>
                  {t.to ? (
                    <Link to={t.to} className="block rounded-lg focus-visible:focus-ring">
                      {card}
                    </Link>
                  ) : (
                    card
                  )}
                </li>
              );
            })}
          </ul>
          <RoleIntro role="lecturer" />
          <div className="mt-6">
            <WhoIsOnline />
          </div>
          <div className="mt-6">
            <ExamMarkingList role="lecturer" />
            <div className="mt-6">
              <LecturerOverview />
            </div>
          </div>
          <section aria-labelledby="recent-courses" className="mt-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 id="recent-courses" className="m-0 text-title-3 text-ink">
                Recent courses
              </h2>
              <Link to="/lecturer/my-courses" className="inline-flex min-h-11 items-center text-label text-link hover:underline focus-visible:focus-ring">
                All courses
              </Link>
            </div>
            {courses.length ? (
              <InsetList>
                {courses.slice(0, 5).map((c) => (
                  <InsetListLink
                    key={c.id}
                    to={`/lecturer/courses/${c.id}`}
                    title={c.title}
                    secondary={c.course_code}
                    trailing={<StatusChip tone={COURSE_STATUS_TONE[c.status]}>{COURSE_STATUS_LABEL[c.status]}</StatusChip>}
                  />
                ))}
              </InsetList>
            ) : (
              <p className="m-0 text-body-sm text-ink-secondary">You do not teach any course yet.</p>
            )}
          </section>
        </LoadingRegion>
      )}
    </div>
  );
}
