import { useCallback, useEffect, useRef, useState } from 'react';
import { isHeldAwake } from '@/lib/auth/activity.js';
import { ACTIVITY_KEY, CHECK_EVERY_MS, idleState, readLastActivity, WRITE_EVERY_MS, writeLastActivity } from '@/lib/auth/idle.js';

// The idle clock (D43, ADR-011). Activity in this tab (pointer, keys, wheel and scrolling, touch,
// focus, form input; route changes through markActivity) and in the browser's other tabs (the
// shared ddtc:lastActivity) moves it on, and so does anything holding the session awake (audio
// playing, an upload, a recording). Background requests, realtime events, notifications and token
// refreshes never touch it. It is checked once a second while the page is visible, and at once when
// the page is shown again (visibilitychange, pageshow, focus), so a phone that slept past the limit
// signs out straight away; a reload after the limit has passed signs out too. While the warning is
// open only Continue Session (or activity in another tab) keeps the session.

const EVENTS = /** @type {const} */ (['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'input', 'focusin', 'scroll']);

/** @typedef {'active' | 'warning' | 'expired'} IdleStateName */

/**
 * @param {{ session: string | null, timeoutMs: number, warningMs: number, onExpire: () => void, onActivity?: (forced: boolean) => void }} options
 *   session: the auth session the clock belongs to (null turns the clock off)
 *   onActivity: called on each counted activity (forced for Continue Session); administrators use it
 *   to record activity on the server
 * @returns {{ state: IdleStateName, endsAt: number, markActivity: () => void, continueSession: () => void }}
 */
export function useIdleTimeout({ session, timeoutMs, warningMs, onExpire, onActivity }) {
  // What the screen shows, for the session it belongs to (another session starts active).
  const [view, setView] = useState(/** @type {{ session: string | null, state: IdleStateName, endsAt: number }} */ ({ session: null, state: 'active', endsAt: 0 }));
  const last = useRef(0);
  const written = useRef(0);
  const stateRef = useRef(/** @type {IdleStateName} */ ('active'));
  const callbacks = useRef({ onExpire, onActivity });
  useEffect(() => {
    callbacks.current = { onExpire, onActivity };
  });

  const record = useCallback(
    /** @param {number} now @param {boolean} forced */
    (now, forced) => {
      if (!session) return;
      last.current = Math.max(last.current, now);
      if (forced || now - written.current >= WRITE_EVERY_MS) {
        written.current = now;
        writeLastActivity(session, now);
      }
      callbacks.current.onActivity?.(forced);
    },
    [session],
  );

  const evaluate = useCallback(() => {
    if (!session || stateRef.current === 'expired') return;
    const now = Date.now();
    if (isHeldAwake()) record(now, false);
    const shared = readLastActivity(session);
    if (shared !== null && shared > last.current) last.current = shared;
    const next = idleState({ lastActivity: last.current, now, timeoutMs, warningMs });
    if (next.state !== stateRef.current) {
      stateRef.current = next.state;
      setView({ session, ...next });
    }
    if (next.state === 'expired') callbacks.current.onExpire();
  }, [session, timeoutMs, warningMs, record]);

  useEffect(() => {
    if (!session) return undefined;
    stateRef.current = 'active';
    const shared = readLastActivity(session);
    last.current = shared ?? 0;
    written.current = 0;
    if (shared !== null && Date.now() - shared >= timeoutMs) {
      // Opened again after the limit had passed in this session (a reload, a discarded tab).
      const timer = window.setTimeout(evaluate, 0);
      return () => window.clearTimeout(timer);
    }
    // Opening the page counts as activity.
    record(Date.now(), true);

    const onEvent = () => {
      if (stateRef.current === 'active') record(Date.now(), false);
    };
    const onStorage = (/** @type {StorageEvent} */ e) => {
      if (e.key === ACTIVITY_KEY) evaluate();
    };
    /** @type {number | null} */
    let timer = null;
    const start = () => {
      if (timer === null) timer = window.setInterval(evaluate, CHECK_EVERY_MS);
    };
    const stop = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        evaluate();
        start();
      } else stop();
    };

    for (const e of EVENTS) window.addEventListener(e, onEvent, { passive: true, capture: true });
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', evaluate);
    window.addEventListener('focus', evaluate);
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') start();
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, onEvent, { capture: true });
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', evaluate);
      window.removeEventListener('focus', evaluate);
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [session, timeoutMs, record, evaluate]);

  const markActivity = useCallback(() => {
    if (stateRef.current === 'active') record(Date.now(), false);
  }, [record]);

  const continueSession = useCallback(() => {
    if (stateRef.current === 'expired') return;
    record(Date.now(), true);
    stateRef.current = 'active';
    setView({ session, state: 'active', endsAt: 0 });
  }, [record, session]);

  const shown = view.session === session ? view : { state: /** @type {IdleStateName} */ ('active'), endsAt: 0 };
  return { state: shown.state, endsAt: shown.endsAt, markActivity, continueSession };
}
