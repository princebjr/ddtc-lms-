# Phase 10.1: Examinations, practical marks and branch groups

**Source:** the owner's requests of 2026-11-10 (`docs/requests/2026-11-10-examinations.md`, `docs/requests/2026-11-10-practical-marks-and-branch-groups.md`), all questions answered the same day; plan approved on 2026-11-10 ("phase 10.1 recommendations approved"). Decisions: ADR-016.

**Before you start:** as for every phase (CLAUDE.md, DECISIONS, PHASES, TESTING; DATA_MODEL and SECURITY_AND_ACCESS; DESIGN, RESPONSIVE, UI_FEEDBACK). Phase 10 is signed off and tagged `phase-10-done`.

**Regression rule:** `npm run verify` runs every earlier phase's tests. Earlier tests change only where the owner's decisions change the rule (lecturers no longer edit weights; a new course has three parts), each named in the evidence.

## Build

1. **The course grade's three parts (40/30/30):** `grade_categories.part`; new courses start with Weekly assignments 40, Local Assembly practicals 30, Final examinations 30; existing courses switch (directly without released grades, otherwise by an administrator after a preview); only an AAL2 administrator changes a split, with a reason; `calculate_course_grades` unchanged.
2. **Practical marks:** practicals are marked in person (no learner answer); the lecturer's mark sheet for every learner, grouped by branch; drafts, then release; Not marked, never Missing.
3. **Examinations:** setting (details, sections, multiple-choice, short-answer and essay questions, marks, pass mark, opening and closing time, preview, publish, archive), deadlines in database time with changes, extensions and early close, no countdown timer; taking (start, autosave with an indicator and offline copy, text and audio answers, review, submit once); marking (multiple choice automatic and final, manual marks bounded by each question, feedback), release with notification, retakes with a reason, history and audit; results with MCQ, short-answer and essay scores, total, percentage, pass or fail; export (CSV and Excel); the course grade and gradebook.
4. **Dashboards:** the learner's examination deadlines; the lecturer's scripts to mark and results to release (dashboard and To grade).
5. **Branch groups:** the mark sheet, gradebook, assignment and examination results, Learners tab and To grade open grouped by branch; switchable and remembered; exports sorted by branch.

## Tests required

- pgTAP: the parts, practicals and their marks (24); examinations, answer keys hidden from learners, the deadline, marking bounds, release, retakes, history and the course grade (25); recordings (26); dashboards (27). Allow and deny for every role on every new table and function.
- Edge Functions over HTTP: practicals, examinations (including an uploaded recording and the export sorted by branch).
- Unit: the mark sheet, parts card, branch grouping, the learner's examination (deadline without countdown, autosave, offline copy, submit), the builder, results.
- End to end on every device project, light and dark: setting an examination; taking it, marking and releasing; the practical mark sheet; the parts read-only for lecturers and changed by an administrator.

## Exit gate (all must pass)

- [ ] Learners can never read a correct answer or marking guide (pgTAP 25).
- [ ] Deadlines are enforced by the database in its own time; no countdown timer exists anywhere (pgTAP 25, unit and end-to-end checks).
- [ ] The course grade uses only `calculate_course_grades` with the three parts (pgTAP 24 and 25).
- [ ] Nothing is deleted: examinations archive; attempts, answers and history are kept (pgTAP 25).
- [ ] `npm run verify` green, CI green on every device project.

Git tag on completion: `phase-10-1-done`

## Evidence to save in `docs/acceptance/phase-10-1.md`

As for every phase: verify output, the exit gate, screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen, known issues.
