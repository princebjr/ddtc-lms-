import { expect as baseExpect, test } from '@playwright/test';
import { expectNoAxeViolations, horizontalOverflow, isPhoneProject } from './helpers.js';
import { createAccount, getProfile, setBranch } from './support/accounts.js';
import { createCourseFixture, enrolFixture } from './support/courses.js';
import { requireSupabase } from './support/local-supabase.js';
import { searchList, signIn, signInNewAdmin } from './support/ui.js';

// D42 end to end (owner request 2026-11-07): learner branches. A learner chooses their branch on
// Profile settings (the phone's own picker below 640 px; the drop-down list, by keyboard, from tablet
// width up), saves it with Save changes, and finds it there after reloading. An administrator sees
// learners' branches as chips, filters Learners and Enrolments by branch, and changes a learner's
// branch in the user panel; the lecturer of the learner's course sees the branch on the Learners tab.
// Who may read and change a branch is proven in pgTAP (15_branches).

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
 * @param {import('@playwright/test').Page | import('@playwright/test').Locator} [scope]  where the field is
 */
async function chooseBranch(page, testInfo, name, scope = page) {
  const field = scope.getByLabel('Branch', { exact: true });
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

/**
 * Filters the list by branch (in the Filters sheet on phones when the list has one).
 * @param {import('@playwright/test').Page} page
 * @param {boolean} inSheet
 * @param {string} name  a branch, "No branch" or "Any branch"
 */
async function filterByBranch(page, inSheet, name) {
  if (inSheet) await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByRole('combobox', { name: 'Branch' }).click();
  await page.getByRole('option', { name, exact: true }).click();
  if (inSheet) await page.getByRole('button', { name: 'Show results' }).click();
}

test("an administrator sees learners' branches, filters by branch and changes a learner's branch; their lecturer sees it on the Learners tab", async ({ page, browser }, testInfo) => {
  const tag = unique();
  const phone = isPhoneProject(testInfo);
  const yaw = await createAccount({ first: 'Yaw', second: `Mensah${tag}` });
  const esi = await createAccount({ first: 'Esi', second: `Owusu${tag}` });
  await setBranch(yaw.id, 'Kumasi');
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Church History ${tag}` });
  await enrolFixture(course.id, yaw.id, lecturer.id);
  await enrolFixture(course.id, esi.id, lecturer.id);

  const chips = page.locator('[data-slot="branch-chip"]').filter({ visible: true });
  const manage = page.getByRole('button', { name: /^Manage / });

  // Learner management: the chip, or "No branch", for each learner; then the branch filter.
  await signInNewAdmin(page, { first: 'Grace', second: `Admin${tag}` });
  await page.goto('/admin/learners');
  await page.getByLabel('Search').fill(tag);
  await expect(manage).toHaveCount(2);
  await expect(chips.filter({ hasText: 'Kumasi' })).toHaveCount(1);
  await expect(chips.filter({ hasText: 'No branch' })).toHaveCount(1);
  await expectNoAxeViolations(page);
  await filterByBranch(page, phone, 'Kumasi');
  await expect(manage).toHaveCount(1);
  await expect(page.getByRole('button', { name: `Manage Yaw Mensah${tag}` })).toBeVisible();
  await filterByBranch(page, phone, 'No branch');
  await expect(manage).toHaveCount(1);
  await expect(page.getByRole('button', { name: `Manage Esi Owusu${tag}` })).toBeVisible();

  // Enrolments filter by the learner's branch too (its filters are always on the page).
  await page.goto(`/admin/enrolments?course=${course.id}`);
  const rows = page.getByRole('combobox', { name: /^Status for / });
  await expect(rows).toHaveCount(2);
  await expect(chips.filter({ hasText: 'Kumasi' })).toHaveCount(1);
  await filterByBranch(page, false, 'Kumasi');
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: new RegExp(`^Status for Yaw Mensah${tag}`) })).toBeVisible();
  await filterByBranch(page, false, 'No branch');
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: new RegExp(`^Status for Esi Owusu${tag}`) })).toBeVisible();

  // The user panel: the administrator gives Esi a branch.
  await page.goto('/admin/learners');
  await searchList(page, `Owusu${tag}`);
  await page.getByRole('button', { name: `Manage Esi Owusu${tag}` }).click();
  const panel = page.getByRole('dialog');
  const saveBranch = panel.getByRole('button', { name: 'Save branch' });
  await expect(saveBranch).toBeDisabled();
  await chooseBranch(page, testInfo, 'Sampa', panel);
  await saveBranch.click();
  await expect(page.locator('[data-toast-id]').filter({ hasText: 'Branch updated' })).toBeVisible();
  await expect(saveBranch).toBeDisabled();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(chips.filter({ hasText: 'Sampa' })).toHaveCount(1);
  expect((await getProfile(esi.id))?.branch_id).toBeTruthy();

  // The lecturer sees each learner's branch on the course's Learners tab.
  const lecturerPage = await (await browser.newContext()).newPage();
  await signIn(lecturerPage, lecturer.email, lecturer.password);
  await expect(lecturerPage).toHaveURL(/\/lecturer\/dashboard$/);
  await lecturerPage.goto(`/lecturer/courses/${course.id}/learners`);
  const lecturerChips = lecturerPage.locator('[data-slot="branch-chip"]').filter({ visible: true });
  await expect(lecturerChips.filter({ hasText: 'Kumasi' })).toHaveCount(1);
  await expect(lecturerChips.filter({ hasText: 'Sampa' })).toHaveCount(1);
  await expectNoAxeViolations(lecturerPage);
  expect(await horizontalOverflow(lecturerPage)).toBeLessThanOrEqual(0);
  await lecturerPage.context().close();
});
