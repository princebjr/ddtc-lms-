import { expect, test } from '@playwright/test';
import { openRoute } from './helpers.js';

// Section 15 navigation pattern (D40, DESIGN.md 11 and 12.4), checked on every device project at
// its own viewport: phones (below 640 px) get the floating pill bar with three destinations plus
// More; tablets (640 to 1023 px) a collapsible side rail; desktops (1024 px and up) a persistent
// sidebar. Every project asserts the layout that matches its width.

/** @param {import('@playwright/test').Page} page */
const viewportWidth = (page) => page.viewportSize()?.width ?? 1280;

test('learner shell uses the navigation pattern for this device class', async ({ page }) => {
  await openRoute(page, '/dev/shell/learner/dashboard');
  const width = viewportWidth(page);
  const pill = page.locator('[data-slot="phone-nav"]');
  const side = page.locator('[data-slot="side-nav"]');

  if (width < 640) {
    await expect(pill).toBeVisible();
    await expect(side).toBeHidden();
    await expect(pill.getByRole('link')).toHaveCount(3);
    await expect(pill.getByRole('button', { name: 'More' })).toBeVisible();

    // The name shows only on the active item.
    await expect(pill.getByText('Dashboard', { exact: true })).toBeVisible();
    await expect(pill.getByText('My Courses', { exact: true })).toBeHidden();

    await pill.getByRole('link', { name: 'My Courses' }).click();
    await expect(page).toHaveURL(/\/dev\/shell\/learner\/my-courses$/);
    await expect(pill.getByRole('link', { name: 'My Courses' })).toHaveAttribute('aria-current', 'page');
    await expect(pill.getByText('My Courses', { exact: true })).toBeVisible();
    await expect(pill.getByText('Dashboard', { exact: true })).toBeHidden();

    // More opens a bottom sheet with every other destination and Sign out; Escape closes it.
    await pill.getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog', { name: 'More' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Grades' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Notifications' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Profile' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    // A page that lives under More highlights More.
    await pill.getByRole('button', { name: 'More' }).click();
    await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'Grades' }).click();
    await expect(page).toHaveURL(/\/grades$/);
    await expect(pill.getByRole('button', { name: 'More' })).toHaveAttribute('data-active', 'true');
  } else if (width < 1024) {
    await expect(pill).toBeHidden();
    await expect(side).toBeVisible();
    // Collapsed rail: icons only, names stay accessible.
    await expect(side).toHaveAttribute('data-collapsed', 'true');
    await expect(side.getByRole('link', { name: 'My Courses' })).toBeVisible();
    await expect(side.getByText('My Courses', { exact: true })).toHaveClass(/sr-only/);
    await side.getByRole('button', { name: 'Expand navigation' }).click();
    await expect(side).not.toHaveAttribute('data-collapsed');
    await expect(side.getByText('My Courses', { exact: true })).not.toHaveClass(/sr-only/);
    await side.getByRole('link', { name: 'Assignments' }).click();
    await expect(page).toHaveURL(/\/assignments$/);
    await side.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect(side).toHaveAttribute('data-collapsed', 'true');
  } else {
    await expect(pill).toBeHidden();
    await expect(side).toBeVisible();
    await expect(side.getByText('DDTC LMS', { exact: true })).toBeVisible();
    await expect(side.getByText('My Courses', { exact: true })).toBeVisible();
    await expect(side.getByRole('button', { name: /navigation/ })).toBeHidden();
    await expect(side.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    await side.getByRole('link', { name: 'Grades' }).click();
    await expect(page).toHaveURL(/\/grades$/);
    await expect(side.getByRole('link', { name: 'Grades' })).toHaveAttribute('aria-current', 'page');
  }
});

test('page content is never hidden behind the phone pill bar', async ({ page }) => {
  await openRoute(page, '/dev/shell/admin/dashboard');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = page.locator('#main > :last-child');
  const lastBox = await last.boundingBox();
  const pill = page.locator('[data-slot="phone-nav"]');
  if (viewportWidth(page) < 640) {
    const pillBox = await pill.boundingBox();
    expect(lastBox && pillBox ? lastBox.y + lastBox.height : 0).toBeLessThanOrEqual(pillBox?.y ?? 0);
  } else {
    await expect(pill).toBeHidden();
  }
});

test('the account menu offers Profile, the theme and Sign out', async ({ page }) => {
  await openRoute(page, '/dev/shell/lecturer/dashboard');
  await page.getByRole('button', { name: /account menu for Ama Boateng/ }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByText('Lecturer')).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: 'Dark' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
});
