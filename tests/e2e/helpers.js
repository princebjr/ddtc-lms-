import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { NAVIGATION, ROLE_KEYS } from '../../src/lib/navigation.js';

/** Every route in the build that opens signed out (production routes plus the preview routes). */
export const ROUTES = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/verify-email',
  '/reset-password',
  '/auth/confirm',
  '/offline',
  '/this-page-does-not-exist',
  '/dev',
  '/dev/design',
  '/dev/audio',
  ...ROLE_KEYS.flatMap((role) => NAVIGATION[role].destinations.map((d) => `/dev/shell/${role}/${d.slug}`)),
];

/** Widths from the Phase 1 overflow test. */
export const SWEEP_WIDTHS = [320, 375, 768, 1024, 1280, 1920];

/**
 * Collects console errors and page errors for the lifetime of the page.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
export function collectConsoleErrors(page) {
  /** @type {string[]} */
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/**
 * Opens a route and waits until the app has rendered it (fonts and lazy route chunk included).
 * @param {import('@playwright/test').Page} page
 * @param {string} path
 */
export async function openRoute(page, path) {
  await page.goto(path);
  await expect(page.locator('#main')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>} document scroll width minus viewport width (must be 0 or less)
 */
export function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/**
 * Checks the settled screen. A toast caught in its 200 ms fade-in is semi-transparent, which axe
 * reports as low contrast although the toast passes once shown; so one-off animations and
 * transitions are allowed to finish first. Looping ones (skeleton shimmer, the auth card glow)
 * never finish and are not waited for.
 * @param {import('@playwright/test').Page} page
 */
export async function expectNoAxeViolations(page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary, 'axe WCAG 2.1 AA violations').toEqual([]);
}

/**
 * Visible interactive elements smaller than 44 by 44 px (RESPONSIVE.md 15.3).
 * Inline links inside running text are exempt (WCAG 2.5.8 inline exception), and so are
 * visually hidden elements such as the skip link, which becomes a large target when focused.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
export function undersizedTargets(page) {
  return page.evaluate(() => {
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="radio"], [role="tab"], [role="link"], [role="checkbox"], [role="switch"]';
    /** @type {string[]} */
    const small = [];
    for (const el of document.querySelectorAll(selector)) {
      if (!(el instanceof HTMLElement)) continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"], [inert]')) continue;
      const style = getComputedStyle(el);
      if (style.pointerEvents === 'none') continue;
      const inline = el.tagName === 'A' && style.display === 'inline' && el.closest('p, li') !== null;
      if (inline) continue;
      const box = el.getBoundingClientRect();
      // Visually hidden elements (for example the skip link before it receives focus) are exempt.
      if (box.width <= 1 && box.height <= 1) continue;
      if (box.width < 43.5 || box.height < 43.5) {
        const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.tagName;
        small.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    return small;
  });
}

/**
 * @param {import('@playwright/test').TestInfo} testInfo
 * @returns {boolean} true for phone projects (viewport below 640 px)
 */
export function isPhoneProject(testInfo) {
  const width = testInfo.project.use.viewport?.width ?? 1280;
  return width < 640;
}
