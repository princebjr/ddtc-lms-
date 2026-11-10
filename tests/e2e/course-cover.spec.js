import { deflateSync } from 'node:zlib';
import { expect as baseExpect, test } from '@playwright/test';
import { png } from '../fixtures/media.js';
import { horizontalOverflow } from './helpers.js';
import { createAccount } from './support/accounts.js';
import { createCourseFixture, enrolFixture } from './support/courses.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn } from './support/ui.js';

// A course cover is always cropped to 16:9 (DESIGN.md 13; owner request of 2026-11-10: a tall photo
// made the course card as long as the photo). A lecturer uploads a tall cover (400 x 1200); the cover
// preview in the course workspace, the course card on the lecturer's and the learner's My Courses and
// the learner's course page all keep a 16:9 frame, with the photo cropped inside it.

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 120_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);

/** Expects every visible course cover frame on the page to be 16:9 (to the pixel). @param {import('@playwright/test').Page} page */
async function expectSixteenByNine(page) {
  const frames = page.locator('[data-slot="course-cover"]').filter({ visible: true });
  await expect(frames.first()).toBeVisible();
  for (const box of await frames.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ width: r.width, height: r.height })))) {
    expect(Math.abs(box.height - (box.width * 9) / 16), `cover frame ${box.width} x ${box.height} is not 16:9`).toBeLessThanOrEqual(1.5);
  }
}

test('a tall cover photo is cropped to 16:9 on the course card, the workspace and the learner\'s course page', async ({ browser }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const learner = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `The Christian Life ${tag}` });
  await enrolFixture(course.id, learner.id, lecturer.id);

  const page = await (await browser.newContext()).newPage();
  await signIn(page, lecturer.email, lecturer.password);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  await page.goto(`/lecturer/courses/${course.id}`);
  const tall = Buffer.from(png(400, 1200, deflateSync));
  await page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').setInputFiles({ name: 'tall-cover.png', mimeType: 'image/png', buffer: tall });
  await expect(page.getByRole('img', { name: /^Cover of / })).toBeVisible();
  await expectSixteenByNine(page);

  await page.goto('/lecturer/my-courses');
  await expect(page.getByRole('link', { name: new RegExp(`The Christian Life ${tag}`) }).first()).toBeVisible();
  await expect(page.locator('[data-slot="course-cover"] img').first()).toBeVisible();
  await expectSixteenByNine(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  const learnerPage = await (await browser.newContext()).newPage();
  await signIn(learnerPage, learner.email, learner.password);
  await expect(learnerPage).toHaveURL(/\/learner\/dashboard$/);
  await learnerPage.goto('/learner/my-courses');
  await expect(learnerPage.locator('[data-slot="course-cover"] img').first()).toBeVisible();
  await expectSixteenByNine(learnerPage);
  await learnerPage.goto(`/learner/courses/${course.id}`);
  await expect(learnerPage.locator('[data-slot="course-cover"] img').first()).toBeVisible();
  await expectSixteenByNine(learnerPage);
});
