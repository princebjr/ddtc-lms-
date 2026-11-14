import { useCallback, useEffect, useState } from 'react';
import { cached, peek, updateCached } from '@/lib/data-cache.js';

// Loads data for a page and tags each answer with the request it belongs to, so a newer request
// shows as loading and a late answer never overwrites a newer one. `reload` asks again.

/**
 * @template T
 * @param {() => Promise<T>} load
 * @param {readonly unknown[]} deps  values that change what is loaded
 * @returns {{ state: 'loading' | 'error' | 'ready', data: T | undefined, reload: () => void, setData: (update: (prev: T) => T) => void }}
 */
export function useLoad(load, deps) {
  const [tick, setTick] = useState(0);
  const key = JSON.stringify([...deps, tick]);
  const [answer, setAnswer] = useState(/** @type {{ key: string, data?: T, failed?: boolean } | null} */ (null));

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setAnswer({ key, data }))
      .catch(() => !cancelled && setAnswer({ key, failed: true }));
    return () => {
      cancelled = true;
    };
    // `load` is recreated each render; `key` captures everything that changes the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback(
    (/** @type {(prev: T) => T} */ update) => setAnswer((a) => (a && a.data !== undefined ? { ...a, data: update(a.data) } : a)),
    [],
  );
  const current = answer?.key === key ? answer : null;
  const state = !current ? 'loading' : current.failed ? 'error' : 'ready';
  return { state, data: current?.data, reload, setData };
}

/**
 * useLoad through the in-memory data layer (Phase 15, D45): a screen opened before shows its last answer at once
 * and refreshes it in the background; a read already on its way (a route's prefetch) is shared, not repeated.
 * `reload` always asks again (after a write); `setData` also updates the cached answer.
 * @template T
 * @param {string} cacheKey  what is loaded, for example `lesson:<course>:<lesson>` (the user is added)
 * @param {() => Promise<T>} load
 * @returns {{ state: 'loading' | 'error' | 'ready', data: T | undefined, reload: () => void, setData: (update: (prev: T) => T) => void }}
 */
export function useCachedLoad(cacheKey, load) {
  const [tick, setTick] = useState(0);
  const key = `${cacheKey}#${tick}`;
  const [answer, setAnswer] = useState(/** @type {{ key: string, data?: T, failed?: boolean } | null} */ (null));

  useEffect(() => {
    let cancelled = false;
    cached(cacheKey, load, { force: tick > 0 })
      .then((data) => !cancelled && setAnswer({ key, data }))
      .catch(() => {
        if (cancelled) return;
        // A failed refresh keeps showing the last answer, if there is one; otherwise the screen's error state.
        const stale = /** @type {T | undefined} */ (peek(cacheKey));
        setAnswer(stale !== undefined ? { key, data: stale } : { key, failed: true });
      });
    return () => {
      cancelled = true;
    };
    // `load` is recreated each render; `key` captures everything that changes the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback(
    (/** @type {(prev: T) => T} */ update) => {
      updateCached(cacheKey, update);
      setAnswer((a) => (a && a.data !== undefined ? { ...a, data: update(a.data) } : a));
    },
    [cacheKey],
  );
  // Until this key's answer arrives, show what is cached for it (stale-while-revalidate).
  const current = answer?.key === key ? answer : null;
  /** @type {{ key: string, data?: T, failed?: boolean } | null} */
  let shown = current;
  if (!shown && tick === 0) {
    const stale = /** @type {T | undefined} */ (peek(cacheKey));
    if (stale !== undefined) shown = { key, data: stale };
  }
  const state = !shown ? 'loading' : shown.failed ? 'error' : 'ready';
  return { state, data: shown?.data, reload, setData };
}
