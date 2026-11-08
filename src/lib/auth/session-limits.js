// Session lifetimes. D32's absolute limits per role stand (ADMIN 12 hours, LECTURER 7 days, LEARNER
// 30 days); inactivity is D43's 10-minute idle sign-out (src/lib/auth/idle.js). ADMIN limits are
// enforced on the server too (is_admin() checks the session age and the last recorded activity);
// LECTURER and LEARNER lifetimes are enforced here, because Supabase can only set one limit for
// every user and only on a paid plan (owner-approved, 2026-11-05). Values mirror
// system_settings.session_limits, which learners cannot read.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** @type {Record<import('./routing.js').Role, number>} */
export const ABSOLUTE_LIMITS = {
  ADMIN: 12 * HOUR,
  LECTURER: 7 * 24 * HOUR,
  LEARNER: 30 * 24 * HOUR,
};

/** UI_FEEDBACK.md: "Your session ends in 2 minutes" before an absolute limit. */
export const WARNING_MS = 2 * MINUTE;

/** The server records administrator activity at most this often (D43: at once for Continue Session). */
export const ACTIVITY_INTERVAL_MS = MINUTE;

/**
 * Where a session stands against its absolute lifetime.
 * @param {{ role: import('./routing.js').Role, startedAt: number, now: number, absoluteMs?: number, warningMs?: number }} s
 *   absoluteMs and warningMs default to D32; the end-to-end build may shorten them (testLimits)
 * @returns {{ state: 'active' | 'warning' | 'expired', endsAt: number }}
 */
export function absoluteState({ role, startedAt, now, absoluteMs = ABSOLUTE_LIMITS[role], warningMs = WARNING_MS }) {
  const endsAt = startedAt + absoluteMs;
  if (now >= endsAt) return { state: 'expired', endsAt };
  if (endsAt - now <= warningMs) return { state: 'warning', endsAt };
  return { state: 'active', endsAt };
}

/**
 * Reads the session id and issue time from a Supabase access token without verifying it
 * (the server verifies; the client only needs to know which session it is in).
 * @param {string} accessToken
 * @returns {{ sessionId: string | null, aal: string | null }}
 */
export function readToken(accessToken) {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { sessionId: typeof payload.session_id === 'string' ? payload.session_id : null, aal: payload.aal ?? null };
  } catch {
    return { sessionId: null, aal: null };
  }
}

/**
 * Shortened absolute limits for the end-to-end tests (Phase 4: "using shortened test values"). Read
 * only in builds with preview routes (dev server, CI, previews); production builds compile this to
 * null, so nobody can lengthen or shorten a real session from the browser. (The idle sign-out is
 * tested with Playwright's clock instead.)
 * @returns {{ absoluteMs: number, warningMs: number, checkMs: number } | null}
 */
export function testLimits() {
  if (import.meta.env.VITE_DEV_ROUTES !== 'true') return null;
  try {
    const raw = JSON.parse(window.localStorage.getItem('ddtc-test-session-limits') ?? 'null');
    if (!raw || typeof raw !== 'object') return null;
    const n = (/** @type {unknown} */ v) => (typeof v === 'number' && v > 0 ? v : null);
    const absoluteMs = n(raw.absoluteMs);
    const warningMs = n(raw.warningMs);
    const checkMs = n(raw.checkMs);
    return absoluteMs && warningMs && checkMs ? { absoluteMs, warningMs, checkMs } : null;
  } catch {
    return null;
  }
}
