#!/usr/bin/env node
// One-time bootstrap of the first administrator (D32, Phase 4; docs/RUNBOOK.md "Bootstrap").
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<secret> \
//   node scripts/bootstrap-admin.mjs --email owner@example.org --first Prince --second Boateng [--app https://app.example.org]
//
// Run by the owner on their own machine. The service-role key is read from the environment only
// (never pass it as an argument, never commit it). The database function refuses to run once any
// administrator exists, and switches itself off after it succeeds, so running this twice is safe.
// An existing account is promoted; a new address gets an invitation email to set a password.
// The new administrator then signs in and enrols TOTP (the app requires it before any admin page).

import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), /** @type {string[][]} */ ([])),
);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

class Refused extends Error {}

/**
 * Stops with a message. Throws instead of process.exit so open connections close cleanly (Windows).
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  throw new Refused(message);
}

async function main() {
if (!url || !key) fail('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
const email = String(args.email ?? '').trim().toLowerCase();
const first = String(args.first ?? '').trim();
const second = String(args.second ?? '').trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !first || !second) fail('usage: --email <address> --first <first name> --second <second name> [--app <app url>]');

const admin = createClient(/** @type {string} */ (url), /** @type {string} */ (key), { auth: { persistSession: false, autoRefreshToken: false } });

// Refuse early, before inviting anyone, when an administrator already exists.
const { count, error: countError } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'ADMIN');
if (countError) fail(`could not read profiles: ${countError.message}`);
if ((count ?? 0) > 0) fail('an administrator already exists, so bootstrap is disabled. Use the app (Users) or the recovery procedure in docs/RUNBOOK.md.');

const { data: existing } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
let userId = existing?.id;
if (!userId) {
  const redirectTo = args.app ? `${String(args.app).replace(/\/$/, '')}/auth/confirm?type=invite` : undefined;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { first_name: first, second_name: second }, redirectTo });
  if (error || !data.user) fail(`could not invite ${email}: ${error?.message}`);
  userId = data.user.id;
  console.log(`Invitation sent to ${email}.`);
}

const { error } = await admin.rpc('bootstrap_first_admin', { p_user: userId });
if (error) fail(`refused: ${error.message}`);
const { data: readiness } = await admin.rpc('launch_readiness');
console.log(`${email} is now the first administrator. Bootstrap is now disabled.`);
console.log(`Active administrators: ${readiness?.active_admins}. Production needs at least 2 (add the second from Users in the app).`);
console.log('Next: sign in, set up two-step verification, then add the second administrator.');
}

main().catch((error) => {
  console.error(`bootstrap-admin: ${error instanceof Refused ? error.message : 'unexpected error'}`);
  process.exitCode = 1;
});
