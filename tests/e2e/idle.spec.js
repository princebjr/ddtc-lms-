import { expect as baseExpect, test } from '@playwright/test';
import { expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createAccount } from './support/accounts.js';
import { createCourseFixture } from './support/courses.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn, signInNewAdmin } from './support/ui.js';

// D43 end to end (ADR-011; owner request and clarification 2026-11-07): idle sign-out for every role,
// on Playwright's clock (installed before the app loads, so the app's timers and Date follow it; time
// flows normally until the test jumps it). After 8 idle minutes the warning opens (focus on Continue
// Session and trapped, Escape continues, axe passes); after 10 the user is signed out, Sign In says
// why, private pages stay closed (Back included), and the next sign-in returns to the same page with
// unsaved work restored. A deliberate sign-out deletes the drafts. The rules are unit-tested with fake
// timers in idle.test.jsx and drafts.test.jsx; the server side in pgTAP 16.

const expect = baseExpect.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 180_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);

/**
 * Waits until the idle clock of the page that has just opened has started: it writes the shared
 * clock (ddtc:lastActivity) once the limits are known. `since` is a time before the page opened (the
 * installed clock starts at the real time and runs normally until the test jumps it).
 * @param {import('@playwright/test').Page} page
 * @param {number} since
 */
async function waitForIdleClock(page, since) {
  await page.waitForFunction((t) => {
    try {
      const v = JSON.parse(window.localStorage.getItem('ddtc:lastActivity') ?? 'null');
      return Boolean(v && v.at >= t);
    } catch {
      return false;
    }
  }, since);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 * @param {string} password
 */
async function signInHere(page, email, password) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

test('a learner left idle is warned after 8 minutes, may continue, and is signed out after 10 with the reason', async ({ page }) => {
  await page.clock.install();
  const learner = await createAccount({ first: 'Kwame', second: `Mensah${unique()}` });
  await signIn(page, learner.email, learner.password);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  const opened = Date.now();
  await page.goto('/learner/assignments');
  await expect(page.getByRole('heading', { name: 'Assignments', level: 1 })).toBeVisible();
  await waitForIdleClock(page, opened);

  // Eight minutes without activity: the warning, with focus on Continue Session and kept inside.
  await page.clock.fastForward('08:00');
  const warning = page.getByRole('alertdialog', { name: 'Your session ends in 2 minutes' });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('You have not used DDTC LMS for 8 minutes.');
  const keep = warning.getByRole('button', { name: 'Continue Session' });
  await expect(keep).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(warning.getByRole('button', { name: 'Sign out now' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(keep).toBeFocused();
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Escape is Continue Session: the clock starts again.
  await page.keyboard.press('Escape');
  await expect(warning).toHaveCount(0);
  await page.clock.fastForward('07:00');
  await expect(warning).toHaveCount(0);

  // Ten consecutive idle minutes: signed out, with the reason, and the way back to this page.
  await page.clock.fastForward('01:00');
  await expect(warning).toBeVisible();
  await page.clock.fastForward('02:00');
  await expect(page).toHaveURL(/\/login\?idle=10&next=%2Flearner%2Fassignments$/);
  await expect(page.getByRole('status').filter({ hasText: 'You were signed out after 10 minutes of inactivity.' })).toBeVisible();

  // The next sign-in returns to the same page.
  await signInHere(page, learner.email, learner.password);
  await expect(page).toHaveURL(/\/learner\/assignments$/);
});

test("a lecturer's unsaved lesson survives an idle sign-out and comes back after signing in; a deliberate sign-out deletes it", async ({ page }) => {
  await page.clock.install();
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Church History ${tag}` });
  const lessonPage = new RegExp(`/lecturer/courses/${course.id}/lessons/new$`);
  await signIn(page, lecturer.email, lecturer.password);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  const opened = Date.now();
  await page.goto(`/lecturer/courses/${course.id}/lessons/new`);
  await waitForIdleClock(page, opened);

  await page.getByLabel('Lesson title').fill('The early church');
  const text = page.getByRole('textbox', { name: 'Lesson text' });
  await text.click();
  await page.keyboard.type('Acts 2 and the first believers.');
  await expect(text).toContainText('Acts 2 and the first believers.');

  // The warning says there is unsaved work; then the idle sign-out keeps it as a draft.
  await page.clock.fastForward('08:00');
  const warning = page.getByRole('alertdialog', { name: 'Your session ends in 2 minutes' });
  await expect(warning).toContainText('You have unsaved changes.');
  await page.clock.fastForward('02:00');
  await expect(page).toHaveURL(/\/login\?idle=10&next=/);

  await signInHere(page, lecturer.email, lecturer.password);
  await expect(page).toHaveURL(lessonPage);
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Draft restored' })).toBeVisible();
  await expect(page.getByLabel('Lesson title')).toHaveValue('The early church');
  await expect(text).toContainText('Acts 2 and the first believers.');

  // A deliberate sign-out deletes the user's drafts.
  await page.getByRole('button', { name: /account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signInHere(page, lecturer.email, lecturer.password);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  await page.goto(`/lecturer/courses/${course.id}/lessons/new`);
  await expect(page.getByLabel('Lesson title')).toHaveValue('');
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Draft restored' })).toHaveCount(0);
});

test('an administrator is warned and signed out like everyone else; Continue Session keeps the session; Back shows nothing private', async ({ page }) => {
  await page.clock.install();
  const opened = Date.now();
  await signInNewAdmin(page, { first: 'Grace', second: `Admin${unique()}` });
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await waitForIdleClock(page, opened);
  // A private page in the history, for Back later. Moving there counts as activity, so let the page
  // settle before time jumps (otherwise the move would be counted after the jump).
  await page.getByRole('link', { name: 'Users', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible();
  await page.waitForTimeout(500);

  await page.clock.fastForward('08:00');
  const warning = page.getByRole('alertdialog', { name: 'Your session ends in 2 minutes' });
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: 'Continue Session' }).click();
  await expect(warning).toHaveCount(0);
  await page.clock.fastForward('07:00');
  await expect(warning).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/users$/);

  await page.clock.fastForward('03:00');
  await expect(page).toHaveURL(/\/login\?idle=10&next=%2Fadmin%2Fusers$/);
  await expect(page.getByText('You were signed out after 10 minutes of inactivity.')).toBeVisible();

  // Back (to the dashboard in the history) reveals no private page, and private pages stay closed.
  await page.goBack();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
