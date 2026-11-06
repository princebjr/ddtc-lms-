import { useCallback, useEffect, useState } from 'react';

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
