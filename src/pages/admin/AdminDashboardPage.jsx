import { BookOpen, ClipboardCheck, Clock, GraduationCap, ShieldCheck, UserRoundX, Users, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { DashboardSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Card } from '@/components/ui/card.jsx';
import { fetchUserCounts } from '@/lib/admin/users.js';
import { fetchCourseCounts } from '@/lib/courses/courses.js';
import { greeting } from '@/lib/greeting.js';

// Administrator dashboard: account counts (Phase 4) and published courses, courses waiting for
// approval and active enrolments (Phase 5). A warning shows while fewer than two administrators are active (D32 launch rule).

export default function AdminDashboardPage() {
  const auth = useAuth();
  const [key, setKey] = useState(0);
  // Each answer is tagged with the request it belongs to; anything older counts as loading.
  const [result, setResult] = useState(/** @type {{ key: number, counts?: Awaited<ReturnType<typeof fetchUserCounts>> & Awaited<ReturnType<typeof fetchCourseCounts>>, failed?: boolean } | null} */ (null));
  const current = result?.key === key ? result : null;
  const counts = current?.counts ?? null;
  const failed = Boolean(current?.failed);
  const retry = useCallback(() => setKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchUserCounts(), fetchCourseCounts()])
      .then(([users, courses]) => !cancelled && setResult({ key, counts: { ...users, ...courses } }))
      .catch(() => !cancelled && setResult({ key, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const tiles = counts
    ? [
        { label: 'Waiting for approval', value: counts.pending, icon: Clock, to: '/admin/approvals' },
        { label: 'Published courses', value: counts.published, icon: BookOpen, to: '/admin/courses' },
        { label: 'Active enrolments', value: counts.enrolments, icon: ClipboardCheck, to: '/admin/enrolments' },
        { label: 'Active learners', value: counts.learners, icon: GraduationCap, to: '/admin/learners' },
        { label: 'Active lecturers', value: counts.lecturers, icon: UsersRound, to: '/admin/lecturers' },
        { label: 'Active administrators', value: counts.admins, icon: ShieldCheck, to: '/admin/users' },
        { label: 'Suspended', value: counts.suspended, icon: UserRoundX, to: '/admin/users' },
        { label: 'Deactivated', value: counts.deactivated, icon: Users, to: '/admin/users' },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={greeting(auth.profile?.first_name)} description="Courses and accounts at a glance" />
      {failed ? (
        <ErrorState title="The dashboard could not be loaded" onRetry={retry} />
      ) : (
        <LoadingRegion loading={!counts} skeleton={<DashboardSkeleton />} onRetry={retry}>
          {counts && counts.admins < 2 ? (
            <p role="status" className="m-0 mb-4 rounded-md status-tint-warning p-4 text-body-sm text-ink">
              Only {counts.admins} administrator is active. DDTC needs at least two active administrators before going live (D32).
            </p>
          ) : null}
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map((t) => (
              <li key={t.label}>
                <Link to={t.to} className="block rounded-lg focus-visible:focus-ring">
                  <Card className="flex items-center gap-4 hover:bg-fill">
                    <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-fill text-link">
                      <t.icon className="size-6" aria-hidden="true" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-title-2 text-ink">{t.value}</span>
                      <span className="text-body-sm text-ink-secondary">{t.label}</span>
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </LoadingRegion>
      )}
    </div>
  );
}
