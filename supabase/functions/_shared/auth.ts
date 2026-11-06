// Caller checks for Edge Functions (CLAUDE.md section 3: never trust the client for user ID, role
// or permission). The caller is identified from their own JWT by Supabase Auth, and administrator
// rights are checked by the database with that same token (public.am_i_admin -> private.is_admin:
// ADMIN, ACTIVE, AAL2, within the D32 session limits). The service-role client exists only here,
// on the server.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { HttpError } from './http.ts';

const URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** Privileged client: bypasses RLS. Use only after the caller has been checked. */
export function serviceClient(): SupabaseClient {
  return createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A client acting as the caller (their token), for checks that must run under RLS. */
function callerClient(token: string): SupabaseClient {
  return createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearer(req: Request): string {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'unauthenticated', 'Sign in first');
  return token;
}

export type Caller = { id: string; email: string | null; client: SupabaseClient };

/** Any signed-in, ACTIVE user. */
export async function requireUser(req: Request): Promise<Caller> {
  const token = bearer(req);
  const client = callerClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'unauthenticated', 'Sign in first');
  const { data: profile } = await client.from('profiles').select('account_status').eq('id', data.user.id).maybeSingle();
  if (profile?.account_status !== 'ACTIVE') throw new HttpError(403, 'forbidden', 'This account cannot do this');
  return { id: data.user.id, email: data.user.email ?? null, client };
}

/** An ACTIVE administrator with an AAL2 session inside the D32 limits. */
export async function requireAdmin(req: Request): Promise<Caller> {
  const caller = await requireUser(req);
  const { data, error } = await caller.client.rpc('am_i_admin');
  if (error || data !== true) throw new HttpError(403, 'forbidden', 'Administrator with two-step verification required');
  return caller;
}

/**
 * Course work (Phase 5): an administrator verified as above, or any other ACTIVE signed-in user.
 * `isAdmin` is true only when am_i_admin() succeeded with the caller's own token; the database
 * functions then re-check the actor's role and course rights (never trusted from the client).
 */
export async function requireStaff(req: Request): Promise<Caller & { isAdmin: boolean }> {
  const caller = await requireUser(req);
  const { data } = await caller.client.rpc('am_i_admin');
  return { ...caller, isAdmin: data === true };
}
