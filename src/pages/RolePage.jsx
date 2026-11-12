import { lazy, Suspense } from 'react';
import { useParams } from 'react-router';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { IdleSessionProvider } from '@/components/auth/IdleSessionProvider.jsx';
import { SessionWatcher } from '@/components/auth/SessionWatcher.jsx';
import { DashboardSkeleton } from '@/components/feedback/Skeletons.jsx';
import { GradeNotices } from '@/components/grading/GradeNotices.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { AppShell } from '@/components/layout/AppShell.jsx';
import { NotificationBell } from '@/components/notifications/NotificationBell.jsx';
import { PresenceProvider } from '@/components/presence/PresenceProvider.jsx';
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
const ToGradePage = lazy(() => import('./lecturer/ToGradePage.jsx'));
const LearnerGradesPage = lazy(() => import('./learner/LearnerGradesPage.jsx'));
const GradebooksPage = lazy(() => import('./courses/GradebooksPage.jsx'));
const NotificationsPage = lazy(() => import('./account/NotificationsPage.jsx'));
const SettingsPage = lazy(() => import('./admin/SettingsPage.jsx'));
const AuditLogsPage = lazy(() => import('./admin/AuditLogsPage.jsx'));
const RetentionPage = lazy(() => import('./admin/RetentionPage.jsx'));
const ReportsPage = lazy(() => import('./admin/ReportsPage.jsx'));
const AnnouncementsPage = lazy(() => import('./courses/AnnouncementsPage.jsx'));

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
  'admin/gradebooks': () => <GradebooksPage role="admin" />,
  'admin/profile': () => <ProfilePage />,
  'admin/notifications': () => <NotificationsPage />,
  'admin/settings': () => <SettingsPage />,
  'admin/audit-logs': () => <AuditLogsPage />,
  'admin/retention': () => <RetentionPage />,
  'admin/reports': () => <ReportsPage />,
  'admin/announcements': () => <AnnouncementsPage role="admin" />,
  'lecturer/announcements': () => <AnnouncementsPage role="lecturer" />,
  'lecturer/notifications': () => <NotificationsPage />,
  'learner/notifications': () => <NotificationsPage />,
  'lecturer/dashboard': () => <LecturerDashboardPage />,
  'lecturer/my-courses': () => <CoursesPage role="lecturer" />,
  'lecturer/to-grade': () => <ToGradePage />,
  'lecturer/gradebooks': () => <GradebooksPage role="lecturer" />,
  'learner/dashboard': () => <LearnerDashboardPage />,
  'learner/my-courses': () => <LearnerCoursesPage />,
  'learner/assignments': () => <LearnerAssignmentsPage />,
  'learner/grades': () => <LearnerGradesPage />,
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
      bell={<NotificationBell href={`/${role}/notifications`} />}
    >
      <SessionWatcher />
      <IdleSessionProvider />
      {role === 'learner' ? <GradeNotices /> : null}
      {role === 'admin' ? (
        <Suspense fallback={<DashboardSkeleton />}>{children}</Suspense>
      ) : (
        // Step 11.1: learners and lecturers are announced on their courses' presence channels on every page.
        <PresenceProvider userId={auth.profile.id}>
          <Suspense fallback={<DashboardSkeleton />}>{children}</Suspense>
        </PresenceProvider>
      )}
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
