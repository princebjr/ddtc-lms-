import { expect as baseExpect, test } from '@playwright/test';
import { dismissToasts } from './helpers.js';
import { createAccount } from './support/accounts.js';
import { createAssignmentFixture } from './support/assignments.js';
import { createCourseFixture, createLessonFixture, enrolFixture } from './support/courses.js';
import { sendAnswerFixture } from './support/grading.js';
import { requireSupabase } from './support/local-supabase.js';

// Phase 13 (WCAG 2.1 AA, keyboard-only pass): the core journeys done with the keyboard alone, never the
// mouse. Each step moves focus with Tab (or Shift+Tab), acts with Enter or Space, and checks that the focused
// control shows a visible focus indicator. Desktop projects only: phones and tablets are touch devices
// (their screen-reader passes are manual, with VoiceOver and TalkBack).

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 180_000 });
test.skip(({ isMobile }) => isMobile, 'keyboard journeys run on the desktop projects');

const unique = () => Math.random().toString(36).slice(2, 8);
/** The fixture makes a draft; a learner sees only published lessons. @param {string} id */
async function publishLesson(id) {
  const s = requireSupabase();
  const res = await fetch(`${s.url}/rest/v1/lessons?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publication_status: 'PUBLISHED', published_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`publish lesson: ${res.status}`);
}
/** @param {import('@playwright/test').Page} page @param {string} text */
const toast = (page, text) => page.locator('[data-toast-id]').filter({ hasText: text }).first();

/**
 * Presses Tab until the target has the focus (at most 80 times), and checks a focus indicator is drawn.
 * @param {import('@playwright/test').Page} page @param {import('@playwright/test').Locator} target
 */
async function tabTo(page, target) {
  for (let i = 0; i < 80; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)).catch(() => false)) break;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
  const ring = await target.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, shadow: s.boxShadow !== 'none' };
  });
  expect(ring.outline || ring.shadow, 'the focused control shows a focus indicator').toBe(true);
}

test('sign in, open a lesson and mark it complete, all with the keyboard', async ({ page }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Keyboard course ${tag}` });
  await enrolFixture(course.id, kwame.id, lecturer.id);
  const lesson = await createLessonFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Reading Genesis 1' });
  await publishLesson(lesson.id);

  await page.goto('/login');
  await tabTo(page, page.getByLabel('Email address'));
  await page.keyboard.type(kwame.email);
  await tabTo(page, page.getByLabel('Password', { exact: true }));
  await page.keyboard.type(kwame.password);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/learner\/dashboard$/);

  await page.goto(`/learner/courses/${course.id}/lessons/${lesson.id}`);
  await expect(page.getByRole('heading', { name: 'Reading Genesis 1' })).toBeVisible();
  await dismissToasts(page);
  const complete = page.getByRole('button', { name: 'Mark complete' });
  await tabTo(page, complete);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Mark not complete|Completed/ })).toBeVisible();
});

test('play instruction audio and send a written answer with the keyboard', async ({ page }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Keyboard course ${tag}` });
  await enrolFixture(course.id, kwame.id, lecturer.id);
  const assignment = await createAssignmentFixture({
    courseId: course.id, ownerId: lecturer.id, title: 'Spoken instructions', dueAt: new Date(Date.now() + 7 * 86400000).toISOString(), contentType: 'TEXT_AND_AUDIO', withAudio: true,
  });

  await page.goto('/login');
  await page.getByLabel('Email address').fill(kwame.email);
  await page.getByLabel('Password', { exact: true }).fill(kwame.password);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await page.goto(`/learner/courses/${course.id}/assignments/${assignment.id}`);
  await dismissToasts(page);

  // The instruction audio: Space plays and pauses; the arrow-key speed and skip buttons are reachable.
  const play = page.getByRole('button', { name: /^Play / }).first();
  await tabTo(page, play);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Pause / }).first()).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Play / }).first()).toBeVisible();
  await tabTo(page, page.getByRole('button', { name: 'Forward 15 seconds' }).first());

  // The answer: type it, then Submit with Enter.
  await tabTo(page, page.getByLabel('Text answer'));
  await page.keyboard.type('Covenant is a promise God keeps.');
  await tabTo(page, page.getByRole('button', { name: 'Submit', exact: true }));
  await page.keyboard.press('Enter');
  await expect(toast(page, 'Submission received')).toBeVisible();
});

test('a lecturer grades an answer with the keyboard', async ({ page }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const kwame = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Keyboard course ${tag}` });
  await enrolFixture(course.id, kwame.id, lecturer.id);
  const assignment = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Reflection', dueAt: new Date(Date.now() + 7 * 86400000).toISOString() });
  await sendAnswerFixture(kwame, assignment.id);

  await page.goto('/login');
  await page.getByLabel('Email address').fill(lecturer.email);
  await page.getByLabel('Password', { exact: true }).fill(lecturer.password);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  await page.goto(`/lecturer/courses/${course.id}/assignments/${assignment.id}/submissions/${kwame.id}`);
  await dismissToasts(page);
  await tabTo(page, page.getByLabel('Marks'));
  await page.keyboard.type('16');
  await tabTo(page, page.getByLabel('Feedback (optional)'));
  await page.keyboard.type('Clear and well organised.');
  await tabTo(page, page.getByRole('button', { name: 'Save draft' }));
  await page.keyboard.press('Enter');
  await expect(toast(page, 'Grade saved as draft')).toBeVisible();

  // A dialog: Release grade opens a confirmation; Escape closes it and gives the focus back.
  const release = page.getByRole('button', { name: 'Release grade' });
  await tabTo(page, release);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  if (await dialog.count()) {
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(release).toBeFocused();
  }
});
