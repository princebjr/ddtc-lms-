# Phase 7 acceptance evidence: Assignments and instruction audio

- Phase file: `docs/phases/phase-07-assignments.md`
- Branch and pull request: `phase-7-assignments`, https://github.com/princebjr/ddtc-lms-/pull/12
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-07
- Plan approved by the owner on 2026-11-07, with ADR-009 (every assignment accepts text and audio answers whatever the instruction type; PDF and Word optional). Added at the owner's request before this phase deploys, each with its plan approved: learner branches (D42, ADR-010), idle sign-out after 10 minutes (D43, ADR-011; D41 left unused), and the sign-in screen updates (ADR-012).

## 1. What was built

| Build item | Where |
|---|---|
| `grade_categories`, `assignments`, `submission_extensions`, `assignment_versions` | migration `20261107000400_assignments.sql`: every course starts with the category Assignments at 100; weights are whole numbers 0 to 100 and must total 100 before grades are released (`require_weights_total_100`, used by Phase 9); the instruction-type CHECK on publish (TEXT needs text, AUDIO needs audio, TEXT_AND_AUDIO needs both); `accepted_formats` always holds TEXT and AUDIO (ADR-009); script-like instructions refused; category, lesson and audio must belong to the assignment's course; foreign keys `ON DELETE RESTRICT` |
| Assignment editor with every Section 5 field, instruction-type validation, category, publish | `src/pages/courses/AssignmentEditorPage.jsx`; `manage-assignments` (save with instructions cleaned against the allow-list, publish with clear messages, archive and restore, save categories) and the service-role functions in `20261107000500_assignment_functions.sql` (all audited; a published assignment is snapshotted on every change with the reason, D29; deadline changes audited) |
| `assignment-instructions-audio` bucket on the D18 registry and validation | `register-upload` and `finalize-upload` (the same byte-level checks as lesson audio, 25 MB and 10 minutes), read policy for the course's lecturers and enrolled learners of published assignments |
| Learner assignment list and due-date view | `LearnerAssignmentsPage.jsx` (To do and Past due, due-date chips in Ghana time that use the learner's extension), `LearnerAssignmentPage.jsx` (instructions, audio, the accepted answer forms; submitting is Phase 8), the course page's assignments; administrators' oversight `AdminAssignmentsPage.jsx` |
| D42, ADR-010: learner branches | migration `20261107000600_branches.sql` (six branches seeded in DDTC's order; `profiles.branch_id`, learners only, open branches only, the learner's own or an AAL2 administrator's change and nothing else, audited `profile.branch_changed`, `course_roster` returns `branch_name`); the Branch drop-down on Profile settings (`BranchField`: the phone's own picker below 640 px, the shadcn Select from tablet width up, skeleton, Retry); chips and Branch filters on Users, Learners and Enrolments; the administrator's Save branch in the user panel; the course Learners tab; later screens written into the Phase 8 to 11 files |
| D43, ADR-011: idle sign-out | migration `20261107000700_idle_sign_out.sql` (settings `idle_timeout_minutes` 10, 5 to 60, and `idle_warning_seconds` 120, 30 to 180, with a CHECK; `idle_settings()` for every signed-in user; `is_admin()` refuses administrator sessions idle longer than the setting; `session_limits` keeps only the absolute lifetimes); local access tokens 600 s (`supabase/config.toml`); `IdleSessionProvider`, `useIdleTimeout`, `IdleWarningDialog`; drafts (`src/lib/drafts.js`, `use-draft.js`) in the lesson and assignment editors; keep-awake for audio playing and uploads; private caches emptied on every sign-out; Sign In's status message; `SessionWatcher` keeps D32's absolute lifetimes |
| ADR-012: sign-in screens | `AuthLayout.jsx` and `index.css`: the travelling light round the emblem's circle on Sign In, Sign Up and two-step verification (`logo-glow`), the glowing verification card, the name with "(HOJ)", the Twi tagline marked `lang="tw"`, the copyright line on Sign In and Sign Up |

Also during the phase: `manage-assignments` and `manage-lessons` load the HTML cleaner only for saves (it is heavy to start); the first-frame theme test waits for the first frame (a timing race in WebKit under load).

## 2. Design rationale

- **Branch picker.** On phones the system picker is the familiar, thumb-friendly control (and it is what screen readers on phones expect); from tablet width up the shadcn Select matches the other fields. The names come from the database, so DDTC can add or close a branch without a release; a closed branch stays shown for learners who still have it.
- **Branch chip.** Pin icon plus name, never the icon alone; "No branch" in muted text. In tables it is a column; on phone cards it sits in the chip row under the name, so the card does not grow sideways (fits at 320 px, the name truncates).
- **Idle warning.** A dialog, not a toast, because the user must choose; it explains how long they have been away, counts down, and names unsaved work. Continue Session is focused first and Escape does the same, so a keyboard or screen-reader user can keep the session in one key press. The countdown is announced only at whole minutes and at 30 and 10 seconds.
- **One clock.** Activity in any tab keeps every tab alive; timestamps, not counted intervals, so a phone that slept or a throttled background tab cannot stretch a session.

## 3. `npm run verify`

Local results (Windows, local Supabase with access tokens of 600 s), 2026-11-07 and 2026-11-08, on the D43 commits:

| Suite | Result |
|---|---|
| Lint and type check | pass |
| Unit and component (Vitest) | 29 files, 398 tests, pass (Phase 7 new: assignment logic 11, branches 12, branch filters 6, idle clock 28, drafts 10, and auth-page tests for ADR-012 and the idle message). With the two CI fixes (below): 402 tests, passing whole in 3 of 5 local runs; in the other 2 one test timed out under local load with nothing changed between runs (the one captured: the Phase 4 file scan in `user-avatar.test.jsx`, 8.8 s against 5 s, with 29 test workers sharing the machine) |
| Secret scan | pass (375 files, 0 findings) |
| Dependency audit (high and above) | pass; production dependencies have no advisories (`npm audit --omit=dev`); 2 low and 9 moderate advisories in development tooling (deepmerge, glob) |
| Build | pass |
| Database (pgTAP) | 17 files, 759 tests, pass (Phase 7 new: 61 assignment access, 43 assignment functions, 29 branches, 25 idle sign-out; the access matrix now counts the two idle settings) |
| Edge Function integration | 5 files, 67 tests, pass on the third run. The first two runs after a full restart of the local stack lost 13, then 3 different tests to the local functions runtime's limits on cold workers ("CPU time soft limit reached", HTTP 503); no code changed between the runs (see section 8) |
| End-to-end, local | `idle.spec.js`: the learner and lecturer flows on desktop Chrome and iPhone SE, the administrator flow on desktop Chrome, desktop WebKit and iPhone SE. `branches.spec.js`: the learner flow on desktop Chrome, Firefox and WebKit, iPhone SE, iPad and the 320 px project; the administrator and lecturer flow on desktop Chrome, iPhone SE and iPad. `auth.spec.js` 16 of 16 on desktop Chrome; the D32 absolute-limit test on desktop Chrome and WebKit; the theme tests on desktop Chrome. Phase 7 core (`assignments.spec.js`): see CI |
| Full end-to-end matrix and Lighthouse | CI on PR #12 (below) |

CI: run 42402927830 (the Phase 7 core) and run 42406097378 (branch database and profile picker) were green on every job. Run 42413280717 (branch lists and the sign-in screens) failed one test in one shard: the first-frame theme check on iPhone SE (light) read its value before WebKit had painted the first frame; the check now waits for the first frame (commit `dbec657`).

Run 42431819407 (the evidence commit `2723b07`) passed every job except end-to-end shard 4 (321 passed, 2 failed). The traces showed two real faults, each fixed with a unit test written first and seen failing:

1. **A draft came back after a save (D43, this phase).** A lesson saved within half a second of the last key press got its draft written back by the autosave still waiting, so the next new lesson opened with the earlier lesson's bold text; the click on Bold then turned bold off (`lessons.spec.js`, desktop 1920, light). `clear()` now cancels the waiting write and counts the values as saved until they change (`drafts.test.jsx`; commit `f9860b6`).
2. **A tap on Sign In missed on iPhone SE (since Phase 3).** The sign-in forms scrolled the focused field to the middle 300 ms after every focus; the tap came at that moment and landed where the button had been, so nothing was sent (`courses.spec.js`, iPhone SE, light; the trace has no sign-in request). The forms now move the page only when the focused field cannot be seen, as when the keyboard covers it, and only while it still has the focus (`auth-pages.test.jsx`; commit `e905d80`).

The run on the final commit is linked on the pull request.

Tests written first and seen failing: pgTAP 15 (no branches table) and 16 (no idle settings or function), then the migrations made them pass. The unit test for a reload after the limit found a real fault (moving between pages was also counted on the first page load, which hid a reload after the limit); fixed before commit. Earlier tests were changed only where the owner's new rules replaced old ones: the Phase 4 idle tests (toast "Stay signed in", 30-minute administrator idle) gave way to the D43 tests above, the D32 absolute-limit test now also checks its warning and message, and the access matrix counts two more settings. Nothing was skipped or loosened.

## 4. Tests required (phase file and owner requests)

| Test | Result | Proof |
|---|---|---|
| Database CHECKs reject invalid instruction combinations | PASS | `13_assignments_access.test.sql`, `14_assignment_functions.test.sql` |
| Only the course's lecturers manage assignments | PASS | pgTAP 13 and 14; `tests/functions/assignments.test.js` |
| Learners see only published assignments of enrolled courses | PASS | pgTAP 13; `assignments.spec.js` |
| Instruction audio is denied to everyone else | PASS | pgTAP 13 (Storage reads per role and file state) |
| D42: a learner sets and changes only their own branch; unknown or closed branches refused; learners never read another learner's branch; lecturers see it only for their own courses' learners; AAL1 administrators cannot change it, AAL2 can (and nothing else); role and status stay protected; changes audited; a branch in use cannot be deleted | PASS | `15_branches.test.sql` (29 checks) |
| D42 screens: choose, save, reload; chips; filters; the administrator's change; the lecturer's view; keyboard, axe, 320 px | PASS | `tests/unit/branches.test.jsx`, `tests/unit/branch-filters.test.js`, `tests/e2e/branches.spec.js` |
| D43: settings, bounds, who may read and change them; the administrators' server-side idle window | PASS | `16_idle_sign_out.test.sql` (25 checks) |
| D43: warning at 8 minutes; Continue Session and Escape reset; sign-out at 10; every activity type resets; media and uploads keep the session; token refresh does not; settings apply; a slept phone and a reload after the limit sign out at once; two tabs share one clock; administrators record activity; unsaved work named; countdown and announcements | PASS | `tests/unit/idle.test.jsx` (fake timers, 28 tests) |
| D43: drafts kept 24 hours per user and screen, restored over the same version only, deleted by a deliberate sign-out and by a save (even with the autosave still waiting) | PASS | `tests/unit/drafts.test.jsx` (11 tests) |
| D43 per role on Playwright's clock: the dialog (focus, trap, Escape, axe), sign-out with the message, the way back to the page, Back reveals nothing, private pages closed, a lecturer's draft restored and deleted by a deliberate sign-out | PASS | `tests/e2e/idle.spec.js` |
| ADR-012 | PASS | `tests/unit/auth-pages.test.jsx` (glow on the three pages only, name, tagline and its language, copyright) |

## 5. Exit gate

| Line | Result | Proof |
|---|---|---|
| Category weights must total 100 before any grade can be released | PASS | pgTAP 13 (`require_weights_total_100`) |
| Branch rules proven for every role; branch screens pass end to end | PASS | pgTAP 15; `branches.spec.js` |
| Idle sign-out works for every role with the warning, Continue Session and draft restore, and never signs out someone who is active | PASS | `idle.test.jsx`, `drafts.test.jsx`, `idle.spec.js`, pgTAP 16 |
| Owner sign-off | **Approved by the owner on 2026-11-08** (PR #12), before the staging steps and the real-device check in section 6; the two faults CI found afterwards (section 3) were fixed before merging | PR #12 |

## 6. Owner steps

Staging, after approval and before merging (as before, the owner runs these; they change the hosted project):

1. Apply the migrations: `npx supabase db push --linked` (adds `20261107000400` to `20261107000700`).
2. Deploy the functions that changed: `npx supabase functions deploy manage-assignments manage-lessons register-upload finalize-upload`.
3. Set the access-token lifetime to 600 seconds: Supabase dashboard, Project Settings, JWT Keys (older dashboards: API, JWT Settings), access token expiry (JWT expiry limit) 600, Save. Check it as in `docs/RUNBOOK.md`, "Idle sign-out and the access-token lifetime".

Real-device check (an iPhone in Safari, an Android phone in Chrome, a desktop browser):

1. As a learner: Profile settings, Branch: the phone's own picker opens on the phones; choose a branch, Save changes, reload: it is still there.
2. Leave the app untouched for 8 minutes: the warning opens; tap Continue Session. Leave it again for 10 minutes: Sign In says "You were signed out after 10 minutes of inactivity."; sign in: you are back on the same page.
3. Start a lesson's audio and leave the phone alone for 12 minutes with the screen on: no warning while it plays.
4. Lock the phone for 11 minutes, unlock and return to the app: it signs out straight away.
5. As a lecturer, type in a new lesson, let the session end by inactivity, sign in again: "Draft restored" and the text is back.
6. Look at Sign In, Sign Up and (as an administrator) two-step verification: the light runs round the logo's circle and the card, the name ends "(HOJ)", the tagline is in Twi, and the copyright line sits below "from gölarae".

## 7. Screenshots

`docs/acceptance/phase-07/screens/`, 90 images: each screen at 375, 768 and 1280 px in light and dark, captured with a check that no page scrolls sideways and that the console stays free of errors:
- Assignments: `lecturer-assignments-tab` (categories and the course's assignments), `lecturer-assignment-editor`, `learner-assignments` (To do and Past due), `learner-assignment`, `admin-assignments`.
- Branches (D42): `learner-profile-branch`, `admin-learners-branches` (chips and the Branch filter), `admin-user-panel-branch` (Save branch), `admin-enrolments-branches`, `lecturer-course-learners-branches`.
- Idle sign-out (D43): `idle-warning` (the dialog; clock paused for the capture), `signin-after-idle` (the status message).
- Sign-in screens (ADR-012): `signin`, `signup`, `admin-verification`.

Captured with reduced motion, so the travelling lights stand still. In full-page captures the phone navigation bar and the editor's sticky action bar are drawn once where the first screen ends; on a real screen the page has room for them.

## 8. Known issues and deferred items

| Item | Reason | Owner |
|---|---|---|
| Real-device checks (section 6) | Need real phones | Prince Boateng |
| Granting extensions, submitting answers, the recorder (and recordings keeping the session awake), branch on submission review | Phase 8 | Prince Boateng |
| Branch in the grading header, gradebook, exports and reports | Phases 9 to 11 (written into those files) | Prince Boateng |
| Changing the idle limit from a Settings screen | Phase 11; until then SQL as the owner (runbook) | Prince Boateng |
| For lecturers and learners the idle limit is enforced by the app (plus 10-minute tokens and the reload check), not by Supabase: the Free plan has no Auth inactivity timeout | Owner decision 2026-11-07 | Prince Boateng |
| Local test runs on the owner's Windows machine: the functions runtime refuses cold workers ("CPU time soft limit reached", 503) and local WebKit slows down after long sessions; parallel sign-ins time out against the local Auth server (2.8 GB for Docker) | Local environment; CI on clean runners is the reference | Prince Boateng |
