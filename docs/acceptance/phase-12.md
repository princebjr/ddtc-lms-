# Phase 12 acceptance evidence: learner-audio retention

- Scope: BUILD_PLAN Phase 12 and D20, extended by the owner's decisions of 2026-11-12 (ADR-022): examination recordings included; 30 days of dry runs enforced by the database; the 180-day period read-only on screen; holds on a course, a learner, or one answer.
- Branch: `phase-12-audio-retention`.
- Reviewer (O2): Prince Boateng.

## 1. What was built

- **Migration 47 (`20261112000100_retention.sql`):**
  - `retention_holds` (COURSE, LEARNER, SUBMISSION, EXAM_ATTEMPT; one active hold per thing; released, never deleted) and `retention_runs` (DRY_RUN or LIVE, counts, per-file details);
  - `retention_candidates`: learner audio on submitted assignment answers (`submission_files.file_role` AUDIO) and on examination answers (`exam_answers.audio_file_ids`); VALIDATED, or DELETE_FAILED to retry; grade or result RELEASED at least `retention_days` ago; no active hold on the answer, the learner or the course;
  - `retention_run_begin` (LIVE only when switched on and dry runs began at least 30 days ago), `retention_still_candidate`, `retention_record`, `retention_run_finish` (audited): service role only;
  - `retention_hold_place`, `retention_hold_release`, `retention_hold_list`, `retention_answer_hold` (audited): AAL2 administrators only;
  - settings bounds (`retention_days` 0 to 3650, `retention_dry_run_days` 0 to 365);
  - `files_due_for_cleanup` no longer retries a submitted answer's failed audio (retention retries it after checking holds);
  - the daily cron job `retention-runner-daily` at 02:40.
- **Edge Function `retention-runner`:** scheduled job only. A dry run changes nothing. A live run checks each file again, deletes one object at a time by its exact stored path, and records DELETED or DELETE_FAILED.
- **Retention page** (administrators, System group):
  - what is removed and what is kept;
  - the Live deletion switch, which asks before switching on;
  - holds on a course or a learner, with Undo;
  - recent runs.
- **"Hold this answer's audio"** for administrators, on an assignment answer and on an examination script.
- Toasts used: Hold placed, Hold released (Undo), Retention enabled, Retention disabled. All four were already in UI_FEEDBACK; no new toasts or floating action buttons.

## 2. Exit gate

| Item | Result |
|---|---|
| Retention stays disabled (`retention_enabled` = false) until after the Phase 14 review | **Pass.** The setting is false (seed unchanged); the function test puts it back to false and 180 days after its run; the page says "Off at launch. Switch on only after the Phase 14 review." Even if switched on, nothing is deleted until 30 days of dry runs have passed (pgTAP 37, function test). |

## 3. Tests required by the phase file

| Requirement | Where | Result |
|---|---|---|
| With `retention_days` 0 and seeded fixtures, only eligible learner-submitted audio is deleted | `tests/functions/retention.test.js` (real stored files over HTTP); pgTAP 37 | Pass |
| Never deletes lesson audio, instruction audio, attachments, text, PDF or Word | pgTAP 37 (each kind seeded, never a candidate); function test (a PDF answer stays) | Pass |
| Never deletes ungraded, unreleased, held or too-recent files | pgTAP 37 (each case); function test (an unreleased answer and a held learner stay) | Pass |
| Submission, grade and history rows survive | pgTAP 37; function test (answer, file link and released score kept; the file row stays DELETED with `deleted_at`) | Pass |
| Failed deletions are logged and retried | pgTAP 37 (DELETE_FAILED with the attempt and error; listed again; the hourly cleanup leaves it to retention) | Pass |
| Dry run changes nothing | function test (every file VALIDATED and still stored after a dry run, and after switching on early); pgTAP 37 (the table refuses deletions on a dry-run row) | Pass |
| Production keeps `retention_days` at 180 | Seed value; read-only on screen; runbook | Pass |

## 4. Results (local, 2026-11-12)

| Suite | Result |
|---|---|
| Lint, type check, secret scan (546 files), dependency audit (nothing high), build | Pass |
| Unit | 44 files, **557 passed** (new: `retention.test.jsx`, 7 tests) |
| Database (pgTAP) | 38 files, **1,428 passed** (new file 37, 39 tests). Seen failing without the migration first. |
| Edge Functions | `retention.test.js` **4 of 4**; with `grading.test.js` (the cleanup job) and `submissions.test.js`: **30 of 30** |
| End to end, local | `retention.spec.js` on desktop Chrome (light), iPhone SE (dark) and the 320 px phone (light): **3 passed** |
| End to end on every device project, light and dark; Lighthouse; gitleaks | CI on the pull request |

Notes:
- The pgTAP test starts from no runs and no holds and counts only its own files, so leftovers from earlier local runs cannot change its result.
- After adding a new Edge Function locally, the stack must be restarted (`npx supabase stop`, `npm run db:start`) or it answers 404 "Function not found". Noted in the runbook.
- A race found while writing the runner: a hold placed between listing and deleting could have been ignored. The runner now checks each file again just before deleting it.

## 5. Screenshots

`docs/acceptance/phase-12/screens/`, 30 images at 375, 768 and 1280 px in light and dark:

- `admin-retention-status` (what is removed and kept; dry runs; the switch);
- `admin-retention-holds` (place a hold; an active hold with Release; released holds);
- `admin-retention-runs` (two dry runs with their counts);
- `admin-retention-confirm` (the confirmation before switching on);
- `admin-answer-audio-hold` (the Audio retention card on an answer).

Captured with a check for sideways scrolling and console errors; none found. The holds and runs shown were seeded for the pictures.

## 6. Owner steps (staging)

1. `npx supabase db push --linked` (migration `20261112000100_retention.sql`, after the earlier ones if not yet pushed).
2. Deploy the Edge Function `retention-runner`.
3. Check that the cron job `retention-runner-daily` exists and that the vault secrets it uses (`project_url`, `service_role_key`) are set, as for the email job.
4. Leave `retention_enabled` false. The daily dry runs start the 30-day count.
5. The staging test with `retention_days` 0 is part of Phase 14 (BUILD_PLAN item 14); the runbook has the steps.

## 7. Known issues and deferred

- **Audio taken off an examination answer before submitting** (replaced or removed while answering) is not in any answer and so is never a retention candidate; it stays in storage. Same as before this phase. Owner: development; decide in Phase 13 whether `cleanup-files` should remove it.
- **Real-device check:** the Retention page on a real phone has not been tried. The automated device projects cover it. Owner: Prince Boateng.
