// Phase 3: pure authentication logic (schemas, non-revealing messages, safe redirects, guard order,
// D32's absolute session limits; the D43 idle limit is tested in idle.test.jsx).
import { describe, expect, it } from 'vitest';
import { decideProtected, decideSignedOutOnly, decideStep } from '@/lib/auth/access.js';
import { authErrorMessage, callbackErrorMessage, MESSAGES } from '@/lib/auth/messages.js';
import { roleForPath, safeNext } from '@/lib/auth/routing.js';
import { completeProfileSchema, otpSchema, resetPasswordSchema, signUpSchema, validate } from '@/lib/auth/schemas.js';
import { ABSOLUTE_LIMITS, absoluteState, readToken, WARNING_MS } from '@/lib/auth/session-limits.js';

const learner = { role: /** @type {const} */ ('LEARNER'), account_status: 'ACTIVE', profile_completed: true };
const admin = { ...learner, role: /** @type {const} */ ('ADMIN') };

describe('sign-up form validation', () => {
  const good = { firstName: 'Prince', secondName: 'Boateng', email: 'prince@example.org', password: 'long-enough-1' };

  it('accepts a complete form and trims names', () => {
    const r = validate(signUpSchema, { ...good, firstName: '  Prince ' });
    expect(r.ok && r.data.firstName).toBe('Prince');
  });
  it('requires both names', () => {
    const r = validate(signUpSchema, { ...good, firstName: ' ', secondName: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.firstName).toBe('Enter your first name');
      expect(r.errors.secondName).toBe('Enter your second name');
    }
  });
  it('requires a password of at least 8 characters (D22)', () => {
    const r = validate(signUpSchema, { ...good, password: 'short-1' });
    expect(!r.ok && r.errors.password).toBe('Use at least 8 characters');
    expect(validate(signUpSchema, { ...good, password: 'exactly8' }).ok).toBe(true);
  });
  it('rejects a password longer than bcrypt reads (72 bytes)', () => {
    expect(validate(signUpSchema, { ...good, password: 'é'.repeat(40) }).ok).toBe(false);
  });
  it('has no role field: a role in the input is dropped', () => {
    const r = validate(signUpSchema, { ...good, role: 'ADMIN' });
    expect(r.ok && 'role' in r.data).toBe(false);
  });
  it('checks the email format', () => {
    expect(validate(signUpSchema, { ...good, email: 'not-an-email' }).ok).toBe(false);
  });
});

describe('other auth forms', () => {
  it('reset password needs matching passwords', () => {
    const r = validate(resetPasswordSchema, { password: 'long-enough-1', confirmPassword: 'long-enough-2' });
    expect(!r.ok && r.errors.confirmPassword).toBe('The passwords do not match');
  });
  it('complete profile needs both names', () => {
    expect(validate(completeProfileSchema, { firstName: 'Esi', secondName: '' }).ok).toBe(false);
  });
  it('the MFA code is 6 digits; spaces are ignored', () => {
    const r = validate(otpSchema, { code: '123 456' });
    expect(r.ok && r.data.code).toBe('123456');
    expect(validate(otpSchema, { code: '12345' }).ok).toBe(false);
  });
});

describe('messages never reveal whether an email is registered (D22)', () => {
  it('wrong password and unknown email give the same sign-in message', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' }, 'sign-in')).toBe(MESSAGES.invalidCredentials);
    expect(authErrorMessage({ code: 'user_not_found' }, 'sign-in')).toBe(MESSAGES.invalidCredentials);
  });
  it('a duplicate sign-up looks like a normal sign-up', () => {
    expect(authErrorMessage({ code: 'user_already_exists' }, 'sign-up')).toBe(MESSAGES.checkInbox);
    expect(authErrorMessage({ code: 'email_exists' }, 'sign-up')).toBe(MESSAGES.checkInbox);
  });
  it('recovery always gives the same answer', () => {
    expect(authErrorMessage({ code: 'user_not_found' }, 'recovery')).toBe(MESSAGES.checkInbox);
  });
  it('an unverified account is told to verify', () => {
    expect(authErrorMessage({ code: 'email_not_confirmed' }, 'sign-in')).toBe(MESSAGES.emailNotConfirmed);
  });
  it('no message contains a raw server error', () => {
    expect(authErrorMessage({ code: 'unexpected_failure', message: 'Database error saving new user' }, 'sign-up')).toBe(MESSAGES.signupFailed);
  });
  it('a cancelled Google prompt and a refused Google sign-in have clear messages', () => {
    expect(callbackErrorMessage(new URLSearchParams('error=access_denied'))).toBe(MESSAGES.googleCancelled);
    expect(callbackErrorMessage(new URLSearchParams('error=server_error&error_description=Database+error'))).toBe(MESSAGES.googleRefused);
    expect(callbackErrorMessage(new URLSearchParams(''))).toBeNull();
  });
});

describe('safe redirects after sign-in', () => {
  it('follows a next path inside the user\'s own area', () => {
    expect(safeNext('/learner/assignments', 'LEARNER')).toBe('/learner/assignments');
  });
  it('ignores other roles\' areas, other sites and protocol-relative links', () => {
    expect(safeNext('/admin/users', 'LEARNER')).toBe('/learner/dashboard');
    expect(safeNext('https://evil.example', 'LEARNER')).toBe('/learner/dashboard');
    expect(safeNext('//evil.example/learner/x', 'LEARNER')).toBe('/learner/dashboard');
    expect(safeNext('/learner\\..\\admin', 'LEARNER')).toBe('/learner/dashboard');
  });
  it('maps protected paths to roles', () => {
    expect(roleForPath('/admin/dashboard')).toBe('ADMIN');
    expect(roleForPath('/login')).toBeNull();
  });
});

describe('route guard order', () => {
  const base = { aal: /** @type {'aal1' | 'aal2' | null} */ ('aal1'), path: '/learner/dashboard', role: /** @type {const} */ ('LEARNER') };

  it('shows the loading state while the session is checked (no flash either way)', () => {
    expect(decideProtected({ ...base, status: 'loading', profile: null })).toEqual({ kind: 'loading' });
    expect(decideSignedOutOnly({ ...base, status: 'loading', profile: null })).toEqual({ kind: 'loading' });
  });
  it('sends a signed-out visitor to Sign In with the page to return to', () => {
    expect(decideProtected({ ...base, status: 'signed-out', profile: null })).toEqual({ kind: 'redirect', to: '/login?next=%2Flearner%2Fdashboard' });
  });
  it('after a deliberate sign-out, goes to the chosen page without a next link', () => {
    expect(decideProtected({ ...base, status: 'signed-out', profile: null, signedOutTo: '/login' })).toEqual({ kind: 'redirect', to: '/login' });
    expect(decideProtected({ ...base, status: 'signed-out', profile: null, signedOutTo: '/login?expired=1' })).toEqual({ kind: 'redirect', to: '/login?expired=1' });
  });
  it('blocks suspended and deactivated accounts', () => {
    expect(decideProtected({ ...base, status: 'signed-in', profile: { ...learner, account_status: 'SUSPENDED' } })).toEqual({ kind: 'blocked', status: 'SUSPENDED' });
    expect(decideProtected({ ...base, status: 'signed-in', profile: { ...learner, account_status: 'DEACTIVATED' } })).toEqual({ kind: 'blocked', status: 'DEACTIVATED' });
  });
  it('an administrator without MFA cannot reach any admin page', () => {
    expect(decideProtected({ ...base, role: 'ADMIN', path: '/admin/dashboard', status: 'signed-in', profile: admin })).toEqual({ kind: 'redirect', to: '/mfa?next=%2Fadmin%2Fdashboard' });
    expect(decideProtected({ ...base, role: 'ADMIN', path: '/admin/dashboard', status: 'signed-in', profile: admin, aal: 'aal2' })).toEqual({ kind: 'allow' });
  });
  it('an incomplete profile goes to Complete your profile first', () => {
    expect(decideProtected({ ...base, status: 'signed-in', profile: { ...learner, profile_completed: false } }).kind).toBe('redirect');
  });
  it('a user opening another role\'s area goes to their own dashboard', () => {
    expect(decideProtected({ ...base, role: 'ADMIN', path: '/admin/dashboard', status: 'signed-in', profile: learner })).toEqual({ kind: 'redirect', to: '/learner/dashboard' });
  });
  it('a signed-in user leaving an auth page goes to the dashboard or a safe next page', () => {
    expect(decideSignedOutOnly({ ...base, path: '/login', status: 'signed-in', profile: learner })).toEqual({ kind: 'redirect', to: '/learner/dashboard' });
    expect(decideSignedOutOnly({ ...base, path: '/login', next: '/learner/profile', status: 'signed-in', profile: learner })).toEqual({ kind: 'redirect', to: '/learner/profile' });
  });
  it('the MFA step is left once the session is AAL2, and is not for non-administrators', () => {
    expect(decideStep({ ...base, step: 'mfa', status: 'signed-in', profile: admin, aal: 'aal2' })).toEqual({ kind: 'redirect', to: '/admin/dashboard' });
    expect(decideStep({ ...base, step: 'mfa', status: 'signed-in', profile: learner })).toEqual({ kind: 'redirect', to: '/learner/dashboard' });
    expect(decideStep({ ...base, step: 'mfa', status: 'signed-in', profile: admin })).toEqual({ kind: 'allow' });
  });
});

describe('absolute session limits (D32; the idle values were replaced by D43)', () => {
  const start = 1_000_000;
  it('uses the D32 lifetimes', () => {
    expect(ABSOLUTE_LIMITS).toEqual({ ADMIN: 12 * 3_600_000, LECTURER: 7 * 24 * 3_600_000, LEARNER: 30 * 24 * 3_600_000 });
  });
  it('warns 2 minutes before the end of an administrator session, then ends it, however active', () => {
    const abs = ABSOLUTE_LIMITS.ADMIN;
    expect(absoluteState({ role: 'ADMIN', startedAt: start, now: start + abs - WARNING_MS - 1 }).state).toBe('active');
    expect(absoluteState({ role: 'ADMIN', startedAt: start, now: start + abs - WARNING_MS }).state).toBe('warning');
    expect(absoluteState({ role: 'ADMIN', startedAt: start, now: start + abs })).toEqual({ state: 'expired', endsAt: start + abs });
  });
  it('ends a lecturer session at 7 days and a learner session at 30 days', () => {
    expect(absoluteState({ role: 'LECTURER', startedAt: start, now: start + ABSOLUTE_LIMITS.LECTURER }).state).toBe('expired');
    expect(absoluteState({ role: 'LEARNER', startedAt: start, now: start + ABSOLUTE_LIMITS.LEARNER - 1 }).state).toBe('warning');
  });
  it('reads the session id from an access token', () => {
    const payload = btoa(JSON.stringify({ session_id: 'abc', aal: 'aal2' })).replace(/=+$/, '');
    expect(readToken(`x.${payload}.y`)).toEqual({ sessionId: 'abc', aal: 'aal2' });
    expect(readToken('garbage')).toEqual({ sessionId: null, aal: null });
  });
});
