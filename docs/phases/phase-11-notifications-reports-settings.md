# Phase 11: Notifications, reports, audit viewer and settings

**Owner request (2026-11-06) to include here once its open questions are answered:** see `docs/requests/2026-11-06-presence-and-assignment-reports.md`.

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** Notification recipients, retry schedule, deduplication, settings audited.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- From Phase 9 (ADR-014): the `notifications` table exists with GRADE_RELEASED and GRADE_UPDATED rows (deduplication key `grade-release:{submission}:{n}`, `link_path` for View); add the other D21 types and `notification_deliveries`, send grade emails from these rows, and replace the learner's "New grade available" check (`GradeNotices`, once per tab) with the notification centre and its unread count, keeping the toast.
- From Phase 10 (ADR-015): the setting `missing_as_zero` (D11, default false) exists in `system_settings` and `calculate_course_grades` already obeys it (pgTAP 22). Add it to the administrator Settings screen (owner decision 5 of 2026-11-10) with a plain explanation (off: overdue work with nothing sent is Missing and not counted; on: it counts as 0 until a late answer is sent), audited like the other settings. The per-assignment performance report export (owner request 2026-11-06) is built in `export-gradebook`; the Reports page may link to it rather than build a second one.
- From Phase 8 (ADR-013): an administrator alert for files that keep failing to be removed (`public.cleanup_failures()`, 3 failures or more; until then the runbook shows the SQL), and notifications for extensions granted, changed and taken back (the audit log already records them).

- Notification centre and preferences; emails through `send-notification-email` for the events in D21. Implement the delivery worker, retry schedule, reminder scheduler and deduplication in D31 and Section 8, using `notification_deliveries`.
- Administrator dashboard: active learners, lecturers, courses, pending approvals, active enrolments, recent submissions, grading backlog, recent grade releases, and recent administrative/security events.
- Lecturer dashboard: courses owned/taught, pending approval, ungraded submissions, upcoming deadlines, course performance summaries, and quick gradebook/course creation actions.
- Learner dashboard: current and completed courses, upcoming deadlines, missing/submitted work, recent released grades, and lesson progress.
- Administrator reports (enrolment, activity, completion, grade summaries) and audit log viewer with filters.
- Settings screen exposing every `system_settings` value with validation and audit.
- All dashboards, the notification centre, reports and the audit viewer follow Section 15 (cards, bottom sheets, no overflow).
- D42 (ADR-010): reports filter by branch and group by branch (learner count and average grade per branch). D43 (ADR-011): Settings lets an administrator change `idle_timeout_minutes` (5 to 60) and `idle_warning_seconds`, audited.

**Tests required**

- Notifications reach only their recipient; audit viewer is administrator-only; changing a setting takes effect and is audited.
- Retry schedule of 1, 5, 15, 60 and 240 minutes then FAILED with an alert; permanent failures are not retried; duplicate events create one notification; changing a deadline or extension replaces the pending reminder.

**Exit gate (all must pass)**

- Due-date reminder fires once, 24 hours before the effective due date.

Git tag on completion: `phase-11-done`

## Evidence to save in `docs/acceptance/phase-11.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
