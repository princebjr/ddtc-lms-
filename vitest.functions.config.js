import { defineConfig } from 'vitest/config';

// Edge Function integration tests (TESTING.md: "Storage and functions"): real HTTP calls to the
// functions served by local Supabase (`npm run db:start`), as real signed-in users.
export default defineConfig({
  test: {
    include: ['tests/functions/**/*.test.js'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
