# Phase 10.1 acceptance evidence: Examinations, practical marks and branch groups

- Phase file: `docs/phases/phase-10-1-examinations-practicals-branches.md`
- Branch and pull request: `phase-10-1-exams`, https://github.com/princebjr/ddtc-lms-/pull/17
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-10
- Source: the owner's requests and answers of 2026-11-10 (`docs/requests/2026-11-10-examinations.md`, `docs/requests/2026-11-10-practical-marks-and-branch-groups.md`); plan approved 2026-11-10 ("phase 10.1 recommendations approved"); decisions recorded as ADR-016.

## 1. What was built

| Build item | Where |
|---|---|
| Course grade with three fixed parts: Weekly assignments 40, Local Assembly practicals 30, Final examinations 30 (owner) | Migration 33 `20261110000400_grade_parts.sql`: `grade_categories.part`, the new-course trigger, `course_uses_standard_parts`, `apply_standard_parts` and `standard_parts_preview` (AAL2 administrator, reason, preview), `grade_categories_save` for administrators only with a reason. Existing courses with no released grade were switched by the migration. `GradePartsCard.jsx` on the Assignments tab |
| Practical marks typed by the lecturer, marks only (owner) | `submissions.marked_in_person`; `submission_check` refuses learners' answers to practicals; `practical_marks_save` (through `grade_save`), `practical_marks`; grade-submission `save-practical-marks`; `PracticalMarkSheet.jsx` replaces the answers list for a practical; an unmarked practical is UNGRADED ("Not marked"), never Missing |
| Examinations: setting, taking, marking, release, retakes, history (owner) | Migration 34 `20261110000500_examinations.sql` (eight tables, RLS for managers only, answer keys in `exam_question_keys`, every function); migration 35 `20261110000600_exam_audio.sql` (recorded answers, `EXAM_ANSWER_AUDIO`, Storage policy, the examination export kind); Edge Functions `manage-examinations`, `exam-attempt`, `grade-examination`; register-upload and finalize-upload for recordings; export-gradebook kind `examination` |
| No countdown timer; the deadline in database time (owner) | `exam_close_for`, checked by `exam_start`, `exam_save_answers`, `exam_submit` and `exam_prepare_upload` against `now()`; the screens show only "Opens" and "Submit by … (Ghana time)" and "There is no time limit" |
| Examination screens | `ExaminationsTab.jsx`, `ExamEditorPage.jsx` (details, builder, preview, publish, deadline, close), `ExamResultsPage.jsx` (grouped by branch, release, export), `ExamScriptPage.jsx` (marking, feedback, release, retake), `LearnerExamPage.jsx` (start, sections, autosave with indicator and offline copy, text and recording, review and submit, result) |
| Dashboards (owner: the deadline on the learner's dashboard) | Migration 36 `20261110000700_exam_dashboards.sql`: `my_exam_deadlines`, `exam_marking_queue`; `ExamPanels.jsx` on the learner dashboard, lecturer dashboard and To grade; the learner's course page lists its examinations |
| The gradebook and the course grade | Examinations are cells of the Final examinations part in `calculate_course_grades` (the latest released attempt counts), gradebook columns, Analytics charts and exports; course-wide Review and release includes their marked results |
| Learners grouped by branch (owner) | `branch-groups.js`, `BranchGroups.jsx`: mark sheet, gradebook (a heading row per branch), assignment results, examination results, the Learners tab and To grade; on by default, switchable, remembered in the browser; every export sorted by branch |
| Toasts (D37) | Examination saved, published, unpublished, closed, archived; Deadline changed; Retake authorised; Examination submitted (UI_FEEDBACK.md and the catalogue) |

Docs: ADR-016 (and a note on D12), the phase file, PHASES (10.1), DESIGN "as built (Phase 10.1)", SECURITY_AND_ACCESS section 8, DATA_MODEL "Added in Phase 10.1", RUNBOOK "Written in Phase 10.1", UI_FEEDBACK.

## 2. Tests

| Suite | Result |
|---|---|
| Lint, type check | Pass |
| Unit (Vitest) | 36 files, **500 passed** (new: `practicals.test.jsx` 10, `exams.test.jsx` 8, one grouped gradebook test) |
| Database (pgTAP) | 28 files, **1,190 passed**. New: 24 grade parts and practicals (39), 25 examinations (63), 26 recordings (14), 27 dashboards (7) |
| Edge Functions (HTTP) | 10 files, **114 passed** (new: `practicals.test.js` 5, `examinations.test.js` 9) |
| End to end, local | `examinations.spec.js` (3), the updated `assignments.spec.js` and `gradebook.spec.js` tests: pass on desktop Chrome light and dark, desktop Firefox dark, Pixel 7 light, the 320 px phone dark and iPad portrait. CI runs every device project, WebKit and iPhones included |

Earlier tests changed because the owner's decisions changed the rule (ADR-016):
- **pgTAP 13:** a new course has the three parts; the duplicate-name check uses an existing name.
- **pgTAP 14 and 23, and the functions tests `assignments.test.js` and `gradebook.test.js`:** weights are saved by an administrator with a reason; lecturers are refused.
- **e2e `assignments.spec.js` and `gradebook.spec.js`:** the lecturer sees the parts read-only; the administrator uses Change weights.
- **Fixtures only:** pgTAP 17 to 23 and the functions fixtures now pick the weekly assignments part where they joined "the" category. pgTAP 22 keeps the D13 worked example's own two categories. No check in these files changed.

## 3. Exit gate

| Gate item | Result |
|---|---|
| Learners can never read a correct answer or marking guide | **Pass.** pgTAP 25: a learner reads none of the examination tables, and `my_exam` never contains a key or guide |
| Deadlines enforced by the database in its own time; no countdown timer anywhere | **Pass.** pgTAP 25 and 26 refuse saving, submitting and uploading after the deadline. The unit and end-to-end tests check the page shows no countdown or time left |
| The course grade uses only `calculate_course_grades` with the three parts | **Pass.** pgTAP 24 worked example (81.4%, A); pgTAP 25 (75.0% in Final examinations) |
| Nothing is deleted | **Pass.** Examinations archive; attempts, answers and history are kept; `exam_grade_history` cannot be changed (pgTAP 25) |
| `npm run verify` and CI | Locally on the final commit: lint, type check, unit (500), secret scan, dependency audit, build, database (1,190), Edge Functions (114) and Lighthouse all pass; the end-to-end suite on every device project runs in CI (the Phase 10.1 tests and the changed ones pass locally on six projects) |

## 4. Found by the tests (fixed)

- The examination tabs pointed at panels that did not exist (axe `aria-valid-attr-value`); the sections are now real tab panels.
- To grade hid examination scripts when no assignment answers were waiting; the list now shows in both cases.
- `course_release_preview` needed named columns; and a release of an examination result needed the notifications table to accept `examination`.
- The screenshot review found a script not yet fully marked showing "0 / 10 · 0% · Fail" on the results and script pages; `exam_results` now gives a percentage and pass or fail only once every answer is marked, and the screens say "so far" (pgTAP 25 checks it).
- Several new tests could catch the content's first paint before the skeleton's hold; they now wait until loading is over for good.

## 5. Known issues and deferred items

- **Local environment:** after many runs, the local edge runtime grew to about 1 GB of Docker's 2.8 GB and its workers hit the CPU limit on cold start ("Something went wrong" in two runs). After restarting the local stack, the same tests passed. CI starts fresh runners. Not an application fault.
- **The practicals mark sheet has no import from a spreadsheet;** marks are typed. Ask if wanted.
- **Local preview reuse:** the local Playwright config reuses a running preview server, so some local device runs may have used a build from a few minutes earlier; CI always builds fresh, and its run on the pull request is the authoritative one.
- **Learners grouped by branch** is remembered per browser, not per account (a convenience; ADR-016).

## 6. Owner steps

Staging, before merging:
1. `npx supabase db push --linked`. This adds `20261110000400`, `20261110000500`, `20261110000600` and `20261110000700`, and switches every staging course without a released grade to the three parts.
2. `npx supabase functions deploy manage-examinations exam-attempt grade-examination grade-submission manage-assignments register-upload finalize-upload export-gradebook`.

Then I check read-only. On staging, courses that already have released grades show administrators "Switch to the three parts" on their Assignments tab.

Done by the owner on 2026-11-10 and checked read-only the same day: migrations `20261110000400` to `20261110000700` applied on `ddtc-lms-staging`; `manage-examinations`, `exam-attempt` and `grade-examination` (new), `grade-submission`, `manage-assignments`, `register-upload`, `finalize-upload` and `export-gradebook` deployed.

## 7. Screenshots

`docs/acceptance/phase-10-1/screens/`, 66 images at 375, 768 and 1280 px in light and dark:
- `lecturer-examinations-tab`;
- `lecturer-exam-editor`;
- `lecturer-exam-results`;
- `lecturer-exam-script`;
- `lecturer-practical-marks`;
- `lecturer-grade-parts`;
- `lecturer-dashboard-exams`;
- `learner-exam-answering`;
- `learner-exam-result`;
- `learner-dashboard-exams`;
- `admin-change-weights`.

Each was captured with a check for sideways scrolling and console errors; none found.
