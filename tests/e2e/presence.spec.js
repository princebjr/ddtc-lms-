import { expect as baseExpect, test } from '@playwright/test';
import { expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createAccount } from './support/accounts.js';
import { createCourseFixture, enrolFixture } from './support/courses.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn } from './support/ui.js';

// Step 11.1 end to end (ADR-020; owner answers of 2026-11-06). On every device project, light and dark:
// a lecturer's "Who's online" shows a learner of their course while the learner has the app open, and
// drops them when they close it, with no refresh; a learner of another course never appears.

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 240_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);

test("a lecturer sees their learner come online and go offline; another course's learner never appears", async ({ browser }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const yaw = await createAccount({ first: 'Yaw', second: `Darko${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Biblical Studies ${tag}` });
  await enrolFixture(course.id, kwame.id, lecturer.id);
  // Yaw is in a course Ama does not teach: a different lecturer's course.
  const grace = await createAccount({ role: 'LECTURER', first: 'Grace', second: `Owusu${tag}` });
  const graceCourse = await createCourseFixture({ ownerId: grace.id, title: `Church History ${tag}` });
  await enrolFixture(graceCourse.id, yaw.id, grace.id);

  const staff = await (await browser.newContext()).newPage();
  await signIn(staff, lecturer.email, lecturer.password);
  await expect(staff).toHaveURL(/\/lecturer\/dashboard$/);
  const card = staff.locator('[data-slot="who-is-online"]');
  await expect(card.getByRole('heading', { name: "Who's online (0)" })).toBeVisible();

  const learnerContext = await browser.newContext();
  const learner = await learnerContext.newPage();
  await signIn(learner, kwame.email, kwame.password);
  await expect(learner).toHaveURL(/\/learner\/dashboard$/);
  const yawContext = await browser.newContext();
  const yawPage = await yawContext.newPage();
  await signIn(yawPage, yaw.email, yaw.password);
  await expect(yawPage).toHaveURL(/\/learner\/dashboard$/);

  // Kwame appears on Ama's dashboard without a refresh; Yaw never does.
  const kwameRow = card.getByTestId('online-person').filter({ hasText: `Kwame Mensah${tag}` });
  await expect(kwameRow).toContainText('Learner · online');
  await expect(card.getByRole('heading', { name: "Who's online (1)" })).toBeVisible();
  await expect(card.getByText(`Yaw Darko${tag}`)).toHaveCount(0);

  // And Kwame sees his lecturer.
  await expect(learner.locator('[data-slot="who-is-online"]').getByTestId('online-person').filter({ hasText: `Ama Boateng${tag}` })).toContainText('Lecturer · online');
  await expectNoAxeViolations(staff);
  expect(await horizontalOverflow(staff)).toBeLessThanOrEqual(0);

  // Kwame closes the app: he drops off Ama's list by itself.
  await learnerContext.close();
  await expect(kwameRow).toHaveCount(0, { timeout: 90_000 });
  await expect(card.getByRole('heading', { name: "Who's online (0)" })).toBeVisible();
  await yawContext.close();
});
