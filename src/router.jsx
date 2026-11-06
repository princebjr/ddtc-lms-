import { createBrowserRouter } from 'react-router';
import { ProtectedRoute, RootRedirect, SignedOutRoute, StepRoute } from '@/components/auth/Guards.jsx';
import { devRoutesEnabled } from '@/lib/flags.js';
import RouteErrorPage from '@/pages/RouteErrorPage.jsx';

// Routes, code-split per page (RESPONSIVE.md 15.5; ARCHITECTURE.md section 5).
// `/`              Sign In when signed out, the user's dashboard when signed in
// auth pages       signed-out users only; signed-in users are sent on
// /mfa, /complete-profile   steps inside sign-in
// /admin, /lecturer, /learner   guarded by role, account status and (admin) MFA
// Preview routes are compiled in only when VITE_DEV_ROUTES is true (Phase 1 plan, decision 1).

/**
 * @param {() => Promise<{ default: import('react').ComponentType }>} load
 * @returns {() => Promise<{ Component: import('react').ComponentType }>}
 */
const page = (load) => async () => ({ Component: (await load()).default });

/** @param {'AdminNewCourse' | 'AdminCourse' | 'LecturerNewCourse' | 'LecturerCourse' | 'LearnerCourse'} name */
const coursePage = (name) => async () => ({ Component: (await import('@/pages/courses/CourseRoutes.jsx'))[name] });

/** @param {'AdminPage' | 'LecturerPage' | 'LearnerPage'} name */
const rolePage = (name) => async () => ({ Component: (await import('@/pages/RolePage.jsx'))[name] });

/** @type {import('react-router').RouteObject[]} */
const authRoutes = [
  { index: true, element: <RootRedirect /> },
  {
    element: <SignedOutRoute />,
    children: [
      { path: 'login', lazy: page(() => import('@/pages/auth/LoginPage.jsx')) },
      { path: 'signup', lazy: page(() => import('@/pages/auth/SignUpPage.jsx')) },
      { path: 'forgot-password', lazy: page(() => import('@/pages/auth/ForgotPasswordPage.jsx')) },
      { path: 'verify-email', lazy: page(() => import('@/pages/auth/VerifyEmailPage.jsx')) },
    ],
  },
  { path: 'reset-password', lazy: page(() => import('@/pages/auth/ResetPasswordPage.jsx')) },
  { path: 'auth/confirm', lazy: page(() => import('@/pages/auth/ConfirmPage.jsx')) },
  { path: 'auth/callback', lazy: page(() => import('@/pages/auth/CallbackPage.jsx')) },
  { element: <StepRoute step="mfa" />, children: [{ path: 'mfa', lazy: page(() => import('@/pages/auth/MfaPage.jsx')) }] },
  {
    element: <StepRoute step="complete-profile" />,
    children: [{ path: 'complete-profile', lazy: page(() => import('@/pages/auth/CompleteProfilePage.jsx')) }],
  },
];

/** @type {import('react-router').RouteObject[]} */
const roleRoutes = [
  {
    path: 'admin',
    element: <ProtectedRoute role="ADMIN" />,
    children: [
      { path: 'courses/new', lazy: coursePage('AdminNewCourse') },
      { path: 'courses/:courseId/:tab?', lazy: coursePage('AdminCourse') },
      { path: ':slug?', lazy: rolePage('AdminPage') },
    ],
  },
  {
    path: 'lecturer',
    element: <ProtectedRoute role="LECTURER" />,
    children: [
      { path: 'courses/new', lazy: coursePage('LecturerNewCourse') },
      { path: 'courses/:courseId/:tab?', lazy: coursePage('LecturerCourse') },
      { path: ':slug?', lazy: rolePage('LecturerPage') },
    ],
  },
  {
    path: 'learner',
    element: <ProtectedRoute role="LEARNER" />,
    children: [
      { path: 'courses/:courseId', lazy: coursePage('LearnerCourse') },
      { path: ':slug?', lazy: rolePage('LearnerPage') },
    ],
  },
];

/** @type {import('react-router').RouteObject[]} */
const publicRoutes = [{ path: 'offline', lazy: page(() => import('@/pages/OfflinePage.jsx')) }];

/** @type {import('react-router').RouteObject[]} */
const devRoutes = devRoutesEnabled
  ? [
      { path: 'dev', lazy: page(() => import('@/pages/dev/DevIndexPage.jsx')) },
      { path: 'dev/design', lazy: page(() => import('@/pages/dev/DesignPage.jsx')) },
      { path: 'dev/shell/:role/:slug?', lazy: page(() => import('@/pages/dev/ShellPreviewPage.jsx')) },
    ]
  : [];

/** @type {import('react-router').RouteObject[]} */
export const routes = [
  {
    path: '/',
    errorElement: <RouteErrorPage />,
    // Neutral shell while the first route chunk loads: page colour only, so nothing flashes.
    hydrateFallbackElement: <div className="min-h-dvh-screen bg-page" aria-busy="true" />,
    children: [
      ...authRoutes,
      ...roleRoutes,
      ...publicRoutes,
      ...devRoutes,
      { path: '*', lazy: page(() => import('@/pages/NotFoundPage.jsx')) },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
