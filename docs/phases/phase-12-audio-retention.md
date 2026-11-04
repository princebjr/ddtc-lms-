# Phase 12: Assignment-audio retention

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** Retention can never touch lesson audio, instruction audio, attachments or held files; dry run changes nothing.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Migrations for `retention_holds` and `retention_runs`; hold management screen for administrators.
- `retention-runner` via `pg_cron`, implementing D20 exactly; dry-run mode default; deletes one object at a time by exact stored path; sets `file_objects.status` to DELETED or DELETE_FAILED; records every outcome; safe retries.

**Tests required**

- On staging with `retention_days` set to 0 and seeded fixtures, only eligible learner-submitted audio is deleted; production keeps `retention_days` at 180.
- Never deletes lesson audio, instruction audio, attachments, text, PDF or Word files; never deletes ungraded, unreleased, held or too-recent files; submission, grade and history rows survive; failed deletions are logged and retried; dry-run changes nothing.

**Exit gate (all must pass)**

- Retention stays disabled (`retention_enabled` = false) until after Phase 14 review.

Git tag on completion: `phase-12-done`

## Evidence to save in `docs/acceptance/phase-12.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
