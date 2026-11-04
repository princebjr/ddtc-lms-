import { useEffect } from 'react';
import { useToast } from './ToastProvider.jsx';

/**
 * Registers the service worker in production builds and shows "New version available" with
 * Refresh when an update is waiting (UI_FEEDBACK.md catalogue). The update applies only when the
 * user chooses Refresh, so typed input is never lost to an automatic reload.
 */
export function UpdatePrompt() {
  const toast = useToast();
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return undefined;
    let cancelled = false;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;
        const updateSW = registerSW({
          immediate: true,
          onNeedRefresh() {
            toast.show('app.update-ready', { onAction: () => void updateSW(true) });
          },
        });
      })
      .catch((error) => console.warn('Service worker registration failed', error));
    return () => {
      cancelled = true;
    };
  }, [toast]);
  return null;
}
