import { expect, test } from '@playwright/test';

// D36 and RESPONSIVE.md 15.6: inside WhatsApp, Facebook, Instagram or TikTok the app shows an
// "Open in Safari or Chrome" notice that never blocks the page. A normal browser sees nothing.

const IN_APP = {
  Instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 320.0.0.0',
  WhatsApp: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 WhatsApp/2.24.1',
};

for (const [app, userAgent] of Object.entries(IN_APP)) {
  test(`inside ${app} the notice appears without blocking the page`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ ...testInfo.project.use, userAgent });
    const page = await context.newPage();
    await page.goto('/');
    const notice = page.getByRole('region', { name: 'Notice' });
    await expect(notice).toContainText('Open this page in Safari or Chrome.');
    await expect(notice).toContainText(`${app} browser`);
    await expect(page.getByRole('heading', { level: 1, name: 'DDTC LMS' })).toBeVisible();
    await notice.getByRole('button', { name: 'Dismiss notice' }).click();
    await expect(notice).toHaveCount(0);
    await context.close();
  });
}

test('a normal browser sees no notice', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'DDTC LMS' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Notice' })).toHaveCount(0);
});
