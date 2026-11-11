# Step 10.3 acceptance evidence: examination answers as uploaded files

- Request: the owner, 2026-11-10: "on the exam submission page of the learner, the learner should be able to also upload an audio or a pdf or word file as an answer in addition to the recording. make the record your answer more visible with red border". Plan approved the same day (one document per question, PDF or Word, 10 MB; red border). Decision: ADR-018.
- Branch: `step-10-3-exam-files`.
- Reviewer (O2): Prince Boateng.

## 1. What changed

- **Learner's examination page.** Under each short-answer or essay question, after the text box:
  - **Record your answer**: an outline button with a 2 px red (error token) border and a red microphone icon;
  - **Upload an audio file** (new): MP3, M4A, WAV, WebM or Ogg, with the submission audio limits;
  - **Upload a PDF or Word file** (new): PDF or .docx, up to 10 MB, one per question;
  - a one-line hint of the accepted formats.

  One audio answer per question (recorded or uploaded) and one document; each shows Remove. Multiple choice takes no file. A question answered only with a file counts as answered in the review list.
- **After submitting:** the learner's answers list the document with Open.
- **Lecturer's script:** the document with Open beside the typed answer and recording, to mark it.
- **Database (migration 37, `20261110000800_exam_documents.sql`):**
  - resource type `EXAM_ANSWER_DOCUMENT`;
  - `exam_answers.document_file_id` (ON DELETE RESTRICT), with a guard trigger: only the learner's own VALIDATED document for that attempt;
  - `exam_save_answers` takes `document_file_id`; multiple choice refuses files;
  - `exam_auto_mark`: an answer with only a recording or document is never marked 0 as blank;
  - the Storage read policy covers documents (the learner and the course's managers only);
  - new `exam_answer_files` lists both kinds for the same people.
- **Edge Functions:** `register-upload` and `finalize-upload` handle `EXAM_ANSWER_DOCUMENT` (content inspected; PPTX and macro files refused); `exam-attempt` saves `documentFileId`.
- No new toasts or floating action buttons.

## 2. Tests

| Suite | Result |
|---|---|
| Lint, type check | Pass (2026-11-11) |
| Unit | 36 files, **502 passed** (new: the three actions, the red border, a PDF uploaded and saved) |
| Database (pgTAP) | 29 files, **1,201 passed** (new file 28: someone else's document refused; multiple choice refuses one; a document-only answer waits for the lecturer; listing and opening allowed for the learner and the course's lecturer, refused for another learner and another course's lecturer) |
| Edge Functions | `examinations.test.js` **10 of 10** (new: a PDF uploaded and attached to an essay; multiple choice takes none) |
| End to end, local | `examinations.spec.js` on all 12 device projects (light and dark): **72 passed**. The first run had 70 passed and 2 failed. Both failures were in tests this step did not change, each timing out on a slow local Edge Function call (still spinning after 30 s). Practical marks passed when rerun. The Firefox examination-create test failed again on rerun, then passed after the local Supabase stack was restarted. |

The learner examination end-to-end test now also checks the red-bordered Record button, uploads a PDF to the essay, sees it after submitting, and sees Open on the lecturer's script.

## 3. Screenshots

`docs/acceptance/step-10-3/screens/`, 18 images at 375, 768 and 1280 px in light and dark:
- `learner-exam-answer-actions` (Record with the red border, the two upload buttons);
- `learner-exam-document-attached` (a document attached with Open and Remove document);
- `lecturer-exam-script-document` (Open on the lecturer's script).

Each was captured with a check for sideways scrolling and console errors; none found.

## 4. Owner steps (staging)

1. `npx supabase db push --linked` (migration `20261110000800_exam_documents.sql`).
2. Deploy the Edge Functions `exam-attempt`, `register-upload` and `finalize-upload`.
3. On the preview, start an examination as a learner, upload a PDF or Word file to an essay, submit, and open it from the lecturer's script.
