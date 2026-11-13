import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { pwaOptions } from './pwa.config.js';
import { previewHeaders } from './scripts/security-headers.mjs';

/**
 * The local preview (and so every end-to-end test) serves vercel.json's security headers, with this
 * build's Supabase origin added to the CSP (Phase 13).
 * @returns {import('vite').Plugin}
 */
function securityHeadersInPreview() {
  return {
    name: 'ddtc-security-headers-preview',
    configurePreviewServer(server) {
      // The address the build was given: the environment (CI and end-to-end runs), else the production env files,
      // else the development ones (a developer's `npm run preview` with only .env.development.local).
      const url =
        process.env.VITE_SUPABASE_URL ?? loadEnv('production', process.cwd(), 'VITE_').VITE_SUPABASE_URL ?? loadEnv('development', process.cwd(), 'VITE_').VITE_SUPABASE_URL;
      const headers = previewHeaders(url);
      server.middlewares.use((_req, res, next) => {
        for (const [name, value] of headers) res.setHeader(name, value);
        next();
      });
    },
  };
}

/**
 * Preview-only routes (/dev/design and /dev/shell/...) are on for the dev server, CI and Vercel
 * preview builds, and off for production builds (Phase 1 plan, decision 1). An explicit
 * VITE_DEV_ROUTES value always wins.
 * @param {string} command
 * @returns {'true' | 'false'}
 */
function devRoutesFlag(command) {
  const explicit = process.env.VITE_DEV_ROUTES;
  if (explicit === 'true' || explicit === 'false') return explicit;
  if (command === 'serve') return 'true';
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return 'true';
  return 'false';
}

export default defineConfig(({ command }) => ({
  publicDir: 'public',
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions), securityHeadersInPreview()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    'import.meta.env.VITE_DEV_ROUTES': JSON.stringify(devRoutesFlag(command)),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    include: ['tests/unit/**/*.test.{js,jsx}', 'src/**/*.test.{js,jsx}'],
    // Pure-logic tests run in Node; component tests opt in with `// @vitest-environment jsdom`.
    environment: 'node',
    setupFiles: ['tests/setup/vitest.setup.js'],
    restoreMocks: true,
    css: false,
  },
}));
