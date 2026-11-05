import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Smoke (Phase 0, updated in Phase 3 when Sign In replaced the placeholder page): the first page
// loads on every device project in light and dark, with no console errors, no horizontal overflow
// and no axe violations (WCAG 2.1 AA). `/` sends a signed-out visitor to Sign In.
test('the first page (Sign In) loads cleanly', async ({ page }) => {
  /** @type {string[]} */
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle('DDTC LMS');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0);

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);

  expect(consoleErrors).toEqual([]);
});
