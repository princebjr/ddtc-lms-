import { lazy, Suspense } from 'react';
import { useParams } from 'react-router';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { IdleSessionProvider } from '@/components/auth/IdleSessionProvider.jsx';
import { SessionWatcher } from '@/components/auth/SessionWatcher.jsx';
import { DashboardSkeleton } from '@/components/feedback/Skeletons.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { AppShell } from '@/components/layout/AppShell.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { RolePlaceholder } from '@/components/layout/RolePlaceholder.jsx';
import { useAvatarUrl } from '@/hooks/use-avatar-url.js';
import { findDestination } from '@/lib/navigation.js';
import NotFoundPage from './NotFoundPage.jsx';

// Guarded role pages (/admin/..., /lecturer/..., /learner/...). RoleShell is the layout for every
// page of a role; BUILT maps the destinations delivered so far to their page (code-split), and the
// rest show the placeholder naming the phase that builds them.

/** @typedef {import('@/lib/navigation.js').RoleKey} RoleKey */

const ProfilePage = lazy(() => import('./account/ProfilePage.jsx'));
const AdminDashboardPage = lazy(() => import('./admin/AdminDashboardPage.jsx'));
const UsersPage = lazy(() => import('./admin/UsersPage.jsx'));
const CoursesPage = lazy(() => import('./courses/CoursesPage.jsx'));
const ApprovalsPage = lazy(() => import('./admin/ApprovalsPage.jsx'));
const EnrolmentsPage = lazy(() => import('./admin/EnrolmentsPage.jsx'));
const LearnerCoursesPage = lazy(() => import('./learner/LearnerCoursesPage.jsx'));
const LecturerDashboardPage = lazy(() => import('./lecturer/LecturerDashboardPage.jsx'));
const LearnerDashboardPage = lazy(() => import('./learner/LearnerDashboardPage.jsx'));
const AdminAssignmentsPage = lazy(() => import('./admin/AdminAssignmentsPage.jsx'));
const LearnerAssignmentsPage = lazy(() => import('./learner/LearnerAssignmentsPage.jsx'));

/** @type {Record<string, () => import('react').ReactNode>} */
const BUILT = {
  'admin/dashboard': () => <AdminDashboardPage />,
  'admin/users': () => <UsersPage view="all" />,
  'admin/lecturers': () => <UsersPage view="lecturers" />,
  'admin/learners': () => <UsersPage view="learners" />,
  'admin/courses': () => <CoursesPage role="admin" />,
  'admin/approvals': () => <ApprovalsPage />,
  'admin/enrolments': () => <EnrolmentsPage />,
  'admin/assignments': () => <AdminAssignmentsPage />,
  'admin/profile': () => <ProfilePage />,
  'lecturer/dashboard': () => <LecturerDashboardPage />,
  'lecturer/my-courses': () => <CoursesPage role="lecturer" />,
  'learner/dashboard': () => <LearnerDashboardPage />,
  'learner/my-courses': () => <LearnerCoursesPage />,
  'learner/assignments': () => <LearnerAssignmentsPage />,
  'lecturer/profile': () => <ProfilePage />,
  'learner/profile': () => <ProfilePage />,
};

/**
 * The role layout around a page: shell, signed-in user, session limits, sign-out.
 * @param {{ role: RoleKey, slug: string, children: import('react').ReactNode }} props
 */
export function RoleShell({ role, slug, children }) {
  const auth = useAuth();
  const toast = useToast();
  const imageUrl = useAvatarUrl(auth.profile?.profile_image_file_id);
  if (!auth.profile) return <NotFoundPage />;

  const onSignOut = async () => {
    // The guard sends the user to Sign In once the session has ended.
    await auth.signOut({ to: '/login' });
    toast.show('account.signed-out');
  };

  return (
    <AppShell
      role={role}
      basePath={`/${role}`}
      currentSlug={slug}
      user={{ firstName: auth.profile.first_name, secondName: auth.profile.second_name, imageUrl }}
      onSignOut={onSignOut}
    >
      <SessionWatcher />
      <IdleSessionProvider />
      <Suspense fallback={<DashboardSkeleton />}>{children}</Suspense>
    </AppShell>
  );
}

/** @param {{ role: RoleKey }} props */
export function RolePage({ role }) {
  const { slug = 'dashboard' } = useParams();
  const destination = findDestination(role, slug);
  if (!destination) return <NotFoundPage />;
  const built = BUILT[`${role}/${destination.slug}`];
  return (
    <RoleShell role={role} slug={destination.slug}>
      {built ? (
        built()
      ) : (
        <>
          <PageHeader title={destination.title} description={destination.description} />
          <RolePlaceholder role={role} destination={destination} />
        </>
      )}
    </RoleShell>
  );
}

export const AdminPage = () => <RolePage role="admin" />;
export const LecturerPage = () => <RolePage role="lecturer" />;
export const LearnerPage = () => <RolePage role="learner" />;
