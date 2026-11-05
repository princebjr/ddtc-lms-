// Where each role lands, and which "next" paths are safe to return to after sign-in.

/** @typedef {'ADMIN' | 'LECTURER' | 'LEARNER'} Role */
/** @typedef {import('@/lib/navigation.js').RoleKey} RoleKey */

/** @type {Record<Role, RoleKey>} */
export const ROLE_KEY = { ADMIN: 'admin', LECTURER: 'lecturer', LEARNER: 'learner' };

/** @param {Role} role @returns {string} */
export function dashboardPath(role) {
  return `/${ROLE_KEY[role]}/dashboard`;
}

/** Pages a signed-in user should be sent away from. */
export const SIGNED_OUT_ONLY = ['/login', '/signup', '/forgot-password'];

/**
 * A "next" path is followed only when it is a same-origin path inside the user's own area,
 * so a crafted link cannot send someone to another site or another role's pages.
 * @param {string | null | undefined} next
 * @param {Role} role
 * @returns {string}
 */
export function safeNext(next, role) {
  const home = dashboardPath(role);
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return home;
  const prefix = `/${ROLE_KEY[role]}/`;
  return next.startsWith(prefix) ? next : home;
}

/** @param {string} path @returns {Role | null} the role that owns a protected path */
export function roleForPath(path) {
  const segment = path.split('/')[1];
  if (segment === 'admin') return 'ADMIN';
  if (segment === 'lecturer') return 'LECTURER';
  if (segment === 'learner') return 'LEARNER';
  return null;
}

/** The app's own URL for links in emails and OAuth redirects. @param {string} path */
export function appUrl(path) {
  return new URL(path, window.location.origin).toString();
}
