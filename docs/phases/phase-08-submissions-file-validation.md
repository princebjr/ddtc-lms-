# Phase 8: Submissions and file validation

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** File signature and limit rejections, late and extension rules, recorder on real iPhone and Android, upload resume.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Migrations for `submissions`, `submission_versions`, `submission_files`.
- `submit-assignment` with the rules in D10; `learner-submissions` bucket and policies. Implement resumable/failed-upload recovery, duplicate request idempotency, and safe retry handling.
- `cleanup-files` job (pending-upload expiry after 24 hours, rejected objects, replaced images and covers) with alerts on failure.
- ADR-009 (owner, 2026-11-07): every assignment offers both a text answer and an audio answer (recorded or uploaded), whatever the instruction type; PDF and Word only where the lecturer allowed them.
- ADR-007 (owner, 2026-11-07): lecturers also record lesson audio in the app with the same recorder: at most 30 minutes per recording, several recordings per lesson within the limit of 10 audio files; longer lessons are recorded with the phone's own recorder and uploaded.
- Browser audio recording with MediaRecorder, preview before submit, format fallback for Safari, upload alternative if the microphone is denied or unsupported. Keep the screen awake while recording where Wake Lock is supported, warn that recording stops if the app is backgrounded, resume interrupted uploads after a network change, and keep text-answer drafts in local browser storage (cleared on submit and on sign-out).
- Text, audio, PDF and Word submission; extension management for lecturers.
- D42 (ADR-010): submission review lists show each learner's branch chip. D43 (ADR-011): a text answer or a recording in progress is kept as a draft (per user, 24 hours) and restored with "Draft restored"; a recording or an upload in progress counts as activity, so nobody is signed out during one.

- Owner decisions approving this plan (2026-11-08), recorded as ADR-013: one answer combines a plain-text answer (at most 20,000 characters) with up to 5 files; D10 read as "after the effective due date only a learner who never submitted may submit, marked late, where late answers are allowed"; files never sent are removed after 24 hours (at once when the learner removes them); lesson audio also accepts WebM and Ogg; extensions are set, changed (with Undo) and taken back from the assignment's submission list, kept when taken back, with the new toast "Extension removed".

**Tests required**

- A renamed .exe sent as .pdf is rejected; oversize and over-duration rejected; late and extension rules behave exactly as D10; resubmission blocked after GRADED; a learner cannot read, write or overwrite another learner's submission or files.
- Playwright covers recording, upload and each file type.

**Exit gate (all must pass)**

- Recording and playback verified on a real iPhone (iOS 18 Safari), a real Android phone (Chrome) and desktop; an upload interrupted by switching networks resumes.

Git tag on completion: `phase-8-done`

## Evidence to save in `docs/acceptance/phase-08.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
