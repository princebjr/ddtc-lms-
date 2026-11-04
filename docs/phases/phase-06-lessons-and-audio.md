# Phase 6: Lessons and lesson audio

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** Storage-policy denials (pending, rejected, unenrolled, draft), real-device playback and download, audio history.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Migrations for `lessons`, `lesson_audio_files`, `lesson_attachments`, `lesson_progress`.
- Sanitised rich-text editor, drafts, publish, reorder.
- Upload pipeline (D18) and `lesson-audio` and `lesson-attachments` buckets with policies. Every uploaded resource must have a `file_objects` registry record; do not duplicate validation state across resource tables.
- Learner lesson page: audio player with play, pause, progress, current time, duration, Download Audio, previous and next, completion control, progress indicator.
- Mobile audio standard (Section 15): full-width player, 44 px controls, touch-draggable seek bar, playback speed 0.75x to 2x, Media Session metadata for lock-screen controls, `preload` set to metadata only, no autoplay, file size shown before download, and lesson content, images and tables that reflow without overflow.
- Audio replacement with SUPERSEDED history.

**Tests required**

- Enrolled learner streams and downloads; unenrolled learner, draft lesson, REJECTED or PENDING file and other lecturers are all denied at Storage level.
- Renamed non-audio file is rejected; oversize and over-duration files rejected.
- Archiving a course leaves audio intact.
- Manual check on the Section 15 real-device matrix, including playback with the screen locked, after a phone call interruption, on rotation, and download to the iPhone Files app.

**Exit gate (all must pass)**

- Playback and download work on all three devices.

Git tag on completion: `phase-6-done`

## Evidence to save in `docs/acceptance/phase-06.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
