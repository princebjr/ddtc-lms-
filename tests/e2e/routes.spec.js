import { expect, test } from '@playwright/test';
import {
  collectConsoleErrors,
  expectNoAxeViolations,
  horizontalOverflow,
  isPhoneProject,
  openRoute,
  ROUTES,
  undersizedTargets,
} from './helpers.js';

// Phase 1 "Tests required": on every Section 15 device project, in light and dark, every route
// loads with no console errors, no axe violations and no horizontal overflow; on phones every
// interactive element is at least 44 by 44 px. The 320 to 1920 px width sweep is in
// width-sweep.spec.js.

for (const path of ROUTES) {
  test(`route ${path}: loads cleanly, accessible, no overflow`, async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await openRoute(page, path);

    expect(await horizontalOverflow(page), 'no horizontal page scroll').toBeLessThanOrEqual(0);
    await expectNoAxeViolations(page);
    if (isPhoneProject(testInfo)) {
      expect(await undersizedTargets(page), 'touch targets at least 44 by 44 px').toEqual([]);
    }
    expect(errors, 'no console errors').toEqual([]);
  });
}
