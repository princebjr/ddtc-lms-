import { parsePublicEnv } from './env.js';
import { clearOnSignOut } from './private-caches.js';
import { getSupabase } from './supabase.js';

// Supabase Storage, loaded only when a page needs a file (keeps the first route under the
// RESPONSIVE.md 15.5 budget). Signed URLs are created with the signed-in user's own session (D19);
// Storage policies decide: only VALIDATED files are ever readable.

/** @type {Promise<import('@supabase/storage-js').StorageClient> | null} */
let clientPromise = null;

/** @returns {Promise<import('@supabase/storage-js').StorageClient>} */
export function getStorage() {
  clientPromise ??= import('@supabase/storage-js').then(({ StorageClient }) => {
    const supabase = getSupabase();
    const { VITE_SUPABASE_ANON_KEY: key } = parsePublicEnv(import.meta.env);
    return new StorageClient(`${supabase.url}/storage/v1`, { apikey: key }, supabase.fetch);
  });
  return clientPromise;
}

/** D19 lifetimes. */
export const PLAYBACK_SECONDS = 3600;

/** @type {Map<string, { url: string, expires: number }>} */
const cache = new Map();
/** Signing requests still on their way, so a second ask for the same file waits for the first (Phase 15). */
/** @type {Map<string, Promise<string | null>>} */
const pending = new Map();
// Signed URLs are held only for the signed-in session (D43).
clearOnSignOut(() => {
  cache.clear();
  pending.clear();
});

/**
 * A signed URL for an object, reused until shortly before it expires.
 * @param {string} bucket @param {string} path
 * @returns {Promise<string | null>} null when the file may not be read (for example not VALIDATED)
 */
export function signedUrl(bucket, path) {
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now() + 60_000) return Promise.resolve(hit.url);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const request = (async () => {
    const storage = await getStorage();
    const { data, error } = await storage.from(bucket).createSignedUrl(path, PLAYBACK_SECONDS);
    if (error || !data?.signedUrl) return null;
    cache.set(key, { url: data.signedUrl, expires: Date.now() + PLAYBACK_SECONDS * 1000 });
    return data.signedUrl;
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

/**
 * Starts signing a file's playback URL now, without waiting, so the player finds it ready (Phase 15: a screen
 * signs its audio as soon as its data arrives, not after it has drawn). Failures are left to the player.
 * @param {{ bucket_name: string, storage_path: string } | null | undefined} file
 */
export function warmSignedUrl(file) {
  if (file) signedUrl(file.bucket_name, file.storage_path).catch(() => {});
}

/** Loads the Storage client now (in parallel with a screen's data), without waiting. */
export function warmStorage() {
  getStorage().catch(() => {});
}

/** Forget a cached URL (after a photo is replaced or removed). @param {string} bucket @param {string} path */
export function forgetUrl(bucket, path) {
  cache.delete(`${bucket}/${path}`);
}
