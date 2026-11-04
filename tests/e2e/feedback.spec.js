import { expect, test } from '@playwright/test';
import { openRoute } from './helpers.js';

// UI_FEEDBACK.md toasts and floating action buttons, end to end on every device project. The
// design page triggers catalogue toasts and shows the speed dial (as a component demo).

/** @param {import('@playwright/test').Page} page */
const viewportWidth = (page) => page.viewportSize()?.width ?? 1280;
/** @param {import('@playwright/test').Page} page */
const toasts = (page) => page.locator('[data-toast-id]');

test('toasts sit at the bottom on phones and tablets and top right on desktop', async ({ page }) => {
  await openRoute(page, '/dev/design');
  await page.getByRole('button', { name: 'Success', exact: true }).click();
  const toast = toasts(page).filter({ hasText: 'Profile saved' });
  await expect(toast).toBeVisible();
  const box = await toast.boundingBox();
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  if (!box) throw new Error('toast has no box');
  if (vp.width >= 1024) {
    expect(box.y).toBeLessThan(vp.height / 3);
    expect(vp.width - (box.x + box.width)).toBeLessThan(48);
  } else {
    expect(box.y + box.height).toBeGreaterThan(vp.height / 2);
    // Above the floating action button on phones and tablets.
    const fab = await page.locator('[data-slot="fab"]').boundingBox();
    if (fab) expect(box.y + box.height).toBeLessThanOrEqual(fab.y);
  }
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
});

test('a success toast closes after 4 seconds; Escape dismisses a focused toast', async ({ page }) => {
  await openRoute(page, '/dev/design');
  await page.getByRole('button', { name: 'Success', exact: true }).click();
  await expect(toasts(page).filter({ hasText: 'Profile saved' })).toBeVisible();
  await expect(toasts(page).filter({ hasText: 'Profile saved' })).toHaveCount(0, { timeout: 6000 });

  await page.getByRole('button', { name: 'Error with Retry' }).click();
  const error = toasts(page).filter({ hasText: 'Could not save. Try again' });
  await expect(error).toHaveAttribute('role', 'alert');
  await error.focus();
  await page.keyboard.press('Escape');
  await expect(error).toHaveCount(0);
});

test('reversible actions show Undo; repeats merge with a count; at most 3 are visible', async ({ page }) => {
  await openRoute(page, '/dev/design');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(toasts(page).filter({ hasText: 'Course archived' }).getByRole('button', { name: 'Undo' })).toBeVisible();

  await page.getByRole('button', { name: 'Success', exact: true }).click();
  await page.getByRole('button', { name: 'Success', exact: true }).click();
  await expect(toasts(page).filter({ hasText: 'Profile saved' })).toHaveCount(1);
  await expect(toasts(page).filter({ hasText: 'Profile saved' })).toContainText('(2)');

  await page.getByRole('button', { name: 'Info', exact: true }).click();
  await page.getByRole('button', { name: 'Warning', exact: true }).click();
  await expect(toasts(page)).toHaveCount(3);
});

test('going offline shows "You are offline" until the connection returns, then "Back online"', async ({ page, context }) => {
  await openRoute(page, '/dev/design');
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(toasts(page).filter({ hasText: 'You are offline' })).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(toasts(page).filter({ hasText: 'Back online' })).toBeVisible();
  await expect(toasts(page).filter({ hasText: 'You are offline' })).toHaveCount(0);
});

test('the floating action button appears only below 1024 px and its speed dial works', async ({ page }) => {
  await openRoute(page, '/dev/design');
  const fab = page.getByRole('button', { name: 'Add', exact: true });
  if (viewportWidth(page) >= 1024) {
    await expect(fab).toHaveCount(0);
    return;
  }
  await expect(fab).toBeVisible();
  const box = await fab.boundingBox();
  const vp = page.viewportSize() ?? { width: 375, height: 667 };
  expect(box?.width).toBe(56);
  expect(box?.height).toBe(56);
  expect(vp.width - ((box?.x ?? 0) + (box?.width ?? 0))).toBeCloseTo(16, 0);

  await fab.click();
  const dial = page.getByRole('dialog', { name: 'Add' });
  for (const label of ['Add learner', 'Provision lecturer', 'Import CSV']) await expect(dial.getByRole('button', { name: label })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dial).toBeHidden();

  // Hides while scrolling down, returns on scroll up (scrollBy: mobile WebKit has no mouse wheel).
  await page.evaluate(() => window.scrollBy(0, 600));
  await expect(page.locator('[data-slot="fab"]')).toHaveAttribute('data-hidden', 'true');
  await page.evaluate(() => window.scrollBy(0, -300));
  await expect(page.locator('[data-slot="fab"]')).not.toHaveAttribute('data-hidden');
});

test('the floating action button hides while typing in a field', async ({ page }) => {
  await openRoute(page, '/dev/design');
  if (viewportWidth(page) >= 1024) {
    await expect(page.locator('[data-slot="fab"]')).toHaveCount(0);
    return;
  }
  await page.getByRole('textbox', { name: 'Email' }).focus();
  await expect(page.locator('[data-slot="fab"]')).toHaveAttribute('data-hidden', 'true');
});
