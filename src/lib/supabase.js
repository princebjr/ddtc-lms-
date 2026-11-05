import { AuthClient } from '@supabase/auth-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { parsePublicEnv } from './env.js';

// Supabase client with the anon (publishable) key only. Every privileged operation happens in an
// Edge Function; RLS enforces access for every query made with this client.
//
// Built from the two parts the app uses (Auth and the database API) instead of `createClient`,
// which also bundles Storage, Realtime and Functions: RESPONSIVE.md 15.5 caps the first route at
// 200 KB of JavaScript. The wiring matches supabase-js 2.119 (same storage key, PKCE, and every
// database request carries the user's own access token, or the anon key when signed out).
// Storage arrives with uploads (Phase 6) through a lazily loaded module, not here.
// Created on first use, so pages that never need Supabase work without configuration.

/** @typedef {import('./database.types').Database} Database */

/**
 * @typedef {object} AppSupabaseClient
 * @property {import('@supabase/auth-js').GoTrueClient} auth
 * @property {PostgrestClient<Database>['from']} from
 * @property {PostgrestClient<Database>['rpc']} rpc
 */

/** @type {AppSupabaseClient | null} */
let client = null;

/**
 * @param {string} url
 * @param {string} key
 * @returns {AppSupabaseClient}
 */
export function createAppClient(url, key) {
  const base = new URL(url.endsWith('/') ? url : `${url}/`);
  const auth = new AuthClient({
    url: new URL('auth/v1', base).href,
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  });

  /** @type {typeof fetch} */
  const fetchWithAuth = async (input, init) => {
    const { data } = await auth.getSession();
    const headers = new Headers(init?.headers);
    if (!headers.has('apikey')) headers.set('apikey', key);
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${data.session?.access_token ?? key}`);
    return fetch(input, { ...init, headers });
  };

  /** @type {PostgrestClient<Database>} */
  const rest = new PostgrestClient(new URL('rest/v1', base).href, { headers: {}, fetch: fetchWithAuth });

  return {
    auth,
    from: /** @type {PostgrestClient<Database>['from']} */ ((/** @type {any} */ relation) => rest.from(relation)),
    rpc: /** @type {PostgrestClient<Database>['rpc']} */ ((fn, args, options) => rest.rpc(fn, args, options)),
  };
}

/** @returns {AppSupabaseClient} */
export function getSupabase() {
  if (!client) {
    const env = parsePublicEnv(import.meta.env);
    client = createAppClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  }
  return client;
}
