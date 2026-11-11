import { deflateSync } from 'node:zlib';
import { expect as baseExpect, test } from '@playwright/test';
import { png } from '../fixtures/media.js';
import { dismissToasts, horizontalOverflow } from './helpers.js';
import { createAccount } from './support/accounts.js';
import { createCourseFixture } from './support/courses.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn, signInNewAdmin } from './support/ui.js';

// Owner request of 2026-11-11 (ADR-020 item 7): what an administrator changes on Settings takes effect.
// The owner raised an upload limit from 2 MB to 5 MB and uploads were still refused at 2 MB. Here an
// administrator raises the course cover limit to 5 MB; a lecturer then sees "up to 5 MB" and uploads a
// cover of about 3 MB, which the screen, the upload functions and Storage all accept.
//
// The cover limit is used (not the profile photo limit) because users.spec.js relies on the 2 MB photo
// limit while it runs beside this test. Every device project sets the same 5 MB in the one local
// database, so the value is left in place: putting it back would undo it under another project's run.
// No other test reads the cover limit, and `supabase db reset` restores the default.

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 180_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);

test('an administrator raises the course cover limit to 5 MB and a lecturer uploads a 3 MB cover', async ({ browser, page }) => {
  const tag = unique();
  await signInNewAdmin(page, { first: 'Grace', second: `Admin${tag}` });
  await page.goto('/admin/settings');
  await dismissToasts(page);
  const limits = page.locator('[data-setting="s-file_limits"]');
  // Another device project may already have saved 5: type a different value first so Save is offered.
  await limits.getByLabel('Course covers: largest file in MB').fill('4');
  await limits.getByLabel('Course covers: largest file in MB').fill('5');
  await limits.getByRole('button', { name: 'Save upload limits' }).click();
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Setting saved' }).first()).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Discipleship ${tag}` });
  const teaching = await (await browser.newContext()).newPage();
  await signIn(teaching, lecturer.email, lecturer.password);
  await expect(teaching).toHaveURL(/\/lecturer\/dashboard$/);
  await teaching.goto(`/lecturer/courses/${course.id}`);
  await expect(teaching.getByText('JPG, PNG or WebP, up to 5 MB.')).toBeVisible();

  // About 3 MB: stored without compression, so larger than the old 2 MB limit and within the new one.
  const cover = Buffer.from(png(2000, 1500, (raw) => deflateSync(raw, { level: 0 })));
  expect(cover.length).toBeGreaterThan(2 * 1024 * 1024);
  expect(cover.length).toBeLessThan(5 * 1024 * 1024);
  await teaching.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').setInputFiles({ name: 'large-cover.png', mimeType: 'image/png', buffer: cover });
  await expect(teaching.getByRole('img', { name: /^Cover of / })).toBeVisible({ timeout: 60_000 });
  await expect(teaching.getByRole('button', { name: 'Replace cover' })).toBeVisible();
});
