import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase.js';

export { lengthText, limitFor, limitText, recordingLimits, sizeText, tooLarge } from './limits.js';

// The administrator's settings that the screens need (owner request of 2026-11-11, ADR-020 item 7):
// each kind's upload limit, the pass mark and whether courses need approval, from client_settings().
// Read once per page view and again when the window regains focus, at most once a minute, so a change
// on Settings reaches every screen without a new sign-in. The server always checks again (D18): a
// screen's own check only spares the learner a wasted upload.

/** @typedef {import('./limits.js').ClientSettings} ClientSettings */

const FRESH_MS = 60_000;

/** @type {{ data: ClientSettings, at: number } | null} */
let cache = null;
/** @type {Promise<ClientSettings | null> | null} */
let pending = null;
/** @type {Set<(s: ClientSettings) => void>} */
const listeners = new Set();

/**
 * The settings, from the cache while fresh. Resolves to null if they cannot be read.
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<ClientSettings | null>}
 */
export function loadClientSettings({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.data);
  if (pending) return pending;
  // Inside the chain, so a client that cannot be reached is an unread setting, never an error on screen.
  pending = Promise.resolve()
    .then(() => getSupabase().rpc('client_settings'))
    .then(({ data, error }) => {
      if (error || !data) return cache?.data ?? null;
      const settings = /** @type {ClientSettings} */ (/** @type {unknown} */ (data));
      cache = { data: settings, at: Date.now() };
      for (const listen of listeners) listen(settings);
      return settings;
    })
    .catch(() => cache?.data ?? null)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Forgets the cached settings (sign-out, tests). */
export function clearClientSettings() {
  cache = null;
}

/**
 * The current settings, or null until they are first read. Refreshes on mount and when the window
 * regains focus (both at most once a minute).
 * @returns {ClientSettings | null}
 */
export function useClientSettings() {
  const [settings, setSettings] = useState(/** @type {ClientSettings | null} */ (cache?.data ?? null));
  useEffect(() => {
    let live = true;
    /** @param {ClientSettings} s */
    const listen = (s) => live && setSettings(s);
    listeners.add(listen);
    void loadClientSettings().then((s) => live && s && setSettings(s));
    const onFocus = () => void loadClientSettings();
    window.addEventListener('focus', onFocus);
    return () => {
      live = false;
      listeners.delete(listen);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
  return settings;
}
