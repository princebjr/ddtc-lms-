# Phase 9 acceptance evidence: Grading, feedback and history

- Phase file: `docs/phases/phase-09-grading-feedback-history.md`
- Branch and pull request: `phase-9-grading`, https://github.com/princebjr/ddtc-lms-/pull/14
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-09
- Plan approved by the owner on 2026-11-09 with seven decisions, recorded as ADR-014:
  1. The `notifications` table is created now and written on every release and every release of a changed grade. The learner sees "New grade available" on their next page load; the notification centre and email stay in Phase 11.
  2. What the learner sees is kept apart: after a change they keep seeing the released grade until the change is released.
  3. Reopen grade needs a reason; the learner may send again only before their effective due date.
  4. Enrolled means every enrolment except WITHDRAWN.
  5. Missing applies only after the learner's effective due date ("Not yet due" before it).
  6. Scores have up to two decimals.
  7. Feedback is plain text up to 10,000 characters.
- Also in scope: step 0, reserving Supabase's local ports on the CI runners (three jobs had failed on 2026-11-09 with "address already in use" before any test ran).

## 1. What was built

| Build item | Where |
|---|---|
| Grading screen: read text, play audio, open documents, score, feedback, save draft, release | The answer view grows into the grading screen (`src/pages/courses/SubmissionViewPage.jsx`, `src/components/grading/GradingPanel.jsx`). On phones the answer comes first, then the panel with a sticky Save draft / Release grade bar; from tablet width there are two panes. The panel has marks out of the maximum (two decimals) and plain-text feedback, and shows the percentage, letter grade and band from the database |
| Trigger 0 <= score <= max_marks; history written by trigger; reopen flow | Migration `20261109000100_grading.sql`. `submissions_grade_guard` checks every writer, and a released grade changes only with a reason. `assignments_max_marks_guard` stops maximum marks dropping below a given score. `grade_change_history` records SAVED, RELEASED and REOPENED events from the `record_grade_change` trigger; update, delete and truncate are refused to everyone. `grade_reopen` needs a reason |
| `release-grades` per submission and per assignment; notifications on release; changes after release recorded and notified; results on read (D30) | Migration `20261109000200_grading_functions.sql`:<br>- `grade_release`: one learner or every draft grade; refused unless weights total 100; one notification per learner and event; audited.<br>- `grade_save`: a change after release needs a reason, keeps the previous and new values and waits to be released.<br>Edge Functions `release-grades` and `grade-submission` (save, reopen). Nothing is stored as an aggregate; `private.grade_facts` computes the figures on read |
| "Reopen grade" with a required reason and immutable history; re-release follows D30 | `ReopenDialog.jsx`, `grade_reopen`, REOPENED events in the history, and "Grade updated" on re-release |
| Results dashboard: enrolments left-joined to submissions; search, sort, filter, counts, avatars; cards on phones; two panes for grading on tablets and desktops | `assignment_results()` and `assignment_result_counts()` (owner decisions 4 and 5). `AssignmentSubmissionsPage.jsx` and `ResultCounts.jsx` show six count tiles, search by name or ID number, Show, Branch and Sort filters, one chip for where each learner stands, Grade for answers waiting, and Release grades (N) after a confirmation. Cards up to 1024 px |
| D42: the branch chip beside name, photo and ID number on the grading header, review and results lists | Grading header and results rows |
| Learners: released grades only (D16) | `my_grade()` and `LearnerGradeCard.jsx` on the assignment page ("Updated" after a changed grade is released). "New grade available" with View, once per tab (`GradeNotices.jsx`) |

Also during the phase:
- CI reserves ports 54320 to 54330 before Supabase starts.
- `FilterSelect` is shared with the Users page.
- `ResponsiveTable` gains `cardsBelow`.
- Status chips never wrap.
- The grading and results skeletons were added.

## 2. Design rationale

- **One source for every figure (D30).** Percentage, letter grade, band and pass come from `private.grade_facts`, which reads the scale from the settings. The results counts come from the same rows as the list, so the two always agree. Phase 10's `calculate_course_grades` builds on the same helper.
- **The learner never sees a draft or a gap (owner decision 2).** Release copies the grade to `released_score` and `released_feedback`. A later change waits until it is released, so the learner sees one grade at a time and is told when it changes.
- **Labels, not colours.** The results show one chip per learner (Released, Draft grade, Changed, not released, Reopened, Ungraded, Missing, Not yet due), with Late and Withdrawn beside it.
- **Grading on a phone.** The answer comes first, then the panel. Save and Release stay in reach above the navigation, and a reason field appears only when a released grade is changed.

## 3. `npm run verify`

Local results (Windows, local Supabase), 2026-11-09:

| Suite | Result |
|---|---|
| Lint and type check | pass |
| Unit and component (Vitest) | 32 files, 464 tests, pass (Phase 9 new: 18 in `grading.test.jsx`: labels and figures, the grading panel's checks, draft, change with a reason, release and reopen, releasing an assignment, counts, the learner's card, "New grade available" once per tab) |
| Secret scan | pass (416 files, 0 findings) |
| Dependency audit (high and above) | pass; production dependencies have no advisories; development tooling unchanged at 2 low and 9 moderate |
| Build | pass |
| Database (pgTAP) | 21 files, 985 tests, pass (Phase 9 new: 54 grading access, 52 grading functions, including the exit gate) |
| Edge Function integration | 7 files, 93 tests, pass (Phase 9 new: 9 in `grading.test.js`, including the phase file's clean-up case) |
| End-to-end, local | `grading.spec.js` 2 tests. Before the screenshot-review layout fixes, after fixing what the runs found, each test passed on desktop Chrome light, desktop Firefox dark, the 320 px phone (light and dark) and Pixel 7 dark (over several runs, the last two phone runs 4 of 4). After them: 4 of 4 on the 1920 px screen light and desktop Chrome dark in one run. Phase 8's lecturer test (changed for this phase's screen) passes on desktop Chrome, the 320 px phone and Pixel 7. Local WebKit still hangs on start, so CI covers Safari's engine and the iPads, and runs everything on the final commit |
| Full end-to-end matrix and Lighthouse | CI on PR #14 (below) |

CI on PR #14:

| Run | Commit | Result |
|---|---|---|
| 42719526515 | `6a43d1c` | success, all 13 jobs (every device project in light and dark, pgTAP and function tests, Lighthouse, secret scan); the port reservation from step 0 held |
| on the head of PR #14 | the final commit | see the pull request's checks |

**Tests written first and seen failing:**
- pgTAP 19 and 20, failing on "column released_score does not exist" and "function grade_save does not exist". Fixture mistakes found while making them pass: versions need a request id; the withdrawn learner had been enrolled as active; each sign-in must start from the database owner.
- The Edge Function tests (404 before the functions existed).
- The unit test for the release bug below.

**Found by the end-to-end tests and the screenshot review (fixed):**
- **Release asked for the reason again.** After a change to a released grade was saved with its reason, Release grade asked for the reason again, so the change was never released. A reason is now needed exactly when the server needs one. Unit test seen failing without the fix.
- **Release grades (N) was hidden on phones and tablets.** It sat in the page header, whose actions show only on wide screens; it is now in the page.
- **Accessible name.** The Grade link's name did not contain its visible label (axe `label-content-name-mismatch`, WCAG 2.5.3).
- **Results table layout:**
  - the table was too wide for a 1280 px laptop and a tablet: the branch chip moved under the name, and cards are used up to 1024 px;
  - chips wrapped and ran over the score (chips never wrap now);
  - "Ungraded" appeared twice (one chip per learner now);
  - six count tiles were cramped at 1280 px (three per row now).
- **Wrong label for the learner.** The learner's latest version said "Awaiting grade" under the released grade; it now says Graded.

**Earlier tests changed only where this phase replaced what they checked.** Phase 8's lecturer test:
- sees Missing for a learner past the due date with nothing sent (owner decision 5; it said "Not submitted");
- checks it on the row's chip, because a count tile also says Missing;
- opens an answer waiting to be graded with "Grade answer from" (the accessible name now matches the visible label).

Nothing was skipped or loosened.

**Local machine notes:**
- One run of the unit suite, started straight after an end-to-end run, had 4 timeouts in tests that walk the file tree; rerun alone and in full they passed (464 of 464).
- One run of the function suite hit the local Edge runtime's resource limit (`WORKER_LIMIT`); rerun alone and in full it passed (93 of 93).
- The screenshot preview of Phase 8 was still running from the morning (stopping its task had not stopped its process); it was stopped.
- CI on clean runners is the reference.

## 4. Tests required (phase file)

| Test | Result | Proof |
|---|---|---|
| A pending upload older than 24 hours is removed by `cleanup-files`, while lesson audio and VALIDATED submission files are untouched | PASS | `tests/functions/grading.test.js` (cleanup case) |
| Out-of-range scores rejected | PASS | pgTAP 19 (any writer: above maximum, below 0; maximum marks cannot drop below a score), pgTAP 20 and function tests (with the messages), unit tests (checked before sending) |
| Every grade or feedback change appears in history | PASS | pgTAP 19 (every save, release and reopening; nobody can change or delete the history), pgTAP 20 (previous and new values, reason), end to end (the history on screen) |
| Learners see nothing before release and never another learner's grade | PASS | pgTAP 19 (`my_grade` released only and the caller's own; grading columns closed; results and answer views for the course's lecturers and AAL2 administrators only), function tests, end to end |
| Learners who never submitted appear in results as missing | PASS | pgTAP 20 (Missing after the effective due date, Not yet due before it, uploads waiting count as nothing sent), end to end (Missing chip and count) |

## 5. Exit gate

| Line | Result | Proof |
|---|---|---|
| Counts always add up to the enrolled total (tested) | **PASS** | pgTAP 20, "exit gate: for every assignment the counts add up to the enrolled total": checks enrolled = submitted + not yet due + missing, submitted = graded + ungraded, and released <= graded. The fixture covers active, suspended, completed and withdrawn learners, an extension still open, uploads waiting, graded, ungraded, reopened and resubmitted answers, before and after the due date. End to end: the counts on screen add up before and after grading |

## 6. Owner steps

Staging, after approval and before merging (as before, the owner runs these; they change the hosted project):

1. Apply the migrations: `npx supabase db push --linked` (adds `20261109000100` and `20261109000200`).
2. Deploy the new functions: `npx supabase functions deploy grade-submission release-grades`.
3. Check on the Phase 9 preview (Vercel's preview for the `phase-9-grading` branch uses staging), with a lecturer and two learners of a course:
   - grade one answer and Save draft: the percentage, letter grade and band appear;
   - Release grade: the learner sees "New grade available" on their next page and the grade on the assignment;
   - change the grade (a reason is asked for), then Release grade again: the learner sees the new grade marked Updated;
   - Release grades for the rest;
   - Reopen grade with a reason.

## 7. Screenshots

`docs/acceptance/phase-09/screens/`, 54 images: each screen at 375, 768 and 1280 px in light and dark. They were captured with a check that no page scrolls sideways, no text runs out of a button and the console stays free of errors.

- **Lecturer:**
  - `lecturer-results` (counts, chips, Grade, Release grades);
  - `lecturer-release-dialog`;
  - `lecturer-grading-draft`;
  - `lecturer-grading-changed` (a changed grade waiting to be released, the history open);
  - `lecturer-grading-reason`;
  - `lecturer-reopen-dialog`.
- **Learner:**
  - `learner-new-grade-toast`;
  - `learner-grade`;
  - `learner-being-graded`.

Captured with reduced motion. In full-page captures, fixed and sticky parts (the sidebar on wide screens, the phone navigation, the sticky Save and Release bar) are drawn once where the first screen ends; on a real screen they stay in place while the page scrolls.

## 8. Known issues and deferred items

| Item | Reason | Owner |
|---|---|---|
| The notification centre, unread count, email for grades and the other D21 events | Phase 11 (the rows exist from this phase; `GradeNotices` is replaced by the centre) | Prince Boateng |
| Course-level grades, the gradebook, charts and exports | Phase 10 (built on `private.grade_facts` and the released columns) | Prince Boateng |
| Re-running only the failed CI jobs can turn the CI gate green without re-running a failed matrix job (seen during GitHub's outage on 2026-11-09) | A workflow change; proposed for Phase 13 (hardening) | Prince Boateng |
| Local test runs on the owner's Windows machine: local WebKit hangs on start; the local Edge runtime can run out of room under load | Local environment; CI on clean runners is the reference | Prince Boateng |
