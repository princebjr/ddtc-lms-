import { expect as baseExpect, test } from '@playwright/test';
import { mp3, pdf, wav } from '../fixtures/media.js';
import { expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createAccount } from './support/accounts.js';
import { createCourseFixture, enrolFixture } from './support/courses.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn } from './support/ui.js';

// Phase 6 end to end: lessons and lesson audio (D08, D09, D18, ADR-006).
// A lecturer writes a lesson with formatting, uploads audio (its waveform is prepared in the browser),
// publishes and reorders; a renamed file is rejected with the reason; an enrolled learner opens the
// lesson, seeks with the keyboard and by dragging, downloads with the size shown first and marks it
// complete; a learner who is not enrolled cannot open it. Storage-level denials are proven in pgTAP
// (09_lessons_access.test.sql).

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

/** @param {import('@playwright/test').Page} page */
async function dismissToasts(page) {
  const toasts = page.locator('[data-sonner-toast]:not([data-removed="true"]) [data-toast-id]');
  const front = page.locator('[data-sonner-toast][data-front="true"]:not([data-removed="true"]) [data-toast-id]');
  for (let i = 0; i < 5 && (await toasts.count()) > 0; i += 1) {
    await front.getByRole('button', { name: 'Dismiss notification' }).click();
    await page.waitForTimeout(400);
  }
}

/** Opens a new lesson, writes it and saves it; returns to the saved lesson's editor. @param {import('@playwright/test').Page} page @param {string} courseId @param {string} title */
async function writeLesson(page, courseId, title) {
  await page.goto(`/lecturer/courses/${courseId}/lessons/new`);
  await page.getByLabel('Lesson title').fill(title);
  const text = page.getByRole('textbox', { name: 'Lesson text' });
  await text.click();
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await page.keyboard.type('Read Genesis 1 slowly.');
  await page.getByRole('button', { name: 'Save lesson' }).click();
  await expect(toast(page, 'Lesson saved')).toBeVisible();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}

test('a lecturer writes a lesson, uploads audio, publishes and reorders; a renamed file is rejected with the reason', async ({ page }) => {
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${unique()}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Biblical Studies ${unique()}` });
  await signIn(page, lecturer.email, lecturer.password);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);

  const first = `Welcome ${unique()}`;
  await writeLesson(page, course.id, first);
  await expect(page.locator('.lesson-content strong')).toHaveText('Read Genesis 1 slowly.');
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // A renamed PDF is refused, with the reason and Try again.
  await dismissToasts(page);
  await page.locator('input[type="file"][accept^=".mp3"]').setInputFiles({ name: 'sermon.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from(pdf()) });
  const rejected = toast(page, 'Audio rejected: The file is not an MP3, M4A or WAV audio file');
  await expect(rejected).toBeVisible();
  await expect(rejected.getByRole('button', { name: 'Try again' })).toBeVisible();
  await dismissToasts(page);

  // Real audio: validated, its waveform stored, ready to play.
  await page.locator('input[type="file"][accept^=".mp3"]').setInputFiles({ name: 'welcome.wav', mimeType: 'audio/wav', buffer: Buffer.from(wav(30)) });
  await expect(toast(page, 'Audio ready')).toBeVisible();
  await expect(page.getByRole('slider', { name: `${first} position` })).toBeVisible();
  await dismissToasts(page);

  // Replacing keeps the history.
  await page.locator('input[type="file"][accept^=".mp3"]').setInputFiles({ name: 'welcome-v2.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from(mp3({ frames: 100 })) });
  await expect(toast(page, 'Audio replaced')).toBeVisible();
  await page.getByRole('button', { name: 'Audio history (2)' }).click();
  await expect(page.getByText(/Version 1: replaced/)).toBeVisible();
  await dismissToasts(page);

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(toast(page, 'Lesson published')).toBeVisible();
  await dismissToasts(page);

  const second = `Prayer ${unique()}`;
  await writeLesson(page, course.id, second);
  await page.goto(`/lecturer/courses/${course.id}/lessons`);
  const items = page.getByRole('list', { name: 'Lessons in order' }).getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: `Move ${second} up` }).click();
  await expect(toast(page, 'Order saved')).toBeVisible();
  await expect(items.first()).toContainText(second);
});

test('an enrolled learner opens a lesson, seeks with the keyboard and by dragging, downloads with the size first and marks it complete; others cannot open it', async ({ page, browser }) => {
  const lecturer = await createAccount({ role: 'LECTURER' });
  const learner = await createAccount({ first: 'Kwame', second: `Mensah${unique()}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Discipleship ${unique()}` });
  await enrolFixture(course.id, learner.id, lecturer.id);

  // The lecturer prepares and publishes the lesson with 30 seconds of audio.
  const lecturerPage = await (await browser.newContext()).newPage();
  await signIn(lecturerPage, lecturer.email, lecturer.password);
  await expect(lecturerPage).toHaveURL(/\/lecturer\/dashboard$/);
  const title = `The Creation Account ${unique()}`;
  await writeLesson(lecturerPage, course.id, title);
  await lecturerPage.locator('input[type="file"][accept^=".mp3"]').setInputFiles({ name: 'creation.wav', mimeType: 'audio/wav', buffer: Buffer.from(wav(30)) });
  await expect(toast(lecturerPage, 'Audio ready')).toBeVisible();
  await dismissToasts(lecturerPage);
  await lecturerPage.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(toast(lecturerPage, 'Lesson published')).toBeVisible();
  const lessonUrl = new URL(lecturerPage.url()).pathname.replace('/lecturer/', '/learner/');
  await lecturerPage.context().close();

  await signIn(page, learner.email, learner.password);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await page.goto(`/learner/courses/${course.id}`);
  await expect(page.getByText('0 of 1 lessons completed')).toBeVisible();
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(new RegExp(`${lessonUrl}$`));
  await expect(page.getByText('Lesson 1 of 1')).toBeVisible();
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The player: metadata only (no autoplay), then keyboard and drag seeking on the waveform.
  const slider = page.getByRole('slider', { name: `${title} position` });
  await expect(slider).toHaveAttribute('aria-valuemax', '30');
  await expect.poll(() => page.evaluate(() => /** @type {HTMLAudioElement} */ (document.querySelector('audio')).readyState)).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => /** @type {HTMLAudioElement} */ (document.querySelector('audio')).paused)).toBe(true);
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '5');
  await expect(slider).toHaveAttribute('aria-valuetext', '5 seconds of 30 seconds');
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '30');
  await page.keyboard.press('Home');

  const box = await slider.boundingBox();
  if (!box) throw new Error('waveform not on screen');
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 4 });
  // Half way along 30 seconds; pixel rounding differs by engine (14.98 s shows as 0:14).
  await expect(page.locator('[data-slot="time-bubble"]')).toHaveText(/^0:1[45]$/);
  await page.mouse.up();
  await expect(slider).toHaveAttribute('aria-valuenow', /^1[45]$/);

  // Download: the size is announced first, then the file arrives with its safe name.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download \(\d+ KB\)$/ }).click();
  await expect(toast(page, /Downloading audio \(\d+ KB\)/)).toBeVisible();
  expect((await download).suggestedFilename()).toBe('creation.wav');

  await dismissToasts(page);
  await page.getByRole('button', { name: 'Mark complete' }).click();
  await expect(toast(page, 'Lesson completed')).toBeVisible();
  await page.goto(`/learner/courses/${course.id}`);
  await expect(page.getByText('1 of 1 lessons completed')).toBeVisible();

  // A learner who is not enrolled cannot open the lesson.
  const stranger = await createAccount();
  const strangerPage = await (await browser.newContext()).newPage();
  await signIn(strangerPage, stranger.email, stranger.password);
  await expect(strangerPage).toHaveURL(/\/learner\/dashboard$/);
  await strangerPage.goto(lessonUrl);
  await expect(strangerPage.getByText('Lesson not found')).toBeVisible();
  await strangerPage.context().close();
});
