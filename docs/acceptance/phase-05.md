# Phase 5 acceptance evidence: Courses, lecturers and enrolment

- Phase file: `docs/phases/phase-05-courses-lecturers-enrolment.md`
- Branch and pull request: `phase-5-courses-enrolment`, https://github.com/princebjr/ddtc-lms-/pull/9
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-06
- Plan approved by the owner on 2026-11-06 with four decisions, recorded as ADR-005 in `docs/DECISIONS.md`: administrators and lecturers both create courses; per-lecturer "Publish without approval"; course covers through the profile-photo pipeline; an optional course column in the CSV import.

## 1. What was built

| Build item (phase file) | Where |
|---|---|
| `courses`, `course_lecturers`, `course_enrollments` with the Section 5 constraints (unique course code, one active OWNER, one current enrolment per learner and course, every foreign key `ON DELETE RESTRICT`) | migration `20261106000100_courses.sql` |
| `private.is_lecturer_of`, `private.is_enrolled` (SECURITY DEFINER, `search_path = ''`), plus `private.is_actively_enrolled` (the only state in which learners may write in later phases) and `private.can_see_course` | same migration; `supabase/tests/07_courses_access.test.sql` |
| Lecturer access to "learners of own courses (name, avatar)" | `public.course_roster()` returns names and photo paths only; see section 6 for why this is a function and not a profiles policy |
| `create-course`; lifecycle DRAFT, PENDING_APPROVAL, PUBLISHED, ARCHIVED (D04); archive keeps all records | trusted functions in `20261106000200_course_functions.sql`; Edge Functions `create-course`, `course-lifecycle` |
| Lecturer: My Courses, New course when permitted, the course editor and workspace tabs (Overview, Lessons, Assignments, Learners, Gradebook, Analytics, Settings) | `src/pages/courses/`; Lessons, Assignments, Gradebook and Analytics show the phase that builds them |
| Grant and revoke `can_create_courses` (revocation blocks creation only); owner transfer; course lecturer management; reassignment when a lecturer is deactivated | user panel and Lecturers list (Phase 4 switch); Settings tab (add or remove co-lecturer, transfer); `admin_set_user` refuses to deactivate or re-role a lecturer who owns a course that is not archived, and the user panel's hand-over dialog transfers each course first |
| Administrator: course oversight, approval queue, enrolment management (including COMPLETED) | `src/pages/courses/CoursesPage.jsx`, `src/pages/admin/ApprovalsPage.jsx`, `src/pages/admin/EnrolmentsPage.jsx` |
| ADR-005: administrators create courses for a lecturer; "Publish without approval" per lecturer (user panel, and a tick box when approving) | `create-course`, `set-user-role` + `admin_set_direct_publish`, `course_transition` |
| ADR-005: course covers (D18) | `course-covers` bucket and `course_cover_paths()` in `20261106000300_course_covers.sql`; `register-upload`, `finalize-upload` |
| ADR-005: CSV import with an optional `course_code` column | `bulk-import-learners`, `src/lib/admin/csv.js`, Import CSV panel |
| Learner My Courses and course overview, lecturer and learner dashboards, course counts on the administrator dashboard | `src/pages/learner/`, `src/pages/lecturer/`, `AdminDashboardPage.jsx` |
| Owner requests during the phase: every dashboard greets the person by time of day in Ghana and first name ("Good morning, Ama"; morning from midnight to noon, afternoon to 5 pm, then evening); the phone top bar shows the emblem with "DDTC" in bold instead of the page title | `src/lib/greeting.js` (unit-tested), the three dashboards, `AppShell.jsx`; `auth.spec.js` now expects the greeting |
| Staging | the 3 migrations pushed and 8 Edge Functions deployed on 2026-11-06 with the owner's approval; checked read-only afterwards: RLS on all three tables, 9 functions present, `course-covers` private, clients cannot call the trusted functions |

## 2. `npm run verify`

Local results on 2026-11-06 (Windows, local Supabase):

| Suite | Result |
|---|---|
| Lint (ESLint, including the no-hard-coded-values rule) | pass |
| Type check | pass |
| Unit and component (Vitest) | 16 files, 271 tests, pass (8 new) |
| Database (pgTAP) | 9 files, 391 tests, pass (165 new: 87 access, 78 functions) |
| Edge Function integration | 3 files, 45 tests, pass (13 new) |
| End-to-end, Phase 5 spec (`tests/e2e/courses.spec.js`) | 5 flows pass on desktop Chrome locally |
| Full end-to-end matrix and Lighthouse | CI on PR #9 (see the pull request checks) |

Faults found and fixed during the phase, no test loosened:
- The course workspace and approval tabs pointed at tab panels that were not rendered (axe `aria-valid-attr-value`); the active section is now the tab panel.
- Two status pickers for the same learner and course had the same accessible name; each now includes the current status.
- `audit_profile_change` was first rewritten with different metadata keys; restored exactly, with only the new direct-publishing branch added.
- Three pgTAP counts read the whole table and broke when other tests had left rows behind; they are now scoped to each test's own rows.
- The CSV summary gained an `enrolled` count only when the file has a course column, so the Phase 4 summary shape is unchanged.

Local environment notes: on this machine the local functions runtime hits its CPU limit under four parallel browsers ("CPU time soft limit reached", workers terminated), which made two flows time out with four workers; with one worker every flow passes. Earlier in the day Windows reserved the local Supabase ports and Docker Desktop failed to start; both were fixed by the owner. CI runs on clean runners.

## 3. Tests required (phase file)

| Test | Result | Proof |
|---|---|---|
| Lecturer A cannot read or edit lecturer B's course | PASS | `07_courses_access.test.sql` (read and update denied); `courses.spec.js` (B's course is "Course not found" for A, not in A's list) |
| Draft and pending courses are invisible to learners | PASS | `07` (learner sees only PUBLISHED and ARCHIVED courses they are enrolled in); `courses.spec.js` (draft and pending not listed, draft URL is "Course not found") |
| Duplicate course code and duplicate active enrolment are rejected | PASS | `07` (unique code, case-insensitive; unique current enrolment, COMPLETED included); `08` (`course_create` 23505; `enrolment_add` skips); `courses.test.js` (409 "A course with this code already exists"); `courses.spec.js` (code message in the form; enrolling again says everyone is already enrolled) |
| A learner without enrolment sees nothing | PASS | `07` (no courses, enrolments or teaching rows); `courses.spec.js` (empty My Courses, course URL refused) |
| A COMPLETED enrolment and an ARCHIVED course are read-only for learners (D05, D07) | PASS | `07` (`is_enrolled` true but `is_actively_enrolled` false for both; learners cannot update; archived course read-only for lecturers too); `courses.spec.js` (read-only notices) |

Also covered: the approval lifecycle (submit, return with reason, approve with direct publishing, direct publish) in `08`, `courses.test.js` and `courses.spec.js`; every lifecycle, lecturer and enrolment change audited (`08`); the deactivation hand-over (`08`, `courses.test.js`); covers (`07`, `courses.test.js`).

## 4. Exit gate

| Line | Result | Proof |
|---|---|---|
| All course and enrolment pgTAP and Playwright tests pass | PASS locally (pgTAP 391 of 391; Phase 5 Playwright 5 of 5 on desktop Chrome); every device project in CI on PR #9 | sections 2 and 3 |

## 5. Screenshots

`docs/acceptance/phase-05/screens/`: 78 images, every new screen at 375, 768 and 1280 px in light and dark, signed in against the local stack with sample courses (captured with reduced motion):
- administrator: `admin-dashboard`, `admin-courses`, `admin-approvals`, `admin-enrolments`, `admin-new-course`, `admin-course-settings`;
- lecturer: `lecturer-dashboard`, `lecturer-my-courses`, `lecturer-course-overview`, `lecturer-course-learners`;
- learner: `learner-dashboard`, `learner-my-courses`, `learner-course`.

## 6. Deviations and known issues

| Item | Reason | Owner |
|---|---|---|
| "Read learners of own courses (name, avatar)" is the `course_roster()` function, not a policy on `profiles` | Row policies cannot hide columns: a policy would have shown lecturers learners' email and phone. The function returns names and photo paths only (tested: no email or phone column) | Prince Boateng (approve or ask for the policy) |
| The toast "N learners enrolled" reads "1 learners enrolled" for one learner | The text is fixed in the toast catalogue (UI_FEEDBACK); changing it needs an ADR | Prince Boateng |
| A lecturer archiving and an administrator saving a new draft reuse "Course archived" and "Draft saved" | No separate toasts are listed for these roles; the wording is the same event | Prince Boateng |
| Real-device checks (iOS Safari, Android Chrome) | Not done by Claude Code (no devices); to be recorded by the owner | Prince Boateng |
