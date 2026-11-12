// Per-user limits on heavy actions (Phase 13, rate-limit review; migration 48). Each call counts one use;
// above the limit the database refuses with P0429 and fromDbError turns that into a 429 "Too many
// requests". The limits are generous for real use and stop a script or a stuck button from hammering.
import type { serviceClient } from './auth.ts';
import { fromDbError } from './http.ts';

/** Action name -> [most uses, per seconds]. */
export const LIMITS = {
  'export-gradebook': [30, 600],
  'bulk-import-learners': [10, 3600],
  'register-upload': [120, 600],
  'provision-account': [30, 3600],
  'delete-media': [60, 600],
} as const satisfies Record<string, readonly [number, number]>;

/** Counts one use of an action by the caller; throws a 429 above its limit. */
export async function takeRateLimit(admin: ReturnType<typeof serviceClient>, actor: string, action: keyof typeof LIMITS) {
  const [max, windowSeconds] = LIMITS[action];
  const { error } = await admin.rpc('rate_limit_take', { p_actor: actor, p_action: action, p_max: max, p_window_seconds: windowSeconds });
  if (error) throw fromDbError(error);
}
