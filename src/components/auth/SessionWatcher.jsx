import { useEffect, useRef } from 'react';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { absoluteState, readToken, testLimits } from '@/lib/auth/session-limits.js';
import { useAuth } from './AuthProvider.jsx';

// D32's absolute session lifetimes while a signed-in page is open (ADMIN 12 hours, LECTURER 7 days,
// LEARNER 30 days). The start of the session is shared between tabs through localStorage. Two
// minutes before the end the catalogue toast "Your session ends in 2 minutes" warns (an absolute
// limit cannot be extended), then the user is signed out with their drafts kept. Inactivity is
// handled by IdleSessionProvider (D43).

const CHECK_MS = 15_000;

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
    // Storage unavailable: the limit then applies to this tab only.
  }
}

export function SessionWatcher() {
  const auth = useAuth();
  const toast = useToast();
  const role = auth.profile?.role;
  const token = auth.session?.access_token;
  const sessionId = token ? readToken(token).sessionId : null;
  const warned = useRef(false);
  const { signOut } = auth;

  useEffect(() => {
    if (!role || !sessionId) return undefined;
    const test = testLimits();
    const startKey = `ddtc-session-start:${sessionId}`;
    const startedAt = readNumber(startKey, Date.now());
    writeNumber(startKey, startedAt);

    const check = () => {
      const s = absoluteState({ role, startedAt, now: Date.now(), ...(test ? { absoluteMs: test.absoluteMs, warningMs: test.warningMs } : {}) });
      if (s.state === 'expired') {
        toast.dismissId('session.expiring');
        signOut({ to: '/login?expired=1', keepDrafts: true });
      } else if (s.state === 'warning' && !warned.current) {
        warned.current = true;
        toast.show('session.expiring');
      }
    };

    const timer = setInterval(check, test?.checkMs ?? CHECK_MS);
    check();
    return () => clearInterval(timer);
  }, [role, sessionId, signOut, toast]);

  return null;
}
