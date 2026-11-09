import { expect as baseExpect, test } from '@playwright/test';
import { concat, mp3, pdf, zip } from '../fixtures/media.js';
import { dismissToasts, expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createAccount, setBranch } from './support/accounts.js';
import { createAssignmentFixture } from './support/assignments.js';
import { createCourseFixture, createLessonFixture, enrolFixture } from './support/courses.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn } from './support/ui.js';

// Phase 8 end to end: answers (D10, ADR-009, owner decisions of 2026-11-08). A learner writes an
// answer, records one with the microphone (a simulated microphone feeding the browser's real
// recorder, so the server checks a real Chrome, Firefox or Safari recording), uploads PDF and Word,
// has a renamed file refused, sends version 1 and resubmits version 2. Past the due date a first
// answer is refused unless late answers are allowed (marked late); the lecturer sees branch chips,
// gives an extension and opens the answer. An interrupted upload carries on with "Upload resumed".
// A lecturer records lesson audio in the app (ADR-007). The rules are proven in pgTAP 17 and 18 and
// the function tests; recording on real phones is the owner's exit-gate check.

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 180_000 });

test.beforeAll(() => {
  requireSupabase();
});

const unique = () => Math.random().toString(36).slice(2, 8);
const DOCX = zip(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
const in7days = () => new Date(Date.now() + 7 * 86_400_000).toISOString();
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString();

/** @param {import('@playwright/test').Page} page @param {string | RegExp} text */
function toast(page, text) {
  return page.locator('[data-toast-id]').filter({ hasText: text }).first();
}

/**
 * A simulated microphone: getUserMedia returns a tone from the Web Audio API, which the page's
 * real MediaRecorder records exactly as it would a voice.
 * @param {import('@playwright/test').Page} page
 */
async function fakeMicrophone(page) {
  await page.addInitScript(() => {
    if (!navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia = async () => {
      const Context = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
      const context = new Context();
      // Not awaited: on a machine without a sound device (CI) resuming may never finish; the stream works anyway.
      void context.resume().catch(() => undefined);
      const tone = context.createOscillator();
      tone.frequency.value = 440;
      const gain = context.createGain();
      gain.gain.value = 0.3;
      const out = context.createMediaStreamDestination();
      tone.connect(gain).connect(out);
      tone.start();
      return out.stream;
    };
  });
}

/** @param {import('@playwright/test').Page} page */
const canRecord = (page) => page.evaluate(() => typeof window.MediaRecorder === 'function' && Boolean(navigator.mediaDevices?.getUserMedia));

test('a learner writes, records and uploads one answer; a renamed file is refused; Submit sends version 1 and a resubmission version 2', async ({ page }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const learner = await createAccount({ first: 'Kwame', second: `Mensah${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Biblical Studies ${tag}` });
  await enrolFixture(course.id, learner.id, lecturer.id);
  const assignment = await createAssignmentFixture({
    courseId: course.id,
    ownerId: lecturer.id,
    title: 'Covenant essay',
    dueAt: in7days(),
    formats: ['TEXT', 'AUDIO', 'PDF', 'DOCX'],
  });
  await fakeMicrophone(page);
  await signIn(page, learner.email, learner.password);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  await page.goto(`/learner/courses/${course.id}/assignments/${assignment.id}`);
  await expect(page.getByRole('heading', { name: 'Your answer' })).toBeVisible();

  // Write.
  await page.getByLabel('Text answer').fill('The covenant with Abraham is a promise God keeps.');
  await expect(page.getByText('49 of 20,000 characters')).toBeVisible();

  // Record (where the browser can record; otherwise the upload way out is offered).
  await page.getByRole('tab', { name: 'Record' }).click();
  const files = page.getByRole('list', { name: 'Files in this answer' });
  if (await canRecord(page)) {
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByText('Recording', { exact: true })).toBeVisible();
    await page.waitForTimeout(2500);
    // The recorder's controls fit the narrowest phone (320 px) with no sideways scrolling.
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await page.getByRole('button', { name: 'Use recording' }).click();
    await expect(toast(page, 'Recording saved')).toBeVisible();
    // The server checked the browser's own recording (WebM, Ogg or MP4) and worked out its length.
    await expect(files.locator('[data-slot="upload-row"][data-status="ready"]').filter({ hasText: /^Recording / })).toHaveCount(1);
  } else {
    await expect(page.getByText(/cannot record here/)).toBeVisible();
  }

  // Upload: a PDF and a Word file pass; a PDF renamed to .mp3 is refused with the reason.
  await page.getByRole('tab', { name: 'Upload' }).click();
  await page.getByTestId('answer-document-input').setInputFiles([
    { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf()) },
    { name: 'essay.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(DOCX) },
  ]);
  await expect(files.locator('[data-slot="upload-row"][data-status="ready"]').filter({ hasText: /notes\.pdf|essay\.docx/ })).toHaveCount(2);
  await page
    .getByTestId('answer-audio-input')
    .setInputFiles({ name: 'sermon.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from(concat('%PDF-1.7\n', new Uint8Array(4000))) });
  await expect(files.locator('[data-slot="upload-row"][data-status="rejected"]').filter({ hasText: 'sermon.mp3' })).toBeVisible();
  await expect(toast(page, 'File not accepted: ')).toBeVisible();
  // On a small phone the open toasts ("Recording saved", "File not accepted") and the sticky Submit bar
  // can cover the row: close the toasts and bring the row to the middle first, as a person would.
  await dismissToasts(page);
  const remove = page.getByRole('button', { name: 'Remove sermon.mp3' });
  await remove.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await remove.click();
  await dismissToasts(page);
  await expectNoAxeViolations(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Submit: version 1 with everything in it.
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(toast(page, 'Submission received')).toBeVisible();
  const versions = page.locator('[data-slot="version-list"]');
  await expect(versions.getByText('Version 1', { exact: true })).toBeVisible();
  await expect(versions.getByText('The covenant with Abraham is a promise God keeps.')).toBeVisible();
  await expect(versions.getByText('notes.pdf')).toBeVisible();
  await expect(versions.getByText('essay.docx')).toBeVisible();

  // A resubmission starts from the last answer and becomes version 2.
  await expect(page.getByRole('heading', { name: 'Send a new answer' })).toBeVisible();
  await expect(page.getByLabel('Text answer')).toHaveValue('The covenant with Abraham is a promise God keeps.');
  await page.getByLabel('Text answer').fill('The covenant with Abraham is a promise God keeps, as Genesis 15 shows.');
  await page.getByRole('button', { name: 'Submit again' }).click();
  await expect(toast(page, 'Resubmitted as version 2')).toBeVisible();
  await expect(versions.getByText('Version 2', { exact: true })).toBeVisible();
  await expect(versions.getByText('Replaced')).toBeVisible();

  // The Assignments list moves it to Submitted.
  await page.goto('/learner/assignments');
  await page.getByRole('tab', { name: /^Submitted/ }).click();
  await expect(page.getByRole('link', { name: /Covenant essay/ })).toBeVisible();
});

test('after the due date a first answer is refused unless late answers are allowed; the lecturer sees branches, gives an extension and opens the answer', async ({
  browser,
}) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const learner = await createAccount({ first: 'Esi', second: `Owusu${tag}` });
  await setBranch(learner.id, 'Kumasi');
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Discipleship ${tag}` });
  await enrolFixture(course.id, learner.id, lecturer.id);
  const closed = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Prayer journal', dueAt: yesterday() });
  const lateOk = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Psalm study', dueAt: yesterday(), allowLate: true });
  const learnerPage = await (await browser.newContext()).newPage();
  const lecturerPage = await (await browser.newContext()).newPage();

  await signIn(learnerPage, learner.email, learner.password);
  await expect(learnerPage).toHaveURL(/\/learner\/dashboard$/);
  await learnerPage.goto(`/learner/courses/${course.id}/assignments/${closed.id}`);
  await expect(learnerPage.getByText('The due date has passed and this assignment does not accept late answers.')).toBeVisible();
  await expect(learnerPage.getByLabel('Text answer')).toHaveCount(0);

  // Late answers allowed: accepted and marked late (never penalised).
  await learnerPage.goto(`/learner/courses/${course.id}/assignments/${lateOk.id}`);
  await expect(learnerPage.getByText('The due date has passed. Your answer will be accepted and marked late.')).toBeVisible();
  await learnerPage.getByLabel('Text answer').fill('Psalm 23 speaks of care.');
  await learnerPage.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(toast(learnerPage, 'Submitted late')).toBeVisible();
  await expect(learnerPage.locator('[data-slot="version-list"]').getByText('Late', { exact: true })).toBeVisible();

  // The lecturer's list: the learner's branch chip and status; an extension for the closed one.
  await signIn(lecturerPage, lecturer.email, lecturer.password);
  await expect(lecturerPage).toHaveURL(/\/lecturer\/dashboard$/);
  await lecturerPage.goto(`/lecturer/courses/${course.id}/assignments/${closed.id}/submissions`);
  await expect(lecturerPage.getByRole('heading', { name: 'Submissions: Prayer journal' })).toBeVisible();
  await expect(lecturerPage.locator('[data-slot="branch-chip"]').filter({ visible: true }).filter({ hasText: 'Kumasi' })).toHaveCount(1);
  await expect(lecturerPage.getByText('Not submitted').filter({ visible: true })).toHaveCount(1);
  await expectNoAxeViolations(lecturerPage);
  await lecturerPage
    .getByRole('button', { name: `Extension for Esi Owusu${tag}` })
    .filter({ visible: true })
    .click();
  const dialog = lecturerPage.getByRole('dialog', { name: `Extension for Esi Owusu${tag}` });
  const until = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 16);
  await dialog.getByLabel('New due date and time').fill(until);
  await dialog.getByLabel('Reason (optional)').fill('Family bereavement');
  await dialog.getByRole('button', { name: 'Save extension' }).click();
  await expect(toast(lecturerPage, 'Extension granted')).toBeVisible();
  await expect(lecturerPage.getByText(/\(extended\)/).filter({ visible: true })).toHaveCount(1);

  // The learner can now answer on time.
  await learnerPage.goto(`/learner/courses/${course.id}/assignments/${closed.id}`);
  await learnerPage.getByLabel('Text answer').fill('I pray each morning.');
  await learnerPage.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(toast(learnerPage, 'Submission received')).toBeVisible();

  // The lecturer opens the answer.
  await lecturerPage.reload();
  await lecturerPage
    .getByRole('link', { name: `View answer from Esi Owusu${tag}` })
    .filter({ visible: true })
    .click();
  await expect(lecturerPage.getByRole('heading', { name: `Esi Owusu${tag}` })).toBeVisible();
  await expect(lecturerPage.getByText('I pray each morning.')).toBeVisible();
  await expect(lecturerPage.getByText('(Family bereavement)')).toBeVisible();
  await expectNoAxeViolations(lecturerPage);
  expect(await horizontalOverflow(lecturerPage)).toBeLessThanOrEqual(0);
  await learnerPage.context().close();
  await lecturerPage.context().close();
});

test('an upload interrupted by a dropped connection carries on and says "Upload resumed"', async ({ page }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const learner = await createAccount({ first: 'Yaw', second: `Darko${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Prayer ${tag}` });
  await enrolFixture(course.id, learner.id, lecturer.id);
  const assignment = await createAssignmentFixture({ courseId: course.id, ownerId: lecturer.id, title: 'Voice reflection', dueAt: in7days() });
  await signIn(page, learner.email, learner.password);
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  // The signal drops as the file's bytes start to go: the device goes offline and that attempt fails.
  // (Offline, not only a cut request: WebKit can send a cut request again by itself, so the page never
  // saw the cut and the test failed now and then in CI run 42661619134.) Then the signal comes back.
  let cut = false;
  await page.route('**/storage/v1/upload/resumable/**', async (route) => {
    if (!cut && route.request().method() !== 'OPTIONS') {
      cut = true;
      await page.context().setOffline(true);
      await route.abort('internetdisconnected');
      return;
    }
    await route.continue();
  });
  await page.goto(`/learner/courses/${course.id}/assignments/${assignment.id}`);
  await page.getByRole('tab', { name: 'Upload' }).click();
  await page.getByTestId('answer-audio-input').setInputFiles({ name: 'reflection.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from(mp3({ frames: 300 })) });
  await expect.poll(() => cut).toBe(true);
  // The signal stays away for a moment: anything sent meanwhile fails too, so the app sees the drop.
  await page.waitForTimeout(1500);
  await page.context().setOffline(false);
  await expect(toast(page, 'Upload resumed')).toBeVisible();
  await expect(page.locator('[data-slot="upload-row"][data-status="ready"]').filter({ hasText: 'reflection.mp3' })).toBeVisible();
  expect(cut).toBe(true);
});

test("a lecturer records lesson audio in the app and it becomes the lesson's audio (ADR-007)", async ({ page }) => {
  const tag = unique();
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${tag}` });
  const course = await createCourseFixture({ ownerId: lecturer.id, title: `Church History ${tag}` });
  const lesson = await createLessonFixture({ courseId: course.id, ownerId: lecturer.id, title: 'The early church' });
  await fakeMicrophone(page);
  await signIn(page, lecturer.email, lecturer.password);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  await page.goto(`/lecturer/courses/${course.id}/lessons/${lesson.id}`);
  await page.getByRole('button', { name: 'Record audio' }).click();
  if (!(await canRecord(page))) {
    await expect(page.getByText(/cannot record here/)).toBeVisible();
    return;
  }
  await expect(page.getByText('Up to 30 minutes (100 MB).', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.getByRole('button', { name: 'Use recording' }).click();
  await expect(toast(page, 'Recording saved')).toBeVisible();
  await expect(toast(page, 'Audio ready')).toBeVisible();
  await expect(page.locator('[data-slot="lesson-audio-item"]').filter({ hasText: /Recording / })).toHaveCount(1);
});
