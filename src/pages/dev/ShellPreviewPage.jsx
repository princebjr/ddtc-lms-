import { Construction } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { DashboardSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState } from '@/components/feedback/States.jsx';
import { AppShell } from '@/components/layout/AppShell.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { findDestination, NAVIGATION, ROLE_KEYS } from '@/lib/navigation.js';
import NotFoundPage from '../NotFoundPage.jsx';

// Role shell preview (/dev/shell/:role/:slug). Demo people come from the prototype. Each
// destination is a placeholder that says which phase delivers it. `?delay=<ms>` or `?delay=never`
// simulates a slow load so the skeleton timing can be checked end to end.

/** @type {Record<import('@/lib/navigation.js').RoleKey, { firstName: string, secondName: string }>} */
const DEMO_USERS = {
  admin: { firstName: 'Prince', secondName: 'Boateng' },
  lecturer: { firstName: 'Ama', secondName: 'Boateng' },
  learner: { firstName: 'Kwame', secondName: 'Mensah' },
};

/** @param {string | null} raw @returns {number | null} null = never finishes */
function parseDelay(raw) {
  if (raw === 'never') return null;
  const ms = Number(raw ?? 0);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

/** @param {number | null} delay */
function useSimulatedLoad(delay) {
  const [loading, setLoading] = useState(delay !== 0);
  useEffect(() => {
    if (delay === 0 || delay === null) return undefined;
    const timer = setTimeout(() => setLoading(false), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  return loading;
}

export default function ShellPreviewPage() {
  const { role, slug = 'dashboard' } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const loading = useSimulatedLoad(parseDelay(search.get('delay')));

  const roleKey = ROLE_KEYS.find((r) => r === role);
  const dest = roleKey ? findDestination(roleKey, slug) : undefined;
  if (!roleKey || !dest) return <NotFoundPage />;

  const isDashboard = dest.slug === 'dashboard';
  return (
    <AppShell role={roleKey} basePath={`/dev/shell/${roleKey}`} currentSlug={dest.slug} user={DEMO_USERS[roleKey]} onSignOut={() => navigate('/dev')}>
      <PageHeader title={dest.title} description={dest.description} />
      <LoadingRegion loading={loading} skeleton={<DashboardSkeleton />} onRetry={() => window.location.reload()}>
        {isDashboard ? (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {['Summary', 'Activity', 'Next steps'].map((name) => (
                <Card key={name} className="flex flex-col gap-2">
                  <CardTitle>{name}</CardTitle>
                  <CardDescription>Fills in as courses, assignments and grades are built.</CardDescription>
                </Card>
              ))}
            </div>
            <EmptyState icon={Construction} title="Your dashboard is being built" description={`The ${NAVIGATION[roleKey].roleLabel.toLowerCase()} dashboard shows real data from Phase ${dest.phase}.`} />
          </div>
        ) : (
          <EmptyState icon={dest.icon} title={`${dest.label} arrives in Phase ${dest.phase}`} description="This preview shows the layout and navigation only. Nothing here is saved." />
        )}
      </LoadingRegion>
    </AppShell>
  );
}
