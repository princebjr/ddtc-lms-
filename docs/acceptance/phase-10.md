# Phase 10 acceptance evidence: Gradebook, distribution charts and exports

- Phase file: `docs/phases/phase-10-gradebook-charts-exports.md`
- Branch and pull request: `phase-10-gradebook`, PR link added when opened
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-10
- Plan approved by the owner on 2026-11-10 with five decisions, recorded with the later owner choices as ADR-015:
  1. Course-wide Review and release from the gradebook: every draft grade of the course listed (changed released grades marked), then Release all (N). Grading without releasing is the existing Save draft.
  2. Excel exports. exceljs went over the Edge Function CPU limit, and the owner chose a small built-in writer (fflate) on 2026-11-10.
  3. Excel top rows: "Dynamic Discipleship Training Centre (HOJ)", the course, the assignment and the export date. CSV files have plain headings.
  4. After the first release, only an AAL2 administrator changes category weights, with a reason (audited), after an impact preview; lecturers see them read-only.
  5. `missing_as_zero` stays off by default; its settings screen comes in Phase 11.
- Owner requests handled during the phase:
  - **"Each course should have its own gradebook. The learner should be able to see the grades of a particular course separated from the grades of another course"** (2026-11-10). Built: see section 1.
  - The learner's Assignments page said "Awaiting grade" after release. Fixed (f77a81d): it now says "Graded · 15 / 20 · B".
  - The dashboard greeting now says Blessed morning, Good afternoon, Glorious evening (d7227fe).
  - The 2026-11-06 assignment performance report (export with course, assignment and format pickers): built in `export-gradebook`.
- Received during the phase, not built here: the **end-of-course examination system** (2026-11-10). Recorded verbatim with eight open questions in `docs/requests/2026-11-10-examinations.md`. It is planned as its own phase for approval after this one.

## 1. What was built

| Build item | Where |
|---|---|
| D11 and D13 through one database function (D30) | Migration `20261110000200_gradebook.sql`: `calculate_course_grades` on `private.course_grade_cells` and `private.course_grade_summary` (built on Phase 9's `private.grade_facts`; no second formula). Cell states RELEASED, DRAFT, UNGRADED, COUNTED_ZERO, MISSING, NOT_DUE; category %, overall (one decimal, half up), Final / Provisional / Not yet available. A learner gets only their own row with released results (a draft reaches them as ungraded); an administrator's view is audited |
| Statistics and chart counts | `assignment_statistics`: released results only; ungraded never counted; average, highest, lowest, graded, ungraded, missing, the band counts, `chart_visible` (learners only from `min_class_size`), `my_band` |
| Weights lock after first release | Trigger `grade_categories_lock`. `grade_categories_save` now requires an AAL2 administrator and a reason after release, audited `grade_categories.changed_after_release`. `weights_impact_preview`. UI: Locked chip for lecturers, Reason plus Preview the effect for administrators |
| Course-wide Review and release (owner decision 1) | `course_release_preview`, `grade_release_course` (audited `grades.released_course`); `release-grades {courseId}`; `ReviewReleaseDialog.jsx` |
| `export-gradebook` CSV and XLSX with audit (and the 2026-11-06 report) | Migration `20261110000300_gradebook_exports.sql` (`i_manage_course`, `record_export`); `supabase/functions/export-gradebook`; `_shared/xlsx.ts`. Reads with the caller's own token; refuses anyone but the course's lecturers and AAL2 administrators; audited `export.gradebook` / `export.assignment_report`. `ExportDialog.jsx` with course, kind, assignment and format pickers |
| Each course's own gradebook, staff (owner request) | Course workspace **Gradebook** tab (`GradebookTab.jsx`, `GradebookMatrix.jsx`, `GradeCellView.jsx`): from tablet width a matrix with a sticky learner column (photo, name, ID number, branch chip, D42) and header row; per-learner cards on phones. **Analytics** tab: class figures (`ClassStats.jsx`) and the distribution chart per assignment, Export report. **Gradebooks** (lecturer) and **Gradebook oversight** (administrator) list the courses, each opening its own gradebook |
| Each course's own gradebook, learner (owner request) | **Grades and feedback** lists the learner's courses (current, then completed), each card with its own course grade, status and "N of M assignments graded"; each opens `/learner/courses/:courseId/grades` (`LearnerCourseGradesPage.jsx`): the course grade with band, status and categories; the assignments with released score, %, status, Late and feedback; "How the class scored" charts (only from `min_class_size`, own band highlighted, "a band is not a rank"). The course page links to it (My grades) |
| Distribution chart | `DistributionChart.jsx`, plain SVG with tokens (no chart library): axes "Percentage scored" and "Number of learners", count on each bar, own band patterned and labelled "Your score", short labels on narrow widths, tap to show a value, text summary always visible |
| Skeletons | `GradebookSkeleton` (cards on phones, matrix from tablet width); `ChartSkeleton` for Analytics; course-card skeleton for Grades and feedback |

Docs: ADR-015 (`docs/DECISIONS.md`), DESIGN.md "Gradebook as built", SECURITY_AND_ACCESS section 8, DATA_MODEL (`missing_as_zero`), RUNBOOK "Written in Phase 10", and the Phase 11 hand-off (the `missing_as_zero` settings screen).

## 2. Tests

| Suite | Result |
|---|---|
| Lint, type check, secret scan, dependency audit, build | All pass (2026-11-10, final commit) |
| Unit and component (Vitest) | 34 files, **481 passed**. New: `tests/unit/gradebook.test.jsx` (13): course cards per course, one course's page shows only its own results, chart only from `min_class_size`, every D11 state in words, chart bars equal the data, Review and release, Export pickers. The Step 9.1 Grades checks moved there with the page's new shape (same checks: released score and feedback, Awaiting grade without a score) |
| Database (pgTAP) | 24 files, **1,067 passed**. New: `22_course_grades.test.sql` (40) and `23_gradebook_functions.test.sql` (23). Two earlier tests updated for deliberate changes: `03_access_matrix` (one more setting) and `14_assignment_functions` (`grade_categories_save` now takes a reason) |
| Edge Functions (HTTP) | 8 files, **100 passed**. New: `tests/functions/gradebook.test.js` (7): course release, weights lock, CSV gradebook and report (with the byte-order mark, "Not Submitted" and totals), Excel files, refusals and audit |
| End-to-end, local | `gradebook.spec.js` (3 tests) and the updated Step 9.1 test, all passing on desktop Chrome (light and dark), desktop Firefox (light and dark), Pixel 7 (light and dark), the 320 px phone (light and dark) and iPad portrait. The rest of the matrix (WebKit, iPhones, iPad landscape, the wide screens) runs in CI, as in earlier phases (local WebKit hangs on start) |

Fixture-based exact numbers (phase file "Tests required"), in pgTAP 22:
- The worked example: 77.5% B (Assignments 70% weight: 18/20 and 40/50; Practical 30%: 26/40).
- 73/100 shows 73% in band 70-79%.
- Band boundaries: 49.9 → 0-49%, 50 → 50-59%, 89.9 → 80-89%, 100 → 90-100%.
- Averages, highest and lowest exact; editing a grade updates the statistics.
- An early-submitted assignment counts once released. A future assignment with no released grade is excluded.
- `missing_as_zero` on: an overdue missing assignment counts 0, and a late submission lifts the zero until its grade is released.
- An extension moves the effective due date.
- An unpublished assignment with released grades still counts; one without does not.
- Final, Provisional and Not yet available are each correct.
- Changing weights after the first release is refused outside the audited workflow.
- A learner cannot read or export other learners' marks.

## 3. Exit gate

| Gate item | Result |
|---|---|
| Chart counts equal the authorised dataset in every test | **Pass.** pgTAP 22 checks the band counts against the released fixture results; the unit test checks every bar's count equals the data it is given; the end-to-end test checks the chart's bars (70-79%: 1, 60-69%: 1, 90-100%: 0) against the two released essay grades |

## 4. Found by the tests and the screenshot review (fixed)

- The CSV byte-order mark was a literal invisible character in the source (lint `no-irregular-whitespace`); it is now written as `String.fromCharCode(0xfeff)`, and the function test checks the file starts with it.
- axe `scrollable-region-focusable` on the 320 px phone: the scrolling lists in Review and release and in the weights preview now take keyboard focus.
- My grades (learner course page) and Export (Gradebooks) were in the page header's action slot, which shows only on desktop; the 320 px run could not find My grades. Both now sit in the page at every width.
- Phone gradebook cards cut long names short beside the overall grade; the grade now sits under the learner. The learner's score column no longer wraps "18 / 20".
- Under heavy load the skeleton can take over for its 300 ms just after a first paint; three new unit assertions and one Step 9.1 assertion now wait until the content has settled (the checks themselves are unchanged).

## 5. Known issues and deferred items

- **One unexplained Pixel 7 dark failure** of the lecturer end-to-end test, seen once in a run where the local server was overloaded. The failing assertion was not captured, and it passed in 3 later runs. CI runs it on every device project.
- **Local overload:** with several Playwright workers, the local Edge runtime (Docker with 3 GB of memory) hit its CPU limit and refused setup calls (503 / WORKER_LIMIT) across every function, including those unchanged since Phase 8. The function tests and single-worker runs pass. Not an application fault; recorded so the failing local runs are not mistaken for one.
- **Excel opened in Excel:** the files are checked structurally (a zip with every required part, each XML part well-formed), not opened in Microsoft Excel here. Owner step on staging: open one gradebook export and one report export in Excel. Owner: Prince Boateng.
- **`missing_as_zero` settings screen:** Phase 11 (owner decision 5).
- **Examination system:** a new phase, to be planned for approval (see the request file).

## 6. Owner steps

Staging, before merging:
1. `npx supabase db push --linked` (adds `20261110000200` and `20261110000300`).
2. `npx supabase functions deploy export-gradebook release-grades manage-assignments`.

I then check read-only (`supabase migration list --linked`, `supabase functions list`). Then open one Excel export of each kind in Excel on staging.

## 7. Screenshots

`docs/acceptance/phase-10/screens/`, 48 images at 375, 768 and 1280 px in light and dark:
- `lecturer-gradebooks`;
- `lecturer-course-gradebook`;
- `lecturer-review-and-release`;
- `lecturer-export`;
- `lecturer-course-analytics`;
- `lecturer-weights-locked`;
- `learner-grades` (one card per course);
- `learner-course-grades` (one course's own page).

Each was captured with a check for sideways scrolling and console errors; none found.
