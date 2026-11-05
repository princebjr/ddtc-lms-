import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/feedback/States.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { NAVIGATION } from '@/lib/navigation.js';

// Content for a role destination that a later phase builds: the dashboard frame, or a notice
// naming the phase that delivers the page. Used by the guarded role routes and the preview routes.

/**
 * @param {{ role: import('@/lib/navigation.js').RoleKey, destination: import('@/lib/navigation.js').Destination }} props
 */
export function RolePlaceholder({ role, destination }) {
  if (destination.slug !== 'dashboard') {
    return <EmptyState icon={destination.icon} title={`${destination.label} arrives in Phase ${destination.phase}`} description="This page is not built yet." />;
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {['Summary', 'Activity', 'Next steps'].map((name) => (
          <Card key={name} className="flex flex-col gap-2">
            <CardTitle>{name}</CardTitle>
            <CardDescription>Fills in as courses, assignments and grades are built.</CardDescription>
          </Card>
        ))}
      </div>
      <EmptyState
        icon={Construction}
        title="Your dashboard is being built"
        description={`The ${NAVIGATION[role].roleLabel.toLowerCase()} dashboard shows real data from Phase ${destination.phase}.`}
      />
    </div>
  );
}
