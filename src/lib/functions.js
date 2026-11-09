import { parsePublicEnv } from './env.js';
import { getSupabase } from './supabase.js';

// Calls a DDTC LMS Edge Function with the signed-in user's own token. The function re-checks who
// the caller is and what they may do (CLAUDE.md section 3); the browser only sends the request.

/** How long a call may take before the app gives up and says so (large audio checks included). */
export const FUNCTION_TIMEOUT_MS = 90_000;

export class FunctionError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * @template T
 * @param {'set-user-role' | 'provision-lecturer' | 'provision-admin' | 'bulk-import-learners' | 'reset-admin-mfa' | 'register-upload' | 'finalize-upload'
 *   | 'create-course' | 'course-lifecycle' | 'course-lecturers' | 'manage-enrolments' | 'manage-lessons' | 'delete-media' | 'manage-assignments'
 *   | 'submit-assignment'} name
 * @param {Record<string, unknown>} body
 * @returns {Promise<T>}
 */
export async function callFunction(name, body) {
  const env = parsePublicEnv(import.meta.env);
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new FunctionError(401, 'unauthenticated', 'Sign in first');
  // A request that hangs (for example a server worker stopped mid-way) must not leave the screen
  // waiting forever: give up after FUNCTION_TIMEOUT_MS with a clear message.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FUNCTION_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    if (controller.signal.aborted) throw new FunctionError(0, 'timeout', 'This is taking too long. Check your connection and try again.');
    throw new FunctionError(0, 'network', 'You seem to be offline. Check your connection and try again.');
  }
  clearTimeout(timer);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Our functions answer { code, message } with a lowercase code and a message written for people.
    // Anything else came from the platform in front of them (for example WORKER_LIMIT or BOOT_ERROR
    // from the Supabase gateway) and is not shown word for word.
    const ours = typeof payload.code === 'string' && OUR_CODE.test(payload.code) && typeof payload.message === 'string';
    throw ours ? new FunctionError(res.status, payload.code, payload.message) : new FunctionError(res.status, 'server_error', 'Something went wrong. Try again.');
  }
  return /** @type {T} */ (payload);
}

/** The shape of the error codes our Edge Functions send (`HttpError` in `_shared/http.ts`). */
const OUR_CODE = /^[a-z][a-z_]*$/;
