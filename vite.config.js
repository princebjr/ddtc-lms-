import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { pwaOptions } from './pwa.config.js';

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
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
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
