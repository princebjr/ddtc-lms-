# Phase 13: Hardening, accessibility, performance and recovery

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** Policy-by-policy review, axe in both themes, Lighthouse budgets, restore drill, real-device matrix.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Line-by-line review of every RLS and Storage policy against Section 7, including direct-ID tampering, cross-course access, signed URL expiry, unpublished resources, invalid file states, and attempts to alter role/score/deadline through direct API calls.
- Dependency audit, security headers and CSP, secret scan, rate-limit review.
- Accessibility to WCAG 2.1 AA: axe in Playwright, keyboard-only pass, screen-reader pass on forms, audio controls and charts.
- Indexes for results and gradebook queries, pagination everywhere, load test with realistic class sizes.
- Meet the Section 15 performance budgets on a throttled mid-range Android profile; Lighthouse CI thresholds enforced; run the full real-device matrix; screen-reader pass with VoiceOver on iPhone and TalkBack on Android.
- Daily database backups plus scheduled Storage backup; error monitoring and uptime alerts. Document the approved D34 values; alert on failed backup, restore, upload cleanup, retention or email delivery jobs.

**Tests required**

- Restore drill on staging: restore database and Storage, verify object/database consistency, then run the acceptance journey; all suites green. Record duration and data-loss window against the D34 RPO and RTO.

**Exit gate (all must pass)**

- No high-severity findings open.
- Restore drill documented and successful.

Git tag on completion: `phase-13-done`

## Evidence to save in `docs/acceptance/phase-13.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
