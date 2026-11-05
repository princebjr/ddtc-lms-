import { createClient } from '@supabase/supabase-js';
import { createAccount, totp } from '../e2e/support/accounts.js';
import { requireSupabase } from '../e2e/support/local-supabase.js';

// Signed-in sessions for Edge Function tests: learners and lecturers sign in with a password;
// administrators also enrol TOTP and verify a code, so their session is AAL2, and record activity
// (is_admin requires activity within the D32 idle limit), exactly as the app does.

/** @param {string} email @param {string} password */
export async function signIn(email, password) {
  const s = requireSupabase();
  const client = createClient(s.url, s.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { client, token: data.session.access_token, userId: data.user.id };
}

/** @param {Parameters<typeof createAccount>[0]} [options] */
export async function signedInAs(options) {
  const account = await createAccount(options);
  return { ...(await signIn(account.email, account.password)), email: account.email };
}

/** A fresh administrator with an AAL2 session and recorded activity. */
export async function signedInAdmin() {
  const session = await signedInAs({ role: 'ADMIN', first: 'Test', second: 'Admin' });
  const { client } = session;
  const { data: enrolled, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'tests' });
  if (error) throw error;
  const verify = await client.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: totp(enrolled.totp.secret) });
  if (verify.error) throw verify.error;
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token ?? '';
  const activity = await client.rpc('record_activity');
  if (activity.error) throw activity.error;
  return { ...session, token };
}

/**
 * Calls an Edge Function as the holder of `token`.
 * @param {string} name @param {string | null} token @param {unknown} body
 */
export async function call(name, token, body) {
  const s = requireSupabase();
  const res = await fetch(`${s.url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: s.anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Service-role REST helper for checks (Node only). @param {string} path */
export async function serviceGet(path) {
  const s = requireSupabase();
  const res = await fetch(`${s.url}/rest/v1/${path}`, { headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}` } });
  return res.json();
}
