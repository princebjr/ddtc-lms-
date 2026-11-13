import { expect as baseExpect, test } from '@playwright/test';
import { dismissToasts, expectNoAxeViolations, horizontalOverflow } from './helpers.js';
import { createAccount } from './support/accounts.js';
import { requireSupabase } from './support/local-supabase.js';
import { signIn, signInNewAdmin } from './support/ui.js';

// Help & Support (owner request 2026-11-13, ADR-027), on every device project, light and dark:
// an administrator sets the support email and phone on Settings; a learner opens Help & Support from the card on
// their dashboard, finds the four sections, opens a question, and sees the contact as working links.
// A lecturer's dashboard has the card too.

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 240_000 });

test.beforeAll(() => {
  requireSupabase();
});

/** Sets a setting back with the service role, so a test never leaves a changed value behind. @param {string} key @param {unknown} value */
async function restoreSetting(key, value) {
  const s = requireSupabase();
  await fetch(`${s.url}/rest/v1/system_settings?key=eq.${key}`, {
    method: 'PATCH',
    headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
}

const unique = () => Math.random().toString(36).slice(2, 8);

test('an administrator sets the support contact and a learner finds it in Help & Support', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  try {
    await signInNewAdmin(admin, { first: 'Grace', second: `Admin${unique()}` });
    await admin.goto('/admin/settings');
    await dismissToasts(admin);
    const email = admin.getByLabel('Support email');
    await email.fill('support@ddtc.example');
    await email.locator('xpath=ancestor::*[@data-setting][1]').getByRole('button', { name: 'Save' }).click();
    await expect(admin.locator('[data-toast-id]').filter({ hasText: 'Setting saved' }).first()).toBeVisible();
    await dismissToasts(admin);
    const phone = admin.getByLabel('Support phone and WhatsApp');
    await phone.fill('+233 24 123 4567');
    await phone.locator('xpath=ancestor::*[@data-setting][1]').getByRole('button', { name: 'Save' }).click();
    await expect(admin.locator('[data-toast-id]').filter({ hasText: 'Setting saved' }).first()).toBeVisible();
    await adminContext.close();

    const learner = await createAccount({ first: 'Kwame', second: `Mensah${unique()}` });
    const page = await (await browser.newContext()).newPage();
    await signIn(page, learner.email, learner.password);
    await expect(page).toHaveURL(/\/learner\/dashboard$/);
    const card = page.getByRole('region', { name: 'Help & Support' });
    await expect(card).toBeVisible();
    await card.getByRole('link', { name: 'Contact Support' }).click();
    await expect(page).toHaveURL(/\/learner\/help#contact$/);
    await expect(page.getByRole('heading', { name: 'Help & Support', level: 1 })).toBeVisible();
    for (const name of ['Getting Started', 'How to Use DDTC', 'Frequently Asked Questions', 'Contact Support']) {
      await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
    }
    const contact = page.getByRole('region', { name: 'Contact Support' });
    await expect(contact.getByRole('link', { name: /Email/ })).toHaveAttribute('href', 'mailto:support@ddtc.example');
    await expect(contact.getByRole('link', { name: /Call/ })).toHaveAttribute('href', 'tel:+233241234567');
    await expect(contact.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/233241234567');

    // A question opens in place.
    const question = page.locator('summary').filter({ hasText: 'Why was I signed out?' });
    await question.click();
    await expect(page.getByText('A warning appears 2 minutes before')).toBeVisible();

    await expectNoAxeViolations(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  } finally {
    await restoreSetting('support_email', '');
    await restoreSetting('support_phone', '');
  }
});

test('a lecturer has the Help & Support card and lecturer help', async ({ page }) => {
  const lecturer = await createAccount({ role: 'LECTURER', first: 'Ama', second: `Boateng${unique()}` });
  await signIn(page, lecturer.email, lecturer.password);
  await expect(page).toHaveURL(/\/lecturer\/dashboard$/);
  await page.getByRole('region', { name: 'Help & Support' }).getByRole('link', { name: 'How to Use DDTC' }).click();
  await expect(page).toHaveURL(/\/lecturer\/help#how-to$/);
  await expect(page.locator('summary').filter({ hasText: 'Grade answers and release grades' })).toBeVisible();
  // The contact itself is a shared setting another test may be changing at the same moment; its states are
  // covered by tests/unit/help.test.jsx.
  await expect(page.getByRole('region', { name: 'Contact Support' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
