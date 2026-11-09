# Phase 9: Grading, feedback and history

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** Release gating, grade history immutability, results table including non-submitters, counts add up.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Grading screen: read text, play audio, open documents, score, feedback, save draft, release.
- Trigger enforcing 0 <= score <= max_marks; `grade_change_history` written by trigger; reopen flow.
- `release-grades` per submission and per assignment; notifications on release. Any score/feedback change after release records prior and new values, reason, actor and timestamp, and notifies the learner; results update automatically because grades are computed on read (D30).
- Add a clear “Reopen grade” workflow with a required reason and immutable history; re-releasing updated grades follows D30.
- Assignment results dashboard built from `course_enrollments` left-joined to submissions, with search, sort, filter, counts (enrolled, submitted, graded, ungraded, missing) and avatars. On phones the table becomes cards and the grading screen stacks the submission above the grading panel with a sticky Save and Release bar; on tablets and desktops it is two panes.
- D42 (ADR-010): the grading header shows the learner's branch chip beside their name, photo and ID number; submission review and results lists show it too.
- Built in Phase 8 to start from: the submission list per assignment (`assignment_submissions()`: every learner, branch, status, latest version, lateness, effective due date, Extension) and the read-only answer view (`submission_review()`: every version with text, recordings and documents) at `/:role/courses/:courseId/assignments/:assignmentId/submissions[/:learnerId]`; the grading panel and the results counts join them here. The grading columns of `submissions` (score, feedback, graded_by, graded_at) exist but no client can read or write them yet: open them here (learners only after release, D16). A REOPENED answer may be sent again before the effective due date (ADR-013).

**Tests required**

- A pending upload older than 24 hours is removed by `cleanup-files`, while lesson audio and VALIDATED submission files are untouched.
- Out-of-range scores rejected; every grade or feedback change appears in history; learners see nothing before release and never another learner's grade; learners who never submitted appear in results as missing.

**Exit gate (all must pass)**

- Counts always add up to the enrolled total (tested).

Git tag on completion: `phase-9-done`

## Evidence to save in `docs/acceptance/phase-09.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
