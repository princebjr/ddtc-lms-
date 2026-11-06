import { useEffect, useRef } from 'react';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { ACTIVITY_INTERVAL_MS, readToken, sessionState, testLimits } from '@/lib/auth/session-limits.js';
import { getSupabase } from '@/lib/supabase.js';
import { useAuth } from './AuthProvider.jsx';

// D32 session limits while a signed-in page is open. Activity (pointer, key, scroll, focus) is
// shared between tabs through localStorage, so an idle tab never ends a session used in another.
// Two minutes before the end the catalogue toast "Your session ends in 2 minutes" offers Stay
// signed in. For administrators activity is also recorded on the server (record_activity), which
// is what is_admin() checks; the server limit holds even if this code is bypassed.

const CHECK_MS = 15_000;
const EVENTS = /** @type {const} */ (['pointerdown', 'keydown', 'scroll', 'focus']);

/** @param {string} key @param {number} fallback */
function readNumber(key, fallback) {
  try {
    const v = Number(window.localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

/** @param {string} key @param {number} value */
function writeNumber(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage unavailable: limits then apply to this tab only.
  }
}

export function SessionWatcher() {
  const auth = useAuth();
  const toast = useToast();
  const role = auth.profile?.role;
  const token = auth.session?.access_token;
  const sessionId = token ? readToken(token).sessionId : null;
  const warned = useRef(false);
  const lastSent = useRef(0);
  const { signOut } = auth;

  useEffect(() => {
    if (!role || !sessionId) return undefined;
    const test = testLimits();
    const startKey = `ddtc-session-start:${sessionId}`;
    const activeKey = `ddtc-session-active:${sessionId}`;
    const now = Date.now();
    const startedAt = readNumber(startKey, now);
    writeNumber(startKey, startedAt);
    writeNumber(activeKey, Math.max(readNumber(activeKey, now), now));

    const sendActivity = (force = false) => {
      if (role !== 'ADMIN') return;
      const t = Date.now();
      if (!force && t - lastSent.current < ACTIVITY_INTERVAL_MS) return;
      lastSent.current = t;
      getSupabase().rpc('record_activity').then(
        () => undefined,
        () => undefined,
      );
    };

    const markActive = () => {
      writeNumber(activeKey, Date.now());
      if (warned.current) {
        warned.current = false;
        toast.dismissId('session.expiring');
      }
      sendActivity();
    };

    const check = () => {
      const s = sessionState({
        role,
        startedAt,
        lastActiveAt: readNumber(activeKey, startedAt),
        now: Date.now(),
        ...(test ? { limits: test, warningMs: test.warningMs } : {}),
      });
      if (s.state === 'expired') {
        toast.dismissId('session.expiring');
        signOut({ to: '/login?expired=1' });
      } else if (s.state === 'warning' && !warned.current) {
        warned.current = true;
        // Only an idle session can be extended; the absolute limit cannot.
        toast.show('session.expiring', { onAction: s.reason === 'idle' ? markActive : undefined });
      }
    };

    sendActivity(true);
    for (const e of EVENTS) window.addEventListener(e, markActive, { passive: true });
    const timer = setInterval(check, test?.checkMs ?? CHECK_MS);
    check();
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, markActive);
      clearInterval(timer);
    };
  }, [role, sessionId, signOut, toast]);

  return null;
}
