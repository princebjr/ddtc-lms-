// D32 session limits. ADMIN limits are enforced on the server too (is_admin() checks the session
// age and the last recorded activity); LECTURER and LEARNER limits are enforced here, because
// Supabase can only set one limit for every user and only on a paid plan (owner-approved,
// 2026-11-05). Values mirror system_settings.session_limits, which learners cannot read.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** @type {Record<import('./routing.js').Role, { idleMs: number, absoluteMs: number }>} */
export const SESSION_LIMITS = {
  ADMIN: { idleMs: 30 * MINUTE, absoluteMs: 12 * HOUR },
  LECTURER: { idleMs: 8 * HOUR, absoluteMs: 7 * 24 * HOUR },
  LEARNER: { idleMs: 7 * 24 * HOUR, absoluteMs: 30 * 24 * HOUR },
};

/** UI_FEEDBACK.md: "Your session ends in 2 minutes", with Stay signed in. */
export const WARNING_MS = 2 * MINUTE;

/** The server records administrator activity at most this often. */
export const ACTIVITY_INTERVAL_MS = MINUTE;

/**
 * @param {{ role: import('./routing.js').Role, startedAt: number, lastActiveAt: number, now: number,
 *   limits?: { idleMs: number, absoluteMs: number }, warningMs?: number }} s
 *   limits and warningMs default to D32; the end-to-end build may shorten them (testLimits)
 * @returns {{ state: 'active' | 'warning' | 'expired', reason: 'idle' | 'absolute' | null, endsAt: number }}
 */
export function sessionState({ role, startedAt, lastActiveAt, now, limits = SESSION_LIMITS[role], warningMs = WARNING_MS }) {
  const idleEnd = lastActiveAt + limits.idleMs;
  const absoluteEnd = startedAt + limits.absoluteMs;
  const endsAt = Math.min(idleEnd, absoluteEnd);
  const reason = absoluteEnd <= idleEnd ? 'absolute' : 'idle';
  if (now >= endsAt) return { state: 'expired', reason, endsAt };
  if (endsAt - now <= warningMs) return { state: 'warning', reason, endsAt };
  return { state: 'active', reason: null, endsAt };
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
 * Shortened limits for the end-to-end tests (Phase 4: "using shortened test values"). Read only in
 * builds with preview routes (dev server, CI, previews); production builds compile this to null,
 * so nobody can lengthen or shorten a real session from the browser.
 * @returns {{ idleMs: number, absoluteMs: number, warningMs: number, checkMs: number } | null}
 */
export function testLimits() {
  if (import.meta.env.VITE_DEV_ROUTES !== 'true') return null;
  try {
    const raw = JSON.parse(window.localStorage.getItem('ddtc-test-session-limits') ?? 'null');
    if (!raw || typeof raw !== 'object') return null;
    const n = (/** @type {unknown} */ v) => (typeof v === 'number' && v > 0 ? v : null);
    const idleMs = n(raw.idleMs);
    const absoluteMs = n(raw.absoluteMs);
    const warningMs = n(raw.warningMs);
    const checkMs = n(raw.checkMs);
    return idleMs && absoluteMs && warningMs && checkMs ? { idleMs, absoluteMs, warningMs, checkMs } : null;
  } catch {
    return null;
  }
}
