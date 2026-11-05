import { useParams } from 'react-router';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { SessionWatcher } from '@/components/auth/SessionWatcher.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { AppShell } from '@/components/layout/AppShell.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { RolePlaceholder } from '@/components/layout/RolePlaceholder.jsx';
import { findDestination } from '@/lib/navigation.js';
import NotFoundPage from './NotFoundPage.jsx';

// A guarded role page (/admin/..., /lecturer/..., /learner/...): the role shell with the signed-in
// user. Each destination shows its placeholder until the phase that builds it.

/** @param {{ role: import('@/lib/navigation.js').RoleKey }} props */
export function RolePage({ role }) {
  const { slug = 'dashboard' } = useParams();
  const auth = useAuth();
  const toast = useToast();
  const destination = findDestination(role, slug);
  if (!destination || !auth.profile) return <NotFoundPage />;

  const onSignOut = async () => {
    // The guard sends the user to Sign In once the session has ended.
    await auth.signOut({ to: '/login' });
    toast.show('account.signed-out');
  };

  return (
    <AppShell
      role={role}
      basePath={`/${role}`}
      currentSlug={destination.slug}
      user={{ firstName: auth.profile.first_name, secondName: auth.profile.second_name }}
      onSignOut={onSignOut}
    >
      <SessionWatcher />
      <PageHeader title={destination.title} description={destination.description} />
      <RolePlaceholder role={role} destination={destination} />
    </AppShell>
  );
}

export const AdminPage = () => <RolePage role="admin" />;
export const LecturerPage = () => <RolePage role="lecturer" />;
export const LearnerPage = () => <RolePage role="learner" />;
