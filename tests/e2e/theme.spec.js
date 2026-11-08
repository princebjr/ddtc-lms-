import { expect, test } from '@playwright/test';
import { openRoute } from './helpers.js';

// DESIGN.md 6 and TESTING.md 6 (Phase 1): theme switching with no flash of the wrong theme.
// System is the default and follows the device; a stored choice wins and is applied before the
// first paint; the choice persists across reloads; theme-color follows the theme.

/**
 * Records whether the page had the .dark class at its first animation frame.
 * @param {import('@playwright/test').Page} page
 * @param {string | null} stored
 */
async function recordFirstFrame(page, stored) {
  await page.addInitScript((value) => {
    if (value !== null && !sessionStorage.getItem('seeded')) {
      localStorage.setItem('ddtc-theme', value);
      sessionStorage.setItem('seeded', '1');
    }
    requestAnimationFrame(() => {
      /** @type {any} */ (window).__firstFrameDark = document.documentElement.classList.contains('dark');
    });
  }, stored);
}

test('System (the default) follows the device colour scheme from the first frame', async ({ page }, testInfo) => {
  await recordFirstFrame(page, null);
  await openRoute(page, '/');
  const deviceDark = testInfo.project.use.colorScheme === 'dark';
  // WebKit can lay #main out before it paints the first frame: wait until the first frame is recorded.
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__firstFrameDark)).toBe(deviceDark);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', deviceDark ? '#0a1428' : '#f8fafc');
});

for (const stored of ['light', 'dark']) {
  test(`a stored "${stored}" choice is applied before the first paint (no flash)`, async ({ page }) => {
    await recordFirstFrame(page, stored);
    await openRoute(page, '/dev/shell/learner/dashboard');
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__firstFrameDark)).toBe(stored === 'dark');
    await expect(page.locator('html')).toHaveClass(stored === 'dark' ? /dark/ : /^(?!.*dark).*$/);
  });
}

test('switching the theme applies at once and persists after reload', async ({ page }, testInfo) => {
  await openRoute(page, '/dev/shell/learner/dashboard');
  const target = testInfo.project.use.colorScheme === 'dark' ? 'Light' : 'Dark';
  await page.getByRole('button', { name: /account menu/ }).click();
  await page.getByRole('menuitemradio', { name: target }).click();
  const isDark = target === 'Dark';
  await expect(page.locator('html')).toHaveClass(isDark ? /dark/ : /^(?!.*dark).*$/);
  await page.reload();
  await expect(page.locator('#main')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(isDark ? /dark/ : /^(?!.*dark).*$/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', isDark ? '#0a1428' : '#f8fafc');
});
