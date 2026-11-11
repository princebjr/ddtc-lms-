import { expect as baseExpect, test } from '@playwright/test';
import { dismissToasts, expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createAccount } from './support/accounts.js';
import { createAssignmentFixture } from './support/assignments.js';
import { createCourseFixture, enrolFixture } from './support/courses.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn, signInNewAdmin } from './support/ui.js';

// Phase 11 end to end (ADR-019). On every device project, light and dark:
// - a learner sees the unread count on the bell, the notifications (enrolment, new assignment), turns
//   course emails off, and opens a notification;
// - a lecturer sends an announcement to a course; the learner sees it in the notification centre and on
//   the course page;
// - an administrator changes a setting ("Setting saved"), finds the change in the audit logs, and reads
//   a report.

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 240_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);
/** @param {import('@playwright/test').Page} page @param {string | RegExp} text */
const toast = (page, text) => page.locator('[data-toast-id]').filter({ hasText: text }).first();

/** Sets a setting back with the service role (so a test never leaves a changed value behind). @param {string} key @param {unknown} value */
async function restoreSetting(key, value) {
  const s = requireSupabase();
  await fetch(`${s.url}/rest/v1/system_settings?key=eq.${key}`, {
    method: 'PATCH',
    headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
}

test('a learner reads notifications, turns course emails off and opens one', async ({ page }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Biblical Studies ${tag}` });
  await enrolFixture(course.id, kwame.id, lecturer.id);
  const a = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: `Reflection ${tag}`, dueAt: new Date(Date.now() + 5 * 86400000).toISOString() });

  await signIn(page, kwame.email, kwame.password);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await expect(page.getByTestId('notification-bell')).toHaveAttribute('aria-label', 'Notifications, 2 unread');
  await dismissToasts(page);
  await page.getByTestId('notification-bell').click();
  await expect(page).toHaveURL(/\/learner\/notifications$/);
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  await expect(page.getByTestId('notice').filter({ hasText: 'You have been enrolled' })).toBeVisible();
  const notice = page.getByTestId('notice').filter({ hasText: 'New assignment' });
  await expect(notice).toContainText(`Reflection ${tag}`);
  await expect(notice).toHaveAttribute('data-unread', 'true');

  const email = page.getByRole('switch', { name: 'Email me about my courses' });
  await expect(email).toHaveAttribute('aria-checked', 'true');
  await email.click();
  await expect(email).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Email me about my courses' })).toHaveAttribute('aria-checked', 'false');

  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await dismissToasts(page);
  await page.getByTestId('notice').filter({ hasText: 'New assignment' }).getByRole('button').click();
  await expect(page).toHaveURL(new RegExp(`/learner/courses/${course.id}/assignments/${a.id}$`));
  await expect(page.getByTestId('notification-bell')).toHaveAttribute('aria-label', 'Notifications, 1 unread');
});

test('a lecturer announces to a course and the learner sees it', async ({ browser }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Biblical Studies ${tag}` });
  await enrolFixture(course.id, kwame.id, lecturer.id);

  const staff = await (await browser.newContext()).newPage();
  await signIn(staff, lecturer.email, lecturer.password);
  await expect(staff).toHaveURL(/\/lecturer\/dashboard$/);
  await staff.goto('/lecturer/announcements');
  await dismissToasts(staff);
  await staff.getByLabel('To', { exact: true }).selectOption({ label: `${course.code} Biblical Studies ${tag}` });
  await staff.getByLabel('Title').fill('Class moved');
  await staff.getByLabel('Message').fill("Saturday's class starts at 10:00.");
  await staff.getByRole('button', { name: 'Send announcement' }).click();
  const confirm = staff.getByRole('alertdialog', { name: 'Send this announcement?' });
  await expect(confirm).toContainText(`the learners of ${course.code} Biblical Studies ${tag}`);
  await confirm.getByRole('button', { name: 'Send' }).click();
  await expect(toast(staff, 'Announcement sent')).toBeVisible();
  await expect(staff.getByTestId('sent-announcement').filter({ hasText: 'Class moved' })).toContainText('1 learner');
  await expectNoAxeViolations(staff);
  expect(await horizontalOverflow(staff)).toBeLessThanOrEqual(0);

  const learner = await (await browser.newContext()).newPage();
  await signIn(learner, kwame.email, kwame.password);
  await expect(learner).toHaveURL(/\/learner\/dashboard$/);
  await learner.goto('/learner/notifications');
  await expect(learner.getByTestId('notice').filter({ hasText: 'Class moved' })).toContainText(`Biblical Studies ${tag}: Saturday's class starts at 10:00.`);
  await learner.goto(`/learner/courses/${course.id}`);
  const list = learner.locator('[data-slot="course-announcements"]');
  await expect(list.getByText('Class moved')).toBeVisible();
  await expect(list.getByText("Saturday's class starts at 10:00.")).toBeVisible();
});

test('an administrator changes a setting, finds it in the audit logs and reads a report', async ({ page }) => {
  const tag = unique();
  await signInNewAdmin(page, { first: 'Grace', second: `Admin${tag}` });
  await expect(page.locator('[data-slot="admin-activity"]')).toBeVisible();
  try {
    await page.goto('/admin/settings');
    await dismissToasts(page);
    const row = page.locator('[data-setting="s-max_files_per_submission_version"]');
    await row.getByLabel('Files per answer').fill('21');
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(row.getByText('Enter a whole number from 1 to 20.')).toBeVisible();
    await row.getByLabel('Files per answer').fill('6');
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(toast(page, 'Setting saved')).toBeVisible();
    await expectNoAxeViolations(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  } finally {
    await restoreSetting('max_files_per_submission_version', 5);
  }

  await page.goto('/admin/audit-logs');
  await dismissToasts(page);
  await page.getByLabel('Action').selectOption('setting.updated');
  await page.getByLabel('Item ID').fill('max_files_per_submission_version');
  await page.getByRole('button', { name: 'Show entries' }).click();
  const entry = page.getByTestId('audit-entry').filter({ hasText: `Grace Admin${tag}` }).first();
  await expect(entry).toBeVisible();
  await entry.locator('summary').click();
  await expect(entry).toContainText('"new_value": 6');
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.goto('/admin/reports');
  await expect(page.getByRole('tab', { name: 'Enrolment' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Grade summaries' }).click();
  await expect(page.getByText('Released course grades only.', { exact: false })).toBeVisible();
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
