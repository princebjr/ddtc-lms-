# Phase 5: Courses, lecturers and enrolment

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** Cross-lecturer isolation, enrolment states, approval lifecycle, archive read-only behaviour.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Migrations for `courses`, `course_lecturers`, `course_enrollments` with the constraints in Section 5.
- `create-course`; lifecycle DRAFT, PENDING_APPROVAL, PUBLISHED, ARCHIVED per D04; archive keeps all records.
- Lecturer: My Courses, Create New Course when permitted, Course Editor, and workspace tabs (Overview, Lessons, Assignments, Learners, Gradebook, Analytics, Settings).
- Administrator can grant/revoke `can_create_courses`; revocation blocks creation only and does not remove current course assignments. Provide owner transfer, course lecturer management, and reassignment workflow when a lecturer is deactivated. Preserve all course history and data.
- Administrator: course oversight, approval queue, enrolment management (including marking enrolments COMPLETED).

**Tests required**

- Lecturer A cannot read or edit lecturer B's course; draft and pending courses are invisible to learners; duplicate course code and duplicate active enrolment are rejected; learner without enrolment sees nothing; a COMPLETED enrolment and an ARCHIVED course are read-only for learners as in D05 and D07.

**Exit gate (all must pass)**

- All course and enrolment pgTAP and Playwright tests pass.

Git tag on completion: `phase-5-done`

## Evidence to save in `docs/acceptance/phase-05.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
