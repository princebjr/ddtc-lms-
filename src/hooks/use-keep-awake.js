import { useEffect } from 'react';
import { holdAwake, markUnsaved } from '@/lib/auth/activity.js';

// D43: components tell the idle clock what is going on.

/**
 * While `active` (audio playing, a recording, an upload), the session counts as in use.
 * @param {boolean} active
 */
export function useKeepAwake(active) {
  useEffect(() => (active ? holdAwake() : undefined), [active]);
}

/**
 * While `dirty`, the idle warning says there are unsaved changes.
 * @param {boolean} dirty
 */
export function useUnsavedWork(dirty) {
  useEffect(() => (dirty ? markUnsaved() : undefined), [dirty]);
}
