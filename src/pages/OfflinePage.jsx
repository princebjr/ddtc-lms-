import { OfflineState } from '@/components/feedback/States.jsx';

// Offline fallback page: shown when a page that is not in the app-shell cache is opened without a
// connection. The service worker never caches API responses or private files.
export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh-screen w-full max-w-reading flex-col justify-center px-4 py-12 pt-safe pb-safe">
      <h1 className="sr-only">Offline</h1>
      <OfflineState onRetry={() => window.location.reload()} />
    </main>
  );
}
