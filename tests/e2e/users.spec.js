import { expect as baseExpect, test } from '@playwright/test';
import { createAccount, emailLink, getProfile, SEED, SEED_PASSWORD } from './support/accounts.js';
import { requireSupabase } from './support/local-supabase.js';
import { searchList, signIn, signInNewAdmin } from './support/ui.js';

// Phase 4 end to end: user management, profile photos and D32 absolute session limits.
// Tests required: a non-administrator cannot change any role at the UI level; avatar upload rejects
// wrong type and oversize and initials show when the image is missing; idle and absolute session
// limits behave as D32 (time is fast-forwarded instead of waiting).

const expect = baseExpect.configure({ timeout: 15_000 });

// These flows make many round trips (each photo is registered, uploaded and checked on the server),
// which takes longer than 30 s on emulated phones; every assertion is unchanged.
test.describe.configure({ timeout: 90_000 });

/**
 * Checks an error toast and dismisses it, as a person would: error toasts stay until dismissed, and
 * on phones a stack of them covers the buttons below.
 * @param {import('@playwright/test').Page} page @param {string | RegExp} text
 */
async function dismissToast(page, text) {
  const toast = page.locator('[data-toast-id]').filter({ hasText: text });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(toast).toHaveCount(0);
}

/** A name no other test running in parallel uses. */
const unique = () => Math.random().toString(36).slice(2, 8);
test.beforeAll(() => {
  requireSupabase();
});

// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('a learner has no way to change roles: admin pages redirect and their profile has no role control', async ({ page }) => {
  await signIn(page, SEED.learner, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  for (const path of ['/admin/users', '/admin/lecturers', '/admin/learners']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/learner\/dashboard$/);
  }
  await page.goto('/learner/profile');
  await expect(page.getByRole('heading', { name: 'Profile settings' })).toBeVisible();
  await expect(page.getByLabel('Role')).toHaveCount(0);
  await expect(page.getByLabel('Email address')).toHaveAttribute('readonly', '');
});

test('profile: initials without a photo, a wrong file type is rejected, a real image becomes the photo, and it can be removed', async ({ page }) => {
  const account = await createAccount({ first: 'Kwabena', second: 'Asare' });
  await signIn(page, account.email, account.password);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await page.goto('/learner/profile');
  await expect(page.getByRole('img', { name: 'Kwabena Asare' }).first()).toContainText('KA');

  const chooser = page.locator('input[type="file"]');
  await chooser.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await dismissToast(page, 'Photo not accepted: use a JPG, PNG or WebP image');

  await chooser.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await dismissToast(page, 'Photo not accepted: the image is larger than 2 MB');

  // Named like a PNG but not one: the server reads the bytes and rejects it.
  await chooser.setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg>not really a png</svg>') });
  await dismissToast(page, /Photo not accepted: the file is not a JPG, PNG or WebP image/);
  expect((await getProfile(account.id))?.profile_image_file_id ?? null).toBeNull();

  await chooser.setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Photo updated' })).toBeVisible();
  await expect(page.locator('main img[src*="profile-images"]').first()).toBeVisible();

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Profile saved' }).first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'Kwabena Asare' }).first()).toContainText('KA');
});

test('profile: names and contact number are saved', async ({ page }) => {
  const account = await createAccount();
  await signIn(page, account.email, account.password);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await page.goto('/learner/profile');
  await page.getByLabel('Second name').fill('Mensah-Boateng');
  await page.getByLabel('Contact number (optional)').fill('call me');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Enter a phone number, for example +233 20 123 4567')).toBeVisible();
  await page.getByLabel('Contact number (optional)').fill('+233 20 123 4567');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Profile saved' })).toBeVisible();
  expect((await getProfile(account.id))?.second_name).toBe('Mensah-Boateng');
});

test('administrator: find a learner, suspend with Undo, promote to lecturer, grant course creation', async ({ page }) => {
  const second = `Konadu${unique()}`;
  const learner = await createAccount({ first: 'Yaa', second });
  await signInNewAdmin(page);
  await page.goto('/admin/users');
  await searchList(page, second);
  const manage = page.getByRole('button', { name: `Manage Yaa ${second}` });
  await expect(manage).toBeVisible();

  await manage.click();
  await page.getByRole('button', { name: 'Suspend account' }).click();
  const suspended = page.locator('[data-toast-id]').filter({ hasText: 'Account suspended' });
  await expect(suspended).toBeVisible();
  expect((await getProfile(learner.id))?.account_status).toBe('SUSPENDED');
  await suspended.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await getProfile(learner.id))?.account_status).toBe('ACTIVE');
  // Tapping the toast is a tap outside the panel, which closes it: open it again.
  await manage.click();

  // The panel's own Role picker (the page also has a Role filter).
  const panel = page.getByRole('dialog', { name: `Yaa ${second}` });
  await panel.getByLabel('Role').click();
  await page.getByRole('option', { name: 'Lecturer' }).click();
  await page.getByRole('button', { name: 'Change role' }).click();
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Permissions updated' }).first()).toBeVisible();
  await expect.poll(async () => (await getProfile(learner.id))?.role).toBe('LECTURER');

  await panel.getByLabel('Can create courses').click();
  await expect.poll(async () => (await getProfile(learner.id))?.can_create_courses).toBe(true);
});

test('administrator: cannot change their own role or status', async ({ page }) => {
  const second = `Self${unique()}`;
  await signInNewAdmin(page, { first: 'Grace', second });
  await page.goto('/admin/users');
  await searchList(page, second);
  await page.getByRole('button', { name: `Manage Grace ${second}` }).click();
  await expect(page.getByText('This is your account. Another administrator must change your role or status.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suspend account' })).toHaveCount(0);
});

test('administrator: CSV import shows a preview with errors, then imports the valid learners', async ({ page }) => {
  await signInNewAdmin(page);
  await page.goto('/admin/learners');
  const stamp = Date.now();
  const csv = `first_name,second_name,email\nEfua,Sarpong,efua-${stamp}@ddtc.test\n,Missing,missing-${stamp}@ddtc.test\nAma,Asante,${SEED.learner}\n`;
  const open = page.viewportSize() && (page.viewportSize()?.width ?? 0) >= 1024;
  if (open) await page.getByRole('button', { name: 'Import CSV' }).click();
  else {
    await page.getByRole('button', { name: 'Add people' }).click();
    await page.getByRole('button', { name: 'Import CSV' }).click();
  }
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({ name: 'learners.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('1 ready to import, 2 with errors. Rows with errors are skipped.')).toBeVisible();
  await page.getByRole('button', { name: 'Import 1 learners' }).click();
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Imported 1 learners, 2 errors' })).toBeVisible();
});

// D32's absolute lifetimes with shortened test values (the phase file's wording): the end-to-end
// build reads shorter limits from the browser so the real timers run in seconds. Production builds
// ignore this setting. The idle limit (D43 replaced D32's idle values) is tested on Playwright's clock
// in idle.spec.js: the warning dialog, Continue Session, the sign-out and its message, for each role.
/**
 * @param {import('@playwright/test').Page} page
 * @param {{ absoluteMs: number, warningMs: number }} limits
 */
async function useShortLimits(page, limits) {
  await page.addInitScript((l) => window.localStorage.setItem('ddtc-test-session-limits', JSON.stringify({ ...l, checkMs: 500 })), limits);
}

test('session limits (D32): the absolute limit warns, then ends a session even while the user is active', async ({ page }) => {
  await useShortLimits(page, { absoluteMs: 15_000, warningMs: 5_000 });
  await signIn(page, SEED.lecturer, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  // Keep being active: activity cannot extend the absolute limit.
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.click(5, 5);
    await page.waitForTimeout(1_000);
  }
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Your session ends in 2 minutes' })).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/login\?expired=1$/, { timeout: 30_000 });
  await expect(page.getByRole('alert')).toHaveText('Your session ended. Sign in again to continue.');
});

test('administrator: invites a second administrator, who accepts by email, chooses a password and must set up two-step verification (ADR-003)', async ({ page, browser }, testInfo) => {
  await signInNewAdmin(page);
  await page.goto('/admin/users');
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  if (desktop) await page.getByRole('button', { name: 'Invite administrator' }).click();
  else {
    await page.getByRole('button', { name: 'Add people' }).click();
    await page.getByRole('button', { name: 'Invite administrator' }).click();
  }
  const email = `second-admin-${unique()}@ddtc.test`;
  const dialog = page.getByRole('dialog', { name: 'Invite administrator' });
  await dialog.getByLabel('First name').fill('Solomon');
  await dialog.getByLabel('Second name').fill('Nyamekye');
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Administrator invited' })).toBeVisible();

  // The invited person, in their own browser.
  const invitee = await browser.newContext({ ...testInfo.project.use });
  const theirPage = await invitee.newPage();
  await theirPage.goto(await emailLink(email, { subject: /invite/i }));
  await expect(theirPage).toHaveURL(/\/reset-password$/);
  await theirPage.getByLabel('New password', { exact: true }).fill('Second-Admin-2026');
  await theirPage.getByLabel('Confirm new password').fill('Second-Admin-2026');
  await theirPage.getByRole('button', { name: 'Save new password' }).click();
  // No admin page before two-step verification.
  await expect(theirPage).toHaveURL(/\/mfa/);
  await expect(theirPage.getByRole('heading', { name: 'Set up two-step verification' })).toBeVisible();
  await invitee.close();
});
