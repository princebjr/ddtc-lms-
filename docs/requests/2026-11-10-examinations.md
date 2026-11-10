# Owner request (2026-11-10): end-of-course examinations

Status: **recorded; all eight questions answered by the owner on 2026-11-10; to be planned as its own phase after Phase 10 is merged.** Received during Phase 10, with the instruction to build it
after Phase 10's tests. Following the phase protocol (CLAUDE.md sections 4 and 8), it becomes its own
phase: a written plan with the open questions below goes to the owner for approval once Phase 10 is
merged, and the answers are recorded as an ADR in `docs/DECISIONS.md`. Nothing is built before that.

## Where it fits (proposal, to confirm in the plan)

A new phase after Phase 10. It builds on assignments (Phase 7), answers and autosave (Phase 8),
grading, release and history (Phase 9) and the gradebook and exports (Phase 10, ADR-015). It reuses
`calculate_course_grades` for any effect on the course grade (D30), the grade scale and pass mark
(D14), notifications (ADR-014), `export-gradebook` and the existing roles, RLS and audit log.

## Open questions for the owner (to answer in the plan)

1. ~~Course grade~~ **Answered by the owner on 2026-11-10, then changed the same day: (A) weekly assignments (lesson assignments, as now) 40%, (B) Local Assembly practicals 30%, (C) final examinations 30%; total 100%.** (The first answer was assignments 50% and examinations 50%; it is replaced.) Proposal for the plan: practicals are assignments in a "Local Assembly practicals" category (the existing assignment, submission and grading flow); every new course starts with these three parts; to confirm: whether existing courses change too, and whether a lecturer or administrator may change the split for a course. To settle in the plan: a course with several assignment categories keeps their weights inside the assignments half; how the grade reads before the examination is released (proposal: Provisional, from the assignments only); and a course with more than one examination (proposal: they share the 50% by their marks).
2. ~~Deleting~~ **Answered by the owner on 2026-11-10: archive examinations rather than delete them** (CLAUDE.md: educational records are never hard-deleted). An archived examination keeps every attempt, answer, mark and history entry.
3. ~~Retakes~~ **Answered by the owner on 2026-11-10: the retake counts.** The retake's result replaces the earlier one in the course grade; earlier attempts stay in the history (never deleted).
4. ~~Late work~~ **Answered by the owner on 2026-11-10: the lecturer can extend the deadline.** After the deadline the server refuses submissions; the course's lecturers (and administrators) can extend it. Proposal for the plan: for the whole examination, or for one learner (as assignment extensions, ADR-013), each extension audited and the learner told the new deadline.
5. ~~Unsubmitted at the deadline~~ **Answered by the owner on 2026-11-10: keep (as proposed).** Saved but unsubmitted answers are kept for the lecturer, who may choose to grade them; they are marked "Not submitted".
6. ~~MCQ options~~ **Answered by the owner on 2026-11-10: keep.** Exactly four options A to D, one correct answer, no marks taken off for a wrong answer.
7. ~~Question order~~ **Answered by the owner on 2026-11-10: the same for every learner.**
8. ~~Audio~~ **Answered by the owner on 2026-11-10: both text and audio.** Short-answer and essay questions accept a typed answer and an audio answer, as assignments do (ADR-009): recorded in the app or uploaded, through register-upload and finalize-upload (D18) with the learner submission audio limits (D17), played by the lecturer while grading. Multiple-choice questions are answered by choosing A to D.

## The request, verbatim

FEATURE: END-OF-COURSE / END-OF-SUBJECT EXAMINATION SYSTEM

Implement a complete End-of-Course / End-of-Subject Examination System in the DYNAMIC DISCIPLESHIP
TRAINING CENTRE (DDTC) LMS. The purpose of this feature is to allow lecturers and administrators to
create, manage, publish, administer and grade examinations at the end of every course or subject. The
examination system must be fully integrated into the existing LMS, allowing learners to take
examinations for courses in which they are enrolled.

1. EXAMINATION MANAGEMENT (LECTURER AND ADMINISTRATOR). Create an Examination Management section
accessible to authorised lecturers and administrators. The lecturer or administrator should be able to:
create an examination for any course they are authorised to manage; set the examination title and
description; associate the examination with a specific course or subject; provide examination
instructions; set the total examination marks; set the pass mark; set the examination opening date and
time; set the examination submission deadline (closing date and time); add as many questions as
necessary; assign marks to individual questions; edit, save, publish, unpublish or delete examinations;
preview examinations before publishing; view learners who have started, submitted or failed to submit
their examinations; view individual learners' answers and examination scores; authorise examination
retakes where necessary; release examination results when grading is complete; export examination
results. Each examination must be associated with a specific course. A course may have one or more
examinations where necessary.

2. THREE EXAMINATION FORMATS. The system must support three different examination formats. Lecturers
should be able to choose one format or combine all three formats in a single examination.
A. MULTIPLE-CHOICE QUESTIONS (MCQs): lecturers can create multiple-choice questions; each question must
have four answer options: A, B, C and D; the lecturer must identify the correct answer when creating the
question; learners select one answer from the four available options; the system automatically marks
MCQs after submission; each question should have an assigned mark; the system should automatically
calculate the total MCQ score.
B. SHORT-ANSWER QUESTIONS: lecturers can create questions that require learners to provide their own
answers; each question should have a text input field; learners should type their answers into the
provided text fields; lecturers should be able to provide expected answers or marking guidelines; each
question should have an assigned maximum mark; answers should be submitted for manual grading by the
lecturer or administrator; lecturers should be able to award marks for each answer; lecturers should be
able to provide feedback on individual answers.
C. ESSAY QUESTIONS: lecturers can create essay questions requiring detailed written responses; each
essay question should have a large text editor or text box; learners should type their detailed answers
directly into the provided text area; lecturers should be able to specify the maximum marks for each
essay question; the system should support long-form answers; essay answers must be saved and submitted
for manual grading; lecturers should be able to review complete essay responses; lecturers should be
able to award marks and provide individual feedback.

3. COMBINED EXAMINATION FORMATS. Lecturers should not be restricted to using only one examination
format. Allow them to combine MCQs, short-answer questions and essay questions in a single examination.
For example, an examination could contain: Section A: 10 Multiple-Choice Questions; Section B: 5
Short-Answer Questions; Section C: 2 Essay Questions. The lecturer should be able to organise questions
into sections, assign marks to each question and determine the total examination score. The system must
automatically calculate the total marks available across all sections.

4. EXAMINATION DEADLINES AND ACCESS CONTROL. Every examination MUST have an opening date and a submission
deadline. The lecturer or administrator must be able to: set the examination opening date and time; set
the examination closing date and time; edit the deadline before the examination closes; publish
examinations for learners to access; extend an examination deadline when necessary; close an
examination manually if required.
Learner Access Rules: learners should only access an examination once it has been published and its
opening date has arrived; learners must only access examinations belonging to courses in which they are
enrolled; the examination deadline must be clearly displayed on the learner's dashboard and examination
page; learners must submit their answers before the specified deadline; once the deadline has passed,
the system must automatically prevent further submissions; the system should automatically close
examination attempts when the deadline expires; learners who have not submitted their examinations
should have their saved answers preserved for the lecturer to review; lecturers and administrators
should be able to identify submitted, unsubmitted and late examination attempts.
IMPORTANT: NO COUNTDOWN TIMER. Do NOT implement a countdown timer or individual time limit for
examinations. Learners should be allowed to work on their examinations at their own pace throughout the
examination period. The only time restriction should be the submission deadline established by the
lecturer or administrator. The system may display the examination's closing date and time, but it must
not display an individual countdown timer.

5. LEARNER EXAMINATION INTERFACE. Create a clean, professional, responsive and user-friendly examination
interface. Learners should be able to: view available examinations under their enrolled courses; see
examination titles and descriptions; read examination instructions before starting; view the opening
date and submission deadline; see the total marks and pass mark; start an examination when it becomes
available; answer MCQs by selecting options A, B, C or D; type responses for short-answer questions;
write detailed responses in essay text boxes; navigate between examination questions and sections;
review their answers before submission; save their progress automatically; submit their completed
examinations.
Automatic Draft Saving. Implement automatic answer saving throughout the examination. This is important
because learners may accidentally close the application, lose internet connectivity or experience
unexpected interruptions. Requirements: automatically save answers as learners work; preserve previously
saved answers when learners leave and return to an examination; restore saved answers when learners
reopen an examination before its deadline; display an appropriate saving indicator; prevent accidental
loss of examination responses.
Examination Submission. Before final submission, display a confirmation message asking learners whether
they are sure they want to submit their examination. Once submitted: record the submission date and
time; prevent further editing unless a retake is authorised; make the submitted answers available to the
lecturer for grading; update the learner's examination status.

6. AUTOMATIC AND MANUAL GRADING SYSTEM. Implement a grading system that supports both automatic and
manual marking. Automatic Grading: MCQs must be marked automatically using the correct answers provided
by the lecturer; the system should calculate the total MCQ score; the system should store the
automatically generated marks. Manual Grading: short-answer questions must be available for manual
grading; essay questions must be available for manual grading; lecturers should be able to award marks
question by question; lecturers should be able to provide individual feedback; the system should
prevent marks from exceeding the maximum allocated to each question.
Final Score Calculation. After all questions have been graded, the system should: combine MCQ,
short-answer and essay scores; calculate the learner's total examination score; calculate the
percentage; determine whether the learner passed or failed based on the specified pass mark; save the
final result. Results should only be released to learners after the lecturer or administrator has
completed grading and authorised their release.

7. EXAMINATION RESULTS AND GRADE BOOK INTEGRATION. Integrate examination results into the existing DDTC
LMS grade book. Lecturers and administrators should be able to view: learner's full name; course or
subject; examination title; examination submission date; MCQ score; short-answer score; essay score;
total score obtained; total marks available; percentage; pass or fail status; lecturer's feedback;
grading status. The system should also allow lecturers and administrators to: view results for an
entire examination; view individual learners' examination scripts; review learners' answers; edit marks
before releasing results; provide feedback; export examination results in Excel or CSV format. Learners
should be able to view their examination results and lecturer feedback once results have been
officially released.

8. EXAMINATION HISTORY AND RECORD MANAGEMENT. Maintain a complete examination history for accountability
and future reference. The system should record: examination creation date; examination creator;
examination publication date; examination opening date; examination deadline; learner attempts;
submission dates and times; examination answers; grading records; lecturer feedback; final scores;
retake history, where applicable. Examination records must remain accessible to authorised lecturers and
administrators.

9. USER ROLES AND PERMISSIONS. Administrator: create and manage examinations across the institution;
assign examinations to courses; view all examination records and results; manage deadlines; authorise
retakes; grade examinations where authorised; release results; export examination reports. Lecturer:
create examinations for assigned courses; manage examination questions; publish examinations; set and
manage deadlines; view learner submissions; grade short-answer and essay questions; review automatic MCQ
scores; provide feedback; release results where authorised. Learner: view examinations for enrolled
courses; take available examinations; save and submit answers; view examination status; view released
examination results and feedback.

10. SECURITY AND SYSTEM REQUIREMENTS. (1) Only authorised lecturers and administrators can create and
manage examinations. (2) Learners must only access examinations belonging to their enrolled courses. (3)
Correct MCQ answers must never be exposed to learners before or during an examination. (4) Examination
questions and answers must be securely stored. (5) Learners must not be able to modify submitted
examinations. (6) Prevent duplicate submissions unless retakes are authorised. (7) Enforce examination
deadlines on the backend, not just the frontend. (8) Use the database and server time consistently when
enforcing deadlines. (9) Preserve saved answers during connectivity interruptions. (10) Maintain
appropriate audit logs for examination activities. (11) Ensure all examination data is protected by the
existing authentication and authorisation system.

11. DESIGN AND INTEGRATION. Follow the existing DDTC LMS design system, including its colours and
branding, typography, navigation structure, dashboard layouts, existing buttons, cards, dialogs and form
components, light and dark themes. Integrate the examination feature into the existing administrator
dashboard, lecturer dashboard, learner dashboard, course management section and grade book. Do not
create a separate application or duplicate existing functionality. The examination interface must work
properly on desktop computers, tablets and mobile phones.

12. IMPLEMENTATION INSTRUCTIONS. Before implementing anything, carefully inspect the existing DDTC LMS
codebase. Review: existing frontend architecture; backend architecture; database schema; authentication
and authorisation system; existing user roles; course management functionality; assignment submission
system; existing grade book; file and document management. Reuse existing infrastructure and components
wherever possible. Implement all necessary database migrations, backend services, API endpoints,
frontend interfaces, security policies and grading workflows. Ensure the new examination feature does
not break, remove or unnecessarily modify existing working features. Do not introduce duplicate tables,
unnecessary dependencies or redundant functionality. Do not deliver placeholder buttons or interfaces
that are not connected to actual functionality.

FINAL EXPECTATION: Deliver a fully functional End-of-Course / End-of-Subject Examination System that
allows lecturers and administrators to create examinations using MCQs, short-answer questions and essay
questions, set opening dates and submission deadlines, receive learner submissions, grade examinations,
provide feedback and publish results. Learners must be able to complete examinations at their own pace
without a countdown timer, provided they submit before the specified deadline. The entire feature must
work seamlessly within the existing DYNAMIC DISCIPLESHIP TRAINING CENTRE LMS.
