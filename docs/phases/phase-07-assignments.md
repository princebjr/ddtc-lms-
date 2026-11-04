# Phase 7: Assignments and instruction audio

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** Database CHECKs for instruction types, category weights, snapshot behaviour.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Migrations for `grade_categories`, `assignments`, `submission_extensions`.
- Assignment editor with all fields in Section 5, instruction-type validation (TEXT needs text; AUDIO needs audio; TEXT_AND_AUDIO needs both), category selection, publish.
- `assignment-instructions-audio` bucket, separate from lesson audio but using the same D18 registry and validation pipeline.
- Learner assignment list and due-date view.

**Tests required**

- Database CHECKs reject invalid instruction combinations; only the course's lecturers manage assignments; learners see only published assignments of enrolled courses; instruction audio is denied to everyone else.

**Exit gate (all must pass)**

- Category weights must total 100 before any grade can be released (tested).

Git tag on completion: `phase-7-done`

## Evidence to save in `docs/acceptance/phase-07.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
