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
 * @param {{ role: import('./routing.js').Role, startedAt: number, lastActiveAt: number, now: number }} s
 * @returns {{ state: 'active' | 'warning' | 'expired', reason: 'idle' | 'absolute' | null, endsAt: number }}
 */
export function sessionState({ role, startedAt, lastActiveAt, now }) {
  const limits = SESSION_LIMITS[role];
  const idleEnd = lastActiveAt + limits.idleMs;
  const absoluteEnd = startedAt + limits.absoluteMs;
  const endsAt = Math.min(idleEnd, absoluteEnd);
  const reason = absoluteEnd <= idleEnd ? 'absolute' : 'idle';
  if (now >= endsAt) return { state: 'expired', reason, endsAt };
  if (endsAt - now <= WARNING_MS) return { state: 'warning', reason, endsAt };
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
