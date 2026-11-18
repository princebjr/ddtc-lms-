// Phase 14 follow-up (owner, 2026-11-17: "the system accepts wrong emails when signing up"). Until confirmation
// emails can be switched back on (they need DDTC's domain), the before-user-created hook (check-signup-email)
// refuses an address whose domain cannot receive email: it does not exist, or it publishes a "null MX" saying it
// takes no mail. A real mail domain passes; Google and other providers are not checked; the function refuses
// any caller that is not Supabase Auth (unsigned request). The test domains used locally and in CI are allowed by
// TEST_EMAIL_DOMAINS (never set in production).
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { requireSupabase } from '../e2e/support/local-supabase.js';

const signUp = async (/** @type {string} */ email) => {
  const s = requireSupabase();
  const res = await fetch(`${s.url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: s.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Signup-Check-2026', data: { first_name: 'Ama', second_name: 'Test' } }),
  });
  const text = await res.text();
  return { status: res.status, text };
};

describe('check-signup-email (before a learner account is created)', () => {
  it('refuses an address at a domain that does not exist, with a message the person can act on', async () => {
    const r = await signUp(`ama.${randomUUID().slice(0, 8)}@no-such-domain-${randomUUID().slice(0, 8)}.com`);
    expect(r.status).toBe(400);
    expect(r.text).toContain('cannot receive email');
  });

  it('refuses a domain that says it takes no email (null MX)', async () => {
    const r = await signUp(`ama.${randomUUID().slice(0, 8)}@example.com`);
    expect(r.status).toBe(400);
    expect(r.text).toContain('cannot receive email');
  });

  it('accepts an address at a real mail domain', async () => {
    const r = await signUp(`ddtc.signup.check.${randomUUID().slice(0, 8)}@gmail.com`);
    expect(r.status).toBe(200);
  });

  it('accepts the local and CI test domains', async () => {
    const r = await signUp(`ama.${randomUUID().slice(0, 8)}@example.org`);
    expect(r.status).toBe(200);
  });

  it('refuses a caller that is not Supabase Auth', async () => {
    const s = requireSupabase();
    const res = await fetch(`${s.url}/functions/v1/check-signup-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: { email: 'someone@gmail.com', app_metadata: { provider: 'email' } } }),
    });
    expect(res.status).toBe(401);
    await res.body?.cancel();
  });
});
