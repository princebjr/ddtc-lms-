# Phase 13 acceptance evidence: hardening, accessibility, performance and recovery

Branch `phase-13-hardening`. Plan approved 2026-11-12 with the five recommendations; owner changes on the way: no Sentry ("remove the Sentry implementation, but run the toughest test"), clearing notifications (ADR-024), and phase order 13, 15, 14 (ADR-023).

## 1. What was built

| Area | What | Where |
|---|---|---|
| Policy review and attacks | Every RLS and Storage policy reviewed against SECURITY_AND_ACCESS section 7. 51 database attack checks (direct-ID tampering, cross-course reads, unpublished resources, invalid file states, forged role, score and deadline, private schema, Storage paths), each with a positive control. HTTP attacks on every Edge Function: no session (401), wrong role or no two-step verification (403), scheduled jobs called by people (403), expired and foreign signed URLs, rate limits (429). | `supabase/tests/38_attacks.test.sql`, `tests/functions/attacks.test.js` |
| Headers and CSP | CSP (inline theme script by hash; a unit test keeps the hash in sync), HSTS, nosniff, DENY framing, Referrer-Policy, Permissions-Policy, COOP; the same headers in the local preview. | `vercel.json`, `scripts/security-headers.mjs`, `vite.config.js` |
| Rate limits | Per person on exports, learner imports, upload starts, invitations and media removal (migration 48); Auth per-IP limits for staging and production. | `_shared/rate-limit.ts`, `supabase/config.toml` |
| Dependencies | Audit fixes without major upgrades. No Sentry anywhere in the app (ADR-023). | `package-lock.json`, `CLAUDE.md` |
| Accessibility | Keyboard-only journeys (sign in, complete a lesson, instruction audio, written answer, grading, dialog Escape). Distribution charts give screen readers every band (WCAG 1.1.1). axe in both themes stays in every end-to-end test. | `tests/e2e/keyboard.spec.js`, `DistributionChart.jsx` |
| Speed with the same rules | Per-row permission checks replaced by once-per-query checks: gradebook (49, 50), lesson progress (52), answers and versions (54). Allow and deny tests for each (pgTAP 41, 43). Learner dashboard layout shift 0.13 to 0. | migrations 49, 50, 52, 54 |
| Monitoring | Daily health check (06:15) alerting administrators; System health card on the administrator dashboard; backup runs recorded (migration 51). | `SystemHealth.jsx`, pgTAP 40 |
| Backups and restore | Nightly encrypted database dump and Storage copy to Cloudflare R2, reported to the health check; restore check script; runbook. | `.github/workflows/backup.yml`, `scripts/verify-restore.sql`, `docs/RUNBOOK.md` |
| Notifications clear (owner request) | X per notification, Clear all, Undo; learners and lecturers only; nothing deleted (migration 53). | `NotificationsPage.jsx`, pgTAP 42 |
| Load and speed tooling | Load seed (3,000 learners, 45,000 answers), query and policy timings, load test, throttled-phone budget test. | `tests/load/`, `tests/e2e/performance.spec.js`, `docs/CAPACITY.md` |
| Fix found by the screenshots | Administrative events on the dashboard showed internal action keys (for example `profile.course_creation_changed`); every action now has a readable name and unknown ones read "Administrative change". | `DashboardPanels.jsx`, `admin-insight.test.jsx` |
| Documents | ADR-023, ADR-024, runbook (backups, restore drill, monitoring, rate limits, headers), retention schedule draft, data model, security, design, tracker (Phase 12 ticked; Phase 15 before 14). | `docs/` |

## 2. Exit gate

| Item | Result |
|---|---|
| No high-severity findings open | **Pass.** The attack suites found no way past any rule. `npm audit`: 0 issues in production dependencies; 9 in development and build tools (2 low, 7 moderate, none high). Secret scan clean. |
| Restore drill documented and successful | **Partly.** Documented (runbook "Restore drill"). Rehearsed locally end to end and successful (section 5). The drill on a temporary Supabase project from a real R2 backup needs the owner's R2 account and a temporary project (section 7), so it is **open**. |

## 3. Tests required by the phase file

| Requirement | Where | Result |
|---|---|---|
| Restore database and Storage, verify object and database consistency, run the acceptance journey; record duration and data-loss window | Local rehearsal (section 5); staging drill in the runbook | Local: pass. Staging: open (owner accounts). |

## 4. Results (local, 2026-11-12)

| Suite | Result |
|---|---|
| Lint, type check | Pass |
| Unit | 47 files, **569 passed**; then `admin-insight.test.jsx` 11 of 11 with the new events test |
| Database (pgTAP) | 44 files, **1,536 passed** |
| Edge Functions | 158 tests. Local runs failed on the local runtime, not the code: the container had grown to 1.2 GB and hit its CPU limit (503, 546, connection resets). After a restart: **155 of 158**, the 3 failures being one runtime 546 (passed on rerun) and the retention test depending on earlier local runs' history (fixed: the test no longer depends on it; passed 3 runs in a row). CI runs the whole suite on a fresh stack. |
| Secret scan, dependency audit | Pass (no high) |
| End to end, all 24 device projects, light and dark; Lighthouse | CI on the pull request |

**Query timings** on the load seed (database time, median of three; laptop Docker with 2.8 GB):

| Read | Before | After |
|---|---|---|
| Gradebook (150 learners × 15 assignments) | 3,969 ms | 107 ms |
| Lesson progress for a course (lecturer) | 1,018 ms | 65 ms |
| Answers to the course's assignments (learner) | 2,900 ms | 118 ms |
| Answer versions in a course (learner / lecturer) | 2,400 / 5,900 ms | 133 / 119 ms |
| Every learner and lecturer screen read | | 17 to 438 ms |
| Administrator grade report, all courses | 4,100 ms | 4,282 ms (now 76 courses on the local database; about 185 ms per course, all of it the grade calculation itself). Known issue 1. |

**Load test** (160 virtual users: 150 learners, 10 lecturers, 120 s, think time 1 s, against the local stack): **13,576 requests, 0 errors, 106.5 requests a second**; screen calls p50 0.2 to 0.6 s, p95 1.3 to 3.8 s. The first call after sign-in (my enrolments) was 7.7 s p50 because all 160 users start in the same second; Phase 15's spike test covers it. One earlier run was discarded: the laptop paused for about 45 minutes in the middle (every slow request about 2,750 s, tokens expired), so it measured nothing.

**Throttled mid-range Android** (Pixel 7, CPU 4× slower, slow 4G; local preview):

| Page | Load (LCP, budget 2.5 s) | Layout shift (CLS, 0.1) | Blocking (TBT, 600 ms) |
|---|---|---|---|
| Learner dashboard | 3.2 s (earlier runs 2.4 to 3.1 s) | 0 | 777 ms |
| Lesson | 5.8 s (earlier 3.0 to 3.6 s) | 0 | 578 ms |
| Assignment with instruction audio | 4.6 s | 0.001 | 3,408 ms |
| Gradebook | 3.9 s | 0 | 527 ms |

Layout shift is enforced and passes. Load time and blocking time are **over budget** and reported, not enforced (`ENFORCE_BUDGETS=1` enforces them); the owner decides (section 7). The numbers come from a loaded laptop and move a lot between runs; Phase 15 measures on staging.

## 5. Restore rehearsal (local, 2026-11-12)

On the load-seeded local database (3,307 accounts, 45,057 answers, 48,202 notifications):

1. `pg_dump --format=custom --no-owner --no-privileges`, as the Backup workflow does: 13.2 MB in **16 s**.
2. Encrypted with `age` to a new key and decrypted again: the file came back byte for byte (SHA-256 `d03af885…` both), and the encrypted file is age X25519 ciphertext.
3. Restored into a new empty database with `pg_restore`: **54 s**. 9 errors, all expected for a second database on the same server (`pg_cron` lives only in the main database, two server log settings, and vault secrets, which Postgres refuses to restore). The runbook now says to set the vault secrets again.
4. `scripts/verify-restore.sql` on the source and on the copy: **identical** output. Every table's row count matches, 0 VALIDATED files without a stored object, 0 orphans, 0 released scores outside their marks.
5. Course grades (`course_grade_summary` for every course, 3,061 rows), accounts (3,307) and stored-object records (99) fingerprinted on both: **identical**.

Duration about 1.5 minutes (RTO 8 hours); data-loss window 0 (dump and check minutes apart; RPO 24 hours). The scratch database, the decrypted copies and the key were deleted afterwards.

## 6. Screenshots

`docs/acceptance/phase-13/screens/`, 18 images at 375, 768 and 1280 px in light and dark:

- `learner-notifications-clear` (X on each notification, Clear all, Mark all read; the phone row under the title);
- `learner-dashboard` (My courses inside the overview, no layout shift);
- `admin-system-health` (the card with the two expected local warnings: no database backup yet, no storage backup yet).

Each capture checked for sideways scrolling (none). Console errors: one capture of the administrator dashboard in light hit one 500. The dashboard summary passed the 8 s statement timeout once, while the load-seeded database shared the laptop with the browser. The same call measures 76 ms median and 217 ms at worst. It did not recur in the following captures, and the database's logs show no other timeout today after migration 54, except in the discarded paused load run. One later capture failed because its Sign In click landed before the page was ready (no error shown, no Auth request); that is the unchanged sign-in screen on an overloaded laptop.

## 7. Owner steps

1. **Budgets:** decide whether load-time and blocking-time budgets block the release now, or (recommended) move to Phase 15, which is about speed on low-end phones and measures on staging.
2. **Backups:** create the Cloudflare R2 account and bucket, the `age` key (kept offline), the Supabase S3 key, and the GitHub secrets (runbook "Backups", about 30 minutes). Then run the Backup workflow once.
3. **Restore drill:** pause `ddtc-lms-dev`, create a temporary project, and run the drill from the R2 backup (runbook "Restore drill"). This closes the second exit-gate line.
4. **Uptime monitor:** a free account with two checks (runbook "Monitoring").
5. **Retention schedule:** review and approve `docs/RETENTION_SCHEDULE.md` (O21), with a legal or privacy adviser where needed.
6. **Real devices:** VoiceOver on an iPhone and TalkBack on Android: sign in, a lesson's audio player, a written answer, a chart.
7. **After merge (with your go-ahead):** on staging, `npx supabase db push --linked --yes` (migrations 48 to 54), deploy `export-gradebook`, `bulk-import-learners`, `register-upload`, `provision-lecturer`, `provision-admin` and `delete-media`, and `npx supabase config push` for the Auth rate limits.

## 8. Known issues and deferred

1. **Administrator grade report over every course** takes about 185 ms per course (4.3 s at 76 local courses; the statement limit is 8 s). The time is the grade calculation, the only place grades are computed (D30), so it was not touched at the end of this phase. Phase 15 brings options (for example one pass over all courses). Owner: development.
2. **Load-time and blocking-time budgets** on the throttled phone are not met (section 4). The assignment page's 3.4 s of blocking is the worst. Phase 15, pending the owner's decision. Owner: development.
3. **First request after a mass sign-in** is slow when every user starts in the same second. Phase 15 spike test. Owner: development.
4. **Local stack limits:** with 2.8 GB for Docker the Edge runtime needs a restart after a few hours of tests. CI is the reliable evidence. Owner: development.
5. **Audio removed from an examination answer before it was sent** stays in storage (carried from Phase 12): not deleted by cleanup or retention. Decide in Phase 15 with the capacity work. Owner: development.
6. **CLAUDE.md** still names Cloudflare Turnstile in the stack, although the owner removed it on 2026-11-05 (D22). The app and CSP are right; the line needs the owner's correction.
7. **Staging restore drill and real-device screen-reader passes** are open (section 7). Owner: Prince Boateng.
