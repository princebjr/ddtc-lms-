import { dashboardPath, safeNext } from './routing.js';

// Route-guard decisions as one pure function (unit-tested), so every page applies the same order:
// session check, account status, administrator MFA, complete profile, then the role's own area.
// Guards only decide what the screen shows; RLS is the real protection.

/** @typedef {import('./routing.js').Role} Role */

/**
 * @typedef {object} AccessInput
 * @property {'loading' | 'signed-out' | 'signed-in' | 'error'} status
 * @property {{ role: Role, account_status: string, profile_completed: boolean } | null} profile
 * @property {'aal1' | 'aal2' | null} aal
 * @property {string} path      the path being opened (with its search string)
 */

/**
 * @typedef {{ kind: 'loading' } | { kind: 'error' } | { kind: 'allow' } | { kind: 'redirect', to: string }
 *   | { kind: 'blocked', status: 'SUSPENDED' | 'DEACTIVATED' }} AccessDecision
 */

/** @param {string} base @param {string} path */
const withNext = (base, path) => `${base}?next=${encodeURIComponent(path)}`;

/**
 * Checks shared by every signed-in page, in order. Returns null when the user may continue.
 * @param {NonNullable<AccessInput['profile']>} profile
 * @param {AccessInput['aal']} aal
 * @param {string} path
 * @returns {AccessDecision | null}
 */
function accountGate(profile, aal, path) {
  if (profile.account_status === 'SUSPENDED' || profile.account_status === 'DEACTIVATED') {
    return { kind: 'blocked', status: profile.account_status };
  }
  if (profile.account_status !== 'ACTIVE') return { kind: 'blocked', status: 'DEACTIVATED' };
  if (profile.role === 'ADMIN' && aal !== 'aal2') return { kind: 'redirect', to: withNext('/mfa', path) };
  if (!profile.profile_completed) return { kind: 'redirect', to: withNext('/complete-profile', path) };
  return null;
}

/**
 * A protected page that belongs to one role (/admin/..., /lecturer/..., /learner/...).
 * @param {AccessInput & { role: Role }} input
 * @returns {AccessDecision}
 */
export function decideProtected({ status, profile, aal, path, role }) {
  if (status === 'loading') return { kind: 'loading' };
  if (status === 'signed-out') return { kind: 'redirect', to: withNext('/login', path) };
  if (status === 'error' || !profile) return { kind: 'error' };
  const gate = accountGate(profile, aal, path);
  if (gate) return gate;
  if (profile.role !== role) return { kind: 'redirect', to: dashboardPath(profile.role) };
  return { kind: 'allow' };
}

/**
 * Sign In, Sign Up and Forgot password: signed-in users are sent on.
 * @param {AccessInput & { next?: string | null }} input
 * @returns {AccessDecision}
 */
export function decideSignedOutOnly({ status, profile, aal, path, next }) {
  if (status === 'loading') return { kind: 'loading' };
  if (status !== 'signed-in' || !profile) return { kind: 'allow' };
  // A blocked account stays on the auth page; the page signs it out and explains.
  if (profile.account_status !== 'ACTIVE') return { kind: 'allow' };
  const gate = accountGate(profile, aal, next ?? path);
  if (gate) return gate;
  return { kind: 'redirect', to: safeNext(next, profile.role) };
}

/**
 * Pages in the middle of signing in (/mfa, /complete-profile): need a session, and are left as
 * soon as their step is done.
 * @param {AccessInput & { step: 'mfa' | 'complete-profile', next?: string | null }} input
 * @returns {AccessDecision}
 */
export function decideStep({ status, profile, aal, step, next }) {
  if (status === 'loading') return { kind: 'loading' };
  if (status === 'signed-out') return { kind: 'redirect', to: '/login' };
  if (status === 'error' || !profile) return { kind: 'error' };
  if (profile.account_status !== 'ACTIVE') return accountGate(profile, aal, '/') ?? { kind: 'error' };
  if (step === 'mfa') {
    if (profile.role !== 'ADMIN' || aal === 'aal2') return { kind: 'redirect', to: safeNext(next, profile.role) };
    return { kind: 'allow' };
  }
  if (profile.role === 'ADMIN' && aal !== 'aal2') return { kind: 'redirect', to: '/mfa' };
  if (profile.profile_completed) return { kind: 'redirect', to: safeNext(next, profile.role) };
  return { kind: 'allow' };
}
