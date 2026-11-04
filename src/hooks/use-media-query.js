import { useSyncExternalStore } from 'react';

/** Desktop starts at 1024 px (RESPONSIVE.md 15.1). */
export const DESKTOP_QUERY = '(min-width: 1024px)';
/** Tablet and up starts at 640 px. */
export const TABLET_UP_QUERY = '(min-width: 640px)';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Subscribes to a CSS media query.
 * @param {string} query
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
