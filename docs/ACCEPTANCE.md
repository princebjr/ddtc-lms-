# DDTC LMS: Acceptance journey

Extract of `docs/BUILD_PLAN.md` v1.7. If this file and BUILD_PLAN.md ever differ, BUILD_PLAN.md wins; report the conflict.

## 11. Self-contained acceptance journey

Run this complete end-to-end journey in staging before production, and repeat the applicable smoke checks after deployment. Record evidence and pass/fail for every step. Use seeded test accounts for all three roles and real mobile devices for media tests.

1. Register a learner by email; verify the email; sign in; confirm no course is visible before enrolment.
2. Register a learner by email; verify the email; test first sign-in, wrong password, duplicate email, password reset and unverified-email handling. Then test Continue with Google on Sign In and Sign Up (new account, existing learner, ADMIN or LECTURER email refused, missing name, cancelled prompt). Confirm a self-registered user can never become ADMIN or LECTURER.
3. Sign in as administrator with MFA; verify AAL1 is denied for every privileged operation; test the D32 idle and absolute timeouts, sign-out, suspension, deactivation, `reset-admin-mfa` and the documented recovery procedure.
4. Administrator provisions a lecturer and toggles course-creation permission; lecturer without permission is denied creation; granting permission enables creation.
5. Lecturer creates a course, adds a co-lecturer, submits for approval; learner cannot see it before approval; administrator returns it with reason and then approves it.
6. Revoke the owner’s course-creation permission and verify existing course access remains; transfer ownership and verify all course records and permissions remain correct.
7. Lecturer creates and reorders lessons, text content, multiple audio versions and attachments; test validated playback/download and denial for unpublished, pending, rejected, un-enrolled and cross-course access.
8. Lecturer publishes an assignment with text/audio instructions, category, maximum marks and due date; verify assignment snapshots and change warnings.
9. Learner submits text, records audio, uploads audio and uploads PDF/DOCX; test file signatures, limits, retries, duplicate requests, version history, late policy and extensions. Verify no learner can read or overwrite another learner’s files.
10. Lecturer grades and releases one submission and a whole assignment; learner sees nothing before release and sees score, percentage, band and feedback after release.
11. Change a released grade with a reason; verify immutable grade history, audit log, recalculated gradebook/chart, and learner notification.
12. Verify grade calculations with fixtures covering missing-as-zero on/off, future assignments, submitted-but-ungraded work, weighted categories, rounding, empty categories and band boundaries. Verify exports match the on-screen server-calculated values.
13. Verify notification deduplication, due-date reminders, changed deadlines, email preferences, provider failures and retry behaviour.
14. Run retention in dry-run; verify no file is deleted. On staging set `retention_days` to 0 with seeded fixtures and test holds, eligibility, failed deletion and retry; confirm only eligible learner-submitted audio is removed. Restore the production values (`retention_days` 180, `retention_enabled` false) and verify them.
15. Test profile and course-cover uploads, account deactivation, archive behaviour, audit/report permissions, backup restore, accessibility, responsive layouts and production rollback.

Acceptance passes only when all expected allow/deny cases pass, the test evidence is saved in `docs/acceptance/`, and DDTC signs off in `docs/DECISIONS.md`.

## 14. Acceptance and change control

When DDTC accepts this document, add `BUILD_PLAN v1.5 accepted — YYYY-MM-DD` with the date to `docs/DECISIONS.md`. Acceptance means all decisions in Section 3 and all mandatory release gates are accepted. Only a written Architecture Decision Record (ADR) may change Section 3. Each ADR must state the decision, reason, impact on schema/security/data migration, tests, rollout and rollback.

Do not begin production release while any blocker in Section 4 remains unresolved. Items may be marked “not applicable” only with a written reason and approval. Future features in Section 2 are not implied commitments for this release.

**Evidence:** save results for every step in `docs/acceptance/` (one file per run: date, build, device, step, pass or fail, screenshots or logs). Acceptance passes only when every step passes on staging and again on production.
