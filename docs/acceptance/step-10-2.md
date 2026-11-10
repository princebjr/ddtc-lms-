# Step 10.2 acceptance evidence: letter grades only on the course grade

- Request: the owner, 2026-11-10: "each assignment should not show a grade (A, B...), the final grade should show on the subject or course tag". Plan approved the same day, examinations included. Decision: ADR-017.
- Branch and pull request: `step-10-2-course-letter`, PR link added when opened.
- Reviewer (O2): Prince Boateng.

## 1. What changed

- **No letter on a single piece of work.** Score, percentage and band stay (an examination also keeps Pass or Not passed). The letter was removed from:
  - the learner's grade card on an assignment;
  - the Assignments list ("Graded · 15 / 20");
  - each course's grades page (the assignment rows);
  - the examination result ("8 / 10 · 80%");
  - the grading panel;
  - assignment results;
  - the Review and release list.
- **The letter on the course grade**, unchanged:
  - the Grades and feedback course cards;
  - the course grade card;
  - the gradebook's Overall column;
  - the gradebook export's Grade column.
- **New: a course grade tag** on each My Courses card and under the course page title. It reads, for example, "Course grade 78.6% · B", with "(provisional)" while the grade can still change. It is green when Final and amber when provisional (`courseGradeTag`).
- No database, security or calculation change.

## 2. Tests

| Suite | Result |
|---|---|
| Lint, type check, build, secret scan, audit | All pass (2026-11-10, final commit) |
| Unit | 36 files, **501 passed** (new: the course grade tag) |
| End to end, local | `grading.spec.js` (3) and the gradebook and examination tests touched: pass on desktop Chrome; CI runs every device project |

Changed on purpose (each now checks the letter is absent from a single item):
- **Unit:** grading (the panel's figures, the learner's grade card), gradebook (an assignment row reads "Graded"), exams (the result reads "11 / 13 · 84.6%").
- **End to end:** grading (the panel's figures, the grade card, the Assignments list, the course page row).

New: the course grade tag, in unit and end-to-end tests.

## 3. Screenshots

`docs/acceptance/step-10-2/screens/`, 36 images at 375, 768 and 1280 px in light and dark:
- `learner-my-courses`;
- `learner-course-tag`;
- `learner-assignment-grade`;
- `learner-assignments-list`;
- `learner-exam-result`;
- `lecturer-grading-panel`.

Each was captured with a check for sideways scrolling and console errors; none found.

## 4. Owner steps

None on staging: no migration and no Edge Function changed. Merge after CI and approval.
