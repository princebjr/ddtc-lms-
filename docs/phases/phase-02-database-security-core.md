# Phase 2: Database foundation and security core

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** The pgTAP allow/deny matrix is the product of this phase: every table, every role, AAL1 versus AAL2.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Migrations: enums, `profiles`, `system_settings` (seeded with all defaults), `audit_logs`, `notification_preferences`, and the initial `file_objects` registry schema or a migration explicitly scheduled before any upload feature.
- Define unique constraints, foreign keys, indexes, timestamp triggers, immutable history patterns and audit strategy. Keep critical rules enforced in PostgreSQL or trusted server functions, not only in UI.
- Trigger on `auth.users` creating a LEARNER, ACTIVE profile from the first name and second name supplied at email sign-up, or from the Google profile (given and family name); email sign-up is rejected if either name is empty, and a Google sign-up with a missing name sets `profile_completed` to false. The role is never taken from client data.
- SECURITY DEFINER helper functions with fixed `search_path`: `is_admin`, `is_lecturer_of`, `is_enrolled`.
- Column protection so `role`, `can_create_courses` and `account_status` cannot be changed by the user.
- Append-only audit logging; seed script with one administrator, two lecturers, three learners.

**Tests required**

- pgTAP: a learner cannot change own role or status; cannot read other profiles; cannot write or read audit logs; sign-up always yields LEARNER even if the client sends another role; a sign-up with an empty first or second name is rejected; a Google-style sign-up with no family name yields `profile_completed` = false; every ADMIN policy denies an AAL1 session.

**Exit gate (all must pass)**

- All pgTAP tests pass in CI.

Git tag on completion: `phase-2-done`

## Evidence to save in `docs/acceptance/phase-02.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
