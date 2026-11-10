import { expect as baseExpect, test } from '@playwright/test';
import { dismissToasts, expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createAccount } from './support/accounts.js';
import { createAssignmentFixture } from './support/assignments.js';
import { createCourseFixture, enrolFixture } from './support/courses.js';
import { gradeFixture, releaseFixture, sendAnswerFixture } from './support/grading.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn, signInNewAdmin } from './support/ui.js';

// Phase 10 end to end (D11 to D15, D30; owner request of 2026-11-10: each course has its own gradebook,
// and a learner sees one course's grades apart from another's; owner decisions 1 to 4). On every device
// project, light and dark:
// - The lecturer opens a course's gradebook from Gradebooks: every learner with each state in words
//   (Draft, Ungraded, Missing, Not yet due), reviews every draft grade of the course and releases them
//   all at once; the overall grades follow. Analytics shows the class figures and a chart whose bars
//   are exactly the released results. Export downloads an Excel file. The weights are then locked.
// - A learner in two courses sees each course's grades on their own page.
// - An administrator changes locked weights only with a reason, after previewing the effect.

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 180_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);
const in7days = () => new Date(Date.now() + 7 * 86_400_000).toISOString();
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString();

/** @param {import('@playwright/test').Page} page @param {string | RegExp} text */
function toast(page, text) {
  return page.locator('[data-toast-id]').filter({ hasText: text }).first();
}

/** The visible gradebook row (matrix) or card (phones) of a learner. @param {import('@playwright/test').Page} page @param {string} name */
function learnerEntry(page, name) {
  return page.locator('[data-slot="gradebook-row"], [data-slot="gradebook-card"]').filter({ hasText: name }).filter({ visible: true });
}

test('a lecturer reviews and releases every draft grade of a course from its own gradebook; analytics and export follow', async ({ browser }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const abena = await createAccount({ first: 'Abena', second: `Frimpong${tag}` });
  const yaw = await createAccount({ first: 'Yaw', second: `Darko${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Biblical Studies ${tag}` });
  for (const l of [kwame, abena, yaw]) await enrolFixture(course.id, l.id, lecturer.id);
  const essay = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Covenant essay', dueAt: in7days() });
  const journal = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Prayer journal', dueAt: yesterday(), allowLate: true });
  await sendAnswerFixture(kwame, essay.id);
  await sendAnswerFixture(kwame, journal.id);
  await sendAnswerFixture(abena, essay.id);
  await sendAnswerFixture(abena, journal.id);
  await gradeFixture(lecturer, essay.id, kwame.id, 15);
  await gradeFixture(lecturer, essay.id, abena.id, 12);
  await gradeFixture(lecturer, journal.id, kwame.id, 18);
  // Abena's journal stays ungraded; Yaw sent nothing (journal Missing, essay not yet due).

  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await signIn(page, lecturer.email, lecturer.password);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  await page.goto('/lecturer/gradebooks');
  await expect(page.getByRole('heading', { name: 'Gradebooks' })).toBeVisible();
  await page.getByRole('link', { name: `Open the gradebook of Biblical Studies ${tag}` }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lecturer/courses/${course.id}/gradebook$`));

  // Every state in words, for the right learner.
  await expect(learnerEntry(page, `Kwame Mensah${tag}`)).toBeVisible();
  const yawEntry = learnerEntry(page, `Yaw Darko${tag}`);
  const abenaEntry = learnerEntry(page, `Abena Frimpong${tag}`);
  if (await page.locator('[data-slot="gradebook-card"]').filter({ visible: true }).count()) {
    for (const entry of [yawEntry, abenaEntry]) await entry.getByText(/^Assignments \(/).click();
  }
  await expect(yawEntry.getByText('Missing')).toBeVisible();
  await expect(yawEntry.getByText('Not yet due')).toBeVisible();
  await expect(abenaEntry.getByText('Ungraded')).toBeVisible();
  await expect(abenaEntry.getByText('12 / 20')).toBeVisible();
  await expect(abenaEntry.getByText('Draft')).toBeVisible();
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Review and release every draft grade at once (owner decision 1).
  await dismissToasts(page);
  await page.getByRole('button', { name: 'Review and release (3)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review and release grades' });
  await expect(dialog.getByRole('heading', { name: 'Covenant essay (2)' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Prayer journal (1)' })).toBeVisible();
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Release all (3)' }).click();
  await expect(toast(page, 'Grades released to 2 learners')).toBeVisible();
  // The overall grades follow (D13, from calculate_course_grades): Kwame (15 + 18) / 40 = 82.5%, A.
  await expect(learnerEntry(page, `Kwame Mensah${tag}`).getByText('82.5% · A')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review and release' })).toBeDisabled();

  // Analytics: the essay's figures and a chart whose bars are the released results (75% and 60%).
  await page.getByRole('tab', { name: 'Analytics' }).click();
  const essayCard = page.locator('[data-slot="assignment-analytics"]').filter({ hasText: 'Covenant essay' });
  await expect(essayCard.getByTestId('stat-graded')).toHaveText('2');
  await expect(essayCard.getByTestId('stat-class-average')).toHaveText('67.5%');
  await expect(essayCard.locator('[data-band="70-79%"]')).toHaveAttribute('data-count', '1');
  await expect(essayCard.locator('[data-band="60-69%"]')).toHaveAttribute('data-count', '1');
  await expect(essayCard.locator('[data-band="90-100%"]')).toHaveAttribute('data-count', '0');
  await expect(essayCard.getByText(/2 graded, 0 ungraded, 0 missing/)).toBeVisible();
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Export the gradebook as Excel.
  await page.getByRole('tab', { name: 'Gradebook' }).click();
  await dismissToasts(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export grades' });
  await expect(exportDialog.getByLabel('Excel (.xlsx)')).toBeChecked();
  const [download] = await Promise.all([page.waitForEvent('download'), exportDialog.getByRole('button', { name: 'Export' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^gradebook-.+\.xlsx$/);
  await expect(toast(page, 'Export ready')).toBeVisible();

  // After the first release the weights are locked for lecturers (owner decision 4).
  await page.getByRole('tab', { name: 'Assignments' }).click();
  const categories = page.locator('[aria-labelledby="categories-title"]');
  await expect(categories.getByText('Locked', { exact: true })).toBeVisible();
  await expect(categories.getByText(/An administrator can change them/)).toBeVisible();
  await expect(categories.getByRole('button', { name: 'Edit categories' })).toHaveCount(0);
});

test("a learner sees each course's grades on that course's own page", async ({ browser }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const bible = await createCourseFixture({ ownerId: lecturer.id, title: `Biblical Studies ${tag}` });
  const prayer = await createCourseFixture({ ownerId: lecturer.id, title: `Prayer and Worship ${tag}` });
  for (const c of [bible, prayer]) await enrolFixture(c.id, kwame.id, lecturer.id);
  const essay = await createAssignmentFixture({ courseId: bible.id, ownerId: lecturer.id, title: 'Covenant essay', dueAt: in7days() });
  const psalm = await createAssignmentFixture({ courseId: prayer.id, ownerId: lecturer.id, title: 'Psalm reflection', dueAt: in7days() });
  await sendAnswerFixture(kwame, essay.id);
  await sendAnswerFixture(kwame, psalm.id);
  await gradeFixture(lecturer, essay.id, kwame.id, 15, 'A careful reading of the covenant.');
  await gradeFixture(lecturer, psalm.id, kwame.id, 19, 'A heartfelt reflection.');
  await releaseFixture(lecturer, essay.id, kwame.id);
  await releaseFixture(lecturer, psalm.id, kwame.id);

  const page = await (await browser.newContext()).newPage();
  await signIn(page, kwame.email, kwame.password);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await page.goto('/learner/grades');
  const bibleCard = page.locator('[data-slot="course-grade-card"]').filter({ hasText: `Biblical Studies ${tag}` });
  const prayerCard = page.locator('[data-slot="course-grade-card"]').filter({ hasText: `Prayer and Worship ${tag}` });
  await expect(bibleCard.getByText('75% · B')).toBeVisible();
  await expect(prayerCard.getByText('95% · A')).toBeVisible();
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await dismissToasts(page);
  await prayerCard.click();
  await expect(page).toHaveURL(new RegExp(`/learner/courses/${prayer.id}/grades$`));
  await expect(page.getByTestId('course-grade')).toHaveText('95% · A');
  await expect(page.getByRole('link', { name: 'Psalm reflection' }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText('A heartfelt reflection.').filter({ visible: true })).toBeVisible();
  // Nothing of the other course is on this page.
  await expect(page.getByText('Covenant essay')).toHaveCount(0);
  await expect(page.getByText('A careful reading of the covenant.')).toHaveCount(0);
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // From the course page too.
  await page.goto(`/learner/courses/${bible.id}`);
  await dismissToasts(page);
  await page.getByRole('link', { name: 'My grades' }).click();
  await expect(page).toHaveURL(new RegExp(`/learner/courses/${bible.id}/grades$`));
  await expect(page.getByTestId('course-grade')).toHaveText('75% · B');
  await expect(page.getByText('Psalm reflection')).toHaveCount(0);
});

test('an administrator changes locked weights only with a reason, after previewing the effect (owner decision 4)', async ({ browser }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Church History ${tag}` });
  await enrolFixture(course.id, kwame.id, lecturer.id);
  const essay = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Reformation essay', dueAt: in7days() });
  await sendAnswerFixture(kwame, essay.id);
  await gradeFixture(lecturer, essay.id, kwame.id, 15);
  await releaseFixture(lecturer, essay.id, kwame.id);

  const page = await (await browser.newContext()).newPage();
  await signInNewAdmin(page);
  await page.goto('/admin/gradebooks');
  await expect(page.getByRole('heading', { name: 'Gradebook oversight' })).toBeVisible();
  await page.goto(`/admin/courses/${course.id}/assignments`);
  const categories = page.locator('[aria-labelledby="categories-title"]');
  await expect(categories.getByText('Locked', { exact: true })).toBeVisible();
  await dismissToasts(page);
  await categories.getByRole('button', { name: 'Edit categories' }).click();
  const dialog = page.getByRole('dialog', { name: 'Grade categories' });
  await dialog.getByLabel('Category 1').fill('Written work');
  await dialog.getByRole('button', { name: 'Save categories' }).click();
  await expect(dialog.getByText('Give a reason for changing weights after grades were released')).toBeVisible();
  await dialog.getByLabel('Reason').fill('Renaming the category to match the handbook');
  await dialog.getByRole('button', { name: 'Save categories' }).click();
  await expect(dialog.getByText('Preview the effect on overall grades first')).toBeVisible();
  await dialog.getByRole('button', { name: 'Preview the effect' }).click();
  await expect(dialog.getByText("No learner's overall grade would change.")).toBeVisible();
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Save categories' }).click();
  await expect(toast(page, 'Categories saved')).toBeVisible();
  await expect(categories.getByText('Written work')).toBeVisible();
});
