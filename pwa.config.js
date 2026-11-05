// PWA and service-worker options (BUILD_PLAN Phase 1, RESPONSIVE.md 15.5).
// The service worker precaches the app shell only (built HTML, JS, CSS, fonts and brand images).
// It has NO runtime caching: API responses, Supabase requests and private files are never cached.
// tests/unit/pwa-config.test.js enforces this.

/** @type {Partial<import('vite-plugin-pwa').VitePWAOptions>} */
export const pwaOptions = {
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['favicon-32.png', 'favicon-48.png', 'apple-touch-icon-180.png'],
  manifest: {
    name: 'DDTC LMS',
    short_name: 'DDTC LMS',
    description: 'Learning management system for Dynamic Discipleship Training Centre.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0F172A',
    theme_color: '#0F172A',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
    globIgnores: ['**/brand-preview.png'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/storage\//, /^\/functions\//, /^\/rest\//],
    runtimeCaching: [],
    cleanupOutdatedCaches: true,
    clientsClaim: false,
    skipWaiting: false,
  },
  devOptions: { enabled: false },
};
