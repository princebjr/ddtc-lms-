import { execSync } from 'node:child_process';

// Local Supabase settings for the end-to-end run, read from `supabase status` (local and CI only).
// The service-role key is used here, in Node test code, to create test accounts; it never reaches
// the browser bundle (only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are passed to the build).

/** @type {Record<string, string> | null} */
let cached = null;

/** @returns {Record<string, string>} */
export function localSupabase() {
  if (cached) return cached;
  /** @type {Record<string, string>} */
  const env = {};
  try {
    const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {
    // Supabase is not running: tests that need it fail with a clear message from requireSupabase().
  }
  cached = {
    url: process.env.SUPABASE_URL ?? env.API_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? env.ANON_KEY ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY ?? '',
    // Signs test tokens (the scheduled-job tests mint a second, genuine service-role token).
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? env.JWT_SECRET ?? '',
    mailpit: process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324',
  };
  return cached;
}

export function requireSupabase() {
  const s = localSupabase();
  if (!s.url || !s.anonKey || !s.serviceKey) {
    throw new Error('Local Supabase is not running. Start it with `npm run db:start` before `npm run test:e2e`.');
  }
  return s;
}
