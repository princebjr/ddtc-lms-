# Phase 8 acceptance evidence: Submissions and file validation

- Phase file: `docs/phases/phase-08-submissions-file-validation.md`
- Branch and pull request: `phase-8-submissions`, https://github.com/princebjr/ddtc-lms-/pull/13
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-09
- Plan approved by the owner on 2026-11-08 with six decisions, recorded as ADR-013: one answer combines plain text (at most 20,000 characters) with up to 5 files; D10 read as "after the effective due date only a learner who never submitted may submit, marked late, where late answers are allowed"; files never sent are removed after 24 hours; lesson audio also accepts WebM and Ogg; extensions are set, changed and taken back, kept when taken back, with the new toast "Extension removed". Also in scope: the test-only fix for list searches clicked before the filtered rows arrive (the cause of the main CI failure after Phase 7).

## 1. What was built

| Build item | Where |
|---|---|
| `submissions`, `submission_versions`, `submission_files` | migration `20261108000100_submissions.sql`: one submission per learner and assignment; DRAFT only while nothing is sent (CHECK); plain-text answers up to 20,000 characters (CHECK); versions and their files never change or disappear (trigger, every role); a file joins a version only in the transaction that submits it, only a validated file of that version's own submission, at most 5 per version (trigger); a request id per version so a repeated request makes no second version; RLS: the learner reads their own (drafts included), the course's lecturers and AAL2 administrators read submitted answers only; no client writes; grading columns closed until Phase 9; foreign keys `ON DELETE RESTRICT` |
| `submit-assignment` with the rules in D10 | migration `20261108000200_submission_functions.sql` (`private.submission_check`, `submission_submit`, `submission_prepare_upload`, `submission_draft_file_remove`, `my_submission()`) and the Edge Function `supabase/functions/submit-assignment` (actions submit and remove-file); lateness from server time; audited |
| `learner-submissions` bucket and policies | private, 25 MB; reads by the uploader (sent or waiting) and by the course's lecturers and AAL2 administrators for files of submitted versions only, VALIDATED only; no direct writes; `register-upload` and `finalize-upload` take SUBMISSION_FILE (audio within 25 MB and 10 minutes, PDF and Word within 10 MB, only where allowed) |
| Resumable and failed-upload recovery, idempotency, safe retries | answers and recordings always upload resumably (tus): a dropped connection retries, and when the device is offline the upload waits for the connection and carries on ("Upload resumed"); Cancel, Retry and Remove on each upload row; one request id per answer, kept across retries |
| `cleanup-files` (pending expiry, rejected objects, replaced images and covers) with alerts on failure | answers' files never sent are removed after 24 hours (`files_due_for_cleanup`); each failed removal is counted with its error (`file_objects.delete_attempts`, `last_delete_error`) and audited (`files.cleanup_failed`); `cleanup_failures()` lists files at 3 or more for AAL2 administrators (the administrator alert itself is Phase 11; until then the runbook gives the SQL) |
| ADR-009: text and audio answers on every assignment; PDF and Word where allowed | the answer form (`src/components/submissions/AnswerForm.jsx`) on the learner's assignment page: Write, Record and Upload add parts to one answer |
| ADR-007: lecturers record lesson audio in the app | the lesson editor's audio card: Record audio (30 minutes per recording, within the 10 files); lesson audio accepts WebM and Ogg |
| Browser recording | `src/hooks/use-recorder.js`, `src/components/recorder/Recorder.jsx`: MediaRecorder in the first format the browser offers (MP4 with AAC, WebM or Ogg with Opus) at 64 kbit/s, preview before use, Wake Lock while recording, a pause when the app is left (with the warning), an upload way out when the microphone is blocked or missing; the server reads real browser recordings (WebM without Duration, Ogg, fragmented MP4) in `supabase/functions/_shared/audio.ts` |
| Text-answer and recording drafts | the text answer through the D43 drafts (24 hours, per user); a recording in progress saved piece by piece to IndexedDB (`src/lib/recording/recording-drafts.js`, 24 hours), restored with "Draft restored", deleted by Use recording, Re-record, Discard and a deliberate sign-out; recording and uploading count as activity (D43) |
| Text, audio, PDF and Word submission; extension management for lecturers | the learner's version history (`VersionList.jsx`) and Assignments > Submitted; the lecturer's and administrator's submission list (`AssignmentSubmissionsPage.jsx`) with the extension dialog (`ExtensionDialog.jsx`: set or change with Undo, take back), and the read-only answer view (`SubmissionViewPage.jsx`); `manage-assignments` actions extension-set and extension-remove |
| D42: submission review lists show each learner's branch chip | `assignment_submissions()` returns `branch_name`; the submission list shows the chip |

Also during the phase: the list-search helper for the end-to-end suite (`searchList`); a new `actions` card role in `ResponsiveTable` (a row of buttons at the bottom of a phone card); the submission skeleton listed in UI_FEEDBACK; the development-only package `fake-indexeddb` 6.2.6 for unit tests.

## 2. Design rationale

- **One answer, several parts.** A learner can write and record in one answer (decision 1): the tabs choose what to add, the list under them shows everything that will be sent, and the sticky bar sums it up ("Text and 1 file") next to Submit. A resubmission starts from the last answer's text, because most resubmissions are corrections.
- **Recorder.** The 72 px red Mic and Stop buttons are the largest targets on the screen. On phones Discard and Pause show their icons only so the row fits 320 px; their names stay for screen readers. When recording starts the recorder comes to the middle of the screen, and the answer form's sticky bar stops floating while the recorder is in use, so nothing covers Stop. Leaving the app pauses the recording (phones stop the microphone in the background anyway) and says how to carry on.
- **Uploads.** Files upload as soon as they are added, so Submit is quick even on a slow connection; each row shows its progress and the server's verdict (Checking, Ready, Rejected with the reason).
- **Submission list.** The results-table pattern from the design: the ID number under the name, the branch chip, status chips (never colour alone), short Ghana dates, and View answer and Extension stacked in the last column; phone cards end with the two buttons.

## 3. `npm run verify`

Local results (Windows, local Supabase), 2026-11-09:

| Suite | Result |
|---|---|
| Lint and type check | pass |
| Unit and component (Vitest) | 31 files, 446 tests, pass (Phase 8 new: recording formats, levels, drafts and recorder states 15; answer form, helpers and extension dialog 15; audio inspection of WebM, Ogg and fragmented MP4 10; platform errors shown plainly 4) |
| Secret scan | pass (396 files, 0 findings) |
| Dependency audit (high and above) | pass; production dependencies have no advisories; 2 low and 9 moderate advisories in development tooling, unchanged by `fake-indexeddb` |
| Build | pass |
| Database (pgTAP) | 19 files, 879 tests, pass (Phase 8 new: 61 submission access, 59 submission functions) |
| Edge Function integration | 6 files, 84 tests, pass on the first run (Phase 8 new: 17 in `submissions.test.js`) |
| End-to-end, local | `submissions.spec.js` 4 tests on desktop Chrome, desktop Firefox (light and dark), the 320 px phone and Pixel 7 (dark): all pass, with real Chrome and Firefox recordings checked by the server; `assignments.spec.js` and `lessons.spec.js` on desktop Chrome and Pixel 7: 10 of 10. Local WebKit still hangs on start (Phase 7, section 8), so Safari's engine is covered by CI |
| Full end-to-end matrix and Lighthouse | CI on PR #13 (below) |

CI on PR #13 (2 workers per shard, 8 shards, every device project in light and dark):

| Run | Commit | Result | What failed and the fix |
|---|---|---|---|
| 42604048468 | `5a2a8a9` | failure (4 of 8 end-to-end shards) | Desktop Firefox: the simulated microphone waited for the audio engine to resume, and CI's Linux Firefox has no sound device (the stub no longer waits). iPhone SE: Remove sat under the sticky Submit bar (brought to the middle first). WebKit: a small upload that was cut and then finished sent no further progress report, so "Upload resumed" never showed; the app now also says it when the interrupted upload finishes (`c00486d`) |
| 42653286372 | `8ee3bd4` | failure (3 shards, the same test) | On the 320 px phone and the iPhone SE (light and dark) the open toasts "Recording saved" and "File not accepted" covered Remove wherever it was scrolled: the test now closes them first, as a person would (`9c36eee`). Everything else passed, including Lighthouse, pgTAP and every other device project |
| 42661619134 | `c64e9fd` | failure (3 shards) | The toast fix held (the learner's test passed on every project). Two other tests failed. (1) The dropped-connection upload test on WebKit (iPhone 15 dark, iPad portrait dark): the upload finished but "Upload resumed" never showed. The trace has one creation request and no record of the cut, so most likely WebKit sent the cut request again by itself and the app never saw a drop. The test now takes the device offline for a moment as it cuts the first attempt, so every attempt fails until the signal returns (`1bb2508`). (2) The Phase 4 user-management test on Pixel 7: the "Permissions updated" toast sat over "Can create courses", and each retried click rested the pointer on it, which pauses its timer by design, so it never left. The test now moves the pointer away and lets it go (`191417d`). Both pass locally on desktop Chrome, desktop Firefox, the 320 px phone and Pixel 7 (8 of 8) |
| on the head of PR #13 | the evidence commit | see the pull request's checks | |

Found while checking the CI fixes locally (fixed, tests written first where the app changed):
- **Platform errors shown word for word.** With four browsers sharing the local stack, the local Edge runtime ran out of room and the extension dialog showed its text, "Worker failed to respond due to a resource limit (please check logs)". Hosted Supabase answers the same way when a function reaches its limits. A call that the platform answers instead of our function now says "Something went wrong. Try again."; only our functions' messages reach the screen (`e913686`, 4 unit tests seen failing first).
- **One unit-suite run failed once** and then passed in eight further runs, four of them under double load; the failing test was not captured. The likeliest cause, the sign-out test for recording drafts waiting a fixed 20 ms for a deletion that sign-out does not wait for, now waits for the outcome (`c64e9fd`).
- **Local runs of `submissions.spec.js` after the fixes** (desktop Chrome, the 320 px phone in light and dark, Pixel 7), each failure traced in the local logs:
  - the learner's test alone on the 320 px phone, three times in a row: 3 of 3 passed;
  - four browsers at once (the learner's test only): 0 of 4. All four `register-upload` calls reached the local gateway and the local Edge runtime never answered (the gateway logged them as dropped by the browser, 499, after 40 seconds);
  - two workers, as in CI: 14 of 16. One extension save got the local runtime's resource-limit reply (the message fixed above), and one page reached "This is taking too long";
  - one worker: 15 of 16. The lecturer's list reached "This is taking too long" because its request never reached the local gateway (no record of it or its preflight, while a request sent at the same moment went through). The same function answers in 46 ms when called directly.
  
  These are the local stack on Windows (Docker Desktop's networking and the local Edge runtime). On CI's clean Linux runners the same steps passed on every device project in runs 42653286372 and 42661619134, so CI is the reference, as in Phase 7.

Tests written first and seen failing: pgTAP 17 (no submission tables) and 18 (no functions; a first run also exposed fixture ids that were not hex, fixed in the test helper), the audio-inspection tests for WebM, Ogg and fragmented MP4 (9 failing before the parsers), and the two unit tests for the CI faults of Phase 7 kept as written. Earlier tests changed only where the owner's new rules or this phase's screens replaced what they checked: the Phase 6 lesson-audio rejection message now lists WebM and Ogg (decision 5, in the function and end-to-end tests); the Phase 7 assignment page test now checks the answer form instead of the list of ways to answer; two link locators in `assignments.spec.js` are exact now that each row also has "Submissions for <title>"; the Phase 6 media tests render the audio card with a signed-in lecturer. Nothing was skipped or loosened.

Formatting: some files edited in this phase were reflowed by Prettier (single quotes, 160 characters) while new code was formatted; the repository was never formatted by one tool, so those lines changed shape without changing behaviour.

## 4. Tests required (phase file)

| Test | Result | Proof |
|---|---|---|
| A renamed .exe sent as .pdf is rejected | PASS | `tests/functions/submissions.test.js` (rejected and removed); end to end, a PDF renamed .mp3 is refused with "File not accepted" |
| Oversize and over-duration rejected | PASS | function tests (audio over 25 MB and PDF over 10 MB refused before upload; a 601-second recording rejected); unit tests (WebM, Ogg and fragmented MP4 over 10 minutes measured as such) |
| Late and extension rules behave exactly as D10 | PASS | `18_submission_functions.test.sql` (on time, resubmission, late where allowed, refused where not, no resubmission after the due date, extensions open and passed, graded, read-only, not open, not enrolled, suspended); function and end-to-end tests |
| Resubmission blocked after GRADED | PASS | pgTAP 18 ("This answer has been graded") |
| A learner cannot read, write or overwrite another learner's submission or files | PASS | `17_submissions_access.test.sql` (tables and Storage per role, no direct writes, no overwrite) and pgTAP 18 (another learner's file refused at submit and at removal); function tests |
| Playwright covers recording, upload and each file type | PASS | `tests/e2e/submissions.spec.js`: recording with the browser's real recorder, PDF, Word and audio uploads, a rejected file, the lesson recorder, an upload that resumes |
| D42: branch chips on submission review lists | PASS | pgTAP 17 (`assignment_submissions`), end to end (the chip on the lecturer's list) |
| D43: text and recording drafts; recording and uploading count as activity | PASS | `tests/unit/recording.test.jsx` (recording drafts, deliberate sign-out), `tests/unit/drafts.test.jsx`, `use-recorder.js` and `uploads.js` hold the session awake (`holdAwake`) |

## 5. Exit gate

| Line | Result | Proof |
|---|---|---|
| Recording and playback verified on a real iPhone (iOS 18 Safari), a real Android phone (Chrome) and desktop; an upload interrupted by switching networks resumes | **Waiting for the owner's real-device check** (Claude Code has no devices) | Automated: recording with the browsers' real recorders on desktop Chrome and Firefox, and on the phone and tablet projects in CI; an interrupted upload resuming end to end. The real-device steps are in section 6 |

## 6. Owner steps

Staging, after approval and before merging (as before, the owner runs these; they change the hosted project):

1. Apply the migrations: `npx supabase db push --linked` (adds `20261108000100` and `20261108000200`).
2. Deploy the functions that changed: `npx supabase functions deploy submit-assignment register-upload finalize-upload manage-assignments cleanup-files` (`submit-assignment` is new).

Real-device check (an iPhone with iOS 18 in Safari, an Android phone in Chrome, a desktop browser), on staging with a learner and a lecturer of the same course and a published assignment:

1. As the learner, open the assignment, Record: allow the microphone, record about 30 seconds, Stop, play the preview, Use recording: the file reaches Ready. Write a few words, Submit: "Submission received".
2. Lock the phone for a moment while recording: the recording pauses and says so; Resume or Stop keeps what was recorded.
3. Start an upload of a large voice recording (several MB) and switch from Wi-Fi to mobile data (or turn Wi-Fi off) halfway: the upload carries on ("Upload resumed") and reaches Ready.
4. As the lecturer, open the assignment's Submissions, View answer: the recording plays on each device, including one made on another kind of phone (an iPhone recording on Android and the reverse).
5. As the lecturer, in a lesson, Record audio for a minute, Use recording: "Audio ready", and it plays for an enrolled learner.
6. Refuse the microphone once (or block it in the browser settings): the app says the microphone is blocked and offers Upload instead.

## 7. Screenshots

`docs/acceptance/phase-08/screens/`, 54 images: each screen at 375, 768 and 1280 px in light and dark, captured with a check that no page scrolls sideways, no text runs out of a button and the console stays free of errors:
- Learner: `learner-answer-form` (Upload tab, a ready PDF), `learner-recording`, `learner-recording-review`, `learner-answer-sent` (the resubmission form and both versions), `learner-assignments-submitted`.
- Lecturer: `lecturer-submissions` (branch chips, statuses, View answer and Extension), `lecturer-extension-dialog`, `lecturer-answer-view`, `lecturer-lesson-recorder`.

Captured with reduced motion (the recording dot stands still) and a simulated microphone. In full-page captures the phone navigation bar and the sticky Submit bar are drawn once where the first screen ends; on a real screen the page has room for them.

## 8. Known issues and deferred items

| Item | Reason | Owner |
|---|---|---|
| Real-device checks (section 6) | Need real phones | Prince Boateng |
| Grading, release, reopening and the results counts on the submission screens | Phase 9 (the list and the answer view are built to grow into them; the grading columns stay closed until then) | Prince Boateng |
| The administrator alert for files that keep failing to be removed, and notifications for extensions | Phase 11 (the list and the audit records exist now; the runbook has the SQL) | Prince Boateng |
| Files sent in an earlier version are not carried into a new one: the learner adds them again | D10 keeps each version's files with it (a file belongs to one version) | Prince Boateng |
| Local test runs on the owner's Windows machine: local WebKit hangs on start; the local stack needed restarts after Docker stopped overnight; with several browsers at once the local Edge runtime stops answering and Docker Desktop's networking can drop a request (section 3) | Local environment; CI on clean runners is the reference | Prince Boateng |
