# Phase 14: Staging acceptance and production release

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** Acceptance journey on staging then production, rollback tested, written sign-off.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Run the self-contained acceptance journey in Section 11 of this build plan on staging, using the Section 15 real-device matrix, with each role's journey run on at least one phone, one tablet and one desktop, and screenshots saved as evidence. Do not depend on Section 24 of an earlier brief.
- Pilot with a small group of real lecturers and learners using test courses.
- Production: apply migrations, create buckets and policies from code, configure Auth, SMTP, CAPTCHA and MFA, run the bootstrap procedure, deploy over HTTPS, verify environment variables.
- Runbook: backup and restore, adding/deactivating a lecturer, course-owner transfer, changing settings, administrator recovery, email delivery failures, pending-upload cleanup, enabling retention, second-administrator and MFA reset procedure, incident response and escalation contacts.

**Tests required**

- Acceptance journey passes on staging and again on production; production smoke tests pass; rollback tested.

**Exit gate (all must pass)**

- Written sign-off in `docs/DECISIONS.md`.
- Real-device matrix completed with no open layout, audio, recording, download or sign-in defects.
- Retention stays in dry-run for the first 30 days.

Git tag on completion: `v1.0.0` (the release version, independent of this document's version)

## Evidence to save in `docs/acceptance/phase-14.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
