import { expect as baseExpect, test } from '@playwright/test';
import { createAccount, emailLink, findUserByEmail, getProfile, SEED, SEED_PASSWORD, totp, uniqueEmail } from './support/accounts.js';
import { requireSupabase } from './support/local-supabase.js';
import { NAVIGATION, ROLE_KEYS } from '../../src/lib/navigation.js';

// Phase 3 "Tests required" (Playwright): register, verify, sign in, sign out, wrong password,
// reset password, suspended user refused, each role lands on the correct dashboard, signed-out
// visit to every protected route redirects to Sign In. Also: the role in a sign-up request is
// ignored, unverified accounts cannot sign in, messages do not reveal registered addresses,
// administrators cannot reach the dashboard without MFA, and nothing protected flashes.
// Runs against local Supabase (npm run db:start) on every device project, light and dark.

// Auth flows make several requests (bcrypt sign-in, profile, MFA level). With many browsers in
// parallel a local sign-in took 4 s (45 ms alone), so these waits allow 15 s; what is asserted is
// unchanged: the user must still end up on the right page with the right message.
const expect = baseExpect.configure({ timeout: 15_000 });

test.beforeAll(() => {
  requireSupabase();
});

/** @param {import('@playwright/test').Page} page @param {string} email @param {string} password */
async function signIn(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

/** @param {import('@playwright/test').Page} page */
async function signOut(page) {
  await page.getByRole('button', { name: /account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}

test('register, verify by email, land on the learner dashboard, sign out', async ({ page }) => {
  const email = uniqueEmail('register');
  await page.goto('/signup');
  await page.getByLabel('First name').fill('Abena');
  await page.getByLabel('Second name').fill('Darko');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('A-good-password-26');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // An unverified account cannot sign in.
  await signIn(page, email, 'A-good-password-26');
  await expect(page.getByRole('alert')).toHaveText('Verify your email address before signing in. Check your inbox for the link.');

  await page.goto(await emailLink(email, { subject: /Verify your email/ }));
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

  const user = await findUserByEmail(email);
  expect(user?.role).toBe('LEARNER');

  await signOut(page);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'You have signed out' })).toBeVisible();
});

test('a role sent in the sign-up request is ignored: the account is a LEARNER', async ({ page, request, baseURL }) => {
  const s = requireSupabase();
  const email = uniqueEmail('role-inject');
  const res = await request.post(`${s.url}/auth/v1/signup?redirect_to=${encodeURIComponent(`${baseURL}/auth/confirm`)}`, {
    headers: { apikey: s.anonKey },
    data: { email, password: 'A-good-password-26', data: { first_name: 'Sneaky', second_name: 'Admin', role: 'ADMIN' } },
  });
  expect(res.ok()).toBe(true);
  await page.goto(await emailLink(email, { subject: /Verify your email/ }));
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  expect((await findUserByEmail(email))?.role).toBe('LEARNER');
});

test('a duplicate address gets the same answer as a new one', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('First name').fill('Ama');
  await page.getByLabel('Second name').fill('Asante');
  await page.getByLabel('Email address').fill(SEED.learner);
  await page.getByLabel('Password', { exact: true }).fill('A-good-password-26');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
});

test('wrong password and unknown email show the same message', async ({ page }) => {
  await signIn(page, SEED.learner, 'not-the-password');
  const wrongPassword = await page.getByRole('alert').textContent();
  await signIn(page, uniqueEmail('nobody'), 'not-the-password');
  await expect(page.getByRole('alert')).toHaveText(/** @type {string} */ (wrongPassword));
  expect(wrongPassword).toBe('The email or password is not correct.');
});

test('reset password by email, then sign in with the new password', async ({ page }) => {
  const account = await createAccount();
  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill(account.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toHaveText('If the address can be used, an email is on its way. Check your inbox.');

  await page.goto(await emailLink(account.email, { subject: /Reset your/ }));
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel('New password', { exact: true }).fill('A-brand-new-password-1');
  await page.getByLabel('Confirm new password').fill('A-brand-new-password-1');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Password changed' })).toBeVisible();

  await signOut(page);
  await signIn(page, account.email, 'A-brand-new-password-1');
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
});

test('recovery for an unknown address looks the same as for a real one', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill(uniqueEmail('unknown'));
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toHaveText('If the address can be used, an email is on its way. Check your inbox.');
});

test('a suspended user is refused with a clear message', async ({ page }) => {
  await signIn(page, SEED.suspended, SEED_PASSWORD);
  await expect(page.getByRole('alert')).toHaveText('Your account is suspended. Contact the DDTC office if you think this is a mistake.');
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/learner/dashboard');
  await expect(page).toHaveURL(/\/login\?next=/);
});

test('a deactivated user is refused with a clear message', async ({ page }) => {
  const account = await createAccount({ status: 'DEACTIVATED' });
  await signIn(page, account.email, account.password);
  await expect(page.getByRole('alert')).toHaveText('This account has been deactivated. Contact the DDTC office for help.');
});

test('learner and lecturer land on their own dashboards, and cannot open another role\'s area', async ({ page }) => {
  await signIn(page, SEED.learner, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await signOut(page);

  await signIn(page, SEED.lecturer, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  await page.goto('/learner/dashboard');
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
});

test('an administrator enrols MFA, reaches the dashboard only after it, and is challenged next time', async ({ page }) => {
  const account = await createAccount({ role: 'ADMIN', first: 'Grace', second: 'Admin' });
  await signIn(page, account.email, account.password);
  await expect(page).toHaveURL(/\/mfa/);
  await expect(page.getByRole('heading', { name: 'Set up two-step verification' })).toBeVisible();

  // Without MFA, every admin page sends the administrator back to the MFA step.
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/mfa\?next=/);
  await expect(page.locator('[data-app-shell]')).toHaveCount(0);

  const secret = (await page.getByTestId('totp-secret').textContent())?.trim() ?? '';
  await page.getByLabel('Verification code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toHaveText(/That code is not correct/);

  await page.getByLabel('Verification code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  await signOut(page);
  await signIn(page, account.email, account.password);
  await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
  await page.getByLabel('Verification code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
});

test('a signed-out visit to every protected route goes to Sign In', async ({ page }) => {
  const paths = ROLE_KEYS.flatMap((role) => NAVIGATION[role].destinations.map((d) => `/${role}/${d.slug}`));
  for (const path of [...paths, '/mfa', '/complete-profile']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login/);
  }
});

test('no flash: a signed-out visitor never sees protected content, a signed-in user never sees Sign In', async ({ page }) => {
  // Record, from the very first frame, whether a role shell or the Sign In heading ever appears.
  await page.addInitScript(() => {
    const w = /** @type {any} */ (window);
    w.__seen = { shell: false, signIn: false };
    new MutationObserver(() => {
      if (document.querySelector('[data-app-shell]')) w.__seen.shell = true;
      if ([...document.querySelectorAll('h1')].some((h) => h.textContent === 'Welcome back')) w.__seen.signIn = true;
    }).observe(document, { childList: true, subtree: true });
  });

  await page.goto('/learner/dashboard');
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => /** @type {any} */ (window).__seen.shell)).toBe(false);

  await page.getByLabel('Email address').fill(SEED.learner);
  await page.getByLabel('Password', { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);

  await page.goto('/login');
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  expect(await page.evaluate(() => /** @type {any} */ (window).__seen.signIn)).toBe(false);
});

test('the brand block sits directly below the Sign In and Sign Up forms, logo above text', async ({ page }) => {
  for (const path of ['/login', '/signup']) {
    await page.goto(path);
    const brand = page.locator('[data-slot="brand-block"]');
    await expect(brand).toBeVisible();
    await expect(brand.locator('p')).toHaveText('from gölarae');
    const card = await page.locator('section[aria-labelledby="auth-title"]').boundingBox();
    const logo = await brand.locator('[data-slot="logo-mark"]').boundingBox();
    const text = await brand.locator('p').boundingBox();
    if (!card || !logo || !text) throw new Error('brand block not laid out');
    expect(logo.y, `${path}: logo below the form`).toBeGreaterThanOrEqual(card.y + card.height);
    expect(text.y, `${path}: text below the logo`).toBeGreaterThanOrEqual(logo.y + logo.height - 1);
  }
});

test('Complete your profile appears before any dashboard when a name is missing', async ({ page }) => {
  const account = await createAccount();
  // Simulates a Google account whose family name was not shared (D27 item 3).
  const s = requireSupabase();
  await fetch(`${s.url}/rest/v1/profiles?id=eq.${account.id}`, {
    method: 'PATCH',
    headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ second_name: '' }),
  });
  await signIn(page, account.email, account.password);
  await expect(page).toHaveURL(/\/complete-profile/);
  await page.goto('/learner/dashboard');
  await expect(page).toHaveURL(/\/complete-profile/);
  await page.getByLabel('Second name').fill('Mensah');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  expect((await getProfile(account.id))?.second_name).toBe('Mensah');
});

test('a cancelled Google prompt returns to Sign In with a clear message', async ({ page }) => {
  await page.goto('/auth/callback?error=access_denied&error_description=The+user+cancelled');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('alert')).toHaveText('Google sign-in was cancelled. You can try again or use your email and password.');
});

test('a Google sign-in refused by the database returns to Sign In with a clear message', async ({ page }) => {
  await page.goto('/auth/callback?error=server_error&error_description=Database+error+saving+new+user');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('alert')).toContainText('Staff accounts sign in with email and password');
});
