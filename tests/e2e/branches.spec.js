import { expect as baseExpect, test } from '@playwright/test';
import { expectNoAxeViolations, horizontalOverflow, isPhoneProject } from './helpers.js';
import { createAccount, getProfile } from './support/accounts.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn } from './support/ui.js';

// D42 end to end (owner request 2026-11-07): learner branches. A learner chooses their branch on
// Profile settings (the phone's own picker below 640 px; the drop-down list, by keyboard, from tablet
// width up), saves it with Save changes, and finds it there after reloading. Who may read and change
// a branch is proven in pgTAP (15_branches).

const expect = baseExpect.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 120_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);
const BRANCHES = ['Kasoa C.P', 'Affumkrom - Nsawam', 'Sampa', 'Amanfrom', 'Kumasi', 'Atwitwiriso'];

/**
 * Chooses a branch as a person would: with the phone's own picker below 640 px; from tablet width up
 * with the keyboard (open with Enter, type the first letters, choose with Enter).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} name
 */
async function chooseBranch(page, testInfo, name) {
  const field = page.getByLabel('Branch', { exact: true });
  if (isPhoneProject(testInfo)) {
    await field.selectOption({ label: name });
    return;
  }
  await field.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.type(name.slice(0, 3));
  await expect(page.getByRole('option', { name, exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} name
 */
async function expectBranchShown(page, testInfo, name) {
  const field = page.getByLabel('Branch', { exact: true });
  if (isPhoneProject(testInfo)) await expect(field.locator('option:checked')).toHaveText(name);
  else await expect(field).toHaveText(name);
}

test('a learner chooses their branch on Profile settings, saves it, and it is still there after reloading', async ({ page }, testInfo) => {
  const learner = await createAccount({ first: 'Kwame', second: `Mensah${unique()}` });
  await signIn(page, learner.email, learner.password);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await page.goto('/learner/profile');

  const field = page.getByLabel('Branch', { exact: true });
  const save = page.getByRole('button', { name: 'Save changes' });
  await expect(field).toBeVisible();
  await expect(page.getByText('Your lecturers and administrators can see your branch.')).toBeVisible();
  await expect(save).toBeDisabled();

  // The six branches, in DDTC's order, read from the database.
  if (isPhoneProject(testInfo)) {
    await expect(field.locator('option')).toHaveText(['Select your branch', ...BRANCHES]);
  } else {
    await expect(field).toHaveText('Select your branch');
    await field.click();
    await expect(page.getByRole('option')).toHaveText(BRANCHES);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
  }

  await chooseBranch(page, testInfo, 'Kumasi');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Profile saved' })).toBeVisible();
  await expect(save).toBeDisabled();
  expect((await getProfile(learner.id))?.branch_id).toBeTruthy();

  await page.reload();
  await expectBranchShown(page, testInfo, 'Kumasi');

  // Changing it is saved the same way.
  await chooseBranch(page, testInfo, 'Amanfrom');
  await save.click();
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Profile saved' })).toHaveCount(1);
  await page.reload();
  await expectBranchShown(page, testInfo, 'Amanfrom');

  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The field fits at 320 px, where it becomes the phone's own picker.
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(field.locator('option:checked')).toHaveText('Amanfrom');
  const box = await field.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 320).toBe(true);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
