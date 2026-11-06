# Phase 10: Gradebook, distribution charts and exports

**Owner request (2026-11-06) to include here once its open questions are answered:** see `docs/requests/2026-11-06-presence-and-assignment-reports.md`.

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** Fixture-based exact numbers for every D13 edge case; chart counts equal the authorised dataset; export permissions.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Separate lecturer, learner and administrator gradebook views using D11–D16. Lecturer sees identifiable results only for their courses; learners see their own detailed results only; administrator access is audited.
- Implement D11 and D13 exactly, through the single database function `calculate_course_grades` (D30), used by all screens and exports; never recalculate formulas in frontend components.
- Display missing, submitted-ungraded, graded-draft, released, late, and counted-as-zero states distinctly. Future assignments and ungraded submitted work must not be treated as zero.
- Category weights total exactly 100 before first release; thereafter lock them except through the audited administrator workflow in D13/D30.
- Score distribution bar chart per graded assignment: horizontal axis Percentage scored, vertical axis Number of learners, count shown on each bar, learner's own band highlighted, band shown separately from any rank, minimum class-size rule from D15, text summary for accessibility.
- Class average, highest, lowest, graded, ungraded and missing counts; ungraded excluded from calculations. Show provisional/final state and “Not yet available” when there are no eligible items.
- Learner gradebook shows current and completed courses, released historical grades/feedback and progress summaries. Lesson completion remains separate from academic marks. Learners never see class-level individual results or exact ranks; class statistics are suppressed below `min_class_size`.
- Responsive gradebook and charts per Section 15: a scrollable matrix with a sticky learner column on tablets and desktops, a per-learner card view on phones, charts that resize without overlapping labels, tap-to-show values, patterns as well as colours, and the text summary always visible.
- `export-gradebook` CSV and XLSX with audit record.

**Tests required**

- Fixture data with known marks yields exact expected percentages, bands, averages and overall grades; a score of 73/100 shows 73% in 70-79%; boundary values 49.9, 50, 89.9 and 100 land in the correct band; editing a grade updates statistics; a learner cannot query or export others' marks.
- D13 edge cases: an early-submitted assignment counts once its grade is released; a future assignment with no released grade is excluded; with `missing_as_zero` on, an overdue missing assignment counts as 0 and a late submission lifts the zero until its grade is released; an extension moves the effective due date; an unpublished assignment with released grades still counts and one without does not; Final and Provisional status and "Not yet available" are correct; changing category weights after first release is refused outside the audited workflow.

**Exit gate (all must pass)**

- Chart counts equal the authorised dataset in every test.

Git tag on completion: `phase-10-done`

## Evidence to save in `docs/acceptance/phase-10.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
