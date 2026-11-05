import { expect, test } from '@playwright/test';
import { horizontalOverflow, openRoute, ROUTES, SWEEP_WIDTHS } from './helpers.js';

// Phase 1 "Tests required": the no-horizontal-overflow test (document scroll width must not exceed
// viewport width) runs on every route at 320, 375, 768, 1024, 1280 and 1920 px. playwright.config.js
// runs this file on the three desktop engines (Chromium, Firefox, WebKit) in light and dark; every
// other device project checks overflow at its own viewport in routes.spec.js.

for (const path of ROUTES) {
  test(`route ${path}: no horizontal overflow at ${SWEEP_WIDTHS.join(', ')} px`, async ({ page }) => {
    await openRoute(page, path);
    for (const width of SWEEP_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction((w) => window.innerWidth === w, width);
      expect(await horizontalOverflow(page), `overflow at ${width} px`).toBeLessThanOrEqual(0);
    }
  });
}
