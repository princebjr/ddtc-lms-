# Owner requests: settings that take effect, arrow bullets, signed-out alert (2026-11-11)

**Requests (Prince Boateng, during Step 11.1):**

1. Every change an administrator makes on Settings must take effect. Example: the profile photo limit was changed from 2 MB to 5 MB and photos were still refused at 2 MB.
2. On every role's dashboard welcome card, list the points with an arrow bullet.
3. Redesign the signed-out notice on Sign In as an alert card like the "Something has wrong" example the owner sent: tinted red background, a red left edge, a filled warning icon, a bold title and the message beneath.

## What was wrong (request 1)

| Setting | Before | Now |
|---|---|---|
| Upload limits (all seven kinds) | The Storage buckets kept the sizes from their own migrations and the screens had fixed numbers, so a raised limit was refused and a lowered one was not shown. Images were read whole by `finalize-upload`, which failed on images of a few MB. | Buckets follow the setting; screens read it; images are checked with ranged reads. |
| Courses need approval | The database obeyed; the lecturer's button still said "Submit for approval" with approval off. | The button says "Publish" when approval is off. |
| Pass mark | Used for grades and reports; a new examination always started at 50. | A new examination starts from the setting; each examination keeps its own. |
| Idle sign-out and warning | Read once per sign-in. | Read again every few minutes and when the window regains focus. |
| Missing as 0, letter grades, chart bands, minimum class size, files per answer | Already read from the database on every use. | Unchanged. |

## As built (ADR-020 items 7 to 9)

Migration 44 (`sync_bucket_limits`, `client_settings`); `src/lib/settings/`; `finalize-upload`; `RoleIntro.jsx`; `LoginPage.jsx`. Tests: `34_settings_take_effect.test.sql`, `client-settings.test.jsx`, `admin-logic.test.js`, `settings-effect.spec.js`, `role-intro.test.jsx`, `auth-pages.test.jsx`.

## Limits that remain

- In-app lesson recording stops at 30 minutes whatever the lesson audio limit (ADR-007).
- The Supabase project's own Storage upload cap sits above every bucket; a limit raised past it needs that cap raised too (SECURITY_AND_ACCESS, "Settings take effect").

## Added the same day: examination documents and recordings (ADR-020 item 10)

**Report and request (Prince Boateng):** a learner who answers an essay with a PDF or Word file cannot open or preview it, and after submitting the lecturer cannot open it to grade. Also let the learner send up to three recordings or audio files as an answer, keeping delete and replace. Do not break the system.

**Cause of the report:** Open fetched the signed link first and opened the tab afterwards, which phones and Safari block as a pop-up; the link also forced a download instead of showing the PDF; and a document just uploaded had no link at all until the page was reloaded. Who may read the file was already right (Storage policy, pgTAP 28).

**As built:** `ExamDocumentLink.jsx` (Open for PDF, Download for all), `uploadFile` returns where the file is, migration 45 (`audio_file_ids`, up to three), `exam-attempt` (`audioFileIds`), `LearnerExamPage.jsx`, `ExamScriptPage.jsx`. Tests: `35_exam_recordings.test.sql`, `exams.test.jsx`, `examinations.spec.js` (opens and downloads the document as the learner and as the lecturer; adds three audio answers, replaces one, removes one).

## Filed, not built: one mode per examination section

Request of the same day: the lecturer chooses each section's mode (multiple choice, short answer or essay) and modes are not mixed. To be planned as its own step after Step 11.1; one wording question is open with the owner.
