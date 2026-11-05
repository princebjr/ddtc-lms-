import { z } from 'zod';

// Public build-time configuration. Only public values exist in the browser: the Supabase URL and
// the anon (publishable) key. Privileged keys never appear in the browser (CLAUDE.md section 3).

/**
 * Decodes a JWT payload without verifying it (used only to check the key's role claim).
 * @param {string} token
 * @returns {Record<string, unknown> | null}
 */
function jwtPayload(token) {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const value = JSON.parse(json);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Allow-list: only a publishable key or a JWT whose role claim is "anon" is accepted.
 * @param {string} key
 */
export function isPublicKey(key) {
  if (key.startsWith('sb_publishable_')) return true;
  return jwtPayload(key)?.role === 'anon';
}

export const publicEnvSchema = z.object({
  VITE_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'The Supabase anon key is missing.')
    .refine(isPublicKey, 'Only the public anon key may be used in the browser.'),
});

/** @typedef {z.infer<typeof publicEnvSchema>} PublicEnv */

/**
 * @param {Record<string, unknown>} source
 * @returns {PublicEnv}
 */
export function parsePublicEnv(source) {
  const result = publicEnvSchema.safeParse({
    VITE_SUPABASE_URL: source.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: source.VITE_SUPABASE_ANON_KEY,
  });
  if (!result.success) {
    throw new Error(`Supabase configuration is invalid: ${result.error.issues.map((i) => i.message).join(' ')}`);
  }
  return result.data;
}
