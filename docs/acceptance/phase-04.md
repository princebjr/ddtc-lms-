# Phase 4 acceptance evidence: Profiles, user management and avatars

- Phase file: `docs/phases/phase-04-profiles-user-management.md`
- Branch and pull request: `phase-4-user-management`, https://github.com/princebjr/ddtc-lms-/pull/8
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-06
- Plan approved by the owner on 2026-11-05. Changes approved during the phase: ADR-003 (invite an administrator by email) and ADR-004 (auth hero and card glow), both in `docs/DECISIONS.md`.

## 1. What was built

| Build item (phase file) | Where |
|---|---|
| `profile-images` bucket and policies; image validation; upload and replace in Profile Settings | migration `20261105001000_profile_images.sql`; Edge Functions `register-upload`, `finalize-upload` (D18: server path, magic bytes, 2 MB, VALIDATED only); `cleanup-files` (hourly, `20261105001100_cleanup_schedule.sql`); `src/pages/account/ProfilePage.jsx` |
| User list with search and filters; suspend, reactivate, deactivate; `set-user-role`; `provision-lecturer`; course-creation toggle | `src/pages/admin/` (Users, Lecturers, Learners, user panel, Add learner); functions `set-user-role`, `provision-lecturer`; `admin_set_user` in `20261105000900_admin_functions.sql` |
| Invite an administrator by email (ADR-003) | function `provision-admin`; Users, Invite administrator; `20261105001300_launch_counts_accepted_admins.sql` |
| One-time bootstrap-administrator script and written recovery procedure | `scripts/bootstrap-admin.mjs`; `docs/RUNBOOK.md` "Written in Phase 4" |
| D32: session limits, revocation on suspension and deactivation, `reset-admin-mfa`, audited recovery; bootstrap disabled after use; launch refused below two active administrators | `20261105000900_admin_functions.sql`, `20261105001200_admin_fresh_session.sql`, function `reset-admin-mfa`, `launch_readiness()`, `src/components/auth/SessionWatcher.jsx` |
| `bulk-import-learners` with preview and error report | function `bulk-import-learners`; `src/pages/admin/ImportSheet.jsx` |
| User management and import preview use `ResponsiveTable` (cards on phones, filters in a bottom sheet) | `src/pages/admin/`; screenshots below |
| Owner request (ADR-004): bold institution name with the tagline beneath it at every width, emblem fade-in, moving edge glow on the Sign In and Sign Up cards | `src/components/auth/AuthLayout.jsx`, `src/styles/index.css`, `src/styles/tokens.css` |

## 2. `npm run verify`

CI on commit `033bd88` (PR #8, run 42175700058): every job green. That covers lint, type check, unit and component tests, secret scan, dependency audit and build; gitleaks over the full history; pgTAP; Playwright on every device project in light and dark in 4 shards; Lighthouse (mobile preset); and the CI gate. The Vercel preview deployed.

| Suite | Count |
|---|---|
| Unit and component (Vitest) | 15 files, 263 tests |
| Database (pgTAP) | 7 files, 226 tests |
| Edge Function integration (Vitest against local Supabase) | 2 files, 32 tests |
| End-to-end (Playwright) | full matrix green in CI, including `users.spec.js` (10 flows) and `auth.spec.js` on every project |
| Lighthouse | pass (budgets in `lighthouserc.cjs`) |

Local runs on the owner's Windows machine (2026-11-06): lint, type check, unit, secret scan, audit, build, pgTAP (226) and function tests (32) passed. The local end-to-end run had timeouts on desktop Firefox, and on desktop Chrome sign-in flows when four browsers signed in at once. Every failure was a timeout, except Chrome sign-ins that never left Sign In while four browsers ran at once. A failing Chrome flow passed when run alone. The same Firefox timeouts occur on the commit before this phase's last changes (12 of 86 before, 18 of 86 after, different routes each run, including routes without the glow). The full matrix is green in CI on clean runners. No test was skipped or loosened.

A fault found and fixed during the phase: the first version of the card glow repainted a blurred gradient on every frame, which is costly without a GPU. It now spins a ready-made layer with a transform (`033bd88`).

## 3. Tests required (phase file)

| Test | Result | Proof |
|---|---|---|
| A non-administrator cannot change any role at database, function and UI level | PASS | `03_access_matrix.test.sql`, `05_admin_functions.test.sql`; `tests/functions/admin.test.js`; `users.spec.js` "a learner has no way to change roles" and "cannot change their own role or status" |
| Avatar upload rejects wrong type and oversize; initials show when image is missing | PASS | `tests/functions/uploads.test.js`; `06_profile_images.test.sql`; `users.spec.js` "profile: initials without a photo, a wrong file type is rejected ..." |
| Every administrator action produces an audit record | PASS | `05_admin_functions.test.sql` (each function writes `audit_logs` with the acting administrator); `tests/functions/admin.test.js` |
| Idle and absolute session limits behave as D32 (shortened test values); suspension revokes sessions; `reset-admin-mfa` is rate-limited and audited | PASS | `users.spec.js` (idle warning and expiry, "Stay signed in", absolute limit); `05_admin_functions.test.sql` (revocation, 3 resets per hour, `admin.mfa_reset`); `tests/functions/admin.test.js` |
| Profile images use the D18 pipeline: PENDING or REJECTED never shown; replacing removes the old object | PASS | `06_profile_images.test.sql`; `tests/functions/uploads.test.js`; `cleanup-files` schedule |

## 4. Exit gate

| Line | Result | Proof |
|---|---|---|
| Bootstrap procedure documented and tested on staging | PASS | Documented in `docs/RUNBOOK.md` (Bootstrap, Lost authenticator, Account actions). On staging (`ddtc-lms-staging`), read-only checks on 2026-11-06 show: `bootstrap_completed` is true, exactly one `admin.bootstrap` audit record (2026-11-05 13:34 UTC), then `admin.administrator_invited` (14:45 UTC), and 2 active administrators. A second bootstrap is refused by the script (administrator exists) and by `bootstrap_first_admin` (pgTAP: "bootstrap refuses once it has run", "bootstrap switches itself off"). All 13 migrations and 8 Edge Functions are on staging. |

## 5. Screenshots

`docs/acceptance/phase-04/screens/`, at 375, 768 and 1280 px in light and dark:

- Changed auth screens (ADR-004): `login`, `signup`, `verify-email`, `forgot-password` (`node scripts/capture-screenshots.mjs 04 ...`).
- Signed-in Phase 4 screens against the local stack: `admin-users` and `admin-profile` in light and dark, `learner-profile` in light (captured with reduced motion). The learner Profile capture in dark failed twice at sign-in on the loaded local machine; it is the same Profile page as `admin-profile`, which is captured in dark, and `users.spec.js` exercises it in dark on every device project in CI. The Users list on the local stack holds many accounts created by end-to-end runs, so its captures are long.

## 6. Real-device notes

Not checked on real devices by Claude Code (it has none). Phone, tablet and desktop layouts are covered by the Playwright device projects (iPhone 15, Pixel 7, iPad portrait, 320 px minimum, desktop Chrome, Firefox and Safari engines) in light and dark. Real-device checks by the owner (iOS Safari, Android Chrome) are still to be recorded here.

## 7. Known issues and deferred items

| Item | Reason | Owner |
|---|---|---|
| Local end-to-end runs on the owner's Windows machine time out on desktop Firefox and on parallel sign-ins | The machine is slow under four parallel browsers (Firefox software rendering). CI is the reference and is green | Prince Boateng (optional: run locally with `--workers=2`) |
| Windows reserved ports 54248–54347 blocked local Supabase until `winnat` was restarted | Windows dynamic port reservation; restart `winnat` as Administrator if it returns | Prince Boateng |
