import { defineConfig } from 'vitest/config';

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    include: ['tests/unit/**/*.test.js', 'src/**/*.test.js'],
    environment: 'node',
    restoreMocks: true,
  },
});
