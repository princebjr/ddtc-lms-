import { expect as baseExpect, test } from '@playwright/test';
import { expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createAccount, getProfile } from './support/accounts.js';
import { createCourseFixture, enrolFixture } from './support/courses.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn, signInNewAdmin } from './support/ui.js';

// Step 6.1 end to end (ADR-008, owner decision 2026-11-06): every account has a six-digit ID number.
// A learner sees their own on the profile; an administrator finds them by it and sees it in the
// user panel; the lecturer of the learner's course sees it on the Learners tab. The numbering and
// who may see it are proven in pgTAP (12_account_id_numbers).

const expect = baseExpect.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 120_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);

test('a learner sees their ID number on the profile; an administrator finds them by it; their lecturer sees it on the Learners tab', async ({ page, browser }) => {
  const surname = `Mensah${unique()}`;
  const learner = await createAccount({ first: 'Kwame', second: surname });
  const { id_number: idNumber } = await getProfile(learner.id);
  expect(String(idNumber)).toMatch(/^[1-9]\d{5}$/);

  // The learner's own profile.
  await signIn(page, learner.email, learner.password);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await page.goto('/learner/profile');
  const card = page.getByRole('region', { name: 'ID number' });
  await expect(card.getByTestId('id-number')).toHaveText(String(idNumber));
  await expect(card.getByRole('button', { name: 'Copy ID number' })).toBeVisible();
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // An administrator searches by the number and sees it in the user panel.
  const adminPage = await (await browser.newContext()).newPage();
  await signInNewAdmin(adminPage, { first: 'Grace', second: `Admin${unique()}` });
  await adminPage.goto('/admin/users');
  await adminPage.getByLabel('Search').fill(String(idNumber));
  const manage = adminPage.getByRole('button', { name: `Manage Kwame ${surname}` });
  await expect(manage).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^Manage / })).toHaveCount(1);
  // The list draws phone cards and the desktop table and shows one of them: look at what is visible.
  await expect(adminPage.getByText(String(idNumber)).filter({ visible: true }).first()).toBeVisible();
  await manage.click();
  await expect(adminPage.getByRole('dialog').getByText(`ID number ${idNumber}`)).toBeVisible();
  await adminPage.context().close();

  // The lecturer of the learner's course sees it on the Learners tab.
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${unique()}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Church History ${unique()}` });
  await enrolFixture(course.id, learner.id, lecturer.id);
  const lecturerPage = await (await browser.newContext()).newPage();
  await signIn(lecturerPage, lecturer.email, lecturer.password);
  await expect(lecturerPage).toHaveURL(/\/lecturer\/dashboard$/);
  await lecturerPage.goto(`/lecturer/courses/${course.id}/learners`);
  await expect(lecturerPage.getByText(`Kwame ${surname}`).filter({ visible: true }).first()).toBeVisible();
  await expect(lecturerPage.getByText(String(idNumber)).filter({ visible: true }).first()).toBeVisible();
  await expectNoAxeViolations(lecturerPage);
  await lecturerPage.context().close();
});
