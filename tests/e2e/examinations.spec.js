import { expect as baseExpect, test } from '@playwright/test';
import { dismissToasts, expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createAccount, setBranch } from './support/accounts.js';
import { createAssignmentFixture } from './support/assignments.js';
import { createCourseFixture, enrolFixture } from './support/courses.js';
import { createExamFixture } from './support/exams.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn } from './support/ui.js';

// Phase 10.1 end to end (ADR-016; owner request and answers of 2026-11-10). On every device project,
// light and dark:
// - a lecturer sets an examination in the editor (a multiple-choice and an essay question) and publishes it;
// - a learner sees its deadline on the dashboard (no countdown), starts it, has answers saved
//   automatically, submits after a confirmation; the lecturer marks the essay on the script and releases
//   the result; the learner sees the result and feedback;
// - a lecturer types the practical marks for every learner, grouped by branch, and releases them.

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 240_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);
/** A datetime-local value in Ghana time (GMT) some hours from now. @param {number} hours */
const ghanaInput = (hours) => new Date(Date.now() + hours * 3600000).toISOString().slice(0, 16);

/** @param {import('@playwright/test').Page} page @param {string | RegExp} text */
function toast(page, text) {
  return page.locator('[data-toast-id]').filter({ hasText: text }).first();
}

test('a lecturer sets an examination with multiple-choice and essay questions and publishes it', async ({ page }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Biblical Studies ${tag}` });
  await signIn(page, lecturer.email, lecturer.password);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  await page.goto(`/lecturer/courses/${course.id}/examinations`);
  await dismissToasts(page);
  await page.getByRole('link', { name: 'New examination' }).click();
  await page.getByLabel('Title').fill('Final examination');
  await page.getByLabel('Instructions for learners').fill('Answer every question.');
  await page.getByLabel('Opens').fill(ghanaInput(-1));
  await page.getByLabel('Closes (deadline)').fill(ghanaInput(48));
  await page.getByRole('button', { name: 'Create examination' }).click();
  await expect(toast(page, 'Examination saved')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/lecturer/courses/${course.id}/exams/[0-9a-f-]{36}$`));
  await dismissToasts(page);

  await page.getByRole('button', { name: 'Add multiple choice' }).click();
  const mcq = page.locator('[data-slot="exam-question"]').nth(0);
  await mcq.getByRole('textbox', { name: 'Question' }).fill('Who led Israel out of Egypt?');
  for (const [o, v] of [['A', 'Aaron'], ['B', 'Moses'], ['C', 'Joshua'], ['D', 'Samuel']]) await mcq.getByLabel(o, { exact: true }).fill(v);
  await mcq.getByRole('radio', { name: 'Option B is correct' }).check();
  await mcq.getByLabel('Marks').fill('2');
  await page.getByRole('button', { name: 'Add essay' }).click();
  const essay = page.locator('[data-slot="exam-question"]').nth(1);
  await essay.getByRole('textbox', { name: 'Question' }).fill('Discuss the covenant in Genesis.');
  await essay.getByLabel('Marks').fill('8');
  await expect(page.getByText('Total 10 marks')).toBeVisible();
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Save questions' }).click();
  await expect(toast(page, 'Examination saved')).toBeVisible();
  await dismissToasts(page);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(toast(page, 'Examination published')).toBeVisible();
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('dialog', { name: 'Preview: Final examination' }).getByText('B. Moses')).toBeVisible();
});

test('a learner takes an examination at their own pace; the lecturer marks and releases; the learner sees the result', async ({ browser }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Biblical Studies ${tag}` });
  await enrolFixture(course.id, kwame.id, lecturer.id);
  const examId = await createExamFixture(lecturer, course.id, `Final examination ${tag}`);

  const learner = await (await browser.newContext()).newPage();
  await signIn(learner, kwame.email, kwame.password);
  await expect(learner).toHaveURL(/\/learner\/dashboard$/);
  const deadlines = learner.locator('[data-slot="exam-deadlines"]');
  await expect(deadlines.getByText(`Final examination ${tag}`)).toBeVisible();
  await expect(deadlines.getByText(/^Submit by .+ \(Ghana time\)$/)).toBeVisible();
  await dismissToasts(learner);
  await deadlines.getByRole('link', { name: new RegExp(`Final examination ${tag}`) }).click();
  await expect(learner).toHaveURL(new RegExp(`/learner/courses/${course.id}/exams/${examId}$`));
  await expect(learner.getByText('There is no time limit. Work at your own pace and submit before the deadline.')).toBeVisible();
  await expect(learner.locator('body')).not.toContainText(/time (left|remaining)|countdown/i);
  await learner.getByRole('button', { name: 'Start examination' }).click();
  await learner.getByLabel('B. Moses').check();
  await expect(learner.getByTestId('save-state')).toHaveText(/^All answers saved/);
  await learner.getByRole('tab', { name: 'Section B: Essay' }).click();
  await learner.getByLabel('Your essay').fill('Covenant runs through Genesis: Abraham, the land and the blessing.');
  await expect(learner.getByTestId('save-state')).toHaveText(/^All answers saved/);
  await expectNoAxeViolations(learner);
  expect(await horizontalOverflow(learner)).toBeLessThanOrEqual(0);
  await dismissToasts(learner);
  await learner.getByRole('button', { name: 'Review and submit' }).click();
  const confirm = learner.getByRole('alertdialog', { name: 'Submit your examination?' });
  await expect(confirm.getByText('You have answered 2 of 2 questions. Once you submit, you cannot change your answers.')).toBeVisible();
  await confirm.getByRole('button', { name: 'Submit examination' }).click();
  await expect(toast(learner, 'Examination submitted')).toBeVisible();
  await expect(learner.getByText(/^Submitted .+ \(Ghana time\)\. Your result appears here/)).toBeVisible();

  const staff = await (await browser.newContext()).newPage();
  await signIn(staff, lecturer.email, lecturer.password);
  await expect(staff).toHaveURL(/\/lecturer\/dashboard$/);
  await expect(staff.locator('[data-slot="exam-marking"]').getByText('1 to mark')).toBeVisible();
  await staff.goto(`/lecturer/courses/${course.id}/exams/${examId}/results`);
  await dismissToasts(staff);
  await staff.getByRole('link', { name: `Mark the script of Kwame Mensah${tag}` }).filter({ visible: true }).click();
  const essay = staff.locator('[data-slot="script-question"][data-kind="ESSAY"]');
  await expect(essay.getByText('Covenant runs through Genesis: Abraham, the land and the blessing.')).toBeVisible();
  await essay.getByLabel('Mark out of 8').fill('6');
  await essay.getByLabel('Feedback (optional)').fill('Good use of Genesis 15.');
  await essay.getByRole('button', { name: 'Save mark' }).click();
  await expect(staff.getByTestId('script-total')).toHaveText('8 / 10 · 80% · Pass');
  await dismissToasts(staff);
  await staff.getByRole('button', { name: 'Release result' }).click();
  await expect(toast(staff, 'Grades released to 1 learner')).toBeVisible();
  await expectNoAxeViolations(staff);
  expect(await horizontalOverflow(staff)).toBeLessThanOrEqual(0);

  await learner.reload();
  await expect(learner.getByTestId('exam-result')).toHaveText(/^8 \/ 10 · 80%/);
  await expect(learner.getByText('Feedback: Good use of Genesis 15.')).toBeVisible();
});

test("a lecturer types every learner's practical marks, grouped by branch, and releases them", async ({ browser }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const abena = await createAccount({ first: 'Abena', second: `Frimpong${tag}` });
  await setBranch(kwame.id, 'Sampa');
  await setBranch(abena.id, 'Kasoa C.P');
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Church History ${tag}` });
  for (const l of [kwame, abena]) await enrolFixture(course.id, l.id, lecturer.id);
  const practical = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Leading a prayer meeting', dueAt: new Date(Date.now() - 86400000).toISOString(), part: 'PRACTICALS', maxMarks: 30 });

  const page = await (await browser.newContext()).newPage();
  await signIn(page, lecturer.email, lecturer.password);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  await page.goto(`/lecturer/courses/${course.id}/assignments/${practical.id}/submissions`);
  await expect(page.getByRole('heading', { name: 'Marks: Leading a prayer meeting' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Kasoa C.P, 1 learner' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sampa, 1 learner' })).toBeVisible();
  await page.getByRole('region', { name: 'Kasoa C.P, 1 learner' }).getByLabel('Mark out of 30').fill('18');
  await page.getByRole('region', { name: 'Sampa, 1 learner' }).getByLabel('Mark out of 30').fill('25');
  await page.getByRole('region', { name: 'Sampa, 1 learner' }).getByLabel('Comment (optional)').fill('Led with confidence.');
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await dismissToasts(page);
  await page.getByRole('button', { name: 'Save marks (2)' }).click();
  await expect(toast(page, 'Grade saved as draft')).toBeVisible();
  await expect(page.getByTestId('mark-sheet-summary')).toHaveText('2 of 2 marked · 2 not released');
  await dismissToasts(page);
  await page.getByRole('button', { name: 'Release marks (2)' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Release grades' }).click();
  await expect(toast(page, 'Grades released to 2 learners')).toBeVisible();

  const learner = await (await browser.newContext()).newPage();
  await signIn(learner, kwame.email, kwame.password);
  await expect(learner).toHaveURL(/\/learner\/dashboard$/);
  await learner.goto(`/learner/courses/${course.id}/grades`);
  await expect(learner.getByTestId('course-grade')).toHaveText('83.3% · A');
});
