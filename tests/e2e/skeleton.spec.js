import { expect, test } from '@playwright/test';

// UI_FEEDBACK.md skeleton rules, end to end: the skeleton appears for slow loads, content replaces
// it with layout shift of 0.1 or less, fast loads never flash a skeleton, and after 10 seconds the
// error state with Retry replaces the skeleton. The preview dashboard's ?delay= simulates loading.
// Every test runs on a paused fake clock and moves time forward by exact amounts, so the timing
// rules are checked deterministically even when the machine is under load.

/**
 * Advances the fake clock in 25 ms steps until the locator is visible, and returns the fake time
 * used. React schedules effects on the real task queue, so time is moved in small steps.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 * @param {number} limitMs fail if the state has not appeared within this much fake time
 */
async function advanceUntilVisible(page, locator, limitMs) {
  let elapsed = 0;
  while (!(await locator.isVisible())) {
    if (elapsed >= limitMs) throw new Error(`not visible after ${elapsed} ms of fake time`);
    await page.clock.runFor(25);
    elapsed += 25;
  }
  return elapsed;
}

/** Installs a paused fake clock before the page loads. @param {import('@playwright/test').Page} page */
async function pausedClock(page) {
  const start = new Date('2026-01-05T09:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
}

/** @param {import('@playwright/test').Page} page */
async function trackPhasesAndShift(page) {
  await page.addInitScript(() => {
    const w = /** @type {any} */ (window);
    w.__phases = [];
    w.__cls = 0;
    new MutationObserver(() => {
      const el = document.querySelector('[data-loading-phase]');
      const phase = el?.getAttribute('data-loading-phase') ?? (document.querySelector('#main') ? 'content' : 'none');
      if (w.__phases[w.__phases.length - 1] !== phase) w.__phases.push(phase);
    }).observe(document, { subtree: true, childList: true, attributes: true });
    new PerformanceObserver((list) => {
      for (const entry of /** @type {any[]} */ (list.getEntries())) if (!entry.hadRecentInput) w.__cls += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

test('a slow load shows the dashboard skeleton, then content with layout shift of 0.1 or less', async ({ page, browserName }) => {
  await trackPhasesAndShift(page);
  await pausedClock(page);
  await page.goto('/dev/shell/learner/dashboard?delay=1200');
  await expect(page.locator('[data-loading-phase="blank"]')).toBeAttached();
  const shownAfter = await advanceUntilVisible(page, page.locator('[data-skeleton="dashboard"]'), 400);
  expect(shownAfter, 'skeleton appears at 150 ms, not before').toBeGreaterThanOrEqual(150);
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await advanceUntilVisible(page, page.getByText('Your dashboard is being built'), 2000);
  await expect(page.locator('[data-skeleton="dashboard"]')).toHaveCount(0);
  const phases = await page.evaluate(() => /** @type {any} */ (window).__phases);
  expect(phases).toContain('skeleton');
  // Layout Instability API: Chromium only (Firefox and WebKit do not report layout-shift entries).
  if (browserName === 'chromium') {
    expect(await page.evaluate(() => /** @type {any} */ (window).__cls)).toBeLessThanOrEqual(0.1);
  }
});

test('a load under 150 ms never flashes a skeleton', async ({ page }) => {
  // Fake clock: real timers race under parallel load; the rule is about elapsed time, not speed.
  await trackPhasesAndShift(page);
  await pausedClock(page);
  await page.goto('/dev/shell/learner/dashboard?delay=60');
  await expect(page.locator('[data-loading-phase="blank"]')).toBeAttached();
  const doneAfter = await advanceUntilVisible(page, page.getByText('Your dashboard is being built'), 1000);
  expect(doneAfter).toBeLessThan(150);
  await page.clock.runFor(500);
  const phases = await page.evaluate(() => /** @type {any} */ (window).__phases);
  expect(phases).not.toContain('skeleton');
});

test('after 10 seconds the skeleton becomes an error state with Retry', async ({ page }) => {
  await pausedClock(page);
  await page.goto('/dev/shell/learner/dashboard?delay=never');
  await expect(page.locator('[data-loading-phase="blank"]')).toBeAttached();
  await advanceUntilVisible(page, page.locator('[data-skeleton="dashboard"]'), 400);
  const error = page.getByRole('alert');
  // Jump most of the way (the 10-second timer already exists), then step to the boundary.
  await page.clock.runFor(9_000);
  await expect(error).toHaveCount(0);
  await advanceUntilVisible(page, error, 2_000);
  await expect(error).toContainText('This is taking too long');
  await expect(error.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.locator('[data-skeleton="dashboard"]')).toHaveCount(0);
});
