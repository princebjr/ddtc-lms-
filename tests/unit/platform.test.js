// Phase 1 platform rules: the anon key only in the browser, service worker caches the app shell
// only, in-app browser detection, and the manifest and icons for an installable shell.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../../pwa.config.js';
import { isPublicKey, parsePublicEnv } from '@/lib/env.js';
import { detectInAppBrowser } from '@/lib/in-app-browser.js';

/** @param {Record<string, unknown>} payload */
const fakeJwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.c2lnbmF0dXJl`;

describe('public Supabase configuration', () => {
  it('accepts the anon key and a publishable key', () => {
    expect(isPublicKey(fakeJwt({ role: 'anon' }))).toBe(true);
    expect(isPublicKey('sb_publishable_abcdefghijklmnopqrstuvwxyz')).toBe(true);
    expect(parsePublicEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: fakeJwt({ role: 'anon' }) }).VITE_SUPABASE_URL).toBe(
      'https://abc.supabase.co',
    );
  });

  it('refuses any other key (allow-list)', () => {
    expect(isPublicKey(fakeJwt({ role: 'authenticated' }))).toBe(false);
    expect(isPublicKey(fakeJwt({ role: 'supabase_admin' }))).toBe(false);
    // Built at runtime so the repository secret scan (which bans the literal shape) stays strict.
    expect(isPublicKey(['sb', 'secret', 'abcdefghijklmnopqrstuvwxyz'].join('_'))).toBe(false);
    expect(isPublicKey('not-a-key-at-all-but-long-enough')).toBe(false);
    expect(() => parsePublicEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: fakeJwt({ role: 'authenticated' }) })).toThrow(
      /Only the public anon key/,
    );
  });

  it('refuses a missing URL or key with a clear message', () => {
    expect(() => parsePublicEnv({})).toThrow(/Supabase configuration is invalid/);
  });
});

describe('service worker caches the app shell only', () => {
  const workbox = /** @type {NonNullable<typeof pwaOptions.workbox>} */ (pwaOptions.workbox);

  it('has no runtime caching (no API responses or private files)', () => {
    expect(workbox.runtimeCaching).toEqual([]);
  });

  it('precaches only built shell files', () => {
    expect(workbox.globPatterns).toEqual(['**/*.{js,css,html,woff2,png,svg,webmanifest}']);
    for (const pattern of workbox.globPatterns ?? []) expect(pattern).not.toMatch(/json|mp3|m4a|wav|pdf|docx/);
  });

  it('never serves the app shell for API, auth, storage or function paths', () => {
    const deny = workbox.navigateFallbackDenylist ?? [];
    for (const path of ['/api/x', '/auth/v1/callback', '/storage/v1/object', '/functions/v1/x', '/rest/v1/x']) {
      expect(deny.some((re) => re.test(path))).toBe(true);
    }
  });

  it('waits for the user to choose Refresh before updating', () => {
    expect(pwaOptions.registerType).toBe('prompt');
    expect(workbox.skipWaiting).toBe(false);
  });
});

describe('installable shell', () => {
  it('the manifest has standard and maskable icons and the DDTC name', () => {
    const manifest = /** @type {any} */ (pwaOptions.manifest);
    expect(manifest.name).toBe('DDTC LMS');
    expect(manifest.display).toBe('standalone');
    const purposes = manifest.icons.map((/** @type {any} */ i) => i.purpose);
    expect(purposes).toContain('maskable');
    for (const icon of manifest.icons) expect(existsSync(`public${icon.src}`)).toBe(true);
  });

  it('index.html has viewport-fit=cover, apple-touch-icon, favicon and the manifest', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('rel="manifest"');
    expect(existsSync('public/apple-touch-icon-180.png')).toBe(true);
    expect(existsSync('public/favicon-32.png')).toBe(true);
  });
});

describe('in-app browser detection (D36, RESPONSIVE.md 15.6)', () => {
  it.each([
    ['Facebook', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]'],
    ['Facebook', 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0;]'],
    ['Instagram', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Instagram 320.0.0'],
    ['WhatsApp', 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36 WhatsApp/2.24'],
    ['TikTok', 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview'],
  ])('detects %s', (app, ua) => expect(detectInAppBrowser(ua)).toBe(app));

  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0',
    '',
  ])('does not flag a normal browser: %s', (ua) => expect(detectInAppBrowser(ua)).toBeNull());
});

describe('Vercel serves the single-page app on every path', () => {
  it('rewrites paths that are not files to index.html, so links like /signup and /auth/confirm open', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });
});
