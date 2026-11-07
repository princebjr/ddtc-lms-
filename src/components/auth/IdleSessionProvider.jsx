import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { useIdleTimeout } from '@/hooks/use-idle-timeout.js';
import { useLoad } from '@/hooks/use-load.js';
import { hasUnsavedWork } from '@/lib/auth/activity.js';
import { idleLimits } from '@/lib/auth/idle.js';
import { ACTIVITY_INTERVAL_MS, readToken } from '@/lib/auth/session-limits.js';
import { purgeExpiredDrafts } from '@/lib/drafts.js';
import { getSupabase } from '@/lib/supabase.js';
import { useAuth } from './AuthProvider.jsx';
import { IdleWarningDialog } from './IdleWarningDialog.jsx';

// Idle sign-out for every role (D43, ADR-011), mounted once in the signed-in layout. The limits come
// from idle_settings() (10 minutes, warned 2 minutes before, by default). Moving to another page
// counts as activity. At the limit the user is signed out (drafts kept) and Sign In says why; the
// next sign-in returns to the same page (its path only). For administrators every counted activity
// is also recorded on the server (record_activity), which is what is_admin() checks, so the limit
// holds even if this code is bypassed.

async function fetchIdleSettings() {
  const { data, error } = await getSupabase().rpc('idle_settings');
  if (error) throw error;
  return /** @type {{ timeout_minutes?: unknown, warning_seconds?: unknown } | null} */ (data);
}

export function IdleSessionProvider() {
  const auth = useAuth();
  const toast = useToast();
  const location = useLocation();
  const role = auth.profile?.role;
  const token = auth.session?.access_token;
  const sessionId = token ? readToken(token).sessionId : null;
  const settings = useLoad(fetchIdleSettings, [sessionId]);
  // The clock waits for the limits; if they cannot be read, the defaults apply.
  const limits = idleLimits(settings.state === 'ready' ? settings.data : null);
  const session = sessionId && settings.state !== 'loading' ? sessionId : null;
  const lastSent = useRef(0);
  const path = useRef(location.pathname);
  const { signOut } = auth;

  useEffect(() => {
    purgeExpiredDrafts();
  }, []);

  const onActivity = useCallback(
    /** @param {boolean} forced */
    (forced) => {
      if (role !== 'ADMIN') return;
      const now = Date.now();
      if (!forced && now - lastSent.current < ACTIVITY_INTERVAL_MS) return;
      lastSent.current = now;
      getSupabase()
        .rpc('record_activity')
        .then(
          () => undefined,
          () => undefined,
        );
    },
    [role],
  );

  const onExpire = useCallback(() => {
    // Back to this page after the next sign-in: its path only, never its data.
    signOut({ to: `/login?idle=${limits.timeoutMinutes}&next=${encodeURIComponent(path.current)}`, keepDrafts: true });
  }, [signOut, limits.timeoutMinutes]);

  const idle = useIdleTimeout({ session, timeoutMs: limits.timeoutMs, warningMs: limits.warningMs, onExpire, onActivity });

  // Moving to another page counts as activity (opening the first page is handled by the clock, which
  // must still notice a reload after the limit has passed).
  const markActivity = useRef(idle.markActivity);
  useEffect(() => {
    markActivity.current = idle.markActivity;
  });
  useEffect(() => {
    if (path.current === location.pathname) return;
    path.current = location.pathname;
    markActivity.current();
  }, [location.pathname]);

  const warning = idle.state === 'warning';
  return (
    <IdleWarningDialog
      open={warning}
      endsAt={idle.endsAt}
      timeoutMs={limits.timeoutMs}
      warningMs={limits.warningMs}
      unsaved={warning && hasUnsavedWork()}
      onContinue={idle.continueSession}
      onSignOut={async () => {
        await signOut({ to: '/login' });
        toast.show('account.signed-out');
      }}
    />
  );
}
