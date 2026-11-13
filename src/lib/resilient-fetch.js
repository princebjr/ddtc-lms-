// Time limits and safe retries for database requests (Phase 15, D45 stability).
//   - Every request gives up after TIMEOUT_MS: a dropped connection never leaves a screen waiting for ever. A
//     signal the caller passes still cancels it at once.
//   - Only reads are retried: GET and HEAD, and the read-only database functions named in READ_FUNCTIONS. A write
//     is never repeated by this layer (a repeated write could duplicate an answer or a grade).
//   - Retries happen only after a network failure or a temporary server answer (502, 503, 504), at most RETRIES
//     times, waiting about 0.5 s, then 1 s, each with up to 50% random spread so many phones do not retry together.

export const TIMEOUT_MS = 45_000;
export const RETRIES = 2;
const BASE_DELAY_MS = 500;
const TEMPORARY = new Set([502, 503, 504]);

/** Database functions that only read, so asking again is safe. */
export const READ_FUNCTIONS = new Set([
  'get_lesson_page',
  'get_course_page',
  'get_assignment_page',
  'list_my_assignments',
  'client_settings',
  'idle_settings',
  'learner_dashboard',
  'lecturer_dashboard',
  'admin_dashboard',
  'my_grades',
  'my_grade',
  'my_submission',
  'my_exams',
  'my_exam',
  'my_exam_deadlines',
  'lesson_media',
  'assignment_media',
  'course_teachers',
  'calculate_course_grades',
  'presence_my_courses',
  'grading_queue',
  'system_health',
]);

/**
 * Whether a request only reads. @param {string} url @param {string} method
 */
export function isSafeRead(url, method) {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  if (m !== 'POST') return false;
  const match = /\/rest\/v1\/rpc\/([a-z0-9_]+)(?:\?|$)/.exec(url);
  return Boolean(match && READ_FUNCTIONS.has(match[1]));
}

/** @param {number} attempt 0-based @param {() => number} random */
export function retryDelay(attempt, random = Math.random) {
  const base = BASE_DELAY_MS * 2 ** attempt;
  return Math.round(base + base * 0.5 * random());
}

/**
 * Wraps fetch with the time limit and the safe retries.
 * @param {typeof fetch} baseFetch
 * @param {{ timeoutMs?: number, retries?: number, wait?: (ms: number) => Promise<void>, random?: () => number }} [options]
 * @returns {typeof fetch}
 */
export function resilientFetch(baseFetch, { timeoutMs = TIMEOUT_MS, retries = RETRIES, wait = (ms) => new Promise((r) => setTimeout(r, ms)), random = Math.random } = {}) {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    const attempts = isSafeRead(url, method) ? retries + 1 : 1;
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const outer = init?.signal;
      const onAbort = () => controller.abort(outer?.reason);
      if (outer) {
        if (outer.aborted) controller.abort(outer.reason);
        else outer.addEventListener('abort', onAbort, { once: true });
      }
      const timer = setTimeout(() => controller.abort(new DOMException('The request took too long', 'TimeoutError')), timeoutMs);
      try {
        const response = await baseFetch(input, { ...init, signal: controller.signal });
        if (attempt + 1 < attempts && TEMPORARY.has(response.status)) {
          await wait(retryDelay(attempt, random));
          continue;
        }
        return response;
      } catch (error) {
        // The caller cancelled: stop. A time-out or a network failure on a read: try again while attempts remain.
        if (outer?.aborted || attempt + 1 >= attempts) throw error;
        await wait(retryDelay(attempt, random));
      } finally {
        clearTimeout(timer);
        outer?.removeEventListener('abort', onAbort);
      }
    }
  };
}
