import { expect as baseExpect, test } from '@playwright/test';
import { createAccount, getProfile, SEED, SEED_PASSWORD } from './support/accounts.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn, signInNewAdmin } from './support/ui.js';

// Phase 4 end to end: user management, profile photos and D32 session limits.
// Tests required: a non-administrator cannot change any role at the UI level; avatar upload rejects
// wrong type and oversize and initials show when the image is missing; idle and absolute session
// limits behave as D32 (time is fast-forwarded instead of waiting).

const expect = baseExpect.configure({ timeout: 15_000 });

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
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Photo not accepted: use a JPG, PNG or WebP image' })).toBeVisible();

  await chooser.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Photo not accepted: the image is larger than 2 MB' })).toBeVisible();

  // Named like a PNG but not one: the server reads the bytes and rejects it.
  await chooser.setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg>not really a png</svg>') });
  await expect(page.locator('[data-toast-id]').filter({ hasText: /Photo not accepted: the file is not a JPG, PNG or WebP image/ })).toBeVisible();
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
  const learner = await createAccount({ first: 'Yaa', second: 'Konadu' });
  await signInNewAdmin(page);
  await page.goto('/admin/users');
  await page.getByLabel('Search').fill('Konadu');
  const manage = page.getByRole('button', { name: 'Manage Yaa Konadu' });
  await expect(manage).toBeVisible();

  await manage.click();
  await page.getByRole('button', { name: 'Suspend account' }).click();
  const suspended = page.locator('[data-toast-id]').filter({ hasText: 'Account suspended' });
  await expect(suspended).toBeVisible();
  expect((await getProfile(learner.id))?.account_status).toBe('SUSPENDED');
  await suspended.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await getProfile(learner.id))?.account_status).toBe('ACTIVE');

  await page.getByLabel('Role').click();
  await page.getByRole('option', { name: 'Lecturer' }).click();
  await page.getByRole('button', { name: 'Change role' }).click();
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Permissions updated' }).first()).toBeVisible();
  await expect.poll(async () => (await getProfile(learner.id))?.role).toBe('LECTURER');

  await page.getByLabel('Can create courses').click();
  await expect.poll(async () => (await getProfile(learner.id))?.can_create_courses).toBe(true);
});

test('administrator: cannot change their own role or status', async ({ page }) => {
  await signInNewAdmin(page);
  await page.goto('/admin/users');
  await page.getByLabel('Search').fill('Grace');
  await page.getByRole('button', { name: /Manage Grace Admin/ }).first().click();
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

test('session limits (D32): an idle learner is warned two minutes before the end, then signed out', async ({ page }) => {
  await page.clock.install();
  await signIn(page, SEED.learner, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  // Learner idle limit is 7 days: jump to 3 minutes before it.
  await page.clock.fastForward(7 * 24 * 3_600_000 - 3 * 60_000);
  await page.clock.fastForward(90_000);
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Your session ends in 2 minutes' })).toBeVisible();
  await page.clock.fastForward(3 * 60_000);
  await expect(page).toHaveURL(/\/login\?expired=1$/);
  await expect(page.getByRole('alert')).toHaveText('Your session ended. Sign in again to continue.');
});

test('session limits (D32): "Stay signed in" keeps an idle administrator session going', async ({ page }) => {
  await page.clock.install();
  await signInNewAdmin(page);
  // Administrator idle limit is 30 minutes: jump to the warning.
  await page.clock.fastForward(28 * 60_000 + 30_000);
  const warning = page.locator('[data-toast-id]').filter({ hasText: 'Your session ends in 2 minutes' });
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: 'Stay signed in' }).click();
  await page.clock.fastForward(5 * 60_000);
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
});
