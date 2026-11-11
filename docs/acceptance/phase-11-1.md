# Step 11.1 acceptance evidence: live presence, settings that take effect, examination answers

- Requests: live presence (owner answers of 2026-11-06, plan approved 2026-11-11); and, added by the owner on 2026-11-11 while the step was open: the centred idle warning, settings that take effect, arrow bullets on the dashboard introduction, the signed-out alert card on Sign In, examination documents that open, and up to three audio answers. Decision record: ADR-020 items 1 to 10. Request file: `docs/requests/2026-11-11-settings-take-effect-intro-arrows-signed-out-alert.md`.
- Branch: `step-11-1-presence` (19 commits on top of `phase-11-done`).
- Reviewer (O2): Prince Boateng.

## 1. What changed

- **Who's online** (items 1 to 5): a card on learner and lecturer dashboards listing course-mates who have the app open. One private Realtime channel per course, authorised by the database (migration 43); names come only from `presence_people` for course-mates; administrators are never shown or counted.
- **Idle warning** (item 6): centred on every screen size over a stronger dim.
- **Settings take effect** (item 7; migration 44):
  - Storage buckets take their size limit from the upload limits setting, at once;
  - every screen reads each kind's limit, the pass mark and whether courses need approval from `client_settings()`;
  - the lecturer's button says Publish when approval is off; a new examination starts from the pass mark setting; open sessions read the idle limits again every few minutes;
  - `finalize-upload` checks images with ranged reads; the checksum is recorded for images up to 2 MB.
- **Dashboard introduction** (item 8): each point is a list item with an arrow bullet.
- **Signed-out notice on Sign In** (item 9): an alert card in the error colour (tinted background, red left edge, filled warning icon, bold title, the reason beneath).
- **Examination answers** (item 10; migration 45):
  - a PDF answer has Open (a new tab opened inside the click) and every document has Download; a document just uploaded can be opened at once, and has Replace and Remove;
  - up to three recordings or audio files on a short-answer or essay answer (`exam_answers.audio_file_ids`), each with Replace and Remove; the lecturer's script and the learner's submitted answers show them all.
- No new toasts or floating action buttons.

## 2. Tests

Security tests were written first and seen to fail before each migration (files 33, 34 and 35).

| Suite | Local (2026-11-11) | CI |
|---|---|---|
| Lint, type check, secret scan, dependency audit (nothing high), build | Pass | Pass |
| Unit | 43 files, **545 passed** | Pass |
| Database (pgTAP) | 36 files, **1,367 passed** (new: 33 presence, 19 tests; 34 settings, 16 tests; 35 recordings, 20 tests) | Pass |
| Edge Functions | See the note below | **117 passed** (in the database job) |
| Generated database types match the migrations | Regenerated | Pass |
| End to end, every device project, light and dark | Changed specs only, see below | See section 3 |
| Lighthouse CI (mobile preset) | Not run locally | Pass |
| gitleaks, full history | Not run locally | Pass |

**Local end-to-end runs of the changed specs:**

- `examinations.spec.js` (opens and downloads the PDF as the learner and as the lecturer; three audio answers added, one replaced, one removed): passed on desktop Chrome, Firefox and WebKit, iPhone SE and Pixel 7.
- `settings-effect.spec.js` (cover limit raised to 5 MB, a 3 MB cover uploaded) with `course-cover.spec.js`: 12 of 12 across three device projects, twice each.
- `notifications.spec.js` (the administrator's settings test): passed twice on laptop-1440 after the helper change in section 3.

**Local limits, stated plainly.** Docker Desktop on the development machine has 2.8 GB of memory. The local Edge Function runner cuts functions off under that pressure ("CPU time hard limit", "WORKER_LIMIT", connection resets), in different tests on each run, including tests this step did not touch; each passed when run again. So the full local `npm run verify` was not completed green on this machine for this step: its end-to-end and Edge Function steps are evidenced by CI instead. Raising Docker's memory (Settings, Resources) should remove this.

## 3. CI

- Run 1 (manual run on the branch, commit `c702674`): https://github.com/princebjr/ddtc-lms-/actions/runs/43088726865
  - Lint, types, unit, secret scan, audit, build: pass. Database, Edge Function and generated types: pass. gitleaks: pass. Lighthouse: pass.
  - End to end: shards 1, 2, 4, 6, 7 and 8 each **387 passed**. Shard 3: **386 passed, 1 failed**.
  - The failure: `notifications.spec.js`, "an administrator changes a setting, finds it in the audit logs and reads a report", on laptop-1440 light only: an axe colour-contrast report on the Reports page's "Download CSV" button. The report's data arrived while axe was reading the page; the button was fading from its disabled look (150 ms), which axe read as low contrast. Not a change of this step (Reports is from Phase 11) and the button passes once shown.
  - Fix: `expectNoAxeViolations` now also waits for loading (`aria-busy`) to end before checking, as it already waited for one-off animations. The check itself is unchanged.
- The run on the final commit is the pull request's CI gate.

## 4. Screenshots

`docs/acceptance/phase-11-1/screens/`, 18 images at 375, 768 and 1280 px in light and dark:

- `login-idle-10` (the signed-out alert card);
- `learner-dashboard-intro` (arrow bullets);
- `learner-exam-audio-answers` (two audio answers with Replace and Remove; the PDF with Open, Download, Replace document and Remove document).

The signed-in screens were captured with a check for sideways scrolling and console errors; none found.

## 5. Manual and real-device checks

- Owner, 2026-11-11: replied "done" to the request to check "Who's online" on two phones signed in to the same course, and the examination document Open and Download and the three audio answers on a phone. Please confirm on the pull request if any of these was not checked.
- Not checked by anyone yet: opening a PDF answer on an iPhone in Safari specifically (the case the pop-up fix is for). WebKit passes in the automated run.

## 6. Owner steps (staging)

1. `npx supabase db push --linked` (migrations `20261111000600_presence.sql`, `20261111000700_settings_take_effect.sql`, `20261111000800_exam_recordings.sql`).
2. Deploy the Edge Functions `finalize-upload` and `exam-attempt`.
3. Realtime: confirm private channels are allowed for the project (RUNBOOK, "Who's online").
4. On the preview: change the profile photo limit to 5 MB in Settings and upload a photo between 2 and 5 MB; answer an essay with a PDF and two recordings, then open the PDF from the lecturer's script.
5. If any upload limit is raised above the project's Storage upload cap, raise that cap too (SECURITY_AND_ACCESS, "Settings take effect").

## 7. Filed for later

One mode per examination section, chosen by the lecturer from the modes picked for the examination (owner request and answer of 2026-11-11): to be planned as its own step after this one is merged.
