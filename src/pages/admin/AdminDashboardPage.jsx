import { GraduationCap, ShieldCheck, UserRoundX, Users, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { DashboardSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Card } from '@/components/ui/card.jsx';
import { fetchUserCounts } from '@/lib/admin/users.js';

// Administrator dashboard (Phase 4): account counts. Courses, approvals and enrolments join it in
// Phase 5. A warning shows while fewer than two administrators are active (D32 launch rule).

export default function AdminDashboardPage() {
  const [key, setKey] = useState(0);
  // Each answer is tagged with the request it belongs to; anything older counts as loading.
  const [result, setResult] = useState(/** @type {{ key: number, counts?: Awaited<ReturnType<typeof fetchUserCounts>>, failed?: boolean } | null} */ (null));
  const current = result?.key === key ? result : null;
  const counts = current?.counts ?? null;
  const failed = Boolean(current?.failed);
  const retry = useCallback(() => setKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchUserCounts()
      .then((c) => !cancelled && setResult({ key, counts: c }))
      .catch(() => !cancelled && setResult({ key, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const tiles = counts
    ? [
        { label: 'Active learners', value: counts.learners, icon: GraduationCap, to: '/admin/learners' },
        { label: 'Active lecturers', value: counts.lecturers, icon: UsersRound, to: '/admin/lecturers' },
        { label: 'Active administrators', value: counts.admins, icon: ShieldCheck, to: '/admin/users' },
        { label: 'Suspended', value: counts.suspended, icon: UserRoundX, to: '/admin/users' },
        { label: 'Deactivated', value: counts.deactivated, icon: Users, to: '/admin/users' },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Accounts at a glance" />
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
