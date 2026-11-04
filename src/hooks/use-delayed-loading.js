import { useEffect, useRef, useState } from 'react';

// Skeleton timing (UI_FEEDBACK.md, Skeleton screens):
// - show the skeleton only if loading takes longer than 150 ms
// - once shown, keep it for at least 300 ms to avoid flicker
// - if data has not arrived after 10 seconds, switch to the error state with Retry

export const SKELETON_DELAY_MS = 150;
export const SKELETON_MIN_VISIBLE_MS = 300;
export const LOADING_TIMEOUT_MS = 10_000;

/** @typedef {'blank' | 'skeleton' | 'content' | 'timeout'} LoadingPhase */

/**
 * @param {boolean} isLoading
 * @param {{ delay?: number, minVisible?: number, timeout?: number }} [options]
 * @returns {LoadingPhase} blank: loading under 150 ms (render nothing new); skeleton; content; timeout
 */
export function useDelayedLoading(isLoading, options = {}) {
  const { delay = SKELETON_DELAY_MS, minVisible = SKELETON_MIN_VISIBLE_MS, timeout = LOADING_TIMEOUT_MS } = options;
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const shownAt = useRef(/** @type {number | null} */ (null));

  useEffect(() => {
    if (!isLoading) return undefined;
    const delayTimer = setTimeout(() => {
      shownAt.current = Date.now();
      setShowSkeleton(true);
    }, delay);
    const timeoutTimer = setTimeout(() => setTimedOut(true), timeout);
    return () => {
      clearTimeout(delayTimer);
      clearTimeout(timeoutTimer);
      setTimedOut(false);
    };
  }, [isLoading, delay, timeout]);

  useEffect(() => {
    if (isLoading || !showSkeleton) return undefined;
    const elapsed = shownAt.current === null ? minVisible : Date.now() - shownAt.current;
    const remaining = Math.max(0, minVisible - elapsed);
    const hideTimer = setTimeout(() => {
      shownAt.current = null;
      setShowSkeleton(false);
    }, remaining);
    return () => clearTimeout(hideTimer);
  }, [isLoading, showSkeleton, minVisible]);

  if (isLoading && timedOut) return 'timeout';
  if (showSkeleton) return 'skeleton';
  if (isLoading) return 'blank';
  return 'content';
}
