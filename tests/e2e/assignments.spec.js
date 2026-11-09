import { expect as baseExpect, test } from '@playwright/test';
import { wav } from '../fixtures/media.js';
import { dismissToasts, expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createAccount } from './support/accounts.js';
import { createAssignmentFixture } from './support/assignments.js';
import { createCourseFixture, enrolFixture } from './support/courses.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn, signInNewAdmin } from './support/ui.js';

// Phase 7 end to end: assignments (D12, D13, D29, ADR-009). A lecturer sets the grade category
// weights, writes a text-and-audio assignment, is told the audio is still needed, uploads it and
// publishes. An enrolled learner sees what is due and what is past due, opens the assignment, plays
// the instruction audio and sees that they may answer by text or audio; a learner who is not
// enrolled cannot open it; an administrator finds it in the oversight list. Access, the instruction
// rules and the weights gate are proven in pgTAP (13_assignments_access, 14_assignment_functions).

const expect = baseExpect.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 150_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);

/** @param {import('@playwright/test').Page} page @param {string | RegExp} text */
function toast(page, text) {
  return page.locator('[data-toast-id]').filter({ hasText: text }).first();
}

test('a lecturer sets the category weights, writes a text-and-audio assignment, adds its audio and publishes it', async ({ page }) => {
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${unique()}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Biblical Studies ${unique()}` });
  await signIn(page, lecturer.email, lecturer.password);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);

  // Grade categories: Assignments 70, Participation 30 (D12).
  await page.goto(`/lecturer/courses/${course.id}/assignments`);
  await expect(page.getByText('Total 100%')).toBeVisible();
  await page.getByRole('button', { name: 'Edit categories' }).click();
  const dialog = page.getByRole('dialog', { name: 'Grade categories' });
  await dialog.getByLabel('Weight %').first().fill('70');
  await expect(dialog.getByRole('status')).toHaveText('Total 70%');
  await dialog.getByRole('button', { name: 'Add category' }).click();
  await dialog.getByLabel('Category 2', { exact: true }).fill('Participation');
  await dialog.getByLabel('Weight %').nth(1).fill('30');
  await expect(dialog.getByRole('status')).toHaveText('Total 100%');
  await dialog.getByRole('button', { name: 'Save categories' }).click();
  await expect(toast(page, 'Categories saved')).toBeVisible();
  await expect(page.getByText('Participation')).toBeVisible();
  await dismissToasts(page);

  // A new assignment: text and audio instructions.
  await page.goto(`/lecturer/courses/${course.id}/assignments/new`);
  await page.getByLabel('Assignment title').fill('Reflection on Genesis 1');
  await page.getByLabel('Text and audio', { exact: true }).check();
  await page.getByRole('textbox', { name: 'Instructions' }).click();
  await page.keyboard.type('Read Genesis 1 and explain what it teaches about God and people.');
  await page.getByLabel('Due date and time').fill('2030-01-20T23:59');
  await page.getByLabel('Maximum marks').fill('20');
  await expect(page.locator('#format-text')).toBeChecked();
  await expect(page.locator('#format-text')).toBeDisabled(); // always accepted (ADR-009)
  await expect(page.locator('#format-audio')).toBeChecked();
  await page.getByRole('button', { name: 'Save assignment' }).click();
  await expect(toast(page, 'Assignment saved')).toBeVisible();
  await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]{36}$/);
  await dismissToasts(page);

  // Publishing needs the audio first; then it publishes.
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Add the instruction audio before publishing')).toBeVisible();
  await page.locator('input[type="file"][accept^=".mp3"]').setInputFiles({ name: 'brief.wav', mimeType: 'audio/wav', buffer: Buffer.from(wav(6)) });
  await expect(toast(page, 'Audio ready')).toBeVisible();
  await dismissToasts(page);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(toast(page, 'Assignment published')).toBeVisible();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.goto(`/lecturer/courses/${course.id}/assignments`);
  await expect(page.getByRole('link', { name: 'Reflection on Genesis 1', exact: true }).filter({ visible: true })).toBeVisible();
  await expectNoAxeViolations(page);
});

test('an enrolled learner sees what is due, opens an assignment and its audio, and may answer by text or audio; others cannot open it', async ({ page, browser }) => {
  const lecturer = await createAccount({ role: 'LECTURER' });
  const learner = await createAccount({ first: 'Kwame', second: `Mensah${unique()}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Discipleship ${unique()}` });
  await enrolFixture(course.id, learner.id, lecturer.id);
  const title = `Prayer journal ${unique()}`;
  const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const open = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title, dueAt: due, contentType: 'TEXT_AND_AUDIO', withAudio: true, formats: ['TEXT', 'AUDIO', 'PDF'] });
  await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: `Closed task ${unique()}`, dueAt: new Date(Date.now() - 86_400_000).toISOString() });

  await signIn(page, learner.email, learner.password);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await page.goto('/learner/assignments');
  const todo = page.getByRole('list', { name: 'Assignments to do' });
  await expect(todo.getByRole('link', { name: new RegExp(title) })).toBeVisible();
  await expect(todo.getByText('Due in 3 days')).toBeVisible();
  await page.getByRole('tab', { name: /Past due/ }).click();
  await expect(page.getByRole('list', { name: 'Assignments past their due date' }).getByText('Overdue')).toBeVisible();
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.goto(`/learner/courses/${course.id}/assignments/${open.id}`);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Read Genesis 1 and reflect.')).toBeVisible();
  await expect(page.getByRole('slider', { name: `Instructions: ${title} position` })).toHaveAttribute('aria-valuemax', '8');
  // Phase 8 replaced the list of ways to answer with the answer form itself (ADR-009).
  await expect(page.getByRole('tab', { name: 'Write' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Record' })).toBeVisible();
  await expect(page.getByText('Text or audio; PDF files too')).toBeVisible();
  await expect(page.locator('[data-slot="audio-player"]')).toHaveAttribute('data-status', 'ready');
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // A learner who is not enrolled cannot open it.
  const stranger = await createAccount();
  const strangerPage = await (await browser.newContext()).newPage();
  await signIn(strangerPage, stranger.email, stranger.password);
  await expect(strangerPage).toHaveURL(/\/learner\/dashboard$/);
  await strangerPage.goto(`/learner/courses/${course.id}/assignments/${open.id}`);
  await expect(strangerPage.getByText('Assignment not found')).toBeVisible();
  await strangerPage.context().close();

  // An administrator finds it in the oversight list.
  const adminPage = await (await browser.newContext()).newPage();
  await signInNewAdmin(adminPage, { first: 'Grace', second: `Admin${unique()}` });
  await adminPage.goto('/admin/assignments');
  await adminPage.getByLabel('Search').fill(title);
  await expect(adminPage.getByRole('link', { name: title, exact: true }).filter({ visible: true })).toBeVisible();
  await adminPage.context().close();
});
