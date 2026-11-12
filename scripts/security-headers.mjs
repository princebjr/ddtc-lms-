// Security headers (Phase 13; BUILD_PLAN Phase 13 "security headers and CSP"). vercel.json is the source
// of truth for what Vercel serves. The local preview (and so every end-to-end test) serves the same headers,
// with the local Supabase origin added to the CSP so the suite exercises the real policy. The inline theme
// script in index.html is allowed only by its SHA-256 hash; inlineScriptHashes() lets a test keep the
// hash in vercel.json in step with the script.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Every `<script>` without a src attribute, as CSP hash sources. @param {string} html @returns {string[]} */
export function inlineScriptHashes(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
}

/** The headers vercel.json sets on every page, as [name, value] pairs. */
/** @param {string | URL} [file] */
export function vercelPageHeaders(file = new URL('../vercel.json', import.meta.url)) {
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const page = config.headers.find((/** @type {{ source: string }} */ h) => h.source === '/(.*)');
  return /** @type {Array<{ key: string, value: string }>} */ (page.headers).map((h) => /** @type {[string, string]} */ ([h.key, h.value]));
}

/**
 * The same headers for the local preview: the Supabase origin of this build is added to the CSP sources
 * that name Supabase (http and ws locally), and upgrade-insecure-requests and HSTS are left out because
 * the preview is plain http on 127.0.0.1.
 * @param {string | undefined} supabaseUrl
 * @returns {Array<[string, string]>}
 */
export function previewHeaders(supabaseUrl) {
  const origin = supabaseUrl ? new URL(supabaseUrl).origin : null;
  const ws = origin ? origin.replace(/^http/, 'ws') : null;
  return vercelPageHeaders()
    .filter(([name]) => name !== 'Strict-Transport-Security')
    .map(([name, value]) => {
      if (name !== 'Content-Security-Policy' || !origin) return [name, value];
      const csp = value
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d && d !== 'upgrade-insecure-requests')
        .map((d) => {
          if (!d.includes('https://*.supabase.co')) return d;
          return d.startsWith('connect-src') ? `${d} ${origin} ${ws}` : `${d} ${origin}`;
        })
        .join('; ');
      return [name, csp];
    });
}
