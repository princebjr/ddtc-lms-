# Phase 7: Assignments and instruction audio

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** Database CHECKs for instruction types, category weights, snapshot behaviour.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Migrations for `grade_categories`, `assignments`, `submission_extensions`.
- Assignment editor with all fields in Section 5, instruction-type validation (TEXT needs text; AUDIO needs audio; TEXT_AND_AUDIO needs both), category selection, publish.
- `assignment-instructions-audio` bucket, separate from lesson audio but using the same D18 registry and validation pipeline.
- Learner assignment list and due-date view.
- ADR-009 (owner, 2026-11-07): every assignment accepts text and audio answers whatever the instruction type; the lecturer may also allow PDF and Word (`accepted_formats` always contains TEXT and AUDIO).

**Added before this phase deploys (owner request 2026-11-07)**

- D42, ADR-010: learner branches. Migration for `branches` (six seeded) and `profiles.branch_id`; the learner's Branch drop-down on Profile settings (native picker on phones); branch chips and Branch filters on the administrator's Users, Learners and Enrolments lists; the administrator changes a learner's branch in the user panel; the course Learners tab shows each learner's branch.
- D43, ADR-011: idle sign-out after 10 minutes for every role (`IdleSessionProvider`, `useIdleTimeout`, `IdleWarningDialog` with Continue Session), settings `idle_timeout_minutes` and `idle_warning_seconds`, the administrators' server activity check at 10 minutes, drafts for the lesson and assignment editors, and the evidence of the Auth token expiry (600 s).
- ADR-012: sign-in screens: the travelling light round the emblem's circle on Sign In, Sign Up and two-step verification, the glowing verification card, the name with "(HOJ)", the Twi tagline and the copyright line.

**Tests required**

- Database CHECKs reject invalid instruction combinations; only the course's lecturers manage assignments; learners see only published assignments of enrolled courses; instruction audio is denied to everyone else.
- D42 (pgTAP 15): a learner sets and changes only their own branch; unknown or closed branches are refused; learners never read another learner's branch; lecturers see the branch only for learners of their own courses; an AAL1 administrator cannot change it, an AAL2 administrator can (and nothing else); role and status stay protected; every change is audited; a branch in use cannot be deleted. Component and end-to-end tests: choose, save, reload; chips and filters; the administrator's change; the lecturer's view; keyboard, axe and 320 px.
- D43: Vitest with fake timers (warning at 8 minutes, Continue Session resets, sign-out at 10, every activity type resets, media, recording and upload keep the session, polling and token refresh do not, settings apply, sign-out at once after a simulated 11-minute sleep, two tabs share one clock); Playwright with `page.clock` for each role (redirect with the message, protected routes closed afterwards, Back reveals nothing, drafts restored, dialog accessibility).

**Exit gate (all must pass)**

- Category weights must total 100 before any grade can be released (tested).
- Branch rules proven for every role (pgTAP 15) and the branch screens pass end to end on every device project.
- Idle sign-out works for every role with the warning, Continue Session and draft restore, and never signs out someone who is active.

Git tag on completion: `phase-7-done`

## Evidence to save in `docs/acceptance/phase-07.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
