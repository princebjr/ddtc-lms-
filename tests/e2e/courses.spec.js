import { expect as baseExpect, test } from '@playwright/test';
import { dismissToasts, expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createAccount } from './support/accounts.js';
import { canPublishDirectly, courseByTitle, courseState, createCourseFixture, enrolFixture, enrolmentStatuses, uniqueCode } from './support/courses.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn, signInNewAdmin } from './support/ui.js';

// Phase 5 end to end: courses, lecturers and enrolment.
// Tests required: lecturer A cannot read or edit lecturer B's course; draft and pending courses are
// invisible to learners; duplicate course code and duplicate active enrolment are rejected; a learner
// without enrolment sees nothing; a COMPLETED enrolment and an ARCHIVED course are read-only (D05,
// D07). Plus the approval lifecycle with direct publishing (D04, ADR-005).

const expect = baseExpect.configure({ timeout: 15_000 });

// Several sign-ins and server round trips per flow; emulated phones need more than 30 s.
test.describe.configure({ timeout: 120_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);

/** @param {import('@playwright/test').Page} page @param {string | RegExp} text */
function toast(page, text) {
  return page.locator('[data-toast-id]').filter({ hasText: text }).first();
}

/** @param {import('@playwright/test').Page} page */
async function noOverflow(page) {
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
}

/**
 * Picks an option in a labelled Radix select.
 * @param {import('@playwright/test').Page | import('@playwright/test').Locator} scope
 * @param {import('@playwright/test').Page} page @param {string} label @param {string | RegExp} option
 */
async function choose(scope, page, label, option) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option }).click();
}

test('approval lifecycle: a lecturer submits, an administrator returns with a reason, then approves and lets the lecturer publish directly', async ({ page, browser }) => {
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${unique()}` });
  const title = `Christian Leadership ${unique()}`;
  const code = uniqueCode();

  await signIn(page, lecturer.email, lecturer.password);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  await page.goto('/lecturer/courses/new');
  await page.getByLabel('Course title').fill(title);
  await page.getByLabel('Course code').fill(code.toLowerCase());
  await page.getByLabel('Description').fill('Leading as a servant');
  await expectNoAxeViolations(page);
  await noOverflow(page);
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(toast(page, 'Submitted for approval')).toBeVisible();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Pending approval', { exact: true }).first()).toBeVisible();
  const course = await courseByTitle(title);
  expect(course?.course_code).toBe(code);
  expect(course?.status).toBe('PENDING_APPROVAL');

  const adminPage = await (await browser.newContext()).newPage();
  await signInNewAdmin(adminPage, { first: 'Grace', second: `Approver${unique()}` });
  await adminPage.goto('/admin/approvals');
  const item = adminPage.getByRole('listitem').filter({ hasText: title });
  await expect(item).toBeVisible();
  await expectNoAxeViolations(adminPage);
  await item.getByRole('button', { name: 'Return' }).click();
  await adminPage.getByLabel('Reason').fill('Add learning objectives');
  await adminPage.getByRole('button', { name: 'Return course' }).click();
  await expect(toast(adminPage, 'Course returned to lecturer')).toBeVisible();
  await expect.poll(async () => (await courseState(course?.id ?? ''))?.status).toBe('DRAFT');

  await page.reload();
  await expect(page.getByText('Returned by an administrator: Add learning objectives')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(toast(page, 'Submitted for approval')).toBeVisible();

  await adminPage.reload();
  await adminPage.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: 'Approve' }).click();
  await adminPage.getByLabel('Let the lecturer who sent it publish without approval from now on').check();
  await adminPage.getByRole('button', { name: 'Approve', exact: true }).last().click();
  await expect(toast(adminPage, 'Course approved and published')).toBeVisible();
  await expect.poll(async () => (await courseState(course?.id ?? ''))?.status).toBe('PUBLISHED');
  expect(await canPublishDirectly(lecturer.id)).toBe(true);

  // Now the lecturer publishes straight away.
  const second = `Prayer ${unique()}`;
  await page.goto('/lecturer/courses/new');
  await page.getByLabel('Course title').fill(second);
  await page.getByLabel('Course code').fill(uniqueCode());
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(toast(page, 'Course published')).toBeVisible();
  await expect.poll(async () => (await courseByTitle(second))?.status).toBe('PUBLISHED');
  await adminPage.context().close();
});

test('lecturer A cannot open lecturer B\'s course, and a duplicate course code is refused', async ({ page }) => {
  const lecturerA = await createAccount({ role: 'LECTURER', first: 'Ruth', second: `Tetteh${unique()}` });
  const lecturerB = await createAccount({ role: 'LECTURER', first: 'Samuel', second: `Addo${unique()}` });
  const other = await createCourseFixture({ ownerId: lecturerB.id, title: `Church History ${unique()}` });

  await signIn(page, lecturerA.email, lecturerA.password);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  await page.goto('/lecturer/my-courses');
  await expect(page.getByText('You do not teach any course yet')).toBeVisible();
  await expect(page.getByText(other.title)).toHaveCount(0);
  await expectNoAxeViolations(page);
  await noOverflow(page);

  await page.goto(`/lecturer/courses/${other.id}`);
  await expect(page.getByText('Course not found')).toBeVisible();
  await expect(page.getByLabel('Course title')).toHaveCount(0);

  await page.goto('/lecturer/courses/new');
  await page.getByLabel('Course title').fill('Copy of another course');
  await page.getByLabel('Course code').fill(other.code);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'A course with this code already exists' })).toBeVisible();
});

test('learners see only published courses they are enrolled in; completed and archived courses are read-only; no enrolment means no course', async ({ page, browser }) => {
  const lecturer = await createAccount({ role: 'LECTURER' });
  const learner = await createAccount({ first: 'Kwame', second: `Mensah${unique()}` });
  const tag = unique();
  const published = await createCourseFixture({ ownerId: lecturer.id, title: `Biblical Studies ${tag}` });
  const draft = await createCourseFixture({ ownerId: lecturer.id, title: `Draft course ${tag}`, status: 'DRAFT' });
  const pending = await createCourseFixture({ ownerId: lecturer.id, title: `Pending course ${tag}`, status: 'PENDING_APPROVAL' });
  const completed = await createCourseFixture({ ownerId: lecturer.id, title: `Discipleship ${tag}` });
  const archived = await createCourseFixture({ ownerId: lecturer.id, title: `Foundations ${tag}`, status: 'ARCHIVED' });
  for (const c of [published, draft, pending, archived]) await enrolFixture(c.id, learner.id, lecturer.id);
  await enrolFixture(completed.id, learner.id, lecturer.id, 'COMPLETED');

  await signIn(page, learner.email, learner.password);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await page.goto('/learner/my-courses');
  for (const c of [published, completed, archived]) await expect(page.getByRole('link', { name: new RegExp(c.title) })).toBeVisible();
  await expect(page.getByText(draft.title)).toHaveCount(0);
  await expect(page.getByText(pending.title)).toHaveCount(0);
  await expectNoAxeViolations(page);
  await noOverflow(page);

  await page.goto(`/learner/courses/${completed.id}`);
  await expect(page.getByText('You have completed this course. You can still read it and see your released grades, but you cannot submit work.')).toBeVisible();
  await page.goto(`/learner/courses/${archived.id}`);
  await expect(page.getByText('This course is archived. You can still read it and see your released grades, but you cannot submit work.')).toBeVisible();
  await expectNoAxeViolations(page);
  await page.goto(`/learner/courses/${draft.id}`);
  await expect(page.getByText('Course not found')).toBeVisible();

  const stranger = await createAccount();
  const strangerPage = await (await browser.newContext()).newPage();
  await signIn(strangerPage, stranger.email, stranger.password);
  await expect(strangerPage).toHaveURL(/\/learner\/dashboard$/);
  await strangerPage.goto('/learner/my-courses');
  await expect(strangerPage.getByText('You are not enrolled in any course yet')).toBeVisible();
  await strangerPage.goto(`/learner/courses/${published.id}`);
  await expect(strangerPage.getByText('Course not found')).toBeVisible();
  await strangerPage.context().close();
});

test('administrator enrols a learner with Undo, refuses a duplicate enrolment, and marks the enrolment completed', async ({ page }) => {
  const lecturer = await createAccount({ role: 'LECTURER' });
  const second = `Frimpong${unique()}`;
  const learner = await createAccount({ first: 'Abena', second });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Evangelism ${unique()}` });

  await signInNewAdmin(page, { first: 'Grace', second: `Enroller${unique()}` });
  await page.goto(`/admin/enrolments?course=${course.id}`);
  await expect(page.getByText('No enrolments match these filters')).toBeVisible();
  await expectNoAxeViolations(page);
  await noOverflow(page);

  const enrol = async () => {
    await dismissToasts(page);
    await page.getByRole('button', { name: 'Enrol learners' }).click();
    const sheet = page.getByRole('dialog', { name: 'Enrol learners' });
    await sheet.getByLabel('Find learners').fill(second);
    await sheet.getByLabel(new RegExp(`Abena ${second}`)).check();
    await sheet.getByRole('button', { name: /^Enrol 1 learner$/ }).click();
    return sheet;
  };

  await enrol();
  const enrolled = toast(page, '1 learners enrolled');
  await expect(enrolled).toBeVisible();
  await expect.poll(() => enrolmentStatuses(course.id, learner.id)).toEqual(['ACTIVE']);
  await enrolled.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => enrolmentStatuses(course.id, learner.id)).toEqual(['WITHDRAWN']);

  await enrol();
  await expect(toast(page, '1 learners enrolled')).toBeVisible();
  await expect.poll(() => enrolmentStatuses(course.id, learner.id)).toEqual(['WITHDRAWN', 'ACTIVE']);

  // A second enrolment in the same course is refused: the sheet says so and nothing is added.
  const sheet = await enrol();
  await expect(sheet.getByText('Everyone you chose is already enrolled in this course.')).toBeVisible();
  expect(await enrolmentStatuses(course.id, learner.id)).toEqual(['WITHDRAWN', 'ACTIVE']);
  await page.keyboard.press('Escape');

  await dismissToasts(page);
  const row = page.getByRole('combobox', { name: `Status for Abena ${second} in ${course.code}, currently Active` });
  await row.click();
  await page.getByRole('option', { name: 'Completed' }).click();
  await expect(toast(page, 'Enrolment updated')).toBeVisible();
  await expect.poll(() => enrolmentStatuses(course.id, learner.id)).toEqual(['WITHDRAWN', 'COMPLETED']);
});

test('administrator creates a course for a lecturer, transfers ownership, and archives it with Undo', async ({ page }) => {
  const ownerName = `Owner${unique()}`;
  const nextName = `Next${unique()}`;
  await createAccount({ role: 'LECTURER', first: 'Ama', second: ownerName });
  await createAccount({ role: 'LECTURER', first: 'Grace', second: nextName });
  const title = `Theology ${unique()}`;

  await signInNewAdmin(page, { first: 'Prince', second: `Creator${unique()}` });
  await page.goto('/admin/courses/new');
  await page.getByLabel('Course title').fill(title);
  await page.getByLabel('Course code').fill(uniqueCode());
  await choose(page, page, 'Owner (lecturer)', `Ama ${ownerName}`);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(toast(page, 'Draft saved')).toBeVisible();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);
  await noOverflow(page);

  await page.getByRole('tab', { name: 'Settings' }).click();
  await choose(page, page, 'New owner', `Grace ${nextName}`);
  await page.getByRole('button', { name: 'Transfer' }).click();
  await expect(toast(page, 'Owner changed')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: `Grace ${nextName}` }).filter({ hasText: 'Owner' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: `Ama ${ownerName}` }).filter({ hasText: 'Co-lecturer' })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole('button', { name: 'Archive course' }).click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  const archived = toast(page, 'Course archived');
  await expect(archived).toBeVisible();
  const id = (await courseByTitle(title))?.id ?? '';
  await expect.poll(async () => (await courseState(id))?.status).toBe('ARCHIVED');
  await archived.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await courseState(id))?.status).toBe('DRAFT');
});
