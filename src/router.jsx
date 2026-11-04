import { createBrowserRouter } from 'react-router';
import { devRoutesEnabled } from '@/lib/flags.js';
import RouteErrorPage from '@/pages/RouteErrorPage.jsx';

// Routes, code-split per page (RESPONSIVE.md 15.5). Production has only the public pages until
// Phase 3 adds Sign In and the guarded role routes. Preview routes are compiled in only when
// VITE_DEV_ROUTES is true (Phase 1 plan, decision 1); otherwise the bundler drops them.

/**
 * @param {() => Promise<{ default: import('react').ComponentType }>} load
 * @returns {() => Promise<{ Component: import('react').ComponentType }>}
 */
const page = (load) => async () => ({ Component: (await load()).default });

/** @type {import('react-router').RouteObject[]} */
const publicRoutes = [
  { index: true, lazy: page(() => import('@/pages/HomePage.jsx')) },
  { path: 'offline', lazy: page(() => import('@/pages/OfflinePage.jsx')) },
];

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
    children: [...publicRoutes, ...devRoutes, { path: '*', lazy: page(() => import('@/pages/NotFoundPage.jsx')) }],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
