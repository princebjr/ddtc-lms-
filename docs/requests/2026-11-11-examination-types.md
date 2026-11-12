# Owner request: examination types, and one type per section (2026-11-11)

**Request (Prince Boateng, during Step 11.1):** "the lecturer should be the one to choose the mode of exams, whether MCQs, Short answers or Essay. one exams should not have all the modes of exams. each section of the exams too should have it own mode of exams."

**Clarification the same day:** the lecturer chooses the examination's type before giving out the questions, and can choose all three modes, just two, or only one.

## Plan approved by the owner (2026-11-11), with the three recommendations

1. Examinations set before this step keep their sections; the rule applies when they are next edited (the editor asks the lecturer to split a mixed section). No automatic split.
2. The types can change until a learner starts the examination; after that they are locked, as the questions already are.
3. Taking off a type that still has sections is refused with a message. Nothing is deleted.

## As built (Step 11.2, ADR-021)

- Migration 46: `examinations.modes`, `exam_sections.mode`, `exam_save` and `exam_structure_save`.
- `manage-examinations`: `modes` on the details, `mode` on each section.
- Editor: "Types of question" under Details; a "Type of question" select and one Add button on each section; Split into sections for an older mixed section.
- Learner's page: each section shows its type and number of questions.
- Tests: pgTAP 36 (22 tests); `exams.test.jsx`; `tests/functions/examinations.test.js`; `examinations.spec.js`.
