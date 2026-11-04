# Phase 4: Profiles, user management and avatars

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** No path lets a non-administrator change a role; every admin action audited; avatar and image pipeline.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- `profile-images` bucket and policies; image validation; upload and replace in Profile Settings.
- Administrator: user list with search and filters, suspend/reactivate/deactivate, `set-user-role`, `provision-lecturer`, course-creation permission toggle, and one-time bootstrap-administrator script with a written recovery procedure.
- Implement D32: session limits, session revocation on suspension and deactivation, `reset-admin-mfa`, and an audited recovery procedure. The bootstrap mechanism is disabled after successful provisioning, and the system refuses production launch checks unless two active ADMIN accounts exist.
- `bulk-import-learners` with preview and error report.
- User management and import preview use `ResponsiveTable`: stacked cards with avatar, name, role and status on phones; filters open in a bottom sheet.

**Tests required**

- A non-administrator cannot change any role at database, function and UI level.
- Avatar upload rejects wrong type and oversize; initials show when image is missing.
- Every administrator action produces an audit record.
- Idle and absolute session limits behave as D32 (using shortened test values); suspension revokes sessions; `reset-admin-mfa` is rate-limited and audited.
- Profile images use the D18 pipeline: a PENDING or REJECTED image is never shown, and replacing an image leads to removal of the old object.

**Exit gate (all must pass)**

- Bootstrap procedure documented and tested on staging.

Git tag on completion: `phase-4-done`

## Evidence to save in `docs/acceptance/phase-04.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
