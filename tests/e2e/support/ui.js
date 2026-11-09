import { expect } from '@playwright/test';
import { createAccount, totp } from './accounts.js';

// Sign-in steps and list searches shared by the end-to-end specs.

/**
 * Types into a list's search box and waits until the list shows only the matching rows (counted by
 * their visible "Manage" buttons). The filtered results replace the unfiltered first page, so a
 * click made before then can land where a row used to be (CI, main run 42437932103).
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @param {number} [rows] how many rows match
 */
export async function searchList(page, text, rows = 1) {
  await page.getByLabel('Search').fill(text);
  await expect(page.getByRole('button', { name: /^Manage / })).toHaveCount(rows);
}

/** @param {import('@playwright/test').Page} page @param {string} email @param {string} password */
export async function signIn(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

/**
 * A fresh administrator, signed in through the UI with two-step verification enrolled.
 * @param {import('@playwright/test').Page} page
 * @param {{ first?: string, second?: string }} [names] unique names keep parallel tests apart
 */
export async function signInNewAdmin(page, names = {}) {
  const account = await createAccount({ role: 'ADMIN', first: names.first ?? 'Grace', second: names.second ?? 'Admin' });
  await signIn(page, account.email, account.password);
  await expect(page.getByRole('heading', { name: 'Set up two-step verification' })).toBeVisible({ timeout: 15_000 });
  const secret = (await page.getByTestId('totp-secret').textContent())?.trim() ?? '';
  await page.getByLabel('Verification code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/, { timeout: 15_000 });
  return account;
}
