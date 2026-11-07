# Phase 6 acceptance evidence: Lessons and lesson audio

- Phase file: `docs/phases/phase-06-lessons-and-audio.md`
- Branch and pull request: `phase-6-lessons-audio`, https://github.com/princebjr/ddtc-lms-/pull/10
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-07
- Plan approved by the owner on 2026-11-06 together with the audio brief, recorded as ADR-006 (waveform player, peaks from the uploader's browser, recording indicators, recorder in Phase 8, several recordings per submission within the limits).

## 1. What was built

| Build item (phase file) | Where |
|---|---|
| `lessons`, `lesson_audio_files`, `lesson_attachments`, `lesson_progress` | migration `20261106000400_lessons.sql` (every foreign key `ON DELETE RESTRICT`; unique position, deferrable for atomic reorder; one ACTIVE audio per lesson; attachment removal keeps the row) |
| Sanitised rich-text editor, drafts, publish, reorder | `src/components/lessons/RichTextEditor.jsx` (TipTap 3.32.0, offers only what the allow-list keeps); `manage-lessons` cleans HTML on the server (`_shared/lesson-html.ts`); the lessons table refuses script-like content as a second layer; learners' browsers clean it again (DOMPurify); save, publish, unpublish with Undo, atomic reorder with Undo (`20261106000500_lesson_functions.sql`) |
| Upload pipeline (D18), `lesson-audio` and `lesson-attachments` buckets and policies; one `file_objects` record per file | `register-upload` and `finalize-upload` extended; real type and duration from the file's own bytes with ranged reads (`_shared/audio.ts`: MP3 incl. Xing/VBRI, M4A with a sound track and no video, WAV; `_shared/documents.ts`: PDF, DOCX, PPTX, macros refused); the extension must match the content; resumable (tus) upload over 25 MB (`src/lib/uploads.js`) |
| Learner lesson page: player, Download Audio, previous and next, completion, progress | `src/pages/learner/LearnerLessonPage.jsx`, course progress in `LearnerCoursePage.jsx`; `mark_lesson()` refuses COMPLETED enrolments and ARCHIVED courses |
| Mobile audio standard (Section 15): full-width player, 44 px controls, touch-draggable seek, speed 0.75x to 2x, Media Session, metadata-only preload, no autoplay, size before download, reflowing content | `src/components/audio/AudioPlayer.jsx` and `Waveform.jsx` (ADR-006); `lesson-content` styles (images shrink, tables and code scroll inside their box) |
| Audio replacement with SUPERSEDED history | `lesson_audio_activate`; the editor's Audio history list |
| ADR-006: waveform peaks | `file_objects.waveform_peaks` (128 values, checked in the database and by `finalize-upload`); computed in the uploader's browser (`src/lib/audio/peaks.js`); missing peaks computed by viewers for files under 10 minutes (`useWaveformPeaks`) |
| Living mockup of the player | `/dev/audio` (preview builds only): every size and state with notes |

Also during the phase: Edge Function calls now give up after 90 seconds with a clear message instead of leaving a screen waiting (found when a stopped server worker left an upload on "Checking the file…").

## 2. Design rationale (ADR-006 audio)

- **Waveform, not a slider track.** Lessons are long teaching recordings; seeing loud and quiet passages helps learners find a section again. Bars are 3 px with 2 px gaps and rounded ends, centred on a middle line; the bar count follows the width (about 48 on phones, 120 on desktop, up to 160, spread evenly beyond that).
- **Never colour alone.** Played bars are blue (`wave-played`) and unplayed slate (`wave-unplayed`), but the position is also shown by the playhead line with round handles and by the times (current left, remaining right). All waveform colours pass 3:1 against the card in light and dark (`tests/unit/tokens-contrast.test.js`).
- **Touch first.** 56 px play and pause, 44 px targets everywhere, tap anywhere to seek, drag to scrub with a time bubble showing where you will land; 15-second skips for quick corrections on a phone.
- **Accessible.** The waveform is a slider with the time spoken in words ("1 minute 20 seconds of 12 minutes 40 seconds"); arrows seek 5 s, Page keys 15 s, Home and End; errors are announced.
- **Data friendly.** Metadata-only preload, no autoplay, the size shown before any download; long recordings without peaks show even placeholder bars instead of downloading the file to draw them.
- **Fits any card.** The player lays itself out by its own width (container queries): compact for lists, standard for lesson pages, full for grading; in narrow cards the controls stack and Download shows its icon and size.

Mockups: the screenshots of `/dev/audio` below show every size and state at 375, 768 and 1280 px in light and dark.

## 3. `npm run verify`

Local results (Windows, local Supabase), 2026-11-06 and 2026-11-07:

| Suite | Result |
|---|---|
| Lint and type check | pass |
| Unit and component (Vitest) | 20 files, 307 tests, pass (new: audio player and waveform 14, file inspection 9, function client 3) |
| Database (pgTAP) | 11 files, 500 tests, pass (new: 60 lesson access, 49 lesson functions) |
| Edge Function integration | 4 files, 53 tests, pass (new: 8 for lessons) |
| End-to-end, Phase 6 spec (`tests/e2e/lessons.spec.js`) | both flows pass locally on desktop Chrome, Pixel 7 and iPhone 15 (dark) |
| Full end-to-end matrix and Lighthouse | CI on PR #10 (see the pull request checks) |

Faults found and fixed during the phase, no test loosened:
- The lesson content check used `\b`, which in PostgreSQL regular expressions is a backspace, so a bare `<script>` slipped past it; it also refused links containing "data:". Fixed with tests for both.
- The waveform bars stopped at 800 px on wide players; they now spread across the full width.
- The compact player squeezed the waveform to nothing in the editor's narrow card; the editor uses the standard size and the player follows its own width.
- Dragging the waveform failed in Firefox and WebKit because pointer capture was refused; the drag no longer depends on it (unit test added).
- The audio history used a `<details>` element that did not open from a tap in iPhone WebKit; it is now a button with `aria-expanded`.

## 4. Tests required (phase file)

| Test | Result | Proof |
|---|---|---|
| Enrolled learner streams and downloads; unenrolled learner, draft lesson, REJECTED or PENDING file and other lecturers are all denied at Storage level | PASS | `09_lessons_access.test.sql` (Storage reads per role and file state); `lessons.spec.js` (learner plays, seeks and downloads; a learner who is not enrolled gets "Lesson not found") |
| Renamed non-audio file is rejected; oversize and over-duration files rejected | PASS | `tests/unit/file-inspect.test.js` (renamed PDF, JPEG, ZIP, video as .m4a); `tests/functions/lessons.test.js` (renamed PDF, 108-minute MP3, mismatched name, macro DOCX); oversize is refused at `register-upload` and by the bucket limit (100 MB, `09`); `lessons.spec.js` shows the rejection reason with Try again |
| Archiving a course leaves audio intact | PASS | `09` (the file stays VALIDATED and ACTIVE, learners can still play it, progress cannot change); `10_lesson_functions.test.sql` (no lesson or audio row is deleted) |
| Manual check on the Section 15 real-device matrix (locked screen, phone call, rotation, download to the iPhone Files app) | **Owner to do** | See section 6 |

## 5. Exit gate

| Line | Result | Proof |
|---|---|---|
| Playback and download work on all three devices | **Waiting for the owner's real-device check** (Claude Code has no devices) | Automated playback and download pass on the desktop, Android and iPhone device projects; the real-device steps are in section 6 |

## 6. Real-device check for the owner

On an iPhone (Safari), an Android phone (Chrome) and a desktop browser, signed in as a learner enrolled in a course with a published lesson that has audio:

1. Play the lesson audio; lock the screen: it keeps playing, and the lock screen shows the lesson title with play, pause and skip controls.
2. While playing, take or simulate a phone call: playback pauses and can be resumed afterwards.
3. Rotate the phone while playing: playback continues and the page does not scroll sideways.
4. Drag along the waveform and tap the 15-second skips; change the speed.
5. Tap Download: the size shows first; on iPhone the file can be saved to the Files app.

## 7. Screenshots

`docs/acceptance/phase-06/screens/`, at 375, 768 and 1280 px in light and dark:
- `dev-audio`: the audio player in every size and state (the living mockup);
- `lecturer-lessons-tab`, `lecturer-lesson-editor` (rich text, audio with history, attachments);
- `learner-course-lessons` (lessons and progress), `learner-lesson` (player, text, attachments, Previous and Next).

Captured with reduced motion and synthetic (silent) test audio, so the lesson waveforms are flat; `/dev/audio` uses a generated tone with a real shape. In full-page captures the phone navigation bar and the editor's sticky action bar are drawn once at the first screen's bottom edge; on a real screen the page has room for them.

## 8. Known issues and deferred items

| Item | Reason | Owner |
|---|---|---|
| Real-device checks (section 6) | Need real phones | Prince Boateng |
| Reordering uses Move up and Move down buttons, not drag and drop | Buttons work for keyboard, touch and screen readers alike; drag and drop can be added later without changing the data | Prince Boateng |
| Lecturers see the audio history as dates and status, not playable old versions | D09 requires keeping history; playing old versions needs a small extra function | Prince Boateng |
| Local end-to-end runs on the owner's Windows machine time out when the local functions runtime hits its CPU limit on a cold start | Local environment; CI is the reference | Prince Boateng |
