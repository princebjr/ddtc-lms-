import { createClient } from '@supabase/supabase-js';
import { parsePublicEnv } from './env.js';

// Supabase client with the anon (publishable) key only. Every privileged operation happens in an
// Edge Function; RLS enforces access for every query made with this client.
// Created on first use, so pages that do not need Supabase (Phase 1) work without configuration.

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;

/** @returns {import('@supabase/supabase-js').SupabaseClient} */
export function getSupabase() {
  if (!client) {
    const env = parsePublicEnv(import.meta.env);
    client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
  }
  return client;
}
