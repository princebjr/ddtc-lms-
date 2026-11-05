import { useEffect } from 'react';
import { useToast } from './ToastProvider.jsx';

/**
 * Connection toasts (UI_FEEDBACK.md catalogue, Everyone): "You are offline" stays until the
 * connection returns, then "Back online". Phase 1 plan decision 2: the catalogue toast is the
 * offline indicator; there is no separate offline banner.
 */
export function NetworkStatus() {
  const toast = useToast();
  useEffect(() => {
    const offline = () => toast.show('network.offline');
    const online = () => {
      toast.dismissId('network.offline');
      toast.show('network.online');
    };
    if (navigator.onLine === false) offline();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [toast]);
  return null;
}
