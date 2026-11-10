import { expect as baseExpect, test } from '@playwright/test';
import { dismissToasts, expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createAccount } from './support/accounts.js';
import { createAssignmentFixture } from './support/assignments.js';
import { createCourseFixture, enrolFixture } from './support/courses.js';
import { gradeFixture, releaseFixture, sendAnswerFixture } from './support/grading.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn } from './support/ui.js';

// Phase 9 end to end (D14 to D16, D30, D42; owner decisions of 2026-11-09). On every device project,
// light and dark:
// - The lecturer sees the results with counts that add up (a learner who sent nothing is Missing after
//   the due date).
// - The lecturer grades on the grading screen: marks and feedback, percentage, letter grade and band
//   from the database. On phones the Save and Release bar sticks; from tablet width there are two panes.
// - The lecturer releases the grade, and the learner gets "New grade available" and sees the grade.
// - A released grade changes only with a reason, and the learner keeps the released grade until the
//   change is released ("Updated").
// - Releasing a whole assignment asks first.
// - Reopening needs a reason, and the learner may then send again before the due date.
// - Step 9.1: the lecturer's To grade (from the dashboard tile) lists the answers waiting and opens the
//   grading screen; the learner's Grades and feedback lists their courses, and each course's own
//   gradebook (Phase 10, owner request 2026-11-10) shows the released grade and what awaits a grade.

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

/** @param {import('@playwright/test').Page} page @param {string} label */
const count = (page, label) => page.getByTestId(`count-${label}`);

test('a lecturer grades, releases and changes a grade; the learner is told and sees it; the counts add up', async ({ browser }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const abena = await createAccount({ first: 'Abena', second: `Frimpong${tag}` });
  const esi = await createAccount({ first: 'Esi', second: `Owusu${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Biblical Studies ${tag}` });
  for (const l of [kwame, abena, esi]) await enrolFixture(course.id, l.id, lecturer.id);
  // Past due with late answers allowed: Kwame and Abena answer late, Esi sends nothing (Missing).
  const assignment = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Reflection on Genesis 1', dueAt: yesterday(), allowLate: true });
  await sendAnswerFixture(kwame, assignment.id);
  await sendAnswerFixture(abena, assignment.id);

  const lecturerPage = await (await browser.newContext()).newPage();
  await signIn(lecturerPage, lecturer.email, lecturer.password);
  await expect(lecturerPage).toHaveURL(/\/lecturer\/dashboard$/);
  const results = `/lecturer/courses/${course.id}/assignments/${assignment.id}/submissions`;
  await lecturerPage.goto(results);
  await expect(lecturerPage.getByRole('heading', { name: 'Submissions: Reflection on Genesis 1' })).toBeVisible();
  // Enrolled 3 = submitted 2 + not yet due 0 + missing 1; submitted 2 = graded 0 + ungraded 2.
  await expect(count(lecturerPage, 'enrolled')).toHaveText('3');
  await expect(count(lecturerPage, 'submitted')).toHaveText('2');
  await expect(count(lecturerPage, 'graded')).toHaveText('0');
  await expect(count(lecturerPage, 'ungraded')).toHaveText('2');
  await expect(count(lecturerPage, 'missing')).toHaveText('1');
  await expect(count(lecturerPage, 'not-yet-due')).toHaveText('0');
  // The row's chip (the tile above also says Missing).
  await expect(lecturerPage.locator('[data-slot="status-chip"]').filter({ hasText: /^Missing$/ }).filter({ visible: true })).toHaveCount(1);
  await expectNoAxeViolations(lecturerPage);
  expect(await horizontalOverflow(lecturerPage)).toBeLessThanOrEqual(0);

  // The grading screen: grade Kwame, save a draft, release (Grade opens an answer waiting to be graded).
  await lecturerPage
    .getByRole('link', { name: `Grade answer from Kwame Mensah${tag}` })
    .filter({ visible: true })
    .click();
  await expect(lecturerPage.getByRole('heading', { name: `Kwame Mensah${tag}` })).toBeVisible();
  const bar = lecturerPage.locator('[data-slot="grading-actions"]');
  const width = lecturerPage.viewportSize()?.width ?? 1280;
  // Phones: the Save and Release bar sticks above the navigation; from tablet width the panel stays in view instead.
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe(width < 768 ? 'sticky' : 'static');
  await lecturerPage.getByLabel('Marks').fill('15.5');
  await lecturerPage.getByLabel('Feedback (optional)').fill('Good reading of the text. Develop the section on purpose.');
  await lecturerPage.getByRole('button', { name: 'Save draft' }).click();
  await expect(toast(lecturerPage, 'Grade saved as draft')).toBeVisible();
  await expect(lecturerPage.getByTestId('grade-facts')).toHaveText('Saved: 15.5 / 20 · 77.5% · B · band 70-79%');
  await expect(lecturerPage.getByText('Draft grade')).toBeVisible();
  await expectNoAxeViolations(lecturerPage);
  expect(await horizontalOverflow(lecturerPage)).toBeLessThanOrEqual(0);
  await dismissToasts(lecturerPage);
  await lecturerPage.getByRole('button', { name: 'Release grade' }).click();
  await expect(toast(lecturerPage, 'Grades released to 1 learner')).toBeVisible();
  await expect(lecturerPage.locator('[data-slot="grading-panel"]').getByText('Released', { exact: true })).toBeVisible();

  // The learner is told on their next page and sees the grade.
  const kwamePage = await (await browser.newContext()).newPage();
  await signIn(kwamePage, kwame.email, kwame.password);
  await expect(kwamePage).toHaveURL(/\/learner\/dashboard$/);
  await expect(toast(kwamePage, 'New grade available')).toBeVisible();
  await toast(kwamePage, 'New grade available').getByRole('button', { name: 'View' }).click();
  await expect(kwamePage).toHaveURL(new RegExp(`/learner/courses/${course.id}/assignments/${assignment.id}$`));
  const card = kwamePage.locator('[data-slot="learner-grade"]');
  await expect(card.getByText('15.5 / 20')).toBeVisible();
  await expect(card.getByText('77.5%')).toBeVisible();
  await expect(card.getByText('Grade B')).toHaveCount(0); // no letter on one piece of work (Step 10.2)
  await expect(card.getByText('Good reading of the text. Develop the section on purpose.')).toBeVisible();
  await expectNoAxeViolations(kwamePage);
  expect(await horizontalOverflow(kwamePage)).toBeLessThanOrEqual(0);

  // A released grade changes only with a reason; the learner keeps the released one until it is released again.
  await dismissToasts(lecturerPage);
  await lecturerPage.getByLabel('Marks').fill('17');
  await lecturerPage.getByRole('button', { name: 'Save draft' }).click();
  await expect(lecturerPage.getByText('Give a reason for changing a released grade')).toBeVisible();
  await lecturerPage.getByLabel('Reason for the change').fill('Marked the second part again');
  await lecturerPage.getByRole('button', { name: 'Save draft' }).click();
  await expect(toast(lecturerPage, 'Grade saved as draft')).toBeVisible();
  await expect(lecturerPage.getByText('Changed, not released')).toBeVisible();
  await kwamePage.reload();
  await expect(card.getByText('15.5 / 20')).toBeVisible();
  await dismissToasts(lecturerPage);
  await lecturerPage.getByRole('button', { name: 'Release grade' }).click();
  await expect(toast(lecturerPage, 'Grades released to 1 learner')).toBeVisible();
  await kwamePage.reload();
  await expect(card.getByText('17 / 20')).toBeVisible();
  await expect(card.getByText('Updated')).toBeVisible();
  // The history keeps every step with the reason (close the toasts first: on a phone they sit over it).
  await dismissToasts(lecturerPage);
  await lecturerPage.getByText(/^Grade history: \d+ entries$/).click();
  await expect(lecturerPage.getByText('Changed 15.5 to 17')).toBeVisible();
  await expect(lecturerPage.getByText('Reason: Marked the second part again')).toBeVisible();

  // Back on the results: graded 1 (released), ungraded 1, still adding up.
  await lecturerPage.goto(results);
  await expect(count(lecturerPage, 'graded')).toHaveText('1');
  await expect(lecturerPage.getByText('1 released')).toBeVisible();
  await expect(count(lecturerPage, 'ungraded')).toHaveText('1');
  await expect(count(lecturerPage, 'missing')).toHaveText('1');
});

test('releasing a whole assignment asks first; reopening needs a reason and the learner may send again before the due date', async ({ browser }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const abena = await createAccount({ first: 'Abena', second: `Frimpong${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Discipleship ${tag}` });
  for (const l of [kwame, abena]) await enrolFixture(course.id, l.id, lecturer.id);
  const assignment = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Psalm study', dueAt: in7days() });
  await sendAnswerFixture(kwame, assignment.id);
  await sendAnswerFixture(abena, assignment.id);
  await gradeFixture(lecturer, assignment.id, kwame.id, 14, 'Clear and careful.');
  await gradeFixture(lecturer, assignment.id, abena.id, 18);

  const lecturerPage = await (await browser.newContext()).newPage();
  await signIn(lecturerPage, lecturer.email, lecturer.password);
  await expect(lecturerPage).toHaveURL(/\/lecturer\/dashboard$/);
  await lecturerPage.goto(`/lecturer/courses/${course.id}/assignments/${assignment.id}/submissions`);
  await lecturerPage.getByRole('button', { name: 'Release grades (2)' }).click();
  const confirm = lecturerPage.getByRole('alertdialog', { name: 'Release 2 grades?' });
  await expect(confirm).toBeVisible();
  await expectNoAxeViolations(lecturerPage);
  await confirm.getByRole('button', { name: 'Release grades' }).click();
  await expect(toast(lecturerPage, 'Grades released to 2 learners')).toBeVisible();
  await expect(count(lecturerPage, 'graded')).toHaveText('2');
  await expect(lecturerPage.getByText('2 released')).toBeVisible();
  await expect(lecturerPage.getByRole('button', { name: /^Release grades/ })).toHaveCount(0);

  // Reopen Kwame's answer: a reason is required and kept.
  await lecturerPage
    .getByRole('link', { name: `View answer from Kwame Mensah${tag}` })
    .filter({ visible: true })
    .click();
  await dismissToasts(lecturerPage);
  await lecturerPage.getByRole('button', { name: 'Reopen grade' }).click();
  const dialog = lecturerPage.getByRole('dialog', { name: `Reopen grade for Kwame Mensah${tag}` });
  await dialog.getByRole('button', { name: 'Reopen grade' }).click();
  await expect(dialog.getByText('Give a reason for reopening')).toBeVisible();
  await dialog.getByLabel('Reason').fill('The recording did not play');
  await dialog.getByRole('button', { name: 'Reopen grade' }).click();
  await expect(toast(lecturerPage, 'Submission reopened')).toBeVisible();
  await expect(lecturerPage.locator('[data-slot="grading-panel"]').getByText('Reopened', { exact: true })).toBeVisible();

  // Kwame still sees his released grade and, before the due date, may send the answer again.
  const kwamePage = await (await browser.newContext()).newPage();
  await signIn(kwamePage, kwame.email, kwame.password);
  await expect(kwamePage).toHaveURL(/\/learner\/dashboard$/);
  await kwamePage.goto(`/learner/courses/${course.id}/assignments/${assignment.id}`);
  await expect(kwamePage.locator('[data-slot="learner-grade"]').getByText('14 / 20')).toBeVisible();
  await dismissToasts(kwamePage);
  await kwamePage.getByLabel('Text answer').fill('Here is my answer again, with the recording described in words.');
  await kwamePage.getByRole('button', { name: 'Submit again' }).click();
  await expect(toast(kwamePage, 'Resubmitted as version 2')).toBeVisible();
});

test("To grade lists the answers waiting and opens the grading screen; the learner's Grades and feedback shows released and awaiting answers (Step 9.1)", async ({
  browser,
}) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const abena = await createAccount({ first: 'Abena', second: `Frimpong${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Church History ${tag}` });
  for (const l of [kwame, abena]) await enrolFixture(course.id, l.id, lecturer.id);
  const essay = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Reformation essay', dueAt: in7days() });
  const journal = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Prayer journal', dueAt: in7days() });
  // Kwame: essay graded 15 and released; journal sent, waiting. Abena: essay sent, waiting.
  await sendAnswerFixture(kwame, essay.id);
  await sendAnswerFixture(kwame, journal.id);
  await sendAnswerFixture(abena, essay.id);
  await gradeFixture(lecturer, essay.id, kwame.id, 15, 'Clear and well organised.');
  await releaseFixture(lecturer, essay.id, kwame.id);

  const lecturerPage = await (await browser.newContext()).newPage();
  await signIn(lecturerPage, lecturer.email, lecturer.password);
  await expect(lecturerPage).toHaveURL(/\/lecturer\/dashboard$/);
  await expect(lecturerPage.getByTestId('to-grade-count')).toHaveText('2');
  await lecturerPage.getByTestId('to-grade-count').click();
  await expect(lecturerPage).toHaveURL(/\/lecturer\/to-grade$/);
  await expect(lecturerPage.getByTestId('to-grade-summary')).toHaveText('2 answers waiting in 2 assignments');
  await expectNoAxeViolations(lecturerPage);
  expect(await horizontalOverflow(lecturerPage)).toBeLessThanOrEqual(0);
  await lecturerPage
    .getByRole('link', { name: `Grade answer from Abena Frimpong${tag}` })
    .filter({ visible: true })
    .click();
  await expect(lecturerPage.getByRole('heading', { name: `Abena Frimpong${tag}` })).toBeVisible();
  await expect(lecturerPage.locator('[data-slot="grading-panel"]')).toBeVisible();

  const kwamePage = await (await browser.newContext()).newPage();
  await signIn(kwamePage, kwame.email, kwame.password);
  await expect(kwamePage).toHaveURL(/\/learner\/dashboard$/);
  // Since Phase 10 (owner request 2026-11-10) Grades and feedback lists the courses, each opening its own
  // gradebook; the released grade and what awaits a grade are on the course's page.
  await kwamePage.goto('/learner/grades');
  await expect(kwamePage.getByRole('heading', { name: 'Grades and feedback' })).toBeVisible();
  const courseCard = kwamePage.locator('[data-slot="course-grade-card"]').filter({ hasText: `Church History ${tag}` });
  await expect(courseCard.getByText('75% · B')).toBeVisible();
  await expect(courseCard.getByText('Provisional')).toBeVisible();
  await expectNoAxeViolations(kwamePage);
  expect(await horizontalOverflow(kwamePage)).toBeLessThanOrEqual(0);
  await dismissToasts(kwamePage);
  await courseCard.click();
  await expect(kwamePage).toHaveURL(new RegExp(`/learner/courses/${course.id}/grades$`));
  await expect(kwamePage.getByTestId('course-grade')).toHaveText('75% · B');
  const essayRow = kwamePage.getByRole('listitem').filter({ hasText: 'Reformation essay' }).filter({ visible: true });
  const essayCells = kwamePage.getByRole('row').filter({ hasText: 'Reformation essay' }).filter({ visible: true });
  const essay$ = (await essayRow.count()) ? essayRow : essayCells;
  await expect(essay$.getByText('15 / 20')).toBeVisible();
  await expect(essay$.getByText('Graded', { exact: true })).toBeVisible(); // the letter is on the course grade (Step 10.2)
  await expect(essay$.getByText('Clear and well organised.')).toBeVisible();
  const journal$ = kwamePage.getByRole((await essayRow.count()) ? 'listitem' : 'row').filter({ hasText: 'Prayer journal' }).filter({ visible: true });
  await expect(journal$.getByText('Awaiting grade')).toBeVisible();
  await expectNoAxeViolations(kwamePage);
  expect(await horizontalOverflow(kwamePage)).toBeLessThanOrEqual(0);
  // Assignments > Submitted says Graded with the released score; an answer not yet released still awaits.
  await kwamePage.goto('/learner/assignments');
  await kwamePage.getByRole('tab', { name: /^Submitted/ }).click();
  await expect(kwamePage.getByRole('link', { name: /Reformation essay/ }).getByText('Graded · 15 / 20', { exact: true })).toBeVisible();
  await expect(kwamePage.getByRole('link', { name: /Prayer journal/ }).getByText(/^Awaiting grade/)).toBeVisible();
  await kwamePage.goto(`/learner/courses/${course.id}/grades`);
  await dismissToasts(kwamePage);
  await kwamePage.getByRole('link', { name: 'Reformation essay' }).filter({ visible: true }).click();
  await expect(kwamePage).toHaveURL(new RegExp(`/learner/courses/${course.id}/assignments/${essay.id}$`));
});
