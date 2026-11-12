import { expect as baseExpect, test } from '@playwright/test';
import { dismissToasts, expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createCourseFixture } from './support/courses.js';
import { createAccount } from './support/accounts.js';
import { requireSupabase } from './support/local-supabase.js';
import { signInNewAdmin } from './support/ui.js';

// Phase 12 end to end (D20, ADR-022), on every device project, light and dark: an administrator opens
// Retention, reads what is removed and what is kept, sees live deletion is off; switching it on asks
// first (cancelled here, so it stays off for every other test); places a hold on a course with a reason,
// releases it, and finds it under Released holds. The deleting itself is tested in pgTAP 37 and
// tests/functions/retention.test.js.

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 180_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);
/** @param {import('@playwright/test').Page} page @param {string} text */
const toast = (page, text) => page.locator('[data-toast-id]').filter({ hasText: text }).first();

test('an administrator reads the retention rules, keeps live deletion off, and places and releases a course hold', async ({ page }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Retention study ${tag}` });
  await signInNewAdmin(page, { first: 'Grace', second: `Admin${tag}` });
  await page.goto('/admin/retention');
  await dismissToasts(page);

  const status = page.locator('[data-slot="retention-status"]');
  await expect(status.getByText(/is removed \d+ days after the grade or result is released/)).toBeVisible();
  await expect(status.getByText(/grades, feedback and history are always kept/)).toBeVisible();
  const live = page.getByRole('switch', { name: 'Live deletion' });
  await expect(live).toHaveAttribute('aria-checked', 'false');
  await live.click();
  const confirm = page.getByRole('alertdialog', { name: 'Switch on live deletion?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expect(live).toHaveAttribute('aria-checked', 'false');
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByLabel('Course', { exact: true }).selectOption(course.id);
  await page.getByLabel('Reason', { exact: true }).fill('Records requested for review');
  await page.getByRole('button', { name: 'Place hold' }).click();
  await expect(toast(page, 'Hold placed')).toBeVisible();
  const held = page.getByTestId('active-hold').filter({ hasText: `Retention study ${tag}` });
  await expect(held).toBeVisible();
  await expect(held.getByText(/Records requested for review · placed by Grace Admin/)).toBeVisible();
  await dismissToasts(page);
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await held.getByRole('button', { name: /^Release the hold on / }).click();
  await expect(toast(page, 'Hold released')).toBeVisible();
  await expect(held).toHaveCount(0);
  await page.getByText(/^Released holds \(\d+\)$/).click();
  await expect(page.getByText(new RegExp(`Course: \\S+ Retention study ${tag}\\. Records requested for review\\. Released by Grace Admin${tag}`))).toBeVisible();
});
