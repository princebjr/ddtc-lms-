import { clearOnSignOut } from './private-caches.js';

// The in-memory data layer (Phase 15, D45): stale-while-revalidate for the screens' reads.
//   - Memory only, never storage; per person (each key starts with the signed-in user's id); emptied on every
//     sign-out, including the idle sign-out (private-caches, D43), and when another person signs in.
//   - One request per key at a time (de-duplication): a prefetch and the screen that opens share it.
//   - A screen shows what is cached at once and asks again in the background unless the answer is younger than
//     FRESH_MS (so "prefetch, then open" costs one call). Writes refresh their screens with `force`.
//   - At most MAX_ENTRIES answers, the oldest dropped first, so a low-memory phone never fills up.

const FRESH_MS = 10_000;
const MAX_ENTRIES = 50;

/** @typedef {{ data?: unknown, at: number, promise?: Promise<unknown> }} Entry */
/** @type {Map<string, Entry>} */
const entries = new Map();
let owner = '';

clearOnSignOut(() => {
  entries.clear();
  owner = '';
});

/**
 * The signed-in user's id, read from the session Supabase keeps in this browser (available before the profile
 * loads, so a route can start its screen's data at once). '' when nobody is signed in.
 */
export function sessionUserId() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const name = localStorage.key(i) ?? '';
      if (!/^sb-.+-auth-token$/.test(name)) continue;
      const id = JSON.parse(localStorage.getItem(name) ?? 'null')?.user?.id;
      if (typeof id === 'string') return id;
    }
  } catch {
    // Storage unavailable: no prefetching, screens load as before.
  }
  return '';
}

/** @param {string} key */
function scoped(key) {
  const user = sessionUserId();
  if (user !== owner) {
    // Another person (or nobody): nothing of the last one may be served.
    entries.clear();
    owner = user;
  }
  return user ? `${user}|${key}` : '';
}

/** @param {string} id @param {Entry} entry */
function remember(id, entry) {
  entries.delete(id);
  entries.set(id, entry);
  while (entries.size > MAX_ENTRIES) entries.delete(/** @type {string} */ (entries.keys().next().value));
}

/**
 * The cached answer for a key, if any (any age). @template T @param {string} key @returns {T | undefined}
 */
export function peek(key) {
  const id = scoped(key);
  return /** @type {T | undefined} */ (id ? entries.get(id)?.data : undefined);
}

/**
 * Reads through the cache: a fresh answer at once, else the request already on its way, else a new request.
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetcher
 * @param {{ force?: boolean }} [options] force: always ask again (after a write)
 * @returns {Promise<T>}
 */
export function cached(key, fetcher, { force = false } = {}) {
  const id = scoped(key);
  if (!id) return fetcher();
  const entry = entries.get(id);
  if (!force && entry?.promise) return /** @type {Promise<T>} */ (entry.promise);
  if (!force && entry && 'data' in entry && Date.now() - entry.at < FRESH_MS) return Promise.resolve(/** @type {T} */ (entry.data));
  const promise = fetcher().then(
    (data) => {
      if (entries.get(id)?.promise === promise) remember(id, { data, at: Date.now() });
      return data;
    },
    (error) => {
      const current = entries.get(id);
      if (current?.promise === promise) {
        if ('data' in current) remember(id, { data: current.data, at: current.at });
        else entries.delete(id);
      }
      throw error;
    },
  );
  remember(id, { ...(entry && 'data' in entry ? { data: entry.data } : {}), at: entry?.at ?? 0, promise });
  return promise;
}

/** Starts a read without waiting (a route opening, a link about to be opened). @param {string} key @param {() => Promise<unknown>} fetcher */
export function prefetch(key, fetcher) {
  cached(key, fetcher).catch(() => {});
}

/**
 * Changes a cached answer in place (an optimistic update, or a screen's own edit). @template T
 * @param {string} key @param {(prev: T) => T} update
 */
export function updateCached(key, update) {
  const id = scoped(key);
  const entry = id ? entries.get(id) : undefined;
  if (entry && 'data' in entry) remember(id, { ...entry, data: update(/** @type {T} */ (entry.data)) });
}

/**
 * After any write: every cached answer is kept for an instant display but counts as old, so the next screen to
 * open asks again (a sent answer or a completed lesson is never hidden by a recent cached list).
 */
export function markAllStale() {
  for (const [id, entry] of entries) if (!entry.promise) entries.set(id, { ...entry, at: 0 });
}

/** Forgets every answer whose key starts with the prefix (for example after a submission). @param {string} prefix */
export function invalidate(prefix) {
  const id = scoped(prefix);
  if (!id) return;
  for (const key of [...entries.keys()]) if (key.startsWith(id)) entries.delete(key);
}

/**
 * Props for a link that starts loading its screen when the person shows they are about to open it (a touch, the
 * pointer over it, or keyboard focus), so the data is usually there when the screen opens (Phase 15).
 * @param {{ key: string, fetch: () => Promise<unknown> }} query
 */
export function prefetchOnIntent(query) {
  const start = () => prefetch(query.key, query.fetch);
  return { onPointerEnter: start, onTouchStart: start, onFocus: start };
}
