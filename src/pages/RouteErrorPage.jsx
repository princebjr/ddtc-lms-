import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ErrorState } from '@/components/feedback/States.jsx';
import OfflinePage from './OfflinePage.jsx';
import NotFoundPage from './NotFoundPage.jsx';

/**
 * Error boundary for every route. A failed route chunk while offline shows the offline page;
 * a 404 shows Not found; anything else shows a plain error state with Retry. The raw error is
 * reported to the console for now (Sentry arrives later) and never shown to the user.
 */
export default function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return <OfflinePage />;
  console.error(error);
  return (
    <main id="main" className="mx-auto flex min-h-dvh-screen w-full max-w-reading flex-col justify-center px-4 py-12 pt-safe pb-safe">
      <h1 className="sr-only">Something went wrong</h1>
      <ErrorState description="This page could not be shown. Try again, and if it keeps happening, tell your administrator." onRetry={() => window.location.reload()} />
    </main>
  );
}
